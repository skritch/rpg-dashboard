<script lang="ts">
	import { checkServiceAvailability, client, wsStatus } from '$lib/client/stores/ws.svelte';
	import { wsClient } from '$lib/client/wsClient';
	import { needsSync, syncSettingsToServer } from '../stores/settings.svelte';

	// TODO: behavior of this component around ws disconnections is a little weird.
	// e.g. shutting off backend and restarting. Not sure if the issue is here or in wsClient.
	// Should error rather than giving "disconnected" if an explicit attempt to connect fails.

	let statusColor = $derived(
		{
			disconnected: 'bg-gray-500',
			connecting: 'bg-yellow-500',
			connected: 'bg-green-500',
			error: 'bg-red-500'
		}[wsStatus.status]
	);

	let statusText = $derived(
		{
			disconnected: 'Disconnected',
			connecting: 'Connecting...',
			connected: 'Connected',
			error: 'Connection Error'
		}[wsStatus.status]
	);

	async function connectWebSocket() {
		await wsClient.connect();
	}

	function disconnectWebSocket() {
		wsClient.disconnect();
	}

	// Whenever connection status or clientId changes, see if we need to sync settings
	// This does not react to the value of `needsSync`! If we need that, create some
	// derived state.
	// This has to be in a component, for Reasons.
	$effect(() => {
		if (wsStatus.status === 'connected' && client.clientId !== null && needsSync()) {
			syncSettingsToServer().then(() => {
				// Check service availability after loading settings
				checkServiceAvailability();
			});
		}
	});
</script>

<div class="card">
	<div class="card-header"><h2 class="">Connection Status</h2></div>
	<div class="flex items-center space-x-3">
		<div class="h-3 w-3 rounded-full {statusColor}"></div>
		<span class="text-sm font-medium">{statusText}</span>
	</div>

	<div class="mt-4 flex space-x-2">
		{#if wsStatus.status === 'disconnected' || wsStatus.status === 'error'}
			<button onclick={connectWebSocket} class="btn-base btn-secondary flex-1">
				Connect to Server
			</button>
		{/if}

		{#if wsStatus.status === 'connected'}
			<button onclick={disconnectWebSocket} class="btn-base btn-neutral flex-1">
				Disconnect
			</button>
		{/if}
	</div>
</div>
