import { DEFAULT_SETTINGS, type ClientSettings } from '../shared/settings.js';
import type { AudioPipeline } from './streaming/AudioPipeline.js';
import { createTranscriptionService } from './transcription/TranscriptionService.js';

export interface AppState {
	clients: Record<string, { settings: ClientSettings; pipeline?: AudioPipeline }>;
}

// Global state store (in-memory, will be replaced with DB)
export const appState: AppState = {
	clients: {}
};

// TODO: anything other than this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function updateSettings(clientId: string, settingsUpdates: Record<string, any>) {
	// Validate transcriptionService if provided
	if (
		settingsUpdates.transcriptionService &&
		!['mock', 'whisper'].includes(settingsUpdates.transcriptionService)
	) {
		throw new Error('Invalid transcriptionService value');
	}

	if (!appState.clients[clientId]) {
		appState.clients[clientId] = { settings: DEFAULT_SETTINGS as ClientSettings };
	}
	const current = appState.clients[clientId].settings;
	const updated = {
		...current,
		...(settingsUpdates as ClientSettings) // todo: zod validate
	};
	appState.clients[clientId].settings = updated;

	if (
		appState.clients[clientId].pipeline !== undefined &&
		settingsUpdates.transcriptionService !== current.transcriptionService
	) {
		console.log(
			`Updating transcription backend to "${settingsUpdates.transcriptionService}" for client #${clientId}`
		);
		const newService = createTranscriptionService(updated);
		appState.clients[clientId].pipeline.setTranscriptionService(newService);
	}
	return updated;
}
