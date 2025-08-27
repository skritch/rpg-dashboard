// AudioWorklet processor for capturing raw PCM samples

// Default audio config constants (matches src/lib/audio/config.ts)
const DEFAULT_SAMPLE_RATE = 16000;

class AudioProcessor extends AudioWorkletProcessor {
	constructor(options) {
		super();
		this.bufferSize = options.processorOptions.bufferSize || DEFAULT_SAMPLE_RATE;  // 1s at 16kHz
		this.dropSize = options.processorOptions.dropSize || DEFAULT_SAMPLE_RATE;
		this.buffer = new Float32Array(this.bufferSize);
		this.bufferIndex = 0;
		this.shouldStop = false;
		
		// Handle stop messages from main thread
		this.port.onmessage = (event) => {
			if (event.data.type === 'stop') {
				console.log('AudioProcessor: received stop signal');
				this.shouldStop = true;
				// Flush any remaining buffer immediately? Eh. Just drop it.
				// Note: Race condition possible - may drop some audio after mic off, 
				// or flush while process() is writing. This is acceptable.
				if (this.bufferIndex > this.dropSize) {
					this.flushBuffer();
				}
			}
		};
	}

	flushBuffer() {
		if (this.bufferIndex > 0) {
			this.port.postMessage({
				type: 'audioData',
				data: this.buffer.slice(0, this.bufferIndex)
			});
			// Zero out the used portion for cleanliness
			this.buffer.fill(0, 0, this.bufferIndex);
			this.bufferIndex = 0;
		}
	}

	process(inputs) {
		const input = inputs[0];
		
		if (input.length > 0) {
			const inputChannel = input[0]; // Use first channel (mono)
			
			for (let i = 0; i < inputChannel.length; i++) {
				this.buffer[this.bufferIndex] = inputChannel[i];
				this.bufferIndex++;
				
				// When buffer is full, send it to main thread
				if (this.bufferIndex >= this.bufferSize) {
					this.flushBuffer();
				}
			}
		}
		
		// Check stop flag at end to allow current processing to complete
		if (this.shouldStop) {
			return false;
		}
		
		return true; // Keep processor alive
	}
}

registerProcessor('audio-processor', AudioProcessor);