import type { HandleClientError } from '@sveltejs/kit';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const handleError: HandleClientError = async ({ error, event, status, message }) => {
	console.log(error);

	return { message: message };
};
