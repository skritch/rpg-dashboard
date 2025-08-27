import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createTranscriptionService } from '$lib/server/transcription/TranscriptionService.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { settings } = body;

		if (
			!settings ||
			!settings.transcriptionService ||
			!['mock', 'whisper'].includes(settings.transcriptionService)
		) {
			return json({ error: 'Invalid settings or transcriptionService' }, { status: 400 });
		}

		const service = createTranscriptionService(settings);
		const isAvailable = await service.isAvailable();

		return json({
			serviceType: settings.transcriptionService,
			isAvailable,
			status: isAvailable ? 'available' : 'error'
		});
	} catch (error) {
		console.error('Service availability check failed:', error);
		return json(
			{
				error: 'Service check failed',
				status: 'error'
			},
			{ status: 500 }
		);
	}
};
