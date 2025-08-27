import { describe, expect, it, beforeEach } from 'vitest';
import { AudioPipeline } from './AudioPipeline';
import { outputPathsFromEnv } from './paths';
import { AUDIO_CONFIG } from '$lib/shared/AudioConfig';
import { MockTsService } from './transcription/MockTsService';
import type { TranscriptDeltaMessage, TranscriptionErrorMessage } from '$lib/shared/messages';
import { KeywordSpotter } from './keywords/KeywordSpotter';
import { getKeywordDatabase } from './keywords';
import type { WT } from './streaming/types';

function createTestAudioSegments(count: number): ArrayBuffer[] {
	const segments: ArrayBuffer[] = [];

	for (let i = 0; i < count; i++) {
		// Create 1 second of audio data
		const sampleCount = AUDIO_CONFIG.bufferSampleCount;
		const buffer = new ArrayBuffer(sampleCount * AUDIO_CONFIG.bytesPerSample);
		const view = new Int16Array(buffer);

		// Fill with a simple pattern to make each segment different
		for (let j = 0; j < sampleCount; j++) {
			view[j] = Math.sin(j * 0.1 + i) * 16000;
		}

		segments.push(buffer);
	}

	return segments;
}

describe('AudioPipeline', () => {
	let pipeline: AudioPipeline;
	let mockService: MockTsService;

	beforeEach(() => {
		mockService = new MockTsService({ simulateDelay: true, delayMs: 0 });
		pipeline = new AudioPipeline(
			mockService,
			new KeywordSpotter(getKeywordDatabase()),
			outputPathsFromEnv('test')
		);
	});

	it('should transcribe all audio segments in sequence', async () => {
		const segmentCount = 5;

		const transcriptions: WT[] = [];
		const promise = pipeline.transcriptionSuccesses$.forEach((t) => transcriptions.push(t));
		const audioSegments = createTestAudioSegments(segmentCount);

		audioSegments.forEach((segment) => {
			pipeline.input$.next(segment);
		});

		// Complete input to signal no more data
		pipeline.input$.complete();
		await promise;

		// We should receive transcriptions for all segments
		expect(transcriptions.length).toBe(segmentCount);

		// Verify they are in the correct order
		for (let i = 0; i < transcriptions.length; i++) {
			expect(transcriptions[i].meta.index).toBe(i);
		}

		// Verify the mock service is returning the expected responses
		// For 5 calls, we should get the first 5 mock responses (with [callN] markers)
		const expectedTexts = [
			"Welcome to today's [call0]", // call0 - partial segment 1
			"Welcome to today's meeting [call1] let's discuss the quarterly [call1]", // call1 - segments 1-2
			"Welcome to today's meeting [call2] let's discuss the quarterly results [call2] our revenue has increased [call2]", // call2 - segments 1-3 partial
			"Welcome to today's meeting [call3] let's discuss the quarterly results [call3] our revenue has increased by fifteen percent [call3] which is above our [call3]", // call3 - segments 1-4 partial
			"Welcome to today's meeting [call4] let's discuss the quarterly results [call4] our revenue has increased by fifteen percent [call4] which is above our initial projections [call4] we should celebrate [call4]" // call4 - segments 1-5 partial
		];

		for (let i = 0; i < transcriptions.length; i++) {
			expect(transcriptions[i].t.text).toBe(expectedTexts[i]);
			expect(transcriptions[i].t.segments.length).toBeGreaterThan(0);
		}
	});

	it('should emit all transcripts in order without duplicating calls', async () => {
		const segmentCount = 3;
		const deltas: TranscriptDeltaMessage[] = [];
		const errorMessages: TranscriptionErrorMessage[] = [];

		// Subscribing to both transcripts$ and errorMessage$ should not cause double execution
		const promise1 = pipeline.deltaMessage$.forEach((t) => deltas.push(t));
		const promise2 = pipeline.transcriptionErrorMessages.forEach((msg) => errorMessages.push(msg));

		const audioSegments = createTestAudioSegments(segmentCount);
		audioSegments.forEach((segment) => {
			pipeline.input$.next(segment);
		});

		pipeline.input$.complete();
		await Promise.all([promise1, promise2]);

		console.log(`Received ${deltas.length} transcription results`);

		expect(deltas.length).toBe(segmentCount);
		const actualTexts = deltas.map((d) => d.text);
		const expectedTexts = [
			"Welcome to today's [call0]", // call0 - partial segment 1
			"Welcome to today's meeting [call1] let's discuss the quarterly [call1]", // call1 - segments 1-2
			"let's discuss the quarterly results [call2] our revenue has increased [call2]" // call2 - segments 1-3 partial
		];

		expect(actualTexts).toEqual(expectedTexts);

		const actualOverwrites = deltas.map((d) => d.delta.overwrite);
		expect(actualOverwrites).toEqual([0, 1, 1]);
	});

	// TODO: test concurrency by equipping MockTSService to return out of order.
});
