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
  import { generateId } from "../../utils/utils";

  interface Props {
    checked?: boolean;
    disabled?: boolean;
    id?: string;
    onchange?: (e: Event) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    id = "toggle-" + generateId().slice(0, 8),
    onchange
  }: Props = $props();

  function handleChange(e: Event) {
    if (onchange) onchange(e);
  }
</script>

<div class="toggle-wrapper" class:disabled>
  <label>
    <input
      type="checkbox"
      {id}
      bind:checked
      {disabled}
      onchange={handleChange}
      class="sr-only peer"
      role="switch"
      aria-checked={checked}
    />
    <div class="atr-toggle-track relative w-[36px] h-[12px] peer-focus:outline-none rounded-full peer after:content-[''] after:absolute after:top-0 after:left-0 after:border after:rounded-full after:h-[12px] after:w-[24px]"></div>
  </label>
</div>

<style>
  .toggle-wrapper {
    display: inline-block;
    position: relative;
  }

  .disabled {
    opacity: 0.5;
    pointer-events: none;
  }
</style>
