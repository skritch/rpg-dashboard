<script lang="ts">
	import { wsStatus, serviceStatus } from '$lib/client/stores/ws.svelte';
	import { AudioCapture } from '$lib/client/AudioCapture';
	import { onMount, onDestroy } from 'svelte';
	import { wsClient } from '$lib/client/wsClient';

	let isRecording = $state(false);
	let micPermissionGranted = $state(false);
	let errMessage = $state('');

	const audioCapture = new AudioCapture(
		(audioData) => {
			wsClient.sendBinary(audioData);
		},
		(error) => {
			errMessage = error;
		}
	);

	async function startRecording() {
		try {
			errMessage = '';

			// Check if we need permission first
			if (!micPermissionGranted) {
				await audioCapture.requestPermission();
				micPermissionGranted = audioCapture.hasPermission;

				if (!micPermissionGranted) {
					errMessage = 'Microphone access denied';
					return;
				}
			}

			// Start recording
			await audioCapture.startCapture();
			isRecording = audioCapture.isRecording;

			wsClient.send({
				type: 'microphone',
				action: 'start',
				...audioCapture.config
			});
		} catch (error) {
			console.error('startRecording failed:', error);
			isRecording = false;
			errMessage = error instanceof Error ? error.message : 'Failed to start recording';
		}
	}

	function stopMicCapture() {
		audioCapture.stopCapture();
		isRecording = audioCapture.isRecording;

		wsClient.send({
			type: 'microphone',
			action: 'stop'
		});
	}

	// Check microphone permission on component mount
	onMount(async () => {
		await audioCapture.checkExistingPermission();
		micPermissionGranted = audioCapture.hasPermission;
	});

	wsClient.setOnDisconnect(() => {
		if (isRecording) {
			console.log('Connection lost, stopping recording');
			stopMicCapture();
		}
	});

	onDestroy(() => {
		audioCapture.destroy();
	});
</script>

<div class="card">
	<div class="card-header flex items-center justify-between">
		<h2>Microphone</h2>
		{#if isRecording}
			<div class="text-accent flex items-center space-x-2">
				<div class="h-2 w-2 animate-pulse rounded-full bg-red-600"></div>
				<span class="text-sm font-medium">Recording...</span>
			</div>
		{/if}
	</div>

	<div class="space-y-3">
		<div class="flex space-x-3">
			<button
				onclick={startRecording}
				disabled={isRecording ||
					wsStatus.status !== 'connected' ||
					serviceStatus.status === 'error'}
				class="btn-base btn-primary flex-1"
			>
				Start Recording
			</button>

			<button onclick={stopMicCapture} disabled={!isRecording} class="btn-base btn-danger flex-1">
				Stop Recording
			</button>
		</div>

		{#if wsStatus.status !== 'connected'}
			<p class="text-warning text-sm">Connect to server to start recording.</p>
		{:else if errMessage}
			<div class="alert alert-danger">
				{errMessage}
			</div>
		{:else if serviceStatus.status === 'error'}
			<div class="alert alert-danger">Transcription service unavailable, check settings.</div>
		{/if}
	</div>
</div>
