import {
	Observable,
	map,
	Subject,
	tap,
	filter,
	shareReplay,
	last,
	type ShareReplayConfig
} from 'rxjs';
import {
	createTranscriptionService,
	STREAMING_CONFIG,
	type TranscriptionService
} from './transcription';
import type {
	KeywordMessage,
	TranscriptDeltaMessage,
	TranscriptionErrorMessage
} from '$lib/shared/messages';
import { tapToFile, tapToFileJson1 } from '$lib/server/streaming/operators';
import {
	keywordSpottingLogic,
	parseLogic,
	transcriptionLogic,
	windowLogic,
	keywordDedupeLogic,
	wavHeader
} from './streaming/logic';
import {
	dsToTranscript,
	errWithWindowToMessage,
	tdToMessage,
	tdToRow,
	type DeltaState,
	type WT,
	kwmToRow,
	type AudioSegment
} from './streaming/types';
import { deltaLogic } from './streaming/logic';
import { type TD } from './streaming/types';
import { KeywordSpotter } from './keywords/KeywordSpotter';
import { type ClientSettings } from '$lib/shared/settings';
import { KeywordDatabase } from './keywords/KeywordDatabase';
import type { PCMData } from './audio';
import { outputPathsFromEnv, type TranscriptOutputPaths } from './paths';

const shareReplayConfig: ShareReplayConfig = {
	windowTime: STREAMING_CONFIG.windowMs,
	refCount: false
};

/**
 * This class encapsulated the central business logic of:
 * - transcribing audio
 * - reconciling overlapping transcriptions
 * - keyword spotting
 * - etc.
 *
 * as a stream-processing pipeline implemented with RxJS observables.
 */
export class AudioPipeline {
	// RxJS observables we expose as outputs.
	input$: Subject<ArrayBuffer>;
	audioSegments$: Observable<AudioSegment>;
	transcriptionSuccesses$: Observable<WT>;
	deltaMessage$: Observable<TranscriptDeltaMessage>;
	transcriptionErrorMessages: Observable<TranscriptionErrorMessage>;
	keywordMessages$: Observable<KeywordMessage>;

	static fromSettings(pipelineName: string, settings: ClientSettings) {
		return new AudioPipeline(
			createTranscriptionService(settings),
			new KeywordSpotter(new KeywordDatabase(settings.gameVersion)),
			outputPathsFromEnv(pipelineName)
		);
	}

	constructor(
		private transcriptionService: TranscriptionService,
		private kwSpotter: KeywordSpotter,
		filePaths: TranscriptOutputPaths
	) {
		// 1. Setup and Input
		console.log(
			`New audio pipeline using ${transcriptionService.constructor.name} writing to ${filePaths.baseDir}`
		);

		this.input$ = new Subject<PCMData>();

		// 2. Transcribe

		this.audioSegments$ = this.input$.pipe(
			// Write raw PCA data to a file. TODO: wrap in .wav?
			tapToFile(filePaths.input, (audio) => Buffer.from(audio), wavHeader),
			parseLogic,
			shareReplay(shareReplayConfig)
		);

		const transcriptionResults$ = this.audioSegments$.pipe(
			windowLogic,
			transcriptionLogic(() => this.transcriptionService),
			shareReplay(shareReplayConfig)
		);

		this.transcriptionErrorMessages = transcriptionResults$.pipe(
			filter((result) => !result.success),
			tap((e) => {
				console.error(`Transcription failed for message ${e.meta.id}:`, e.error);
			}),
			map(errWithWindowToMessage)
		);

		this.transcriptionSuccesses$ = transcriptionResults$.pipe(
			filter((result) => result.success),
			map(({ meta, t }) => ({ meta, t })),
			tapToFileJson1(filePaths.transcriptionResults)
		);

		// 3. Compute deltas between overlapping transcripts
		const deltas$ = this.transcriptionSuccesses$.pipe(
			deltaLogic,
			filter((ds) => ds.out !== undefined),
			map((ds) => ds as DeltaState & { out: TD }),
			tapToFileJson1(filePaths.deltas, (td) => tdToRow(td.out)),
			shareReplay(shareReplayConfig)
		);

		// Deltas as messages for websocket
		this.deltaMessage$ = deltas$.pipe(map((td) => tdToMessage(td.out)));

		// Write the whole transcript to a text file.
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		const transcript$ = deltas$
			.pipe(
				last(() => true, { state: [] }),
				tapToFile(filePaths.transcript, dsToTranscript)
			)
			.subscribe();

		// 4. Keyword spotting
		this.keywordMessages$ = deltas$.pipe(
			keywordSpottingLogic(this.kwSpotter),
			tapToFileJson1(filePaths.keywords, kwmToRow),
			keywordDedupeLogic
		);
	}

	destroy() {
		this.input$.complete();
	}

	setTranscriptionService(transcriptionService: TranscriptionService) {
		this.transcriptionService = transcriptionService;
	}
}
