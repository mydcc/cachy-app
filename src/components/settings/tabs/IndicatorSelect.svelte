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

    interface Props {
        label: string;
        id: string;
        value: any;
        options: string[];
    }

    let { label, id, value = $bindable(), options }: Props = $props();
</script>

<div class="flex flex-col gap-1 flex-1">
    <label for={id} class="text-xs text-[var(--text-secondary)]">
        {label}
    </label>
    <select
        {id}
        bind:value
        class="input-field p-1 rounded text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] w-full outline-none focus:ring-1 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)] transition-shadow"
    >
        {#each options as opt}
            <option value={opt}>{opt.toUpperCase()}</option>
        {/each}
    </select>
</div>
