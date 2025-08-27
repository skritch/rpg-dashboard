import type { WT } from '$lib/server/streaming/logic';
import type { KeywordMessage } from './messages';
import type { TranscriptDelta } from './transcripts';

// These are the types of rows in the .json1 files we write in the audio pipeline.

export type TranscriptionResultRow = WT;

export interface DeltaRow {
	delta: TranscriptDelta;
	meta: {
		id: string;
		index: number;
	};
}

export interface KeywordRow {
	keywords: Omit<KeywordMessage['keywords'][number], 'data'>[];
	meta: {
		id: string;
		index: number;
		positionMs: number;
	};
}
