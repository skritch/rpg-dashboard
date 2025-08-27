import { AUDIO_CONFIG } from '$lib/shared/AudioConfig';

interface Config {
	sampleRate: number;
	bufferSeconds: number;
	dropSeconds: number;
}

export class AudioCapture {
	private mediaStream: MediaStream | null = null;
	private audioContext: AudioContext | null = null;
	private pcmProcessor: AudioWorkletNode | null = null;
	private source: MediaStreamAudioSourceNode | null = null;

	config: Config = {
		sampleRate: AUDIO_CONFIG.sampleRate,
		bufferSeconds: AUDIO_CONFIG.bufferSeconds,
		dropSeconds: AUDIO_CONFIG.dropSeconds
	};
	onAudioData?: (audioData: ArrayBuffer) => void;
	onError?: (error: string) => void;

	public isRecording = false;
	public hasPermission = false;

	constructor(
		onAudioData: (audioData: ArrayBuffer) => void,
		onError: (error: string) => void,
		config?: Partial<Config>
	) {
		this.onAudioData = onAudioData;
		this.onError = onError;
		this.config = { ...this.config, ...config };
	}

	/**
	 * Check if microphone permission is already granted without requesting it
	 */
	async checkExistingPermission(): Promise<void> {
		try {
			if ('permissions' in navigator) {
				const permission = await navigator.permissions.query({
					name: 'microphone' as PermissionName
				});
				if (permission.state === 'granted') {
					this.hasPermission = true;
				}
			}
		} catch (error) {
			// Permissions API might not be supported, ignore silently
			console.log('Could not check microphone permission:', error);
		}
	}

	async requestPermission(): Promise<void> {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					sampleRate: this.config.sampleRate,
					channelCount: AUDIO_CONFIG.channels,
					echoCancellation: true,
					noiseSuppression: true
				}
			});
			this.mediaStream = stream;
			this.hasPermission = true;
		} catch (error) {
			this.hasPermission = false;
			let errorMessage = 'Unknown error accessing microphone.';

			if (error instanceof DOMException) {
				switch (error.name) {
					case 'NotAllowedError':
						errorMessage =
							'Microphone access denied. Please allow microphone access in your browser settings.';
						break;
					case 'NotFoundError':
						errorMessage = 'No microphone found. Please connect a microphone and try again.';
						break;
					case 'NotSupportedError':
						errorMessage = 'Your browser does not support microphone access.';
						break;
					default:
						errorMessage = `Microphone error: ${error.message}`;
				}
			}

			if (this.onError) {
				this.onError(errorMessage);
			}
			throw new Error(errorMessage);
		}
	}

	async startCapture(): Promise<void> {
		if (!this.hasPermission || !this.mediaStream) {
			await this.requestPermission();
		}

		if (!this.hasPermission || !this.mediaStream) {
			throw new Error('Cannot start microphone capture without permissions.');
		}

		try {
			this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
			await this.audioContext.audioWorklet.addModule('/audio-processor.js');
			this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
			this.pcmProcessor = new AudioWorkletNode(this.audioContext, 'audio-processor', {
				processorOptions: {
					bufferSize: this.config.bufferSeconds * this.config.sampleRate,
					dropSize: this.config.dropSeconds
				}
			});

			this.pcmProcessor.port.onmessage = (event) => {
				if (event.data.type === 'audioData') {
					const float32Data = event.data.data as Float32Array;
					const int16Data = float32ToInt16(float32Data);

					if (this.onAudioData) {
						this.onAudioData(int16Data.buffer as ArrayBuffer);
					}
				}
			};

			this.isRecording = true;
			this.source.connect(this.pcmProcessor);
		} catch (error) {
			console.error('Failed to start Web Audio recording:', error);
			this.isRecording = false;
			const errorMessage = 'Failed to start recording';
			if (this.onError) {
				this.onError(errorMessage);
			}
			throw new Error(errorMessage);
		}
	}

	stopCapture(): void {
		if (this.source) {
			this.source.disconnect();
			this.source = null;
		}

		if (this.pcmProcessor) {
			this.pcmProcessor.port.postMessage({ type: 'stop' });
			this.pcmProcessor.disconnect();
			this.pcmProcessor = null;
		}

		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}

		this.isRecording = false;
	}

	destroy(): void {
		this.stopCapture();

		if (this.mediaStream) {
			this.mediaStream.getTracks().forEach((track) => track.stop());
			this.mediaStream = null;
		}

		this.hasPermission = false;
	}
}
export function float32ToInt16(float32Array: Float32Array): Int16Array {
	const int16Array = new Int16Array(float32Array.length);
	for (let i = 0; i < float32Array.length; i++) {
		// Clamp to [-1, 1] and convert to 16-bit signed integer
		const s = Math.max(-1, Math.min(1, float32Array[i]));
		int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}
	return int16Array;
}
