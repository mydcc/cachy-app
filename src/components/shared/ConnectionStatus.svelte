<script lang="ts">
    import { wsStatusStore } from '../../stores/marketStore';
    import { settingsStore } from '../../stores/settingsStore';
    import { _ } from '../../locales/i18n';
</script>

{#if $settingsStore.apiProvider === 'bitunix'}
    <div class="absolute top-4 right-4 flex items-center gap-1 z-50" title="Bitunix Connection: {$wsStatusStore}">
        <div class="w-2.5 h-2.5 rounded-full transition-colors duration-300"
             class:bg-green-500={$wsStatusStore === 'connected'}
             class:bg-yellow-500={$wsStatusStore === 'connecting' || $wsStatusStore === 'reconnecting'}
             class:bg-red-500={$wsStatusStore === 'disconnected' || $wsStatusStore === 'error'}>
        </div>
    </div>
{/if}
