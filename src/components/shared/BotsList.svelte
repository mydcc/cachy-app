<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  FEAT-0808 — the bots half of the positions sidebar, Phase A.

  A bot that is armed and waiting is none of the sidebar's other tabs, so the
  first thing a trader used to learn about it was the position it opened. This
  tab answers the question one step earlier: one row per bot rule, with the
  state FEAT-0807's projection derives, the sentence the trader armed from,
  and — when the bot owns a position — the way back to that position's row.

  A projection, not a source: everything here reads `botsState` and the
  simulated book and writes exactly one field, `enabled` (pause/resume).
  Editing and deletion stay in the control center until FEAT-0811; Phase B
  (waiting bots among the open orders as conditional entries) is deferred with
  FEAT-0810/FEAT-0805.

  The bot row shows no PnL of its own while a position is open. The position
  book is the single source for money; this row links to it, so two rendering
  surfaces can never disagree about what a position is worth.
-->

<script lang="ts">
  import { _, locale } from "../../locales/i18n";
  import type { TranslationKey } from "../../locales/schema";
  import { intlTagFor } from "../../lib/i18n/intlTag";
  import {
    renderConditionClause,
    renderOrderSentence,
    type SentenceTranslator,
  } from "../../lib/rules/ruleSentence";
  import type { GridDocument, RuleDocument } from "../../lib/rules/types";
  import type { BotLifeState } from "../../services/alertEngine/botState";
  import type { GridLifeState, GridLifeStatus } from "../../services/alertEngine/gridState";
  import { readBots, setBotEnabled } from "../../services/alertEngine/botStore";
  import { readGrids, readGridStates } from "../../services/alertEngine/gridStore";
  import { readRuleStates } from "../../services/alertEngine/ruleStateStore";
  import {
    alertState,
    closeBotOwnedPositions,
    pauseGridBot,
    resumeGridBot,
    startGridBot,
    stopGridBot,
  } from "../../stores/alerts.svelte";
  import { readBotGuards, BOT_GUARD_REASON_KEYS } from "../../services/alertEngine/botGuardStore";
  import { gridRefusalKey } from "./gridRefusalKey";
  import { gridOwnedAmount, gridUnrealizedPnl } from "../../lib/gridPositionShare";
  import { botsState } from "../../stores/botsState.svelte";
  import {
    PAPER_ACCOUNT,
    isBotAccountExecuting,
  } from "../../services/alertEngine/botAccount";
  import { paperState, type PaperPosition } from "../../stores/paperTrading.svelte";
  import { paperAccountFeed } from "../../services/paperAccountFeed";
  import type { OMSPosition } from "../../services/omsTypes";
  import { formatDynamicDecimal, parseDecimal } from "../../utils/utils";
  import type { Decimal } from "decimal.js";

  interface Props {
    /**
     * FEAT-0808 — switches the sidebar to the Positions tab and highlights
     * the row this bot owns.
     */
    onshowposition?: (positionId: string) => void;
    /**
     * FEAT-0820 — the Positions tab's live priced rows so grid rows display
     * PnL from the single money source without duplicating PnL math.
     */
    pricedPositions?: readonly OMSPosition[];
  }

  let { onshowposition, pricedPositions }: Props = $props();

  /**
   * The projection's clock tick. The sidebar owns it while this tab is
   * mounted — the pattern accountVerification.svelte.ts uses for its own
   * expiries — because `botsState.now` is `$state` the consumer ticks:
   * unticked, `expired` never turns and holding times never advance. One
   * interval per mounted tab, always cleaned up.
   */
  const BOT_CLOCK_TICK_MS = 30_000;

  $effect(() => {
    // The projection answers "as of the last tick", and mount is exactly the
    // moment that answer goes stale — so the first tick lands now, not a
    // full period later; an `expired` that already passed turns on mount.
    botsState.now = Date.now();
    const handle = setInterval(() => {
      botsState.now = Date.now();
    }, BOT_CLOCK_TICK_MS);
    return () => clearInterval(handle);
  });

  /** One live bot's row. Strings are prebuilt — the template only lays them out. */
  interface BotRow {
    kind: "bot";
    id: string;
    name: string;
    symbol: string;
    life: BotLifeState;
    condition: string;
    order: string;
    timeframe: string;
    createdAtMs: number;
    firedCount: number;
    lastFiredMs: number | null;
    /** The paper position this bot owns, when it owns one. */
    position: PaperPosition | null;
    paused: boolean;
    /**
     * FEAT-0822 — the newest guard event, when one exists: the reason the
     * bot last did nothing, with how often it repeated. The ledger counts
     * repeats per reason, so one row answers "why is it not firing?".
     */
    guard: { reason: string; count: number } | null;
  }

  /**
   * A position whose bot no longer exists. The slot's owner index names a
   * botId the states map has no entry for — the rule was deleted, but the
   * position it opened is still on the book and still needs an owner link.
   * Rendered as what it is, never hidden as an edge case.
   */
  interface LingeringRow {
    kind: "lingering";
    botId: string;
    position: PaperPosition;
  }

  interface GridRow {
    kind: "grid";
    id: string;
    name: string;
    symbol: string;
    side: "long" | "short";
    lowerPrice: string;
    upperPrice: string;
    spacing: "arithmetic" | "geometric";
    levelCount: number;
    filledCount: number;
    restingOrderCount: number;
    life: GridLifeState;
    position: PaperPosition | null;
    pnl: Decimal | null;
  }

  type Row = BotRow | GridRow | LingeringRow;

  const GRID_STATE_RANK: Record<GridLifeStatus, number> = {
    active: 0,
    stopping: 2,
    armed: 3,
    paused: 4,
    account_unavailable: 5,
    closed: 9,
  };

  /**
   * Sort order by state (spec proposal): in position first, then the
   * transient in-flight states, then the rest. A never-fired bot is listed
   * after an active one, and within a state by symbol so the order is stable
   * across renders.
   */
  const STATE_RANK: Record<BotLifeState["state"], number> = {
    in_position: 0,
    submitting: 1,
    closing: 2,
    armed: 3,
    paused: 4,
    // FEAT-0825 — beside `blocked`: both are a bot that cannot act. The list
    // filters these out while a live account is active, so the rank only
    // matters for a row whose account goes away under an open tab.
    account_unavailable: 5,
    blocked: 6,
    limit_reached: 7,
    // FEAT-0823 — a held signal ranks between the limits and a done bot:
    // it is the newest thing an armed bot is doing, and sorting it above
    // `closed` keeps a waiting bot from sinking under its own history.
    awaiting_confirmation: 8,
    closed: 9,
    expired: 10,
  };

  /**
   * The rows, derived over the projection. `botsState.states` is the reactive
   * anchor: the projection re-reads the rule store and the fire ledger on
   * every version bump and rebuilds its Map, so this derived re-reads the
   * documents in step. Reading `botsState.now` here is what makes both
   * `expired` and the holding time move with the tick above, and
   * `guardsVersion` is what keeps the newest guard event (FEAT-0822) from
   * going stale: the ledger it reads is localStorage, not a rune.
   */
  let baseRows = $derived.by<Row[]>(() => {
    const states = botsState.states;
    const degraded = botsState.degraded;
    const positions = paperState.positions;
    void alertState.guardsVersion;

    // The rule store is the input that could not be read (FEAT-0542's
    // refusal): nothing can be listed, and the notice below says so. The
    // unreadable-store path is the store's own answer, checked before the
    // documents are read; the catch guards only the race where another tab
    // corrupts the store between the two reads.
    if (degraded.rules) return [];

    // FEAT-0825 / ADR-0028 — only the executing account's bots are listed,
    // decided per bot through the binding (a future `send` bot on an
    // exchange account sorts itself correctly). While a live account is
    // active no bot account executes, so the paper bots and the paper
    // positions they own stay off this list: simulated money beside a live
    // account is the mixing the item forbids. The notice below says how many
    // are hidden and how to see them.
    const executing = botsState.executingAccount;
    let bots: RuleDocument[];
    try {
      bots = readBots();
    } catch {
      return [];
    }

    const fired = readRuleStates();

    const botRows: BotRow[] = [];
    for (const bot of bots) {
      // A document without a string id would key a phantom row; the
      // projection skips it and so does the surface that renders it.
      if (typeof bot.id !== "string") continue;
      if (!isBotAccountExecuting(bot, executing)) continue;
      const life = states.get(bot.id);
      if (!life) continue;

      // The same ownership join the projection uses for `hasPosition`:
      // the book's own stamp (FEAT-0806), never the slot arithmetic — so
      // the chip and the position facts on one row cannot disagree. A
      // second bot on the same (symbol, side) finds no row of its own and
      // stays armed with no link: the index names the opener, and that is
      // the truth this row renders.
      const position =
        positions.find((p) => p.origin === "bot" && p.botId === bot.id) ?? null;

      botRows.push({
        kind: "bot",
        id: bot.id,
        name: bot.name,
        symbol: bot.symbol,
        life,
        condition: conditionOf(bot),
        order: orderOf(bot),
        timeframe: bot.trigger_timeframe,
        createdAtMs: bot.provenance.created_at_ms,
        firedCount: fired[bot.id]?.fired_count ?? 0,
        lastFiredMs: fired[bot.id]?.last_fired_anchor_ms ?? null,
        position,
        paused: bot.enabled === false,
        // FEAT-0822 — newest first is the ledger's own order; one row per
        // reason, counted while it repeats. The version counter below is
        // what makes this read fresh: the ledger itself is localStorage.
        guard: readBotGuards(bot.id)[0] ?? null,
      });
    }

    // The lingering rows: positions the book stamps as bot-owned whose bot
    // the states map has no entry for. The states map above was keyed off
    // the same rule read, so "no entry" is settled, not racy.
    const gridStates = botsState.gridStates;
    let storedGrids: GridDocument[] = [];
    let runtimeRecords: ReturnType<typeof readGridStates> = {};
    if (!botsState.gridDegraded.grids) {
      try {
        storedGrids = readGrids();
        runtimeRecords = readGridStates();
      } catch {
        storedGrids = [];
      }
    }

    const gridRows: GridRow[] = [];
    for (const grid of storedGrids) {
      if (typeof grid.id !== "string") continue;
      const life = gridStates.get(grid.id);
      if (!life) continue;
      // When paper trading is off, closed grids stay out of the unavailable view;
      // non-closed grids render their `account_unavailable` row per FEAT-0819 AC 17.
      if (executing !== PAPER_ACCOUNT && life.status === "closed") continue;
      const position =
        positions.find((p) => p.origin === "bot" && p.botId === grid.id) ?? null;
      const restingOrderCount = paperState.orders.filter(
        (o) => o.origin === "bot" && o.botId === grid.id && o.planGroupId === undefined,
      ).length;
      const openSlotsCount = runtimeRecords[grid.id]?.openSlots?.length ?? 0;
      const filledCount = Math.min(
        grid.level_count,
        Math.max(openSlotsCount, life.counterOrderCount),
      );
      gridRows.push({
        kind: "grid",
        id: grid.id,
        name: grid.name,
        symbol: grid.symbol,
        side: grid.side,
        lowerPrice: grid.lower_price,
        upperPrice: grid.upper_price,
        spacing: grid.spacing,
        levelCount: grid.level_count,
        filledCount,
        restingOrderCount,
        life,
        position,
        pnl: null,
      });
    }

    const ownedIds = new Set([
      ...botRows.map((row) => row.id),
      ...storedGrids.map((g) => g.id),
    ]);
    const lingering: LingeringRow[] = [];
    // The lingering rows live on the paper book, so they follow the paper
    // account: listed only while it executes.
    const paperExecuting = executing === PAPER_ACCOUNT;
    for (const position of paperExecuting ? positions : []) {
      if (position.origin !== "bot" || position.botId === undefined) continue;
      if (ownedIds.has(position.botId)) continue;
      lingering.push({ kind: "lingering", botId: position.botId, position });
    }

    botRows.sort((a, b) => {
      const rank = STATE_RANK[a.life.state] - STATE_RANK[b.life.state];
      if (rank !== 0) return rank;
      const symbol = a.symbol.localeCompare(b.symbol);
      if (symbol !== 0) return symbol;
      return a.name.localeCompare(b.name);
    });
    gridRows.sort((a, b) => {
      const rank = GRID_STATE_RANK[a.life.status] - GRID_STATE_RANK[b.life.status];
      if (rank !== 0) return rank;
      const symbol = a.symbol.localeCompare(b.symbol);
      if (symbol !== 0) return symbol;
      return a.name.localeCompare(b.name);
    });
    lingering.sort((a, b) => a.position.symbol.localeCompare(b.position.symbol));

    return [...gridRows, ...botRows, ...lingering];
  });

  /**
   * Price ticks only overlay grid PnL. The static rows above keep their store
   * reads and guard-ledger parsing off this hot path.
   */
  let rows = $derived.by<Row[]>(() => {
    if (botsState.executingAccount !== PAPER_ACCOUNT) return baseRows;
    const pricedById = new Map(
      (pricedPositions ?? []).map((position) => [position.positionId, position]),
    );
    const feedById = new Map(
      (pricedPositions === undefined ? (paperAccountFeed()?.positions() ?? []) : []).map(
        (position) => [position.positionId, position],
      ),
    );
    return baseRows.map((row) => {
      if (row.kind !== "grid" || !row.position) return row;
      const position = row.position;
      const omsMatch = pricedById.get(position.positionId);
      const pnl = omsMatch
        ? omsMatch.unpriced
          ? null
          : gridUnrealizedPnl(position, omsMatch.markPrice)
        : gridUnrealizedPnl(position, parseDecimal(feedById.get(position.positionId)?.markPrice));
      return { ...row, pnl };
    });
  });

  /** Nothing can be listed while the rule store refuses to be read. */
  let rulesRefused = $derived(botsState.degraded.rules);
  /** Every bot reads blocked while the book cannot be read (FEAT-0807). */
  let bookUnreadable = $derived(botsState.degraded.book);

  /**
   * FEAT-0825 / ADR-0028 — how many bots this list hides because their
   * account is not the executing one, counted through the same per-bot
   * binding the rows use, so the notice and the list can never disagree.
   */
  let hiddenBotCount = $derived.by(() => {
    const states = botsState.states;
    if (botsState.degraded.rules) return 0;
    const executing = botsState.executingAccount;
    try {
      return readBots().filter(
        (bot) =>
          typeof bot.id === "string" &&
          states.has(bot.id) &&
          !isBotAccountExecuting(bot, executing),
      ).length;
    } catch {
      return 0;
    }
  });

  /**
   * FEAT-0825 review — the open positions of deleted bots this list hides
   * too. They are not bots, so the count above misses them; without this a
   * fleet of zero bots with one orphaned paper position read "No bots yet"
   * and the position vanished without a word. Same join as the lingering
   * rows: bot-stamped, owner not in the projection.
   */
  let hiddenLingeringCount = $derived.by(() => {
    if (botsState.executingAccount === PAPER_ACCOUNT) return 0;
    const states = botsState.states;
    const gridStates = botsState.gridStates;
    return paperState.positions.filter(
      (p) =>
        p.origin === "bot" &&
        p.botId !== undefined &&
        !states.has(p.botId) &&
        !gridStates.has(p.botId),
    ).length;
  });

  /** Locale-aware timestamps: `Intl` follows the app language, not the OS. */
  function formatAt(ms: number): string {
    void $locale;
    return new Date(ms).toLocaleString(intlTagFor($locale));
  }

  /** Holding time at minute granularity — display math, not money (ADR-0021). */
  function holdingTime(openedAt: number): string {
    void botsState.now;
    const minutes = Math.max(0, Math.floor((botsState.now - openedAt) / 60_000));
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  function conditionOf(bot: RuleDocument): string {
    void $locale;
    return renderConditionClause(bot, translator());
  }

  function orderOf(bot: RuleDocument): string {
    void $locale;
    return renderOrderSentence(bot, translator());
  }

  function translator(): SentenceTranslator {
    // Cast at the boundary the way the control center's BotsTab does: the
    // renderer composes its keys from fragments, so they are strings by
    // construction, and `schema.d.ts` can only check a literal.
    return (key, values) => $_(key as TranslationKey, { values: values || {} });
  }

  /**
   * Pause/resume — the only write this surface makes. `enabled` is outside
   * the content hash, so nothing a journal entry recorded moves, and the
   * bump is what makes this row and the control center re-read the store.
   */
  function togglePaused(row: BotRow): void {
    setBotEnabled(row.id, row.paused ? true : false);
    alertState.rulesVersion += 1;
  }

  const STATE_KEY: Record<BotLifeState["state"], TranslationKey> = {
    armed: "botsList.state.armed",
    submitting: "botsList.state.submitting",
    in_position: "botsList.state.in_position",
    closing: "botsList.state.closing",
    closed: "botsList.state.closed",
    paused: "botsList.state.paused",
    account_unavailable: "botsList.state.account_unavailable",
    blocked: "botsList.state.blocked",
    expired: "botsList.state.expired",
    limit_reached: "botsList.state.limit_reached",
    awaiting_confirmation: "botsList.state.awaiting_confirmation",
  };

  /**
   * FEAT-0822 — the guard reasons, in this row's register. The toast keys
   * say who fired and what it refused to place; a row already names the bot,
   * so these say only the bound itself. Shared from the ledger's own module
   * so every surface renders one vocabulary.
   */
  const GUARD_REASON_KEYS = BOT_GUARD_REASON_KEYS;

  function stateLabel(state: BotLifeState["state"]): string {
    return $_(STATE_KEY[state]);
  }

  function guardLabel(reason: string): string {
    const key = GUARD_REASON_KEYS[reason];
    return key === undefined ? reason : $_(key);
  }

  /**
   * FEAT-0822 — the kill switch's confirmation state: the bot whose owned
   * positions the trader was asked about, or null when nobody is asked.
   */
  let killArmedId = $state<string | null>(null);

  /**
   * The kill switch, per row. Entries stop the moment it is clicked — the
   * same one-field write the pause makes, so there is one mechanism and no
   * second truth to drift — and the owned positions are the part that asks
   * first: one confirmation names what will close, and cancelling keeps
   * them open without re-arming the bot. A bot that owns nothing is simply
   * stopped, which is the honest whole of what was asked.
   */
  function killBot(row: BotRow): void {
    setBotEnabled(row.id, false);
    alertState.rulesVersion += 1;
    killArmedId = row.life.hasPosition ? row.id : null;
  }

  async function confirmKill(row: BotRow): Promise<void> {
    killArmedId = null;
    // Only the rows this bot owns, through the same close lane its exits
    // take — the gate, `reduceOnly` and attribution are the lane's, and a
    // refusal on one row costs that row alone, not the rest.
    await closeBotOwnedPositions(row.id);
  }

  function cancelKill(): void {
    killArmedId = null;
  }

  const GRID_STATE_KEY: Record<GridLifeStatus, TranslationKey> = {
    armed: "botsList.state.armed",
    active: "botsList.state.active",
    paused: "botsList.state.paused",
    stopping: "botsList.state.stopping",
    closed: "botsList.state.closed",
    account_unavailable: "botsList.state.account_unavailable",
  };

  function gridStateLabel(status: GridLifeStatus): string {
    return $_(GRID_STATE_KEY[status]);
  }

  let stopConfirmGridId = $state<string | null>(null);
  let gridErrorById = $state<Record<string, string>>({});
  let pendingGridIds = $state(new Set<string>());

  async function handleStartGrid(row: GridRow): Promise<void> {
    if (pendingGridIds.has(row.id)) return;
    pendingGridIds.add(row.id);
    delete gridErrorById[row.id];
    try {
      const res = await startGridBot(row.id);
      if (!res.ok) {
        gridErrorById[row.id] = $_(gridRefusalKey(res.reason));
      }
    } finally {
      pendingGridIds.delete(row.id);
    }
  }

  async function handleTogglePauseGrid(row: GridRow): Promise<void> {
    if (pendingGridIds.has(row.id)) return;
    pendingGridIds.add(row.id);
    delete gridErrorById[row.id];
    try {
      const res =
        row.life.status === "paused"
          ? await resumeGridBot(row.id)
          : await pauseGridBot(row.id);
      if (!res.ok) {
        gridErrorById[row.id] = $_(gridRefusalKey(res.reason));
      }
    } finally {
      pendingGridIds.delete(row.id);
    }
  }

  function requestStopGrid(row: GridRow): void {
    delete gridErrorById[row.id];
    stopConfirmGridId = row.id;
  }

  async function confirmStopGrid(row: GridRow): Promise<void> {
    if (pendingGridIds.has(row.id)) return;
    pendingGridIds.add(row.id);
    stopConfirmGridId = null;
    try {
      const res = await stopGridBot(row.id);
      if (!res.ok) {
        gridErrorById[row.id] = $_(gridRefusalKey(res.reason));
      }
    } finally {
      pendingGridIds.delete(row.id);
    }
  }

  function cancelStopGrid(): void {
    stopConfirmGridId = null;
  }
</script>

<div
  class="relative p-2 overflow-y-auto max-h-[500px] scrollbar-thin"
  data-testid="bots-list"
>
  {#if rulesRefused}
    <!-- The rule store refused to parse (FEAT-0542): a refusal, not a crash —
         the same duty the control center's Manage tab holds. -->
    <p
      class="text-xs text-[var(--danger-color)] p-2 text-center"
      role="alert"
      data-testid="bots-rules-refusal"
    >
      {$_("botsList.rulesUnreadable")}
    </p>
  {:else if (hiddenBotCount > 0 || hiddenLingeringCount > 0) && rows.length === 0}
    {#if bookUnreadable}
      <!-- An unreadable book leaves paper trading off by its safe default
           (`paperState.load`), so this branch is where that case lands. The
           book is the cause; it is named first. -->
      <p
        class="text-xs text-[var(--warning-color)] p-2 text-center"
        role="status"
        data-testid="bots-book-degraded"
      >
        {$_("botsList.bookUnreadable")}
      </p>
    {/if}
    <!-- FEAT-0825 — the account switch made visible, never a filter to
         discover: the bots exist, they are not trading, and this says where
         they are. -->
    <p
      class="text-xs text-[var(--warning-color)] p-2 text-center"
      role="status"
      data-testid="bots-account-inactive"
    >
      {$_("botsList.accountInactive", { values: { count: hiddenBotCount } })}
      {#if hiddenLingeringCount > 0}
        {$_("botsList.accountInactiveLingering", { values: { count: hiddenLingeringCount } })}
      {/if}
    </p>
  {:else if rows.length === 0}
    <div
      class="text-xs text-[var(--text-secondary)] text-center p-4"
      data-testid="bots-empty"
    >
      {$_("botsList.empty")}
    </div>
  {:else}
    {#if bookUnreadable}
      <!-- The book is one of the projection's two inputs. "Armed" over a
           book the app cannot see would promise a trader their bot is
           waiting on positions that may exist; the notice names the input
           that failed (FEAT-0807's degradation), in this surface's words. -->
      <p
        class="text-xs text-[var(--warning-color)] p-2 text-center"
        role="status"
        data-testid="bots-book-degraded"
      >
        {$_("botsList.bookUnreadable")}
      </p>
    {/if}
    {#if hiddenBotCount > 0 || hiddenLingeringCount > 0}
      <p
        class="text-xs text-[var(--warning-color)] p-2 text-center"
        role="status"
        data-testid="bots-account-inactive"
      >
        {$_("botsList.accountInactive", { values: { count: hiddenBotCount } })}
        {#if hiddenLingeringCount > 0}
          {$_("botsList.accountInactiveLingering", { values: { count: hiddenLingeringCount } })}
        {/if}
      </p>
    {/if}
    <ul class="flex flex-col gap-2">
      {#each rows as row (row.kind === "bot" ? row.id : row.kind === "grid" ? `grid:${row.id}` : `lingering:${row.position.positionId}`)}
        {#if row.kind === "grid"}
          <li
            class="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] p-2 flex flex-col gap-1"
            data-testid="grid-row-{row.id}"
            data-grid-id={row.id}
          >
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-accent-paired">
                  {$_("botsList.grid.badge")}
                </span>
                <span class="font-bold text-sm text-[var(--text-primary)] truncate">
                  {row.name}
                </span>
                <span class="text-xs text-[var(--text-secondary)]">
                  {row.symbol}
                  {row.side === "long" ? $_("botsList.grid.sideLong") : $_("botsList.grid.sideShort")}
                </span>
                <span
                  class="text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider border border-[var(--border-color)]"
                  class:bg-success-paired={row.life.status === "active"}
                  class:bg-warning-paired={row.life.status === "stopping"}
                  class:bg-accent-paired={row.life.status === "armed"}
                  class:bg-danger-paired={row.life.status === "account_unavailable"}
                  class:bg-[var(--bg-secondary)]={row.life.status === "paused" || row.life.status === "closed"}
                  data-testid="bot-state-chip"
                >
                  {gridStateLabel(row.life.status)}
                </span>
              </div>

              {#if row.life.status !== "account_unavailable"}
                <div class="flex items-center gap-1">
                  {#if row.life.status === "armed" || row.life.status === "closed"}
                    <button
                      type="button"
                      class="py-1 px-2 text-[10px] bg-accent-paired hover-bg-accent-paired rounded transition-colors"
                      data-testid="grid-start"
                      aria-label={$_("botsList.grid.startNamed", { values: { name: row.name } })}
                      onclick={() => void handleStartGrid(row)}
                      disabled={pendingGridIds.has(row.id)}
                    >
                      {$_("botsList.grid.start")}
                    </button>
                  {/if}
                  {#if row.life.status === "active" || row.life.status === "paused"}
                    <button
                      type="button"
                      class="py-1 px-2 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                      data-testid="grid-pause-toggle"
                      aria-label={row.life.status === "paused"
                        ? $_("botsList.resumeNamed", { values: { name: row.name } })
                        : $_("botsList.pauseNamed", { values: { name: row.name } })}
                      onclick={() => void handleTogglePauseGrid(row)}
                      disabled={pendingGridIds.has(row.id)}
                    >
                      {row.life.status === "paused" ? $_("botsList.resume") : $_("botsList.pause")}
                    </button>
                  {/if}
                  {#if row.life.status === "active" || row.life.status === "paused" || row.restingOrderCount > 0 || row.position !== null}
                    <button
                      type="button"
                      class="py-1 px-2 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                      data-testid="grid-stop"
                      aria-label={$_("botsList.stopNamed", { values: { name: row.name } })}
                      onclick={() => requestStopGrid(row)}
                      disabled={pendingGridIds.has(row.id)}
                    >
                      {$_("botsList.stop")}
                    </button>
                  {/if}
                </div>
              {/if}
            </div>

            {#if stopConfirmGridId === row.id}
              <p
                class="text-xs text-[var(--warning-color)] flex items-center gap-2 flex-wrap"
                data-testid="grid-stop-confirm"
                role="alert"
              >
                {#if row.position}
                  {$_("botsList.grid.stopConfirmWithPosition", {
                    values: {
                      orders: row.restingOrderCount,
                      side: row.position.side.toUpperCase(),
                      amount: formatDynamicDecimal(gridOwnedAmount(row.position).toString()),
                      symbol: row.symbol,
                    },
                  })}
                {:else}
                  {$_("botsList.grid.stopConfirmOrdersOnly", {
                    values: {
                      orders: row.restingOrderCount,
                      symbol: row.symbol,
                    },
                  })}
                {/if}
                <button
                  type="button"
                  class="py-0.5 px-2 text-[10px] bg-[var(--danger-color)] text-[var(--text-on-danger)] rounded border border-[var(--border-color)]"
                  data-testid="grid-stop-confirm-execute"
                  onclick={() => void confirmStopGrid(row)}
                  disabled={pendingGridIds.has(row.id)}
                >
                  {$_("botsList.grid.stopConfirmExecute")}
                </button>
                <button
                  type="button"
                  class="py-0.5 px-2 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)]"
                  data-testid="grid-stop-confirm-cancel"
                  onclick={cancelStopGrid}
                >
                  {$_("botsList.grid.stopConfirmCancel")}
                </button>
              </p>
            {/if}

            <div class="flex items-center justify-between gap-2 text-xs text-[var(--text-secondary)] flex-wrap">
              <span>
                {$_("botsList.grid.range", {
                  values: {
                    lower: row.lowerPrice,
                    upper: row.upperPrice,
                    spacing:
                      row.spacing === "geometric"
                        ? $_("botsList.grid.spacingGeometric")
                        : $_("botsList.grid.spacingArithmetic"),
                  },
                })}
              </span>
              <span class="font-mono text-[var(--text-primary)]" data-testid="grid-level-progress">
                {$_("botsList.grid.progress", {
                  values: { filled: row.filledCount, total: row.levelCount },
                })}
              </span>
            </div>

            {#if row.life.status === "account_unavailable"}
              <p
                class="text-xs text-[var(--warning-color)]"
                role="status"
                data-testid="grid-account-unavailable"
              >
                {$_("botsList.grid.accountUnavailable")}
              </p>
            {/if}

            {#if gridErrorById[row.id]}
              <p class="text-xs text-[var(--danger-color)]" role="alert">
                {gridErrorById[row.id]}
              </p>
            {/if}

            {#if row.position}
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <p class="text-xs text-[var(--text-secondary)]" data-testid="grid-position-facts">
                  {$_("botsList.entry")}
                  <span class="font-mono text-[var(--text-primary)]">
                    {formatDynamicDecimal(row.position.entryPrice)}
                  </span>
                  ·
                  <span class="font-mono text-[var(--text-primary)]">
                    {formatDynamicDecimal(gridOwnedAmount(row.position).toString())}
                  </span>
                  {#if row.pnl !== null}
                    · {$_("botsList.grid.pnl")}
                    <span
                      class="font-mono"
                      class:text-[var(--success-color)]={row.pnl.gt(0)}
                      class:text-[var(--danger-color)]={row.pnl.isNegative()}
                      class:text-[var(--text-primary)]={row.pnl.isZero()}
                      data-testid="grid-position-pnl"
                    >
                      {row.pnl.gt(0) ? "+" : ""}{formatDynamicDecimal(row.pnl)}
                    </span>
                  {/if}
                </p>
                {#if onshowposition}
                  <button
                    type="button"
                    class="py-1 px-2 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                    data-testid="bot-view-position"
                    aria-label={$_("botsList.viewPositionNamed", { values: { name: row.name } })}
                    title={$_("botsList.viewPositionHint")}
                    onclick={() => onshowposition?.(row.position!.positionId)}
                  >
                    {$_("botsList.viewPosition")}
                  </button>
                {/if}
              </div>
            {/if}
          </li>
        {:else if row.kind === "bot"}
          <li
            class="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] p-2 flex flex-col gap-1"
            data-testid="bot-row-{row.id}"
            data-bot-id={row.id}
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-bold text-sm text-[var(--text-primary)] truncate">
                  {row.name}
                </span>
                <span class="text-xs text-[var(--text-secondary)]">{row.symbol}</span>
                <span
                  class="text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider border border-[var(--border-color)]"
                  class:bg-success-paired={row.life.state === "in_position"}
                  class:bg-warning-paired={row.life.state === "submitting" ||
                    row.life.state === "closing" || row.life.state === "limit_reached" ||
                    row.life.state === "awaiting_confirmation"}
                  class:bg-accent-paired={row.life.state === "armed"}
                  class:bg-danger-paired={row.life.state === "blocked" ||
                    row.life.state === "account_unavailable"}
                  class:bg-[var(--bg-secondary)]={row.life.state === "paused" ||
                    row.life.state === "closed" || row.life.state === "expired"}
                  data-testid="bot-state-chip"
                >
                  {stateLabel(row.life.state)}
                </span>
              </div>
              <div class="flex items-center gap-1">
                <!-- The accessible name says which bot the control acts on: the
                     visible label reads in row context, a screen reader reads
                     the label alone. -->
                <button
                  type="button"
                  class="py-1 px-2 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                  data-testid="bot-pause-toggle"
                  aria-label={row.paused
                    ? $_("botsList.resumeNamed", { values: { name: row.name } })
                    : $_("botsList.pauseNamed", { values: { name: row.name } })}
                  onclick={() => togglePaused(row)}
                >
                  {row.paused ? $_("botsList.resume") : $_("botsList.pause")}
                </button>
                <!-- FEAT-0822 — the kill switch: entries stop on the click,
                     the owned positions ask first, and a bot that owns
                     nothing is simply stopped. Same accessible-name
                     contract as the pause beside it. -->
                <button
                  type="button"
                  class="py-1 px-2 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                  data-testid="bot-kill"
                  aria-label={$_("botsList.stopNamed", { values: { name: row.name } })}
                  onclick={() => killBot(row)}
                >
                  {$_("botsList.stop")}
                </button>
              </div>
            </div>

            {#if killArmedId === row.id}
              <!-- One confirmation, naming what will close (FEAT-0822 AC 6):
                   the entries are already stopped — cancelling keeps the
                   positions open without re-arming the bot. -->
              <p
                class="text-xs text-[var(--warning-color)] flex items-center gap-2 flex-wrap"
                data-testid="bot-kill-confirm"
                role="alert"
              >
                {$_("botsList.killAsk", { values: { symbol: row.symbol } })}
                <button
                  type="button"
                  class="py-0.5 px-2 text-[10px] bg-[var(--danger-color)] text-[var(--text-on-danger)] rounded border border-[var(--border-color)]"
                  data-testid="bot-kill-confirm-close"
                  onclick={() => confirmKill(row)}
                >
                  {$_("botsList.killClose")}
                </button>
                <button
                  type="button"
                  class="py-0.5 px-2 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)]"
                  data-testid="bot-kill-confirm-keep"
                  onclick={cancelKill}
                >
                  {$_("botsList.killKeep")}
                </button>
              </p>
            {/if}

            <!-- The trigger timeframe qualifies the condition, not the order —
                 with a visible label, because a bare `1h` at the end of a
                 sentence reads as that sentence's timeframe. -->
            <p class="text-xs text-[var(--text-secondary)]" data-testid="bot-condition">
              {row.condition}
              <span
                class="text-[9px] px-1 py-0.5 rounded font-bold border border-[var(--border-color)] text-[var(--text-secondary)]"
                data-testid="bot-timeframe"
              >
                {$_("botsList.timeframe")} {row.timeframe}
              </span>
            </p>
            <p class="text-xs text-[var(--text-secondary)]" data-testid="bot-order">
              {row.order}
            </p>

            <!-- Lifecycle with timestamps: created, fired, and — when the
                 state itself cannot say why — one localized sentence. -->
            <p class="text-[10px] text-[var(--text-secondary)]">
              {$_("botsList.created", { values: { when: formatAt(row.createdAtMs) } })}
              ·
              {#if row.firedCount === 0}
                {$_("botsList.firedNever")}
              {:else}
                {$_("botsList.fired", {
                  values: {
                    count: row.firedCount,
                    when: row.lastFiredMs !== null ? formatAt(row.lastFiredMs) : "—",
                  },
                })}
              {/if}
            </p>

            {#if row.life.state === "paused" && row.life.hasPosition}
              <!-- One state, one flag (FEAT-0807): a paused bot can still hold
                   the position it cannot manage, and the row says both rather
                   than pretending to be flat. -->
              <p
                class="text-xs text-[var(--warning-color)]"
                data-testid="bot-paused-with-position"
              >
                {$_("botsList.pausedWithPosition")}
              </p>
            {/if}

            {#if row.life.state === "blocked"}
              <!-- One localized sentence, never the loop's raw reason: the
                   reasons are developer-facing English, some parameterized
                   (`${indicator.id} has no output '${output}'`), and they
                   belong to the loop's log. The state chip names the fact;
                   this line says what it means for the trader. -->
              <p class="text-xs text-[var(--danger-color)]" data-testid="bot-blocked-reason">
                {$_("botsList.blockedReason")}
              </p>
            {/if}

            {#if row.guard}
              <!-- FEAT-0822 — the newest guard event, counted while it
                   repeated: the answer to "why did my bot not act?". The
                   ledger holds it durable and reload-safe; this row names
                   the bound in the trader's words, never the lane's
                   vocabulary. -->
              <p class="text-[10px] text-[var(--warning-color)]" data-testid="bot-guard-line">
                {$_("botsList.guardLatest", {
                  values: { reason: guardLabel(row.guard.reason), count: row.guard.count },
                })}
              </p>
            {/if}

            {#if row.position}
              <!-- The owning position's facts — entry and holding time, read
                   from the book. No PnL here: the position row is the single
                   source for money, and the link below resolves to it. -->
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs text-[var(--text-secondary)]" data-testid="bot-position-facts">
                  {$_("botsList.entry")}
                  <span class="font-mono text-[var(--text-primary)]">{row.position.entryPrice}</span>
                  ·
                  {$_("botsList.holding", { values: { duration: holdingTime(row.position.openedAt) } })}
                </p>
                {#if onshowposition}
                  <button
                    type="button"
                    class="py-1 px-2 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                    data-testid="bot-view-position"
                    aria-label={$_("botsList.viewPositionNamed", { values: { name: row.name } })}
                    title={$_("botsList.viewPositionHint")}
                    onclick={() => onshowposition?.(row.position!.positionId)}
                  >
                    {$_("botsList.viewPosition")}
                  </button>
                {/if}
              </div>
            {/if}
          </li>
        {:else}
          <li
            class="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] p-2 flex flex-col gap-1 opacity-80"
            data-testid="bot-row-lingering-{row.position.positionId}"
            data-position-id={row.position.positionId}
          >
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-1.5 min-w-0">
                <span class="font-bold text-sm text-[var(--text-primary)] truncate">
                  {$_("botsList.lingeringTitle")}
                </span>
                <span class="text-xs text-[var(--text-secondary)]">
                  {row.position.symbol}
                  {row.position.side === "long"
                    ? $_("rules.sentence.orderSide.buy")
                    : $_("rules.sentence.orderSide.sell")}
                </span>
              </div>
              {#if onshowposition}
                <button
                  type="button"
                  class="py-1 px-2 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                  data-testid="bot-view-position"
                  aria-label={$_("botsList.viewPositionSymbol", {
                    values: { symbol: row.position.symbol },
                  })}
                  title={$_("botsList.viewPositionHint")}
                  onclick={() => onshowposition?.(row.position.positionId)}
                >
                  {$_("botsList.viewPosition")}
                </button>
              {/if}
            </div>
            <p class="text-xs text-[var(--text-secondary)]">
              {$_("botsList.entry")}
              <span class="font-mono text-[var(--text-primary)]">{row.position.entryPrice}</span>
              ·
              {$_("botsList.holding", { values: { duration: holdingTime(row.position.openedAt) } })}
            </p>
            <p class="text-[10px] text-[var(--text-secondary)]">
              {$_("botsList.lingeringHint")}
            </p>
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
</div>
