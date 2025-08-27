<script lang="ts">
	import { clientSettings, syncSettingsToServer } from '$lib/client/stores/settings.svelte';
	import { client, wsStatus, serviceStatus } from '$lib/client/stores/ws.svelte';

	interface Props {
		show: boolean;
	}
	let { show = $bindable() }: Props = $props();
	let loading = $state(false);

	// Handle save button click
	async function handleSave() {
		loading = true;
		let synced = false;

		if (wsStatus.status === 'connected' && client.clientId !== null) {
			synced = await syncSettingsToServer();
		}
		if (synced) {
			show = false;
		} else {
			// Settings saved locally but not synced
			show = false;
			console.log('Settings saved locally, will sync when connected');
		}
		loading = false;
	}
</script>

{#if show}
	<!-- Modal backdrop -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
		role="button"
		tabindex="0"
		onclick={() => (show = false)}
		onkeydown={(e) => e.key === 'Escape' && (show = false)}
	>
		<!-- Modal content -->
		<div
			class="mx-4 w-full max-w-md rounded-lg bg-white p-6"
			role="dialog"
			aria-labelledby="modal-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.key === 'Escape' && (show = false)}
		>
			<div class="mb-4 flex items-center justify-between">
				<h2 id="modal-title" class="text-xl font-bold">Settings</h2>
				<button class="text-gray-500 hover:text-gray-700" onclick={() => (show = false)}>
					×
				</button>
			</div>

			<div class="space-y-4">
				<div>
					<div class="flex items-center space-x-3">
						<label for="transcription-service" class="text-sm font-medium text-gray-700">
							Transcription Service:
						</label>
						<select
							id="transcription-service"
							bind:value={clientSettings.transcriptionService}
							class="flex-1 appearance-none rounded border border-gray-300 bg-white py-2 pr-8 pl-3 text-sm focus:border-blue-500 focus:outline-none"
						>
							<option value="mock">Test</option>
							<option value="whisper"
								>Whisper ({clientSettings.whisperApiUrl.replace(/^https?:\/\//, '')})</option
							>
						</select>
					</div>

					<!-- Service availability indicator -->
					{#if wsStatus.status === 'connected'}
						<div class="mt-2 flex items-center space-x-2">
							<div
								class="h-2 w-2 rounded-full {serviceStatus.status === 'available'
									? 'bg-green-500'
									: serviceStatus.status === 'error'
										? 'bg-red-500'
										: 'bg-gray-400'}"
							></div>
							<span class="text-xs text-gray-600">
								Service {serviceStatus.status === 'available'
									? 'available.'
									: serviceStatus.status === 'error'
										? 'unavailable.'
										: 'checking...'}
							</span>
						</div>
					{:else}
						<p class="mt-1 text-sm text-orange-600">
							⚠️ Offline - settings will sync when connected
						</p>
					{/if}
				</div>
			</div>

			<div class="mt-6 flex justify-end space-x-2">
				<button
					class="rounded border border-gray-300 px-4 py-2 text-gray-600 hover:bg-gray-50"
					onclick={() => (show = false)}
					disabled={loading}
				>
					Cancel
				</button>
				<button
					class="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
					onclick={handleSave}
					disabled={loading}
				>
					{loading ? 'Saving...' : 'Save'}
				</button>
			</div>
		</div>
	</div>
{/if}
