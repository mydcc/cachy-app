<script lang="ts">
	import favicon from '../assets/favicon.svg';
	import { tradeStore } from '../stores/tradeStore';
	import { uiStore } from '../stores/uiStore';
	import { onMount } from 'svelte';

	// Removed Svelte 5 $props() and children destructuring
	// let { children, data } = $props();
    export let data; // Restore standard Svelte 4 data prop

	import '../app.css';

	import { CONSTANTS } from '../lib/constants';

	onMount(() => {
		// The server provides a theme from the cookie.
		// On the client, we prioritize localStorage as it might be more up-to-date
		// if the cookie failed to set for any reason.
		const storedTheme = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_THEME_KEY);
		const themeToSet = storedTheme || data.theme; // Use localStorage theme, fallback to cookie theme
		uiStore.setTheme(themeToSet);
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="px-4">
	<slot />
</div>
