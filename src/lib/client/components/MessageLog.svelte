<script lang="ts">
	import { wsMessages } from '$lib/client/stores/ws.svelte';
	import type {
		WSServerMessage,
		TranscriptionErrorMessage,
		MessageMetadata
	} from '$lib/shared/messages';
	import { scrollIntoView } from '$lib/client/utils/dom';

	function clearMessages() {
		wsMessages.messages = [];
	}

	function getMessageDisplayText(message: WSServerMessage & MessageMetadata): string {
		switch (message.type) {
			case 'transcription':
				if (message.delta.segments && message.delta.segments.length > 1) {
					return message.delta.segments.map((s) => s.text).join(' ');
				}
				return message.text;
			case 'transcription_error':
				return (message as TranscriptionErrorMessage).error;
			case 'keyword_match':
				return message.keywords.map((kwe) => kwe.keyword).join(', ');
			default:
				return message.message || '';
		}
	}

	function getMessageTypeColor(type: string): string {
		switch (type) {
			case 'transcription':
				return 'text-success';
			case 'transcription_error':
				return 'text-danger';
			case 'text':
				return 'text-info';
			default:
				return 'text-muted';
		}
	}
</script>

<div class="card">
	<div class="card-header">
		<h2>Messages</h2>
		<a
			href="#clearMessages"
			onclick={clearMessages}
			class="clear-button text-sm {wsMessages.messages.length === 0 ? 'disabled' : ''}">(clear)</a
		>
	</div>

	<div class="message-box max-h-64 space-y-2">
		{#each wsMessages.messages as message, i (message.messageId)}
			<div class="message-item" use:scrollIntoView={i === wsMessages.messages.length - 1}>
				<div class="flex items-center justify-between">
					<span class="font-medium {getMessageTypeColor(message.type)}">{message.type}</span>
					<span class="text-muted text-xs">
						{message.timestamp.toLocaleTimeString()}
					</span>
				</div>
				<!-- Display transcript segments here? -->
				<p class="text-body mt-1">{getMessageDisplayText(message)}</p>
			</div>
		{:else}
			<p class="text-center text-muted">No messages yet</p>
		{/each}
	</div>
</div>
