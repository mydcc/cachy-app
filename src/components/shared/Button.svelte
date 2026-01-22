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
  interface Props {
    title?: string;
    onClick?: () => void;
    children?: import("svelte").Snippet;
    extraClasses?: string;
    disabled?: boolean;
  }

  let {
    title,
    onClick,
    children,
    extraClasses = "",
    disabled = false,
  }: Props = $props();
</script>

<button
  class="btn-base {extraClasses}"
  {disabled}
  onclick={onClick}
  {title}
>
  {#if children}
    {@render children()}
  {/if}
</button>

<style>
  .btn-base {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: all 0.2s ease;
    font-family: inherit;
  }

  .btn-base:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
