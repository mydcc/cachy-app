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

<script lang="ts">
  import Tooltip from "./Tooltip.svelte";
  import { settingsState } from "../../stores/settings.svelte";

  interface Props {
    /** The explanation shown on hover / focus. Respects the global tooltip setting. */
    text: string;
  }

  let { text }: Props = $props();
</script>

<!--
  A small, always-visible "i" that carries a setting's explanation in a
  tooltip, so long help text no longer pads the settings list.

  With `showTooltips` off there is no hover, no focus and no `aria-describedby`
  behind the marker — it would be a dead icon that still promises an
  explanation. So it disappears instead, and the text that has to stay
  reachable in every configuration is rendered as ordinary visible copy at the
  call site.
-->
{#if settingsState.showTooltips}
  <Tooltip {text} underline={false}>
    <span class="info-tip" aria-label={text}>
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4" />
        <rect x="7.25" y="6.9" width="1.5" height="4.3" rx="0.75" fill="currentColor" />
        <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
      </svg>
    </span>
  </Tooltip>
{/if}

<style>
  /*
   * The glyph stays 12 px, but the hit area is 24 × 24 — WCAG 2.2 SC 2.5.8
   * asks for 24 px. Padding grows the target, the negative margin keeps the
   * occupied box at the glyph size so label rows do not gain a gap.
   */
  .info-tip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
    padding: 6px;
    margin: -6px;
    box-sizing: content-box;
    flex-shrink: 0;
    color: var(--text-secondary);
    cursor: help;
    vertical-align: middle;
  }

  .info-tip:hover {
    color: var(--accent-color);
  }
</style>
