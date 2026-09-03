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
  import { CONSTANTS, VENUE_DEFAULT_FEE_RATES } from "../../lib/constants";
  import { Decimal } from "decimal.js";
  import { tradeState } from "../../stores/trade.svelte";
  import {
    resolveFeeRate,
    entryRoleForOrderType,
    derivedRatesFromStore,
  } from "../../lib/fees/feeProvenance";

  import { untrack } from "svelte";
  import { numberInput } from "../../utils/inputUtils";
  import { enhancedInput } from "../../lib/actions/inputEnhancements";
  import { paperState } from "../../stores/paperTrading.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { _ } from "../../locales/i18n";

  import { trackCustomEvent } from "../../services/trackingService";
  import { activeExchange } from "../../services/exchange";
  import ExchangeAccountControls from "./ExchangeAccountControls.svelte";


  interface Props {
    tradeType: string;
    leverage: string | number | null;
  }

  let { tradeType = $bindable(), leverage = $bindable() }: Props = $props();

  function setTradeType(type: string) {
    // Direct assignment instead of .update()
    tradeState.tradeType = type;
    trackCustomEvent("Trade", "ChangeType", type);
  }

  let remoteLev = $derived(tradeState.remoteLeverage);
  const supported = $derived(activeExchange().supports.accountSettings);

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

  /*
   * Fee logic — FEAT-0253.
   *
   * Three sources feed one number, and the panel always says which one won:
   *
   *   1. the rate derived from this account's own fills   → "from broker"
   *   2. the documented venue default, untouched          → "assumed"
   *   3. a value the user typed in Settings               → "manual"
   *
   * No sync button: there is nothing left to synchronize by hand. The rates
   * arrive with the ordinary journal sync (`feeRateService`), the same way
   * `remoteLeverage` arrives, and this panel mirrors the result into the
   * `tradeState` fields the sizing maths reads.
   *
   * The two legs are resolved separately (decision 3): entry follows the order
   * type actually selected — a market order is a taker fill, a limit order a
   * maker fill — while the exit follows the user's declared assumption, which
   * defaults to taker because how a position closes is unknowable while the
   * plan is being made.
   */
  const exchange = $derived(settingsState.apiProvider);
  let feeRates = $derived(settingsState.feeRates[exchange]);
  const venueDefaults = $derived(
    VENUE_DEFAULT_FEE_RATES[exchange] ?? VENUE_DEFAULT_FEE_RATES.bitunix,
  );

  // Guard the degenerate input so a mirrored rate can never be `""` or
  // `undefined`: a Settings fee field the user cleared stores `""`. That falls
  // back to the flat default (0.06) rather than feeding the calculator a
  // zero-fee sizing. The check is explicit, not `||`: a literal `"0"` (a venue
  // promo or rebate rate) is a legitimate zero-percent fee and must pass
  // through; only undefined and the empty string are degenerate.
  function settingsRateFor(role: "maker" | "taker"): string {
    const raw = feeRates[role];
    return raw === undefined || raw === "" ? CONSTANTS.DEFAULT_FEES : raw;
  }

  const derivedRates = $derived(
    derivedRatesFromStore(
      tradeState.remoteMakerFee,
      tradeState.remoteTakerFee,
      tradeState.remoteFeeSamples,
    ),
  );

  // The entry leg's role is dictated by the order type, not chosen; the exit
  // leg's is the assumption the Settings MAKER/TAKER buttons select.
  const entryRole = $derived(entryRoleForOrderType(tradeState.entryOrderType));
  const exitRole = $derived<"maker" | "taker">(
    settingsState.feePreference === "taker" ? "taker" : "maker",
  );

  function resolveFor(role: "maker" | "taker") {
    const raw = settingsRateFor(role);
    return resolveFeeRate(role, {
      derived: derivedRates,
      settingsRate: new Decimal(raw),
      // Passed through verbatim so a rate the user typed as "0.0600" is
      // mirrored and shown as "0.0600", not silently normalised to "0.06".
      settingsDisplay: raw,
      venueDefault: new Decimal(venueDefaults[role]),
      isPaperTrading: paperState.enabled,
    });
  }

  const entryFee = $derived(resolveFor(entryRole));
  const exitFee = $derived(resolveFor(exitRole));

  /*
   * The headline field keeps showing the exit-leg rate, as it did before the
   * split: that is the rate the Settings MAKER/TAKER choice governs, and it is
   * the conservative one of the two. It is read-only exactly when it comes
   * from the broker — mirroring the leverage field since FEAT-0328 — and stays
   * editable in paper trading and whenever no rate could be derived.
   */
  const headline = $derived(exitFee);
  const headlineReadonly = $derived(headline.provenance === "broker");
  const activeRole = $derived(exitRole);

  function provenanceLabel(provenance: "broker" | "assumed" | "manual"): string {
    if (provenance === "broker") return $_("dashboard.generalInputs.feeFromBroker");
    if (provenance === "manual") return $_("dashboard.generalInputs.feeManual");
    return $_("dashboard.generalInputs.feeAssumed");
  }

  function roleLabel(role: "maker" | "taker"): string {
    return role === "maker" ? $_("journal.table.maker") : $_("journal.table.taker");
  }

  /**
   * Editing the headline writes back to the Settings rate for that role — the
   * only place a user-entered rate lives. Refused while the value is the
   * broker's: overwriting a number the exchange actually charged with a typed
   * guess is the exact confusion this item exists to remove.
   */
  function commitHeadline(raw: string) {
    if (headlineReadonly) return;
    settingsState.feeRates = {
      ...settingsState.feeRates,
      [exchange]: { ...feeRates, [activeRole]: raw.trim() },
    };
  }

  $effect(() => {
    // `untrack` so each effect depends on the resolved rate only. Reading the
    // local value reactively would re-run the effect on its own write. As with
    // the leverage mirror, write `tradeState` directly — those are the values
    // the sizing maths reads; there is no `fees` prop anymore.
    const flat = headline.display;
    if (untrack(() => tradeState.fees) !== flat) tradeState.fees = flat;
  });

  $effect(() => {
    const entry = entryFee.rate;
    if (!untrack(() => tradeState.entryFees)?.equals(entry)) {
      tradeState.entryFees = entry;
    }
  });

  $effect(() => {
    const exit = exitFee.rate;
    if (!untrack(() => tradeState.exitFees)?.equals(exit)) {
      tradeState.exitFees = exit;
    }
  });
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
        Fallback: venues with accountSettings: false (e.g., Bitget) have no
        leverage chip. Restore the input here so users can still edit leverage
        for calculator sizing. Sized to match the chip height.
      -->
      {#if !supported}
        <div class="flex flex-col gap-1 min-w-0">
          <label
            for="leverage-fallback"
            class="text-[11px] font-medium text-[var(--text-secondary)]"
            >{$_("exchange.accountSettings.leverageEdit")}</label
          >
          <input
            id="leverage-fallback"
            name="leverage"
            type="text"
            inputmode="numeric"
            data-track-id="input-leverage-fallback"
            use:numberInput={{ maxDecimalPlaces: 0 }}
            use:enhancedInput={{ step: 1, min: 1 }}
            value={leverage ?? ""}
            onchange={(e) => {
              const val = (e.target as HTMLInputElement).value.trim();
              leverage = val === "" ? null : val;
            }}
            class="fee-input w-full"
            placeholder="1"
          />
        </div>
      {/if}

      <!--
        Fees. FEAT-0253: the field shows the exit-leg rate and says where that
        number came from. It is read-only exactly when the broker supplied it —
        the same rule the leverage chip follows — and editable otherwise, which
        covers paper trading and a fresh account with no fills yet.

        Below it, both legs are spelled out: which role each pays, why it pays
        that role, and the provenance of each rate. A user must be able to see
        at a glance that the exit number is an assumption and not a quote.
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
            readonly={headlineReadonly}
            value={headline.display}
            onchange={(e) => commitHeadline((e.target as HTMLInputElement).value)}
            class="fee-input w-full"
            aria-describedby="fee-provenance"
          />
          <!--
            The unit belongs next to the number, not only in the label above:
            `values.fees` is a PERCENTAGE (0.06 means 0.06%), and the division
            by 100 happens inside the calculator. Showing "%" here is what
            stops the value being read as a fraction (BUG-0329).
          -->
          <span class="fee-role">
            <span class="fee-unit">%</span>
            {roleLabel(activeRole)}
          </span>
        </div>
        <div class="fee-legs" id="fee-provenance">
          <span class="fee-leg">
            <span class="fee-leg-name"
              >{$_("dashboard.generalInputs.feeEntryLeg")}</span
            >
            <span class="fee-leg-value"
              >{roleLabel(entryRole)} {entryFee.display}%</span
            >
            <span class="fee-badge" data-provenance={entryFee.provenance}
              >{provenanceLabel(entryFee.provenance)}</span
            >
          </span>
          <span class="fee-leg">
            <span class="fee-leg-name"
              >{$_("dashboard.generalInputs.feeExitLeg")}</span
            >
            <span class="fee-leg-value"
              >{roleLabel(exitRole)} {exitFee.display}%</span
            >
            <span class="fee-badge" data-provenance={exitFee.provenance}
              >{provenanceLabel(exitFee.provenance)}</span
            >
          </span>
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
    /* 3.5rem right leaves room for the role overlay; 0.6rem left not on scale */
    padding: var(--space-2) 3.5rem var(--space-2) 0.6rem;
    font-size: var(--text-xs);
    border-radius: var(--radius-md);
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
  .fee-legs {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    font-size: 0.625rem;
  }
  .fee-leg {
    display: flex;
    align-items: baseline;
    gap: 0.375rem;
    min-width: 0;
  }
  .fee-leg-name {
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .fee-leg-value {
    color: var(--text-primary);
    font-weight: 600;
    white-space: nowrap;
  }
  /*
   * The provenance badge is the point of the whole feature, so it is legible
   * rather than decorative — but it must never out-shout the number itself.
   * Only a broker-sourced rate gets the accent; an assumption is deliberately
   * quiet, and a manual override sits between the two. Theme variables only:
   * a hardcoded colour would break across the 20+ themes.
   */
  .fee-badge {
    padding: 0 0.3rem;
    border-radius: var(--radius-sm, 0.25rem);
    border: 1px solid var(--border-color);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    white-space: nowrap;
  }
  .fee-badge[data-provenance="broker"] {
    color: var(--accent-color);
    border-color: var(--accent-color);
  }
  .fee-badge[data-provenance="manual"] {
    color: var(--text-secondary);
  }
</style>
