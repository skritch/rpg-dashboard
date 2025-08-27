import type { KeywordMessage } from '$lib/shared/messages';
import fs from 'fs';
import path from 'path';
import { PUBLIC_DATA_DIR } from '../paths';

export interface DBEntry {
	name: string;
	type: string;
	index_name: string;
	priority: 'high' | 'low' | 'beginner';
	gm_only: boolean;
	alias?: string;
	group?: string;
	data: Record<string, unknown>;
}

export type KeywordEntry =
	| {
			keyword: string;
			type: 'row';
			row: DBEntry;
	  }
	| {
			keyword: string;
			type: 'group';
			rows: DBEntry[];
	  };

export function kweToMessageEntry(
	kwe: KeywordEntry
): Omit<KeywordMessage['keywords'][number], 'matchIndex'> {
	if (kwe.type === 'row') {
		return {
			keyword: kwe.keyword,
			name: kwe.row.name,
			index_name: kwe.row.index_name,
			matchType: kwe.type,
			type: kwe.row.type,
			group: kwe.row.group,
			data: kwe.row.data
		};
	} else {
		return {
			keyword: kwe.keyword,
			name: kwe.keyword,
			matchType: kwe.type,
			type: kwe.rows[0]?.type,
			group: kwe.keyword,
			data: Object.fromEntries(kwe.rows.map((row) => [row.index_name, row.data]))
		};
	}
}

export class KeywordDatabase {
	private records: DBEntry[] = [];
	private indexByGroup: Map<string, DBEntry[]> = new Map();
	private keywordIndex: Map<string, KeywordEntry> = new Map();

	constructor(readonly gameVersion: string) {
		this.loadData();
		this.buildGroupIndex();
		this.buildKeywordIndex();
	}

	private loadData() {
		const dataPath = path.join(PUBLIC_DATA_DIR, `${this.gameVersion}-database.json1`);

		if (!fs.existsSync(dataPath)) {
			console.warn(`Database not found at ${dataPath}. Run the generation script first.`);
			return;
		}

		const fileContent = fs.readFileSync(dataPath, 'utf8');
		const lines = fileContent.trim().split('\n');

		for (const line of lines) {
			if (line.trim()) {
				try {
					const rawRecord: DBEntry = JSON.parse(line);

					// Extract index_name from the data object
					const indexName = rawRecord.data.index || rawRecord.data.name || rawRecord.name;

					const record: DBEntry = {
						name: rawRecord.name,
						type: rawRecord.type,
						index_name: String(indexName),
						priority: rawRecord.priority,
						gm_only: rawRecord.gm_only,
						alias: rawRecord.alias,
						group: rawRecord.group,
						data: rawRecord.data
					};

					this.records.push(record);
				} catch (error) {
					console.error('Error parsing D&D record:', error);
				}
			}
		}

		console.log(`Loaded ${this.records.length} D&D records`);
	}

	private buildGroupIndex() {
		for (const record of this.records) {
			// Index by group
			if (record.group) {
				if (!this.indexByGroup.has(record.group)) {
					this.indexByGroup.set(record.group, []);
				}
				this.indexByGroup.get(record.group)!.push(record);
			}
		}
	}

	private buildKeywordIndex() {
		// Filter to high priority, non-GM records
		const eligibleRows = this.records.filter(
			(record) => record.priority === 'high' && !record.gm_only
		);

		// Add individual records based on rules
		for (const record of eligibleRows) {
			// Include record if:
			// 1. Has an alias, in which case the alias is the keyword
			// 2. Or, no alias and no group name.
			// (Records with only a group name will be handled below.)
			if (record.alias || !record.group) {
				const keyword = record.alias || record.name;
				this.keywordIndex.set(keyword.toLowerCase(), {
					keyword,
					type: 'row',
					row: record
				});
			}
		}

		// Add group names
		for (const [groupName, groupRecords] of this.indexByGroup.entries()) {
			// Only include groups that have high priority, non-GM records
			const eligibleGroupRows = groupRecords.filter(
				(record) => record.priority === 'high' && !record.gm_only
			);

			if (eligibleGroupRows.length > 0) {
				this.keywordIndex.set(groupName.toLowerCase(), {
					keyword: groupName,
					type: 'group',
					rows: eligibleGroupRows
				});
			}
		}
	}

	// Keyword-specific methods
	getKeywords(): string[] {
		return Array.from(this.keywordIndex.keys());
	}

	getKeywordByName(keyword: string): KeywordEntry | undefined {
		return this.keywordIndex.get(keyword.toLowerCase());
	}
}
