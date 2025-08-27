import AhoCorasick from 'ahocorasick';

import type { LLMService } from '../llm';
import type { KeywordDatabase, KeywordEntry } from './KeywordDatabase';
import { stopwords } from './stopwords';

/**
 * Basic approach:
 * 1. exact match
 * 2. fuzzy-search with the keyword index.
 * 3. remove matched things and stopwords and see if there's anything left
 *    (we DO want stopwords during the text searches)
 * 4. if yes, ask the LLM
 *
 * Interaction with streaming:
 * - (v0) we check each delta as it comes in
 * - if rate-limited, don't retry, but the next request should include this one too.
 * - might not need a v1
 *
 */

// Only stopwords surrounded by spaces
const stopword_ac = new AhoCorasick(stopwords.map((sw) => ' ' + sw + ' '));

// TBD: like the database, this could be a singleton
// but really we'd like one per game rules (if support multiple)
// it might also take some different settings, or different LLMs.
export class KeywordSpotter {
	private keyword_ac: AhoCorasick;

	constructor(
		private db: KeywordDatabase
		// private llm: LLMService
	) {
		this.keyword_ac = new AhoCorasick(db.getKeywords().map((kw) => ' ' + kw.toLowerCase() + ' '));
	}

	match(text: string) {
		// 1. Exact search with AC
		const acr: ACResult = this.keyword_ac.search(
			// Pad the text with spaces so we can match only keywords with spaces on both sides.
			' ' + text.toLowerCase().replace(/[^a-zA-Z\s]/g, '') + ' '
		);
		// TODO: the indices of these matches will not be the indices in the original string
		const acMatches = acResultToMatches(acr);

		// 2. Fuzzy search, probably

		// 3. Find stopwords
		// const stopwords_acr: ACResult = stopword_ac.search(text)
		// const remainingText = removeMatches(removeMatches(text, acr), stopwords_acr).trim()
		// console.log(`Remaining text: ${remainingText}`)

		// 4. Determine if there's enough left to be worth sending to an LLM...

		if (acMatches.length > 0) {
			console.log(`Matches: ${JSON.stringify(Object.fromEntries(acMatches))}`);
		}

		return acMatches;
	}

	spot(text: string): (KeywordEntry & { index: number })[] {
		const matches = this.match(text);

		// do more here
		const entries = matches
			.map(([kw, index]) => {
				const kwe = this.db.getKeywordByName(kw.trim());
				if (kwe === undefined) {
					console.log(`Keyword not found? ${kw}`);
					return undefined;
				}
				return {
					index: index,
					...kwe
				};
			})
			.filter((kwe) => kwe !== undefined);
		return entries;
	}
}

type Matches = [string, number][]; // [keyword, start index] pairs
type ACResult = [number, string[]][]; // index, list of kws ending at this index

function acResultToMatches(acr: ACResult): Matches {
	const matches: Matches = [];

	for (const [endIndex, keywords] of acr) {
		// Find the longest keyword at this position
		let longestKeyword = '';
		for (const keyword of keywords) {
			if (keyword.length > longestKeyword.length) {
				longestKeyword = keyword;
			}
		}

		if (longestKeyword) {
			const startIndex = endIndex - longestKeyword.length + 1;
			matches.push([longestKeyword, startIndex]);
		}
	}

	return matches;
}

// Remove matches from a string, leaving spaces.
function removeMatches(text: string, acResult: ACResult): string {
	let result = text;

	// Process matches in reverse order to avoid index shifting
	for (let i = acResult.length - 1; i >= 0; i--) {
		const [endIndex, keywords] = acResult[i];

		// Find the longest keyword at this position
		let longestKeyword = '';
		for (const keyword of keywords) {
			if (keyword.length > longestKeyword.length) {
				longestKeyword = keyword;
			}
		}

		if (longestKeyword) {
			const startIndex = endIndex - longestKeyword.length + 1;
			const spaces = ' '.repeat(longestKeyword.length);
			result = result.slice(0, startIndex) + spaces + result.slice(endIndex + 1);
		}
	}

	return result;
}
