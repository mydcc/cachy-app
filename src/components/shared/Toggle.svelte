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
    checked?: boolean;
    disabled?: boolean;
    id?: string;
    onchange?: (e: Event) => void;
  }

  let {
    checked = $bindable(false),
    disabled = false,
    id = "toggle-" + (Math.random() as any).toString(36).substr(2, 9),
    onchange
  }: Props = $props();

  function handleChange(e: Event) {
    if (onchange) onchange(e);
  }
</script>

<div class="toggle-wrapper" class:disabled>
  <input type="checkbox" {id} bind:checked {disabled} onchange={handleChange} />
  <label for={id}>
    <span class="toggle-slider"></span>
  </label>
</div>

<style>
  .toggle-wrapper {
    display: inline-block;
    position: relative;
    width: 36px;
    height: 20px;
  }

  .toggle-wrapper input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .toggle-wrapper label {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-color);
    transition: 0.4s;
    border-radius: 20px;
  }

  .toggle-slider {
    position: absolute;
    height: 14px;
    width: 14px;
    left: 2px;
    bottom: 2px;
    background-color: var(--text-secondary);
    transition: 0.4s;
    border-radius: 50%;
  }

  input:checked + label {
    background-color: var(--accent-color);
    border-color: var(--accent-color);
  }

  input:checked + label .toggle-slider {
    transform: translateX(16px);
    background-color: var(--btn-accent-text);
  }

  .disabled {
    opacity: 0.5;
    pointer-events: none;
  }
</style>
