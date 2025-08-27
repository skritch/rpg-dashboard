<script lang="ts">
	import { wsStatus } from '$lib/client/stores/ws.svelte';
	import MessageLog from '$lib/client/components/MessageLog.svelte';
	import SendMessage from '$lib/client/components/SendMessage.svelte';
	import ConnectionStatus from '$lib/client/components/ConnectionStatus.svelte';
	import MicrophoneRecording from '$lib/client/components/MicrophoneRecording.svelte';
	import TranscriptDisplay from '$lib/client/components/TranscriptDisplay.svelte';
	import KeywordDisplay from '$lib/client/components/KeywordDisplay.svelte';
</script>

<div class="mx-auto max-w-4xl space-y-6">
	<div class="card">
		<h1 class="text-center text-3xl">Audio Transcription</h1>
	</div>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Left column: Controls and Status -->
		<div class="space-y-6">
			<ConnectionStatus />
			<MicrophoneRecording />
			{#if wsStatus.status === 'connected'}
				<TranscriptDisplay />
				<!-- <SendMessage /> -->
				<MessageLog />
			{/if}
		</div>

		<!-- Right column: Keyword spotting. -->
		<div class="space-y-6">
			{#if wsStatus.status === 'connected'}
				<KeywordDisplay />
			{/if}
		</div>
	</div>
</div>
