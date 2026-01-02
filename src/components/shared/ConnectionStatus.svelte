<script lang="ts">
    import { settingsStore } from '../../stores/settingsStore';
    import { wsStatusStore } from '../../stores/marketStore';

    $: provider = $settingsStore.apiProvider;
    $: wsStatus = $wsStatusStore;
</script>

{#if provider === 'bitunix'}
    <div class="absolute top-4 right-4 flex gap-1 items-center z-50">
         <div class="rounded-full transition-colors duration-300"
              style="width: 0.382rem; height: 0.382rem;"
              class:bg-green-500={wsStatus === 'connected'}
              class:bg-yellow-500={wsStatus === 'connecting' || wsStatus === 'reconnecting'}
              class:bg-red-500={wsStatus === 'disconnected' || wsStatus === 'error'}
              title="Real-time Connection: {wsStatus}">
         </div>
    </div>
{/if}
