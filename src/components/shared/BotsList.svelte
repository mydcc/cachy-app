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
  import type { RuleDocument } from "../../lib/rules/types";
  import type { BotLifeState } from "../../services/alertEngine/botState";
  import { readBots, setBotEnabled } from "../../services/alertEngine/botStore";
  import { readRuleStates } from "../../services/alertEngine/ruleStateStore";
  import { alertState } from "../../stores/alerts.svelte";
  import { botsState } from "../../stores/botsState.svelte";
  import { paperState, type PaperPosition } from "../../stores/paperTrading.svelte";

  interface Props {
    /**
     * FEAT-0808 — switches the sidebar to the Positions tab and highlights
     * the row this bot owns.
     *
     * Absent when the Positions tab is not showing the paper book (paper mode
     * off): the link would resolve to a list that does not contain the row,
     * and a dead link is how a surface learns to be ignored. The bot row
     * still shows the position's facts — they come from the book, not from
     * the tab.
     */
    onshowposition?: (positionId: string) => void;
  }

  let { onshowposition }: Props = $props();

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

  type Row = BotRow | LingeringRow;

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
    blocked: 5,
    closed: 6,
    expired: 7,
  };

  /**
   * The rows, derived over the projection. `botsState.states` is the reactive
   * anchor: the projection re-reads the rule store and the fire ledger on
   * every version bump and rebuilds its Map, so this derived re-reads the
   * documents in step. Reading `botsState.now` here is what makes both
   * `expired` and the holding time move with the tick above.
   */
  let rows = $derived.by<Row[]>(() => {
    const states = botsState.states;
    const degraded = botsState.degraded;
    const positions = paperState.positions;

    // The rule store is the input that could not be read (FEAT-0542's
    // refusal): nothing can be listed, and the notice below says so. The
    // unreadable-store path is the store's own answer, checked before the
    // documents are read; the catch guards only the race where another tab
    // corrupts the store between the two reads.
    if (degraded.rules) return [];
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
      });
    }

    // The lingering rows: positions the book stamps as bot-owned whose bot
    // the states map has no entry for. The states map above was keyed off
    // the same rule read, so "no entry" is settled, not racy.
    const ownedIds = new Set(botRows.map((row) => row.id));
    const lingering: LingeringRow[] = [];
    for (const position of positions) {
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
    lingering.sort((a, b) => a.position.symbol.localeCompare(b.position.symbol));

    return [...botRows, ...lingering];
  });

  /** Nothing can be listed while the rule store refuses to be read. */
  let rulesRefused = $derived(botsState.degraded.rules);
  /** Every bot reads blocked while the book cannot be read (FEAT-0807). */
  let bookUnreadable = $derived(botsState.degraded.book);

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
    blocked: "botsList.state.blocked",
    expired: "botsList.state.expired",
  };

  function stateLabel(state: BotLifeState["state"]): string {
    return $_(STATE_KEY[state]);
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
    <ul class="flex flex-col gap-2">
      {#each rows as row (row.kind === "bot" ? row.id : `lingering:${row.position.positionId}`)}
        {#if row.kind === "bot"}
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
                  class:bg-warning-paired={row.life.state === "submitting" || row.life.state === "closing"}
                  class:bg-accent-paired={row.life.state === "armed"}
                  class:bg-danger-paired={row.life.state === "blocked"}
                  class:bg-[var(--bg-secondary)]={row.life.state === "paused" ||
                    row.life.state === "closed" || row.life.state === "expired"}
                  data-testid="bot-state-chip"
                >
                  {stateLabel(row.life.state)}
                </span>
              </div>
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
            </div>

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
