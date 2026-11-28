/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
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
 * FEAT-0819 stage 4 — paper grid bot runtime (ADR-0027, ADR-0028).
 *
 * Owns ladder placement, counter-order rebalancing on fills, pause/resume,
 * trend-filter entry withdrawal/rebuild, strict cancel-before-close stop &
 * stop-out, crash recovery from `"stopping"`, and reload reconciliation from
 * `GridDocument` + `PaperOrder[]` + `PaperPosition` + `PaperFill[]`.
 *
 * Strictly port-based (zero `src/stores/*` value imports). Every order enters
 * through `OrderGate` (`placeGridOrder` / `closePosition`), paper-only.
 */

import { Decimal } from "decimal.js";
import {
  counterOrderOf,
  gridExposure,
  gridLines,
  gridSlots,
  type GridSlot,
} from "../../lib/calculators/gridLadder";
import { feedsNamedBy, freshReadings, type FeedReading } from "../../lib/rules/feedReadings";
import { collectGridIndicators } from "../../lib/rules/indicatorRequests";
import { computeIndicatorSeries } from "../../lib/rules/indicatorSeries";
import { isRuleRefusedError, ruleSchema } from "../../lib/rules/ruleSchema";
import type {
  AccountSnapshot,
  EvaluationCandle,
  EvaluationContext,
  EvaluationIndicatorSeries,
  GridDocument,
} from "../../lib/rules/types";
import type { PaperFill, PaperOrder, PaperPosition } from "../../stores/paperTrading.svelte";
import { logger } from "../logger";
import type { PlaceGridOrderParams } from "../trade/gridOrder";
import { safeTfToMs } from "../../utils/timeUtils";
import { executingBotAccount, gridAccountUnavailable, isGridPaperOnly } from "./botAccount";
import type { BotCloseParams } from "./botExits";
import { setGridBookResetListener, setGridSlotReservationCheck } from "./gridBookBus";
import {
  findGridSlotConflict,
  isClosingOrder,
  isCounterOrder,
  isGridOccupyingSlot,
  reservedGridSlots,
  type GridBook,
} from "./gridState";
import { slotKey } from "./botState";
import {
  clearGridState,
  getGrid,
  patchGridState,
  readGrids,
  readGridState,
  readGridStates,
  writeGridState,
  type GridRuntimeRecord,
  type GridStopReason,
} from "./gridStore";

export interface GridSymbolSteps {
  priceStep?: Decimal;
  quantityStep?: Decimal;
}

export interface GridRuntimeEnvironment {
  paperEnabled: () => boolean;
  bookUnreadable: () => boolean;
  availableBalance: () => Decimal;
  feeRate: () => Decimal;
  symbolSteps: (symbol: string) => GridSymbolSteps;
  positions: () => readonly PaperPosition[];
  orders: () => readonly PaperOrder[];
  fills: () => readonly PaperFill[];
  placeGridOrder: (params: PlaceGridOrderParams) => Promise<unknown>;
  cancelOrdersOwnedBy: (botId: string) => number;
  cancelOpeningOrdersOwnedBy: (botId: string) => number;
  closePosition: (params: BotCloseParams) => Promise<unknown>;
  recordBotExit: (positionId: string) => void;
  readCandles: (symbol: string, timeframe: string) => EvaluationCandle[];
  readMarkCandles: (symbol: string, timeframe: string) => EvaluationCandle[];
  ensureMarkCandles?: (
    symbol: string,
    timeframe: string,
    requiredOpenMs?: number,
  ) => Promise<void> | undefined;
  readFeeds?: (symbol: string) => readonly FeedReading[];
  onDroppedTrendFilter?: (dropped: {
    ruleId: string;
    name: string;
    symbol: string;
    feeds: string[];
  }) => void;
  ensureSymbolMeta?: (symbol: string) => Promise<void>;
  /** FEAT-0820 — user policy for manual adds into a grid-owned position. */
  allowManualGridAdds?: () => boolean;
  accountSnapshot?: (
    grid: GridDocument,
    position: PaperPosition | undefined,
  ) => AccountSnapshot;
  syncBook?: () => void;
  syncSubscriptions?: () => void;
  now?: () => number;
}

export type GridActionResult =
  | { ok: true }
  | { ok: false; reason: string };

export function gridSlotOpenClientId(gridId: string, slotIndex: number): string {
  return `grid:${gridId}:s${slotIndex}:open`;
}

export function gridSlotCloseClientId(gridId: string, slotIndex: number): string {
  return `grid:${gridId}:s${slotIndex}:close`;
}

function defaultAccountSnapshot(
  grid: GridDocument,
  position: PaperPosition | undefined,
  availableBalance: Decimal,
  candles: readonly EvaluationCandle[],
): AccountSnapshot {
  if (!position) {
    return {
      position_size: "0",
      unrealised_pnl: "0",
      unrealised_pnl_percent: "0",
      exposure: "0",
      available_balance: availableBalance.toString(),
    };
  }
  const amount = new Decimal(position.amount);
  const entry = new Decimal(position.entryPrice);
  const leverage = new Decimal(position.leverage);
  const latestClose = candles.length > 0 ? new Decimal(candles[candles.length - 1].close) : entry;
  const notional = amount.times(entry);
  const margin = leverage.gt(0) ? notional.div(leverage) : notional;
  const unrealised =
    position.side === "long"
      ? latestClose.minus(entry).times(amount)
      : entry.minus(latestClose).times(amount);
  const percent = margin.gt(0) ? unrealised.div(margin).times(100) : new Decimal(0);

  return {
    position_size: (position.side === "long" ? amount : amount.neg()).toString(),
    unrealised_pnl: unrealised.toString(),
    unrealised_pnl_percent: percent.toString(),
    exposure: notional.toString(),
    available_balance: availableBalance.toString(),
  };
}

/**
 * Filter fills belonging to the current active run of a grid.
 * Uses `startedAfterFillId` when present (handles same-millisecond restarts
 * in fast tests), falling back to `startedAt` if older fills were evicted.
 */
function runFillsSince(
  fills: readonly PaperFill[],
  startedAt: number | undefined,
  startedAfterFillId: string | undefined,
): readonly PaperFill[] {
  if (startedAfterFillId !== undefined) {
    const idx = fills.findIndex((f) => f.fillId === startedAfterFillId);
    if (idx !== -1) return fills.slice(idx + 1);
  }
  if (startedAt !== undefined) {
    return fills.filter((f) => f.createdAt >= startedAt);
  }
  return fills;
}

export class GridRuntime {
  private env: GridRuntimeEnvironment | null = null;
  private generation = 0;
  private readonly locks = new Map<string, Promise<unknown>>();
  private selfMutationDepth = 0;
  private ownSyncDepth = 0;
  private pendingExternalReconcile = false;
  private reconcileQueued = false;
  private readonly droppedTrendFilters = new Map<string, string>();
  private readonly pendingMarkAnchors = new Map<string, number>();

  public configure(env: GridRuntimeEnvironment | null): void {
    this.generation += 1;
    this.env = env;
    this.droppedTrendFilters.clear();
    this.pendingMarkAnchors.clear();
    if (env === null) {
      setGridSlotReservationCheck(null);
      setGridBookResetListener(null);
      this.locks.clear();
      this.selfMutationDepth = 0;
      this.ownSyncDepth = 0;
      this.pendingExternalReconcile = false;
      this.reconcileQueued = false;
    } else {
      setGridSlotReservationCheck((symbol, side, botId, positionId) =>
        this.isSlotReservedForOther(symbol, side, botId, env, positionId),
      );
      setGridBookResetListener(() => this.handleBookReset());
    }
  }

  private isSlotReservedForOther(
    symbol: string,
    side: "long" | "short",
    botId: string | undefined,
    env: GridRuntimeEnvironment,
    positionId?: string,
  ): boolean {
    if (this.env !== env) return false;
    try {
      const grids = readGrids().filter((g) => g.id !== botId);
      const states = readGridStates();
      const orders = botId ? env.orders().filter((o) => o.botId !== botId) : env.orders();
      const positions = botId
        ? env.positions().filter((p) => p.botId !== botId)
        : env.positions();
      if (positionId && env.allowManualGridAdds?.() === true) {
        const target = positions.find((p) => p.positionId === positionId);
        if (target?.origin === "bot" && target.botId) {
          const owner = grids.find((g) => g.id === target.botId);
          if (
            owner &&
            slotKey(owner.symbol, owner.side) === slotKey(symbol, side)
          ) {
            // The add targets the grid's own position, so it is not a competing
            // entry. The simulator preserves the grid-owned share separately.
            return false;
          }
        }
      }
      const reserved = reservedGridSlots(grids, states, orders, positions);
      return reserved.has(slotKey(symbol.trim().toUpperCase(), side));
    } catch {
      // Fail closed when persisted grid state cannot be verified so manual/other
      // entries never silently merge into an unreadable active grid slot.
      return true;
    }
  }

  private handleBookReset(): void {
    try {
      const states = readGridStates();
      let changed = false;
      for (const [gridId, rec] of Object.entries(states)) {
        if (rec.status === "active" || rec.status === "paused" || rec.status === "stopping") {
          patchGridState(gridId, { status: "closed", stopReason: "manual", openSlots: [] });
          changed = true;
        }
      }
      if (changed) {
        this.env?.syncSubscriptions?.();
      }
    } catch (e) {
      logger.warn("alerts", "[GridRuntime] Could not reset grid states on book reset", e);
    }
  }

  public isSelfMutating(): boolean {
    return this.selfMutationDepth > 0;
  }

  /**
   * Handle paper book change notifications. External fills occurring while a
   * self-mutation await is in flight set a dirty flag and schedule a single
   * coalesced reconcile once `selfMutationDepth` drops back to 0.
   * Book-change events never auto-retry `"stopping"` grids so partial/zero
   * closes cannot loop on their own book notifications.
   */
  public notifyBookChanged(): void {
    if (!this.env || this.ownSyncDepth > 0) return;
    if (this.selfMutationDepth > 0) {
      this.pendingExternalReconcile = true;
      return;
    }
    void this.reconcileAllGrids({ includeStopping: false });
  }

  private runOwnSync<T>(fn: () => T): T {
    this.ownSyncDepth += 1;
    try {
      return fn();
    } finally {
      this.ownSyncDepth -= 1;
    }
  }

  private async callOwnOrderOp<T>(
    env: GridRuntimeEnvironment,
    ownPositionId: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prevPending = this.pendingExternalReconcile;
    const prevLastFillId = env.fills().at(-1)?.fillId;
    try {
      return await fn();
    } finally {
      const fills = env.fills();
      const idx = prevLastFillId !== undefined
        ? fills.findIndex((f) => f.fillId === prevLastFillId)
        : -1;
      const newFills =
        idx >= 0 ? fills.slice(idx + 1) : fills;
      const hasExternalFill =
        (idx >= 0 || prevLastFillId === undefined || newFills.length > 0) &&
        newFills.some(
          (f) => ownPositionId === undefined || f.positionId !== ownPositionId,
        );
      if (!hasExternalFill) {
        this.pendingExternalReconcile = prevPending;
      }
    }
  }

  private requireEnv(): GridRuntimeEnvironment {
    if (!this.env) throw new Error("gridRuntime is not configured");
    return this.env;
  }

  private withGridLock<T>(gridId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(gridId) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(task);
    const tail = next.then(
      () => {
        if (this.locks.get(gridId) === tail) this.locks.delete(gridId);
      },
      () => {
        if (this.locks.get(gridId) === tail) this.locks.delete(gridId);
      },
    );
    this.locks.set(gridId, tail);
    return next;
  }

  private async runSelfMutation<T>(fn: () => Promise<T> | T): Promise<T> {
    const gen = this.generation;
    this.selfMutationDepth += 1;
    try {
      return await fn();
    } finally {
      this.selfMutationDepth -= 1;
      if (
        this.selfMutationDepth === 0 &&
        this.pendingExternalReconcile &&
        !this.reconcileQueued &&
        this.env &&
        this.generation === gen
      ) {
        this.pendingExternalReconcile = false;
        this.reconcileQueued = true;
        queueMicrotask(() => {
          this.reconcileQueued = false;
          if (this.env && this.generation === gen && this.selfMutationDepth === 0) {
            void this.reconcileAllGrids({ includeStopping: false });
          }
        });
      }
    }
  }

  private buildBook(env: GridRuntimeEnvironment): GridBook {
    let grids: GridDocument[] = [];
    let states: Record<string, GridRuntimeRecord> = {};
    let unreadable = env.bookUnreadable();
    try {
      grids = readGrids();
      states = readGridStates();
    } catch {
      unreadable = true;
    }
    return {
      executingAccount: executingBotAccount(env.paperEnabled()),
      positions: env.positions(),
      orders: env.orders(),
      activeGrids: grids.map((grid) => ({
        grid,
        status: states[grid.id]?.status ?? "armed",
      })),
      bookUnreadable: unreadable,
    };
  }

  private reservedBalanceByOtherGrids(
    excludeGridId: string,
    env: GridRuntimeEnvironment,
  ): Decimal {
    let grids: GridDocument[];
    let states: Record<string, GridRuntimeRecord>;
    try {
      grids = readGrids();
      states = readGridStates();
    } catch {
      return new Decimal(0);
    }
    const feeRate = env.feeRate();
    let total = new Decimal(0);
    for (const other of grids) {
      if (other.id === excludeGridId) continue;
      const status = states[other.id]?.status ?? "armed";
      if (!isGridOccupyingSlot(status)) continue;
      const otherSlots = this.computeSlots(other, env);
      if (!otherSlots.ok) continue;
      total = total.plus(gridExposure(otherSlots.slots, feeRate).reserveWithFees);
    }
    return total;
  }

  private computeSlots(
    grid: GridDocument,
    env: GridRuntimeEnvironment,
  ): { ok: true; slots: GridSlot[] } | { ok: false; reason: string } {
    const steps = env.symbolSteps(grid.symbol);
    const linesRes = gridLines(
      {
        lower: new Decimal(grid.lower_price),
        upper: new Decimal(grid.upper_price),
        levelCount: grid.level_count,
        spacing: grid.spacing,
      },
      steps.priceStep,
    );
    if (!linesRes.ok) return { ok: false, reason: linesRes.reason };

    const slotsRes = gridSlots(
      grid.side,
      linesRes.value,
      new Decimal(grid.sizing.amount),
      steps.quantityStep,
    );
    if (!slotsRes.ok) return { ok: false, reason: slotsRes.reason };

    return { ok: true, slots: slotsRes.value };
  }

  private checkGridAccount(
    grid: GridDocument,
    env: GridRuntimeEnvironment,
  ): GridActionResult | null {
    if (!isGridPaperOnly(grid)) {
      return { ok: false, reason: "level-not-supported" };
    }
    if (gridAccountUnavailable(grid, executingBotAccount(env.paperEnabled()))) {
      return { ok: false, reason: "paper-trading-off" };
    }
    return null;
  }

  public async startGrid(gridId: string): Promise<GridActionResult> {
    return this.withGridLock(gridId, () => this.startGridInternal(gridId));
  }

  private async startGridInternal(gridId: string): Promise<GridActionResult> {
    const env = this.requireEnv();
    const grid = getGrid(gridId);
    if (!grid) return { ok: false, reason: "grid-not-found" };
    if (env.bookUnreadable()) return { ok: false, reason: "book-unreadable" };

    const accountErr = this.checkGridAccount(grid, env);
    if (accountErr) return accountErr;

    // Set once the grid is persisted as active; a failure past this point must undo it.
    let rollback: (() => void) | null = null;
    try {
      const canonical = ruleSchema.validateGrid(grid);
      let prevState: GridRuntimeRecord | undefined;
      try {
        prevState = readGridState(canonical.id);
      } catch {
        return { ok: false, reason: "state-unreadable" };
      }
      if (
        prevState !== undefined &&
        prevState.status !== "armed" &&
        prevState.status !== "closed"
      ) {
        return { ok: false, reason: `invalid-state:${prevState.status}` };
      }
      if (prevState?.status === "closed") {
        const hasResidual =
          env.orders().some((o) => o.origin === "bot" && o.botId === canonical.id) ||
          env
            .positions()
            .some(
              (p) =>
                p.origin === "bot" &&
                p.botId === canonical.id &&
                new Decimal(p.amount).gt(0),
            );
        if (hasResidual) {
          return { ok: false, reason: "exposure-remaining" };
        }
      }

      await env.ensureSymbolMeta?.(canonical.symbol);
      // The await yields: a delete or an edit may have landed meanwhile.
      // Start only the document that is still stored and matches what was validated.
      const current = getGrid(canonical.id);
      if (!current) return { ok: false, reason: "grid-not-found" };
      // Compare the whole canonical document, not the strategy hash: the hash does not
      // cover every field (level_count, for one), so it would miss a real edit.
      if (
        JSON.stringify(ruleSchema.validateGrid(current)) !== JSON.stringify(canonical)
      ) {
        return { ok: false, reason: "grid-changed" };
      }
      const book = this.buildBook(env);
      const conflict = findGridSlotConflict(canonical.symbol, canonical.side, canonical.id, book);
      if (conflict !== null) {
        return { ok: false, reason: `slot-conflict:${conflict.reason}` };
      }

      const slotsRes = this.computeSlots(canonical, env);
      if (!slotsRes.ok) return slotsRes;

      const exposure = gridExposure(slotsRes.slots, env.feeRate());
      const reservedByOthers = this.reservedBalanceByOtherGrids(canonical.id, env);
      const freeForGrid = Decimal.max(0, env.availableBalance().minus(reservedByOthers));
      if (freeForGrid.lt(exposure.reserveWithFees)) {
        return { ok: false, reason: "insufficient-balance" };
      }

      const nowMs = env.now ? env.now() : Date.now();
      const allFills = env.fills();
      const startedAfterFillId =
        allFills.length > 0 ? allFills[allFills.length - 1].fillId : undefined;

      const startedState = patchGridState(canonical.id, {
        status: "active",
        startedAt: nowMs,
        startedAfterFillId,
        lastTrendFilter: null,
        stopReason: undefined,
        openSlots: [],
      });
      const restorePrevState = (): void => {
        if (prevState) {
          writeGridState(canonical.id, prevState);
        } else {
          clearGridState(canonical.id);
        }
      };
      rollback = restorePrevState;

      const strategyHash = ruleSchema.gridContentHash(canonical);
      const placement = await this.placeMissingOrders(
        canonical,
        slotsRes.slots,
        startedState,
        strategyHash,
        env,
      );
      if (placement.failed > 0) {
        await this.runSelfMutation(() => {
          this.runOwnSync(() => {
            env.cancelOrdersOwnedBy(canonical.id);
            env.syncBook?.();
          });
        });
        restorePrevState();
        return {
          ok: false,
          reason: placement.firstError ?? "start-order-refused",
        };
      }
      env.syncSubscriptions?.();
      return { ok: true };
    } catch (e) {
      // Anything thrown after activation must not leave the grid persisted as active
      // with orders that may already be placed. Cancel what it owns, then restore.
      if (rollback !== null) {
        try {
          await this.runSelfMutation(() => {
            this.runOwnSync(() => {
              env.cancelOrdersOwnedBy(gridId);
              env.syncBook?.();
            });
          });
        } catch (cleanupErr) {
          logger.error("alerts", `[GridRuntime] Start rollback failed for ${gridId}`, cleanupErr);
        }
        rollback();
      }
      if (isRuleRefusedError(e)) {
        return { ok: false, reason: e.translationKey };
      }
      logger.error("alerts", `[GridRuntime] Failed to start grid ${gridId}`, e);
      return { ok: false, reason: "start-failed" };
    }
  }

  public async pauseGrid(gridId: string): Promise<GridActionResult> {
    return this.withGridLock(gridId, async () => {
      const grid = getGrid(gridId);
      if (!grid) return { ok: false, reason: "grid-not-found" };
      const state = readGridState(gridId);
      if (state?.status === "closed" || state?.status === "stopping") {
        return { ok: false, reason: `invalid-state:${state.status}` };
      }
      // Pause stops new opening placements while counter-orders and stop-out remain active.
      patchGridState(gridId, { status: "paused" });
      return { ok: true };
    });
  }

  public async resumeGrid(gridId: string): Promise<GridActionResult> {
    return this.withGridLock(gridId, async () => {
      const env = this.requireEnv();
      const grid = getGrid(gridId);
      if (!grid) return { ok: false, reason: "grid-not-found" };
      if (env.bookUnreadable()) return { ok: false, reason: "book-unreadable" };

      const state = readGridState(gridId);
      if (state?.status !== "paused") {
        return { ok: false, reason: `invalid-state:${state?.status ?? "armed"}` };
      }
      const accountErr = this.checkGridAccount(grid, env);
      if (accountErr) return accountErr;

      let canonical: GridDocument;
      try {
        canonical = ruleSchema.validateGrid(grid);
      } catch (e) {
        if (isRuleRefusedError(e)) {
          return { ok: false, reason: e.translationKey };
        }
        logger.error("alerts", `[GridRuntime] Failed to validate grid ${gridId} on resume`, e);
        return { ok: false, reason: "resume-validation-failed" };
      }

      const book = this.buildBook(env);
      const conflict = findGridSlotConflict(canonical.symbol, canonical.side, canonical.id, book);
      if (conflict !== null) {
        return { ok: false, reason: `slot-conflict:${conflict.reason}` };
      }

      await env.ensureSymbolMeta?.(canonical.symbol);
      const precheckSlots = this.computeSlots(canonical, env);
      if (!precheckSlots.ok) return precheckSlots;

      const openOrdersBefore = env
        .orders()
        .filter((o) => o.origin === "bot" && o.botId === gridId && !isClosingOrder(o)).length;
      patchGridState(gridId, { status: "active" });
      let reconcileRes: GridActionResult;
      try {
        reconcileRes = await this.reconcileGridUnlocked(canonical, env);
      } catch (e) {
        // A throw must take the same revert path as a refused reconcile, not leave
        // the grid persisted as active while the caller is told it failed.
        logger.error("alerts", `[GridRuntime] Reconcile failed on resume of ${gridId}`, e);
        reconcileRes = { ok: false, reason: "resume-failed" };
      }
      if (!reconcileRes.ok) {
        const openOrdersAfter = env
          .orders()
          .filter((o) => o.origin === "bot" && o.botId === gridId && !isClosingOrder(o)).length;
        if (openOrdersAfter === openOrdersBefore) {
          patchGridState(gridId, { status: "paused" });
        }
        env.syncSubscriptions?.();
        return reconcileRes;
      }
      env.syncSubscriptions?.();
      return { ok: true };
    });
  }

  /**
   * Stop a grid cleanly using strict cancel-before-close ordering:
   * 1. Persist `status: "stopping"` (enables crash recovery on restart).
   * 2. Cancel all resting orders owned by `gridId` BEFORE touching the position.
   * 3. Close any remaining owned position through `OrderGate`.
   * 4. Persist `status: "closed"`.
   */
  public async stopGrid(
    gridId: string,
    reason: GridStopReason = "manual",
  ): Promise<GridActionResult> {
    const capturedGen = this.generation;
    return this.withGridLock(gridId, async () => {
      if (this.generation !== capturedGen || !this.env) {
        return { ok: false, reason: "not-configured" };
      }
      return this.stopGridInternal(gridId, reason);
    });
  }

  private async stopGridInternal(
    gridId: string,
    reason: GridStopReason,
  ): Promise<GridActionResult> {
    const env = this.env;
    if (!env) return { ok: false, reason: "not-configured" };
    const grid = getGrid(gridId);
    if (!grid) return { ok: false, reason: "grid-not-found" };
    if (!env.paperEnabled()) return { ok: false, reason: "paper-trading-off" };
    if (env.bookUnreadable()) return { ok: false, reason: "book-unreadable" };

    const existingState = readGridState(gridId);
    const hasOwnedExposure =
      env.orders().some((o) => o.origin === "bot" && o.botId === grid.id) ||
      env.positions().some((p) => {
        if (p.origin !== "bot" || p.botId !== grid.id) return false;
        const ownedAmount = p.gridOwnedAmount ? new Decimal(p.gridOwnedAmount) : new Decimal(p.amount);
        return ownedAmount.gt(0);
      });
    if (existingState?.status === "closed" && !hasOwnedExposure) {
      return { ok: true };
    }

    return this.runSelfMutation(async () => {
      // Step 1: Durable pre-stop marker so a crash between cancel and close recovers.
      patchGridState(gridId, { status: "stopping", stopReason: reason });

      // Step 2: Cancel resting orders FIRST so no intervening tick fills a new entry.
      try {
        this.runOwnSync(() => {
          env.cancelOrdersOwnedBy(grid.id);
          env.syncBook?.();
        });
      } catch (e) {
        logger.error("alerts", `[GridRuntime] Failed to cancel orders for grid ${gridId}`, e);
        return { ok: false, reason: "cancel-failed" };
      }

      // Step 3: Close owned position SECOND via OrderGate.
      const owned = env
        .positions()
        .find((p) => p.origin === "bot" && p.botId === grid.id);
      const ownedAmount = owned
        ? owned.gridOwnedAmount
          ? new Decimal(owned.gridOwnedAmount)
          : new Decimal(owned.amount)
        : new Decimal(0);
      if (owned && ownedAmount.gt(0)) {
        try {
          await this.callOwnOrderOp(env, owned.positionId, () =>
            env.closePosition({
              symbol: owned.symbol,
              positionSide: owned.side,
              // Only the grid's share. A permitted manual add stays open.
              amount: ownedAmount,
              // Stamped like the ladder's close legs: a paper toggle that races this
              // close is refused by the bot-provenance checks instead of going live.
              origin: "bot",
              attribution: {
                botId: grid.id,
                ruleId: grid.id,
                strategyHash: ruleSchema.gridContentHash(grid),
              },
            }),
          );
          this.runOwnSync(() => env.syncBook?.());
        } catch (e) {
          logger.error("alerts", `[GridRuntime] Failed to close position for grid ${gridId}`, e);
          return { ok: false, reason: "close-refused" };
        }

        const leftover = env.positions().find((p) => {
          if (p.origin !== "bot" || p.botId !== grid.id) return false;
          const remainingOwned = p.gridOwnedAmount
            ? new Decimal(p.gridOwnedAmount)
            : new Decimal(p.amount);
          return remainingOwned.gt(0);
        });
        if (leftover) {
          return { ok: false, reason: "position-remaining" };
        }
        // A manual stop is still the bot's exit; without this the track record
        // drops the PnL of the very close the trader requested.
        env.recordBotExit(owned.positionId);
      }

      // Step 4: Only mark closed once both orders and position are clear.
      patchGridState(gridId, { status: "closed", stopReason: reason, openSlots: [] });
      this.pendingMarkAnchors.delete(gridId);
      this.droppedTrendFilters.delete(gridId);
      env.syncSubscriptions?.();
      return { ok: true };
    });
  }

  public async reconcileGrid(gridId: string): Promise<GridActionResult> {
    const capturedGen = this.generation;
    return this.withGridLock(gridId, async () => {
      const env = this.env;
      if (!env || this.generation !== capturedGen) {
        return { ok: false, reason: "not-configured" };
      }
      const grid = getGrid(gridId);
      if (!grid) return { ok: false, reason: "grid-not-found" };
      return this.reconcileGridUnlocked(grid, env);
    });
  }

  private async reconcileGridUnlocked(
    grid: GridDocument,
    env: GridRuntimeEnvironment,
  ): Promise<GridActionResult> {
    if (env.bookUnreadable()) return { ok: false, reason: "book-unreadable" };
    let canonical: GridDocument;
    try {
      canonical = ruleSchema.validateGrid(grid);
    } catch (e) {
      logger.error("alerts", `[GridRuntime] Stored grid ${grid.id} failed validation`, e);
      return { ok: false, reason: "reconcile-validation-failed" };
    }
    const accountErr = this.checkGridAccount(canonical, env);
    if (accountErr) return accountErr;

    let runtime: GridRuntimeRecord | undefined;
    try {
      runtime = readGridState(grid.id);
    } catch {
      return { ok: false, reason: "state-unreadable" };
    }
    if (runtime?.status === "stopping") {
      return this.stopGridInternal(grid.id, runtime.stopReason ?? "manual");
    }
    if (runtime === undefined || runtime.status === "closed" || runtime.status === "armed") {
      return { ok: true };
    }

    await env.ensureSymbolMeta?.(canonical.symbol);
    const slotsRes = this.computeSlots(canonical, env);
    if (!slotsRes.ok) return slotsRes;

    const strategyHash = ruleSchema.gridContentHash(canonical);
    const placement = await this.placeMissingOrders(
      canonical,
      slotsRes.slots,
      runtime,
      strategyHash,
      env,
    );
    if (placement.failed > 0) {
      return { ok: false, reason: placement.firstError ?? "reconcile-order-refused" };
    }
    return { ok: true };
  }

  private async placeMissingOrders(
    grid: GridDocument,
    slots: readonly GridSlot[],
    runtime: GridRuntimeRecord | undefined,
    strategyHash: string,
    env: GridRuntimeEnvironment,
  ): Promise<{ placed: number; failed: number; firstError?: string }> {
    const ownedOrders = env
      .orders()
      .filter((o) => o.origin === "bot" && o.botId === grid.id);
    const restingByClientId = new Map<string, PaperOrder>();
    let allocatedCloseQty = new Decimal(0);
    let cumulativeOpeningNotional = new Decimal(0);
    for (const order of ownedOrders) {
      if (order.clientOrderId) restingByClientId.set(order.clientOrderId, order);
      if (isCounterOrder(order)) {
        allocatedCloseQty = allocatedCloseQty.plus(new Decimal(order.qty));
      } else if (!isClosingOrder(order) && order.price && order.qty) {
        cumulativeOpeningNotional = cumulativeOpeningNotional.plus(
          new Decimal(order.price).times(new Decimal(order.qty)),
        );
      }
    }

    const ownedPosition = env
      .positions()
      .find((p) => p.origin === "bot" && p.botId === grid.id);
    const positionAmount = ownedPosition ? new Decimal(ownedPosition.amount) : new Decimal(0);
    let cumulativeGridNotional = ownedPosition
      ? positionAmount.times(new Decimal(ownedPosition.entryPrice)).plus(cumulativeOpeningNotional)
      : cumulativeOpeningNotional;
    let remainingCloseQty = Decimal.max(0, positionAmount.minus(allocatedCloseQty));

    const runFills = runFillsSince(
      env.fills(),
      runtime?.startedAt,
      runtime?.startedAfterFillId,
    );
    const latestSlotFill = new Map<number, "open" | "close">();
    for (const slot of slots) {
      const openId = gridSlotOpenClientId(grid.id, slot.index);
      const closeId = gridSlotCloseClientId(grid.id, slot.index);
      for (let i = runFills.length - 1; i >= 0; i -= 1) {
        const clientOrderId = runFills[i].clientOrderId;
        if (clientOrderId === openId) {
          latestSlotFill.set(slot.index, "open");
          break;
        }
        if (clientOrderId === closeId) {
          latestSlotFill.set(slot.index, "close");
          break;
        }
      }
    }

    // Reconcile durable open-slot inventory so fill eviction past MAX_FILLS
    // cannot revert an open un-countered slot into a fresh opening order.
    const prevOpenSlots = runtime?.openSlots ?? [];
    const openSlotSet = new Set<number>(prevOpenSlots);
    const hasCounterOrders = ownedOrders.some(isCounterOrder);
    if (positionAmount.lte(0) && !hasCounterOrders) {
      openSlotSet.clear();
    } else {
      for (const slot of slots) {
        const openId = gridSlotOpenClientId(grid.id, slot.index);
        const closeId = gridSlotCloseClientId(grid.id, slot.index);
        const fill = latestSlotFill.get(slot.index);
        if (restingByClientId.has(closeId) || fill === "open") {
          openSlotSet.add(slot.index);
        } else if (restingByClientId.has(openId) || fill === "close") {
          openSlotSet.delete(slot.index);
        }
      }
    }

    const nextOpenSlots = [...openSlotSet].sort((a, b) => a - b);
    const openSlotsChanged =
      nextOpenSlots.length !== prevOpenSlots.length ||
      nextOpenSlots.some((val, i) => val !== prevOpenSlots[i]);
    if (openSlotsChanged && runtime !== undefined) {
      patchGridState(grid.id, { openSlots: nextOpenSlots });
    }

    const lowerBound = new Decimal(grid.lower_price);
    const upperBound = new Decimal(grid.upper_price);
    const canPlaceOpen =
      runtime?.status === "active" && runtime.lastTrendFilter !== false;

    let placed = 0;
    let failed = 0;
    let firstError: string | undefined;

    await this.runSelfMutation(async () => {
      for (const slot of slots) {
        const openId = gridSlotOpenClientId(grid.id, slot.index);
        const closeId = gridSlotCloseClientId(grid.id, slot.index);
        if (restingByClientId.has(openId) || restingByClientId.has(closeId)) continue;

        const lastFill = latestSlotFill.get(slot.index);
        const slotIsOpen = lastFill === "open" || openSlotSet.has(slot.index);
        if (slotIsOpen) {
          if (ownedPosition && remainingCloseQty.gt(0)) {
            const counter = counterOrderOf(slot, "open");
            if (counter.price.gte(lowerBound) && counter.price.lte(upperBound)) {
              const closeQty = Decimal.min(slot.quantity, remainingCloseQty);
              try {
                await this.callOwnOrderOp(env, ownedPosition.positionId, () =>
                  env.placeGridOrder({
                    symbol: grid.symbol,
                    gridSide: grid.side,
                    leg: "close",
                    price: counter.price,
                    qty: closeQty,
                    clientId: closeId,
                    attribution: {
                      botId: grid.id,
                      ruleId: grid.id,
                      strategyHash,
                    },
                    positionId: ownedPosition.positionId,
                    positionAmount,
                  }),
                );
                remainingCloseQty = remainingCloseQty.minus(closeQty);
                placed += 1;
              } catch (e) {
                failed += 1;
                if (firstError === undefined) {
                  firstError = e instanceof Error ? e.message : String(e);
                }
                logger.warn(
                  "alerts",
                  `[GridRuntime] Counter-order placement failed for ${grid.id} slot ${slot.index}`,
                  e,
                );
              }
            }
          }
          // Never fall through to placing a duplicate opening order on an open slot.
          continue;
        }

        if (!canPlaceOpen) continue;

        const openTarget = counterOrderOf(slot, "close");
        if (openTarget.price.lt(lowerBound) || openTarget.price.gt(upperBound)) continue;

        try {
          await this.callOwnOrderOp(env, ownedPosition?.positionId, () =>
            env.placeGridOrder({
              symbol: grid.symbol,
              gridSide: grid.side,
              leg: "open",
              price: openTarget.price,
              qty: slot.quantity,
              clientId: openId,
              attribution: {
                botId: grid.id,
                ruleId: grid.id,
                strategyHash,
              },
              pendingGridNotional: cumulativeGridNotional,
            }),
          );
          cumulativeGridNotional = cumulativeGridNotional.plus(openTarget.price.times(slot.quantity));
          placed += 1;
        } catch (e) {
          failed += 1;
          if (firstError === undefined) {
            firstError = e instanceof Error ? e.message : String(e);
          }
          logger.warn(
            "alerts",
            `[GridRuntime] Opening order placement failed for ${grid.id} slot ${slot.index}`,
            e,
          );
        }
      }
      if (placed > 0) {
        this.runOwnSync(() => env.syncBook?.());
      }
    });

    return { placed, failed, firstError };
  }

  private reportDroppedTrendFilter(
    grid: GridDocument,
    feeds: readonly string[],
    env: GridRuntimeEnvironment,
  ): void {
    const sorted = [...feeds].sort();
    const outageKey = sorted.join(",");
    if (this.droppedTrendFilters.get(grid.id) === outageKey) return;
    this.droppedTrendFilters.set(grid.id, outageKey);
    try {
      env.onDroppedTrendFilter?.({
        ruleId: grid.id,
        name: grid.name,
        symbol: grid.symbol,
        feeds: sorted,
      });
    } catch (e) {
      logger.error("alerts", `[GridRuntime] onDroppedTrendFilter failed for ${grid.id}`, e);
    }
  }

  /**
   * Re-evaluate any grids on `symbol` that deferred a candle anchor while
   * awaiting mark-candle cache hydration.
   */
  public async notifyMarkCandlesUpdated(symbol: string, _timeframe: string): Promise<void> {
    const env = this.env;
    if (!env || !env.paperEnabled() || env.bookUnreadable()) return;
    if (this.pendingMarkAnchors.size === 0) return;

    let grids: GridDocument[];
    try {
      grids = readGrids();
    } catch {
      return;
    }

    const normSym = symbol.trim().toUpperCase();
    for (const grid of grids) {
      if (grid.symbol.trim().toUpperCase() !== normSym) continue;
      const pendingAnchor = this.pendingMarkAnchors.get(grid.id);
      if (pendingAnchor === undefined) continue;
      this.pendingMarkAnchors.delete(grid.id);
      await this.onGridCandleClose(grid.symbol, grid.evaluation_timeframe, pendingAnchor);
    }
  }

  public async onGridCandleClose(
    symbol: string,
    timeframe: string,
    anchorMs: number,
  ): Promise<void> {
    const env = this.env;
    if (!env || !env.paperEnabled() || env.bookUnreadable()) return;

    let grids: GridDocument[];
    let allStates: Record<string, GridRuntimeRecord>;
    try {
      grids = readGrids();
      allStates = readGridStates();
    } catch {
      return;
    }

    const normSym = symbol.trim().toUpperCase();
    const tasks: Array<Promise<void>> = [];
    for (const grid of grids) {
      if (
        grid.symbol.trim().toUpperCase() !== normSym ||
        grid.evaluation_timeframe !== timeframe
      ) {
        continue;
      }

      const current = allStates[grid.id];
      if (
        current === undefined ||
        (current.status !== "active" && current.status !== "paused")
      ) {
        continue;
      }
      if (
        current.lastEvaluatedAnchorMs !== undefined &&
        anchorMs <= current.lastEvaluatedAnchorMs
      ) {
        continue;
      }

      const capturedGen = this.generation;
      tasks.push(
        this.withGridLock(grid.id, async () => {
          if (this.env !== env || this.generation !== capturedGen) return;
          if (!env.paperEnabled() || env.bookUnreadable()) return;
          let freshState: GridRuntimeRecord | undefined;
          try {
            freshState = readGridState(grid.id);
          } catch {
            return;
          }
          if (
            freshState === undefined ||
            (freshState.status !== "active" && freshState.status !== "paused")
          ) {
            return;
          }
          if (
            freshState.lastEvaluatedAnchorMs !== undefined &&
            anchorMs <= freshState.lastEvaluatedAnchorMs
          ) {
            return;
          }

          const ctx = this.buildEvaluationContext(grid, anchorMs, env);
          if (!ctx) return;

          // ADR-0029 fail-open: drop unavailable trend_filter feeds and signal once per outage.
          const namedFeeds = grid.trend_filter ? feedsNamedBy(grid.trend_filter) : [];
          const unavailableFeeds = namedFeeds.filter((f) => !(ctx.feeds && f in ctx.feeds));
          const evalGridDoc =
            unavailableFeeds.length > 0 ? { ...grid, trend_filter: undefined } : grid;

          let verdict;
          try {
            verdict = ruleSchema.evaluateGrid(evalGridDoc, ctx);
          } catch (e) {
            logger.error("alerts", `[GridRuntime] evaluateGrid failed for ${grid.id}`, e);
            return;
          }

          if (unavailableFeeds.length === 0) {
            this.droppedTrendFilters.delete(grid.id);
          } else {
            this.reportDroppedTrendFilter(grid, unavailableFeeds, env);
          }

          const hasIndeterminate =
            verdict.trend_filter?.status === "indeterminate" ||
            verdict.stop_out_verdicts.some((c) => c.status === "indeterminate");
          if (verdict.stop_out_triggered || !hasIndeterminate) {
            patchGridState(grid.id, { lastEvaluatedAnchorMs: anchorMs });
          }

          if (verdict.stop_out_triggered) {
            await this.stopGridInternal(grid.id, "stop_out");
            return;
          }

          if (unavailableFeeds.length > 0) {
            if (freshState.lastTrendFilter === false) {
              patchGridState(grid.id, { lastTrendFilter: true });
              if (freshState.status === "active") {
                await this.reconcileGridUnlocked(grid, env);
              }
            }
            return;
          }

          if (verdict.trend_filter?.status === "false") {
            patchGridState(grid.id, { lastTrendFilter: false });
            await this.runSelfMutation(() => {
              this.runOwnSync(() => {
                env.cancelOpeningOrdersOwnedBy(grid.id);
                env.syncBook?.();
              });
            });
            return;
          }

          if (verdict.trend_filter?.status === "true") {
            const wasBlocked = freshState.lastTrendFilter === false;
            if (
              wasBlocked ||
              freshState.lastTrendFilter === null ||
              freshState.lastTrendFilter === undefined
            ) {
              patchGridState(grid.id, { lastTrendFilter: true });
            }
            if (freshState.status === "active" && wasBlocked) {
              await this.reconcileGridUnlocked(grid, env);
            }
          }
        }),
      );
    }

    await Promise.all(tasks);
  }

  private buildEvaluationContext(
    grid: GridDocument,
    anchorMs: number,
    env: GridRuntimeEnvironment,
  ): EvaluationContext | undefined {
    const evalStepMs = safeTfToMs(grid.evaluation_timeframe);
    const anchorCloseMs = anchorMs + evalStepMs;

    const readTruncated = (
      reader: (s: string, tf: string) => EvaluationCandle[],
      tf: string,
    ): EvaluationCandle[] => {
      const stepMs = safeTfToMs(tf);
      return reader(grid.symbol, tf).filter((c) => c.open_time_ms + stepMs <= anchorCloseMs);
    };

    const candles: Record<string, EvaluationCandle[]> = {};
    for (const tf of ruleSchema.gridTimeframes(grid)) {
      candles[tf] = readTruncated(env.readCandles, tf);
    }
    if ((candles[grid.evaluation_timeframe]?.length ?? 0) === 0) {
      return undefined;
    }

    const markTfs = ruleSchema.gridMarkTimeframes(grid);
    const markCandles: Record<string, EvaluationCandle[]> | undefined =
      markTfs.length > 0 ? {} : undefined;
    if (markCandles) {
      for (const tf of markTfs) {
        const markStepMs = safeTfToMs(tf);
        const expectedOpenMs =
          Math.floor(anchorCloseMs / markStepMs) * markStepMs - markStepMs;
        const truncated = readTruncated(env.readMarkCandles, tf);
        if (
          expectedOpenMs >= 0 &&
          (truncated.length === 0 || truncated[truncated.length - 1].open_time_ms < expectedOpenMs)
        ) {
          // Withhold stale prior-bucket mark candles so Rust evaluates to Indeterminate
          // and retries once MarkCandleCache hydrates the closing bucket.
          markCandles[tf] = [];
          const prevPending = this.pendingMarkAnchors.get(grid.id);
          if (prevPending === undefined || anchorMs > prevPending) {
            this.pendingMarkAnchors.set(grid.id, anchorMs);
          }
          void env.ensureMarkCandles?.(grid.symbol, tf, expectedOpenMs);
        } else {
          markCandles[tf] = truncated;
        }
      }
    }

    const indicators: EvaluationIndicatorSeries[] = [];
    for (const req of collectGridIndicators(grid)) {
      const series = computeIndicatorSeries(req, candles[req.timeframe] ?? []);
      if (!series.supported) {
        logger.warn(
          "alerts",
          `[GridRuntime] Unsupported indicator in grid ${grid.id}: ${series.reason}`,
        );
        return undefined;
      }
      indicators.push({
        indicator: req.indicator,
        timeframe: req.timeframe,
        values: series.values,
      });
    }

    const ownedPosition = env
      .positions()
      .find((p) => p.origin === "bot" && p.botId === grid.id);
    const account = env.accountSnapshot
      ? env.accountSnapshot(grid, ownedPosition)
      : defaultAccountSnapshot(
          grid,
          ownedPosition,
          env.availableBalance(),
          candles[grid.evaluation_timeframe] ?? [],
        );

    const feedNames = feedsNamedBy(grid.trend_filter);
    let feeds: Record<string, string> | undefined;
    if (feedNames.length > 0 && env.readFeeds) {
      const nowMs = env.now ? env.now() : Date.now();
      const fresh = freshReadings(env.readFeeds(grid.symbol), nowMs).filter((r) =>
        feedNames.includes(r.feed),
      );
      if (fresh.length > 0) {
        feeds = {};
        for (const r of fresh) feeds[r.feed] = r.value;
      }
    }

    return {
      candles,
      ...(markCandles ? { mark_candles: markCandles } : {}),
      ...(indicators.length > 0 ? { indicators } : {}),
      ...(feeds ? { feeds } : {}),
      account,
    };
  }

  public async reconcileAllGrids(options?: { includeStopping?: boolean }): Promise<void> {
    const includeStopping = options?.includeStopping ?? true;
    const env = this.env;
    const capturedGen = this.generation;
    if (!env || !env.paperEnabled() || env.bookUnreadable()) return;

    let grids: GridDocument[];
    let allStates: Record<string, GridRuntimeRecord>;
    try {
      grids = readGrids();
      allStates = readGridStates();
    } catch {
      return;
    }

    for (const grid of grids) {
      if (this.env !== env || this.generation !== capturedGen || !env.paperEnabled() || env.bookUnreadable()) {
        return;
      }
      const runtime = allStates[grid.id];
      if (!runtime) continue;
      try {
        if (runtime.status === "stopping") {
          if (includeStopping) {
            await this.stopGrid(grid.id, runtime.stopReason ?? "manual");
          }
        } else if (runtime.status === "active" || runtime.status === "paused") {
          await this.reconcileGrid(grid.id);
        }
      } catch (e) {
        // One corrupt or unavailable grid must not abort the rest of the book.
        logger.error("alerts", `[GridRuntime] Reconcile failed for grid ${grid.id}`, e);
      }
    }
  }
}

export const gridRuntime = new GridRuntime();
