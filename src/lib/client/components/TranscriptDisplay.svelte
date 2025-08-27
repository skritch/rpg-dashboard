<script lang="ts">
	import { wsMessages } from '$lib/client/stores/ws.svelte';
	import type {
		TranscriptionErrorMessage,
		TranscriptionSegment,
		TranscriptDeltaMessage,
		MessageMetadata
	} from '$lib/shared/messages';
	import TranscriptSegments from './TranscriptSegments.svelte';
	import { updateTranscript } from '$lib/shared/transcripts';

	// Temp home for this store, it should live in /stores.
	let transcriptCutoff = $state<Date | null>(null);

	// Derive transcription messages directly from the store
	const segments = $derived(
		wsMessages.messages
			.filter(
				(msg) =>
					msg.type === 'transcription' &&
					(transcriptCutoff === null || msg.timestamp > transcriptCutoff) // startTime?
			)
			.map((msg) => msg as TranscriptDeltaMessage)
			.filter((msg) => msg.text.trim() !== '')
			// Merge transcripts into a single one.
			.reduce<TranscriptionSegment[]>((acc, cur) => updateTranscript(acc, cur.delta), [])
	);

	// Check if the latest transcription response is an error
	const latestError: (TranscriptionErrorMessage & MessageMetadata) | null = $derived.by(() => {
		// Find the most recent transcription or transcription_error message
		const transcriptionResponses = wsMessages.messages
			.filter(
				(msg) =>
					(msg.type === 'transcription' || msg.type === 'transcription_error') &&
					(transcriptCutoff === null || msg.timestamp > transcriptCutoff)
			)
			.slice(-1); // Get the latest one

		const latestResponse = transcriptionResponses[0];
		if (latestResponse && latestResponse.type === 'transcription_error') {
			return latestResponse;
		}

		return null;
	});

	function clearTranscriptions() {
		transcriptCutoff = new Date();
	}
</script>

<div class="card">
	<div class="card-header">
		<h2>Live Transcript</h2>
		<a
			href="#clearTranscript"
			onclick={clearTranscriptions}
			class="clear-button text-sm {segments.length === 0 && latestError === null ? 'disabled' : ''}"
		>
			(clear)
		</a>
	</div>

	{#if latestError}
		<div class="mb-4">
			<div class="alert alert-danger">
				<div class="flex items-start justify-between">
					<div>
						<strong>Transcription Error:</strong>
						<p class="mt-1 text-sm">{latestError.error}</p>
					</div>
					<span class="text-muted text-xs">{latestError.timestamp.toLocaleTimeString()}</span>
				</div>
			</div>
		</div>
	{/if}

	{#if segments.length === 0}
		<div class="text-muted py-8 text-center">
			<p>No transcript yet. Start recording audio to see live transcripts here.</p>
		</div>
	{:else}
		<TranscriptSegments {segments} />

		<!-- <div class="message-box max-h-96 space-y-4">
			{#each segments as transcription, i}
				<div
					class="rounded-lg border border-gray-200 p-4"
					use:scrollIntoView={i === segments.length - 1}
				>
					<div class="mb-2 flex items-start justify-between">
						<span class="text-success text-sm font-medium"> Transcript </span>
						<span class="text-muted text-xs"
							>{new Date(transcription.startTime).toLocaleTimeString()}</span
						>
					</div>

					{#if transcription.delta.segments && transcription.delta.segments.length > 1}
						<TranscriptSegments segments={transcription.delta.segments} />
					{:else}
						<p class="text-body">{transcription.text}</p>
					{/if}
				</div>
			{/each}
		</div> -->
	{/if}
</div>
