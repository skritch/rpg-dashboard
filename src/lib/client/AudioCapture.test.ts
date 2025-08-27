import { describe, expect, it } from 'vitest';
import { float32ToInt16 } from '$lib/client/AudioCapture';

describe('audioUtils', () => {
	describe('float32ToInt16', () => {
		it('converts float32 to int16 correctly', () => {
			const input = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
			const result = float32ToInt16(input);

			expect(result[0]).toBe(0);
			expect(result[1]).toBe(16383); // 0.5 * 0x7fff
			expect(result[2]).toBe(-16384); // -0.5 * 0x8000
			expect(result[3]).toBe(32767); // 1.0 * 0x7fff
			expect(result[4]).toBe(-32768); // -1.0 * 0x8000
		});

		it('clamps values outside [-1, 1] range', () => {
			const input = new Float32Array([2.0, -2.0]);
			const result = float32ToInt16(input);

			expect(result[0]).toBe(32767); // Clamped to 1.0
			expect(result[1]).toBe(-32768); // Clamped to -1.0
		});
	});
});
