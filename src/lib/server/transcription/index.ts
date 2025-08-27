/* eslint-disable @typescript-eslint/no-explicit-any */
export type { TranscriptionService } from './TranscriptionService.js';
export { createTranscriptionService } from './TranscriptionService.js';
export { WhisperService } from './WhisperService.js';
export { MockTsService } from './MockTsService.js';
export { STREAMING_CONFIG } from '../streaming/config.js';

export interface WhisperSegment {
	text: string;
	start?: number;
	end?: number;
	confidence?: number;
	[key: string]: any;
}

export interface WhisperTranscript {
	segments: WhisperSegment[];
	text: string;
	[key: string]: any;
}
