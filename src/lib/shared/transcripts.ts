import type { TranscriptionSegment } from '$lib/shared/messages';

export interface TranscriptDelta {
	overwrite: number;
	segments: TranscriptionSegment[];
}

/**
 * Shared frontend/backend logic for merging new segments into an existing transcript
 */
export function updateTranscript(
	transcriptState: TranscriptionSegment[],
	delta: TranscriptDelta
): TranscriptionSegment[] {
	let prevSegs: TranscriptionSegment[];
	if (delta.overwrite !== 0) {
		prevSegs = transcriptState.slice(0, transcriptState.length - delta.overwrite);
	} else {
		prevSegs = transcriptState;
	}
	return [...prevSegs, ...delta.segments];
}
