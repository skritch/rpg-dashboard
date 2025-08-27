/* eslint-disable @typescript-eslint/no-explicit-any */
import { page, userEvent } from '@vitest/browser/context';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';
import { AUDIO_CONFIG } from '$lib/shared/AudioConfig';

// Mock the reconnecting-websocket module at the import level
vi.mock('reconnecting-websocket', () => {
	return {
		default: class MockReconnectingWebSocket extends EventTarget {
			readyState = WebSocket.OPEN;
			binaryType: BinaryType = 'arraybuffer';
			private mockWSMessages: unknown[];

			constructor(url: string | URL) {
				super();
				console.log('MockReconnectingWebSocket: constructor called with URL:', url);

				// Get the mockWSMessages from window
				this.mockWSMessages = (window as any).mockWSMessages || [];

				// Simulate connection after short delay
				setTimeout(() => {
					console.log('MockReconnectingWebSocket: firing open event');
					this.dispatchEvent(new Event('open'));
				}, 10);
			}

			send(data: string | ArrayBuffer | Blob) {
				this.mockWSMessages.push(data);
				console.log(
					'MockReconnectingWebSocket: intercepted send',
					data instanceof ArrayBuffer
						? `ArrayBuffer(${data.byteLength} bytes)`
						: typeof data === 'string'
							? `String: ${data.substring(0, 100)}...`
							: 'Blob'
				);
			}

			close() {
				console.log('MockReconnectingWebSocket: close() called');
				this.dispatchEvent(new Event('close'));
			}
		}
	};
});

// Mock AudioCapture class to use very small batchSize/dropSize for quick testing
vi.doMock('$lib/client/AudioCapture', async () => {
	const originalAudioCapture = (await import('$lib/client/AudioCapture')).AudioCapture;
	return {
		AudioCapture: class extends originalAudioCapture {
			constructor(
				onAudioData: (audioData: ArrayBuffer) => void,
				onError: (error: string) => void,
				config?: Partial<{ sampleRate: number; bufferSeconds: number; dropSeconds: number }>
			) {
				// Override with tiny dropSize so we get audio quickly
				super(onAudioData, onError, {
					...config,
					bufferSeconds: 0.2,
					dropSeconds: 0.05 // 50ms = 800 samples at 16kHz - very small threshold
				});
				console.log('MockedAudioCapture: using dropSeconds=0.05 (800 samples)');
			}
		}
	};
});

describe('Audio Frontend Integration', () => {
	beforeEach(async () => {
		// Mock permissions API to grant microphone access
		Object.defineProperty(navigator, 'permissions', {
			value: {
				query: async ({ name }: { name: string }) => {
					if (name === 'microphone') {
						return { state: 'granted' };
					}
					return { state: 'denied' };
				}
			},
			writable: true
		});

		// Mock getUserMedia to return a MediaStream with minimal audio data
		// Might be able to get away with an empty stream. Not sure.
		Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
			value: async () => {
				// Create AudioContext with a simple oscillator for audio data
				const audioContext = new AudioContext({ sampleRate: AUDIO_CONFIG.sampleRate });
				const oscillator = audioContext.createOscillator();
				const gainNode = audioContext.createGain();
				const destination = audioContext.createMediaStreamDestination();

				// Configure a simple tone at low volume
				oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
				gainNode.gain.setValueAtTime(0.01, audioContext.currentTime); // Very low volume

				// Connect: oscillator -> gain -> destination
				oscillator.connect(gainNode);
				gainNode.connect(destination);

				// Start the oscillator - it will run until we stop recording
				oscillator.start(audioContext.currentTime);

				console.log('MockGetUserMedia: returning MediaStream with continuous 440Hz audio');

				return destination.stream;
			},
			writable: true
		});

		// Setup mockWSMessages array for WebSocket interception
		const mockWSMessages: unknown[] = [];
		(window as any).mockWSMessages = mockWSMessages;
	});

	it('processes real audio through worklet and sends via WebSocket', async () => {
		// Mock the API endpoints
		window.fetch = vi.fn().mockImplementation((url) => {
			if (url === '/api/service-check') {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ status: 'available', isAvailable: true })
				});
			}
			if (url === '/api/settings') {
				return Promise.resolve({
					ok: true,
					json: () => Promise.resolve({ success: true })
				});
			}
			return Promise.reject(new Error(`Unexpected fetch to: ${url}`));
		});

		render(Page);

		// Wait for component to mount and check permissions
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Connect to WebSocket by clicking the connect button
		await userEvent.click(page.getByRole('button', { name: 'Connect to Server' }));

		// Wait for connection to establish and service check
		await new Promise((resolve) => setTimeout(resolve, 100));
		await expect.element(page.getByText('Connected', { exact: true }).first()).toBeInTheDocument();

		// Clear any existing messages
		const mockWSMessages = (window as any).mockWSMessages;
		mockWSMessages.length = 0;

		// Start recording - this should trigger the full audio pipeline:
		// Synthetic MediaStream → AudioWorkletNode (real processing) → float32ToInt16 → WebSocket
		await userEvent.click(page.getByRole('button', { name: 'Start Recording' }));

		// Should show recording state
		await expect.element(page.getByText('Recording...')).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Start Recording' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Stop Recording' })).toBeEnabled();

		// One full batch, the second one should e dropped.
		await new Promise((resolve) => setTimeout(resolve, 120));

		// Stop recording
		await userEvent.click(page.getByRole('button', { name: 'Stop Recording' }));

		// Should return to non-recording state
		await expect.element(page.getByText('Recording...')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: 'Start Recording' })).toBeEnabled();
		await expect.element(page.getByRole('button', { name: 'Stop Recording' })).toBeDisabled();
		// expect(mockWSMessages.length).toEqual(3);

		// First message should be mic start command
		const startMessage = mockWSMessages[0];
		expect(typeof startMessage).toBe('string');
		const startData = JSON.parse(startMessage as string);
		expect(startData.type).toBe('microphone');
		expect(startData.action).toBe('start');

		// Second message should be mic stop command
		const stopMessage = mockWSMessages[1];
		expect(typeof stopMessage).toBe('string');
		const stopData = JSON.parse(stopMessage as string);
		expect(stopData.type).toBe('microphone');
		expect(stopData.action).toBe('stop');

		// Third message should be binary audio data
		const audioMessage = mockWSMessages[2];
		expect(audioMessage).toBeInstanceOf(ArrayBuffer);

		// Verify audio data is larger than dropSize threshold (0.05s = 800 samples = 1600 bytes)
		const minExpectedBytes = 0.05 * AUDIO_CONFIG.sampleRate * AUDIO_CONFIG.bytesPerSample; // 800 samples * 2 bytes = 1600 bytes
		expect((audioMessage as ArrayBuffer).byteLength).toBeGreaterThan(minExpectedBytes);
	});
});
