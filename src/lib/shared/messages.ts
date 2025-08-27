import { z } from 'zod';

// Zod schemas (source of truth)

const BaseMessageSchema = z.object({
	type: z.string()
});

const TextMessageSchema = BaseMessageSchema.extend({
	type: z.literal('text'),
	message: z.string()
});

const MicrophoneMessageSchema = BaseMessageSchema.extend({
	type: z.literal('microphone'),
	action: z.enum(['start', 'stop']),
	sampleRate: z.number().optional(),
	channels: z.number().optional(),
	format: z.string().optional()
});

const TranscriptionSegmentSchema = z.object({
	text: z.string(),
	startMs: z.number(),
	endMs: z.number(),
	confidence: z.number().optional()
});

const TranscriptDeltaMessageSchema = BaseMessageSchema.extend({
	type: z.literal('transcription'),
	responseToMessageId: z.string(), // todo: put this in meta
	delta: z.object({
		segments: z.array(TranscriptionSegmentSchema),
		overwrite: z.number()
	}),
	text: z.string()
});

const TranscriptionErrorMessageSchema = BaseMessageSchema.extend({
	type: z.literal('transcription_error'),
	error: z.string(),
	responseToMessageId: z.string() // todo: put this in meta
});

const KeywordMessageSchema = BaseMessageSchema.extend({
	type: z.literal('keyword_match'),
	keywords: z.array(
		z.object({
			keyword: z.string(),
			name: z.string(),
			index_name: z.string().optional(),
			matchType: z.enum(['row', 'group']),
			matchIndex: z.number(),
			type: z.string(),
			group: z.string().optional(),
			data: z.record(z.string(), z.unknown())
		})
	),
	text: z.string(),
	meta: z.object({
		id: z.string(),
		index: z.number(),
		positionMs: z.number()
	})
});

const AudioReceivedSchema = BaseMessageSchema.extend({
	type: z.literal('audio_received'),
	message: z.string(),
	responseToMessageId: z.string() // todo: put this in meta
});

const ClientConnectedSchema = BaseMessageSchema.extend({
	type: z.literal('client_connected'),
	clientId: z.string(),
	message: z.string()
});

const MessageMetadataSchema = z.object({
	messageId: z.string(),
	timestamp: z.string().transform((val) => new Date(val)) // z.date()
});

export const WSServerMessageSchema = z.discriminatedUnion('type', [
	TextMessageSchema,
	TranscriptDeltaMessageSchema,
	TranscriptionErrorMessageSchema,
	KeywordMessageSchema,
	AudioReceivedSchema,
	ClientConnectedSchema
]);
export const WSServerMessageWithMetaSchema = z.intersection(
	WSServerMessageSchema,
	MessageMetadataSchema
);

export const WSClientMessageSchema = z.discriminatedUnion('type', [
	TextMessageSchema,
	MicrophoneMessageSchema
]);
export const WSClientMessageWithMetaSchema = z.intersection(
	WSClientMessageSchema,
	MessageMetadataSchema
);

export type TranscriptionSegment = z.infer<typeof TranscriptionSegmentSchema>;
export type BaseMessage = z.infer<typeof BaseMessageSchema>;
export type TextMessage = z.infer<typeof TextMessageSchema>;
export type MicrophoneMessage = z.infer<typeof MicrophoneMessageSchema>;
export type TranscriptDeltaMessage = z.infer<typeof TranscriptDeltaMessageSchema>;
export type TranscriptionErrorMessage = z.infer<typeof TranscriptionErrorMessageSchema>;
export type KeywordMessage = z.infer<typeof KeywordMessageSchema>;
export type AudioReceived = z.infer<typeof AudioReceivedSchema>;
export type ClientConnected = z.infer<typeof ClientConnectedSchema>;
export type WSServerMessage = z.infer<typeof WSServerMessageSchema>;
export type WSClientMessage = z.infer<typeof WSClientMessageSchema>;
export type WSServerMessageWithMeta = z.infer<typeof WSServerMessageWithMetaSchema>;
export type WSClientMessageWithMeta = z.infer<typeof WSClientMessageWithMetaSchema>;
export type MessageMetadata = z.infer<typeof MessageMetadataSchema>;

export function parseWSServerMessage(data: unknown): WSServerMessageWithMeta {
	return WSServerMessageWithMetaSchema.parse(data);
}

export function parseWSClientMessage(data: unknown): WSClientMessageWithMeta {
	return WSClientMessageWithMetaSchema.parse(data);
}
