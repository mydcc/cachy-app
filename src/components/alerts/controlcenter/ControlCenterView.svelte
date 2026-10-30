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
  FEAT-0749 — the operating desk: one window, the armed list, the firing log
  (and, with FEAT-0749's second half, the bots).

  It renders `ManagePanel`, the same body the Super-Alert panel uses, under its
  own tab strip. The point is one list implementation with two shells, so the
  list cannot behave differently depending on which window opened it.

  Non-modal: Escape closes it only while it is the focused window, so the key
  that dismisses a chart menu cannot take the desk down from across the app.
-->

<script lang="ts">
    import { onMount } from "svelte";
    import { _ } from "../../../locales/i18n";
    import ManagePanel from "../manage/ManagePanel.svelte";
    import { windowManager } from "../../../lib/windows/WindowManager.svelte";
    import type { WindowBase } from "../../../lib/windows/WindowBase.svelte";
    import { controlCenterUnread } from "../../../stores/controlCenterUnread.svelte";

    let { window: win }: { window?: WindowBase } = $props();

    let tab = $state<"alerts" | "log">("alerts");
    let counts = $state({ alerts: 0, log: 0 });
    const instanceId = $props.id();

    function onKeydown(event: KeyboardEvent) {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (!win?.isFocused) return;
        event.preventDefault();
        windowManager.close(win.id);
    }

    function onTabKeydown(event: KeyboardEvent) {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const next = tab === "alerts" ? "log" : "alerts";
        tab = next;
        document.getElementById(`cc-tab-${instanceId}-${next}`)?.focus();
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
    </div>

    <div
        class="cc-body"
        role="tabpanel"
        id="cc-panel-{instanceId}"
        aria-labelledby="cc-tab-{instanceId}-{tab}"
        tabindex="0"
    >
        <ManagePanel view={tab} oncounts={(next) => (counts = next)} />
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
    .cc-tabs {
        display: flex;
        gap: var(--space-2);
        border-bottom: 1px solid var(--border-color);
        flex-shrink: 0;
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
    .cc-body {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding-top: var(--space-2);
    }
</style>
