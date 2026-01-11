<script lang="ts">
    import { settingsStore } from '../../stores/settingsStore';
    import { _ } from '../../locales/i18n';
    import { fade } from 'svelte/transition';

    function acceptDisclaimer() {
        settingsStore.update(s => ({ ...s, disclaimerAccepted: true }));
    }
</script>

<div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" transition:fade={{ duration: 200 }}>
    <div class="bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] border border-[var(--border-primary)]">

        <!-- Header -->
        <div class="p-6 border-b border-[var(--border-primary)]">
            <div class="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-[var(--warning-color)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 class="text-2xl font-bold">{$_('legal.disclaimerTitle')}</h2>
            </div>
        </div>

        <!-- Content -->
        <div class="p-6 overflow-y-auto space-y-4 text-sm sm:text-base leading-relaxed text-[var(--text-secondary)]">
            {@html $_('legal.disclaimerBody')}
        </div>

        <!-- Footer -->
        <div class="p-6 border-t border-[var(--border-primary)] flex justify-end bg-[var(--bg-tertiary)] rounded-b-xl">
            <button
                class="w-full sm:w-auto px-8 py-3 bg-[var(--btn-accent-bg)] hover:bg-[var(--btn-accent-hover-bg)] text-[var(--btn-accent-text)] font-bold rounded-lg transition-colors shadow-lg"
                on:click={acceptDisclaimer}
            >
                {$_('legal.accept')}
            </button>
        </div>
    </div>
</div>
