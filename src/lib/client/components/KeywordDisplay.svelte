<script lang="ts">
	import { wsMessages } from '$lib/client/stores/ws.svelte';
	import type { KeywordMessage, MessageMetadata } from '$lib/shared/messages';
	import { SvelteMap } from 'svelte/reactivity';

	// Store for keyword cutoff similar to transcriptCutoff
	let keywordCutoff = $state<Date | null>(null);

	// Derive keyword messages directly from the store
	const keywordMessages = $derived(
		wsMessages.messages
			.filter(
				(msg) =>
					msg.type === 'keyword_match' && (keywordCutoff === null || msg.timestamp > keywordCutoff)
			)
			.map((msg) => msg as KeywordMessage & MessageMetadata)
	);

	// Flatten all keywords from all messages, deduplicate by keyword name, sort by recency
	const allKeywords = $derived.by(() => {
		const keywordMap = new SvelteMap<
			string,
			KeywordMessage['keywords'][number] & { timestamp: Date }
		>();

		keywordMessages.forEach((msg) => {
			msg.keywords.forEach((kw) => {
				const existingKeyword = keywordMap.get(kw.keyword);
				if (!existingKeyword || msg.timestamp > existingKeyword.timestamp) {
					keywordMap.set(kw.keyword, {
						...kw,
						timestamp: msg.timestamp
					});
				}
			});
		});

		return Array.from(keywordMap.values()).sort(
			(a, b) => b.timestamp.getTime() - a.timestamp.getTime()
		);
	});

	function clearKeywords() {
		keywordCutoff = new Date();
	}

	// Track expanded state for each keyword
	const expandedStates = $state<Record<string, boolean>>({});

	function toggleExpanded(keyword: string, index: number) {
		const key = `${keyword}-${index}`;
		expandedStates[key] = !expandedStates[key];
	}

	function getExpandedState(keyword: string, index: number): boolean {
		const key = `${keyword}-${index}`;
		return expandedStates[key] ?? false;
	}
</script>

<div class="card">
	<div class="card-header">
		<h2>Keyword Matches</h2>
		<a
			href="#clearKeywords"
			onclick={clearKeywords}
			class="clear-button text-sm {allKeywords.length === 0 ? 'disabled' : ''}"
		>
			(clear)
		</a>
	</div>

	{#if allKeywords.length === 0}
		<div class="text-muted py-8 text-center">
			<p>No keyword matches yet. Keywords will appear here when detected in transcriptions.</p>
		</div>
	{:else}
		<div class="message-box max-h-96 space-y-2">
			{#each allKeywords as keyword, i (keyword.keyword)}
				<div class="rounded-lg border border-gray-200">
					<button
						class="w-full p-4 text-left hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:outline-none focus:ring-inset"
						onclick={() => toggleExpanded(keyword.keyword, i)}
					>
						<div class="flex items-center justify-between">
							<div class="flex items-center gap-2">
								<span class="text-body font-medium">{keyword.name}</span>
								<span class="text-muted rounded bg-gray-100 px-2 py-1 text-sm">
									{keyword.type}
								</span>
							</div>
							<div class="flex items-center gap-2">
								<span class="text-muted text-xs">
									{keyword.timestamp.toLocaleTimeString()}
								</span>
								<span class="text-muted">
									{getExpandedState(keyword.keyword, i) ? '▼' : '▶'}
								</span>
							</div>
						</div>
					</button>

					{#if getExpandedState(keyword.keyword, i)}
						<div class="border-t border-gray-200 bg-gray-50 p-4">
							<div class="space-y-2">
								<div>
									<span class="text-muted text-sm font-medium">Keyword:</span>
									<span class="text-body ml-2 text-sm">{keyword.keyword}</span>
								</div>
								<div>
									<span class="text-muted text-sm font-medium">Type:</span>
									<span class="text-body ml-2 text-sm">{keyword.type}</span>
								</div>
								{#if keyword.group}
									<div>
										<span class="text-muted text-sm font-medium">Group:</span>
										<span class="text-body ml-2 text-sm">{keyword.group}</span>
									</div>
								{/if}
								{#if keyword.data && keyword.data.desc}
									<div>
										<span class="text-muted text-sm font-medium">Description:</span>
										<div class="text-body mt-1 ml-2 text-sm">
											{#if Array.isArray(keyword.data.desc)}
												{#each keyword.data.desc as desc, i (i)}
													<p class="mb-1">{desc}</p>
												{/each}
											{:else}
												<p>{keyword.data.desc}</p>
											{/if}
										</div>
									</div>
								{/if}
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
