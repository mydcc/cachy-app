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

/*
 * Copyright (C) 2026 MYDCT
 *
 * Market Analyst Service
 * Analyzes market data across multiple timeframes for favorite symbols.
 */

import { apiService } from "./apiService";
import { technicalsService } from "./technicalsService";
import { logger } from "./logger";
import { marketState } from "../stores/market.svelte";
import { analysisState, type SymbolAnalysis, type TrendState } from "../stores/analysis.svelte";
import { favoritesState } from "../stores/favorites.svelte";
import { settingsState } from "../stores/settings.svelte";
import { indicatorState } from "../stores/indicator.svelte";
import { toastService } from "./toastService.svelte";
import { _ } from "../locales/i18n";
import { get } from "svelte/store";
import { Decimal } from "decimal.js";
import type { IndicatorResult, Kline } from "./technicalsTypes";

const DATA_FRESHNESS_TTL = 300 * 1000; // 5 minutes

/**
 * Candle depth the analyst asks the history backfiller for.
 *
 * The dashboard's trend column is "price vs EMA 200", and an EMA needs roughly
 * 3x its period of warm-up before the seed value stops dominating the output.
 * 600 is that 3x, and it is what makes the trend readings trustworthy enough to
 * put in front of someone sizing a position.
 *
 * Reaching this depth relies on apiService paging past the venue's 200-row
 * response cap (BUG-0231). Before that fix a single request for 600 silently
 * returned 200, which is exactly why the EMA could not converge.
 */
const ANALYST_HISTORY_TARGET = 600;

/**
 * Minimum candles required before a timeframe is considered analysable at all.
 * Below this even the oscillators are noise.
 */
const MIN_CANDLES_PER_TF = 50;

/**
 * Favourites analysed when `analyzeAllFavorites` is off. Matches the number the
 * Settings UI has always promised ("Top 4 Only" / "Nur Top 4").
 */
const TOP_FAVOURITES_COUNT = 4;

/** Retry backoff for symbols that came back with incomplete data. */
const PARTIAL_RETRY_BASE_MS = 30 * 1000;
const PARTIAL_RETRY_MAX_MS = 10 * 60 * 1000;

// Local Helpers for Safety
const safeDiv = (a: Decimal, b: Decimal) => b.isZero() ? new Decimal(0) : a.div(b);
const safeSub = (a: Decimal, b: Decimal) => a.minus(b);

// Technicals data as cached in techMap below: the raw calculation result
// plus O(1)-lookup Maps indexed by indicator name (built once per cycle
// instead of re-scanning the arrays on every read).
interface AnalystTechEntry {
    movingAverages?: IndicatorResult[];
    oscillators?: IndicatorResult[];
    confluence?: { score?: number; level?: string; contributing?: string[] };
    _maMap?: Map<string, IndicatorResult>;
    _oscMap?: Map<string, IndicatorResult>;
}

class MarketAnalystService {
    private timeoutId: ReturnType<typeof setTimeout> | null = null;
    private isRunning = false;
    private currentSymbolIndex = 0;

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.processNext();
        logger.log("technicals", "Market Analyst Service Started");
    }

    stop() {
        this.isRunning = false;
        if (this.timeoutId) clearTimeout(this.timeoutId);
        logger.log("technicals", "Market Analyst Service Stopped");
    }

    private getAnalystSettings() {
        // Use user settings but enforce certain defaults for analysis
        const base = indicatorState.toJSON();
        return {
            ...base,
            // FORCE sufficient history limit for EMA 200 convergence
            // even if user settings has a lower limit (default 750).
            historyLimit: 1000,

            // Ensure EMA 200 is included
            ema: {
                ...base.ema,
                ema3: {
                    ...base.ema.ema3, // Preserve other properties (offset, smoothing, etc.)
                    length: 200
                }
            }
        };
    }

    /**
     * Load `ANALYST_HISTORY_TARGET` candles for one symbol/timeframe.
     *
     * Deliberately a plain fetch that does NOT touch marketState.
     *
     * The obvious-looking alternative -- route this through
     * marketWatcher.ensureHistory() so the analyst warms the same cache the
     * chart and technicals panel read -- was tried and reverted. Sharing the
     * store means sharing its reactivity: the analyst sweeps every favourite
     * across four timeframes, and each backfill batch it wrote fired the
     * per-symbol effects that every visible tile and the technicals panel
     * schedule their recalculations from. With a dozen favourites that is a
     * continuous stream of forced work on the main thread, and the visible UI
     * blanks and refills throughout -- the very symptom this service's fix was
     * meant to remove, made permanent and no longer needing the Market Overview
     * window to be open at all.
     *
     * Background work stays out of the store the foreground renders from.
     *
     * This costs the analyst its IndexedDB cache and means a symbol the UI is
     * also showing gets fetched twice (modulo RequestManager's 10s dedup
     * window). That is the correct price: the analyst already has its own
     * freshness cache in analysisState, and correctness of the visible UI
     * outranks request count.
     *
     * Depth is no longer a reason to go through the backfiller either --
     * apiService pages past the venue's 200-row response cap on its own
     * (BUG-0231), which is what made the direct call insufficient before.
     */
    private async loadHistory(
        symbol: string,
        tf: string,
        provider: string,
    ): Promise<Kline[]> {
        return provider === "bitget"
            ? apiService.fetchBitgetKlines(symbol, tf, ANALYST_HISTORY_TARGET, undefined, undefined, "normal")
            : apiService.fetchBitunixKlines(symbol, tf, ANALYST_HISTORY_TARGET, undefined, undefined, "normal");
    }

    /**
     * Symbols this cycle may analyse.
     *
     * Honours the `analyzeAllFavorites` setting, which the Settings UI has
     * offered ("All Favorites" vs "Top 4 Only", with a CPU-impact warning)
     * while nothing in the codebase read it -- so the toggle did nothing and
     * the analyst silently covered only the first few symbols regardless
     * (BUG-0232).
     *
     * Every caller that asks "is the dashboard filled yet?" must use this same
     * scope. Comparing progress against symbols outside it would leave the
     * scheduler permanently waiting on work it will never do.
     */
    private getAnalysisScope(): string[] {
        const all = favoritesState.items;
        return settingsState.analyzeAllFavorites ? all : all.slice(0, TOP_FAVOURITES_COUNT);
    }

    private async processNext() {
        if (!this.isRunning) return;

        // Check visibility/focus (pause if tab hidden to save resources, unless forced)
        const isHidden = typeof document !== "undefined" && document.hidden;

        const favorites = this.getAnalysisScope();
        if (favorites.length === 0) {
            this.scheduleNext(5000);
            return;
        }

        this.currentSymbolIndex = (this.currentSymbolIndex + 1) % favorites.length;
        const symbol = favorites[this.currentSymbolIndex];

        try {
            const existing = analysisState.results[symbol];

            // Freshness is decided by WHEN we last analysed, never by whether we
            // liked the answer.
            //
            // The previous gate skipped only when the result was both fresh AND
            // had a non-neutral 4h trend. Because "neutral" was also what a
            // missing EMA 200 produced, and because the fetch path could not
            // supply enough candles for EMA 200 to converge, that condition was
            // unsatisfiable: every cycle re-fetched every timeframe of every
            // favourite, forever, at the 2s fast-path interval (BUG-0230).
            //
            // A result that came back incomplete still gets retried -- just on an
            // exponential backoff, so a symbol whose history genuinely is too
            // short (a newly listed token) settles at one attempt per 10 minutes
            // instead of pinning the request queue.
            const freshnessThreshold = existing?.quality === "partial"
                ? Math.min(
                    PARTIAL_RETRY_BASE_MS * 2 ** (existing.partialAttempts ?? 0),
                    PARTIAL_RETRY_MAX_MS,
                  )
                : (isHidden ? DATA_FRESHNESS_TTL * 2 : DATA_FRESHNESS_TTL);

            if (existing && (Date.now() - existing.updatedAt < freshnessThreshold)) {
                throw new Error("SKIP_FRESH");
            }

            analysisState.isAnalyzing = true;
            logger.log("technicals", `Analyst: Processing ${symbol}... (Started)`);

            const provider = settingsState.apiProvider;
            // Ensure we have the required timeframes for the dashboard matrix
            const requiredTimeframes = ["15m", "1h", "4h", "1d"];
            const timeframes = Array.from(new Set([...settingsState.analysisTimeframes, ...requiredTimeframes]));

            // SEQUENTIAL over timeframes, paginated within each.
            //
            // ensureHistory() already fans out up to 6 parallel range requests
            // internally to page around the exchange's 200-candle response cap.
            // Firing all four timeframes at once on top of that would put ~24
            // requests into a queue whose global ceiling is 8
            // (RequestManager.MAX_CONCURRENCY), starving the live ticker and
            // technicals feeds that the visible cards depend on -- which is what
            // made the favourite cards and the technicals panel flicker whenever
            // the analyst was busy. The analyst is a background job; trading
            // latency for a calm request queue is the right side of that trade.
            logger.log("technicals", `Analyst: ${symbol} Loading ${timeframes.length} timeframes (target ${ANALYST_HISTORY_TARGET} candles each)...`);
            const startFetch = performance.now();

            const klinesResults: Kline[][] = [];
            for (const tf of timeframes) {
                klinesResults.push(await this.loadHistory(symbol, tf, provider));
            }

            const fetchTime = performance.now() - startFetch;
            logger.log("technicals", `Analyst: ${symbol} All klines loaded in ${fetchTime.toFixed(0)}ms`);

            // Build a map of timeframe -> klines
            const klinesMap: Record<string, typeof klinesResults[0]> = {};
            timeframes.forEach((tf, i) => {
                const klines = klinesResults[i];
                klinesMap[tf] = klines;

                // Debug Logging for Data Depth
                if (import.meta.env.DEV) {
                    logger.debug("technicals", `Analyst: ${symbol}:${tf} received ${klines?.length || 0} candles.`);
                }
            });

            // Validate minimum data
            const primaryTf = timeframes.includes("1h") ? "1h" : timeframes[0];
            const primaryKlines = klinesMap[primaryTf];
            if (!primaryKlines || primaryKlines.length < MIN_CANDLES_PER_TF) throw new Error("MIN_DATA_REQUIRED");

            // PARALLEL: Calculate technicals for all timeframes
            logger.log("technicals", `Analyst: ${symbol} Calculating technicals for ${timeframes.length} timeframes...`);
            const startCalc = performance.now();

            // Prepare settings ONCE (Optimization)
            const settings = this.getAnalystSettings();

            const techPromises = timeframes.map(tf => {
                const klines = klinesMap[tf];
                if (!klines || klines.length < 20) return Promise.resolve(null);

                return technicalsService.calculateTechnicals(klines, settings);
            });

            const techResults = await Promise.all(techPromises);
            const calcTime = performance.now() - startCalc;
            logger.log("technicals", `Analyst: ${symbol} All technicals done in ${calcTime.toFixed(0)}ms`);

            // Build a map of timeframe -> technicals (with pre-indexed Maps for O(1) lookups)
            // NOTE: Do NOT mutate techResults objects — they may be cached by technicalsService.
            const techMap: Record<string, AnalystTechEntry | null> = {};
            timeframes.forEach((tf, i) => {
                const tech = techResults[i];

                if (tech) {
                    // Pre-index arrays into Maps for O(1) lookups instead of O(N) finds
                    const maMap = new Map();
                    if (tech.movingAverages) {
                        for (let j = 0; j < tech.movingAverages.length; j++) {
                            const m = tech.movingAverages[j];
                            maMap.set(`${m.name}_${m.params}`, m);
                        }
                    }

                    const oscMap = new Map();
                    if (tech.oscillators) {
                        for (let j = 0; j < tech.oscillators.length; j++) {
                            const o = tech.oscillators[j];
                            oscMap.set(o.name, o);
                        }
                    }

                    // Wrap without mutating the original cached object
                    techMap[tf] = { ...tech, _maMap: maMap, _oscMap: oscMap };
                } else {
                    techMap[tf] = tech;
                }

                // Debug Logging for EMA 200
                if (import.meta.env.DEV && techMap[tf]) {
                    const ema200 = techMap[tf]._maMap?.get("EMA_200");
                    const val = ema200?.value;
                    logger.debug("technicals", `Analyst: ${symbol}:${tf} EMA 200 = ${val}`);
                }
            });

            // Extract metrics from available data
            const tech1h = techMap["1h"];
            const techPrimary = tech1h || techMap[primaryTf];

            if (techPrimary) {
                const klines = primaryKlines;
                const lastKline = klines[klines.length - 1];
                const openKline = klines.length >= 24 ? klines[klines.length - 24] : klines[0];

                const metrics = calculateAnalysisMetrics(
                    lastKline?.close,
                    openKline?.open,
                    techMap
                );

                // A result is "partial" when any timeframe could not produce a
                // real trend reading. That flag drives the retry backoff above
                // and lets the dashboard distinguish "no data" from a signal --
                // it must never render as a confident score.
                const isPartial = Object.values(metrics.trends).some(t => t === "unknown");
                const previousAttempts = existing?.partialAttempts ?? 0;

                analysisState.updateAnalysis(symbol, {
                    symbol,
                    updatedAt: Date.now(),
                    confluenceScore: techPrimary.confluence?.score || 0,
                    // Carried through so the dashboard can show WHAT the score
                    // means and WHY. Both were computed already and discarded.
                    confluenceLevel: techPrimary.confluence?.level as SymbolAnalysis["confluenceLevel"],
                    confluenceReasons: techPrimary.confluence?.contributing,
                    quality: isPartial ? "partial" : "complete",
                    partialAttempts: isPartial ? previousAttempts + 1 : 0,
                    ...metrics
                });

                if (isPartial) {
                    const missing = Object.entries(metrics.trends)
                        .filter(([, t]) => t === "unknown")
                        .map(([tf]) => tf)
                        .join(", ");
                    logger.warn(
                        "technicals",
                        `Analyst: ${symbol} PARTIAL - no EMA 200 for [${missing}] ` +
                        `(attempt ${previousAttempts + 1}); retry backs off exponentially.`,
                    );
                }

                // Update Performance Telemetry
                marketState.updateTelemetry({ lastCalcDuration: calcTime });

                logger.log("technicals", `Analyst: ${symbol} COMPLETE - Fetch: ${fetchTime.toFixed(0)}ms, Calc: ${calcTime.toFixed(0)}ms, Total: ${(fetchTime + calcTime).toFixed(0)}ms`);
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);

            if (errorMsg === "SKIP_FRESH") {
                // Expected skip, just log debug
                if (import.meta.env.DEV) {
                    logger.debug("technicals", `Skipping ${symbol} (Fresh)`);
                }
                // Schedule next quickly
                this.scheduleNext(2000);
                return;
            }

            // Log the actual error to understand what's failing
            logger.error("technicals", `Analyst: ERROR for ${symbol}:`, errorMsg);

            // Record the failure as a partial result.
            //
            // Without this the symbol stays absent from analysisState, which
            // keeps `anyNeedsUpdate` true and pins the scheduler to its 2s fast
            // path forever -- the exact loop this fix exists to close, just
            // entered through the error door instead. Writing a partial entry
            // makes the failure visible to the UI and puts the symbol on the
            // same exponential backoff as any other incomplete analysis.
            this.recordFailure(symbol, errorMsg);

            // Toast for significant errors (ignore expected data shortage)
            if (errorMsg !== "MIN_DATA_REQUIRED") {
                toastService.error(get(_)("marketAnalyst.analysisFailed", { values: { symbol, error: errorMsg } }));
            }
        } finally {
            analysisState.isAnalyzing = false;

            if (this.isRunning && !this.timeoutId) {
                // INTELLIGENT SCHEDULING
                // Fast path (2s) exists to fill an empty dashboard on startup, so
                // it keys off "never analysed" only. It used to also fire for any
                // favourite whose 4h trend read "neutral" -- which, since a
                // missing EMA 200 produced exactly that, meant the fast path
                // latched on permanently and never returned to the user's
                // configured interval (BUG-0230).
                //
                // Bounded by construction now: every pass writes a result for the
                // symbol it visited (complete or partial), so after at most
                // favourites.length cycles this is false and the loop settles at
                // marketAnalysisInterval.
                const anyNeedsUpdate = this.getAnalysisScope().some(
                    sym => !analysisState.results[sym],
                );

                const baseDelay = (settingsState.marketAnalysisInterval || 60) * 1000;
                // If filling gaps, go fast (2s). If maintaining, use user setting.
                const delay = anyNeedsUpdate ? 2000 : (isHidden ? baseDelay * 2 : baseDelay);

                this.scheduleNext(delay);
            }
        }
    }

    /**
     * Persist a failed analysis as a `partial` result so the scheduler treats
     * the symbol as "visited" and backs off, instead of retrying it every cycle.
     */
    private recordFailure(symbol: string, reason: string) {
        const existing = analysisState.results[symbol];
        analysisState.updateAnalysis(symbol, {
            symbol,
            updatedAt: Date.now(),
            price: existing?.price ?? "0",
            change24h: existing?.change24h ?? "0",
            trend4h: "unknown",
            trends: { "15m": "unknown", "1h": "unknown", "4h": "unknown", "1d": "unknown" },
            rsi1h: existing?.rsi1h ?? "50",
            confluenceScore: 0,
            condition: "neutral",
            quality: "partial",
            partialAttempts: (existing?.partialAttempts ?? 0) + 1,
            lastError: reason,
        });
    }

    private scheduleNext(delay: number) {
        if (this.timeoutId) clearTimeout(this.timeoutId);
        if (!this.isRunning) return;

        logger.debug("technicals", `Analyst: Scheduling next cycle in ${delay}ms`);
        this.timeoutId = setTimeout(() => {
            this.timeoutId = null; // Clear ref before running
            this.processNext();
        }, delay);
    }
}

export const marketAnalyst = new MarketAnalystService();

export function calculateAnalysisMetrics(
    lastClose: Decimal.Value | null | undefined,
    open24h: Decimal.Value | null | undefined,
    techMap: Record<string, AnalystTechEntry | null>
) {
    const safeDec = (v: Decimal.Value | null | undefined): Decimal => {
        try {
            if (v === null || v === undefined) return new Decimal(0);
            return new Decimal(v);
        } catch {
            return new Decimal(0);
        }
    };

    const priceDec = safeDec(lastClose);
    const price = priceDec.toString();

    const open24hDec = safeDec(open24h);

    let change24hDec = new Decimal(0);
    if (!open24hDec.isZero()) {
        change24hDec = safeDiv(safeSub(priceDec, open24hDec), open24hDec).times(100);
    }
    const change24h = change24hDec.toFixed(2);

    // Ensure _maMap and _oscMap exist on each techMap entry (supports external callers)
    for (const tf of Object.keys(techMap)) {
        const tech = techMap[tf];
        if (tech && !tech._maMap) {
            const maMap = new Map();
            if (tech.movingAverages) {
                for (const m of tech.movingAverages) {
                    maMap.set(`${m.name}_${m.params}`, m);
                }
            }
            tech._maMap = maMap;
        }
        if (tech && !tech._oscMap) {
            const oscMap = new Map();
            if (tech.oscillators) {
                for (const o of tech.oscillators) {
                    oscMap.set(o.name, o);
                }
            }
            tech._oscMap = oscMap;
        }
    }

    // Helper to determine trend for a timeframe.
    //
    // Returns "unknown" -- not "neutral" -- when the EMA 200 is missing. The two
    // are different claims: "neutral" says the market has no direction, "unknown"
    // says we could not measure it. Collapsing them is what let a data gap
    // masquerade as a reading, both to the retry loop and to the user.
    const getTrend = (tf: string): TrendState => {
        const tech = techMap[tf];
        if (!tech) return "unknown";

        // Trend definition: price above/below the EMA 200.
        const ema = tech._maMap?.get("EMA_200")?.value;
        if (ema === undefined || (typeof ema === "number" && isNaN(ema)) || ema === 0) return "unknown";

        return priceDec.greaterThan(safeDec(ema)) ? "bullish" : "bearish";
    };

    const trends = {
        "15m": getTrend("15m"),
        "1h": getTrend("1h"),
        "4h": getTrend("4h"),
        "1d": getTrend("1d")
    };

    // Keep legacy trend4h for compatibility
    const trend4h = trends["4h"];

    // RSI from 1h or primary
    const techPrimary = techMap["1h"] || Object.values(techMap)[0];
    const rsiValue = techPrimary?._oscMap?.get("RSI")?.value;
    const rsiDec = safeDec(rsiValue || 50);
    const rsi1h = rsiDec.toFixed(2);

    let condition: SymbolAnalysis["condition"] = "neutral";

    try {
        if (rsiDec.greaterThan(70)) condition = "overbought";
        else if (rsiDec.lessThan(30)) condition = "oversold";
        else if (change24hDec.abs().greaterThan(5)) condition = "trending";
    } catch {
        condition = "neutral";
    }

    return {
        price,
        change24h,
        trend4h,
        trends,
        rsi1h,
        condition
    };
}
