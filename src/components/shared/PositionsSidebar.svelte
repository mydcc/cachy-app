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
  import { keysForExchange } from "../../stores/settings/accounts";
  import { accountState } from "../../stores/account.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { marketWatcher } from "../../services/marketWatcher";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { uiState } from "../../stores/ui.svelte";
  import { _ } from "../../locales/i18n";
  import { activeExchange } from "../../services/exchange";
  import { paperAccountFeed } from "../../services/paperAccountFeed";
  import { paperState } from "../../stores/paperTrading.svelte";
  import { getDisplayMessage } from "../../utils/errorUtils";
  import { unwrapApiEnvelope } from "../../utils/utils";
  import { appFetch } from "../../lib/appAuth";
  import type { OMSPosition } from "../../services/omsTypes";
  import { calculateLiveUnrealizedPnl } from "../../services/mappers";
  import type { NormalizedOrder, NormalizedPosition } from "../../types/exchange";
  import type { TranslationKey } from "../../locales/schema";

  // Sub-components
  import PositionsList from "./PositionsList.svelte";
  import { tpSlState } from "../../stores/tpsl.svelte";
  import AccountSummary from "./AccountSummary.svelte";
  import OpenOrdersList from "./OpenOrdersList.svelte";
  import OrderHistoryList from "./OrderHistoryList.svelte";
  import TpSlList from "./TpSlList.svelte";
  import ClosePositionModal from "./ClosePositionModal.svelte";
  import ConfirmActionModal from "./ConfirmActionModal.svelte";
  import { confirmationPolicyStore } from "../../stores/confirmationPolicy.svelte";
  import { formatDynamicDecimal } from "../../utils/utils";
  import AdjustMarginModal from "./AdjustMarginModal.svelte";
  import TpSlCreateModal from "./TpSlCreateModal.svelte";

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
  let loadingMoreHistory = $state(false);
  let historyHasMore = $state(false);
  let historyStartTime: number | undefined = $state(undefined);
  let historyEndTime: number | undefined = $state(undefined);

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
    const symbolData = marketState.data[normalizeSymbol(p.symbol, "bitunix")];
    const live = symbolData?.markPrice;
    if (live && live.gt(0)) return live;
    if (p.markPrice && p.markPrice.gt(0)) return p.markPrice;
    // Neither source has a real mark price — happens during a WS `price`
    // channel gap/reconnect on Bitunix, since its REST ticker fallback
    // (historyFetcher.pollSymbolChannel) has no mark-price field at all,
    // only `lastPrice` (BUG-0218). Falling back to it keeps the row live
    // instead of showing "?" while market data for the symbol does exist.
    const lastPrice = symbolData?.lastPrice;
    if (lastPrice && lastPrice.gt(0)) return lastPrice;
    return undefined;
  }

  // unrealizedPnl on accountState.positions only updates when Bitunix's WS
  // position channel pushes — order create/fill/cancel events, NOT every
  // price tick (08_websocket.md's Position Channel) — so it goes stale
  // between those even while markPrice keeps updating live via the public
  // price channel. Recompute it from the live mark price whenever one is
  // available and the position has a real entry price (a brand-new WS-only
  // position can still be at the placeholder 0 — see updatePositionFromWs —
  // in which case fall back to the account-channel value rather than
  // produce a nonsense PnL).
  let mappedPositions = $derived(
    accountState.positions.map((p): OMSPosition => {
      const markPrice = resolveMarkPrice(p);
      const liveUnrealizedPnl =
        markPrice && p.entryPrice.gt(0)
          ? calculateLiveUnrealizedPnl(p.side, p.entryPrice, markPrice, p.size)
          : undefined;
      return {
        symbol: p.symbol,
        side: p.side,
        amount: p.size, // Map size to amount
        entryPrice: p.entryPrice,
        unrealizedPnl: liveUnrealizedPnl ?? p.unrealizedPnl,
        leverage: p.leverage,
        marginMode: p.marginMode as "cross" | "isolated",
        liquidationPrice: p.liquidationPrice,
        margin: p.margin,
        markPrice,
        size: p.size,
        // REST-only, never sent over WS — 0 means "not hydrated yet", not a
        // real margin rate, so treat it as absent rather than show "0%".
        marginRate: p.marginRate.gt(0) ? p.marginRate : undefined,
        realizedPnl: p.realizedPnl,
      };
    })
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

  // Sum of the live-recomputed per-position PnL above, NOT
  // accountState.totalUnrealizedPnl — that getter sums the stale
  // account-channel unrealizedPnl directly, so the account summary's
  // "Total PnL" would go stale between order events too.
  let totalUnrealizedPnl = $derived(
    mappedPositions.reduce((sum, p) => sum.plus(p.unrealizedPnl), new Decimal(0)),
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
    // FEAT-0327 — the read seam. In paper mode the simulated book answers, in
    // the same shape, and nothing below runs: a request to the venue here is
    // what made a simulated position invisible in this panel.
    const paper = paperAccountFeed();
    if (paper) {
      errorPositions = "";
      accountState.hydratePositions(paper.positions());
      return;
    }

    const provider = settingsState.apiProvider || "bitunix";
    const keys = keysForExchange(settingsState.accounts, provider);

    if (!keys?.key || !keys?.secret) return;
    // The sync callback (registered below) can fire once per malformed/
    // REST-incomplete WS position push — several arriving in a burst (e.g.
    // multiple positions opening near-simultaneously) must not fan out into
    // that many concurrent REST calls.
    if (loadingPositions) return;

    loadingPositions = true;
    errorPositions = "";
    try {
      const response = await appFetch("/api/positions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": keys.key,
          "X-Api-Secret": keys.secret,
          ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {}),
        },
        body: JSON.stringify({
          exchange: provider,
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
    const paper = paperAccountFeed();
    if (paper) {
      errorOrders = "";
      accountState.hydrateOpenOrders(paper.pendingOrders());
      return;
    }

    const provider = settingsState.apiProvider || "bitunix";
    const keys = keysForExchange(settingsState.accounts, provider);
    if (!keys?.key || !keys?.secret) return;

    loadingOrders = true;
    errorOrders = "";
    try {
      const response = await appFetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": keys.key,
          "X-Api-Secret": keys.secret,
          ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {}),
        },
        body: JSON.stringify({
          exchange: provider,
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

  async function fetchHistoryOrders(options?: {
    startTime?: number;
    endTime?: number;
    append?: boolean;
    limit?: number;
  }) {
    const isAppend = options?.append ?? false;

    const paper = paperAccountFeed();
    if (paper) {
      const limit = options?.limit ?? 50;
      const fills = paper.historyOrders({
        startTime: options?.startTime !== undefined ? options.startTime : historyStartTime,
        endTime: options?.endTime !== undefined ? options.endTime : historyEndTime,
        limit,
      });
      // Merged the same way the venue's two-call history is, so "load more"
      // and the range picker behave identically in both modes.
      const merged = isAppend
        ? new Map<string, NormalizedOrder>(historyOrders.map((o) => [o.id || o.orderId, o]))
        : new Map<string, NormalizedOrder>();
      for (const order of fills) merged.set(order.id || order.orderId, order);
      historyOrders = Array.from(merged.values()).sort(
        (a, b) => (b.time || 0) - (a.time || 0),
      );
      historyHasMore = fills.length >= limit;
      errorHistory = "";
      return;
    }

    const provider = settingsState.apiProvider || "bitunix";
    const keys = keysForExchange(settingsState.accounts, provider);
    if (!keys?.key || !keys?.secret) return;

    if (isAppend) {
      loadingMoreHistory = true;
    } else {
      loadingHistory = true;
    }
    errorHistory = "";

    const startTime = options?.startTime !== undefined ? options.startTime : historyStartTime;
    const endTime = options?.endTime !== undefined ? options.endTime : historyEndTime;
    const limit = options?.limit ?? 50;

    try {
      // Bitunix's get_history_orders splits FILLED/EXPIRED (queryCanceled
      // omitted) from CANCELED (queryCanceled: true) — one call never
      // returns both, so both are fetched and merged. Only relevant for
      // Bitunix; Bitget's history endpoint has no such split.
      const requests =
        provider === "bitunix"
          ? [
              { queryCanceled: false, startTime, endTime, limit },
              { queryCanceled: true, startTime, endTime, limit },
            ]
          : [{ startTime, endTime, limit }];

      const responses = await Promise.all(
        requests.map((extra) =>
          appFetch("/api/orders", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Api-Key": keys.key,
              "X-Api-Secret": keys.secret,
              ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {}),
            },
            body: JSON.stringify({
              exchange: provider,
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

      const merged = isAppend
        ? new Map<string, NormalizedOrder>(historyOrders.map((o) => [o.id || o.orderId, o]))
        : new Map<string, NormalizedOrder>();

      for (const data of responses) {
        for (const order of (data.orders || []) as NormalizedOrder[]) {
          merged.set(order.id || order.orderId, order);
        }
      }
      historyOrders = Array.from(merged.values()).sort(
        (a, b) => (b.time || 0) - (a.time || 0),
      );

      historyHasMore = responses.some(
        (r) => Array.isArray(r.orders) && r.orders.length >= limit,
      );
    } catch {
      errorHistory = $_("apiErrors.failedToLoadOrders");
    } finally {
      loadingHistory = false;
      loadingMoreHistory = false;
    }
  }

  function handleLoadMoreHistory() {
    if (loadingHistory || loadingMoreHistory || historyOrders.length === 0) return;
    const oldestTime = historyOrders.reduce(
      (min, o) => (!o.time ? min : Math.min(min, o.time)),
      Infinity,
    );
    if (oldestTime === Infinity || oldestTime <= 0) return;

    fetchHistoryOrders({
      startTime: historyStartTime,
      endTime: oldestTime - 1,
      append: true,
    });
  }

  function handleHistoryRangeChange(range: { startTime?: number; endTime?: number }) {
    historyStartTime = range.startTime;
    historyEndTime = range.endTime;
    fetchHistoryOrders({
      startTime: range.startTime,
      endTime: range.endTime,
      append: false,
    });
  }

  async function fetchAccount() {
    const paper = paperAccountFeed();
    if (paper) {
      errorAccount = "";
      const info = paper.accountInfo();
      accountInfo = info;
      accountState.hydrateBalance({
        available: info.available,
        margin: info.margin,
        frozen: info.frozen,
      });
      accountState.positionMode = info.positionMode;
      return;
    }

    const provider = settingsState.apiProvider || "bitunix";
    const keys = keysForExchange(settingsState.accounts, provider);
    if (!keys?.key || !keys?.secret) return;

    try {
      const response = await appFetch("/api/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": keys.key,
          "X-Api-Secret": keys.secret,
          ...(keys.passphrase ? { "X-Api-Passphrase": keys.passphrase } : {}),
        },
        body: JSON.stringify({
          exchange: provider,
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
        // FEAT-0068: the trade panel offers this as an editable control, and
        // this snapshot is the only place it arrives. Shared through the
        // store rather than re-fetched there.
        accountState.positionMode = data.positionMode || undefined;
      }
    } catch {
      errorAccount = $_("apiErrors.generic");
    }
  }

  onMount(() => {
    // Initial fetch to get the current state before WS takes over.
    // Paper mode needs no credentials — the book is local, and gating the
    // first read on API keys is why a paper account with none started empty.
    const provider = settingsState.apiProvider || "bitunix";
    const keys = keysForExchange(settingsState.accounts, provider);
    if (paperAccountFeed() || (keys?.key && keys?.secret)) {
      fetchAccount();
      fetchPositions();
      fetchPendingOrders();
    }
  });

  /*
   * FEAT-0327: the simulated history has no push channel either, and no WS
   * order-close event ever fires for it. The fill count is the signal — it
   * only ever moves when the simulator actually executed something, so this
   * refreshes on a fill rather than on every price tick.
   */
  $effect(() => {
    const fillCount = paperState.enabled ? paperState.fills.length : 0;
    if (fillCount === 0 || activeTab !== "history") return;
    untrack(() => fetchHistoryOrders());
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

  // A position that reaches the WS position channel before this component's
  // one-time onMount REST fetch (e.g. opened directly on the exchange while
  // Cachy was already running) gets created with entryPrice/liquidationPrice/
  // marginRate hard-defaulted to 0 — the WS channel never carries them. This
  // is accountState's signal to go get the real values from REST.
  $effect(() => {
    accountState.registerSyncCallback(() => {
      fetchAccount();
      fetchPositions();
      if (activeTab === "orders") fetchPendingOrders();
    });
    return () => accountState.registerSyncCallback(null);
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
    const keys = keysForExchange(settingsState.accounts, provider);
    if (keys?.key && keys?.secret) {
      untrack(() => {
        fetchAccount();
        fetchPositions();
        // Orders/History are tab-gated above; invalidate so the next visit
        // (or the currently active tab) re-fetches for the new key/exchange
        // instead of silently keeping the previous account's stale data.
        hasFetchedOrdersOnce = false;
        hasFetchedHistoryOnce = false;
        // The position cards' TP/SL plans belong to the previous account.
        tpSlState.reset();
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

  // FEAT-0057: the position cards show each position's active TP/SL, so the
  // plans have to be loaded when the cards are on screen — but only then, and
  // only when there is a position to annotate. `ensureFresh` is a no-op
  // inside its cache window and de-dupes concurrent callers, so this staying
  // reactive costs one request per window at most.
  $effect(() => {
    const shouldLoad = activeTab === "positions" && mappedPositions.length > 0;
    if (!shouldLoad) return;
    untrack(() => {
      tpSlState.ensureFresh();
    });
  });

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

  /*
   * FEAT-0256: opens the close dialog rather than closing outright. The order
   * itself is now placed by `ClosePositionModal`, which owns the quantity —
   * placing it here as well would mean two paths to the same order, and the
   * one here could only ever send the full size.
   *
   * Error reporting moved with it: the modal shows the exchange's own
   * rejection reason inline, which is what BUG-0062 needed and what a toast
   * fired from here would have replaced with a generic message.
   */
  function handleClosePosition(pos: OMSPosition) {
    closingPosition = pos;
  }

  /*
   * FEAT-0330. The policy decides whether a human is asked; the gate decides
   * whether the order goes. Both run — this only chooses which of the two
   * paths reaches `runFlashClose`.
   *
   * When the confirmation is switched off there is no dialog and no
   * `confirmedAt`, which is correct: the gate only refuses an unconfirmed
   * action the policy actually wanted confirmed.
   */
  function handleFlashClose(pos: OMSPosition) {
    if (confirmationPolicyStore.requires("flash-close-position")) {
      flashClosingPosition = pos;
      return;
    }
    void runFlashClose(pos);
  }

  /**
   * The facts the dialog shows — the numbers a trader needs to recognise the
   * position they are about to close, and what closing it books.
   *
   * Read from the same `OMSPosition` the close will use, not re-derived: a
   * second derivation is a second chance to disagree with the screen.
   */
  const flashCloseFacts = $derived.by(() => {
    const pos = flashClosingPosition;
    if (!pos) return [];

    const pnl = pos.unrealizedPnl ?? new Decimal(0);
    return [
      { label: $_("positionsList.symbol"), value: pos.symbol },
      { label: $_("positionsList.side"), value: pos.side.toUpperCase() },
      { label: $_("positionsList.size"), value: formatDynamicDecimal(pos.amount) },
      {
        label: $_("positionsList.markPrice"),
        value: pos.markPrice ? formatDynamicDecimal(pos.markPrice) : "—",
      },
      {
        label: $_("positionsList.unrealizedPnl"),
        value: `${pnl.gt(0) ? "+" : ""}${formatDynamicDecimal(pnl)}`,
        tone: pnl.isNegative() ? ("danger" as const) : ("success" as const),
      },
    ];
  });

  async function runFlashClose(pos: OMSPosition, confirmedAt?: number) {
    flashClosingPosition = null;

    const side = pos.side.toLowerCase() === "short" ? "short" : "long";
    /*
     * Through the adapter, not `tradeService` directly: FEAT-0016 keeps
     * components off exchange-specific services, and
     * `exchange_boundary.test.ts` fails the build otherwise. The gate is
     * reached either way — the adapter adds no path around it.
     */
    const result = (await activeExchange().trading.flashClosePosition(
      pos.symbol,
      side,
      confirmedAt,
    )) as { success: boolean };

    if (result.success) {
      uiState.showToast($_("dashboard.alerts.closePositionSuccess"), "success");
      // Same reasoning as a full close: the exchange drops a closed
      // position's plans, and a cached stop on a position that no longer
      // exists is worse than no stop at all.
      tpSlState.invalidate();
    }
    // A failure has already been reported by `flashClosePosition`, which owns
    // the optimistic-order rollback and shows the gate's own refusal text.
  }

  function handleCloseSuccess() {
    closingPosition = null;
    uiState.showToast($_("dashboard.alerts.closePositionSuccess"), "success");
    // The exchange cancels a closed position's plans; leaving them cached
    // would show a stop on a position that no longer exists. Still correct
    // for a partial close, which reduces the plans' scope.
    tpSlState.invalidate();
  }

  async function handleCancelOrder(orderId: string, symbol: string) {
    try {
        const res = (await activeExchange().trading.cancelOrder(symbol, orderId)) as { error?: string } | undefined;
        if (res && res.error) {
            uiState.showError($_("dashboard.alerts.cancelOrderError", { values: { error: res.error } }) || `Cancel failed: ${res.error}`);
        } else {
             uiState.showToast($_("dashboard.alerts.cancelOrderSuccess") || "Order cancelled", "success");
             fetchPendingOrders();
        }
    } catch (e: unknown) {
        // Prefer rawMessage on BitunixApiError — `e.message` carries the i18n
        // key "apiErrors.generic" and would render as a literal string otherwise.
        const msg = getDisplayMessage(e, $_);
        uiState.showError(msg || $_("dashboard.alerts.cancelOrderError"));
    }
  }

  /** FEAT-0070: opens the create-or-edit TP/SL dialog for a position. */
  function handleTpSl(pos: OMSPosition) {
    tpSlCreatePosition = pos;
  }

  function handleTpSlCreateSuccess() {
    tpSlCreatePosition = null;
    uiState.showToast($_("dashboard.alerts.tpslCreated"), "success");
  }

  /** The position whose close dialog is open, or null (FEAT-0256). */
  let closingPosition = $state<OMSPosition | null>(null);
  /** FEAT-0330 — set while the flash-close confirmation is open. */
  let flashClosingPosition = $state<OMSPosition | null>(null);

  /** The position whose TP/SL create dialog is open, or null (FEAT-0070). */
  let tpSlCreatePosition = $state<OMSPosition | null>(null);

  /** The position whose margin dialog is open, or null (FEAT-0068). */
  let adjustMarginPosition = $state<OMSPosition | null>(null);

  /** FEAT-0068: opens the add/withdraw-margin dialog for a position. */
  function handleAdjustMargin(pos: OMSPosition) {
    adjustMarginPosition = pos;
  }

  /*
   * The new margin is not written here. `adjustPositionMargin` asks for a
   * resync and the private position channel pushes the exchange's own
   * number; a value computed in the dialog would be a second, competing
   * source for the same field.
   */
  function handleAdjustMarginSuccess() {
    adjustMarginPosition = null;
    uiState.showToast($_("exchange.accountSettings.marginAdjusted"), "success");
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
      pnl={totalUnrealizedPnl}
      currency={accountInfo.marginCoin}
      frozen={liveAsset ? liveAsset.frozen : accountInfo.frozen}
      transfer={accountInfo.transfer}
      bonus={accountInfo.bonus}
      positionMode={accountInfo.positionMode}
      crossUnrealizedPNL={accountInfo.crossUnrealizedPNL}
      isolationUnrealizedPNL={accountInfo.isolationUnrealizedPNL}
      isolationFrozen={liveAsset?.isolationFrozen}
      crossFrozen={liveAsset?.crossFrozen}
      expMoney={liveAsset?.expMoney}
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
          onflashClose={handleFlashClose}
          ontpSl={handleTpSl}
          onadjustMargin={handleAdjustMargin}
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
          loadingMore={loadingMoreHistory}
          hasMore={historyHasMore}
          error={errorHistory}
          onrefresh={() => fetchHistoryOrders({ append: false })}
          onloadmore={handleLoadMoreHistory}
          onrangechange={handleHistoryRangeChange}
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

{#if flashClosingPosition}
  <ConfirmActionModal
    isOpen={true}
    action="flash-close-position"
    facts={flashCloseFacts}
    irreversible={true}
    onconfirm={(confirmedAt) => {
      const pos = flashClosingPosition;
      if (pos) void runFlashClose(pos, confirmedAt);
    }}
    oncancel={() => (flashClosingPosition = null)}
  />
{/if}

{#if closingPosition}
  <ClosePositionModal
    position={closingPosition}
    onclose={() => (closingPosition = null)}
    onsuccess={handleCloseSuccess}
  />
{/if}

{#if tpSlCreatePosition}
  <TpSlCreateModal
    position={tpSlCreatePosition}
    onclose={() => (tpSlCreatePosition = null)}
    onsuccess={handleTpSlCreateSuccess}
  />
{/if}

{#if adjustMarginPosition}
  <AdjustMarginModal
    position={adjustMarginPosition}
    onclose={() => (adjustMarginPosition = null)}
    onsuccess={handleAdjustMarginSuccess}
  />
{/if}
