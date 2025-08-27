import { describe, expect, it } from 'vitest';
import { concatArrayBuffers, suffixWhere } from './utils';

describe('concatArrayBuffers', () => {
	it('concatenates empty array to empty buffer', () => {
		const result = concatArrayBuffers([]);
		expect(result.byteLength).toBe(0);
	});

	it('concatenates single buffer unchanged', () => {
		const buffer = new ArrayBuffer(8);
		const view = new Uint8Array(buffer);
		view.set([1, 2, 3, 4, 5, 6, 7, 8]);

		const result = concatArrayBuffers([buffer]);
		const resultView = new Uint8Array(result);

		expect(result.byteLength).toBe(8);
		expect(Array.from(resultView)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
	});

	it('concatenates multiple buffers in order', () => {
		const buffer1 = new ArrayBuffer(3);
		const buffer2 = new ArrayBuffer(2);
		const buffer3 = new ArrayBuffer(4);

		const view1 = new Uint8Array(buffer1);
		const view2 = new Uint8Array(buffer2);
		const view3 = new Uint8Array(buffer3);

		view1.set([10, 20, 30]);
		view2.set([40, 50]);
		view3.set([60, 70, 80, 90]);

		const result = concatArrayBuffers([buffer1, buffer2, buffer3]);
		const resultView = new Uint8Array(result);

		expect(result.byteLength).toBe(9);
		expect(Array.from(resultView)).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
	});

	it('handles zero-length buffers in sequence', () => {
		const buffer1 = new ArrayBuffer(2);
		const buffer2 = new ArrayBuffer(0); // Empty buffer
		const buffer3 = new ArrayBuffer(3);

		const view1 = new Uint8Array(buffer1);
		const view3 = new Uint8Array(buffer3);

		view1.set([100, 200]);
		view3.set([10, 20, 30]);

		const result = concatArrayBuffers([buffer1, buffer2, buffer3]);
		const resultView = new Uint8Array(result);

		expect(result.byteLength).toBe(5);
		expect(Array.from(resultView)).toEqual([100, 200, 10, 20, 30]);
	});
});

describe('sliceWhileRight', () => {
	it('returns empty array when input is empty', () => {
		expect(suffixWhere([], () => true)).toEqual([]);
	});

	it('returns longest suffix where predicate is true', () => {
		const arr = [1, 2, 3, 4, 5];
		const result = suffixWhere(arr, (x) => x > 3);
		expect(result).toEqual([4, 5]);
	});

	it('returns empty array when no elements match predicate from right', () => {
		const arr = [1, 2, 3];
		const result = suffixWhere(arr, (x) => x > 10);
		expect(result).toEqual([]);
	});

	it('returns entire array when all elements match predicate', () => {
		const arr = [5, 6, 7, 8];
		const result = suffixWhere(arr, (x) => x > 4);
		expect(result).toEqual([5, 6, 7, 8]);
	});
});
