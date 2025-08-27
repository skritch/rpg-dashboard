import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { WSServerMessage } from '$lib/shared/messages.js';
import { AudioPipeline } from './AudioPipeline.js';
import { appState, updateSettings } from './state.js';
import { parseArrayBuffer } from '$lib/shared/utils.js';
import { DEFAULT_SETTINGS } from '$lib/shared/settings.js';
import http, { Server } from 'http';
import type { Duplex } from 'stream';
import { randomUUID } from 'crypto';

type WSWithMetadata = WebSocket & { clientId?: string };

export class AudioWebSocketServer {
	private http: Server | null = null;
	private wss: WebSocketServer | null = null;
	private clientCount = 0;

	start(port?: number) {
		const wsPort = port || parseInt(process.env.WS_PORT || '3001');

		// We stick our own Node server in front so we can identify the caller in `handleUpgrade`.
		this.http = http.createServer();

		this.wss = new WebSocketServer({ noServer: true });
		this.wss.on('connection', (ws) => this.handleConnect(ws));
		this.wss.on('error', (error: Error) => {
			console.error('WebSocket server error:', error);
		});

		this.http.on('upgrade', this.handleUpgrade);
		this.http.listen(wsPort);
	}

	handleUpgrade = (req: http.IncomingMessage, socket: Duplex, head: Buffer<ArrayBufferLike>) => {
		const url = new URL(req.url!, 'http://dummy'); // dummy base is required?
		const clientId = url.searchParams.get('client_id');
		const transcriptionService = url.searchParams.get('transcription_service');

		if (!clientId) {
			console.log('401 no client_id url param');
			socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
			socket.destroy();
			return;
		}
		if (transcriptionService) {
			updateSettings(clientId, { transcriptionService: transcriptionService });
		}

		this.wss!.handleUpgrade(req, socket, head, (ws: WSWithMetadata) => {
			ws.clientId = clientId;
			this.wss!.emit('connection', ws, req);
		});
	};

	stop() {
		console.log('Stopping WebSocket server');
		this.http?.close();
		this.wss?.close();
		this.http = null;
		this.wss = null;
		this.clientCount = 0;
	}

	private handleConnect(ws: WSWithMetadata) {
		this.clientCount++;
		const clientId = ws.clientId!;
		const settings = appState.clients[clientId]?.settings || DEFAULT_SETTINGS;
		const pipeline = AudioPipeline.fromSettings(
			new Date().toISOString().slice(0, 19), // resolution of seconds
			settings
		);
		appState.clients[clientId] = {
			pipeline: pipeline,
			settings: settings
		};

		console.log(`Client #${clientId} connected. Total clients: ${this.clientCount}`);

		ws.on('message', async (data: WebSocket.RawData, isBinary: boolean) => {
			if (isBinary) {
				pipeline.input$.next(parseArrayBuffer(data));
			} else {
				const message = data.toString();
				console.log(`Client #${clientId}: Received message:`, message);
			}
		});

		ws.on('close', () => {
			this.clientCount--;
			pipeline.destroy();
			delete appState.clients[clientId].pipeline;
			console.log(`Client #${ws.clientId} disconnected. Total clients: ${this.clientCount}`);
		});

		ws.on('error', (error: Error) => {
			console.error('WebSocket error:', error);
		});

		// Send client connection message with clientId
		this.sendMessage(ws, {
			type: 'client_connected',
			clientId: clientId.toString(),
			message: 'Connected to audio streaming server'
		});

		// Ack the parsed segments
		pipeline.audioSegments$.forEach((seg) => {
			console.log(
				`Client #${ws.clientId}: Received binary audio message ${seg.id}: ${seg.durationMs.toFixed(3)} ms`
			);
			this.sendMessage(ws, {
				type: 'audio_received',
				message: `Received ${seg.pcmData.byteLength} bytes of audio data`,
				responseToMessageId: seg.id
			});
		});

		pipeline.deltaMessage$.forEach((message) => {
			this.sendMessage(ws, message);
		});
		pipeline.transcriptionErrorMessages.forEach((message) => {
			this.sendMessage(ws, message);
		});
		pipeline.keywordMessages$.forEach((message) => {
			this.sendMessage(ws, message);
		});
	}

	private sendMessage(ws: WebSocket, m: WSServerMessage) {
		ws.send(
			JSON.stringify({
				...m,
				timestamp: new Date(),
				messageId: randomUUID()
			})
		);
	}
}
