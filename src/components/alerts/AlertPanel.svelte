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
  FEAT-0389 -- host for the Super-Alert side panel.

  Renders no markup of its own: it opens an `AlertPanelWindow` on the shared
  WindowManager stack, which is where WindowContainer actually renders it
  (ADR-0006). Mounting is the open action and unmounting is the close action,
  the same contract ModalFrame.svelte already uses, so `+layout.svelte` keeps
  its existing `{#if uiState.showAlertsModal}` guard and its lazy import.
-->

<script lang="ts">
    import { untrack } from "svelte";
    import { windowManager } from "../../lib/windows/WindowManager.svelte";
    import { AlertPanelWindow } from "../../lib/windows/implementations/AlertPanelWindow.svelte";
    import { alertPanelState } from "../../stores/alertPanel.svelte";
    import { tradeState } from "../../stores/trade.svelte";
    import { _ } from "../../locales/i18n";

    let { onClose }: { onClose: () => void } = $props();

    let instance: AlertPanelWindow | null = $state(null);

    // untrack() for the same reason ModalFrame.svelte documents:
    // windowManager.open() -> bringToFront() reads the shared $state window
    // list, and recording that as a dependency makes this effect tear down
    // and recreate the window it just created on every window-list change.
    $effect(() => {
        const symbol = untrack(() => tradeState.symbol);
        const win = untrack(() => {
            // openFor(), not reset(): an entry point that seeded a draft
            // (FEAT-0395) did so before this component existed, and a blanket
            // reset here would blank exactly what the trader asked for.
            alertPanelState.openFor(symbol);
            const w = new AlertPanelWindow({
                title: $_("dashboard.alerts.panel.title"),
                onclose: onClose,
            });
            instance = w;
            windowManager.open(w);
            return w;
        });

        return () => {
            windowManager.close(win.id);
            instance = null;
        };
    });

    // The title comes from `$_(...)` and has to follow a locale switch while
    // the panel is open.
    $effect(() => {
        if (instance) instance.title = $_("dashboard.alerts.panel.title");
    });
</script>
