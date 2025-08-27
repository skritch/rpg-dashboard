import ReconnectingWebSocket from 'reconnecting-websocket';
import { v4 as uuidv4 } from 'uuid';
import { parseWSServerMessage, type WSClientMessage } from '$lib/shared/messages';
import { wsStatus, client, wsMessages } from '$lib/client/stores/ws.svelte';
import { clientSettings } from './stores/settings.svelte';

// TODO: Should these be properties of the wsClient?
let rws: ReconnectingWebSocket | null = null;
let onDisconnectCallback: (() => void) | null = null;
const wsBaseUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

// Not really a store, maybe it shouldn't live here.
export const wsClient = {
	async connect() {
		if (rws) {
			// reset the connection.
			rws.close();
			rws = null;
		}

		wsStatus.status = 'connecting';

		if (client.clientId === null) {
			// Note: client determines its own UUID.
			client.clientId = uuidv4();
		}

		const wsUrl = new URL(wsBaseUrl);
		wsUrl.searchParams.set('client_id', client.clientId!);
		wsUrl.searchParams.set('transcription_servicve', clientSettings.transcriptionService);

		rws = new ReconnectingWebSocket(wsUrl.toString());
		rws.binaryType = 'arraybuffer'; // Seems good.

		rws.addEventListener('open', () => {
			console.log('WebSocket connected');
			wsStatus.status = 'connected';
		});

		rws.addEventListener('message', (event) => {
			console.log('WebSocket message received:', event.data);

			try {
				const rawData = JSON.parse(event.data);
				const validatedMessage = parseWSServerMessage(rawData);

				// Store clientId when we receive client_connected message
				if (validatedMessage.type === 'client_connected') {
					client.clientId = validatedMessage.clientId;
				}

				wsMessages.messages.push(validatedMessage);
			} catch (error) {
				console.error('Failed to parse WebSocket message:', error);
				console.log('Raw message data:', event.data);
			}
		});

		rws.addEventListener('close', () => {
			console.log('WebSocket disconnected');
			wsStatus.status = 'disconnected';
			if (onDisconnectCallback) {
				onDisconnectCallback();
			}
		});

		rws.addEventListener('error', (error) => {
			console.error('WebSocket error:', error);
			wsStatus.status = 'error';
		});
	},

	disconnect() {
		if (rws) {
			rws.close();
			rws = null;
			wsStatus.status = 'disconnected';
		}
	},

	send(message: WSClientMessage) {
		if (rws && rws.readyState === WebSocket.OPEN) {
			rws.send(
				JSON.stringify({
					...message,
					timestamp: new Date(),
					messageId: uuidv4()
				})
			);
			return true;
		}
		// TODO: enQ or something.
		return false;
	},

	sendBinary(data: ArrayBuffer | Blob) {
		if (rws && rws.readyState === WebSocket.OPEN) {
			rws.send(data);
			return true;
		}
		return false;
	},

	setOnDisconnect(callback: () => void) {
		onDisconnectCallback = callback;
	}
};
