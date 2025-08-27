<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import SettingsModal from '$lib/client/components/SettingsModal.svelte';

	let { children } = $props();
	let showSettingsModal = $state(false);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=Berkshire+Swash&family=Open+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,300;1,400;1,500;1,600;1,700;1,800&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<header class="flex items-center justify-between bg-gray-800 p-4">
	<h1 class="text-xl" style="color: #F5F5F0;">RPG Dashboard</h1>
	<button
		class="rounded bg-gray-600 px-3 py-1 text-white hover:bg-gray-500"
		onclick={() => (showSettingsModal = true)}
	>
		Settings
	</button>
</header>

<main class="container mx-auto p-4">
	{@render children?.()}
</main>

{#if showSettingsModal}
	<SettingsModal bind:show={showSettingsModal} />
{/if}
