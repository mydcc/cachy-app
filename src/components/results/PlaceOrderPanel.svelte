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
  import type { TranslationKey } from "../../locales/schema";

  const exchange = $derived(settingsState.apiProvider);
  const caps = $derived(capabilitiesOf(exchange));

  let entryType = $state<OrderEntryType>("market");
  let timeInForce = $state<TimeInForce>("GTC");
  let submitting = $state(false);
  let result = $state<PlacementResult | null>(null);

  const ALL_TYPES: OrderEntryType[] = ["market", "limit", "trigger"];

  const data = $derived(tradeState.currentTradeData);

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

<section class="place-order-panel">
  <h2 class="section-header">{$_("orderEntry.title")}</h2>

  <!-- Order type -->
  <div class="flex flex-wrap gap-2 mb-3">
    {#each ALL_TYPES as t (t)}
      {@const ok = supportsOrderType(exchange, t)}
      <button
        class="type-btn"
        class:active={entryType === t}
        disabled={!ok}
        title={ok ? undefined : $_(unsupportedReasonKey(exchange, t) as TranslationKey)}
        onclick={() => (entryType = t)}
      >
        {typeLabel(t)}
      </button>
    {/each}
  </div>

  {#if entryType === "limit" && caps.timeInForce.length > 0}
    <div class="field-row">
      <label for="order-tif">{$_("orderEntry.timeInForce")}</label>
      <select id="order-tif" bind:value={timeInForce} class="input-field">
        {#each caps.timeInForce as tif (tif)}
          <option value={tif}>{tif}</option>
        {/each}
      </select>
    </div>
  {/if}

  <!-- What will be sent, from the calculator -->
  {#if data && data.positionSize instanceof Decimal && data.positionSize.gt(0)}
    <dl class="summary">
      <div><dt>{$_("orderEntry.summary.size")}</dt><dd>{data.positionSize.toString()}</dd></div>
      <div><dt>{$_("orderEntry.summary.entry")}</dt><dd>{data.entryPrice.toString()}</dd></div>
      <div><dt>{$_("orderEntry.summary.stop")}</dt><dd>{data.stopLossPrice.toString()}</dd></div>
    </dl>

    {#if !caps.tpSlAtEntry}
      <p class="note warn">{$_("orderEntry.notes.noAttachedProtection")}</p>
    {:else if (data.targets ?? []).length > 1 && !caps.multipleTakeProfits}
      <!-- Saying which target is sent beats silently sending the first. -->
      <p class="note">{$_("orderEntry.notes.firstTargetOnly")}</p>
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

  <button class="submit-btn" disabled={!ready || submitting} onclick={submit}>
    {submitting
      ? $_("orderEntry.submitting")
      : paperState.enabled
        ? $_("orderEntry.submitPaper")
        : $_("orderEntry.submitLive")}
  </button>

  <!-- Outcome. The unprotected case is a persistent banner, not a toast that
       scrolls away: the item requires it surfaced loudly, not logged. -->
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
        <!-- A refusal's `errorDetail` is the gate's English developer string,
             which only repeats what the translated message already said. -->
        {#if result.errorDetail && !result.refusal}
          <span class="detail">{detailText(result.errorDetail)}</span>
        {/if}
      </div>
    {/if}
  {/if}
</section>

<style>
  .place-order-panel {
    margin-top: 1.5rem;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.75rem;
    background: var(--bg-secondary);
  }
  .type-btn {
    padding: 0.4rem 0.9rem;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 0.5rem;
    border: 1px solid var(--border-color);
    background: var(--bg-primary);
    color: var(--text-secondary);
    transition: all 0.15s;
  }
  .type-btn.active {
    background: var(--accent-color);
    color: var(--btn-accent-text);
    border-color: var(--accent-color);
  }
  .type-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .field-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .field-row label {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .input-field {
    background-color: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 0.35rem 0.6rem;
    font-size: 0.8rem;
    color: var(--text-primary);
  }
  .summary {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }
  .summary dt {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }
  .summary dd {
    margin: 0;
    font-family: monospace;
    font-size: 0.85rem;
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
    padding: 0.6rem;
    font-size: 0.85rem;
    font-weight: 800;
    border-radius: 0.5rem;
    border: 1px solid var(--accent-color);
    background: var(--accent-color);
    color: var(--btn-accent-text);
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
