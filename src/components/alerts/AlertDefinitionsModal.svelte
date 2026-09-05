<script lang="ts">
  import { alertState } from "../../stores/alerts.svelte";
  import ModalFrame from "../shared/ModalFrame.svelte";
  import { _ } from "../../locales/i18n";
  import { generateId } from "../../utils/utils";
  import {
      acknowledgeCutoverNotice,
      shouldShowCutoverNotice,
  } from "../../services/alertEngine/cutoverNotice";



  import { uiState } from "../../stores/ui.svelte";

  let { onClose } = $props<{
      onClose: () => void;
  }>();

  let activeTab = $state<"active" | "history">("active");
  // Read once when the modal opens, not derived from the alert list: the
  // notice must not vanish mid-read because the trader deleted the last
  // covered alert while it was on screen. Resolved asynchronously — the check
  // now asks whether the rule's series is actually observed, which reaches
  // into the market store — so the modal opens with the notice hidden and it
  // appears a moment later if it applies, rather than blocking the open.
  let showCutoverNotice = $state(false);
  shouldShowCutoverNotice().then((shouldShow) => { showCutoverNotice = shouldShow; });

  function dismissCutoverNotice() {
      acknowledgeCutoverNotice();
      showCutoverNotice = false;
  }

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
          id: generateId(),
          symbol: newAlertSymbol,
          condition: { price_reached: targetPrice },
          active: true
      };

      alertState.addAlert(newAlert);
      newAlertPrice = "";
      uiState.showToast($_('dashboard.alerts.createSuccess'), "success");
  }
</script>

<ModalFrame isOpen={true} title={$_('dashboard.alerts.title')} onclose={onClose}>
    <!--
      BUG-0382: while the engine failed to load, definitions are stored but
      nothing evaluates them. Arming an alert here is still worth doing — it
      survives to the next reload — but the trader has to know it will not
      fire in this session, so the warning stays visible instead of relying
      on a startup toast they may have missed.
    -->
    {#if alertState.engineStatus === "failed"}
        <div class="engine-warning" role="alert">
            {$_('dashboard.alerts.engineUnavailableHint')}
        </div>
    {/if}

    <!--
      FEAT-0387: migrated alerts are evaluated on 1m candle close instead of
      per tick. Shown here rather than as a startup toast because this is the
      screen a trader is on when they think about their alarms, and a toast
      about a permanent behaviour change is gone before it is read. Only
      appears while the trader actually has a covered alert, and only until
      they acknowledge it.
    -->
    {#if showCutoverNotice}
        <div class="cutover-notice" role="status">
            <h4>{$_('dashboard.alerts.cutoverNoticeTitle')}</h4>
            <p>{$_('dashboard.alerts.cutoverNoticeBody')}</p>
            <button class="cutover-dismiss" onclick={dismissCutoverNotice}>
                {$_('dashboard.alerts.cutoverNoticeDismiss')}
            </button>
        </div>
    {/if}

    <!--
      FEAT-0387 cutover — the "report" half of suspend-and-report
      (reconcileOrphanedRules.ts). Not dismissible and not derived once: it
      reflects `alertState.orphanReport` as it stands right now, the same way
      the engine-failed banner above does, because `withheld` names alarms
      still armed *despite unresolved doubt* — a trader has to see that for as
      long as it is true, not just once. `suspended` naturally stops appearing
      on its own once nothing new needs suspending (an already-disabled rule
      is not re-reported), so no acknowledgement bookkeeping is needed either.
    -->
    {#if alertState.orphanReport && (alertState.orphanReport.suspended.length > 0 || alertState.orphanReport.withheld.length > 0)}
        <div class="engine-warning" role={alertState.orphanReport.withheld.length > 0 ? "alert" : "status"}>
            {#if alertState.orphanReport.suspended.length > 0}
                <p>{$_('dashboard.alerts.orphanSuspendedHint', { values: { count: alertState.orphanReport.suspended.length } })}</p>
            {/if}
            {#if alertState.orphanReport.withheld.length > 0}
                <p>{$_('dashboard.alerts.orphanWithheldHint', { values: { count: alertState.orphanReport.withheld.length } })}</p>
            {/if}
        </div>
    {/if}

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
    .engine-warning {
        margin-bottom: var(--space-4);
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border-left: 3px solid var(--warning-color, var(--border-color));
        color: var(--text-primary);
        font-size: 0.85rem;
    }
    .cutover-notice {
        margin-bottom: var(--space-4);
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border-left: 3px solid var(--accent-color, var(--border-color));
        color: var(--text-primary);
        font-size: 0.85rem;
    }
    .cutover-notice h4 {
        margin: 0 0 var(--space-2) 0;
        font-size: 0.9rem;
    }
    .cutover-notice p {
        margin: 0 0 var(--space-3) 0;
        color: var(--text-secondary);
        line-height: 1.5;
    }
    .cutover-dismiss {
        padding: var(--space-1) var(--space-3);
        background: transparent;
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 0.8rem;
    }
    .cutover-dismiss:hover {
        background: var(--bg-tertiary, var(--bg-secondary));
    }
    .alert-form {
        margin-bottom: var(--space-6);
        padding: var(--space-4);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        border: 1px solid var(--border);
    }
    .alert-form h4 {
        margin: 0 0 var(--space-2) 0;
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
        padding: var(--space-2);
        border-radius: var(--radius-sm);
    }
    .add-btn {
        background: var(--accent);
        color: var(--bg-primary);
        border: none;
        padding: 0 var(--space-4);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-weight: var(--font-bold);
    }
    .tabs {
        display: flex;
        gap: 1rem;
        margin-bottom: var(--space-4);
        border-bottom: 1px solid var(--border);
    }
    .tabs button {
        background: none;
        border: none;
        padding: var(--space-2) var(--space-4);
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
        padding: var(--space-3);
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
        padding: var(--space-8);
    }
</style>
