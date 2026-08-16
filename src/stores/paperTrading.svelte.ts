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
    reduceOnly: boolean;
    tradeSide?: "OPEN" | "CLOSE";
    positionId?: string;
    createdAt: number;
}

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
    nextId: z.number().int().nonnegative().catch(1),
});

class PaperTradingManager {
    private _enabled = $state(false);
    private _config = $state<PaperConfig>({ ...DEFAULT_PAPER_CONFIG });
    private _balance = $state<string>(DEFAULT_PAPER_CONFIG.startingBalance);
    private _positions = $state<PaperPosition[]>([]);
    private _orders = $state<PaperOrder[]>([]);
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
            this._nextId = parsed.data.nextId;
        } catch {
            // Corrupt blob leaves paper mode off, which is the safe default:
            // the dangerous direction is believing you are simulating.
        }
    }

    /** Test seam: reloads from storage as a fresh session would. */
    public reloadFromStorage(): void {
        this._enabled = false;
        this._config = { ...DEFAULT_PAPER_CONFIG };
        this._balance = DEFAULT_PAPER_CONFIG.startingBalance;
        this._positions = [];
        this._orders = [];
        this._nextId = 1;
        if (browser) this.load();
    }
}

export const paperState = new PaperTradingManager();
