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
  FEAT-0389 → FEAT-0747 → FEAT-0749.

  The in-panel shell: a two-tab switch between the armed list and the firing
  log. Everything the tabs render lives in `ManagePanel`, which the control
  center also mounts under its own three tabs — one list implementation, two
  shells (FEAT-0749 AC).
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import ManagePanel from "../manage/ManagePanel.svelte";

    // Declared to satisfy the shell's tab contract, unused: the panel lists
    // armed rules, which it reads from the store rather than from the header's
    // symbol.
    let { symbol: _symbol }: { symbol?: string } = $props();

    let listTab = $state<"alerts" | "log">("alerts");

    /** Unique per mount: two shells must not share tab/panel ids. */
    const instanceId = $props.id();

    let counts = $state({ alerts: 0, log: 0 });

    /**
     * Arrow keys move between the two tabs, as the tab pattern promises.
     * Home/End are omitted because there are only two, and both are reachable
     * with a single arrow either way.
     */
    function onTabKeydown(event: KeyboardEvent) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = listTab === "alerts" ? "log" : "alerts";
        listTab = next;
        document.getElementById(`manage-tab-${instanceId}-${next}`)?.focus();
    }
</script>

<div class="list-tabs" role="tablist">
    <button
        type="button"
        role="tab"
        id="manage-tab-{instanceId}-alerts"
        aria-controls={listTab === "alerts" ? `manage-panel-${instanceId}` : undefined}
        aria-selected={listTab === "alerts"}
        tabindex={listTab === "alerts" ? 0 : -1}
        class:active={listTab === "alerts"}
        onclick={() => (listTab = "alerts")}
        onkeydown={onTabKeydown}
    >
        {$_("dashboard.alerts.manageList.tabAlerts", { values: { count: counts.alerts } })}
    </button>
    <button
        type="button"
        role="tab"
        id="manage-tab-{instanceId}-log"
        aria-controls={listTab === "log" ? `manage-panel-${instanceId}` : undefined}
        aria-selected={listTab === "log"}
        tabindex={listTab === "log" ? 0 : -1}
        class:active={listTab === "log"}
        onclick={() => (listTab = "log")}
        onkeydown={onTabKeydown}
    >
        {$_("dashboard.alerts.manageList.tabLog", { values: { count: counts.log } })}
    </button>
</div>

<div
    role="tabpanel"
    id="manage-panel-{instanceId}"
    aria-labelledby="manage-tab-{instanceId}-{listTab}"
    tabindex="0"
>
    <ManagePanel view={listTab} oncounts={(next) => (counts = next)} />
</div>

<style>
    .list-tabs {
        display: flex;
        gap: var(--space-2);
        margin-bottom: var(--space-3);
        border-bottom: 1px solid var(--border-color);
    }
    .list-tabs button {
        background: none;
        border: none;
        padding: var(--space-2) var(--space-3);
        color: var(--text-secondary);
        cursor: pointer;
    }
    .list-tabs button.active {
        color: var(--text-primary);
        border-bottom: 2px solid var(--accent-color);
    }
</style>
