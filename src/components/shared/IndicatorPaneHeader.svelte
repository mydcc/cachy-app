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

  Deliberately label-only. An on/off control does not belong here: it would
  live inside the pane it hides, so switching an indicator off would take its
  own switch away with it and leave no way back. Indicators are switched in
  Settings → Indicators, which is the single control surface for them.
-->
<script lang="ts">
    interface Props {
        /** Translated indicator name, e.g. "RSI". */
        title: string;
        /** Its settings, e.g. "14" or "12 26 9"; empty when it has none. */
        params?: string;
    }

    let { title, params = "" }: Props = $props();
</script>

<div class="indicator-pane-header">
    <span class="name">{title}</span>
    {#if params}<span class="params">{params}</span>{/if}
</div>

<style>
    .indicator-pane-header {
        position: absolute;
        top: 2px;
        left: 8px;
        z-index: 2;
        display: flex;
        align-items: baseline;
        gap: 5px;
        font-size: 11px;
        line-height: 1.4;
        white-space: nowrap;
        /* Purely informational, so it must never swallow chart pan/zoom —
           same convention as the other chart overlays in CandleChartView. */
        pointer-events: none;
        user-select: none;
    }

    .name {
        font-weight: 600;
        color: var(--text-secondary);
    }

    .params {
        color: var(--text-tertiary);
    }
</style>
