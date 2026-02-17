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

<script lang="ts">
  import DOMPurify from "dompurify";

  interface Props {
    data: string;
    class?: string;
    size?: string;
  }

  let { data, class: className = "", size = "16" }: Props = $props();
</script>

<span class="cachy-icon {className}" style="width: {size}px; height: {size}px;">
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html DOMPurify.sanitize(data)}
</span>

<style>
  .cachy-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
  }

  /* Ensure SVG fills the wrapper */
  :global(.cachy-icon svg) {
    width: 100%;
    height: 100%;
  }
</style>
