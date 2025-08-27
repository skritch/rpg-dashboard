import { describe, expect, it } from 'vitest';
import { createWavFile } from '$lib/server/audio';
import { AUDIO_CONFIG } from '$lib/shared/AudioConfig';

describe('audioUtils', () => {
	describe('createWavFile', () => {
		it('creates parseable WAV file with correct structure', () => {
			// Create test PCM data - 3.2 seconds at 16kHz (> 2 second drop threshold)
			const sampleCount = Math.floor(3.2 * AUDIO_CONFIG.sampleRate);
			const pcmData = new ArrayBuffer(sampleCount * 2); // 16-bit samples
			const view = new Int16Array(pcmData);

			// Fill with a simple sine wave pattern
			for (let i = 0; i < sampleCount; i++) {
				view[i] = Math.sin(i * 0.1) * 16000;
			}

			const wavFile = createWavFile(pcmData, AUDIO_CONFIG.sampleRate, AUDIO_CONFIG.channels);
			const wavView = new DataView(wavFile);

			// Test that it's a valid WAV file structure
			expect(readString(wavView, 0, 4)).toBe('RIFF');
			expect(readString(wavView, 8, 4)).toBe('WAVE');
			expect(readString(wavView, 12, 4)).toBe('fmt ');
			expect(readString(wavView, 36, 4)).toBe('data');

			// Test that it preserves the input data size
			expect(wavFile.byteLength).toBe(44 + pcmData.byteLength); // 44-byte header + PCM data
		});

		it('creates WAV file above drop threshold for transcription', () => {
			// Create audio longer than AUDIO_CONFIG.dropSeconds (2 seconds)
			const durationSeconds = 2.5;
			const sampleCount = Math.floor(durationSeconds * AUDIO_CONFIG.sampleRate);
			const pcmData = new ArrayBuffer(sampleCount * AUDIO_CONFIG.bytesPerSample);

			const wavFile = createWavFile(pcmData, AUDIO_CONFIG.sampleRate, AUDIO_CONFIG.channels);

			// Calculate duration from WAV file data section
			const wavView = new DataView(wavFile);
			const dataSizeBytes = wavView.getUint32(40, true);
			const durationFromWav =
				dataSizeBytes /
				(AUDIO_CONFIG.sampleRate * AUDIO_CONFIG.channels * AUDIO_CONFIG.bytesPerSample);

			expect(durationFromWav).toBeGreaterThan(AUDIO_CONFIG.dropSeconds);
			expect(durationFromWav).toBeCloseTo(durationSeconds, 1);
		});
	});
});

// Helper function to read strings from DataView
function readString(view: DataView, offset: number, length: number): string {
	let result = '';
	for (let i = 0; i < length; i++) {
		result += String.fromCharCode(view.getUint8(offset + i));
	}
	return result;
}
