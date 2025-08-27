#!/usr/bin/env tsx

import { spawn } from 'child_process';
import { basename, extname } from 'path';
import { AudioPipeline } from '../src/lib/server/streaming/AudioPipeline.js';
import { AUDIO_CONFIG } from '../src/lib/shared/AudioConfig.js';
import type { ClientSettings } from '$lib/shared/settings.js';

interface ProcessAudioOptions {
	inputFile: string;
	startTime?: number; // seconds
	endTime?: number; // seconds
	transcriptionService?: 'whisper' | 'mock';
	outputName?: string;
}

async function convertAudioToWav(
	inputFile: string,
	startTime?: number,
	endTime?: number
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const ffmpegArgs: string[] = [];

		if (startTime !== undefined) {
			ffmpegArgs.push('-ss', startTime.toString());
		}

		if (endTime !== undefined) {
			const duration = endTime - (startTime || 0);
			ffmpegArgs.push('-t', duration.toString());
		}

		ffmpegArgs.push(
			'-i',
			inputFile,
			'-ar',
			AUDIO_CONFIG.sampleRate.toString(),
			'-ac',
			AUDIO_CONFIG.channels.toString(),
			'-f',
			's16le', // 16-bit signed little-endian PCM
			'-' // output to stdout
		);

		console.log(ffmpegArgs.join(' '));

		const ffmpeg = spawn('ffmpeg', ffmpegArgs);
		const chunks: Buffer[] = [];

		ffmpeg.stdout.on('data', (chunk) => {
			chunks.push(chunk);
		});

		ffmpeg.stderr.on('data', (data) => {
			// Log ffmpeg stderr but don't treat as error
			console.error(`ffmpeg: ${data.toString()}`);
		});

		ffmpeg.on('close', (code) => {
			if (code === 0) {
				resolve(Buffer.concat(chunks));
			} else {
				reject(new Error(`ffmpeg exited with code ${code}`));
			}
		});

		ffmpeg.on('error', reject);
	});
}

function chunkPCMData(pcmBuffer: Buffer, chunkSizeMs: number): ArrayBuffer[] {
	const bytesPerChunk = Math.floor((chunkSizeMs / 1000) * AUDIO_CONFIG.bytesPerSecond);

	const chunks: ArrayBuffer[] = [];

	for (let i = 0; i < pcmBuffer.length; i += bytesPerChunk) {
		const end = Math.min(i + bytesPerChunk, pcmBuffer.length);
		const chunk = pcmBuffer.subarray(i, end);
		const buffer = chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength);
		chunks.push(buffer as ArrayBuffer);
	}

	return chunks;
}

export async function processAudioFile(options: ProcessAudioOptions): Promise<void> {
	const { inputFile, startTime, endTime, transcriptionService = 'whisper' } = options;
	let outputName = options.outputName;

	if (outputName === undefined) {
		outputName = `${basename(inputFile, extname(inputFile))}`;
		if (startTime !== undefined) {
			outputName += `-${startTime?.toFixed(0)}`;
		}
		if (endTime !== undefined) {
			outputName += `-${endTime?.toFixed(0)}`;
		}
	}

	console.log(`Processing audio file: ${inputFile}`);
	if (startTime !== undefined) console.log(`Start time: ${startTime}s`);
	if (endTime !== undefined) console.log(`End time: ${endTime}s`);

	// Convert audio to the required format
	console.log('Converting audio to 16KHz mono PCM...');
	const pcmBuffer = await convertAudioToWav(inputFile, startTime, endTime);
	console.log(`Converted ${pcmBuffer.length} bytes of PCM data`);

	// Create transcription service
	const settings: ClientSettings = {
		transcriptionService: transcriptionService,
		whisperApiUrl: 'http://localhost:8000',
		gameVersion: 'dnd-2014'
	};

	// Create audio pipeline
	const pipeline = AudioPipeline.fromSettings(outputName, settings);

	// Set up observers
	pipeline.deltaMessage$.subscribe((message) => {
		console.log(message.text);
	});

	pipeline.transcriptionErrorMessages.subscribe((error) => {
		console.error(`Transcription error: ${error.error}`);
	});

	// Process audio in chunks
	const chunkSizeMs = AUDIO_CONFIG.bufferSeconds * 1000;
	const chunks = chunkPCMData(pcmBuffer, chunkSizeMs);
	console.log(`Processing ${chunks.length} chunks of ${chunkSizeMs}ms each`);

	for (let i = 0; i < chunks.length; i++) {
		console.log(`Processing chunk ${i + 1}/${chunks.length} of size ${chunks[i].byteLength}`);
		pipeline.input$.next(chunks[i]);

		// Add a small delay to allow processing
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	// Clean up
	pipeline.destroy();
	console.log('Processing complete');
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		console.log(`
Usage: npx tsx scripts/process-audio.ts <input-file> [options]

Options:
  --start <seconds>     Start time in seconds (default: 0)
  --end <seconds>       End time in seconds (default: end of file)
  --service <service>   Transcription service: 'whisper' or 'mock' (default: whisper)
  --name <name>         Output name for files (default: cli-processing)

Example:
  npx tsx scripts/process-audio.ts audio.mp3 --start 10 --end 60 --name my-test
		`);
		process.exit(1);
	}

	const inputFile = args[0];
	const options: ProcessAudioOptions = { inputFile };

	for (let i = 1; i < args.length; i += 2) {
		const flag = args[i];
		const value = args[i + 1];

		switch (flag) {
			case '--start':
				options.startTime = parseFloat(value);
				break;
			case '--end':
				options.endTime = parseFloat(value);
				break;
			case '--service':
				options.transcriptionService = value as 'whisper' | 'mock';
				break;
			case '--name':
				options.outputName = value;
				break;
			default:
				console.error(`Unknown flag: ${flag}`);
				process.exit(1);
		}
	}

	processAudioFile(options).catch((error) => {
		console.error('Error processing audio:', error);
		process.exit(1);
	});
}
