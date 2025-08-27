import { createWavFile, type WavData, type PCMData } from '$lib/server/audio';
import { AUDIO_CONFIG } from '$lib/shared/AudioConfig';
import { concatArrayBuffers, generateContentHash, suffixWhere } from '$lib/shared/utils';
import { pipe, scan, map, concatMap, type UnaryFunction, Observable, filter } from 'rxjs';
import { type TranscriptionService, type WhisperTranscript } from '../transcription';
import { updateTranscript, type TranscriptDelta } from '$lib/shared/transcripts';
import { offsetSegments, computeDelta } from './delta';
import type {
	KeywordMessage,
	TranscriptDeltaMessage,
	TranscriptionErrorMessage,
	TranscriptionSegment
} from '$lib/shared/messages';
import type { DeltaRow, KeywordRow } from '$lib/shared/files';
import { mapAsyncOrdered, slidingWindow } from './operators';
import type { KeywordSpotter } from '../keywords/KeywordSpotter';
import { kweToMessageEntry } from '../keywords/KeywordDatabase';

// TYPES AND SERIALIZERS

// Public

export interface AudioSegment {
	pcmData: ArrayBuffer;
	positionMs: number; // position in the stream
	durationMs: number;
	id: string;
}

export interface WindowMeta {
	startPositionMs: number;
	endPositionMs: number;
	elapsedMs: number;
	durationMs: number;
	index: number;
	id: string; // the last message in the window.
}

export function errWithWindowToMessage({
	meta,
	error
}: {
	meta: WindowMeta;
	error: unknown;
}): TranscriptionErrorMessage {
	const errMessage = error instanceof Error ? error.message : 'An unknown error occurred';
	return {
		type: 'transcription_error',
		error: errMessage,
		responseToMessageId: meta.id
	};
}

export interface WT {
	meta: WindowMeta;
	t: WhisperTranscript;
}
export interface TD {
	meta: WindowMeta;
	delta: TranscriptDelta;
}
export function tdToMessage(wd: TD): TranscriptDeltaMessage {
	return {
		type: 'transcription',
		responseToMessageId: wd.meta.id,
		delta: wd.delta,
		text: wd.delta.segments.map((seg) => seg.text).join(' ') // Imprecise.
	};
}
export function tdToRow(td: TD): DeltaRow {
	return {
		delta: td.delta,
		meta: { id: td.meta.id, index: td.meta.index }
	};
}

export interface DeltaState {
	state: TranscriptionSegment[];
	out?: TD;
}

export function dsToTranscript(ds: DeltaState) {
	return ds.state.map((seg) => seg.text.trim()).join('\n');
}
export function kwmToRow(kwm: KeywordMessage): KeywordRow {
	return {
		keywords: kwm.keywords.map((kw) => {
			// Strip the `data` field, but add a dataLength which records how long it was.
			// eslint-disable-next-line @typescript-eslint/no-unused-vars
			const { data: _, ...withoutData } = { ...kw, dataLength: JSON.stringify(kw.data).length };
			return withoutData;
		}),
		meta: kwm.meta
	};
}

// Private / non-exported.

type StreamOp<T, U> = UnaryFunction<Observable<T>, Observable<U>>;
interface AudioSegmentsState {
	startTs?: number;
	offsetMs: number;
	out?: Omit<AudioSegment, 'id'>;
}
interface WavWithWindow {
	wav: WavData;
	meta: WindowMeta;
}
type RawTranscriptionResult =
	| { meta: WindowMeta; t: WhisperTranscript; success: true }
	| { meta: WindowMeta; success: false; error: unknown };
interface KeywordCache {
	recentKeywords: string[];
	out?: KeywordMessage;
}

// STREAMING LOGIC

export const wavHeader = Buffer.from(
	createWavFile(new ArrayBuffer(), AUDIO_CONFIG.sampleRate, AUDIO_CONFIG.channels)
);

export const parseLogic: StreamOp<PCMData, AudioSegment> = pipe(
	scan(
		(state: AudioSegmentsState, pcmData: PCMData) => {
			const durationMs = (1000 * pcmData.byteLength) / AUDIO_CONFIG.bytesPerSecond;
			return {
				offsetMs: state.offsetMs + durationMs,
				out: {
					pcmData: pcmData,
					positionMs: state.offsetMs,
					durationMs: durationMs
				}
			};
		},
		{ offsetMs: 0 }
	),
	concatMap(async (state) => {
		const audioSeg = state.out as Omit<AudioSegment, 'id'>;
		return {
			...audioSeg,
			id: await generateContentHash(audioSeg.pcmData)
		};
	})
);

export const windowLogic: StreamOp<AudioSegment, WavWithWindow> = pipe(
	slidingWindow((a) => ({ start: a.positionMs, end: a.positionMs + a.durationMs })),
	map((segments: AudioSegment[], index: number): WavWithWindow => {
		const last = segments[segments.length - 1];
		const merged = concatArrayBuffers(segments.map((seg) => seg.pcmData));
		return {
			wav: createWavFile(merged, AUDIO_CONFIG.sampleRate, AUDIO_CONFIG.channels),
			meta: {
				startPositionMs: segments[0].positionMs,
				endPositionMs: last.positionMs + last.durationMs,
				// elapsed and duration are probably the same
				elapsedMs: last.positionMs + last.durationMs - segments[0].positionMs,
				durationMs: segments.reduce((acc, cur) => acc + cur.durationMs, 0),
				index: index,
				id: last.id
			}
		};
	})
);

// Dynamically looks up the transcriptionService
export function transcriptionLogic(getService: () => TranscriptionService) {
	return mapAsyncOrdered(async (w: WavWithWindow): Promise<RawTranscriptionResult> => {
		try {
			// TODO: consider passing an earlier transcript in the `prompt`.
			const t = await getService().transcribe(w.wav, 'audio/wav');
			return { meta: w.meta, t: t, success: true };
		} catch (error) {
			return { meta: w.meta, success: false, error: error };
		}
	});
}

export const deltaLogic: StreamOp<WT, DeltaState> = pipe(
	scan<WT, DeltaState>(
		(state, wt) => {
			const alignedSegs = offsetSegments(wt.t.segments, wt.meta.startPositionMs, wt.meta.elapsedMs);

			// TBD: When can this be empty?
			if (alignedSegs.length === 0) {
				// Will be filtered out below.
				return { state: state.state };
			}
			// Nothing in `state` which ends before the start of the newSegs will be touched
			const tolMs = 50;
			const stateSuffix = suffixWhere(
				state.state,
				(seg) => seg.endMs >= alignedSegs[0].startMs + tolMs
			);

			// TODO: don't ever crash here.
			// Note: quite brittle, because it depends on audio durations and whisper return timestamps lining up.
			const delta = computeDelta(stateSuffix, alignedSegs);

			if (delta.overwrite > stateSuffix.length) {
				throw new Error(`invalid overwrite: overwite ${delta.overwrite} > ${stateSuffix.length}`);
			}
			const newTranscript = updateTranscript(state.state, delta);

			return {
				state: newTranscript,
				out: {
					meta: wt.meta,
					delta: delta
				}
			};
		},
		{ state: [] }
	),
	filter((ds: DeltaState) => ds.out !== undefined)
);

/**
 * Keyword spotting approach:
 * - [x] do naive KW spotting on raw text
 * - [x] dedupe keywords between subsequent messages
 * - [ ] clean transcripts with LLM and then kw spot again, using same dedupe state.
 *
 * This is already kind of complicated, but will get moreso if we either
 * - do it async with an LLM
 * - or, run a second round post-LLM-cleanup but share a recent state for both.
 */
export function keywordSpottingLogic(
	kwSpotter: KeywordSpotter
): StreamOp<DeltaState & { out: TD }, KeywordMessage> {
	return pipe(
		map((ds) => {
			const text = ds.out.delta.segments.map((seg) => seg.text).join(' ');
			const keywords = kwSpotter.spot(text);
			if (keywords.length === 0) {
				return undefined;
			}
			const kwEntries = keywords.map((kwe) => ({
				...kweToMessageEntry(kwe),
				matchIndex: kwe.index
			}));

			return {
				type: 'keyword_match',
				keywords: kwEntries,
				// TODO probably send in the previous delta
				// Or assign this to a location in the deltas/transcripts in some way,
				// rather than using an index into this string.
				text: text,
				meta: {
					id: ds.out.meta.id,
					index: ds.out.meta.index,
					positionMs: ds.out.meta.startPositionMs
				}
			};
		}),
		filter((kwm) => !(kwm === undefined)),
		map((kwm) => kwm as KeywordMessage)
	);
}

export const keywordDedupeLogic = pipe(
	// Drop keywords we've seen recently
	scan(
		(state: KeywordCache, kwm: KeywordMessage) => {
			const newKeywords: string[] = [];
			const newKeywordEntries: KeywordMessage['keywords'] = [];
			for (const kwe of kwm.keywords) {
				if (state.recentKeywords.indexOf(kwe.keyword) === -1) {
					newKeywords.push(kwe.keyword);
					newKeywordEntries.push(kwe);
				}
			}
			const nToKeep = 20; // move to config if I can be bothered
			return {
				// note we append to head of list
				recentKeywords: [...newKeywords, ...state.recentKeywords].slice(nToKeep),
				out: { ...kwm, keywords: newKeywordEntries }
			};
		},
		{ recentKeywords: [] }
	),
	filter((state: KeywordCache) => state.out !== undefined),
	map((state) => state.out! as KeywordMessage)
);
