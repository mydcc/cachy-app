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
  import { onMount, untrack } from "svelte";
  import { Decimal } from "decimal.js";
  import { settingsState } from "../../stores/settings.svelte";
  import { tradeState } from "../../stores/trade.svelte";
  import { accountState } from "../../stores/account.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { marketWatcher } from "../../services/marketWatcher";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { uiState } from "../../stores/ui.svelte";
  import { _ } from "../../locales/i18n";
  import { tradeService } from "../../services/tradeService";
  import { getDisplayMessage } from "../../utils/errorUtils";
  import { unwrapApiEnvelope } from "../../utils/utils";
  import { appFetch } from "../../lib/appAuth";
  import type { OMSPosition } from "../../services/omsTypes";
  import type { NormalizedOrder, NormalizedPosition } from "../../types/bitunix";
  import type { TranslationKey } from "../../locales/schema";

  // Sub-components
  import PositionsList from "./PositionsList.svelte";
  import AccountSummary from "./AccountSummary.svelte";
  import OpenOrdersList from "./OpenOrdersList.svelte";
  import OrderHistoryList from "./OrderHistoryList.svelte";
  import TpSlList from "./TpSlList.svelte";

  let isOpen = $state(true);

  // Data State
  // Using store subscription for positions to react to WebSocket updates
  // For orders/history, we still fetch, but accountStore also has openOrders

  interface AccountInfo {
    available: number | string;
    margin: number | string;
    totalUnrealizedPnL: number | string;
    marginCoin: string;
    frozen: number | string;
    transfer: number | string;
    bonus: number | string;
    positionMode: string;
    crossUnrealizedPNL: number | string;
    isolationUnrealizedPNL: number | string;
  }

  // Pending orders live in accountState (hydrated from REST on mount/tab
  // switch below, kept current afterwards by the WS order channel via
  // accountState.updateOrderFromWs) — mapped back to the NormalizedOrder
  // shape OpenOrdersList already renders, so a new order/fill/cancel shows
  // up immediately instead of only after the next manual tab switch.
  let openOrders: NormalizedOrder[] = $derived(
    accountState.openOrders.map((o) => ({
      id: o.orderId,
      orderId: o.orderId,
      symbol: o.symbol,
      type: o.type,
      side: o.side.toUpperCase(),
      price: o.price.toString(),
      amount: o.amount.toString(),
      filled: o.filled.toString(),
      status: o.status,
      time: o.timestamp,
      // Pending orders haven't been filled yet, so both are always zero —
      // OpenOrdersList doesn't render either, this only satisfies the
      // shared NormalizedOrder shape.
      fee: "0",
      realizedPNL: "0",
      mtime: o.mtime,
      leverage: o.leverage,
      marginMode: o.marginMode,
      positionMode: o.positionMode,
      tpPrice: o.tpPrice,
      tpStopType: o.tpStopType,
      tpOrderType: o.tpOrderType,
      slPrice: o.slPrice,
      slStopType: o.slStopType,
      slOrderType: o.slOrderType,
    })),
  );
  let historyOrders: NormalizedOrder[] = $state([]);
  let accountInfo: AccountInfo = $state({
    available: 0,
    margin: 0,
    totalUnrealizedPnL: 0,
    marginCoin: "USDT",
    frozen: 0,
    transfer: 0,
    bonus: 0,
    positionMode: "",
    crossUnrealizedPNL: 0,
    isolationUnrealizedPNL: 0,
  });

  // Loading State
  let loadingPositions = $state(false);
  let loadingOrders = $state(false);
  let loadingHistory = $state(false);

  // Error State
  let errorPositions = $state("");
  let errorOrders = $state("");
  let errorHistory = $state("");
  let errorAccount = $state("");

  // Tab State
  type Tab = "positions" | "orders" | "tpsl" | "history";
  let activeTab: Tab = $state("positions");

  // Context Menu State
  let showContextMenu = $state(false);
  let contextMenuX = $state(0);
  let contextMenuY = $state(0);

  function translateError(data: { code?: string | number; error?: string }): string {
    if (data.code && typeof $_ === "function") {
      const key = `bitunixErrors.${data.code}`;
      // Runtime-checked dynamic key — see syncService.ts's identical pattern.
      const translation = $_(key as TranslationKey);
      // Basic check if translation exists (usually if it returns same key, it's missing)
      if (translation && translation !== key) return translation;
    }
    return data.error || $_("apiErrors.generic");
  }

  // Map AccountState Position to OMSPosition
  // Available/margin/frozen come from the WS-live balance channel once it
  // has pushed at least once; PnL is always derived live from open
  // positions (also WS-fed). Both fall back to the last REST snapshot
  // (accountInfo) before that, rather than showing 0 until the first push.
  let liveAsset = $derived(accountState.assets.find((a) => a.currency === "USDT"));

  // Mark price for a position: Bitunix's REST/WS position endpoints never
  // return one (see BUG-0055) — the only real source is marketState, fed by
  // the public WS `price` channel (`mp` field) or, for exchanges that do
  // return it on the position itself (e.g. Bitget), the account store's
  // snapshot. Prefer the live value; `.gt(0)` treats accountState's
  // structural `Decimal(0)` default (Bitunix: always; Bitget: only before
  // its first snapshot) as "no data" rather than a real zero price.
  function resolveMarkPrice(p: (typeof accountState.positions)[number]) {
    const live = marketState.data[normalizeSymbol(p.symbol, "bitunix")]?.markPrice;
    if (live && live.gt(0)) return live;
    if (p.markPrice && p.markPrice.gt(0)) return p.markPrice;
    return undefined;
  }

  let mappedPositions = $derived(
    accountState.positions.map((p): OMSPosition => ({
        symbol: p.symbol,
        side: p.side,
        amount: p.size, // Map size to amount
        entryPrice: p.entryPrice,
        unrealizedPnl: p.unrealizedPnl,
        leverage: p.leverage,
        marginMode: p.marginMode as "cross" | "isolated",
        liquidationPrice: p.liquidationPrice,
        margin: p.margin,
        markPrice: resolveMarkPrice(p),
        size: p.size,
        // REST-only, never sent over WS — 0 means "not hydrated yet", not a
        // real margin rate, so treat it as absent rather than show "0%".
        marginRate: p.marginRate.gt(0) ? p.marginRate : undefined,
        realizedPnl: p.realizedPnl,
    }))
  );

  // Total notional value of every open position — client-computed (Σ size ×
  // mark/entry price), matching how Bitunix's own Assets panel derives it;
  // there is no API field for it.
  let totalPositionSize = $derived(
    mappedPositions.reduce(
      (sum, p) => sum.plus(p.amount.mul(p.markPrice || p.entryPrice)),
      new Decimal(0),
    ),
  );

  // Subscribe to live price updates for every symbol with an open position —
  // otherwise mark price only ever arrives for whichever symbol happens to
  // be the active chart/favorite, not for positions the user isn't actively
  // viewing. Depends on a stable, order-independent key (not the positions
  // array itself) so this doesn't re-subscribe on every PnL tick.
  let positionSymbolsKey = $derived(
    Array.from(
      new Set(accountState.positions.map((p) => normalizeSymbol(p.symbol, "bitunix"))),
    )
      .sort()
      .join(","),
  );

  $effect(() => {
    const symbols = positionSymbolsKey ? positionSymbolsKey.split(",") : [];
    for (const sym of symbols) marketWatcher.register(sym, "price", "stateless");
    return () => {
      for (const sym of symbols) marketWatcher.unregister(sym, "price", "stateless");
    };
  });

  async function fetchPositions() {
    const provider = settingsState.apiProvider || "bitunix";
    const keys = settingsState.apiKeys[provider];

    if (!keys?.key || !keys?.secret) return;

    loadingPositions = true;
    errorPositions = "";
    try {
      const response = await appFetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: provider,
          apiKey: keys.key,
          apiSecret: keys.secret,
        }),
      });
      const json = await response.json();
      // /api/positions responds via jsonSuccess/jsonError
      // (src/utils/apiResponse.ts): { success: true, data: { positions } }
      // or { success: false, error: { code, message } } — NOT the flat
      // { positions } / { error } shape the rest of this file's fetchers
      // use (those hit /api/orders, which still returns the old flat
      // format). Reading `data.positions`/`data.error` directly here used
      // to always miss — no error ever surfaced, and hydratePositions() was
      // never called, so the tab silently stayed empty no matter what the
      // exchange actually returned (BUG-0060).
      const { data, code, message } = unwrapApiEnvelope<{ positions: NormalizedPosition[] }>(json);
      if (data === null) {
        errorPositions = translateError({ code, error: message });
      } else if (data.positions) {
        // hydratePositions parses through the same safe Decimal path as WS
        // updates and fills in positionId — a raw `accountState.positions =
        // data.positions` assignment used to silently violate the Position
        // type (string fields, no positionId), which both risked a render
        // crash and broke matching against subsequent WS position pushes.
        accountState.hydratePositions(data.positions);
      }
    } catch {
      errorPositions = $_("apiErrors.failedToLoadPositions");
    } finally {
      loadingPositions = false;
    }
  }

  async function fetchPendingOrders() {
    const provider = settingsState.apiProvider || "bitunix";
    const keys = settingsState.apiKeys[provider];
    if (!keys?.key || !keys?.secret) return;

    loadingOrders = true;
    errorOrders = "";
    try {
      const response = await appFetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: provider,
          apiKey: keys.key,
          apiSecret: keys.secret,
          type: "pending",
        }),
      });
      const data = await response.json();
      if (data.error) {
        errorOrders = translateError(data);
      } else {
        // Same reasoning as fetchPositions: hydrate through accountState so
        // this list is live afterwards (WS order-channel pushes update it),
        // instead of a snapshot that never changes until the tab is
        // revisited.
        accountState.hydrateOpenOrders(data.orders || []);
      }
    } catch {
      errorOrders = $_("apiErrors.failedToLoadOrders");
    } finally {
      loadingOrders = false;
    }
  }

  async function fetchHistoryOrders() {
    const provider = settingsState.apiProvider || "bitunix";
    const keys = settingsState.apiKeys[provider];
    if (!keys?.key || !keys?.secret) return;

    loadingHistory = true;
    errorHistory = "";
    try {
      // Bitunix's get_history_orders splits FILLED/EXPIRED (queryCanceled
      // omitted) from CANCELED (queryCanceled: true) — one call never
      // returns both, so both are fetched and merged. Only relevant for
      // Bitunix; Bitget's history endpoint has no such split.
      const requests =
        provider === "bitunix"
          ? [{ queryCanceled: false }, { queryCanceled: true }]
          : [{}];

      const responses = await Promise.all(
        requests.map((extra) =>
          appFetch("/api/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              exchange: provider,
              apiKey: keys.key,
              apiSecret: keys.secret,
              type: "history",
              ...extra,
            }),
          }).then((r) => r.json()),
        ),
      );

      const firstError = responses.find((data) => data.error);
      if (firstError) {
        errorHistory = translateError(firstError);
        return;
      }

      const merged = new Map<string, NormalizedOrder>();
      for (const data of responses) {
        for (const order of (data.orders || []) as NormalizedOrder[]) {
          merged.set(order.id || order.orderId, order);
        }
      }
      historyOrders = Array.from(merged.values()).sort(
        (a, b) => (b.time || 0) - (a.time || 0),
      );
    } catch {
      errorHistory = $_("apiErrors.failedToLoadOrders");
    } finally {
      loadingHistory = false;
    }
  }

  async function fetchAccount() {
    const provider = settingsState.apiProvider || "bitunix";
    const keys = settingsState.apiKeys[provider];
    if (!keys?.key || !keys?.secret) return;

    try {
      const response = await appFetch("/api/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: provider,
          apiKey: keys.key,
          apiSecret: keys.secret,
        }),
      });
      const json = await response.json();
      // /api/account responds via jsonSuccess/jsonError
      // (src/utils/apiResponse.ts): { success: true, data: {...account
      // fields} } or { success: false, error: { code, message } } — not the
      // flat shape read here before this fix. `data.error` was always
      // undefined and `data` itself (rather than `data.data`) was assigned
      // to accountInfo, so every field silently stuck at its all-zero
      // initial state — indistinguishable from a genuinely empty account,
      // and never surfaced as an error either (BUG-0060).
      const { data, code, message } = unwrapApiEnvelope<AccountInfo>(json);
      if (data === null) {
        errorAccount = translateError({ code, error: message });
      } else {
        errorAccount = "";
        accountInfo = data;
        // available/margin/frozen also flow into accountState so
        // AccountSummary can prefer the WS-live balance channel over this
        // snapshot once it starts pushing (see liveAsset below); the
        // remaining fields here (bonus/transfer/positionMode/per-mode PnL)
        // have no WS equivalent and stay REST-only.
        accountState.hydrateBalance({
          available: String(data.available),
          margin: String(data.margin),
          frozen: String(data.frozen),
        });
      }
    } catch {
      errorAccount = $_("apiErrors.generic");
    }
  }

  onMount(() => {
    // Initial fetch to get the current state before WS takes over
    const provider = settingsState.apiProvider || "bitunix";
    const keys = settingsState.apiKeys[provider];
    if (keys?.key && keys?.secret) {
      fetchAccount();
      fetchPositions();
      fetchPendingOrders();
    }
  });

  // Order history has no WS push channel of its own — eagerly refresh it
  // when a WS order-close event lands while the user is looking at the tab,
  // instead of only picking up the fill on the next manual tab switch.
  $effect(() => {
    accountState.registerOrderCloseCallback(() => {
      if (activeTab === "history") fetchHistoryOrders();
    });
    return () => accountState.registerOrderCloseCallback(null);
  });

  // Load orders once per tab-activation, not on every openOrders reference
  // change — hydrateOpenOrders() always assigns a fresh array (even when
  // empty), so gating on `openOrders.length === 0` re-fires this effect
  // forever while the account genuinely has no open orders (the loader never
  // settles). `hasFetchedOrdersOnce` is reset whenever the tab is left, so
  // returning to it still refreshes exactly once.
  let hasFetchedOrdersOnce = $state(false);
  $effect(() => {
    if (activeTab === "orders") {
      if (!hasFetchedOrdersOnce) {
        hasFetchedOrdersOnce = true;
        untrack(() => fetchPendingOrders());
      }
    } else {
      hasFetchedOrdersOnce = false;
    }
  });

  let hasFetchedHistoryOnce = $state(false);
  $effect(() => {
    // History should only load once per tab-activation or via manual refresh
    if (activeTab === "history") {
      if (!hasFetchedHistoryOnce) {
        hasFetchedHistoryOnce = true;
        untrack(() => fetchHistoryOrders());
      }
    } else {
      hasFetchedHistoryOnce = false;
    }
  });

  // Watch for API key changes to re-trigger initial fetch
  $effect(() => {
    const provider = settingsState.apiProvider || "bitunix";
    const keys = settingsState.apiKeys[provider];
    if (keys?.key && keys?.secret) {
      untrack(() => {
        fetchAccount();
        fetchPositions();
        // Orders/History are tab-gated above; invalidate so the next visit
        // (or the currently active tab) re-fetches for the new key/exchange
        // instead of silently keeping the previous account's stale data.
        hasFetchedOrdersOnce = false;
        hasFetchedHistoryOnce = false;
        if (activeTab === "orders") fetchPendingOrders();
        if (activeTab === "history") fetchHistoryOrders();
      });
    }
  });

  // Filter History
  let filteredHistoryOrders = $derived(
    settingsState.hideUnfilledOrders
      ? historyOrders.filter((o) => Number(o.filled || 0) > 0)
      : historyOrders,
  );

  function toggle() {
    isOpen = !isOpen;
  }

  function handleKeydown(event: KeyboardEvent, callback: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      callback();
    }
  }

  // Context Menu Handling
  function handleContextMenu(event: MouseEvent) {
    if (activeTab !== "positions") return;
    event.preventDefault();
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    showContextMenu = true;
  }

  function setViewMode(mode: "detailed" | "focus") {
    settingsState.positionViewMode = mode;
    showContextMenu = false;
  }

  function closeContextMenu() {
    showContextMenu = false;
  }

  // Actions
  async function handleClosePosition(pos: OMSPosition) {
    try {
      const res = (await tradeService.closePosition({
        symbol: pos.symbol,
        positionSide: pos.side,
        amount: pos.amount, // Use amount from OMSPosition
      })) as { error?: string } | undefined;

      if (res && res.error) {
        uiState.showError(
          $_("dashboard.alerts.closePositionError", {
            values: { error: res.error },
          }),
        );
      } else {
        uiState.showToast(
          $_("dashboard.alerts.closePositionSuccess"),
          "success",
        );
        // Trigger refresh or wait for WS
      }
    } catch (e: unknown) {
      // Previously discarded `e` entirely and showed a fixed generic
      // message — the exchange's actual rejection reason (e.g. a HEDGE-mode
      // account rejecting a close that's missing tradeSide/positionId, see
      // BUG-0062) was never visible to the user. Same pattern
      // handleCancelOrder already used correctly below.
      const msg = getDisplayMessage(e);
      uiState.showError(msg || $_("dashboard.alerts.failedClose"));
    }
  }

  async function handleCancelOrder(orderId: string, symbol: string) {
    try {
        const res = (await tradeService.cancelOrder(symbol, orderId)) as { error?: string } | undefined;
        if (res && res.error) {
            uiState.showError($_("dashboard.alerts.cancelOrderError", { values: { error: res.error } }) || `Cancel failed: ${res.error}`);
        } else {
             uiState.showToast($_("dashboard.alerts.cancelOrderSuccess") || "Order cancelled", "success");
             fetchPendingOrders();
        }
    } catch (e: unknown) {
        // Prefer rawMessage on BitunixApiError — `e.message` carries the i18n
        // key "apiErrors.generic" and would render as a literal string otherwise.
        const msg = getDisplayMessage(e);
        uiState.showError(msg || $_("dashboard.alerts.cancelOrderError"));
    }
  }

  async function handleTpSl(pos: OMSPosition) {
    // Placeholder: Could open a modal or just pre-fill trade inputs
    // For now, let's load it into the Trade Inputs
    tradeState.update((s) => ({
      ...s,
      symbol: pos.symbol,
      entryPrice: pos.entryPrice.toString(),
      lockedPositionSize: pos.amount, // Use amount
      isPositionSizeLocked: true,
      leverage: pos.leverage.toString(),
    }));
    uiState.showToast(
      $_("dashboard.alerts.loadedIntoInputs", {
        values: { symbol: pos.symbol },
      }),
      "info",
    );
  }
</script>

<svelte:window onclick={closeContextMenu} />

<div
  class="bg-[var(--bg-secondary)] rounded-xl shadow-lg border border-[var(--border-color)] flex flex-col transition-all duration-300 relative z-20 w-full"
  class:h-auto={isOpen}
  class:h-12={!isOpen}
>
  <!-- Header / Toggle -->
  <div
    class="p-3 flex justify-between items-center bg-[var(--bg-tertiary)] cursor-pointer select-none border-b border-[var(--border-color)] rounded-t-xl"
    class:rounded-b-xl={!isOpen}
    onclick={toggle}
    onkeydown={(e) => handleKeydown(e, toggle)}
    role="button"
    tabindex="0"
    aria-expanded={isOpen}
  >
    <h3 class="font-bold text-sm text-[var(--text-primary)]">
      {$_("dashboard.marketActivity")}
    </h3>
    <div
      class="text-[var(--text-secondary)] transform transition-transform duration-200"
      class:rotate-180={!isOpen}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </div>
  </div>

  {#if isOpen}
    <!-- Account Summary -->
    <AccountSummary
      available={liveAsset ? liveAsset.available : accountInfo.available}
      margin={liveAsset ? liveAsset.margin : accountInfo.margin}
      pnl={accountState.totalUnrealizedPnl}
      currency={accountInfo.marginCoin}
      frozen={liveAsset ? liveAsset.frozen : accountInfo.frozen}
      transfer={accountInfo.transfer}
      bonus={accountInfo.bonus}
      positionMode={accountInfo.positionMode}
      crossUnrealizedPNL={accountInfo.crossUnrealizedPNL}
      isolationUnrealizedPNL={accountInfo.isolationUnrealizedPNL}
      totalPositionSize={totalPositionSize}
      error={errorAccount}
    />

    <!-- Tabs -->
    <div
      class="flex border-b border-[var(--border-color)] bg-[var(--bg-primary)]"
    >
      <button
        class="flex-1 py-2 text-xs font-bold transition-colors border-b-2"
        class:text-[var(--accent-color)]={activeTab === "positions"}
        class:border-[var(--accent-color)]={activeTab === "positions"}
        class:text-[var(--text-secondary)]={activeTab !== "positions"}
        class:border-transparent={activeTab !== "positions"}
        onclick={() => (activeTab = "positions")}
        oncontextmenu={handleContextMenu}
      >
        {$_("dashboard.positions")} ({accountState.positions.length})
      </button>
      <button
        class="flex-1 py-2 text-xs font-bold transition-colors border-b-2"
        class:text-[var(--accent-color)]={activeTab === "orders"}
        class:border-[var(--accent-color)]={activeTab === "orders"}
        class:text-[var(--text-secondary)]={activeTab !== "orders"}
        class:border-transparent={activeTab !== "orders"}
        onclick={() => (activeTab = "orders")}
      >
        {$_("dashboard.orders")} ({openOrders.length})
      </button>
      <button
        class="flex-1 py-2 text-xs font-bold transition-colors border-b-2"
        class:text-[var(--accent-color)]={activeTab === "tpsl"}
        class:border-[var(--accent-color)]={activeTab === "tpsl"}
        class:text-[var(--text-secondary)]={activeTab !== "tpsl"}
        class:border-transparent={activeTab !== "tpsl"}
        onclick={() => (activeTab = "tpsl")}
      >
        {$_("dashboard.tpsl")}
      </button>
      <button
        class="flex-1 py-2 text-xs font-bold transition-colors border-b-2"
        class:text-[var(--accent-color)]={activeTab === "history"}
        class:border-[var(--accent-color)]={activeTab === "history"}
        class:text-[var(--text-secondary)]={activeTab !== "history"}
        class:border-transparent={activeTab !== "history"}
        onclick={() => (activeTab = "history")}
      >
        {$_("dashboard.history")}
      </button>
    </div>

    <!-- Content Area -->
    <div class="bg-[var(--bg-secondary)] rounded-b-xl">
      {#if activeTab === "positions"}
        <PositionsList
          positions={mappedPositions}
          loading={loadingPositions}
          error={errorPositions}
          onclose={handleClosePosition}
          ontpSl={handleTpSl}
        />
      {:else if activeTab === "orders"}
        <OpenOrdersList oncancel={handleCancelOrder}
          orders={openOrders}
          loading={loadingOrders}
          error={errorOrders}
        />
      {:else if activeTab === "tpsl"}
        <TpSlList isActive={activeTab === "tpsl"} />
      {:else if activeTab === "history"}
        <OrderHistoryList
          orders={filteredHistoryOrders}
          loading={loadingHistory}
          error={errorHistory}
          onrefresh={fetchHistoryOrders}
        />
      {/if}
    </div>
  {/if}
</div>

{#if showContextMenu}
  <div
    class="fixed z-[10000] bg-[var(--bg-tertiary)] border border-[var(--border-color)] shadow-xl rounded py-1 w-40 text-xs"
    style="top: {contextMenuY}px; left: {contextMenuX}px;"
  >
    <div
      class="px-3 py-1 text-[var(--text-secondary)] font-bold border-b border-[var(--border-color)] mb-1"
    >
      {$_("dashboard.viewMode")}
    </div>
    <button
      class="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] flex justify-between"
      onclick={() => setViewMode("detailed")}
    >
      {$_("dashboard.detailed")}
      {#if settingsState.positionViewMode === "detailed"}✓{/if}
    </button>
    <button
      class="w-full text-left px-3 py-1.5 hover:bg-[var(--bg-secondary)] text-[var(--text-primary)] flex justify-between"
      onclick={() => setViewMode("focus")}
    >
      {$_("dashboard.focus")}
      {#if settingsState.positionViewMode === "focus"}✓{/if}
    </button>
  </div>
{/if}
