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
 * Risk limits and the kill switch — FEAT-0013.
 *
 * Class A throughout (ADR-0001): limits are settings, and the kill switch is
 * a statement about this device. Neither is ever transmitted — not as
 * telemetry, not as metadata. `rmsService` reads this store and reports to
 * the FEAT-0011 gate; nothing else writes to it.
 *
 * Limits are held as strings, the same way `tradeState` holds its numeric
 * inputs, and converted to `Decimal` on read. `null` means "not configured",
 * which is distinct from zero: an unconfigured limit is not enforced, a
 * limit of zero refuses everything.
 */

import { browser } from "$app/environment";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { CONSTANTS } from "../lib/constants";
import { safeJsonParse } from "../utils/safeJson";
import { StorageHelper } from "../utils/storageHelper";

/** The raw, user-entered form of each limit. `null` = not configured. */
export interface RiskLimitInputs {
    maxPositionSizeUsdt: string | null;
    maxPositionSizePercent: string | null;
    maxLeverage: string | null;
    maxLossPerTradeUsdt: string | null;
    maxDailyLossUsdt: string | null;
    maxOpenPositions: number | null;
}

export const INITIAL_RISK_LIMITS: RiskLimitInputs = {
    maxPositionSizeUsdt: null,
    maxPositionSizePercent: null,
    maxLeverage: null,
    maxLossPerTradeUsdt: null,
    maxDailyLossUsdt: null,
    maxOpenPositions: null,
};

/**
 * The only value that releases the kill switch. Requiring a caller to build
 * this makes "clearing it takes a deliberate action" a property of the API
 * rather than a convention the UI is trusted to follow — a stray boolean
 * cannot turn the switch off by accident.
 */
export interface KillSwitchRelease {
    confirmed: true;
}

const numericLimit = z
    .union([z.string(), z.number()])
    .transform((val) => String(val))
    .refine((val) => {
        if (val === "") return true;
        try {
            const d = new Decimal(val);
            return d.isFinite() && !d.isNaN() && d.gte(0);
        } catch {
            return false;
        }
    }, "Must be a non-negative number")
    .transform((val) => (val === "" ? null : val))
    .nullable()
    .catch(null);

const RiskStateSchema = z.object({
    limits: z
        .object({
            maxPositionSizeUsdt: numericLimit,
            maxPositionSizePercent: numericLimit,
            maxLeverage: numericLimit,
            maxLossPerTradeUsdt: numericLimit,
            maxDailyLossUsdt: numericLimit,
            maxOpenPositions: z
                .union([z.number(), z.string()])
                .transform((v) => {
                    const n = Math.floor(Number(v));
                    return Number.isFinite(n) && n >= 0 ? n : null;
                })
                .nullable()
                .catch(null),
        })
        .partial()
        .catch({}),
    // Epoch ms of the moment the switch was engaged, or null. A timestamp
    // rather than a boolean so the UI can say *when* trading was stopped —
    // a switch someone flipped four days ago reads very differently from one
    // flipped a minute ago.
    killSwitchEngagedAt: z.number().int().positive().nullable().catch(null),
});

class RiskManager {
    private _limits = $state<RiskLimitInputs>({ ...INITIAL_RISK_LIMITS });
    private _killSwitchEngagedAt = $state<number | null>(null);
    /** Set when a persist attempt failed, so the UI can stop lying about it. */
    private _persistFailed = $state(false);

    constructor() {
        if (browser) this.load();
    }

    get limits(): Readonly<RiskLimitInputs> {
        return this._limits;
    }

    get killSwitchEngagedAt(): number | null {
        return this._killSwitchEngagedAt;
    }

    get isKillSwitchEngaged(): boolean {
        return this._killSwitchEngagedAt !== null;
    }

    /**
     * True when the last write to localStorage did not land. The kill switch
     * would then not survive a reload, which the UI has to say out loud
     * rather than showing a reassuring red banner that means nothing.
     */
    get persistFailed(): boolean {
        return this._persistFailed;
    }

    /**
     * Engages the kill switch. Idempotent — engaging an already-engaged
     * switch keeps the original timestamp, so repeated panic clicks do not
     * make it look freshly flipped.
     */
    public engageKillSwitch(now = Date.now()): void {
        if (this._killSwitchEngagedAt !== null) return;
        this._killSwitchEngagedAt = now;
        this.persist();
    }

    /**
     * Releases the kill switch. Returns false and changes nothing unless the
     * caller passes an explicit confirmation.
     */
    public releaseKillSwitch(release: KillSwitchRelease): boolean {
        if (release?.confirmed !== true) return false;
        if (this._killSwitchEngagedAt === null) return true;
        this._killSwitchEngagedAt = null;
        this.persist();
        return true;
    }

    /**
     * Sets one limit. An empty string or null clears it back to
     * "not configured"; a value that is not a non-negative number is
     * rejected rather than stored, so a typo cannot silently disable a limit.
     */
    public setLimit<K extends keyof RiskLimitInputs>(
        key: K,
        value: RiskLimitInputs[K],
    ): boolean {
        if (key === "maxOpenPositions") {
            const next =
                value === null || value === ""
                    ? null
                    : Math.floor(Number(value));
            if (next !== null && (!Number.isFinite(next) || next < 0)) return false;
            this._limits = { ...this._limits, maxOpenPositions: next };
            this.persist();
            return true;
        }

        const raw = value === null ? null : String(value).trim();
        if (raw !== null && raw !== "") {
            try {
                const d = new Decimal(raw);
                if (!d.isFinite() || d.isNaN() || d.lt(0)) return false;
            } catch {
                return false;
            }
        }
        this._limits = { ...this._limits, [key]: raw === "" ? null : raw };
        this.persist();
        return true;
    }

    /** Clears every limit. Does not touch the kill switch. */
    public resetLimits(): void {
        this._limits = { ...INITIAL_RISK_LIMITS };
        this.persist();
    }

    /**
     * A configured limit as a `Decimal`, or null when it is not configured.
     * Never returns a native number — these are compared against order
     * notionals and losses.
     */
    public limit(key: Exclude<keyof RiskLimitInputs, "maxOpenPositions">): Decimal | null {
        const raw = this._limits[key];
        if (raw === null || raw === undefined || raw === "") return null;
        try {
            const d = new Decimal(raw);
            return d.isFinite() && !d.isNaN() ? d : null;
        } catch {
            return null;
        }
    }

    get maxOpenPositions(): number | null {
        return this._limits.maxOpenPositions ?? null;
    }

    // -- persistence --------------------------------------------------------

    /**
     * Written synchronously on every change. A debounced save would mean a
     * kill switch engaged a moment before a crash or a reload comes back
     * disengaged, which is the one failure this feature cannot have.
     */
    private persist(): void {
        if (!browser) return;
        try {
            const ok = StorageHelper.safeSave(
                CONSTANTS.LOCAL_STORAGE_RISK_KEY,
                JSON.stringify({
                    limits: this._limits,
                    killSwitchEngagedAt: this._killSwitchEngagedAt,
                }),
            );
            this._persistFailed = !ok;
        } catch {
            this._persistFailed = true;
        }
    }

    private load(): void {
        try {
            const stored = localStorage.getItem(CONSTANTS.LOCAL_STORAGE_RISK_KEY);
            if (!stored) return;
            const parsed = RiskStateSchema.safeParse(safeJsonParse(stored));
            if (!parsed.success) return;
            this._limits = { ...INITIAL_RISK_LIMITS, ...parsed.data.limits };
            this._killSwitchEngagedAt = parsed.data.killSwitchEngagedAt;
        } catch {
            // A corrupt blob leaves the defaults in place. Note that this
            // means the kill switch reads as disengaged — the alternative,
            // failing closed on unparseable data, would lock a user out of
            // closing positions with no way back.
        }
    }

    /** Test seam: reloads from storage as a fresh session would. */
    public reloadFromStorage(): void {
        this._limits = { ...INITIAL_RISK_LIMITS };
        this._killSwitchEngagedAt = null;
        this._persistFailed = false;
        if (browser) this.load();
    }
}

export const riskState = new RiskManager();
