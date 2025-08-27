import { AudioWebSocketServer } from '$lib/server/wsServer';

let wsServer: AudioWebSocketServer | null = null;

// Start WebSocket server
wsServer = new AudioWebSocketServer();
wsServer.start(3001);

// Graceful shutdown
process.on('SIGTERM', () => {
	console.log('Received SIGTERM, shutting down WebSocket server...');
	wsServer?.stop();
	process.exit(0);
});

process.on('SIGINT', () => {
	console.log('Received SIGINT, shutting down WebSocket server...');
	wsServer?.stop();
	process.exit(0);
});

export { wsServer };
