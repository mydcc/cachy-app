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
  import TakeProfitRow from "./TakeProfitRow.svelte";
  import { app } from "../../services/app";
  import { _ } from "../../locales/i18n";
  import type { IndividualTpResult } from "../../stores/types";

  interface Props {
    targets: Array<{
      price: string | null;
      percent: string | null;
      isLocked: boolean;
    }>;
    calculatedTpDetails?: IndividualTpResult[];
  }

  let { targets = $bindable(), calculatedTpDetails = [] }: Props = $props();

  function addRow() {
    app.addTakeProfitRow();
  }

  function removeRow(index: number) {
    app.removeTakeProfitRow(index);
  }
</script>

<div>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
    {#each targets as target, i}
      <TakeProfitRow
        index={i}
        price={target.price}
        percent={target.percent}
        isLocked={target.isLocked}
        tpDetail={calculatedTpDetails.find((d) => d.index === i)}
        on:remove={() => removeRow(i)}
      />
    {/each}
  </div>

  {#if targets.length < 10}
    <button
      class="w-full mt-2 py-2 border-2 border-dashed border-[var(--border-color)] text-[var(--text-secondary)] rounded-lg hover:border-[var(--accent-color)] hover:text-[var(--accent-color)] transition-colors text-sm font-medium flex items-center justify-center gap-2"
      onclick={addRow}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        fill="currentColor"
        viewBox="0 0 16 16"
      >
        <path
          d="M8 4a.5.5 0 0 1 .5.5v3h3a.5.5 0 0 1 0 1h-3v3a.5.5 0 0 1-1 0v-3h-3a.5.5 0 0 1 0-1h3v-3A.5.5 0 0 1 8 4z"
        />
      </svg>
      {$_("dashboard.takeProfitTargets.addButton" as any)}
    </button>
  {/if}
</div>
