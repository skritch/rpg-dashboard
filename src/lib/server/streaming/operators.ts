import {
	pipe,
	scan,
	concatMap,
	mergeMap,
	tap,
	type MonoTypeOperatorFunction,
	Observable,
	type UnaryFunction
} from 'rxjs';
import fs from 'fs';
import path from 'path';
import { STREAMING_CONFIG } from '../transcription';
import { NonEmptyList } from '$lib/shared/NonEmptyList';

/**
 * Produces an operator which writes a stream to a file
 * as a side-effect. If `ser` is given, serializes first.
 *
 * Does not automatically write \n characters, write those yourself.
 */
export function tapToFile<T extends string | Buffer>(filePath: string): MonoTypeOperatorFunction<T>;
export function tapToFile<T>(
	filePath: string,
	ser: (t: T) => string | Buffer,
	init?: string | Buffer
): MonoTypeOperatorFunction<T>;
export function tapToFile<T>(
	filePath: string,
	ser?: (t: T) => string | Buffer,
	init?: string | Buffer
): MonoTypeOperatorFunction<T> {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const writeStream = fs.createWriteStream(filePath, { flags: 'a' });
	if (init !== undefined) {
		writeStream.write(init);
	}
	return tap({
		next: (data) => {
			const output = ser === undefined ? data : ser(data);
			writeStream.write(output);
		},
		complete: () => writeStream.close()
	});
}

export function tapToFileJson1<T>(
	filePath: string,
	toRow: (t: T) => unknown = (t: T) => t
): MonoTypeOperatorFunction<T> {
	return tapToFile<T>(filePath, (t: T) => JSON.stringify(toRow(t)) + '\n');
}

/**
 * Map a stream through the async function `f`, but returns its results
 * in the same order they came in.
 */
export function mapAsyncOrdered<I, O>(f: (x: I) => Promise<O>, concurrent?: number) {
	return pipe(
		mergeMap<I, Promise<{ result: O; index: number }>>(async (x: I, index: number) => {
			const result = await f(x);
			return { result: result, index: index };
		}, concurrent),
		// mergeMap runs in parallel but returns out of order, so we have to straighten out.
		scan<
			{ result: O; index: number },
			{ finished: Map<number, O>; nextIndex: number; output: O[] }
		>(
			(state, resultWithIndex) => {
				// Mutates state. Bad?
				state.output = [];
				state.finished.set(resultWithIndex.index, resultWithIndex.result);
				while (state.finished.has(state.nextIndex)) {
					state.output.push(state.finished.get(state.nextIndex)!);
					state.finished.delete(state.nextIndex);
					state.nextIndex++;
				}
				return state;
			},
			{ finished: new Map(), nextIndex: 0, output: [] }
		),
		concatMap((state) => state.output)
	);
}

/**
 * For each input, emits all records with logical times in the past `windowMs`.
 *
 * This will only work correctly if the logical times defined by
 * `toLogicalTimeMs` is monotonic.
 *
 * If `end` is given, the window's end is taken to be the
 * `end` of the current record.
 */

export function slidingWindow<T>(
	toLogicalTimeMs: (t: T) => { start: number; end?: number },
	windowMs: number = STREAMING_CONFIG.windowMs
): UnaryFunction<Observable<T>, Observable<NonEmptyList<T>>> {
	return pipe(
		scan<T, NonEmptyList<T>, T[]>((state: T[], x: T) => {
			const xTime = toLogicalTimeMs(x);
			const firstIdxInWindow = state.findIndex(
				(y) => toLogicalTimeMs(y).start >= (xTime.end || xTime.start) - windowMs
			);
			if (firstIdxInWindow === -1) {
				return NonEmptyList.of(x);
			} else {
				return NonEmptyList.fromArray([...state.slice(firstIdxInWindow), x]);
			}
		}, [])
	);
}
