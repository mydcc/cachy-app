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
  import { CONSTANTS } from "../../lib/constants";
  import { tradeState } from "../../stores/trade.svelte";

  import { untrack } from "svelte";
  import { numberInput } from "../../utils/inputUtils";
  import { enhancedInput } from "../../lib/actions/inputEnhancements";
  import { paperState } from "../../stores/paperTrading.svelte";
  import { _ } from "../../locales/i18n";

  import { trackCustomEvent } from "../../services/trackingService";
  import ExchangeAccountControls from "./ExchangeAccountControls.svelte";


  interface Props {
    tradeType: string;
    leverage: string | number | null;
    fees: string | number | null;
  }

  let {
    tradeType = $bindable(),
    // eslint-disable-next-line no-useless-assignment
    leverage = $bindable(),
    fees = $bindable(),
  }: Props = $props();

  function setTradeType(type: string) {
    // Direct assignment instead of .update()
    tradeState.tradeType = type;
    trackCustomEvent("Trade", "ChangeType", type);
  }

  const format = (val: string | number | null) =>
    val === null || val === undefined ? "" : String(val);

  function handleFeesInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const value = target.value;
    // Direct assignment
    tradeState.fees = value === "" ? null : value;
  }

  let remoteLev = $derived(tradeState.remoteLeverage);

  /*
   * FEAT-0328, decision 5 — one leverage, one source.
   *
   * A perpetuals venue has exactly one leverage per symbol, so there is one
   * control for it: the chip in `ExchangeAccountControls`. This component no
   * longer offers a second, editable leverage field that could drift from it.
   *
   * What still has to happen here is the part the chip cannot do on its own:
   * the sizing maths reads `tradeState.leverage`, not `remoteLeverage`, so
   * while a broker reports a leverage that local value is held equal to it.
   * Letting the two drift would let the calculator size at 20x while the
   * exchange sits at 10x — a wrong position size on real money, which is the
   * whole reason this effect exists.
   *
   * Paper trading, and a session with no broker value yet, leave the local
   * value alone: there is no remote truth to mirror, the chip edits it
   * directly, and the calculator is a planning tool again.
   */
  let mirrorLeverage = $derived(!paperState.enabled && remoteLev !== undefined);

  $effect(() => {
    if (!mirrorLeverage || remoteLev === undefined) return;
    const authoritative = String(remoteLev);
    // `untrack` so this effect depends on the remote value only. Reading the
    // local one reactively here would re-run the effect on its own write.
    if (untrack(() => tradeState.leverage) !== authoritative) {
      tradeState.leverage = authoritative;
    }
  });

  // Fee Logic
  let feeMode = $derived(tradeState.feeMode || "maker_taker");
  let entryType = $derived(feeMode.split("_")[0] as "maker" | "taker");
  let targetRemoteFee = $derived(
    entryType === "maker"
      ? tradeState.remoteMakerFee
      : tradeState.remoteTakerFee,
  );

  let isFeeSynced = $derived(
    targetRemoteFee !== undefined && fees === String(targetRemoteFee),
  );

  function syncFee() {
    if (targetRemoteFee !== undefined) {
      // Direct assignment
      tradeState.fees = String(targetRemoteFee);
    }
  }
</script>

<div>
  <h2 class="section-header" id="trade-type-label">
    {$_("dashboard.generalInputs.header")}
  </h2>
  <div class="grid grid-cols-1 gap-3 mb-4">
    <!-- Trade Type Switch -->
    <div
      class="trade-type-switch p-1 rounded-lg flex h-[56px] gap-1"
      role="radiogroup"
      aria-labelledby="trade-type-label"
    >
      <button
        id="trade-long-btn"
        name="tradeType"
        data-track-id="trade-type-long"
        value={CONSTANTS.TRADE_TYPE_LONG}
        class="long w-1/2 h-full flex items-center justify-center text-sm font-semibold uppercase tracking-wider rounded-md"
        class:active={tradeType === CONSTANTS.TRADE_TYPE_LONG}
        role="radio"
        aria-checked={tradeType === CONSTANTS.TRADE_TYPE_LONG}
        onclick={() => setTradeType(CONSTANTS.TRADE_TYPE_LONG)}
        >{$_("dashboard.generalInputs.longButton")}</button
      >
      <button
        id="trade-short-btn"
        name="tradeType"
        data-track-id="trade-type-short"
        value={CONSTANTS.TRADE_TYPE_SHORT}
        class="short w-1/2 h-full flex items-center justify-center text-sm font-semibold uppercase tracking-wider rounded-md"
        class:active={tradeType === CONSTANTS.TRADE_TYPE_SHORT}
        role="radio"
        aria-checked={tradeType === CONSTANTS.TRADE_TYPE_SHORT}
        onclick={() => setTradeType(CONSTANTS.TRADE_TYPE_SHORT)}
        >{$_("dashboard.generalInputs.shortButton")}</button
      >
    </div>

    <!--
      FEAT-0328 — one labelled row: leverage, margin/position mode, fees.

      `ExchangeAccountControls` emits the first two columns as siblings and
      nothing at all on a venue that declares no `accountSettings` support, so
      the row simply narrows rather than showing dead controls.

      Leverage no longer has an input of its own here. There is one leverage
      per symbol on a perpetuals venue, so there is one control for it — the
      chip — and the mirror effect above keeps `tradeState.leverage`, which the
      sizing maths reads, equal to what the exchange holds.
    -->
    <div class="flex flex-wrap items-end gap-3">
      <ExchangeAccountControls />

      <!--
        Fees. Entry stays local until FEAT-0253 gives this a broker source;
        `targetRemoteFee` is declared but nothing populates it yet, which is
        why the sync indicator below never renders today.
      -->
      <div class="flex flex-col gap-1 min-w-0 flex-1">
        <label
          for="fees-input"
          class="text-[11px] font-medium text-[var(--text-secondary)]"
          >{$_("dashboard.generalInputs.fees")}</label
        >
        <div class="relative flex items-center">
          <input
            id="fees-input"
            name="fees"
            type="text"
            data-track-id="input-fees"
            use:numberInput={{ maxDecimalPlaces: 4 }}
            use:enhancedInput={{
              step: 0.01,
              min: 0,
              hasAction: targetRemoteFee !== undefined,
            }}
            value={format(fees)}
            oninput={handleFeesInput}
            class="fee-input w-full"
            class:border-green-500={isFeeSynced}
            class:text-green-400={isFeeSynced}
            placeholder={$_("dashboard.generalInputs.feesPlaceholder")}
          />
          <!--
            The unit belongs next to the number, not only in the label above:
            `values.fees` is a PERCENTAGE (0.06 means 0.06%), and the division
            by 100 happens inside the calculator. Showing "%" here is what
            stops the value being read as a fraction (BUG-0329).
          -->
          <span class="fee-role">
            <span class="fee-unit">%</span>
            {entryType === "maker"
              ? $_("journal.table.maker")
              : $_("journal.table.taker")}
          </span>
          {#if targetRemoteFee !== undefined}
            <button
              class="absolute right-2 top-1/2 -translate-y-1/2 w-indicator h-indicator rounded-full transition-colors duration-300 focus:outline-none z-30"
              style="background-color: {isFeeSynced
                ? 'var(--success-color)'
                : 'var(--warning-color)'};"
              data-track-id="btn-sync-fees"
              title={isFeeSynced
                ? $_("dashboard.generalInputs.syncedWithApi")
                : $_("dashboard.generalInputs.manualOverride", {
                    values: { value: targetRemoteFee + "%" },
                  })}
              onclick={syncFee}
            ></button>
          {/if}
        </div>
      </div>
    </div>

    <!-- Spacer -->
    <div class="mb-0"></div>
  </div>
</div>

<style>
  /*
   * Sized to match the chips `ExchangeAccountControls` renders beside it, so
   * the three columns read as one row rather than three stacked controls.
   */
  .fee-input {
    min-height: 2.25rem;
    padding: 0.5rem 3.5rem 0.5rem 0.6rem;
    font-size: 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border-color);
    background-color: var(--bg-secondary);
    color: var(--text-primary);
    outline: none;
    transition: border-color 0.15s ease;
  }
  .fee-input:focus {
    border-color: var(--accent-color);
  }
  .fee-role {
    position: absolute;
    right: 0.6rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.625rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--text-tertiary);
    pointer-events: none;
  }
  /* The unit reads as part of the number, the role as the annotation. */
  .fee-unit {
    letter-spacing: normal;
    color: var(--text-secondary);
  }
</style>
