// Centralized audio configuration
export const AUDIO_CONFIG = {
	sampleRate: 16000,
	channels: 1, // Has to be 1 for /static/audio-processor.js
	bufferSeconds: 5,
	dropSeconds: 2, // Drop audio segments shorter than this.
	bitsPerSample: 16,

	// Derived values for convenience
	get bufferSampleCount() {
		return Math.floor(this.bufferSeconds * this.sampleRate);
	},

	get bytesPerSample() {
		return Math.floor(this.bitsPerSample / 8);
	},

	get bytesPerSecond() {
		return this.sampleRate * this.channels * this.bytesPerSample;
	}
} as const;

export type AudioConfig = typeof AUDIO_CONFIG;
