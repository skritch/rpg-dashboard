import type { MessageMetadata, WSServerMessage } from '$lib/shared/messages';
import { getClientSettings } from './settings.svelte';

// $states are wrapped in objects per https://svelte.dev/docs/svelte/$state#Passing-state-across-modules
export type WSStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
export const wsStatus = $state<{ status: WSStatus }>({ status: 'disconnected' });
export const wsMessages = $state<{ messages: (WSServerMessage & MessageMetadata)[] }>({
	messages: []
});
export const client = $state<{ clientId: string | null }>({ clientId: null });
export type ServiceStatus = 'unknown' | 'available' | 'error';
export const serviceStatus = $state<{ status: ServiceStatus }>({ status: 'unknown' });

export async function checkServiceAvailability() {
	try {
		const response = await fetch('/api/service-check', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ settings: getClientSettings() })
		});

		if (response.ok) {
			const result = await response.json();
			serviceStatus.status = result.status;
			return result.isAvailable;
		}
	} catch (error) {
		console.log('Could not check service availability:', error);
	}
	serviceStatus.status = 'error';
	return false;
}
