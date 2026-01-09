<script lang="ts">
    import '../app.css';
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { uiStore } from '../stores/uiStore';
    import { tradeStore } from '../stores/tradeStore';
    import { settingsStore } from '../stores/settingsStore';
    import { app } from '../services/app';
    import { julesService } from '../services/julesService';
    // Removed missing components: ToastManager, LoadingSpinner, ConfirmationModal
    import JournalView from '../components/shared/JournalView.svelte';
    import SettingsModal from '../components/settings/SettingsModal.svelte';
    // import ConfirmationModal from '../components/shared/ConfirmationModal.svelte';

    // --- Global Cheat Code Logic (Moved from JournalView) ---
    const CODE_REPORT = 'REPORT'; // Jules SDK
    let inputBuffer: string[] = [];
    const MAX_CODE_LENGTH = 20;

    // Overlay state for Jules Report
    let showJulesOverlay = false;
    let julesOverlayMessage = '';

    async function handleGlobalKeydown(event: KeyboardEvent) {
        // Ignore if user is typing in an input field
        const target = event.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

        const key = event.key.toUpperCase();
        if (key.length === 1) {
            inputBuffer.push(key);
            if (inputBuffer.length > MAX_CODE_LENGTH) {
                inputBuffer.shift();
            }

            const bufferStr = inputBuffer.join('');

            // JULES REPORT: Send Snapshot
            if (bufferStr.endsWith(CODE_REPORT)) {
                 await triggerJulesReport();
                 inputBuffer = [];
            }
        }
    }

    async function triggerJulesReport() {
        julesOverlayMessage = "Jules: Analyzing System...";
        showJulesOverlay = true;

        try {
            const message = await julesService.reportToJules(null, 'MANUAL');
            // Show result
            julesOverlayMessage = message ? `Jules: ${message}` : "Jules: No response received.";

            // Keep open longer for reading
            setTimeout(() => {
                showJulesOverlay = false;
            }, 6000);
        } catch (e) {
            julesOverlayMessage = "Jules: Connection Failed.";
            setTimeout(() => {
                showJulesOverlay = false;
            }, 2000);
        }
    }

    onMount(() => {
        if (browser) {
            // Restore trade store from local storage
            const storedTrade = localStorage.getItem('cachy_trade_store');
            if (storedTrade) {
                try {
                    const parsed = JSON.parse(storedTrade);
                    tradeStore.set(parsed);
                } catch (e) {
                    console.error('Failed to restore trade store', e);
                }
            }

            // Init App Service (WebSocket, etc)
            // app.initialize() does not exist, replaced with setupRealtimeUpdates if needed
            // But app.ts might handle its own initialization via store subscriptions or user actions.
            // Based on grep, setupRealtimeUpdates is available.
            app.setupRealtimeUpdates();

            // Set PWA theme color based on current theme
            const updateMetaThemeColor = () => {
                 const computedStyle = getComputedStyle(document.body);
                 const bgColor = computedStyle.backgroundColor;
                 const metaThemeColor = document.querySelector('meta[name="theme-color"]');
                 if (metaThemeColor) {
                     metaThemeColor.setAttribute('content', bgColor);
                 }
            };

            // Observer to watch for theme class changes on body/html
            const observer = new MutationObserver(updateMetaThemeColor);
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

            // Initial call
            setTimeout(updateMetaThemeColor, 100);

            // Register global key listener
            window.addEventListener('keydown', handleGlobalKeydown);
        }
    });

    onDestroy(() => {
        if (browser) {
            // app.destroy() does not exist in grep results, removing.
            window.removeEventListener('keydown', handleGlobalKeydown);
        }
    });

    // Reactive Theme Class on Body
    $: if (browser) {
        document.documentElement.className = $uiStore.currentTheme;
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

<style>
    :global(body) {
        background-color: var(--bg-primary);
        color: var(--text-primary);
        transition: background-color 0.3s ease, color 0.3s ease;
    }
</style>
