import { writeFileSync } from 'fs';
import { firstValueFrom, lastValueFrom, Observable, of } from 'rxjs';
import { filter, map, toArray } from 'rxjs/operators';
import { deltaLogic } from '$lib/server/streaming/logic';
import { tdToRow } from '$lib/server/streaming/types';
import type { TD, WT } from '$lib/server/streaming/types';
import type { TranscriptionResultRow } from '../src/lib/shared/files';
import { loadJson1 } from '../src/lib/shared/utils';

async function processTranscriptions(
	inputFile: string,
	outputFile: string,
	fullTranscript: boolean = false
) {
	console.log(`Loading transcriptions from: ${inputFile}`);

	const rows = loadJson1(inputFile) as TranscriptionResultRow[];

	console.log(`Loaded ${rows.length} transcription results`);

	// Create input stream with transcription results paired with audio windows
	const inputStream: Observable<WT> = of(...rows);

	if (fullTranscript) {
		// Get the final full transcript
		await writeTranscript(inputStream, outputFile);
	} else {
		await writeDeltas(inputStream, outputFile);
	}
}

async function writeTranscript(inputStream: Observable<WT>, outputFile: string) {
	const finalResult = await lastValueFrom(inputStream.pipe(deltaLogic));

	console.log(`Final transcript has ${finalResult.state.length} segments`);

	// Write each segment's text on a new line
	const textContent = finalResult.state.map((seg) => seg.text).join('\n\n');
	writeFileSync(outputFile, textContent);

	console.log(`Full transcript written to: ${outputFile}`);
}

async function writeDeltas(inputStream: Observable<WT>, outputFile: string) {
	const deltas = await firstValueFrom(
		inputStream.pipe(
			deltaLogic,
			filter((res) => res.out !== undefined),
			map((res) => res.out as TD),
			toArray()
		)
	);

	console.log(`Generated ${deltas.length} deltas`);

	// Write deltas to output file in JSON1 format (one JSON object per line)
	const json1Content = deltas.map((td) => JSON.stringify(tdToRow(td))).join('\n');
	writeFileSync(outputFile, json1Content);

	console.log(`Deltas written to: ${outputFile}`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
	console.error(
		'Usage: tsx tr_to_deltas.ts [--full-transcript] <input_transcriptions.json1> <output_file>'
	);
	console.error('  --full-transcript: Output final transcript text instead of deltas');
	process.exit(1);
}

let fullTranscript = false;
let inputFile: string;
let outputFile: string;

if (args[0] === '--full-transcript') {
	fullTranscript = true;
	[, inputFile, outputFile] = args;
} else {
	[inputFile, outputFile] = args;
}

if (!inputFile || !outputFile) {
	console.error(
		'Usage: tsx tr_to_deltas.ts [--full-transcript] <input_transcriptions.json1> <output_file>'
	);
	process.exit(1);
}

processTranscriptions(inputFile, outputFile, fullTranscript).catch((error) => {
	console.error('Error processing transcriptions:', error);
	process.exit(1);
});
