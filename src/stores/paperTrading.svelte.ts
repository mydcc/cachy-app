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
 * Paper trading state — FEAT-0012.
 *
 * Class A throughout (ADR-0001): a simulated balance and the positions taken
 * against it are the user's trading behaviour. They stay in `localStorage`
 * and are never transmitted, exactly like the journal.
 *
 * The store holds configuration and the simulated book. The simulator that
 * moves the book lives in `src/services/paperExchange.ts`; the two are
 * separate so the simulator can be exercised without a Svelte runtime.
 */

import { browser } from "$app/environment";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { CONSTANTS } from "../lib/constants";
import { safeJsonParse } from "../utils/safeJson";
import { StorageHelper } from "../utils/storageHelper";

/**
 * How the simulator should misbehave. A simulator that only succeeds trains
 * the UI for a world that does not exist, so each of these is reachable from
 * the settings panel rather than only from a test.
 */
export type PaperFailureMode = "none" | "reject" | "timeout" | "partial";

export interface PaperConfig {
    /** Balance a reset starts from, quote currency. */
    startingBalance: string;
    /**
     * Market-order slippage in basis points, applied against the trader.
     *
     * Defaults to 5 bps rather than 0. A simulator that fills at the mid
     * price flatters every strategy that trades often, and the number people
     * carry away from paper trading is the one that decides whether they
     * fund the account — so the default has to cost something.
     */
    slippageBps: string;
    /** Taker fee in basis points. Bitunix USDT-M default is 6 bps. */
    takerFeeBps: string;
    /** Maker fee in basis points. Bitunix USDT-M default is 2 bps. */
    makerFeeBps: string;
    failureMode: PaperFailureMode;
    /** Fraction of the requested quantity a "partial" fill delivers, 0–1. */
    partialFillRatio: string;
}

export const DEFAULT_PAPER_CONFIG: PaperConfig = {
    startingBalance: "10000",
    slippageBps: "5",
    takerFeeBps: "6",
    makerFeeBps: "2",
    failureMode: "none",
    partialFillRatio: "0.5",
};

/** A simulated position, in the same shape the real one is mapped from. */
export interface PaperPosition {
    positionId: string;
    symbol: string;
    side: "long" | "short";
    amount: string;
    entryPrice: string;
    leverage: string;
    marginMode: "cross" | "isolated";
    realizedPnl: string;
    openedAt: number;
    /**
     * Simulated balance at the moment this position opened, before its own
     * entry fee (FEAT-0327).
     *
     * Recorded rather than read back later because the journal entry has to
     * say what the account was worth when the trade was *taken*; by the time
     * the trade closes the balance has already moved, and reconstructing it
     * from the fill list would be arithmetic standing in for a fact the
     * simulator had in hand.
     */
    accountSizeAtEntry?: string;
    /**
     * Risk amount (stop loss distance × size) at entry, frozen and never
     * recalculated (FEAT-0327 correctness).
     *
     * This is the risk the trader *actually took* at entry. On a partial
     * close, a new risk value would not change what the entry R was; it only
     * changes the R of what remains. By freezing it, R stays consistent with
     * the entry decision, and journal entries are unaffected by later closes.
     *
     * Only recalculated on full close (to compute realized R). Partial closes
     * leave it unchanged.
     */
    riskAmountAtEntry?: string;
}

/** A resting simulated order, waiting for the feed to cross it. */
export interface PaperOrder {
    orderId: string;
    clientOrderId?: string;
    symbol: string;
    side: "BUY" | "SELL";
    orderType: string;
    qty: string;
    price?: string;
    triggerPrice?: string;
    /**
     * Which way the feed has to move to trigger this. Recorded for attached
     * TP/SL plans (FEAT-0069), where the direction cannot be derived from the
     * order side: a take-profit and a stop-loss on the same long position are
     * both closing BUY-side orders, but one fires above the entry and the
     * other below it.
     */
    triggerDirection?: "above" | "below";
    /**
     * Which plan an attached order is (FEAT-0327). `triggerDirection` says
     * which way it fires, which is not the same question: on a short, the
     * take-profit is the one *below* the entry. The UI labels these, and
     * deriving the label from the direction would mislabel every short.
     */
    planType?: "TP" | "SL";
    /**
     * The plan *row* this leg belongs to — FEAT-0327.
     *
     * Bitunix returns one row carrying both legs and addresses cancel and
     * modify by that row's id (see `tpslNormalize.ts`, BUG-0292). The book
     * stores one order per leg, so the two legs of a plan share this id and
     * the simulator can answer, cancel and modify by it exactly as the venue
     * does.
     */
    planGroupId?: string;
    /** `LAST_PRICE` or `MARK_PRICE`, as the plan was created with. */
    stopType?: string;
    /**
     * Whether the plan tracks the position or a fixed quantity.
     *
     * A position-wide plan closes whatever the position holds when it fires,
     * so adding to a position keeps it covered. A partial plan covers the
     * quantity it was created with — that is what a scale-out ladder is made
     * of. Bitunix distinguishes them by whether the leg names a quantity.
     */
    planScope?: "position" | "partial";
    reduceOnly: boolean;
    tradeSide?: "OPEN" | "CLOSE";
    positionId?: string;
    createdAt: number;
}

/**
 * One executed simulated fill — FEAT-0327.
 *
 * The book's audit record, and the single source of truth for what the
 * simulator actually did. The order history, the journal entry and the
 * realised numbers are all read back from these rather than accumulated a
 * second time onto the position, because two running totals of the same
 * money are two chances to disagree.
 */
export interface PaperFill {
    fillId: string;
    orderId: string;
    symbol: string;
    /** Execution direction: BUY buys, SELL sells. */
    side: "BUY" | "SELL";
    /** Whether this fill opened exposure or reduced it. */
    tradeSide: "OPEN" | "CLOSE";
    orderType: string;
    qty: string;
    price: string;
    fee: string;
    /** Realised PnL of this fill, net of its own fee. Zero on an open. */
    realizedPnl: string;
    positionId: string;
    createdAt: number;
}

/**
 * Entry metadata — position ID → {entryPrice, entryFee, accountSize, risk} —
 * persisted separately from fills so they survive fill eviction (FEAT-0327
 * correctness). The 500-fill cap can't evict a position's entry details.
 */
export interface PositionMetadata {
    positionId: string;
    symbol: string;
    entryPrice: string;
    entryFee: string;
    accountSize: string;
    risk: string;
    createdAt: number;
}

/**
 * How many fills the book keeps. A paper account that has been traded for
 * months would otherwise grow its `localStorage` blob without bound, and the
 * history tab reads the recent end regardless.
 */
const MAX_FILLS = 500;

const decimalString = z
    .union([z.string(), z.number()])
    .transform((v) => String(v))
    .refine((v) => {
        try {
            const d = new Decimal(v);
            return d.isFinite() && !d.isNaN();
        } catch {
            return false;
        }
    }, "Must be a number");

const PaperPositionSchema = z.object({
    positionId: z.string(),
    symbol: z.string(),
    side: z.enum(["long", "short"]),
    amount: decimalString,
    entryPrice: decimalString,
    leverage: decimalString,
    marginMode: z.enum(["cross", "isolated"]).catch("cross"),
    realizedPnl: decimalString.catch("0"),
    openedAt: z.number().catch(0),
    accountSizeAtEntry: decimalString.optional(),
});

const PaperFillSchema = z.object({
    fillId: z.string(),
    orderId: z.string(),
    symbol: z.string(),
    side: z.enum(["BUY", "SELL"]),
    tradeSide: z.enum(["OPEN", "CLOSE"]),
    orderType: z.string().catch("MARKET"),
    qty: decimalString,
    price: decimalString,
    fee: decimalString.catch("0"),
    realizedPnl: decimalString.catch("0"),
    positionId: z.string().catch(""),
    createdAt: z.number().catch(0),
});

const PaperOrderSchema = z.object({
    orderId: z.string(),
    clientOrderId: z.string().optional(),
    symbol: z.string(),
    side: z.enum(["BUY", "SELL"]),
    orderType: z.string(),
    qty: decimalString,
    price: decimalString.optional(),
    triggerPrice: decimalString.optional(),
    triggerDirection: z.enum(["above", "below"]).optional(),
    planType: z.enum(["TP", "SL"]).optional(),
    planGroupId: z.string().optional(),
    stopType: z.string().optional(),
    planScope: z.enum(["position", "partial"]).optional(),
    reduceOnly: z.boolean().catch(false),
    tradeSide: z.enum(["OPEN", "CLOSE"]).optional(),
    positionId: z.string().optional(),
    createdAt: z.number().catch(0),
});

const PaperStateSchema = z.object({
    enabled: z.boolean().catch(false),
    config: z
        .object({
            startingBalance: decimalString,
            slippageBps: decimalString,
            takerFeeBps: decimalString,
            makerFeeBps: decimalString,
            failureMode: z.enum(["none", "reject", "timeout", "partial"]),
            partialFillRatio: decimalString,
        })
        .partial()
        .catch({}),
    balance: decimalString.catch(DEFAULT_PAPER_CONFIG.startingBalance),
    positions: z.array(PaperPositionSchema).catch([]),
    orders: z.array(PaperOrderSchema).catch([]),
    fills: z.array(PaperFillSchema).catch([]),
    /**
     * `positionId` → journal entry id, for positions the journal is still
     * following. Persisted with the book so a reload mid-trade still finds
     * the open entry to complete instead of writing a second one.
     */
    journalLinks: z.record(z.string(), z.string()).catch({}),
    nextId: z.number().int().nonnegative().catch(1),
});

class PaperTradingManager {
    private _enabled = $state(false);
    private _config = $state<PaperConfig>({ ...DEFAULT_PAPER_CONFIG });
    private _balance = $state<string>(DEFAULT_PAPER_CONFIG.startingBalance);
    private _positions = $state<PaperPosition[]>([]);
    private _orders = $state<PaperOrder[]>([]);
    private _fills = $state<PaperFill[]>([]);
    private _journalLinks = $state<Record<string, string>>({});
    private _positionMetadata = $state<Record<string, PositionMetadata>>({});
    private _nextId = $state(1);

    constructor() {
        if (browser) this.load();
    }

    get enabled(): boolean {
        return this._enabled;
    }

    get config(): Readonly<PaperConfig> {
        return this._config;
    }

    get positions(): readonly PaperPosition[] {
        return this._positions;
    }

    get orders(): readonly PaperOrder[] {
        return this._orders;
    }

    /** Executed fills, oldest first. */
    get fills(): readonly PaperFill[] {
        return this._fills;
    }

    get balance(): Decimal {
        return new Decimal(this._balance);
    }

    /**
     * Turning paper mode on or off is the one state change that must not leak:
     * a simulated position appearing in a live account, or the reverse, is the
     * failure this whole feature exists to avoid. The caller
     * (`paperTradingService`) clears the shared OMS and account stores around
     * this; the store itself only records the mode.
     */
    public setEnabled(on: boolean): void {
        if (this._enabled === on) return;
        this._enabled = on;
        this.persist();
    }

    public setConfig<K extends keyof PaperConfig>(key: K, value: PaperConfig[K]): boolean {
        if (key === "failureMode") {
            const mode = String(value) as PaperFailureMode;
            if (!["none", "reject", "timeout", "partial"].includes(mode)) return false;
            this._config = { ...this._config, failureMode: mode };
            this.persist();
            return true;
        }
        try {
            const d = new Decimal(String(value));
            if (!d.isFinite() || d.isNaN() || d.lt(0)) return false;
        } catch {
            return false;
        }
        this._config = { ...this._config, [key]: String(value) };
        this.persist();
        return true;
    }

    public numeric(key: Exclude<keyof PaperConfig, "failureMode">): Decimal {
        try {
            const d = new Decimal(this._config[key]);
            return d.isFinite() ? d : new Decimal(DEFAULT_PAPER_CONFIG[key]);
        } catch {
            return new Decimal(DEFAULT_PAPER_CONFIG[key]);
        }
    }

    // -- book mutation, used by paperExchange -------------------------------

    public setBalance(value: Decimal): void {
        this._balance = value.toString();
        this.persist();
    }

    public setPositions(positions: PaperPosition[]): void {
        this._positions = positions;
        this.persist();
    }

    public setOrders(orders: PaperOrder[]): void {
        this._orders = orders;
        this.persist();
    }

    /** Appends one executed fill to the book's audit record (FEAT-0327). */
    public addFill(fill: PaperFill): void {
        const next = [...this._fills, fill];
        this._fills = next.length > MAX_FILLS ? next.slice(-MAX_FILLS) : next;
        this.persist();
    }

    /**
     * The journal entry following a position, or undefined while none does.
     *
     * A link is kept rather than a flag because a position that has been
     * closed is gone from `positions`, and the closing fill still has to find
     * the entry it belongs to.
     */
    public journalLink(positionId: string): string | undefined {
        return this._journalLinks[positionId];
    }

    public setJournalLink(positionId: string, entryId: string): void {
        this._journalLinks = { ...this._journalLinks, [positionId]: entryId };
        this.persist();
    }

    public clearJournalLink(positionId: string): void {
        if (this._journalLinks[positionId] === undefined) return;
        const next = { ...this._journalLinks };
        delete next[positionId];
        this._journalLinks = next;
        this.persist();
    }

    /** Monotonic identifier for simulated orders and positions. */
    public takeId(prefix: string): string {
        const id = `${prefix}-${this._nextId}`;
        this._nextId += 1;
        this.persist();
        return id;
    }

    /** Wipes the simulated book back to the configured starting balance. */
    public resetBook(): void {
        this._balance = this._config.startingBalance;
        this._positions = [];
        this._orders = [];
        // The fills go with the book. Keeping them would leave an order
        // history and half-written journal links describing money the reset
        // balance no longer reflects. Journal entries already written stay —
        // they are the user's record, not the simulator's.
        this._fills = [];
        this._journalLinks = {};
        this._nextId = 1;
        this.persist();
    }

    // -- persistence ---------------------------------------------------------

    private persist(): void {
        if (!browser) return;
        try {
            StorageHelper.safeSave(
                CONSTANTS.LOCAL_STORAGE_PAPER_KEY,
                JSON.stringify({
                    enabled: this._enabled,
                    config: this._config,
                    balance: this._balance,
                    positions: this._positions,
                    orders: this._orders,
                    fills: this._fills,
                    journalLinks: this._journalLinks,
                    positionMetadata: this._positionMetadata,
                    nextId: this._nextId,
                }),
            );
        } catch {
            // Losing a simulated fill costs nothing real. Failing loudly here
            // would be noise on a feature whose whole point is that nothing
            // is at stake.
        }
    }

    private load(): void {
        try {
            const stored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_PAPER_KEY);
            if (!stored) return;
            const parsed = PaperStateSchema.safeParse(safeJsonParse(stored));
            if (!parsed.success) return;
            this._enabled = parsed.data.enabled;
            this._config = { ...DEFAULT_PAPER_CONFIG, ...parsed.data.config };
            this._balance = parsed.data.balance;
            this._positions = parsed.data.positions as PaperPosition[];
            this._orders = parsed.data.orders as PaperOrder[];
            this._fills = parsed.data.fills as PaperFill[];
            this._journalLinks = parsed.data.journalLinks;
            this._positionMetadata = parsed.data.positionMetadata || {};
            this._nextId = parsed.data.nextId;
        } catch {
            // Corrupt blob leaves paper mode off, which is the safe default:
            // the dangerous direction is believing you are simulating.
        }
    }

    public setPositionMetadata(id: string, meta: PositionMetadata): void {
        this._positionMetadata[id] = meta;
        this.persist();
    }

    public getPositionMetadata(id: string): PositionMetadata | undefined {
        return this._positionMetadata[id];
    }

    public deletePositionMetadata(id: string): void {
        delete this._positionMetadata[id];
        this.persist();
    }

    /** Test seam: reloads from storage as a fresh session would. */
    public reloadFromStorage(): void {
        this._enabled = false;
        this._config = { ...DEFAULT_PAPER_CONFIG };
        this._balance = DEFAULT_PAPER_CONFIG.startingBalance;
        this._positions = [];
        this._orders = [];
        this._fills = [];
        this._journalLinks = {};
        this._positionMetadata = {};
        this._nextId = 1;
        if (browser) this.load();
    }
}

export const paperState = new PaperTradingManager();
