/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * FEAT-0387 — the only place that knows both the rule evaluator and the market
 * store.
 *
 * `ruleEvaluationLoop.ts` stays free of store imports so it can be tested
 * without one, and the market store imports only the loop. This module joins
 * them at startup and is the single spot where a read of `marketState` on
 * behalf of the alert system happens. It reads and never writes — ADR-0009
 * forbids a background consumer writing into `marketState`, and nothing here
 * needs to.
 */

import { browser } from "$app/env";
import type { EvaluationCandle, RuleDocument } from "../../lib/rules/types";
import { marketState } from "../../stores/market.svelte";
import { safeTfToMs } from "../../utils/timeUtils";
import { logger } from "../logger";
import { markCandleCache } from "./markCandleCache";
import { RULES_STORAGE_KEY } from "./migrateAlertsToRules";
import { get } from "svelte/store";
import { _ } from "../../locales/i18n";
import { settingsState } from "../../stores/settings.svelte";
import { toastService } from "../toastService.svelte";
import {
  logDroppedVeto,
  logUnevaluable,
  ruleEvaluationLoop,
  type ConfirmationLoopPorts,
  type DroppedVetoSink,
  type ExitLoopPorts,
  type FiringSink,
  type SuppressionSink,
  type SeriesCloseHook,
  type UnevaluableSink,
} from "./ruleEvaluationLoop";
import { fetchBitunixFundingRates } from "../api/marketData";
import { externalFeedStore } from "./externalFeedStore";
import { feedNameKey, isKnownFeed } from "../../lib/rules/externalFeeds";
import type { TranslationKey } from "../../locales/schema";
import { recordFiring } from "./shadowLedger";
import { clearBotAnchors, readBotAnchors, readRuleState, saveBotAnchors } from "./ruleStateStore";
import { readGrids, readGridStates } from "./gridStore";
import { isBot } from "./botStore";
import { ruleEvaluationGate } from "../../lib/rules/ruleEvaluationGate";
import { drawingStore } from "../../stores/drawings.svelte";
import { readDrawingAnchorLedger } from "./drawingAnchors";
import { resolveDrawingThreshold } from "./drawingThreshold";
import { readDrawingStoreSnapshot } from "./reconcileDrawingRules";
import { safeLocalStorage } from "../../utils/storageWrapper";
import { stripLegacyVenueSuffix } from "../../utils/symbolUtils";

/**
 * The closed candles of one series, oldest first.
 *
 * The last candle in the store is the one currently forming, so it is dropped:
 * evaluating a rule against a candle that has not closed is exactly what
 * close-driven evaluation exists to prevent. A series of one candle therefore
 * yields nothing, which the gate reads as "not warmed up" and withholds.
 */
export function readClosedCandles(symbol: string, timeframe: string): EvaluationCandle[] {
  return readStoredCandles(symbol, timeframe, false);
}

/**
 * The same series with the candle currently forming kept on the end —
 * FEAT-0477's `evaluation_mode: "intrabar"`.
 *
 * The exact opposite end of `readClosedCandles`, and deliberately a second
 * function rather than a flag on the first: `CandleReader`'s contract is that
 * it never includes the open candle, and a reader that sometimes does is a
 * different contract. Which of the two a rule gets is decided once, from its
 * document, by the loop.
 *
 * A one-candle series therefore yields that single forming candle rather than
 * nothing, which matters for warmup: a rule needing `n` candles is warm one
 * candle earlier here, and correctly so — the candle it is reading is the one
 * it has.
 */
export function readFormingCandles(symbol: string, timeframe: string): EvaluationCandle[] {
  return readStoredCandles(symbol, timeframe, true);
}

function readStoredCandles(
  symbol: string,
  timeframe: string,
  includeForming: boolean,
): EvaluationCandle[] {
  try {
    const stored = marketState.data[symbol]?.klines?.[timeframe];
    if (!Array.isArray(stored) || stored.length < (includeForming ? 1 : 2)) return [];

    const end = includeForming ? stored.length : stored.length - 1;
    const closed: EvaluationCandle[] = [];
    for (let i = 0; i < end; i++) {
      const candle = stored[i];
      if (candle === null || typeof candle !== "object") continue;

      // BUG-0441 review: one malformed candle used to throw on the first
      // `.toString()` and cost the whole series (`[]`), silently withholding
      // every rule on it. Drop the unreadable candle and keep the rest — a gap
      // between two real closes cannot manufacture a crossing.
      const raw = candle as unknown as Record<string, unknown>;
      const time = raw.time;
      const open = raw.open;
      const high = raw.high;
      const low = raw.low;
      const close = raw.close;
      const volume = raw.volume;
      if (
        typeof time !== "number" ||
        !Number.isFinite(time) ||
        open === null ||
        open === undefined ||
        high === null ||
        high === undefined ||
        low === null ||
        low === undefined ||
        close === null ||
        close === undefined
      ) {
        continue;
      }

      try {
        closed.push({
          open_time_ms: time,
          open: String(open),
          high: String(high),
          low: String(low),
          close: String(close),
          volume: volume === null || volume === undefined ? undefined : String(volume),
        });
      } catch {
        continue;
      }
    }
    return closed;
  } catch (e) {
    logger.error("alerts", `[Cutover] Reading candles failed for ${symbol} ${timeframe}`, e);
    return [];
  }
}

/**
 * BUG-0441 review — the timeframes this symbol actually holds history in,
 * finest first.
 *
 * `readClosedCandles` needs a timeframe to read; the replay needs to know
 * which ones exist. A symbol charted at `1h` has no `1m`/`5m`/`15m` series, so
 * a fixed probe list skips it even though history is right there. This reads
 * the store's own keys instead. Finest first because a coarser series says the
 * same thing about *whether* a target was crossed but less about *when*. A
 * label `safeTfToMs` cannot parse falls back to its 1m default and sorts among
 * the minute timeframes; store keys always parse, so that is cosmetic.
 */
export function readAvailableKlineTimeframes(symbol: string): string[] {
  try {
    const klines = marketState.data[symbol]?.klines;
    if (klines === null || klines === undefined || typeof klines !== "object") return [];

    return Object.keys(klines)
      .filter((timeframe) => {
        const series = klines[timeframe];
        return Array.isArray(series) && series.length >= 2;
      })
      .sort((a, b) => safeTfToMs(a) - safeTfToMs(b));
  } catch (e) {
    logger.error("alerts", `[Cutover] Timeframe discovery failed for ${symbol}`, e);
    return [];
  }
}

/**
 * How many trigger periods of silence turn a once-live series stale.
 *
 * Generous on purpose: a live series ticks roughly once a timeframe period,
 * so three missed periods is well past ordinary WS jitter or a brief
 * reconnect — those must not cause an alert to bounce between engines on
 * every hiccup — while still being a small, bounded window compared to a
 * series that has actually stopped for good.
 */
const STALE_SERIES_TIMEFRAME_MULTIPLE = 3;

/**
 * Whether the market store is *currently* producing candles for this symbol
 * and timeframe — not merely whether it once did.
 *
 * Migrated rules are pinned to `1m` (FEAT-0388), but the app only subscribes
 * to the timeframes the chart or the active indicators actually use — nothing
 * ties an armed rule's trigger timeframe to a guaranteed subscription, and a
 * subscription that ends does not clear the candles it already wrote:
 * `marketState` only forgets a series when the whole *symbol* is evicted
 * (`forgetSymbol`), never when one timeframe stops being watched. A rule
 * covered while its chart was on `1m` stays "observed" by a length check
 * alone even after the trader switches to `4h` and the `1m` feed goes silent
 * — armed but evaluated by nothing, the mirror
 * image of the gap this same predicate was built to close (round 3: a series
 * that only *starts* being observed mid-session). A silent gap either way is
 * indistinguishable from BUG-0382 to the trader.
 *
 * So this asks recency, not existence: the most recent candle in the buffer
 * (including the one still forming — a live series updates that one on every
 * tick) has to be no older than a few trigger periods. A series that has
 * never produced anything fails the same way a stale one does — `stored`
 * empty and `undefined - anything` both read as "not observed" below.
 */
export function isSeriesObserved(symbol: string, timeframe: string): boolean {
  try {
    const stored = marketState.data[symbol]?.klines?.[timeframe];
    if (!Array.isArray(stored) || stored.length === 0) return false;

    const last = stored[stored.length - 1];
    const lastOpenMs = last?.time;
    if (typeof lastOpenMs !== "number" || !Number.isFinite(lastOpenMs)) return false;

    const maxSilenceMs = safeTfToMs(timeframe) * STALE_SERIES_TIMEFRAME_MULTIPLE;
    return Date.now() - lastOpenMs <= maxSilenceMs;
  } catch (e) {
    logger.error("alerts", `[Cutover] Series-observed check failed for ${symbol} ${timeframe}`, e);
    return false;
  }
}

/**
 * The stored rule set, parsed.
 *
 * Pure over the raw document: everything that can go wrong with the bytes —
 * absent, corrupt, not a list — reads as no rules, exactly as before.
 */
export function parseRuleStore(raw: string | null): RuleDocument[] {
  if (raw === null) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RuleDocument[]) : [];
  } catch (e) {
    logger.error("alerts", "[Cutover] Reading stored rules failed", e);
    return [];
  }
}

/**
 * The stored rule set.
 *
 * BUG-0484 — content-keyed, not version-keyed. `evaluateForming` runs on
 * every websocket tick and used to re-read and re-parse the whole rule set
 * through this function on each one, ahead of the chart's paint. The parse
 * is now skipped while the stored bytes are unchanged: one `getItem` and one
 * string comparison per call, no object graph.
 *
 * Deliberately not keyed on `alertState.rulesVersion`: the audit found nine
 * `setItem(RULES_STORAGE_KEY)` sites (arm, remove, disarm, both reconcilers,
 * migration ×3, legacy handoff) against four version bumps, all at UI and
 * store call sites — and `armRule.ts` cannot import the store without a
 * module cycle (`alerts.svelte.ts` already imports it). A version-keyed cache
 * would evaluate stale rules the moment any unbumped path writes, which
 * trades a performance bug for a money bug. Content-keying cannot go stale
 * by construction: any writer, on any path, changes the bytes and therefore
 * misses the cache.
 *
 * The returned array is shared while the bytes are unchanged. That is safe
 * for the single production caller: the loop's `rulesFor` filters into a new
 * array, and nothing downstream mutates a document (the drawing resolver
 * copies before rewriting). Do not mutate what this returns.
 */
let cachedRuleStoreRaw: string | null | undefined;
let cachedRuleStore: RuleDocument[] = [];

export function readStoredRules(): RuleDocument[] {
  if (!browser) return [];

  // A throwing store reads as no rules, exactly as before: the loop must
  // never lose every rule's evaluation to one unreadable key, and the cache
  // is left untouched so a transient failure does not poison later reads.
  let raw: string | null;
  try {
    raw = safeLocalStorage.getItem(RULES_STORAGE_KEY);
  } catch (e) {
    logger.error("alerts", "[Cutover] Reading stored rules failed", e);
    return [];
  }
  if (raw === cachedRuleStoreRaw) return cachedRuleStore;
  cachedRuleStoreRaw = raw;
  // BUG-0599 — the alert panel seeds its draft from `tradeState.symbol`
  // (AlertPanel.svelte), which used to carry the V1 `_UMCBL` suffix, and
  // `rulesFor` matches rules by strict equality against the market store's
  // canonical key. Every rule armed before that change therefore stops matching
  // the moment the key becomes bare — and a rule that does not match is
  // indistinguishable from one that has not triggered. Silently inert alerts
  // are the exact failure this engine exists to make impossible, so the symbol
  // is converged onto the canonical form here, at the one place that owns the
  // read. Free: this runs once per distinct payload, not per evaluation.
  cachedRuleStore = parseRuleStore(raw).map((rule) =>
    typeof rule.symbol === "string"
      ? { ...rule, symbol: stripLegacyVenueSuffix(rule.symbol) }
      : rule,
  );
  return cachedRuleStore;
}

/**
 * The shadow sink: writes the verdict to the ledger and notifies nobody.
 *
 * `anchorMs` is recorded alongside the wall clock so a row says which candle
 * the verdict belongs to. It is not what the delay is measured against:
 * `compareShadowLedger` subtracts the two `recordedAtMs` values, for the
 * reasons `ShadowComparison.delaysMs` sets out.
 */
export const ledgerSink: FiringSink = ({ rule, verdict, anchorMs }) => {
  recordFiring({
    source: "shadow",
    recordedAtMs: Date.now(),
    symbol: rule.symbol,
    id: rule.id,
    timeframe: rule.trigger_timeframe,
    anchorMs,
    verdict: verdict.verdict,
  });
};

/**
 * The closed mark-price candles of one series, and a refresh if it is stale.
 *
 * The read is synchronous and the refresh is not awaited: this runs on the
 * market hot path, once per rule per candle close. A series that has not
 * arrived yet answers empty, which the core reads as "I cannot tell" and turns
 * into an indeterminate verdict — never into a last-price answer.
 *
 * Asking here rather than at startup is what keeps the request set honest: a
 * series is fetched the first time an armed rule actually reads it, and a
 * symbol nobody wrote a mark-price rule for is never requested at all.
 */
export function readMarkCandles(symbol: string, timeframe: string): EvaluationCandle[] {
  markCandleCache.ensure(symbol, timeframe);
  return markCandleCache.read(symbol, timeframe);
}

/**
 * Trigger an asynchronous mark-candle refresh for a required anchor bucket and
 * subscribe to cache updates so pending mark-dependent evaluations can replay.
 */
export function ensureMarkCandles(
  symbol: string,
  timeframe: string,
  requiredOpenMs?: number,
): Promise<void> | undefined {
  return markCandleCache.ensure(symbol, timeframe, requiredOpenMs);
}

export function subscribeMarkCandles(
  listener: (symbol: string, timeframe: string) => void,
): () => void {
  return markCandleCache.subscribe(listener);
}

/**
 * Points the loop at the live market store and at the sink the caller chose.
 *
 * The sink is a parameter rather than a constant because it is the cutover:
 * `ledgerSink` records without notifying, a notifying sink makes the rule
 * engine the thing a trader actually hears. Defaulting to the recording sink
 * keeps the safe behaviour the default — a caller that forgets to pass one
 * gets an evaluator, never a surprise notifier.
 *
 * `onClose` is the caller's chance to keep something else in step with which
 * series just produced a close — `alerts.svelte.ts` uses it to stop the loop
 * the moment the rule core stops being ready mid-session (FEAT-0406), rather
 * than keep evaluating against an evaluator that is no longer there.
 */
/**
 * What a trader sees when one of their alerts turns out to be inert.
 *
 * The log line is unconditional: the record of *why* an alert can never fire is
 * not a preference. `settingsState.brokenAlertReport` decides only whether the
 * trader is interrupted about it — and it defaults to `notify`, because this
 * failure is invisible by nature. The alert keeps sitting in the panel looking
 * armed, and an alert that silently never fires is the worst outcome an alert
 * system has.
 */
/**
 * FEAT-0816 — what a trader sees when a veto could not be read.
 *
 * Unconditional, and deliberately not behind `settingsState.brokenAlertReport`:
 * that setting is about an alert that can never fire, while this one fired
 * *without* the protection its author wrote. ADR-0029 accepted failing open
 * only because this signal exists, so making it optional would quietly undo
 * the decision it rests on.
 *
 * Bounded by the loop, not here: it reports once per rule while the same feeds
 * stay unavailable, so an outage lasting an hour is one toast rather than one
 * per candle.
 */
const DROPPED_VETO_TOAST_MS = 8000;

export const droppedVetoSink: DroppedVetoSink = (dropped) => {
  logDroppedVeto(dropped);

  const feeds = dropped.feeds
    // A feed id nothing supplies has no translation either, so it is shown as
    // written rather than as a missing key.
    .map((feed) => (isKnownFeed(feed) ? get(_)(feedNameKey(feed) as TranslationKey) : feed))
    .join(", ");

  toastService.warning(
    get(_)("dashboard.alerts.droppedVeto.toast", {
      values: { name: dropped.name || dropped.ruleId, symbol: dropped.symbol, feeds },
    }),
    DROPPED_VETO_TOAST_MS,
  );
};

export const settingsAwareUnevaluableSink: UnevaluableSink = (rule) => {
  logUnevaluable(rule);
  if (settingsState.brokenAlertReport !== "notify") return;

  toastService.error(
    get(_)("dashboard.alerts.brokenRule.toast", {
      values: { name: rule.name || rule.ruleId, symbol: rule.symbol },
    }),
  );
};

/**
 * Returns the disarm — FEAT-0406.
 *
 * Arming used to be a one-way door: the caller decided once, at startup, and
 * the loop kept evaluating for the rest of the session no matter what happened
 * to the evaluator underneath it. Handing the caller a disposer lets the loop
 * be stopped when the ground moves under it — a core that stops being ready
 * mid-session, a second `initAlertEngine()` taking over. With one engine,
 * stopping the loop means nothing evaluates until it is re-armed, which is
 * why the disarm path logs at `error` level rather than going quiet.
 *
 * The disposer is idempotent and safe to call on a loop that was never armed —
 * `disarm()` only writes the unconfigured defaults back.
 */
/**
 * FEAT-0029 — where a drawing-anchored rule's threshold comes from.
 *
 * The store is hydrated only on the path that names a drawing (BUG-0484):
 * `loadDrawings` runs after the ledger lookup found an anchor, never for the
 * rules anchored to no drawing.
 *
 * A refusal is reported through the loop's existing unevaluable channel rather
 * through a new one. That channel already dedupes per rule and already
 * reaches the panel — a rule whose drawing was deleted is exactly what it
 * means by inert, and giving it a second path would be a second dialect.
 */
export function drawingThresholdResolver(
  rule: RuleDocument,
  anchorMs: number,
): { rule: RuleDocument } | { unevaluable: string } {
  const resolved = resolveDrawingThreshold(rule, anchorMs, {
    ledger: readDrawingAnchorLedger,
    loadDrawings: () => drawingStore.load(),
    drawing: (id) => drawingStore.byId(id),
    storePresent: () => readDrawingStoreSnapshot().present,
  });

  if (resolved.kind === "not-anchored") return { rule };
  if (resolved.kind === "rewritten") return { rule: resolved.rule };
  // Developer-facing English, as `UnevaluableRule.reason` specifies; the panel
  // renders its own wording from it. The drawing suffix is absent exactly when
  // there is no binding to name — BUG-0498, unreadable anchor ledger.
  return {
    unevaluable:
      resolved.drawingId === undefined
        ? resolved.reason
        : `${resolved.reason} (drawing ${resolved.drawingId})`,
  };
}

export function startRuleEvaluationLoop(
  onFiring: FiringSink = ledgerSink,
  onClose?: SeriesCloseHook,
  // FEAT-0810 — the exit ports, assembled by the store layer where store
  // access lives and passed through untouched. Passed rather than read here
  // because `paperState` is a store and this module already holds one uphill
  // edge budget per pair; the store layer owns those reads, exactly as it
  // owns `botOrderEnvironment`.
  exits?: ExitLoopPorts,
  // FEAT-0823 — the confirmation ports, same discipline: assembled by the
  // store layer (the awaiting report it maintains, the guard ledger it
  // records into) and passed through untouched.
  confirmation?: ConfirmationLoopPorts,
  // FEAT-0814 — where a vetoed trigger goes. Absent (shadow mode) records
  // nothing.
  onSuppressed?: SuppressionSink,
  // FEAT-0819 — runs once per closed anchor oldest-first inside backfill loops.
  onEachClose?: SeriesCloseHook,
): () => void {
  // A no-op disposer rather than `undefined`: SSR must not hand the caller a
  // value it has to null-check, and there is nothing armed to stop.
  if (!browser) return () => {};

  ruleEvaluationLoop.configure({
    readCandles: readClosedCandles,
    readMarkCandles: readMarkCandles,
    // FEAT-0477: without this every intrabar rule reports itself unevaluable
    // rather than quietly never firing.
    readFormingCandles: readFormingCandles,
    readRules: readStoredRules,
    // FEAT-0440: without this the core sees every rule as never-fired, and
    // `frequency` is a field the builder writes and nothing reads.
    readRuleState,
    onFiring,
    onSuppressed,
    onClose,
    onEachClose,
    onUnevaluable: settingsAwareUnevaluableSink,
    // FEAT-0816 — the third-party feeds a veto may read, and the report when
    // one of them cannot be read. Wired in both modes on purpose: a shadow run
    // that dropped every feed veto would measure a different strategy than the
    // live one, which is the opposite of what shadow mode is for.
    readFeeds: (symbol) => externalFeedStore.readFeeds(symbol),
    onDroppedVeto: droppedVetoSink,
    // FEAT-0029: without this a drawing-anchored rule evaluates against the
    // constant it was stored with, which stops following the line the moment
    // the trader moves it.
    resolveThreshold: drawingThresholdResolver,
    // FEAT-0810 — the exit window's ports, live mode only: absent means the
    // window evaluates nothing, which keeps a shadow run honest.
    ...(exits
      ? {
            ownedPositions: exits.ownedPositions,
            accountForPosition: exits.accountForPosition,
            recordExitAction: exits.recordExitAction,
            onExitFiring: exits.onExitFiring,
        }
      : {}),
    // FEAT-0823 — the confirmation ports, live mode only: absent means
    // waits are held and consumed but never reported and discards are
    // silent, which is the measurement shape shadow mode exists for.
    ...(confirmation
      ? {
            onAwaiting: confirmation.onAwaiting,
            onSignalDiscarded: confirmation.onSignalDiscarded,
        }
      : {}),
  });
  // BUG-0491: bind the gate's durable half. Without this the gate dedupes
  // within the session only, and an `every_time` bot re-orders the same
  // candle after a reload. Bound here — the one place that owns store access
  // on the loop's behalf — so the gate itself stays free of storage imports.
  // FEAT-0816 — the feeds poll only for what the armed rules' vetoes name, so
  // a trader with no feed veto causes no requests. Started after `configure`:
  // the store reads the same rule reader the loop does.
  // The funding batch is read through the venue adapter that owns the
  // percent-to-fraction conversion; the feed modules take it as a port so they
  // stay out of the app's import cycle.
  externalFeedStore.configure({
    readRules: readStoredRules,
    readGrids: () => {
      try {
        const states = readGridStates();
        return readGrids().filter((grid) => {
          const status = states[grid.id]?.status;
          return status === "active" || status === "paused";
        });
      } catch {
        return [];
      }
    },
    fetchFundingRates: () => fetchBitunixFundingRates(),
  });
  externalFeedStore.start();
  ruleEvaluationGate.setBotAnchorPersistence({
    isBotRule: (document) => isBot(document),
    load: (ruleId) => readBotAnchors(ruleId),
    save: (ruleId, snapshot) => saveBotAnchors(ruleId, snapshot),
    clear: (ruleId) => clearBotAnchors(ruleId),
  });
  logger.log(
    "alerts",
    onFiring === ledgerSink
      ? "[Shadow] Rule evaluation loop armed in shadow mode"
      : "[Cutover] Rule evaluation loop armed and notifying",
  );

  return () => {
    if (!ruleEvaluationLoop.isArmed()) return;
    ruleEvaluationLoop.disarm();
    // FEAT-0816 — stop asking, and forget what was held: a reading served to
    // the next armed session as if it had just been read is exactly the stale
    // number ADR-0029 decision 2 refuses.
    externalFeedStore.stop();
    // BUG-0491: unbind the gate's durable half with the loop. Re-arming
    // re-binds it (idempotent), and a disarmed loop evaluates nothing, so no
    // anchor can go unrecorded in between.
    ruleEvaluationGate.setBotAnchorPersistence(null);
    // `error`, not `log`: a disarmed loop evaluates nothing, and with the
    // legacy engine gone there is nothing serving the alerts it held. A rule
    // the panel still shows as armed is now evaluated by nothing at all.
    // That is the BUG-0382 shape, and it does not belong in a category the
    // trader has to have switched on to see.
    logger.error(
      "alerts",
      "[Cutover] Rule evaluation loop disarmed — its alerts are evaluated by nothing until it is re-armed",
    );
  };
}
