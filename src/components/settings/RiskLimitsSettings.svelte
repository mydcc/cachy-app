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
  FEAT-0013 — risk limits and the kill switch.

  Everything here is Class A: it is written to this device's localStorage and
  never transmitted. The limits are enforced in the FEAT-0011 gate, not by
  this form — the inputs below only configure them.
-->

<script lang="ts">
  import { _ } from "../../locales/i18n";
  import { Decimal } from "decimal.js";
  import { riskState, type RiskLimitInputs } from "../../stores/riskLimits.svelte";
  import { rmsService, utcDayStart } from "../../services/rmsService";
  import { modalState } from "../../stores/modal.svelte";
  import { journalState } from "../../stores/journal.svelte";

  // Recomputed whenever the journal changes, so the figure the user reads is
  // the same one the gate will measure against.
  const realizedToday = $derived.by(() => {
    void journalState.entries.length;
    return rmsService.realizedPnlToday();
  });

  const nextResetLocal = $derived.by(() => {
    const next = utcDayStart(Date.now()) + 24 * 60 * 60 * 1000;
    return new Date(next).toLocaleString();
  });

  const engagedSince = $derived(
    riskState.killSwitchEngagedAt === null
      ? null
      : new Date(riskState.killSwitchEngagedAt).toLocaleString(),
  );

  function fmt(value: Decimal): string {
    return value.toFixed(2);
  }

  type DecimalLimitKey = Exclude<keyof RiskLimitInputs, "maxOpenPositions">;

  const fields: Array<{ key: DecimalLimitKey; label: string; hint: string; unit: string }> = [
    {
      key: "maxPositionSizeUsdt",
      label: $_("settings.risk.maxPositionSize"),
      hint: $_("settings.risk.maxPositionSizeHint"),
      unit: "USDT",
    },
    {
      key: "maxPositionSizePercent",
      label: $_("settings.risk.maxPositionSizePercent"),
      hint: $_("settings.risk.maxPositionSizePercentHint"),
      unit: "%",
    },
    {
      key: "maxLeverage",
      label: $_("settings.risk.maxLeverage"),
      hint: $_("settings.risk.maxLeverageHint"),
      unit: "x",
    },
    {
      key: "maxLossPerTradeUsdt",
      label: $_("settings.risk.maxLossPerTrade"),
      hint: $_("settings.risk.maxLossPerTradeHint"),
      unit: "USDT",
    },
    {
      key: "maxDailyLossUsdt",
      label: $_("settings.risk.maxDailyLoss"),
      hint: $_("settings.risk.maxDailyLossHint"),
      unit: "USDT",
    },
  ];

  let rejected = $state<string | null>(null);

  function onLimitInput(key: DecimalLimitKey, event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    // setLimit refuses anything that is not a non-negative number rather than
    // storing it — a typo must not silently switch a limit off.
    rejected = riskState.setLimit(key, value === "" ? null : value) ? null : key;
  }

  function onMaxPositionsInput(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    rejected = riskState.setLimit("maxOpenPositions", value === "" ? null : Number(value))
      ? null
      : "maxOpenPositions";
  }

  function engage() {
    riskState.engageKillSwitch();
  }

  async function release() {
    const confirmed = await modalState.show(
      $_("settings.risk.killSwitch.confirmTitle"),
      $_("settings.risk.killSwitch.confirmMessage"),
      "confirm",
    );
    if (confirmed === true) {
      riskState.releaseKillSwitch({ confirmed: true });
    }
  }

  async function resetAll() {
    const confirmed = await modalState.show(
      $_("settings.risk.resetTitle"),
      $_("settings.risk.resetMessage"),
      "confirm",
    );
    if (confirmed === true) riskState.resetLimits();
  }
</script>

<div class="space-y-6">
  <!-- Kill switch -->
  <section class="settings-section">
    <h3 class="section-title mb-3">{$_("settings.risk.killSwitch.title")}</h3>

    <div
      class="rounded-xl border p-4 {riskState.isKillSwitchEngaged
        ? 'bg-danger-paired border-[var(--danger-color)]'
        : 'bg-[var(--bg-secondary)] border-[var(--border-color)]'}"
    >
      <p class="text-sm font-semibold">
        {riskState.isKillSwitchEngaged
          ? $_("settings.risk.killSwitch.engaged")
          : $_("settings.risk.killSwitch.disengaged")}
      </p>
      <p class="text-[11px] mt-1 text-[var(--text-secondary)]">
        {$_("settings.risk.killSwitch.description")}
      </p>

      {#if engagedSince}
        <p class="text-[11px] mt-2">
          {$_("settings.risk.killSwitch.engagedSince", {
            values: { time: engagedSince },
          })}
        </p>
      {/if}

      {#if riskState.persistFailed}
        <p class="text-[11px] mt-2 font-semibold text-[var(--danger-color)]">
          {$_("settings.risk.persistFailed")}
        </p>
      {/if}

      <div class="mt-3">
        {#if riskState.isKillSwitchEngaged}
          <button
            class="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors"
            onclick={release}
          >
            {$_("settings.risk.killSwitch.release")}
          </button>
        {:else}
          <button
            class="px-4 py-2 text-xs font-bold rounded-lg bg-danger-paired border border-[var(--danger-color)] transition-colors"
            onclick={engage}
          >
            {$_("settings.risk.killSwitch.engage")}
          </button>
        {/if}
      </div>
    </div>
  </section>

  <!-- Daily loss status -->
  <section class="settings-section">
    <h3 class="section-title mb-3">{$_("settings.risk.dailyStatusTitle")}</h3>
    <div
      class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4"
    >
      <p class="text-sm">
        {$_("settings.risk.realizedToday", {
          values: { amount: fmt(realizedToday) },
        })}
      </p>
      <p class="text-[11px] mt-1 text-[var(--text-secondary)]">
        {$_("settings.risk.resetBoundary", {
          values: { local: nextResetLocal },
        })}
      </p>
      <p class="text-[11px] mt-1 text-[var(--text-secondary)]">
        {$_("settings.risk.paperExcluded")}
      </p>
    </div>
  </section>

  <!-- Limits -->
  <section class="settings-section">
    <h3 class="section-title mb-3">{$_("settings.risk.limitsTitle")}</h3>
    <p class="text-[11px] mb-3 text-[var(--text-secondary)]">
      {$_("settings.risk.limitsDescription")}
    </p>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      {#each fields as field (field.key)}
        <div class="field-group">
          <label for={`risk-${field.key}`}>{field.label}</label>
          <div class="flex items-center gap-2">
            <input
              id={`risk-${field.key}`}
              type="text"
              inputmode="decimal"
              class="input-field w-full"
              class:border-danger={rejected === field.key}
              placeholder={$_("settings.risk.notConfigured")}
              value={riskState.limits[field.key] ?? ""}
              oninput={(e) => onLimitInput(field.key, e)}
            />
            <span class="text-[11px] text-[var(--text-secondary)] w-10"
              >{field.unit}</span
            >
          </div>
          <p class="text-[10px] text-[var(--text-secondary)]">{field.hint}</p>
        </div>
      {/each}

      <div class="field-group">
        <label for="risk-maxOpenPositions"
          >{$_("settings.risk.maxOpenPositions")}</label
        >
        <div class="flex items-center gap-2">
          <input
            id="risk-maxOpenPositions"
            type="number"
            min="0"
            step="1"
            class="input-field w-full"
            class:border-danger={rejected === "maxOpenPositions"}
            placeholder={$_("settings.risk.notConfigured")}
            value={riskState.limits.maxOpenPositions ?? ""}
            oninput={onMaxPositionsInput}
          />
          <span class="text-[11px] text-[var(--text-secondary)] w-10"></span>
        </div>
        <p class="text-[10px] text-[var(--text-secondary)]">
          {$_("settings.risk.maxOpenPositionsHint")}
        </p>
      </div>
    </div>

    {#if rejected}
      <p class="text-[11px] mt-3 font-semibold text-[var(--danger-color)]">
        {$_("settings.risk.invalidValue")}
      </p>
    {/if}

    <button
      class="mt-4 px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors"
      onclick={resetAll}
    >
      {$_("settings.risk.resetLimits")}
    </button>
  </section>
</div>

<style>
  /* Svelte's scoped styles do not cross a component boundary, so the shapes
     TradingTab defines for its own fields are restated here rather than
     inherited. Same values, so the sub-tab does not look grafted on. */
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
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .input-field {
    background-color: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 0.5rem 0.75rem;
    font-size: var(--text-sm);
    color: var(--text-primary);
    outline: none;
  }
  .border-danger {
    border-color: var(--danger-color);
  }
</style>
