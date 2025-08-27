import type { TranscriptDelta } from '$lib/shared/transcripts';
import type { TranscriptionSegment } from '$lib/shared/messages';
import type { WhisperTranscript } from '.';

/**
 * Apply offset and cutoff logic to a raw transcript.
 * - offset because raw transcripts measure time from the start of the audio provided
 *   to the transcription API rather than the start of the stream
 * - cutoff bc raw transcripts can contain timestamps and segments which extend beyond
 *   the end of the audio given, presumably due because they fail to accurately predict
 *   stop tokens. (Possibly would be better to "align transcripts" in separate step.)
 */
export function offsetSegments(
	segments: WhisperTranscript['segments'],
	offsetMs: number,
	cutoffMs: number
): TranscriptionSegment[] {
	const tolMs = 10;
	return segments
		.filter(
			(seg) =>
				// TBD: Can these conditions happen?
				seg.start !== undefined &&
				seg.end !== undefined &&
				// remove segments which start after the end of the audio file
				// these arise from some kind of error in predicting the stop token
				seg.start < (cutoffMs + tolMs) / 1000
		)
		.map((seg) => {
			return {
				text: seg.text,
				confidence: seg.confidence,
				startMs: seg.start! * 1000 + offsetMs,
				// Clamp end time to the end of the audio to avoid confusing bugs
				endMs: Math.min(seg.end!, Math.round(cutoffMs / 1000)) * 1000 + offsetMs
			};
		});
}

function isMonotonic(segs: TranscriptionSegment[]): boolean {
	const tolMs = 200;

	for (let i = 0; i < segs.length; i++) {
		const seg = segs[i];

		// Check that endMs >= startMs
		if (seg.endMs < seg.startMs) {
			return false;
		}

		// startMs and endMs should each be increasing,
		if (i > 0 && seg.startMs < segs[i - 1].startMs) {
			return false;
		}
		if (i > 0 && seg.endMs < segs[i - 1].endMs) {
			return false;
		}
		// one segment's start can overlap the next a little
		if (i > 0 && seg.startMs < segs[i - 1].endMs - tolMs) {
			return false;
		}
	}
	return true;
}

/**
 * Given a new set of transcript segments and full transcript state so far,
 * create a TranscriptDelta representing how many segments to overwrite and keep,
 * to be consumed by the frontend.
 *
 * Note that this expects `stateSuffix` to contain only segments which overlap
 * newSegs, i.e. whose endTime > newSegs[0].startTime.
 *
 *
 *	For example, if our segments look like
 *	state: 0  1  2  3
 *	new:         0' 1' 2'
 *	we might want to end up with
 *			   0  1  2  1' 2'
 */
export function computeDelta(
	stateSuffix: TranscriptionSegment[],
	newSegs: TranscriptionSegment[]
): TranscriptDelta {
	const tolMs = 200;
	// console.log(`State: (${Math.max(stateSegs.length-3, 0)} elements omitted...) \n  ${stateSegs.slice(-3).map((seg) => JSON.stringify({startMs: seg.startMs, endMs: seg.endMs, text: seg.text})).join('\n  ')}`);
	// console.log(`New: \n  ${newSegs.map((seg) => JSON.stringify({startMs: seg.startMs, endMs: seg.endMs, text: seg.text})).join('\n  ')}\n`);

	// If either is empty, just return the new.
	if (stateSuffix.length === 0 || newSegs.length === 0) {
		return { overwrite: 0, segments: newSegs };
	}

	// Check assumptions, no-op if any are violated.
	if (stateSuffix[0].endMs < newSegs[0].startMs) {
		console.warn(
			`State suffix doesn't overlap new segments: ${stateSuffix[0].endMs} < ${newSegs[0].startMs}`
		);
		return { overwrite: 0, segments: [] };
	}
	if (!isMonotonic(stateSuffix)) {
		console.warn(
			`State suffix not monotonic: ${JSON.stringify(stateSuffix.map((seg) => ({ startMs: seg.startMs, endMs: seg.endMs })))}`
		);
		return { overwrite: 0, segments: [] };
	}
	if (!isMonotonic(newSegs)) {
		console.warn(`New segments not monotonic`);
		return { overwrite: 0, segments: [] };
	}
	// We can end at the same time, but we can't end before.
	const endOffsetMs = newSegs[newSegs.length - 1].endMs - stateSuffix[stateSuffix.length - 1].endMs;
	if (endOffsetMs < -tolMs) {
		console.warn(
			`Out of order segments ${stateSuffix[stateSuffix.length - 1].endMs} to ${newSegs[newSegs.length - 1].endMs}`
		);
		return { overwrite: 0, segments: [] };
	}

	// Realistically this case covers the first few seconds of the stream
	if (stateSuffix.length === 1) {
		// If we overlap the suffix entirely, just replace it.
		// State:  |------|
		// New:    |---------|----...
		// Return: |---------|----..., overwrite=1
		if (newSegs[0].startMs < stateSuffix[0].startMs + tolMs) {
			return { overwrite: 1, segments: newSegs };
		}

		// Our first new segment must start during or after state's single one.
		// Drop all new segments which overlap state's single segment and return the rest.
		// State:  |------|
		// New:       |-----|---|--...
		// (or):            |---|--...
		// Return:          |---|--..., overwrite=0
		return {
			overwrite: 0,
			segments: newSegs.filter((seg) => seg.startMs > stateSuffix[0].endMs - tolMs)
		};
	}

	// If we got here, then state has at least two segments.
	//
	// First try this: step backwards through both state and new until we find
	// two segments that line up pretty well. Chop off the end of state from that
	// point on.
	// TBD:  limit how far back this can go. Maybe half the window length.
	// TBD:  this method requires a high tolerance to avoid going crazy,
	//       but the others like a lower tol. Maybe use two separate params.
	// TBD:  this might handle the other cases well enough.
	//
	// State:  |----|--|---|----|------|
	// New:         |---|--|-----|----|--|-----|
	// Return:             |-----|----|--|-----| , overwrite=2

	let i = stateSuffix.length - 1;
	let j = newSegs.length - 1;
	while (true) {
		if (Math.abs(newSegs[j].startMs - stateSuffix[i].startMs) < tolMs) {
			return {
				overwrite: stateSuffix.length - i,
				segments: newSegs.slice(j)
			};
		} else if (i == 0 || j == 0) {
			break;
		} else if (newSegs[j].startMs > stateSuffix[i].startMs) {
			j--;
		} else {
			i--;
		}
	}

	// Fallback to something simple: drop the last seg of the state.
	// Return all new segs which start > that.
	const segsToInsert = newSegs.filter(
		(seg) => seg.startMs + tolMs > stateSuffix[stateSuffix.length - 1].startMs
	);

	// If there are none, newSegs must end in one long segment which
	// overlaps more than one of state. There's no easy way to break
	// it in two, so just drop it.
	//
	// State:  |---|----|------|
	// New:        ...|-------------|
	// Return:          |------| , overwrite=0
	if (segsToInsert.length == 0) {
		return { overwrite: 0, segments: [] };
	}

	// State:  |---|----|------|
	// New:         |----|---|-----|...
	// Return:           |---|-----|..., overwrite=1
	return {
		overwrite: 1,
		segments: segsToInsert
	};
}
