<script lang="ts">
    import { settingsStore } from '../../stores/settingsStore';
    import { _ } from '../../locales/i18n';
    import { fly } from 'svelte/transition';

    function acceptDisclaimer() {
        settingsStore.update(s => ({ ...s, disclaimerAccepted: true }));
    }

    // Reactive variable to store the translation
    $: disclaimerBody = $_('legal.disclaimerContent');
</script>

{#if !$settingsStore.disclaimerAccepted}
<div
    class="fixed bottom-4 right-4 z-[9999] max-w-[18rem] w-full bg-[var(--bg-secondary)] border border-[var(--border-primary)] shadow-xl rounded-lg p-4 flex flex-col gap-3"
    transition:fly={{ y: 50, duration: 400 }}
>
    <div class="flex items-start gap-3">
         <!-- Icon -->
         <div class="text-[var(--warning-color)] mt-0.5 shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
         </div>
         <div class="flex-1 min-w-0">
             <h3 class="font-bold text-sm text-[var(--text-primary)] mb-1">{$_('legal.disclaimerTitle')}</h3>
             <div class="text-xs text-[var(--text-secondary)] leading-relaxed opacity-90 disclaimer-text max-h-32 overflow-y-auto custom-scrollbar">
                 {#key disclaimerBody}
                    {@html disclaimerBody}
                 {/key}
             </div>
         </div>
    </div>
    <div class="flex justify-end pt-1">
        <button
            class="px-3 py-1.5 bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)] text-xs font-bold rounded transition-colors shadow-sm"
            on:click={acceptDisclaimer}
        >
            {$_('legal.accept')}
        </button>
    </div>
</div>
{/if}

<style>
    /* Compact styling for the injected HTML content */
    :global(.disclaimer-text p) {
        margin-bottom: 0.5em;
    }
    :global(.disclaimer-text p:last-child) {
        margin-bottom: 0;
    }
</style>
