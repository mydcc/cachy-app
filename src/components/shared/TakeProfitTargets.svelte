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
  import TakeProfitRow from "../shared/TakeProfitRow.svelte";
  import Tooltip from "../shared/Tooltip.svelte";
  import { app } from "../../services/app";
  import { _ } from "../../locales/i18n";
  import { createEventDispatcher } from "svelte";
  import type { IndividualTpResult } from "../../stores/types";

  const dispatch = createEventDispatcher();

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
    dispatch("remove", index);
  }
</script>

<div class="mt-4">
  <div class="section-header !mt-4">
    <span>{$_("dashboard.takeProfitTargets.header")}</span>

    <div class="flex items-center gap-2">
      <Tooltip text={$_("dashboard.takeProfitTargets.tooltip")} />

      {#if targets.length < 10}
        <button
          class="text-[var(--accent-color)] hover:text-[var(--accent-hover)] transition-colors p-1"
          onclick={addRow}
          title={$_("dashboard.takeProfitTargets.addTargetTitle")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            fill="currentColor"
            viewBox="0 0 16 16"
          >
            <path
              fill-rule="evenodd"
              d="M8 2a.5.5 0 0 1 .5.5v5h5a.5.5 0 0 1 0 1h-5v5a.5.5 0 0 1-1 0v-5h-5a.5.5 0 0 1 0-1h5v-5A.5.5 0 0 1 8 2z"
            />
          </svg>
        </button>
      {/if}
    </div>
  </div>

  {#if targets.length === 0}
    <div
      class="text-center p-4 border border-dashed border-[var(--border-color)] rounded-lg text-[var(--text-secondary)] text-sm"
    >
      {$_("dashboard.takeProfitTargets.emptyState" as any)}
    </div>
  {/if}

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
</div>
