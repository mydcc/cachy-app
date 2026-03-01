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
    import { settingsState } from "../../../stores/settings.svelte";
    import { enhancedInput } from "../../../lib/actions/inputEnhancements";

    interface Props {
        label: string;
        id: string;
        value: any;
        type?: string;
        min?: number;
        max?: number;
        step?: number;
        alwaysEnabled?: boolean;
    }

    let {
        label,
        id,
        value = $bindable(),
        type = "number",
        min,
        max,
        step,
        alwaysEnabled = false,
    }: Props = $props();
</script>

<div class="flex flex-col gap-1 flex-1 items-start">
    <label for={id} class="text-xs text-[var(--text-secondary)]">
        {label}
    </label>
    <input
        {id}
        {type}
        bind:value
        {min}
        {max}
        {step}
        class="input-field rounded-md settings-number-input text-xs outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:border-transparent transition-all bg-[var(--bg-secondary)] border border-[var(--border-color)] px-2.5 py-1.5"
        use:enhancedInput={{ min, max }}
    />
</div>

<style>
    /* Harmonize number input arrows */
    input[type="number"]::-webkit-inner-spin-button,
    input[type="number"]::-webkit-outer-spin-button {
        opacity: 0;
        cursor: pointer;
        transition: opacity 0.2s;
    }

    input[type="number"]:hover::-webkit-inner-spin-button {
        opacity: 0.5;
    }

    input[type="number"]:focus::-webkit-inner-spin-button {
        opacity: 0.8;
    }

    /* Professional look for inputs */
    .input-field {
        color: var(--text-primary);
        font-family: inherit;
    }

    .input-field::placeholder {
        color: var(--text-secondary);
        opacity: 0.5;
    }
</style>
