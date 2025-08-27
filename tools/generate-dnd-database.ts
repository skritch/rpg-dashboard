#!/usr/bin/env tsx
/**
 * Produces:
 * - `data/dnd-2014-database.json1` (contains everything in the SRD that we care about, but is missing various feats)
 * - `data/dnd-2024-database.json1` (incomplete because the upstream 5e-database is incomplete; we'll need to find another source)
 *
 * Requires `dnd-filter-config.json` in the data/ dir, specifying behavior for the NEEDS_FILTER resources.
 * I created this with some scripts and LLM aid, which are not worth trying to replicate.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, PUBLIC_DATA_DIR } from '$lib/server/paths';

const REPO_URL = 'https://github.com/5e-bits/5e-database.git';
const REPO_DIR = path.join(DATA_DIR, '5e-database');

// Could also have "beginner mode" that looks up everything.
// Or various tiers / categories:
// - beginner (look up basic rules / items)
// - DM-only
// - level-up mode
// - full search

const HIGH_PRIORITY = [
	'Spells',
	'Feats', // incomplete because SRD policy
	'Conditions',
	'Weapon-Mastery-Properties', // 2024 only
	'Magic-Items' // ought to only show the items the players possess
];

// some high-prio, some low, some beginner stuff.
const NEEDS_FILTER = [
	'Features', // class features.
	'Equipment', // basic weapons -> low priority.
	'Rule-Sections', // filter down, e.g. keep "mounted combat", "Advantage", but not "making an attack"
	'Traits', // e.g. dwarven toughness. Filter, e.g. keep "darkvision" and "stonecunning"
	'Weapon-Properties' // keep e.g. finesse, light, loading, reach
];

// Basic rulebook lookups, not likely to be useful
const LOW_PRIORITY = [
	'Subclasses',
	'Backgrounds',
	'Languages',
	'Skills',
	'Races', // changed in 2024
	'Subraces', // changed in 2024
	'Classes'
];

const GM_ONLY = ['Monsters'];

const BEGINNER = ['Ability-Scores', 'Alignments', 'Magic-Schools', 'Damage-Types'];

// const OMIT = [
// 'Levels',
// 'Rules',
// 'Equipment-Categories',
// 'Proficiencies',
// ]

// Load filter configuration from generated file
const RESOURCE_TYPES = [...HIGH_PRIORITY, ...NEEDS_FILTER, ...LOW_PRIORITY, ...GM_ONLY] as const;

interface ResourceEntry {
	name: string;
	type: string;
	priority: 'high' | 'low' | 'beginner';
	gm_only: boolean;
	alias?: string;
	group?: string;
	data: Record<string, unknown>;
}

interface FilterEntry {
	priority: string;
	alias?: string;
	group?: string;
}

type FilterConfig = Record<string, Record<string, FilterEntry>>; // Resource type: FilterEntry
const FILTER_CONFIG: FilterConfig = JSON.parse(
	fs.readFileSync(path.join(PUBLIC_DATA_DIR, 'dnd-filter-config.json'), 'utf8')
);

function initCap(s: string) {
	if (typeof s !== 'string' || s.length === 0) {
		return s; // Handle non-string input or empty strings
	}
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function applyNamingRules(name: string): { alias?: string; group?: string } {
	// Rule 1: "string1: string2" -> group: "string1", alias: "string2"
	// These entries will have a keyword for each alias + a keyword for the whole group.
	// E.g. "Fighting Style: Great Weapon Fighting"
	const colonMatch = name.match(/^(.+?):\s*(.+)$/);
	if (colonMatch) {
		return {
			group: colonMatch[1].trim(),
			alias: colonMatch[2].trim()
		};
	}

	// Rule 2: "string1 (string2)" -> group: "string1"
	// These entries don't get keywords of their own, but will be given
	// a collective keyword for the group
	// e.g. "Action Surge (2 uses)"
	const parenMatch = name.match(/^(.+?)\s+\([^)]+\)$/);
	if (parenMatch) {
		return {
			group: parenMatch[1].trim()
		};
	}

	// Rule 3: "string1, string2" -> alias: "String2 string1"
	const commaMatch = name.match(/^(.+?),\s*(.+)$/);
	if (commaMatch) {
		return {
			alias: `${initCap(commaMatch[2].trim())} ${commaMatch[1].trim()}`
		};
	}

	return {};
}

function getFilteredData(
	resourceType: string,
	itemName: string
): { priority: 'high' | 'low' | 'beginner'; alias?: string; group?: string } {
	let result: { priority: 'high' | 'low' | 'beginner'; alias?: string; group?: string };

	if (HIGH_PRIORITY.includes(resourceType)) {
		result = { priority: 'high' };
	} else if (LOW_PRIORITY.includes(resourceType)) {
		result = { priority: 'low' };
	} else if (BEGINNER.includes(resourceType)) {
		result = { priority: 'beginner' };
	} else if (NEEDS_FILTER.includes(resourceType)) {
		const config = FILTER_CONFIG[resourceType];
		if (config && config[itemName]) {
			const entry = config[itemName];
			result = {
				priority: entry.priority as 'high' | 'low' | 'beginner',
				alias: entry.alias,
				group: entry.group
			};
		} else {
			// Default to low priority if not specifically categorized
			result = { priority: 'low' };
		}
	} else {
		result = { priority: 'low' };
	}

	// Apply naming rules if no existing alias/group from filter config
	const namingRules = applyNamingRules(itemName);
	if (!result.alias && namingRules.alias) {
		result.alias = namingRules.alias;
	}
	if (!result.group && namingRules.group) {
		result.group = namingRules.group;
	}

	return result;
}

function isGmOnly(resourceType: string): boolean {
	return GM_ONLY.includes(resourceType);
}

async function ensureRepository() {
	if (fs.existsSync(REPO_DIR)) {
		console.log('5e-database repository already exists, skipping clone...');
		return;
	}

	console.log('Cloning 5e-database repository...');
	execSync(`git clone ${REPO_URL} ${REPO_DIR}`, { stdio: 'inherit' });
}

function loadResourcesForVersion(version: '2014' | '2024'): ResourceEntry[] {
	const versionDir = path.join(REPO_DIR, 'src', version);
	const resources: ResourceEntry[] = [];

	if (!fs.existsSync(versionDir)) {
		console.warn(`Version directory ${version} not found`);
		return resources;
	}

	// Get all JSON files in the version directory
	const fileNames = fs.readdirSync(versionDir).filter((file) => file.endsWith('.json'));

	for (const resourceType of RESOURCE_TYPES) {
		const fileName = `5e-SRD-${resourceType}.json`;

		if (fileNames.indexOf(fileName) === -1) {
			// expected for resources which exist in only one version
			console.log(`${fileName} not found, skipping`);
			continue;
		}
		if (NEEDS_FILTER.includes(resourceType) && !FILTER_CONFIG[resourceType]) {
			console.log(`${resourceType} missing from FILTER_CONFIG, skipping`);
			continue;
		}

		try {
			const data = JSON.parse(fs.readFileSync(path.join(versionDir, fileName), 'utf8'));
			let newResources = [];

			for (const item of data) {
				// Skip NEEDS_FILTER if not in FILTER_CONFIG
				if (NEEDS_FILTER.includes(resourceType) && !FILTER_CONFIG[resourceType]?.[item.name]) {
					continue;
				}
				const filteredData = getFilteredData(resourceType, item.name);
				const resource: ResourceEntry = {
					name: item.name,
					type: resourceType,
					priority: filteredData.priority,
					gm_only: isGmOnly(resourceType),
					data: item
				};

				if (filteredData.alias) resource.alias = filteredData.alias;
				if (filteredData.group) resource.group = filteredData.group;

				newResources.push(resource);
			}
			console.log(`Loaded ${resourceType}: ${newResources.length} items`);
			resources.push(...newResources);
			newResources = [];
		} catch (error) {
			console.error(`Error loading ${fileName}:`, error);
		}
	}

	return resources;
}

function saveDatabase(resources: ResourceEntry[], version: '2014' | '2024') {
	const outputFile = path.join(DATA_DIR, `dnd-${version}-database.json1`);

	// Convert to JSON1 format (one JSON object per line)
	const json1Content = resources.map((resource) => JSON.stringify(resource)).join('\n');

	fs.writeFileSync(outputFile, json1Content);
	console.log(`Saved ${resources.length} resources to ${outputFile}`);
}

async function main() {
	try {
		await ensureRepository();

		// Process both versions
		for (const version of ['2014', '2024'] as const) {
			console.log(`\nProcessing ${version} version...`);
			const resources = loadResourcesForVersion(version);
			saveDatabase(resources, version);
		}

		console.log('\nD&D database generation complete!');
		console.log(`Output files:`);
		console.log(`- ${DATA_DIR}/dnd-2014-database.json1`);
		console.log(`- ${DATA_DIR}/dnd-2024-database.json1`);
	} catch (error) {
		console.error('Error generating D&D database:', error);
		process.exit(1);
	}
}

if (import.meta.main) {
	main();
}
