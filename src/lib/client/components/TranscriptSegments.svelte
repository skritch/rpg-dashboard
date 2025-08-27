<script lang="ts">
	import type { TranscriptionSegment } from '$lib/shared/messages';

	interface Props {
		segments: TranscriptionSegment[];
	}

	let { segments }: Props = $props();

	function formatSegmentTime(ms: number): string {
		const seconds = ms / 1000;
		if (seconds < 60) {
			return seconds.toFixed(1);
		}
		const mins = Math.floor(seconds / 60);
		const remainingSecs = (seconds % 60).toFixed(1);
		return `${mins}:${remainingSecs.padStart(4, '0')}`;
	}
</script>

<div class="space-y-2">
	{#each segments as segment (segment.startMs)}
		<div class="grid grid-cols-[auto_1fr_auto] gap-3 text-sm">
			<span class="text-muted font-mono text-xs whitespace-nowrap">
				{formatSegmentTime(segment.startMs)}-{formatSegmentTime(segment.endMs)}
			</span>
			<span class="text-body min-w-0">{segment.text}</span>
			{#if segment.confidence !== undefined}
				<span class="text-muted text-xs whitespace-nowrap">
					{Math.round(segment.confidence * 100)}%
				</span>
			{/if}
		</div>
	{/each}
</div>
