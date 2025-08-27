import type { TranscriptionService } from './TranscriptionService.js';
import type { WhisperTranscript } from '.';
import { getTimestamp, isValidUrl } from '$lib/shared/utils.js';

export type WhisperConfig = {
	whisperApiUrl: string;
	apiKey?: string;
	model?: string;
	language?: string;
	temperature?: number;
};

const defaultConfig: WhisperConfig = {
	whisperApiUrl: 'http://localhost:8000',
	language: 'en',
	temperature: 0.0
};

export class WhisperService implements TranscriptionService {
	private config: WhisperConfig;

	constructor(config: Partial<WhisperConfig> = {}) {
		this.config = {
			...defaultConfig,
			...config
		};

		// Validate baseUrl if provided
		if (this.config.whisperApiUrl && !isValidUrl(this.config.whisperApiUrl)) {
			throw new Error(`Invalid baseUrl provided: "${this.config.whisperApiUrl}".`);
		}
	}

	async transcribe(audioBuffer: ArrayBuffer, mimeType: string): Promise<WhisperTranscript> {
		const apiKey = this.config.apiKey || process.env.WHISPER_API_KEY;
		const baseUrl =
			this.config.whisperApiUrl || process.env.WHISPER_BASE_URL || 'http://localhost:8000';

		// Validate the final baseUrl
		if (!isValidUrl(baseUrl)) {
			throw new Error(`Invalid baseUrl: "${baseUrl}". Must be a valid HTTP or HTTPS URL.`);
		}

		const formData = new FormData();
		formData.append('file', new Blob([audioBuffer], { type: mimeType })); // cut filename?
		formData.append('model', this.config.model || 'Systran/faster-whisper-large-v2');
		formData.append('response_format', 'verbose_json');

		if (this.config.language) {
			formData.append('language', this.config.language);
		}
		if (this.config.temperature !== undefined) {
			formData.append('temperature', this.config.temperature.toString());
		}
		const headers: HeadersInit = {};
		if (apiKey) {
			headers['Authorization'] = `Bearer ${apiKey}`;
		}

		console.log(
			`[${getTimestamp()}] Calling ${baseUrl}/v1/audio/transcriptions with ${mimeType}, ${audioBuffer.byteLength} bytes`
		);

		// Make request to Whisper API (OpenAI or WhisperX compatible)
		const response = await fetch(`${baseUrl}/v1/audio/transcriptions`, {
			method: 'POST',
			headers,
			body: formData
		});

		if (!response.ok) {
			// Try to get error details from response
			let errorDetails = '';
			try {
				const errorText = await response.text();
				errorDetails = ` - ${errorText}`;
			} catch {
				// Ignore if we can't read error body
			}
			throw new Error(
				`[${getTimestamp()}] Whisper API error: ${response.status} ${response.statusText}${errorDetails}`
			);
		}

		const result = (await response.json()) as WhisperTranscript;

		// verbose_json format with segments
		if (result.segments && Array.isArray(result.segments)) {
			return {
				...result,
				segments: result.segments.map((seg) => ({
					...seg,
					text: seg.text || '',
					start: seg.start,
					end: seg.end,
					confidence: seg.confidence
				})),
				text: result.text || result.segments.map((seg) => seg.text || '').join(' ') || ''
			};
		} else if (result.text) {
			return {
				...result,
				segments: [
					{
						text: result.text
					}
				],
				text: result.text || ''
			};
		} else {
			throw new Error(
				`Unexpected response format from Whisper API. Expected 'text' field but got: ${JSON.stringify(result, null, 2)}`
			);
		}
	}

	async isAvailable(): Promise<boolean> {
		const baseUrl =
			this.config.whisperApiUrl || process.env.WHISPER_BASE_URL || 'http://localhost:8000';

		// Validate the final baseUrl
		if (!isValidUrl(baseUrl)) {
			console.warn(`Invalid baseUrl: "${baseUrl}". Whisper service unavailable.`);
			return false;
		}

		try {
			// Try to ping the whisper service
			const response = await fetch(`${baseUrl}/health`, {
				method: 'GET'
			});

			if (response.ok) return true;

			// Fallback: check if we have API key for remote services
			return !!(this.config.apiKey || process.env.WHISPER_API_KEY);
		} catch {
			return false;
		}
	}
}
