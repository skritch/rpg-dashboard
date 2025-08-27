import { isValidUrl, getTimestamp } from '$lib/shared/utils';

export interface LLMMessage {
	role: 'system' | 'user' | 'assistant';
	content:
		| string
		| Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

export interface LLMResponse {
	id: string;
	object: string;
	created: number;
	model: string;
	choices: Array<{
		index: number;
		message: {
			role: string;
			content: string;
		};
		finish_reason: string;
	}>;
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export interface ChatOptions {
	model?: string;
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
}

export type LLMConfig = {
	baseUrl: string;
	apiKey?: string;
	defaultModel?: string;
	defaultTemperature?: number;
	defaultMaxTokens?: number;
};
const defaultCOnfig = {
	baseUrl: 'http://localhost:11434',
	defaultModel: 'llama-3-8b',
	defaultTemperature: 0.7,
	defaultMaxTokens: 1000
};

export class LLMService {
	private config: LLMConfig;
	private apiKey: string;
	private baseUrl: string;

	constructor(config: Partial<LLMConfig> = {}) {
		this.config = {
			...defaultCOnfig,
			...config
		};

		this.apiKey = this.config.apiKey || process.env.LLM_API_KEY || '';
		this.baseUrl = this.config.baseUrl || process.env.LLM_BASE_URL || '';

		if (!this.baseUrl) {
			throw new Error(
				'Base URL is required. Set LLM_BASE_URL environment variable or provide baseUrl in config.'
			);
		}

		if (!isValidUrl(this.baseUrl)) {
			throw new Error(`Invalid baseUrl: "${this.baseUrl}". Must be a valid HTTP or HTTPS URL.`);
		}
	}

	async chat(messages: LLMMessage[], options: ChatOptions = {}): Promise<LLMResponse> {
		const requestBody = {
			model: options.model || this.config.defaultModel,
			messages,
			temperature: options.temperature ?? this.config.defaultTemperature,
			max_tokens: options.max_tokens ?? this.config.defaultMaxTokens,
			stream: options.stream ?? false
		};

		const headers: HeadersInit = {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${this.apiKey}`
		};

		console.log(
			`[${getTimestamp()}] Calling ${this.baseUrl}/chat/completions with model ${requestBody.model}`
		);

		const response = await fetch(`${this.baseUrl}/chat/completions`, {
			method: 'POST',
			headers,
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			let errorDetails = '';
			try {
				const errorText = await response.text();
				errorDetails = ` - ${errorText}`;
			} catch {
				// Ignore if we can't read error body
			}
			throw new Error(
				`[${getTimestamp()}] LLM API error: ${response.status} ${response.statusText}${errorDetails}`
			);
		}

		const result = (await response.json()) as LLMResponse;
		return result;
	}

	async isAvailable(): Promise<boolean> {
		try {
			const testMessages: LLMMessage[] = [{ role: 'user', content: 'test' }];

			const response = await fetch(`${this.baseUrl}/chat/completions`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.apiKey}`
				},
				body: JSON.stringify({
					model: this.config.defaultModel,
					messages: testMessages,
					max_tokens: 1
				})
			});

			return response.ok;
		} catch {
			return false;
		}
	}
}
