import { createWavFile, type WavData, type PCMData } from '$lib/server/audio';
import { AUDIO_CONFIG } from '$lib/shared/AudioConfig';
import { concatArrayBuffers, generateContentHash, suffixWhere } from '$lib/shared/utils';
import { pipe, scan, map, concatMap, type UnaryFunction, Observable, filter } from 'rxjs';
import { type TranscriptionService, type WhisperTranscript } from '../transcription';
import { updateTranscript } from '$lib/shared/transcripts';
import { offsetSegments, computeDelta } from '../transcription/delta';
import type { KeywordMessage } from '$lib/shared/messages';
import { mapAsyncOrdered, slidingWindow } from './operators';
import type { KeywordSpotter } from '../keywords/KeywordSpotter';
import { kweToMessageEntry } from '../keywords/KeywordDatabase';
import type { AudioSegment, WindowMeta, WT, DeltaState, TD } from './types';

// Type aliases to simplify streaming logic

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
			// TBD: pass an earlier transcript, or some useful spelling hints, in the `prompt`.
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
				// TBD probably send in the previous delta
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
