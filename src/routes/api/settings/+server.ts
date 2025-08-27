import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { appState, updateSettings } from '$lib/server/state.js';

export const GET: RequestHandler = async ({ url }) => {
	const clientId = url.searchParams.get('clientId');

	if (!clientId) {
		return json({ error: 'clientId parameter is required' }, { status: 400 });
	}

	const settings = (appState.clients[Number(clientId)] ?? {}).settings ?? {};
	return json(settings);
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { clientId, ...settingsUpdates } = body;

		if (!clientId) {
			return json({ error: 'clientId is required' }, { status: 400 });
		}

		const updated = updateSettings(clientId, settingsUpdates);
		return json(updated);
	} catch (error) {
		console.log(error);
		return json({ error: 'Invalid request body' }, { status: 400 });
	}
};
