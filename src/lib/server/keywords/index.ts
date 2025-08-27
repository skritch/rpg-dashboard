import { KeywordDatabase } from './KeywordDatabase';

// Singleton instance
let database: KeywordDatabase | null = null;

export function getKeywordDatabase(): KeywordDatabase {
	if (!database) {
		database = new KeywordDatabase('dnd-2014');
	}
	return database;
}
