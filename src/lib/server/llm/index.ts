export type { LLMMessage, LLMResponse, ChatOptions, LLMConfig } from './LLMService.js';
export { LLMService } from './LLMService.js';

import { LLMService } from './LLMService.js';
import type { LLMConfig } from './LLMService.js';

export function createLLMService(config: LLMConfig): LLMService {
	return new LLMService(config);
}

export function createLLMServiceFromEnv(overrides: Partial<LLMConfig> = {}): LLMService {
	const provider = process.env.LLM_PROVIDER?.toLowerCase();

	if (!provider) {
		throw new Error('LLM_PROVIDER environment variable is required');
	}

	const providerUpperCase = provider.toUpperCase();
	const baseUrlEnvVar = `${providerUpperCase}_URL`;
	const apiKeyEnvVar = `${providerUpperCase}_API_KEY`;

	const baseUrl = process.env[baseUrlEnvVar];
	const apiKey = process.env[apiKeyEnvVar];

	if (!baseUrl) {
		throw new Error(`${baseUrlEnvVar} environment variable is required for provider "${provider}"`);
	}

	if (!apiKey) {
		throw new Error(`${apiKeyEnvVar} environment variable is required for provider "${provider}"`);
	}

	const config: LLMConfig = {
		baseUrl,
		apiKey,
		...overrides
	};

	return new LLMService(config);
}
