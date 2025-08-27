declare const NonEmptyListBrand: unique symbol;
export type NonEmptyList<T> = T[] & { readonly [NonEmptyListBrand]: true };

export const NonEmptyList = {
	of: <T>(head: T, ...tail: T[]): NonEmptyList<T> => {
		return [head, ...tail] as NonEmptyList<T>;
	},
	fromArray: <T>(arr: T[]): NonEmptyList<T> => {
		if (arr.length === 0) {
			throw new Error('Cannot create NonEmptyList from empty array');
		}
		return arr as NonEmptyList<T>;
	},

	head: <T>(list: NonEmptyList<T>): T => list[0],
	tail: <T>(list: NonEmptyList<T>): T[] => list.slice(1),
	last: <T>(list: NonEmptyList<T>): T => list[list.length - 1],
	map: <T, U>(list: NonEmptyList<T>, fn: (item: T) => U): NonEmptyList<U> => {
		return list.map(fn) as NonEmptyList<U>;
	},
	concat: <T>(a: NonEmptyList<T>, b: NonEmptyList<T>): NonEmptyList<T> => {
		return [...a, ...b] as NonEmptyList<T>;
	}
};
