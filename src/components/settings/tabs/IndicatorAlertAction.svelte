<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  FEAT-0395 — "Alert on this indicator", on the card the trader is reading.

  Renders nothing for a card the rule core cannot express. The decision comes
  from `isAlertableIndicator` rather than from where this is placed, so a card
  without a mapping cannot grow a button that opens the panel onto nothing —
  and an indicator that gains a mapping gains its button without a second
  edit here.

  Arms nothing. It seeds the draft and opens the panel, which still shows the
  plain-language sentence and still requires its own arm press (ADR-0012
  decision 5).

  BUG-0453: on a card whose line is drawn over another price than the one
  the alert path computes for that indicator (`hl2`, `hlc3`, …) the button
  stays, refuses, and names the reason. Opening a draft there would arm an
  alert on a different line from the one on screen; hiding the button
  instead would leave the trader looking for it.

  FEAT-0446 group 3: the same on an ADX card whose DI length and smoothing
  differ, since the core computes ADX with one length.
-->

<script lang="ts">
    import { openAlertPanelWith } from "../../../lib/alerts/openAlertPanel";
    import {
        cardAlertAvailability,
        cardAlertSource,
        seedFromIndicatorSettings,
    } from "../../../lib/alerts/indicatorSettingsSeed";
    import { indicatorState } from "../../../stores/indicator.svelte";
    import { tradeState } from "../../../stores/trade.svelte";
    import { _ } from "../../../locales/i18n";

    let { settingsKey }: { settingsKey: string } = $props();

    function cardOf(key: string): Record<string, unknown> | null {
        const card = (indicatorState as unknown as Record<string, unknown>)[key];
        return card !== null && typeof card === "object"
            ? (card as Record<string, unknown>)
            : null;
    }

    // $derived, not a const: a const captures the prop's first value, and a
    // card rendered for a different indicator would keep the first card's
    // answer about whether it can be armed. Reading the card inside it also
    // re-derives when the trader changes the card's source.
    let availability = $derived.by(() => {
        const card = cardOf(settingsKey);
        return card === null ? "not-alertable" : cardAlertAvailability(settingsKey, card);
    });
    let refused = $derived(
        availability === "source-mismatch" || availability === "length-mismatch",
    );
    let label = $derived.by(() => {
        if (availability === "source-mismatch") {
            return $_("settings.technicals.alertSourceMismatch", {
                values: { source: cardAlertSource(settingsKey) ?? "close" },
            });
        }
        if (availability === "length-mismatch") {
            return $_("settings.technicals.alertAdxLengthMismatch");
        }
        return $_("settings.technicals.alertOnThis");
    });

    function openPanel() {
        if (availability !== "armable") return;
        const card = cardOf(settingsKey);
        if (card === null) return;
        // The same symbol the panel would have opened on by itself
        // (`AlertPanel.svelte` reads `tradeState.symbol`): two spellings of
        // "the current market" is how a draft ends up on the wrong one.
        const seed = seedFromIndicatorSettings(
            settingsKey,
            card,
            tradeState.symbol,
        );
        if (seed === null) return;
        openAlertPanelWith(seed);
    }
</script>

{#if availability !== "not-alertable"}
    <!-- aria-disabled rather than disabled: a disabled button leaves the tab
         order, and the reason it gives would be unreachable by keyboard. -->
    <button
        type="button"
        class="alert-action"
        class:refused
        onclick={openPanel}
        title={label}
        aria-label={label}
        aria-disabled={refused ? "true" : undefined}
    >
        <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
        >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
    </button>
{/if}

<style>
    .alert-action {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        margin-inline-start: auto;
        margin-inline-end: 0.5rem;
        padding: 0;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        cursor: pointer;
        transition: color 0.2s, background-color 0.2s, border-color 0.2s;
    }
    .alert-action:hover {
        color: var(--accent-color);
        background-color: var(--bg-secondary);
        border-color: var(--border-color);
    }
    .alert-action.refused {
        opacity: 0.45;
        cursor: not-allowed;
    }
    .alert-action.refused:hover {
        color: var(--text-secondary);
    }
    .alert-action:focus-visible {
        outline: 2px solid var(--accent-color);
        outline-offset: 1px;
    }
    .alert-action svg {
        width: 0.9rem;
        height: 0.9rem;
    }
</style>
