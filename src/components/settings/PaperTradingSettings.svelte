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

<!--
  FEAT-0012 — paper trading.

  Class A: the simulated balance and the positions taken against it stay on
  this device. Nothing here is transmitted.
-->

<script lang="ts">
  import { _ } from "../../locales/i18n";
  import { paperState, type PaperFailureMode } from "../../stores/paperTrading.svelte";
  import { paperTradingService } from "../../services/paperTradingService";
  import { modalState } from "../../stores/modal.svelte";

  const failureModes: Array<{ id: PaperFailureMode; label: string }> = [
    { id: "none", label: $_("settings.paper.failure.none") },
    { id: "reject", label: $_("settings.paper.failure.reject") },
    { id: "timeout", label: $_("settings.paper.failure.timeout") },
    { id: "partial", label: $_("settings.paper.failure.partial") },
  ];

  const numericFields: Array<{
    key: "startingBalance" | "slippageBps" | "takerFeeBps" | "makerFeeBps" | "partialFillRatio";
    label: string;
    hint: string;
    unit: string;
  }> = [
    {
      key: "startingBalance",
      label: $_("settings.paper.startingBalance"),
      hint: $_("settings.paper.startingBalanceHint"),
      unit: "USDT",
    },
    {
      key: "slippageBps",
      label: $_("settings.paper.slippage"),
      hint: $_("settings.paper.slippageHint"),
      unit: "bps",
    },
    {
      key: "takerFeeBps",
      label: $_("settings.paper.takerFee"),
      hint: $_("settings.paper.feeHint"),
      unit: "bps",
    },
    {
      key: "makerFeeBps",
      label: $_("settings.paper.makerFee"),
      hint: $_("settings.paper.feeHint"),
      unit: "bps",
    },
    {
      key: "partialFillRatio",
      label: $_("settings.paper.partialRatio"),
      hint: $_("settings.paper.partialRatioHint"),
      unit: "",
    },
  ];

  let rejected = $state<string | null>(null);

  async function toggleMode() {
    const turningOn = !paperState.enabled;
    const confirmed = await modalState.show(
      turningOn
        ? $_("settings.paper.confirmOnTitle")
        : $_("settings.paper.confirmOffTitle"),
      turningOn
        ? $_("settings.paper.confirmOnMessage")
        : $_("settings.paper.confirmOffMessage"),
      "confirm",
    );
    if (confirmed === true) paperTradingService.setEnabled(turningOn);
  }

  async function resetBook() {
    const confirmed = await modalState.show(
      $_("settings.paper.resetTitle"),
      $_("settings.paper.resetMessage"),
      "confirm",
    );
    if (confirmed === true) paperTradingService.resetBook();
  }

  function onNumericInput(key: (typeof numericFields)[number]["key"], event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    rejected = paperState.setConfig(key, value) ? null : key;
  }
</script>

<div class="space-y-6">
  <!-- Mode -->
  <section class="settings-section">
    <h3 class="section-title mb-3">{$_("settings.paper.modeTitle")}</h3>

    <div
      class="rounded-xl border p-4 {paperState.enabled
        ? 'bg-warning-paired border-[var(--warning-color)]'
        : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
    >
      <p class="text-sm font-semibold">
        {paperState.enabled
          ? $_("settings.paper.modePaper")
          : $_("settings.paper.modeLive")}
      </p>
      <p class="text-[11px] mt-1 text-[var(--text-secondary)]">
        {$_("settings.paper.modeDescription")}
      </p>

      {#if paperState.enabled}
        <p class="text-[11px] mt-2">
          {$_("settings.paper.balance", {
            values: { amount: paperState.balance.toFixed(2) },
          })}
        </p>
      {/if}

      <div class="mt-3 flex gap-2">
        <button
          class="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors"
          onclick={toggleMode}
        >
          {paperState.enabled
            ? $_("settings.paper.switchToLive")
            : $_("settings.paper.switchToPaper")}
        </button>
        <button
          class="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors"
          onclick={resetBook}
        >
          {$_("settings.paper.resetBook")}
        </button>
      </div>
    </div>
  </section>

  <!-- Simulation parameters -->
  <section class="settings-section">
    <h3 class="section-title mb-3">{$_("settings.paper.simulationTitle")}</h3>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each numericFields as field (field.key)}
        <div class="field-group">
          <label for={`paper-${field.key}`}>{field.label}</label>
          <div class="flex items-center gap-2">
            <input
              id={`paper-${field.key}`}
              type="text"
              inputmode="decimal"
              class="input-field w-full"
              class:border-danger={rejected === field.key}
              value={paperState.config[field.key]}
              oninput={(e) => onNumericInput(field.key, e)}
            />
            <span class="text-[11px] text-[var(--text-secondary)] w-10"
              >{field.unit}</span
            >
          </div>
          <p class="text-[10px] text-[var(--text-secondary)]">{field.hint}</p>
        </div>
      {/each}
    </div>

    {#if rejected}
      <p class="text-[11px] mt-3 font-semibold text-[var(--danger-color)]">
        {$_("settings.paper.invalidValue")}
      </p>
    {/if}
  </section>

  <!-- Failure injection -->
  <section class="settings-section">
    <h3 class="section-title mb-3">{$_("settings.paper.failureTitle")}</h3>
    <p class="text-[11px] mb-3 text-[var(--text-secondary)]">
      {$_("settings.paper.failureDescription")}
    </p>
    <div class="flex flex-wrap gap-2">
      {#each failureModes as mode (mode.id)}
        <button
          class="px-3 py-2 text-xs font-bold rounded-lg border transition-all {paperState
            .config.failureMode === mode.id
            ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] border-[var(--accent-color)]'
            : 'bg-[var(--bg-secondary)] border-[var(--border-color)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-color)]'}"
          onclick={() => paperState.setConfig("failureMode", mode.id)}
        >
          {mode.label}
        </button>
      {/each}
    </div>
  </section>
</div>

<style>
  .section-title {
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }
  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .field-group label {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--text-secondary);
  }
  .input-field {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-primary);
    outline: none;
  }
  .border-danger {
    border-color: var(--danger-color);
  }
</style>
