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
  import SettingsGrid from "./shared/SettingsGrid.svelte";
  import { journalState } from "../../stores/journal.svelte";
  import { confirmAndCloseAllPositions } from "../../stores/closeAllFlow";
  import Button from "../shared/Button.svelte";
  import Toggle from "../shared/Toggle.svelte";
  import { onMount } from "svelte";

  const config = $derived(riskState.killSwitchConfig);
  const scope = $derived(rmsService.killSwitchScope());

  // The same assessment the gate reads, recomputed with the journal. The
  // figure and the auto-engage decision never disagree with what a refusal
  // would measure.
  const assessment = $derived.by(() => {
    void journalState.entries.length;
    return rmsService.assessDailyLoss();
  });
  const realizedToday = $derived(assessment.loss);
  const realizedLoss = $derived(
    assessment.loss.isNegative() ? assessment.loss.abs() : new Decimal(0),
  );

  const nextResetLocal = $derived.by(() => {
    const next = utcDayStart(Date.now()) + 24 * 60 * 60 * 1000;
    return new Date(next).toLocaleString();
  });

  let autoEngageRejected = $state(false);

  const autoEngageThreshold = $derived(riskState.killSwitchAutoEngageLimit());
  const suppressedToday = $derived(
    riskState.killSwitchAutoEngageSuppressedFor === utcDayStart(Date.now()),
  );
  const causeLabel = $derived(
    assessment.cause === null
      ? ""
      : $_(`settings.risk.killSwitch.autoEngage.cause.${assessment.cause}`),
  );

  // The status line names the real precondition instead of claiming the
  // switch is armed while the day cannot be measured.
  const autoEngageStatus = $derived.by(() => {
    if (autoEngageThreshold === null) return $_("settings.risk.killSwitch.autoEngage.off");
    if (suppressedToday) return $_("settings.risk.killSwitch.autoEngage.suppressedToday");
    if (!assessment.complete) {
      return $_("settings.risk.killSwitch.autoEngage.unmeasurable", {
        values: { cause: causeLabel },
      });
    }
    return $_("settings.risk.killSwitch.autoEngage.armed", {
      values: {
        threshold: autoEngageThreshold.toFixed(2),
        loss: fmt(realizedLoss),
      },
    });
  });

  onMount(() => {
    // A threshold saved before today's loss crossed must arm on open, not
    // wait for an order that the trader may never place.
    rmsService.maybeAutoEngageKillSwitch();
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

  type RejectedKey = DecimalLimitKey | "maxOpenPositions";
  let rejected = $state<Partial<Record<RejectedKey, boolean>>>({});

  // Each field owns its own rejection: a rejected field keeps its error until
  // that field is edited again (and then only clears on success), so fixing
  // one limit never wipes the error message of another.
  function applyLimit(key: RejectedKey, value: string | null) {
    const ok =
      key === "maxOpenPositions"
        ? riskState.setLimit("maxOpenPositions", value)
        : riskState.setLimit(key, value);
    if (ok) {
      const { [key]: _cleared, ...rest } = rejected;
      rejected = rest;
    } else {
      rejected = { ...rejected, [key]: true };
    }
  }

  function onLimitInput(key: DecimalLimitKey, event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    // setLimit refuses anything that is not a non-negative number rather than
    // storing it — a typo must not silently switch a limit off.
    applyLimit(key, value === "" ? null : value);
  }

  // BUG-0557: the field distinguishes three states — empty (no limit),
  // a positive integer or explicit zero (a real ceiling), and anything
  // else, which is rejected inline without touching the stored limit.
  // Parsing is delegated to setLimit: the store is the single place that
  // decides what a count is, so the form cannot accept what the gate rejects.
  function onMaxPositionsInput(event: Event) {
    const trimmed = (event.currentTarget as HTMLInputElement).value.trim();
    applyLimit("maxOpenPositions", trimmed === "" ? null : trimmed);
  }

  async function engage() {
    // FEAT-0526: the confirmation is configurable, default on. Auto-engage
    // cannot prompt, so this only governs the manual button.
    if (config.confirmEngage) {
      const confirmed = await modalState.show(
        $_("settings.risk.killSwitch.engageConfirmTitle"),
        $_("settings.risk.killSwitch.engageConfirmMessage"),
        "confirm",
      );
      if (confirmed !== true) return;
    }
    riskState.engageKillSwitch();
  }

  function onKillSwitchToggle(
    key: "blockAdds" | "blockNonTpSlModifies" | "confirmEngage",
    event: Event,
  ) {
    const checked = (event.currentTarget as HTMLInputElement).checked;
    riskState.setKillSwitchOption(key, checked);
  }

  function onAutoEngageInput(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    const ok = riskState.setKillSwitchOption(
      "autoEngageDailyLossUsdt",
      value === "" ? null : value,
    );
    autoEngageRejected = !ok;
    // Saving a threshold today, when today is already over it, must arm now
    // rather than wait for an order that may never come.
    if (ok) rmsService.maybeAutoEngageKillSwitch();
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
    if (confirmed === true) {
      riskState.resetLimits();
      rejected = {};
    }
  }

  /*
   * BUG-0513, variant c — the panic spot next to the kill switch. Same
   * shared flow as the positions panel button: one confirmation stating
   * count and total notional, then the flatten. Reachable while the kill
   * switch is engaged on purpose — see the sidebar's handler for why.
   */
  let closingAll = $state(false);

  async function closeAll() {
    if (closingAll) return;
    closingAll = true;
    try {
      await confirmAndCloseAllPositions();
    } finally {
      closingAll = false;
    }
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

      <!--
        FEAT-0526: derived from `killSwitchScope()`, the same predicate the
        gate consults, so a toggle cannot leave the text describing the old
        rule. Permitted cases are stated, not merely omitted.
      -->
      <ul class="mt-3 space-y-1 text-[11px] text-[var(--text-secondary)]">
        <li>{$_("settings.risk.killSwitch.scope.opensBlocked")}</li>
        <li>
          {scope.addsBlocked
            ? $_("settings.risk.killSwitch.scope.addsBlocked")
            : $_("settings.risk.killSwitch.scope.addsPermitted")}
        </li>
        <li>
          {scope.nonTpSlModifiesBlocked
            ? $_("settings.risk.killSwitch.scope.modifiesBlocked")
            : $_("settings.risk.killSwitch.scope.modifiesPermitted")}
        </li>
        <li>{$_("settings.risk.killSwitch.scope.alwaysPermitted")}</li>
      </ul>

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

      <div class="mt-4 space-y-3 border-t border-[var(--border-color)] pt-3">
        <p class="text-xs font-semibold">
          {$_("settings.risk.killSwitch.configTitle")}
        </p>

        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold">
              {$_("settings.risk.killSwitch.blockAdds.label")}
            </p>
            <p class="text-[10px] text-[var(--text-secondary)]">
              {$_("settings.risk.killSwitch.blockAdds.hint")}
            </p>
          </div>
          <Toggle
            id="kill-switch-block-adds"
            checked={config.blockAdds}
            onchange={(e) => onKillSwitchToggle("blockAdds", e)}
          />
        </div>

        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold">
              {$_("settings.risk.killSwitch.blockModifies.label")}
            </p>
            <p class="text-[10px] text-[var(--text-secondary)]">
              {$_("settings.risk.killSwitch.blockModifies.hint")}
            </p>
          </div>
          <Toggle
            id="kill-switch-block-modifies"
            checked={config.blockNonTpSlModifies}
            onchange={(e) => onKillSwitchToggle("blockNonTpSlModifies", e)}
          />
        </div>

        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-xs font-semibold">
              {$_("settings.risk.killSwitch.confirmEngage.label")}
            </p>
            <p class="text-[10px] text-[var(--text-secondary)]">
              {$_("settings.risk.killSwitch.confirmEngage.hint")}
            </p>
          </div>
          <Toggle
            id="kill-switch-confirm-engage"
            checked={config.confirmEngage}
            onchange={(e) => onKillSwitchToggle("confirmEngage", e)}
          />
        </div>

        <div class="field-group">
          <label for="kill-switch-auto-engage"
            >{$_("settings.risk.killSwitch.autoEngage.label")}</label
          >
          <div class="flex items-center gap-2">
            <input
              id="kill-switch-auto-engage"
              type="text"
              inputmode="decimal"
              class="input-field w-full min-w-0"
              class:border-danger={autoEngageRejected}
              aria-invalid={autoEngageRejected}
              placeholder={$_("settings.risk.killSwitch.autoEngage.off")}
              value={config.autoEngageDailyLossUsdt ?? ""}
              oninput={onAutoEngageInput}
            />
            <span class="text-[11px] text-[var(--text-secondary)] w-10 shrink-0"
              >USDT</span
            >
          </div>
          <p class="text-[10px] text-[var(--text-secondary)]">
            {$_("settings.risk.killSwitch.autoEngage.hint")}
          </p>
          {#if autoEngageRejected}
            <p
              role="alert"
              class="text-[10px] font-semibold text-[var(--danger-color)]"
            >
              {$_("settings.risk.killSwitch.autoEngage.invalid")}
            </p>
          {/if}
          <p class="text-[10px] text-[var(--text-secondary)]">
            {autoEngageStatus}
          </p>
        </div>
      </div>

      <div class="mt-3">
        {#if riskState.isKillSwitchEngaged}
          <Button
            variant="outline"
            size="sm"
            onClick={release}
          >
            {$_("settings.risk.killSwitch.release")}
          </Button>
        {:else}
          <Button
            variant="danger"
            size="sm"
            onClick={engage}
          >
            {$_("settings.risk.killSwitch.engage")}
          </Button>
        {/if}
      </div>
    </div>
  </section>

  <!-- Daily loss status -->
  <section class="settings-section">
    <h3 class="section-title mb-3">{$_("settings.risk.closeAll.title")}</h3>
    <div
      class="rounded-xl border border-[var(--danger-color)] bg-danger-paired p-4"
    >
      <p class="text-[11px] mt-1 text-[var(--text-secondary)]">
        {$_("settings.risk.closeAll.description")}
      </p>
      <div class="mt-3">
        <Button
          variant="danger"
          size="sm"
          disabled={closingAll}
          onClick={closeAll}
        >
          {$_("settings.risk.closeAll.button")}
        </Button>
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

    <SettingsGrid gap="gap-4">
      {#each fields as field (field.key)}
        <div class="field-group">
          <label for={`risk-${field.key}`}>{field.label}</label>
          <div class="flex items-center gap-2">
            <input
              id={`risk-${field.key}`}
              type="text"
              inputmode="decimal"
              class="input-field w-full min-w-0"
              class:border-danger={rejected[field.key] === true}
              aria-invalid={rejected[field.key] === true}
              aria-describedby={rejected[field.key] === true
                ? `risk-${field.key}-error`
                : undefined}
              placeholder={$_("settings.risk.notConfigured")}
              value={riskState.limits[field.key] ?? ""}
              oninput={(e) => onLimitInput(field.key, e)}
            />
            <span class="text-[11px] text-[var(--text-secondary)] w-10 shrink-0"
              >{field.unit}</span
            >
          </div>
          <p class="text-[10px] text-[var(--text-secondary)]">{field.hint}</p>
          {#if rejected[field.key] === true}
            <p
              id={`risk-${field.key}-error`}
              role="alert"
              class="text-[10px] font-semibold text-[var(--danger-color)]"
            >
              {$_("settings.risk.invalidValue")}
            </p>
          {/if}
        </div>
      {/each}

      <div class="field-group">
        <label for="risk-maxOpenPositions"
          >{$_("settings.risk.maxOpenPositions")}</label
        >
        <div class="flex items-center gap-2">
          <input
            id="risk-maxOpenPositions"
            type="text"
            inputmode="numeric"
            class="input-field w-full min-w-0"
            class:border-danger={rejected.maxOpenPositions === true ||
              riskState.hasInvalidMaxOpenPositions}
            aria-invalid={rejected.maxOpenPositions === true ||
              riskState.hasInvalidMaxOpenPositions}
            aria-describedby={rejected.maxOpenPositions === true
              ? "risk-maxOpenPositions-error"
              : riskState.hasInvalidMaxOpenPositions
                ? "risk-maxOpenPositions-stored-error"
                : undefined}
            placeholder={$_("settings.risk.notConfigured")}
            value={riskState.maxOpenPositionsInputValue}
            oninput={onMaxPositionsInput}
          />
          <span class="text-[11px] text-[var(--text-secondary)] w-10 shrink-0"></span>
        </div>
        <p class="text-[10px] text-[var(--text-secondary)]">
          {$_("settings.risk.maxOpenPositionsHint")}
        </p>
        {#if riskState.hasInvalidMaxOpenPositions}
          <p
            id="risk-maxOpenPositions-stored-error"
            role="alert"
            class="text-[10px] font-semibold text-[var(--danger-color)]"
          >
            {$_("settings.risk.invalidStoredMaxOpenPositions")}
          </p>
        {/if}
        {#if rejected.maxOpenPositions}
          <p
            id="risk-maxOpenPositions-error"
            role="alert"
            class="text-[10px] font-semibold text-[var(--danger-color)]"
          >
            {$_("settings.risk.invalidMaxOpenPositions")}
          </p>
        {/if}
      </div>
    </SettingsGrid>

    <Button
      variant="outline"
      size="sm"
      extraClasses="mt-4"
      onClick={resetAll}
    >
      {$_("settings.risk.resetLimits")}
    </Button>
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
    /* border is supplied by the global .input-field rule (--input-border-color) */
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
