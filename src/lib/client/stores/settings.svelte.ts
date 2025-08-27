import { DEFAULT_SETTINGS, type ClientSettings } from '$lib/shared/settings';
import { client, wsStatus } from './ws.svelte';

// All reassignment of $states must go through functions in this module
// However, other modules can update the inner object values reactively.
export const clientSettings = $state<ClientSettings>(DEFAULT_SETTINGS as ClientSettings);
let lastSyncedSettings = $state<ClientSettings | null>(null);

export function getClientSettings() {
	return clientSettings;
}
export function setClientSettings(newSettings: ClientSettings) {
	Object.assign(clientSettings, newSettings);
}

export async function syncSettingsToServer() {
	if (!client.clientId || wsStatus.status !== 'connected') {
		return false;
	}

	const response = await fetch('/api/settings', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			clientId: client.clientId,
			...clientSettings
		})
	});

	if (response.ok) {
		lastSyncedSettings = clientSettings;
		return true;
	}
	return false;
}

// Check if settings need syncing
export function needsSync(): boolean {
	if (!lastSyncedSettings) return true;
	return lastSyncedSettings !== clientSettings;
}
