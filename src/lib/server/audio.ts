export type PCMData = ArrayBuffer;
export type WavData = ArrayBuffer;

/**
 * Generate a WAV file from raw 16-bit PCM data.
 */
export function createWavFile(
	pcmData: ArrayBuffer,
	sampleRate: number,
	channels: number
): ArrayBuffer {
	const pcmLength = pcmData.byteLength;
	const wavLength = 44 + pcmLength; // WAV header (44 bytes) + PCM data

	const bytesPerSample = 2;
	const buffer = new ArrayBuffer(wavLength);
	const view = new DataView(buffer);

	// WAV Header
	// RIFF chunk descriptor
	writeString(view, 0, 'RIFF'); // ChunkID
	view.setUint32(4, wavLength - 8, true); // ChunkSize (little-endian)
	writeString(view, 8, 'WAVE'); // Format

	// fmt sub-chunk
	writeString(view, 12, 'fmt '); // Subchunk1ID
	view.setUint32(16, 16, true); // Subchunk1Size (PCM)
	view.setUint16(20, 1, true); // AudioFormat (PCM)
	view.setUint16(22, channels, true); // NumChannels
	view.setUint32(24, sampleRate, true); // SampleRate
	view.setUint32(28, sampleRate * channels * bytesPerSample, true); // ByteRate
	view.setUint16(32, channels * bytesPerSample, true); // BlockAlign
	view.setUint16(34, bytesPerSample * 8, true); // BitsPerSample

	// data sub-chunk
	writeString(view, 36, 'data'); // Subchunk2ID
	view.setUint32(40, pcmLength, true); // Subchunk2Size

	// Copy PCM data
	const wavView = new Uint8Array(buffer);
	const pcmView = new Uint8Array(pcmData);
	wavView.set(pcmView, 44);

	return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
	for (let i = 0; i < string.length; i++) {
		view.setUint8(offset + i, string.charCodeAt(i));
	}
}

export function fillGaps(
	segments: {
		pcmData: PCMData;
		positionMs: number;
		durationMs: number;
	}[],
	bytesPerSecond: number
): PCMData[] {
	// Fill gaps with zeros.
	// Dupes a little work but idc.
	return segments.reduce<ArrayBuffer[]>((acc, cur, i) => {
		if (i > 0) {
			const prev = segments[i - 1];
			const gapMs = cur.positionMs - (prev.positionMs + prev.durationMs);
			// why does this happen? Or is it just 0?
			if (gapMs > 0) {
				const byteLength = Math.floor(bytesPerSecond * (gapMs / 1000));
				const empty = new ArrayBuffer(byteLength);
				acc.push(empty);
			}
			acc.push(cur.pcmData);
			return acc;
		} else {
			return [cur.pcmData];
		}
	}, []);
}
