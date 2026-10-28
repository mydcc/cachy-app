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
  FEAT-0752 — the drawing a seeded draft arms.

  Read-only by design: the level comes from the line, not from a field, so
  there is nothing here to type. The editable half of this alert is elsewhere:
  the footer every builder shares — channels, frequency, expiry, note — and the
  header's timeframe, the only header control a drawing rule reads.

  A horizontal line has a fixed level worth showing. A trend line does not: its
  level depends on the instant it is read, and the arm press re-reads it, so a
  number printed here would be stale before the trader finished reading it.
-->
<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import { alertPanelState } from "../../../stores/alertPanel.svelte";
    import { drawingStore } from "../../../stores/drawings.svelte";
    import type { DrawingKind } from "../../../lib/chart/drawings/types";
    import type { TranslationKey } from "../../../locales/schema";

    let { symbol }: { symbol: string } = $props();

    /*
     * Explicit, like the shell's label maps: a `DrawingKind` added without a
     * key fails the type check instead of rendering the key path as text.
     */
    const KIND_KEYS: Record<DrawingKind, TranslationKey> = {
        horizontal: "dashboard.alerts.panel.drawing.kind.horizontal",
        trend: "dashboard.alerts.panel.drawing.kind.trend",
    };

    let drawing = $derived.by(() => {
        const draft = alertPanelState.drawingDraft;
        return draft ? drawingStore.byId(draft.id) : null;
    });

    let kindLabel = $derived(drawing ? $_(KIND_KEYS[drawing.kind]) : "");
</script>

<div class="drawing-summary">
    <p class="lead">{$_("dashboard.alerts.panel.drawing.lead")}</p>

    {#if drawing === null}
        <p class="missing" role="alert">
            {$_("dashboard.alerts.panel.drawingMissing")}
        </p>
    {:else}
        <dl>
            <dt>{$_("dashboard.alerts.panel.drawing.symbol")}</dt>
            <dd>{drawing.symbol || symbol}</dd>

            <dt>{$_("dashboard.alerts.panel.drawing.kindLabel")}</dt>
            <dd>
                {kindLabel}{#if drawing.label} — {drawing.label}{/if}
            </dd>

            <dt>{$_("dashboard.alerts.panel.drawing.level")}</dt>
            <dd>
                {#if drawing.kind === "horizontal"}
                    {drawing.price}
                {:else}
                    {$_("dashboard.alerts.panel.drawing.levelFollowsLine")}
                {/if}
            </dd>
        </dl>
    {/if}
</div>

<style>
    .drawing-summary {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        padding: 0.25rem 0.125rem;
    }

    .lead {
        margin: 0;
        color: var(--text-secondary);
        font-size: 0.8125rem;
        line-height: 1.45;
    }

    .missing {
        margin: 0;
        color: var(--danger-color);
        font-size: 0.8125rem;
    }

    dl {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.375rem 0.875rem;
        margin: 0;
        font-size: 0.8125rem;
    }

    dt {
        color: var(--text-secondary);
    }

    dd {
        margin: 0;
        color: var(--text-primary);
        font-variant-numeric: tabular-nums;
    }
</style>
