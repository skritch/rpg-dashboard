<script lang="ts">
	import { wsClient } from '$lib/client/wsClient';

	let messageText = $state('');

	function sendMessage() {
		if (messageText.trim()) {
			const sent = wsClient.send({
				type: 'text',
				message: 'messageText'
			});
			if (sent) {
				messageText = '';
			} else {
				alert('Not connected to server');
			}
		}
	}
</script>

<div class="card">
	<div class="card-header"><h2>Send Message</h2></div>
	<div class="flex space-x-2">
		<input
			type="text"
			bind:value={messageText}
			onkeydown={(e) => e.key === 'Enter' && sendMessage()}
			placeholder="Type a message..."
			class="input-box"
		/>
		<button onclick={sendMessage} disabled={!messageText.trim()} class="btn-base btn-primary">
			Send
		</button>
	</div>
</div>
