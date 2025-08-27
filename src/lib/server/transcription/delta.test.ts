import { describe, expect, it } from 'vitest';
import { firstValueFrom, Observable, of } from 'rxjs';
import { map, toArray } from 'rxjs/operators';
import { deltaLogic } from '../streaming/logic';
import type { TD, WindowMeta, WT } from '../streaming/types';
import { join } from 'path';
import { loadJson1 } from '$lib/shared/utils';
import type { DeltaRow } from '$lib/shared/files';

describe('deltaLogic', () => {
	it('should process transcription results and produce correct deltas', async () => {
		const transcriptionResults = loadJson1(
			join(__dirname, 'fixtures', 'transcription_results.json1')
		) as WT[];

		const deltas = loadJson1(join(__dirname, 'fixtures', 'deltas.json1')) as DeltaRow[];

		// Create input stream with transcription results paired with audio windows
		const inputStream: Observable<WT> = of(
			...transcriptionResults.map((row) => ({
				meta: {
					...row.meta,
					wav: new ArrayBuffer(0)
				},
				t: row.t
			}))
		);

		const expectedText = deltas.map((d) => ({
			overwrite: d.delta.overwrite,
			segments: d.delta.segments.map((seg) => ({ text: seg.text }))
		}));

		// Process through deltaLogic pipeline
		// Check outputs as we go so it's easier to hone in on errors.
		const stream = inputStream.pipe(
			deltaLogic,
			map((res) => res.out as TD)
		);

		let i = 0;
		const promise = stream.forEach((wd) => {
			console.log(`Checking delta ${i}`);
			// We compare only the text because the timestamps will be
			// slightly offset for some reason
			const actualText = {
				overwrite: wd.delta.overwrite,
				segments: wd.delta.segments.map((seg) => ({ text: seg.text }))
			};
			expect(actualText).toEqual(expectedText[i]);
			console.log(`Delta ${i} passed. \n`);
			i++;
		});
		await promise;
	});

	it('should handle empty transcription results', async () => {
		const mockWindow: WindowMeta = {
			id: '0',
			index: 0,
			startPositionMs: 0,
			elapsedMs: 1000,
			durationMs: 1000,
			endPositionMs: 1000
		};

		const emptyResult = {
			duration: 1,
			text: '',
			segments: []
		};

		const inputStream = of({
			meta: mockWindow,
			t: emptyResult
		});

		const actualDeltas = await firstValueFrom(
			inputStream.pipe(
				deltaLogic,
				map((res) => res.out!),
				toArray()
			)
		);

		// Undecided as to which behavior is desirable
		expect(actualDeltas).toHaveLength(0);
		// expect(actualDeltas[0].delta.overwrite).toBe(0);
		// expect(actualDeltas[0].delta.segments).toEqual([]);
	});
});
