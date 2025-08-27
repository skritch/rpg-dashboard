import type { DeltaRow, KeywordRow } from '$lib/shared/files';
import type {
	TranscriptionErrorMessage,
	TranscriptDeltaMessage,
	TranscriptionSegment,
	KeywordMessage
} from '$lib/shared/messages';
import type { TranscriptDelta } from '$lib/shared/transcripts';
import type { WhisperTranscript } from '../transcription';

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
