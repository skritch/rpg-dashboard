// Shared types for client settings between frontend and backend

export interface ClientSettings {
	transcriptionService: 'mock' | 'whisper';
	whisperApiUrl: string;
	llmProvider?: 'openai';
	llmApiUrl?: string;
	llmModel?: string;
	gameVersion: 'dnd-2014' | 'dnd-2024';
	// Add more settings here as needed
}

export const DEFAULT_SETTINGS = {
	transcriptionService: 'mock',
	whisperApiUrl: 'http://localhost:8000',
	llmProvider: 'openai',
	llmApiUrl: 'https://api.openai.com/v1',
	llmModel: 'gpt-3.5-turbo',
	gameVersion: 'dnd-2014'
};
