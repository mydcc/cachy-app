<script lang="ts">
  import { alertState } from "../../stores/alerts.svelte";
  import ModalFrame from "../shared/ModalFrame.svelte";
  import { _ } from "../../locales/i18n";



  import { uiState } from "../../stores/ui.svelte";

  let { onClose } = $props<{
      onClose: () => void;
  }>();

  let activeTab = $state<"active" | "history">("active");
  let newAlertSymbol = $state("BTCUSDT");
  let newAlertPrice = $state("");

  let activeAlerts = $derived(alertState.definitions.filter(a => a.active));
  let historyAlerts = $derived(alertState.definitions.filter(a => !a.active));

  function removeAlert(id: string) {
      alertState.removeAlert(id);
  }

  function formatCondition(condition: Record<string, unknown>) {
      if (condition.price_cross_up) return `${$_('dashboard.alerts.crossesUp')} ${condition.price_cross_up}`;
      if (condition.price_cross_down) return `${$_('dashboard.alerts.crossesDown')} ${condition.price_cross_down}`;
      if (condition.price_reached) return `${$_('dashboard.alerts.reaches')} ${condition.price_reached}`;
      return JSON.stringify(condition);
  }

  function createAlert() {
      if (!newAlertPrice || isNaN(Number(newAlertPrice))) return;
      const targetPrice = newAlertPrice.toString();

      const newAlert = {
          id: String(Math.floor(Math.random() * 100000000)),
          symbol: newAlertSymbol,
          condition: { price_reached: targetPrice },
          active: true
      };

      alertState.addAlert(newAlert);
      newAlertPrice = "";
      uiState.showToast($_('dashboard.alerts.createSuccess'), "success");
  }
</script>

<ModalFrame title={$_('dashboard.alerts.title')} onclose={onClose}>
    <div class="alert-form">
        <h4>{$_('dashboard.alerts.addAlert')}</h4>
        <div class="input-group">
            <input type="text" bind:value={newAlertSymbol} placeholder={$_('dashboard.alerts.symbol')} class="form-input" />
            <input type="number" bind:value={newAlertPrice} placeholder={$_('dashboard.alerts.priceLimit')} class="form-input" />
            <button class="add-btn" aria-label={$_('dashboard.alerts.addAlert')} onclick={createAlert}>+</button>
        </div>
    </div>

    <div class="tabs">
        <button class:active={activeTab === "active"} onclick={() => activeTab = "active"}>
            {$_('dashboard.alerts.active')}
        </button>
        <button class:active={activeTab === "history"} onclick={() => activeTab = "history"}>
            {$_('dashboard.alerts.history')}
        </button>
    </div>

    {#if activeTab === "active"}
        <div class="alert-list">
            {#each activeAlerts as alert}
                <div class="alert-item">
                    <div class="alert-info">
                        <strong>{alert.symbol}</strong>
                        <span>{formatCondition(alert.condition)}</span>
                    </div>
                    <button class="delete-btn" aria-label={$_('dashboard.alerts.deleteAlert')} onclick={() => removeAlert(alert.id)}>
                        ×
                    </button>
                </div>
            {:else}
                <div class="empty-state">
                    {$_('dashboard.alerts.noActive')}
                </div>
            {/each}
        </div>
    {:else}
         <div class="alert-list">
            {#each historyAlerts as alert}
                <div class="alert-item history-item">
                    <div class="alert-info">
                        <strong>{alert.symbol}</strong>
                        <span>{formatCondition(alert.condition)}</span>
                        <span class="fired-badge">{$_('dashboard.alerts.fired')}</span>
                    </div>
                    <button class="delete-btn" aria-label={$_('dashboard.alerts.deleteAlert')} onclick={() => removeAlert(alert.id)}>
                        ×
                    </button>
                </div>
            {:else}
                <div class="empty-state">
                    {$_('dashboard.alerts.noHistory')}
                </div>
            {/each}
        </div>
    {/if}
</ModalFrame>

<style>
    .alert-form {
        margin-bottom: 1.5rem;
        padding: 1rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border);
    }
    .alert-form h4 {
        margin: 0 0 0.5rem 0;
        font-size: 0.9rem;
        color: var(--text-secondary);
    }
    .input-group {
        display: flex;
        gap: 0.5rem;
    }
    .form-input {
        flex: 1;
        background: var(--bg-primary);
        border: 1px solid var(--border);
        color: var(--text-primary);
        padding: 0.5rem;
        border-radius: var(--radius-sm);
    }
    .add-btn {
        background: var(--accent);
        color: var(--bg-primary);
        border: none;
        padding: 0 1rem;
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-weight: var(--font-bold);
    }
    .tabs {
        display: flex;
        gap: 1rem;
        margin-bottom: 1rem;
        border-bottom: 1px solid var(--border);
    }
    .tabs button {
        background: none;
        border: none;
        padding: 0.5rem 1rem;
        color: var(--text-secondary);
        cursor: pointer;
    }
    .tabs button.active {
        color: var(--text-primary);
        border-bottom: 2px solid var(--accent);
    }
    .alert-list {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        max-height: 300px;
        overflow-y: auto;
    }
    .alert-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.75rem;
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border-left: 3px solid var(--accent);
    }
    .history-item {
        border-left-color: var(--text-muted);
        opacity: 0.8;
    }
    .alert-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .fired-badge {
        font-size: 0.7rem;
        color: var(--success);
        text-transform: uppercase;
        font-weight: var(--font-bold);
    }
    .delete-btn {
        background: none;
        border: none;
        color: var(--danger);
        font-size: var(--text-2xl);
        cursor: pointer;
    }
    .empty-state {
        text-align: center;
        color: var(--text-secondary);
        padding: 2rem;
    }
</style>
