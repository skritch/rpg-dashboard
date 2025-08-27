import type { TranscriptionService } from './TranscriptionService.js';
import type { WhisperTranscript } from '.';

export type MockConfig = {
	simulateDelay?: boolean;
	delayMs?: number;
};
const defaultConfig: MockConfig = {
	simulateDelay: true,
	delayMs: 1000
};

const MOCK_RESPONSES = [
	// Call 0: 0-5s window, only partial segment 1
	{
		segments: [{ text: "Welcome to today's [call0]", start: 1.0, end: 3.5, confidence: 0.78 }]
	},
	// Call 1: 0-10s window, segments 1-2 complete
	{
		segments: [
			{
				text: "Welcome to today's meeting [call1]",
				start: 1.0,
				end: 3.5,
				confidence: 0.85
			},
			{
				text: "let's discuss the quarterly [call1]",
				start: 4.0,
				end: 10.0,
				confidence: 0.82
			}
		]
	},
	// Call 2: 0-15s window, segments 1-3 with segment 3 partial
	{
		segments: [
			{
				text: "Welcome to today's meeting [call2]",
				start: 1.0,
				end: 3.5,
				confidence: 0.89
			},
			{
				text: "let's discuss the quarterly results [call2]",
				start: 4.0,
				end: 11.0,
				confidence: 0.91
			},
			{
				text: 'our revenue has increased [call2]',
				start: 11.0,
				end: 15.0,
				confidence: 0.79
			}
		]
	},
	// Call 3: 0-20s window, segments 1-4 with segment 4 partial
	{
		segments: [
			{
				text: "Welcome to today's meeting [call3]",
				start: 1.0,
				end: 3.5,
				confidence: 0.92
			},
			{
				text: "let's discuss the quarterly results [call3]",
				start: 4.0,
				end: 11.0,
				confidence: 0.94
			},
			{
				text: 'our revenue has increased by fifteen percent [call3]',
				start: 11.0,
				end: 16.5,
				confidence: 0.88
			},
			{ text: 'which is above our [call3]', start: 16.5, end: 20.0, confidence: 0.81 }
		]
	},
	// Call 4: 0-25s window, segments 1-5 with segment 5 partial
	{
		segments: [
			{
				text: "Welcome to today's meeting [call4]",
				start: 1.0,
				end: 3.5,
				confidence: 0.94
			},
			{
				text: "let's discuss the quarterly results [call4]",
				start: 4.0,
				end: 11,
				confidence: 0.96
			},
			{
				text: 'our revenue has increased by fifteen percent [call4]',
				start: 11,
				end: 16.5,
				confidence: 0.93
			},
			{
				text: 'which is above our initial projections [call4]',
				start: 16.5,
				end: 22.0,
				confidence: 0.89
			},
			{ text: 'we should celebrate [call4]', start: 22.0, end: 25.0, confidence: 0.84 }
		]
	},
	// Call 5: 0-30s window, all segments complete
	{
		segments: [
			{
				text: "Welcome to today's meeting [call5]",
				start: 1.0,
				end: 3.5,
				confidence: 0.96
			},
			{
				text: "let's discuss the quarterly results [call5]",
				start: 4.0,
				end: 11,
				confidence: 0.97
			},
			{
				text: 'our revenue has increased by fifteen percent [call5]',
				start: 11,
				end: 16.5,
				confidence: 0.95
			},
			{
				text: 'which is above our initial projections [call5]',
				start: 16.5,
				end: 22.0,
				confidence: 0.92
			},
			{
				text: 'we should celebrate this achievement [call5]',
				start: 22.0,
				end: 27,
				confidence: 0.91
			}
		]
	},
	// Call 6: 5-35s window, segments shifted by -5s, segments 2-5
	{
		segments: [
			{
				text: 'ss discuss the quarterly results [call6]',
				start: 0.0,
				end: 6,
				confidence: 0.98
			}, // picked up syllable from prev
			{
				text: 'our revenue has increased by fifteen percent [call6]',
				start: 6,
				end: 11.5,
				confidence: 0.96
			},
			{
				text: 'which is above our initial projections [call6]',
				start: 11.5,
				end: 17,
				confidence: 0.94
			},
			{
				text: 'we should celebrate this achievement [call6]',
				start: 17,
				end: 22,
				confidence: 0.93
			}
		]
	},
	// Call 7: 10-40s window, segments 3-5, some merging
	{
		segments: [
			{
				text: 'our revenue has increased by fifteen percent which is [call7]',
				start: 1,
				end: 8,
				confidence: 0.91
			}, // merged 3+4 start
			{
				text: 'above our initial projections [call7]',
				start: 8,
				end: 12,
				confidence: 0.89
			},
			{
				text: 'we should celebrate this achievement [call7]',
				start: 12,
				end: 17,
				confidence: 0.95
			}
		]
	},
	// Call 8: 15-45s window, segments 4-5
	{
		segments: [
			{
				text: 'which is above our initial projections [call8]',
				start: 1.5,
				end: 7,
				confidence: 0.97
			},
			{
				text: 'we should celebrate this achievement [call8]',
				start: 7.0,
				end: 12,
				confidence: 0.96
			}
		]
	},
	// Call 9: 20-50s window, segment 5 only
	{
		segments: [
			{
				text: 'projections we should celebrate this achievement [call9]',
				start: 2,
				end: 7,
				confidence: 0.98
			} // picked up work from prev
		]
	},
	// Call 10: 25-55s window, segment 5 only
	{
		segments: [
			{ text: 'this achievement [call10]', start: 0, end: 2, confidence: 0.99 } // only last couple words
		]
	},
	// Call 11: 30-60s window, no speech (silence after 21.5s)
	{
		segments: []
	}
];

const mockResponse = (i: number) => {
	const response = MOCK_RESPONSES[i % MOCK_RESPONSES.length];
	const fullText = response.segments.map((s) => s.text).join(' ');

	return {
		segments: response.segments,
		fullText,
		isComplete: true
	};
};

export class MockTsService implements TranscriptionService {
	private i: number = 0;

	constructor(readonly config: Partial<MockConfig> = {}) {
		this.config = {
			...defaultConfig,
			...config
		};
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	async transcribe(_audioBuffer: ArrayBuffer, _mimeType: string): Promise<WhisperTranscript> {
		// Simulate processing delay if configured
		if (this.config.simulateDelay && this.config.delayMs) {
			await new Promise((resolve) => setTimeout(resolve, this.config.delayMs));
		}
		const response = mockResponse(this.i++);
		return {
			...response,
			text: response.segments.map((seg) => seg.text).join(' '),
			segments: response.segments.map((seg) => {
				return {
					start: seg.start,
					end: seg.end,
					text: seg.text,
					confidence: seg.confidence
				};
			})
		};
	}

	async isAvailable(): Promise<boolean> {
		// Mock service is always available
		return true;
	}
}
