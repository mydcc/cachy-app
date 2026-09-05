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

  // Ensure TP1 is always present
  $effect(() => {
    if (targets.length === 0) {
      targets = [{ price: null, percent: "100", isLocked: false }];
    }
  });

  function addRow() {
    app.addTakeProfitRow();
  }

  function removeRow(index: number) {
    if (index === 0) return;
    app.removeTakeProfitRow(index);
  }
</script>

<div class="mb-4">
  <!-- Section Header -->
  <div class="section-header flex justify-between items-center mb-2">
    <span>{$_("dashboard.takeProfitTargets.header")}</span>

    <div class="flex items-center gap-2">
      {#if targets.length < 4}
        <button
          class="text-[var(--accent-color)] hover:text-[var(--accent-hover)] transition-colors p-1"
          onclick={addRow}
          title={$_("dashboard.takeProfitTargets.addTargetTitle")}
          aria-label={$_("dashboard.takeProfitTargets.addTargetTitle")}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
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

  <!-- Target Rows (clean vertical list) -->
  <div class="space-y-2">
    {#each targets as target, i (target)}
      <TakeProfitRow
        index={i}
        price={target.price}
        percent={target.percent}
        isLocked={target.isLocked}
        canRemove={i > 0}
        tpDetail={calculatedTpDetails.find((d) => d.index === i)}
        on:remove={() => removeRow(i)}
      />
    {/each}
  </div>
</div>
