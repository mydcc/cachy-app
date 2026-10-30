<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  FEAT-0749 — the operating desk: one window for the armed alerts, the firing
  log and the bots those alerts were promoted into.

  Alerts and log render `ManagePanel`, the same body the Super-Alert panel
  mounts under its own two tabs; bots render `BotsTab`, moved here from the
  settings Automation tab. The point is one implementation per list with two
  shells, so a list cannot behave differently depending on which window opened
  it.

  Non-modal: Escape closes it only while it is the focused window, so the key
  that dismisses a chart menu cannot take the desk down from across the app.

  The builder stays the Super-Alert panel: "New alert" opens it rather than
  growing a second condition builder inside this window.
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { _ } from "../../../locales/i18n";
    import ManagePanel from "../manage/ManagePanel.svelte";
    import BotsTab from "../bots/BotsTab.svelte";
    import { windowManager } from "../../../lib/windows/WindowManager.svelte";
    import type { WindowBase } from "../../../lib/windows/WindowBase.svelte";
    import { openAlertPanelWith } from "../../../lib/alerts/openAlertPanel";
    import { controlCenterUnread } from "../../../stores/controlCenterUnread.svelte";
    import { tradeState } from "../../../stores/trade.svelte";

    let { window: win }: { window?: WindowBase } = $props();

    const TABS = ["alerts", "log", "bots"] as const;
    type Tab = (typeof TABS)[number];

    let tab = $state<Tab>("alerts");
    let counts = $state({ alerts: 0, log: 0 });
    const instanceId = $props.id();

    function onKeydown(event: KeyboardEvent) {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (!win?.isFocused) return;
        event.preventDefault();
        windowManager.close(win.id);
    }

    /**
     * Arrow keys move between the three tabs, as the tab pattern promises.
     * Wrapping keeps either arrow usable from either end; Home/End are omitted
     * because the strip is short enough to reach in two presses.
     */
    function onTabKeydown(event: KeyboardEvent) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const index = TABS.indexOf(tab);
        const step = event.key === "ArrowRight" ? 1 : TABS.length - 1;
        tab = TABS[(index + step) % TABS.length];
        document.getElementById(`cc-tab-${instanceId}-${tab}`)?.focus();
    }

    /**
     * The builder stays the Super-Alert panel, opened through the one entry
     * point (FEAT-0395) and seeded onto the market the trader is on. Seeding
     * matters: opening the panel blank would make them retype a symbol this
     * window already knows, and seeding before opening is the order that
     * survives the panel's own mount.
     */
    function openBuilder() {
        openAlertPanelWith({
            symbol: tradeState.symbol,
            tab: "price",
            condition: null,
        });
    }

    // The title follows a locale switch while the window is open.
    $effect(() => {
        if (win) win.title = $_("dashboard.controlCenter.title");
    });

    // Looking at it counts as having seen its firings.
    $effect(() => {
        if (win?.isFocused) controlCenterUnread.markSeen();
    });

    onMount(() => {
        document.getElementById(`cc-tab-${instanceId}-alerts`)?.focus();
    });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="control-center">
    <div class="cc-header">
        <div class="cc-tabs" role="tablist" aria-label={$_("dashboard.controlCenter.title")}>
            <button
                type="button"
                role="tab"
                id="cc-tab-{instanceId}-alerts"
                aria-controls={tab === "alerts" ? `cc-panel-${instanceId}` : undefined}
                aria-selected={tab === "alerts"}
                tabindex={tab === "alerts" ? 0 : -1}
                class:active={tab === "alerts"}
                onclick={() => (tab = "alerts")}
                onkeydown={onTabKeydown}
            >
                {$_("dashboard.alerts.manageList.tabAlerts", { values: { count: counts.alerts } })}
            </button>
            <button
                type="button"
                role="tab"
                id="cc-tab-{instanceId}-log"
                aria-controls={tab === "log" ? `cc-panel-${instanceId}` : undefined}
                aria-selected={tab === "log"}
                tabindex={tab === "log" ? 0 : -1}
                class:active={tab === "log"}
                onclick={() => (tab = "log")}
                onkeydown={onTabKeydown}
            >
                {$_("dashboard.alerts.manageList.tabLog", { values: { count: counts.log } })}
            </button>
            <button
                type="button"
                role="tab"
                id="cc-tab-{instanceId}-bots"
                aria-controls={tab === "bots" ? `cc-panel-${instanceId}` : undefined}
                aria-selected={tab === "bots"}
                tabindex={tab === "bots" ? 0 : -1}
                class:active={tab === "bots"}
                onclick={() => (tab = "bots")}
                onkeydown={onTabKeydown}
            >
                {$_("dashboard.controlCenter.tabBots")}
            </button>
        </div>

        <button type="button" class="cc-new" onclick={openBuilder}>
            {$_("dashboard.controlCenter.newAlert")}
        </button>
    </div>

    <div
        class="cc-body"
        role="tabpanel"
        id="cc-panel-{instanceId}"
        aria-labelledby="cc-tab-{instanceId}-{tab}"
        tabindex="0"
    >
        <!--
          Both halves stay mounted: the alert/log counts are derived inside
          `ManagePanel`, and unmounting it on the bots tab would reset their
          labels to zero. `hidden` keeps the inactive half out of the
          accessibility tree and the tab order.
        -->
        <div hidden={tab === "bots"}>
            <ManagePanel
                view={tab === "log" ? "log" : "alerts"}
                oncounts={(next) => (counts = next)}
            />
        </div>
        <div class="cc-bots" hidden={tab !== "bots"}>
            <BotsTab />
        </div>
    </div>
</div>

<style>
    .control-center {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        padding: var(--space-3);
        gap: var(--space-2);
    }
    .cc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        border-bottom: 1px solid var(--border-color);
        flex-shrink: 0;
    }
    .cc-tabs {
        display: flex;
        gap: var(--space-2);
    }
    .cc-tabs button {
        background: none;
        border: none;
        padding: var(--space-2) var(--space-3);
        color: var(--text-secondary);
        cursor: pointer;
    }
    .cc-tabs button.active {
        color: var(--text-primary);
        border-bottom: 2px solid var(--accent-color);
    }
    .cc-new {
        background: none;
        border: 1px solid var(--accent-color);
        border-radius: var(--radius-sm);
        padding: var(--space-1) var(--space-3);
        color: var(--accent-color);
        cursor: pointer;
        white-space: nowrap;
    }
    .cc-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-top: var(--space-2);
    }
    .cc-bots {
        padding-bottom: var(--space-4);
    }
</style>
