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
  FEAT-0021 — placing the position the calculator just sized.

  Everything here reads from `tradeState.currentTradeData`, the calculator's
  own output, so the numbers submitted are the numbers displayed. The
  FEAT-0011 gate re-derives them anyway and refuses a mismatch; this panel
  does not get to be the only thing standing between a typo and an order.

  Order types come from `exchangeCapabilities` — a seam FEAT-0017 replaces.
  An unsupported type is shown disabled with a reason rather than omitted,
  because a missing control looks like a missing feature.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import { tradeState } from "../../stores/trade.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { paperState } from "../../stores/paperTrading.svelte";
  import { modalState } from "../../stores/modal.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { toastService } from "../../services/toastService.svelte";
  import {
    capabilitiesOf,
    supportsOrderType,
    unsupportedReasonKey,
    type OrderEntryType,
    type TimeInForce,
  } from "../../services/exchangeCapabilities";
  import {
    orderPlacementService,
    type PlacementResult,
  } from "../../services/orderPlacementService";
  import { activeExchange } from "../../services/exchange";
  import { translateRefusal, MAX_ACCOUNT_STATE_AGE_MS } from "../../services/orderGate";
  import { marketState } from "../../stores/market.svelte";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { formatDynamicDecimal, parseDecimal } from "../../utils/utils";
  import type { TranslationKey } from "../../locales/schema";

  const exchange = $derived(settingsState.apiProvider);
  const caps = $derived(capabilitiesOf(exchange));

  let entryType = $state<OrderEntryType>("market");
  let timeInForce = $state<TimeInForce>("GTC");
  let submitting = $state(false);
  let result = $state<PlacementResult | null>(null);

  // Trigger is omitted since Bitunix does not support trigger orders via API
  const ALL_TYPES: OrderEntryType[] = ["market", "limit"];

  function selectOrderType(t: OrderEntryType) {
    entryType = t;
    if (t === "market") {
      settingsState.autoUpdatePriceInput = true;
      const currentSym = tradeState.symbol;
      if (currentSym) {
        const norm = normalizeSymbol(currentSym, exchange === "bitget" ? "bitget" : "bitunix");
        const livePrice = marketState.data[norm]?.lastPrice;
        if (livePrice) {
          tradeState.entryPrice = new Decimal(livePrice).toString();
        }
      }
    }
  }

  const data = $derived(tradeState.currentTradeData);

  const levDecimal = $derived(parseDecimal(tradeState.leverage));
  const marginCost = $derived(
    data && data.positionSize instanceof Decimal && data.entryPrice instanceof Decimal && levDecimal.gt(0)
      ? data.positionSize.mul(data.entryPrice).div(levDecimal)
      : null
  );

  const meta = $derived(
    data?.symbol ? marketState.symbolMeta[normalizeSymbol(data.symbol, "bitunix")] : undefined,
  );

  const hasMeta = $derived(
    exchange !== "bitunix" || meta !== undefined,
  );

  const tradingAvailable = $derived(
    !meta || (meta.symbolStatus === "OPEN" && meta.isApiSupported !== false),
  );

  const isBelowMinVolume = $derived(
    meta?.minTradeVolume && data?.positionSize instanceof Decimal
      ? data.positionSize.lt(new Decimal(meta.minTradeVolume))
      : false,
  );

  const isAboveMaxVolume = $derived.by(() => {
    if (!meta || !(data?.positionSize instanceof Decimal)) return false;
    const max = entryType === "market" ? meta.maxMarketOrderVolume : meta.maxLimitOrderVolume;
    return max ? data.positionSize.gt(new Decimal(max)) : false;
  });

  const volumeValid = $derived(!isBelowMinVolume && !isAboveMaxVolume);

  // The calculator produces a size only when the inputs make one derivable.
  // AC 1: Trading-pair metadata is available in a store before submit action is enabled.
  // AC 3: Below minTradeVolume or above max order volume disables submit action.
  // AC 4: symbolStatus != OPEN or isApiSupported == false shows trading as unavailable.
  const ready = $derived(
    data !== null &&
      data.positionSize instanceof Decimal &&
      data.positionSize.gt(0) &&
      hasMeta &&
      tradingAvailable &&
      volumeValid,
  );

  $effect(() => {
    if (data?.symbol && exchange === "bitunix" && !meta) {
      activeExchange().account.fetchTradingPairInfo(data.symbol);
    }
  });

  const typeLabel = (t: OrderEntryType) =>
    $_(`orderEntry.type.${t}` as TranslationKey);

  /**
   * How an outcome reads to the trader.
   *
   * A gate refusal has to go through `translateRefusal`: its messages name the
   * field and the numbers that disagreed, so translating the bare key leaves
   * literal `{field}` and `{age}` on screen.
   */
  function errorText(r: PlacementResult): string {
    if (r.refusal) {
      return translateRefusal(r.refusal, (key, options) =>
        $_(key as TranslationKey, options),
      );
    }
    return $_((r.errorKey ?? "orderEntry.errors.entryRejected") as TranslationKey);
  }

  /**
   * The exchange's own text, when there is any.
   *
   * Some errors carry an i18n key here rather than prose — "apiErrors.generic"
   * is one. svelte-i18n echoes a key it does not know, so a round trip through
   * `$_` translates the ones that are keys and leaves real exchange text
   * alone, instead of printing a dotted path at the trader.
   */
  function detailText(detail: string): string {
    const translated = $_(detail as TranslationKey);
    return translated === detail ? detail : translated;
  }

  function isAccountStateStale(): boolean {
    const at = tradeState.remoteAccountStateAt;
    return at === undefined || Date.now() - at > MAX_ACCOUNT_STATE_AGE_MS;
  }

  async function submit() {
    if (!ready || !data || submitting) return;

    const isPaper = paperState.enabled;
    const confirmed = await modalState.show(
      isPaper
        ? $_("orderEntry.confirm.titlePaper")
        : $_("orderEntry.confirm.titleLive"),
      $_("orderEntry.confirm.message", {
        values: {
          side: $_(
            (data.tradeType === "short"
              ? "orderEntry.side.short"
              : "orderEntry.side.long") as TranslationKey,
          ),
          qty: data.positionSize.toString(),
          symbol: data.symbol,
          type: typeLabel(entryType),
          stop: data.stopLossPrice.toString(),
        },
      }),
      "confirm",
    );
    if (confirmed !== true) return;

    submitting = true;
    result = null;
    try {
      // The gate refuses an entry whose leverage/margin-mode read is older
      // than its limit, and nothing refreshes that read except a symbol
      // change — so a panel left open for a minute refuses every order and
      // tells the trader to refresh something they have no control over.
      // Re-read it here instead. A failed read leaves the old timestamp to
      // age out, so the gate still refuses rather than being talked round.
      if (!isPaper && isAccountStateStale()) {
        await activeExchange().account.fetchLeverageMarginMode(data.symbol);
      }

      result = await orderPlacementService.placeEntryGroup({
        exchange,
        symbol: data.symbol,
        tradeType: data.tradeType,
        entryType,
        qty: data.positionSize,
        entryPrice: data.entryPrice,
        stopLossPrice: data.stopLossPrice,
        takeProfits: (data.targets ?? [])
          .map((t) => t.price)
          .filter((p) => p instanceof Decimal && p.gt(0)),
        accountSize: data.accountSize,
        riskPercentage: data.riskPercentage,
        leverage: data.leverage,
        marginMode: tradeState.remoteMarginMode,
        accountStateAt: tradeState.remoteAccountStateAt,
        timeInForce: entryType === "limit" ? timeInForce : undefined,
      });

      if (result.unprotected) {
        // The one outcome this whole flow exists to make impossible to miss.
        // A toast is not enough on its own, so the banner below stays until
        // the next submission.
        toastService.error($_("orderEntry.errors.unprotected"));
      } else if (!result.entryPlaced) {
        toastService.error(errorText(result));
      } else {
        toastService.success($_("orderEntry.placed"));
      }
    } catch (e) {
      uiState.showError($_("orderEntry.errors.entryRejected"));
      result = {
        entryPlaced: false,
        stopLoss: "none",
        takeProfit: "none",
        unprotected: false,
        errorDetail: e instanceof Error ? e.message : String(e),
      };
    } finally {
      submitting = false;
    }
  }
</script>

<div>
  <h2 class="section-header">{$_("orderEntry.title")}</h2>

  <!-- Order type & TimeInForce row -->
  <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
    <div class="flex items-center gap-2">
      {#each ALL_TYPES as t (t)}
        {@const exchangeSupports = supportsOrderType(exchange, t)}
        <button
          class="type-btn"
          class:active={entryType === t}
          disabled={!exchangeSupports}
          title={!exchangeSupports ? $_(unsupportedReasonKey(exchange, t) as TranslationKey) : undefined}
          onclick={() => selectOrderType(t)}
        >
          {typeLabel(t)}
        </button>
      {/each}
    </div>

    {#if entryType === "limit" && caps.timeInForce.length > 0}
      <div class="flex items-center gap-1.5">
        <label for="order-tif" class="text-xs font-semibold text-[var(--text-secondary)]">
          {$_("orderEntry.timeInForce")}
        </label>
        <select id="order-tif" bind:value={timeInForce} class="input-field text-xs py-1 px-2">
          {#each caps.timeInForce as tif (tif)}
            <option value={tif}>{tif}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <!-- What will be sent, from the calculator -->
  {#if data && data.positionSize instanceof Decimal && data.positionSize.gt(0)}
    <dl class="summary">
      <div><dt>{$_("orderEntry.summary.size")}</dt><dd>{formatDynamicDecimal(data.positionSize, meta?.basePrecision ?? 4)}</dd></div>
      {#if marginCost}
        <div><dt>Margin</dt><dd>{formatDynamicDecimal(marginCost, 2)}</dd></div>
      {/if}
      <div><dt>{$_("orderEntry.summary.entry")}</dt><dd>{formatDynamicDecimal(data.entryPrice, meta?.quotePrecision ?? 2)}</dd></div>
      <div><dt>{$_("orderEntry.summary.stop")}</dt><dd>{formatDynamicDecimal(data.stopLossPrice, meta?.quotePrecision ?? 2)}</dd></div>
    </dl>

    {#if !caps.tpSlAtEntry}
      <p class="note warn">{$_("orderEntry.notes.noAttachedProtection")}</p>
    {/if}

    {#if !hasMeta}
      <p class="note">{$_("orderEntry.errors.metadataLoading")}</p>
    {:else if meta && !tradingAvailable}
      <div class="outcome danger" role="alert" style="margin-bottom: 0.75rem;">
        <strong>{$_("orderEntry.errors.tradingUnavailable")}</strong>
        {#if meta.symbolStatus && meta.symbolStatus !== "OPEN"}
          <span class="detail">{$_("dashboard.symbolInfo.statusStop")}: {meta.symbolStatus}</span>
        {:else if meta.isApiSupported === false}
          <span class="detail">{$_("dashboard.symbolInfo.apiNotSupported")}</span>
        {/if}
      </div>
    {:else if isBelowMinVolume}
      <p class="note warn">{$_("orderEntry.errors.belowMinTradeVolume", { values: { min: meta?.minTradeVolume ?? "" } })}</p>
    {:else if isAboveMaxVolume}
      <p class="note warn">{$_("orderEntry.errors.exceedsMaxOrderVolume", { values: { max: (entryType === "market" ? meta?.maxMarketOrderVolume : meta?.maxLimitOrderVolume) ?? "" } })}</p>
    {/if}
  {:else}
    <p class="note">{$_("orderEntry.notReady")}</p>
  {/if}

  <button
    class="submit-btn"
    class:paper-mode-btn={paperState.enabled}
    disabled={!ready || submitting}
    onclick={submit}
  >
    {#if submitting}
      {$_("orderEntry.submitting")}
    {:else if paperState.enabled}
      {$_("orderEntry.submitPaper")}
    {:else}
      {$_("orderEntry.submitLive")}
    {/if}
  </button>

  <!-- Outcome -->
  {#if result}
    {#if result.unprotected}
      <div class="outcome danger" role="alert">
        <strong>{$_("orderEntry.errors.unprotectedTitle")}</strong>
        <p>{$_("orderEntry.errors.unprotected")}</p>
      </div>
    {:else if result.entryPlaced}
      <div class="outcome ok">
        {$_("orderEntry.result.placed", {
          values: {
            stop: $_(`orderEntry.protection.${result.stopLoss}` as TranslationKey),
            target: $_(`orderEntry.protection.${result.takeProfit}` as TranslationKey),
          },
        })}
      </div>
    {:else}
      <div class="outcome danger" role="alert">
        {errorText(result)}
        {#if result.errorDetail && !result.refusal}
          <span class="detail">{detailText(result.errorDetail)}</span>
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .type-btn {
    padding: 0.35rem 0.6rem;
    font-size: 0.8125rem;
    font-weight: 700;
    border: none;
    border-bottom: 2px solid transparent;
    border-radius: 0;
    background: transparent;
    color: var(--text-secondary);
    transition: all 0.15s;
    cursor: pointer;
  }
  .type-btn:hover:not(:disabled) {
    color: var(--text-primary);
  }
  .type-btn.active {
    color: var(--accent-color);
    border-bottom-color: var(--accent-color);
  }
  .type-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
    margin-bottom: 0.75rem;
    background: var(--bg-tertiary);
    padding: 0.5rem 0.6rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border-color);
  }
  .summary dt {
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }
  .summary dd {
    margin: 0;
    font-family: monospace;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    word-break: break-all;
  }
  .note {
    font-size: 0.7rem;
    color: var(--text-secondary);
    margin-bottom: 0.75rem;
  }
  .note.warn {
    color: var(--warning-color);
  }
  .submit-btn {
    width: 100%;
    padding: 0.65rem 1rem;
    font-size: 0.875rem;
    font-weight: 700;
    border-radius: 0.375rem;
    border: 1px solid var(--accent-color);
    background-color: var(--accent-color);
    color: var(--btn-accent-text);
    transition: background-color 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
    cursor: pointer;
  }
  .submit-btn:hover:not(:disabled) {
    background-color: var(--accent-color-hover);
    border-color: var(--accent-color-hover);
  }
  .submit-btn.paper-mode-btn {
    background-color: var(--success-color);
    border-color: var(--success-color);
    color: var(--text-on-success);
  }
  .submit-btn.paper-mode-btn:hover:not(:disabled) {
    opacity: 0.9;
  }
  .submit-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .outcome {
    margin-top: 0.75rem;
    padding: 0.6rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    border: 1px solid;
  }
  .outcome.ok {
    border-color: var(--success-color);
    color: var(--success-color);
  }
  .outcome.danger {
    border-color: var(--danger-color);
    color: var(--danger-color);
    font-weight: 700;
  }
  .outcome .detail {
    display: block;
    margin-top: 0.25rem;
    font-weight: 400;
    opacity: 0.85;
    word-break: break-word;
  }
</style>
