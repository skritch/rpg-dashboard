import type { WhisperTranscript } from '.';
import { WhisperService, type WhisperConfig } from './WhisperService.js';
import { MockTsService, type MockConfig } from './MockTsService.js';

// TranscriptService interface
export interface TranscriptionService {
	transcribe(audioBuffer: ArrayBuffer, mimeType: string): Promise<WhisperTranscript>;
	isAvailable(): Promise<boolean>;
}

type TranscriptionConfig =
	| ({ transcriptionService: 'whisper' } & WhisperConfig)
	| ({ transcriptionService: 'mock' } & MockConfig);

// Factory function
export function createTranscriptionService(settings: TranscriptionConfig): TranscriptionService {
	if (settings.transcriptionService === 'whisper') {
		return new WhisperService(settings);
	} else if (settings.transcriptionService === 'mock') {
		return new MockTsService(settings);
	} else {
		throw Error('Unrecognized transcription service');
	}
}
