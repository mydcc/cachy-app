<script lang="ts">
	import favicon from '../assets/favicon.svg';
	import { tradeStore } from '../stores/tradeStore';
	import { uiStore } from '../stores/uiStore';
    import { settingsStore } from '../stores/settingsStore';
    import DisclaimerModal from '../components/shared/DisclaimerModal.svelte';
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

	// Dynamic theme color for PWA/Android status bar
	$: if (typeof document !== 'undefined' && $uiStore.currentTheme) {
		updateThemeColor();
	}

	function updateThemeColor() {
		// Small timeout to allow the DOM/CSS variables to update after class change
		setTimeout(() => {
			const metaThemeColor = document.querySelector('meta[name="theme-color"]');
			if (metaThemeColor) {
				// We need to read the background color of the body, which carries the theme variable
				const style = getComputedStyle(document.body);
				const bgColor = style.backgroundColor;
				metaThemeColor.setAttribute('content', bgColor);
			}
		}, 50);
	}
</script>

<svelte:head>
    <title>Cachy - Crypto Risk Calculator</title>
    <meta name="description" content="Advanced Crypto Risk Management & Trading Journal" />
</svelte:head>

<div class="app-container">
    <slot />

    <!-- Global Modals -->
    <JournalView />
    <SettingsModal />
    <!-- ConfirmationModal Removed as not found -->
    <!-- ToastManager Removed as not found -->
    <!-- LoadingSpinner Removed as not found -->

    <!-- Jules Report Overlay -->
    {#if showJulesOverlay}
    <div class="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none">
        <div class="bg-black/80 text-white px-8 py-4 rounded-lg shadow-2xl backdrop-blur-sm transform transition-all animate-fade-in-out text-center border border-[var(--accent-color)]">
            <div class="text-xl font-bold text-[var(--accent-color)] mb-1">🤖 Jules SDK</div>
            <div class="text-lg whitespace-pre-wrap max-w-lg">{julesOverlayMessage}</div>
        </div>
    </div>
    {/if}
</div>

{#if !$settingsStore.disclaimerAccepted}
    <DisclaimerModal />
{/if}
