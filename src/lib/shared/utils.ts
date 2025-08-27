import { readFileSync } from 'fs';

/**
 * Generate a content hash for binary data
 * Uses Web Crypto API which works in both Node.js and browsers
 */
export async function generateContentHash(data: ArrayBuffer, length: number = 12): Promise<string> {
	const hashBuffer = await crypto.subtle.digest('SHA-256', data);
	const hashArray = new Uint8Array(hashBuffer);
	const hashHex = Array.from(hashArray)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return hashHex.substring(0, length);
}

export function parseArrayBuffer(data: Buffer | ArrayBuffer | Buffer[]): ArrayBuffer {
	if (data instanceof ArrayBuffer) {
		return data;
	} else if (Buffer.isBuffer(data)) {
		return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
	} else {
		throw new Error(`got a ${data.constructor.name}`);
	}
}

// Helper function for human-readable timestamps
export function dateToPretty(d: Date): string {
	return d.toTimeString().split(' ')[0] + '.' + d.getMilliseconds().toString().padStart(3, '0');
}

// Return the longest suffix of `arr` for which `predicate` is True.
// Iterates from the right end, but returns in order.
export function suffixWhere<T>(arr: T[], predicate: (t: T) => boolean): T[] {
	let i;
	let last = arr.length;
	for (i = arr.length - 1; i >= 0; i--) {
		if (!predicate(arr[i])) {
			return arr.slice(last);
		}
		last = i;
	}
	return arr;
}

export function concatArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
	const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
	const result = new ArrayBuffer(totalLength);
	const view = new Uint8Array(result);

	let offset = 0;
	for (const buffer of buffers) {
		view.set(new Uint8Array(buffer), offset);
		offset += buffer.byteLength;
	}

	return result;
}

export function loadJson1(filePath: string) {
	const content = readFileSync(filePath, 'utf-8');
	const lines = content
		.trim()
		.split('\n')
		.filter((line) => line.trim());
	return lines.map((line) => JSON.parse(line));
}
export function getTimestamp(): string {
	const now = new Date();
	return now.toTimeString().split(' ')[0] + '.' + now.getMilliseconds().toString().padStart(3, '0');
}
export function isValidUrl(url: string): boolean {
	try {
		const parsedUrl = new URL(url);
		return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
	} catch {
		return false;
	}
}
