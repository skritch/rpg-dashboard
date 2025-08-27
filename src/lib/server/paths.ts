import path from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

// .gitignore'd location of files such as transcripts
export const DATA_DIR = process.env.DATA_DIR || '.data';

// Location of checked-in files
export const PUBLIC_DATA_DIR = 'data';

// Write to a temp directory when running tests
export function getDataDir() {
	if (process.env.VITEST) {
		const tmpDir = path.join(tmpdir(), randomUUID());
		console.log(`in test environment, writing to ${tmpDir}`);
		return tmpDir;
	} else {
		return DATA_DIR;
	}
}

export interface TranscriptOutputPaths {
	baseDir: string;
	input: string;
	transcriptionResults: string;
	deltas: string;
	transcript: string;
	keywords: string;
}
export function outputPathsFromEnv(name: string): TranscriptOutputPaths {
	const dataDir = path.join(getDataDir(), 'transcripts', name);
	return {
		baseDir: dataDir,
		input: path.join(dataDir, 'input.wav'),
		transcriptionResults: path.join(dataDir, 'transcription_results.json1'),
		deltas: path.join(dataDir, 'deltas.json1'),
		transcript: path.join(dataDir, 'transcript.txt'),
		keywords: path.join(dataDir, 'keywords.json1')
	};
}
