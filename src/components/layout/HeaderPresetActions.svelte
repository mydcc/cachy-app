<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program. If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  BUG-0716 — the header's two destructive buttons ask before they act.

  Both used to run their handler on the first click, one gap away from the
  theme switch: the broom replaced every trade-form value except symbol and
  trade type, the trash removed the selected preset from localStorage. Every
  comparable action in the app confirms through `modalState`, so these do too —
  and each message names what is lost, because "Are you sure?" can be answered
  without reading.

  Extracted from the page rather than wrapped in place so the cancel path is
  reachable from a component test; the page keeps the preset loader, the save
  prompt and the theme switch around it.
-->
<script lang="ts">
    import Button from "../shared/Button.svelte";
    import { icons } from "../../lib/constants";
    import { _ } from "../../locales/i18n";
    import { app } from "../../services/app";
    import { presetState } from "../../stores/preset.svelte";
    import { tradeState } from "../../stores/trade.svelte";
    import { modalState } from "../../stores/modal.svelte";

    async function deleteSelectedPreset() {
        const name = presetState.selectedPreset;
        if (!name) return;

        const confirmed = await modalState.show(
            $_("dashboard.deletePresetConfirmTitle"),
            $_("dashboard.deletePresetConfirmMessage", {
                values: { name },
            }),
            "confirm",
        );
        if (confirmed === true) await app.deletePreset(name);
    }

    async function resetTradeForm() {
        const confirmed = await modalState.show(
            $_("dashboard.resetConfirmTitle"),
            $_("dashboard.resetConfirmMessage"),
            "confirm",
        );
        if (confirmed === true) tradeState.resetInputs(true);
    }
</script>

<Button
    id="delete-preset-btn"
    variant="danger"
    title={$_("dashboard.deletePresetTitle")}
    disabled={!presetState.selectedPreset}
    onClick={deleteSelectedPreset}
    track={{
        category: "Presets",
        action: "Click",
        name: "DeletePreset",
    }}>{@html icons.delete}</Button
>
<Button
    id="reset-btn"
    variant="default"
    title={$_("dashboard.resetButtonTitle")}
    onClick={resetTradeForm}
    track={{
        category: "Actions",
        action: "Click",
        name: "ResetAll",
    }}>{@html icons.broom}</Button
>
