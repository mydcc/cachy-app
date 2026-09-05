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
  Name plate for one indicator sub-pane, mounted into that pane's own element
  by CandleChartView.

  Carries the pane's collapse chevron: collapsing turns the pane into a
  header-only strip, so the control stays reachable in both states. This is
  display-only — it toggles `visible`; `enabled` (whether the indicator is
  computed at all) lives in Settings → Indicators alone.
-->
<script lang="ts">
    import { _ } from "../../locales/i18n";

    interface Props {
        /** Translated indicator name, e.g. "RSI". */
        title: string;
        /** Its settings, e.g. "14" or "12 26 9"; empty when it has none. */
        params?: string;
        /** True when this pane is currently collapsed to a strip. */
        collapsed?: boolean;
        /** Toggles collapse state; CandleChartView writes the store and re-renders. */
        onToggle: () => void;
    }

    let { title, params = "", collapsed = false, onToggle }: Props = $props();
</script>

<div class="indicator-pane-header">
    <button
        class="chevron"
        type="button"
        aria-label={collapsed ? $_("chart.pane.expand") : $_("chart.pane.collapse")}
        title={collapsed ? $_("chart.pane.expand") : $_("chart.pane.collapse")}
        aria-expanded={!collapsed}
        onclick={onToggle}
    >
        <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            class:rotated={collapsed}
            aria-hidden="true"
        >
            <path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    </button>
    <span class="name">{title}</span>
    {#if params}<span class="params">{params}</span>{/if}
</div>

<style>
    .indicator-pane-header {
        position: absolute;
        top: 0;
        bottom: 0;
        left: 8px;
        z-index: 2;
        display: flex;
        align-items: center;
        gap: 5px;
        font-size: 11px;
        line-height: 1.3;
        white-space: nowrap;
        /* The header itself must not swallow chart pan/zoom — only the
           chevron button re-enables pointer events, nothing else. */
        pointer-events: none;
        user-select: none;
    }

    .chevron {
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border: none;
        background: transparent;
        color: var(--text-tertiary);
        cursor: pointer;
    }

    .chevron:hover {
        color: var(--text-primary);
    }

    .chevron svg {
        transition: transform var(--transition-fast, 150ms) ease;
    }

    .chevron svg.rotated {
        transform: rotate(-90deg);
    }

    .name {
        font-weight: var(--font-semibold);
        color: var(--text-secondary);
    }

    .params {
        color: var(--text-tertiary);
    }
</style>
