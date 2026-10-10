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
  import { Decimal } from "decimal.js";
  import { get } from "svelte/store";
  import { activeExchange, type TpSlOrder } from "../../services/exchange";
  import { getDisplayMessage } from "../../utils/errorUtils";
  import { _ } from "../../locales/i18n";
  import ModalFrame from "./ModalFrame.svelte";
  import TpSlPriceInput from "./TpSlPriceInput.svelte";
  import { accountState } from "../../stores/account.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { tradeState } from "../../stores/trade.svelte";
  import { validateTpSlPrice, normalizePositionSide, resolveTpSlPosition, type TpSlContext, type FeeRates } from "../../lib/calculators/tpsl";
  // BUG-0666: saving obeys the modify-order confirmation policy.
  import { confirmationPolicyStore } from "../../stores/confirmationPolicy.svelte";
  import ConfirmActionModal from "./ConfirmActionModal.svelte";

  interface Props {
    order: TpSlOrder | null;
    onclose?: () => void;
    onsuccess?: () => void;
  }

  let { order, onclose, onsuccess }: Props = $props();

  let triggerPrice = $state("");
  let amount = $state("");

  // Initialize from props
  $effect(() => {
    if (order) {
      triggerPrice = order.triggerPrice || "";
      amount = String(order.qty ?? order.amount ?? "");
    }
  });
  let loading = $state(false);
  let error = $state("");
  /** Awaiting confirmation — the edit form stays open behind the dialog. BUG-0666. */
  let confirming = $state(false);
  /**
   * The validated save, frozen at Save-click for the dialog to confirm.
   *
   * The form stays live behind the dialog and `order` is a prop the parent
   * can null or swap at any time, so confirming must consume this snapshot —
   * never the live form or the live prop. Otherwise typing behind the open
   * dialog (or a parent swapping the order) would dispatch numbers that
   * never passed validation, or throw on a nulled order.
   */
  let pendingSave: {
    orderId: string;
    symbol: string;
    planType: "PROFIT" | "LOSS";
    triggerPrice: string;
    qty?: string;
    context?: { side: "long" | "short"; entryPrice: Decimal };
    tickSize: Decimal;
  } | null = $state(null);

  /*
   * FEAT-0254: the slider's PnL and ROI modes are arithmetic *about a
   * position* — they need its entry price, leverage and size. A plan can
   * outlive the position it protected, and `TpSlOrder` carries none of those
   * fields, so when no open position matches the plan's symbol there is
   * nothing to compute against.
   *
   * In that case the modal keeps its plain trigger-price field rather than
   * showing a slider driven by assumed numbers. Same discipline as an
   * unsupported order type being shown disabled instead of silently doing
   * something else: a control that looks right and is computing from
   * defaults is worse than no control.
   */
  /*
   * BUG-0553: scoped by positionId; a legacy plan without one borrows
   * context only when exactly one same-symbol position is open. Anything
   * ambiguous resolves to no position, and `tpSlContext` below degrades to
   * the plain trigger-price field — the fail-closed behavior above.
   */
  const position = $derived(
    order
      ? resolveTpSlPosition(
          accountState.positions,
          order,
          settingsState.apiProvider || "bitunix",
        )
      : undefined,
  );

  const tpSlContext = $derived.by<TpSlContext | null>(() => {
    if (!position || position.entryPrice.lte(0) || position.size.lte(0)) return null;
    // Fail closed on an unreadable side — see TpSlCreateModal.
    const side = normalizePositionSide(position.side);
    if (side === null) return null;
    return {
      entryPrice: position.entryPrice,
      leverage: position.leverage.gt(0) ? position.leverage : new Decimal(1),
      side,
      positionSize: position.size,
    };
  });

  /** Price tick from the instrument's quote precision; 0 disables rounding. */
  const tickSize = $derived.by(() => {
    if (!order) return new Decimal(0);
    // Venue-normalized key (BUG-0501).
    const venue = settingsState.apiProvider || "bitunix";
    const precision = marketState.symbolMeta[normalizeSymbol(order.symbol, venue)]?.quotePrecision;
    if (precision === undefined || precision === null) return new Decimal(0);
    return new Decimal(10).pow(-precision);
  });

  /*
   * Rates for the after-fees readout. `tradeState.fees` is the calculator's
   * single hand-entered percentage, so both legs get the same number — which
   * is what `calculateIndividualTp` already does, so the two agree.
   *
   * It is only an estimate, and knowingly so on both legs: the entry rate
   * depends on whether the position was opened market or limit, and the exit
   * rate on how the position actually ends — a resting take-profit pays
   * maker, the same position closed early at market pays taker. The panel has
   * no per-leg rate to offer yet (`tradeState.feeMode` is `maker_taker` or
   * `flat`, and `remoteMakerFee`/`remoteTakerFee` are declared but never
   * assigned), which is why this is a readout and not something the slider
   * computes against.
   *
   * Undefined when no rate is set, so the net line is hidden rather than
   * printed as equal to gross.
   */
  const feeRates = $derived.by<FeeRates | undefined>(() => {
    const raw = tradeState.fees;
    if (raw === null || raw === undefined || raw === "") return undefined;
    try {
      const rate = new Decimal(raw);
      if (!rate.isFinite() || rate.lt(0)) return undefined;
      return { entryPercent: rate, exitPercent: rate };
    } catch {
      return undefined;
    }
  });

  /** The trigger price as a Decimal, for the slider. */
  const triggerDecimal = $derived.by(() => {
    try {
      const parsed = new Decimal(triggerPrice || 0);
      return parsed.isFinite() ? parsed : new Decimal(0);
    } catch {
      return new Decimal(0);
    }
  });

  async function handleSave() {
    if (!order) return;

    if (!triggerPrice) {
      error = $_("bitunixErrors.INVALID_TRIGGER") || "Trigger price is required";
      return;
    }
    if (
      tpSlContext &&
      !validateTpSlPrice(
        order.planType === "PROFIT" ? "TP" : "SL",
        triggerDecimal,
        tpSlContext,
        tickSize.gt(0) ? tickSize : undefined,
      ).valid
    ) {
      error = get(_)("orderGate.invalidTpSl", {
        values: {
          field: order.planType === "PROFIT" ? "TP" : "SL",
          actual: triggerPrice,
          entryPrice: tpSlContext.entryPrice.toString(),
          side: tpSlContext.side,
        },
      });
      return;
    }

    // BUG-0666: the modify goes out unconfirmed unless the dialog asked.
    // Validation runs first and the confirm second. The validated payload
    // is frozen into `pendingSave` here — the confirm consumes the snapshot,
    // so nothing typed behind the open dialog (or swapped by the parent)
    // can reach the venue unvalidated.
    const snapshot = {
      // `sourceOrderId` first (BUG-0292): on a normalised plan, `orderId`
      // is the leg id this app invented ("123-tp") and the venue has never
      // seen it. The row id it was split from is the one that modifies
      // something.
      orderId: order.sourceOrderId || order.orderId || order.id || order.planId || "",
      symbol: order.symbol,
      planType: order.planType,
      triggerPrice: String(triggerPrice),
      context: position
        ? { side: position.side, entryPrice: position.entryPrice }
        : undefined,
      tickSize,
      qty: amount ? String(amount) : undefined,
    };
    if (confirmationPolicyStore.requires("modify-order")) {
      pendingSave = snapshot;
      confirming = true;
      return;
    }
    await dispatchSave(snapshot);
  }

  async function dispatchSave(
    snapshot: NonNullable<typeof pendingSave>,
    confirmedAt?: number,
  ) {
    // Choke point for both paths: a second confirm queued before the dialog
    // teardown flushes must not open a second flight.
    if (loading) return;
    loading = true;
    error = "";

    try {
      await activeExchange().trading.modifyTpSlOrder({
        ...snapshot,
        // Absent when unconfirmed, not undefined — see BUG-0663.
        ...(confirmedAt !== undefined ? { confirmedAt } : {}),
      });
      onsuccess?.();
    } catch (e: unknown) {
      // Prefer rawMessage on BitunixApiError — `e.message` carries the i18n
      // key "apiErrors.generic" and would render as a literal string otherwise.
      error = getDisplayMessage(e, $_) || $_("errors.modifyFailed");
    } finally {
      loading = false;
    }
  }

  function confirmSave(stamped: number) {
    const snapshot = pendingSave;
    pendingSave = null;
    confirming = false;
    if (!snapshot) return;
    void dispatchSave(snapshot, stamped);
  }

  function cancelSave() {
    pendingSave = null;
    confirming = false;
  }

  const confirmFacts = $derived.by(() => {
    const snapshot = pendingSave;
    if (!snapshot) return [];
    // The gate's own field labels, so the dialog reads in the same
    // vocabulary as the refusal it is guarding against (BUG-0663).
    // From the frozen snapshot, not the live form — what the dialog shows
    // is exactly what the confirm dispatches.
    return [
      { label: get(_)("orderGate.fields.symbol"), value: snapshot.symbol },
      {
        label:
          snapshot.planType === "PROFIT"
            ? get(_)("orderGate.fields.takeProfit")
            : get(_)("orderGate.fields.stopLoss"),
        value: snapshot.triggerPrice,
      },
    ];
  });
</script>

<ModalFrame
  title={order?.planType === "PROFIT"
    ? $_("modals.editTP.title")
    : $_("modals.editSL.title")}
  {onclose}
  isOpen={true}
  width={440}
  height={335}
  compact
>
  <div class="flex flex-col gap-4 p-4 min-w-[300px]">
    <div class="text-sm text-[var(--text-secondary)] mb-2">
      {$_("journal.symbol")}: <span class="text-[var(--text-primary)] font-bold"
        >{order?.symbol}</span
      >
    </div>

    {#if tpSlContext}
      <!--
        FEAT-0254: slider entry, available only when the plan's position is
        open and its numbers are known. `onChange` writes the same string the
        plain field would have held, so `handleSave` below is unchanged and
        what the slider shows is what gets submitted.
      -->
      <TpSlPriceInput
        ctx={tpSlContext}
        kind={order?.planType === "PROFIT" ? "TP" : "SL"}
        {tickSize}
        price={triggerDecimal}
        fees={feeRates}
        disabled={loading || confirming}
        onChange={(next) => (triggerPrice = next.toString())}
      />
    {:else}
      <div class="flex flex-col gap-1">
        <label
          for="tpsl-trigger-price"
          class="text-xs font-bold text-[var(--text-secondary)]"
          >{$_("dashboard.tpslManager.trigger")}</label
        >
        <input
          id="tpsl-trigger-price"
          name="tpslTriggerPrice"
          type="number"
          step="any"
          bind:value={triggerPrice}
          disabled={loading || confirming}
          class="w-full bg-[var(--bg-primary)] border border-[var(--input-border-color)] rounded p-2 text-[var(--text-primary)]"
        />
      </div>
    {/if}

    <div class="flex flex-col gap-1">
      <label
        for="tpsl-amount"
        class="text-xs font-bold text-[var(--text-secondary)]"
        >{$_("dashboard.amount")}</label
      >
      <input
        id="tpsl-amount"
        name="tpslAmount"
        type="number"
        step="any"
        bind:value={amount}
        disabled={loading || confirming}
        class="w-full bg-[var(--bg-primary)] border border-[var(--input-border-color)] rounded p-2 text-[var(--text-primary)]"
      />
    </div>

    {#if error}
      <div class="text-xs text-[var(--danger-color)]">{error}</div>
    {/if}

    <div class="flex justify-end gap-2 mt-2">
      <button
        class="px-3 py-1.5 rounded text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]"
        onclick={() => onclose?.()}
        disabled={loading || confirming}
      >
        {$_("common.cancel")}
      </button>
      <button
        class="px-3 py-1.5 rounded text-xs font-bold text-white bg-[var(--accent-color)] hover:bg-opacity-90 disabled:opacity-50"
        onclick={handleSave}
        disabled={loading || confirming}
      >
        {loading ? $_("common.save") + "..." : $_("common.save")}
      </button>
    </div>
  </div>
</ModalFrame>

<!--
  BUG-0666: saving obeys the modify-order confirmation policy. A sibling of
  the edit frame rather than nested in it — each registers its own window,
  and the form stays open (and live — the facts above derive from it)
  behind the dialog. Cancelling returns to the form with nothing sent.
-->
<ConfirmActionModal
  isOpen={confirming}
  action="modify-order"
  facts={confirmFacts}
  onconfirm={confirmSave}
  oncancel={cancelSave}
/>
