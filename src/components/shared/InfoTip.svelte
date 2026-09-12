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

  interface Props {
    /** The explanation shown on hover / focus. Respects the global tooltip setting. */
    text: string;
  }

  let { text }: Props = $props();
</script>

<!-- A small, always-visible "i" that carries a setting's explanation in a
     tooltip, so long help text no longer pads the settings list. -->
<Tooltip {text} underline={false}>
  <span class="info-tip" aria-label="Info">
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <circle cx="8" cy="8" r="6.4" fill="none" stroke="currentColor" stroke-width="1.4" />
      <rect x="7.25" y="6.9" width="1.5" height="4.3" rx="0.75" fill="currentColor" />
      <circle cx="8" cy="4.9" r="0.9" fill="currentColor" />
    </svg>
  </span>
</Tooltip>

<style>
  .info-tip {
    display: inline-flex;
    align-items: center;
    color: var(--text-secondary);
    cursor: help;
    vertical-align: middle;
  }

  .info-tip:hover {
    color: var(--accent-color);
  }
</style>
