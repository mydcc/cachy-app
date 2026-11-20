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
  A third-party feed as one leaf of a veto (FEAT-0814). Offered only in the
  veto editor: the core refuses a feed as a trigger (ADR-0012 decision 7).
  The threshold stays a string end to end; it is parsed with decimal.js when
  the condition is built, never with `Number`.
-->

<script lang="ts">
    import { _ } from "../../../../locales/i18n";
    import { FEED_OPS, type ComboLeafPatch, type FeedLeaf } from "../../../../lib/alerts/comboConditionForm";
    import { EXTERNAL_FEEDS, feedNameKey, isKnownFeed } from "../../../../lib/rules/externalFeeds";
    import type { CompareOp } from "../../../../lib/rules/types";
    import type { TranslationKey } from "../../../../locales/schema";

    let { leaf, onpatch }: { leaf: FeedLeaf; onpatch: (patch: ComboLeafPatch) => void } = $props();

    const key = (raw: string): TranslationKey => raw as TranslationKey;
</script>

<label class="field">
    <span>{$_("dashboard.alerts.veto.feedLabel")}</span>
    <select value={leaf.feed} onchange={(e) => onpatch({ feed: e.currentTarget.value })}>
        {#if !isKnownFeed(leaf.feed)}
            <!-- A stored feed this build does not list keeps its own option. -->
            <option value={leaf.feed}>{leaf.feed}</option>
        {/if}
        {#each EXTERNAL_FEEDS as feed (feed)}
            <option value={feed}>{$_(key(feedNameKey(feed)))}</option>
        {/each}
    </select>
</label>

<label class="field">
    <span>{$_("dashboard.alerts.veto.opLabel")}</span>
    <select value={leaf.op} onchange={(e) => onpatch({ op: e.currentTarget.value as CompareOp })}>
        {#if !FEED_OPS.includes(leaf.op)}
            <option value={leaf.op}>{$_(key(`dashboard.alerts.combo.compareOp.${leaf.op}`))}</option>
        {/if}
        {#each FEED_OPS as op (op)}
            <option value={op}>{$_(key(`dashboard.alerts.combo.compareOp.${op}`))}</option>
        {/each}
    </select>
</label>

<label class="field">
    <span>{$_("dashboard.alerts.veto.valueLabel")}</span>
    <input
        type="text"
        inputmode="decimal"
        value={leaf.value}
        oninput={(e) => onpatch({ value: e.currentTarget.value })}
    />
</label>

<p class="hint" data-testid="feed-unwired">{$_("dashboard.alerts.veto.feedUnwired")}</p>

<style>
    .field {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 8rem;
        flex: 1 1 9rem;
    }
    .field span {
        color: var(--text-secondary);
        font-size: 0.8rem;
    }
    input {
        padding: var(--space-2);
        border: 1px solid var(--border);
        border-radius: var(--radius-sm);
        background: var(--bg-primary);
        color: var(--text-primary);
    }
    .hint {
        flex-basis: 100%;
        margin: 0;
        color: var(--warning-color);
        font-size: 0.8rem;
    }
</style>
