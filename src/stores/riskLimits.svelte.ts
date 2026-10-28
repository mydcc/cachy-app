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

import { browser } from "$app/env";
import { Decimal } from "decimal.js";
import { utcDayStart } from "../utils/utcDay";
import { z } from "zod";
import { CONSTANTS } from "../lib/constants";
import { safeJsonParse } from "../utils/safeJson";
import { StorageHelper } from "../utils/storageHelper";
import { uiState } from "./ui.svelte";
import { safeLocalStorage } from "../utils/storageWrapper";

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
 * What the kill switch blocks while engaged — FEAT-0526.
 *
 * Defaults are the pre-existing rule: opens, adds and non-TP/SL modifies are
 * blocked; closes, cancels, close-all and TP/SL adjusts pass. Turning a toggle
 * off narrows the *switch*, never the risk limits: `increasesExposure` keeps
 * classifying adds/modifies for `checkLimits` regardless of this config.
 */
export interface KillSwitchConfig {
    blockAdds: boolean;
    blockNonTpSlModifies: boolean;
    confirmEngage: boolean;
    /** Positive USDT loss; null = auto-engage off. */
    autoEngageDailyLossUsdt: string | null;
}

export const DEFAULT_KILL_SWITCH_CONFIG: KillSwitchConfig = {
    blockAdds: true,
    blockNonTpSlModifies: true,
    confirmEngage: true,
    autoEngageDailyLossUsdt: null,
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

interface ParsedMaxOpenPositions {
    value: number | null;
    isInvalid: boolean;
}

/** Shared by persisted-state loading and user input so both paths agree. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMaxOpenPositions(value: unknown): ParsedMaxOpenPositions {
    if (value === null) return { value: null, isInvalid: false };
    if (typeof value === "string" && value.trim() === "") {
        return { value: null, isInvalid: false };
    }

    let count: number;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!/^\d+$/.test(trimmed)) return { value: null, isInvalid: true };
        count = Number(trimmed); // audit: safe — maxOpenPositions is a position count, not a price, amount, or balance
    } else if (typeof value === "number") {
        count = value;
    } else {
        return { value: null, isInvalid: true };
    }

    if (!Number.isSafeInteger(count) || count < 0) {
        return { value: null, isInvalid: true };
    }
    return { value: count === 0 ? 0 : count, isInvalid: false };
}

/** Preserve an invalid value across JSON storage without degrading it to null. */
function persistableInvalidMaxOpenPositions(value: unknown): unknown {
    if (value === null) return null;
    const serialized = JSON.stringify(value);
    if (serialized !== undefined && serialized !== "null") return value;
    return String(value);
}

/**
 * The auto-engage threshold, kept verbatim when it cannot be interpreted.
 *
 * Reading a corrupt or negative value as "off" would silently disable an
 * opt-in protection and leave nothing to repair — the same failure the
 * max-open-positions field is stored raw for. `killSwitchAutoEngageLimit()`
 * decides whether the text is usable; the raw string stays visible in the
 * field so the trader can fix it.
 */
const killSwitchThreshold = z
    .union([z.string(), z.number()])
    .transform((val) => {
        const text = String(val);
        return text === "" ? null : text;
    })
    .catch(null);

const RiskStateSchema = z.object({
    limits: z
        .object({
            maxPositionSizeUsdt: numericLimit,
            maxPositionSizePercent: numericLimit,
            maxLeverage: numericLimit,
            maxLossPerTradeUsdt: numericLimit,
            maxDailyLossUsdt: numericLimit,
        })
        .partial()
        .catch({}),
    // FEAT-0526: what the switch blocks and whether it arms itself. Absent
    // keys are the defaults, so a blob written before this item still reads
    // as the pre-existing rule (adds and non-TP/SL modifies blocked).
    killSwitch: z
        .object({
            blockAdds: z.boolean().catch(true),
            blockNonTpSlModifies: z.boolean().catch(true),
            confirmEngage: z.boolean().catch(true),
            autoEngageDailyLossUsdt: killSwitchThreshold,
        })
        .partial()
        .catch({}),
    // UTC day start on which auto-engage was suppressed by a manual release.
    // A timestamp, not a boolean: it expires by comparison, never by a timer.
    killSwitchAutoEngageSuppressedFor: z
        .number()
        .int()
        .positive()
        .nullable()
        .catch(null),
    // Epoch ms of the moment the switch was engaged, or null. A timestamp
    // rather than a boolean so the UI can say *when* trading was stopped —
    // a switch someone flipped four days ago reads very differently from one
    // flipped a minute ago.
    killSwitchEngagedAt: z.number().int().positive().nullable().catch(null),
    // Epoch ms of the last successful position-history sync, or null when no
    // sync has ever run. BUG-0499: the daily-loss gate treats a journal that
    // holds synced trades as unmeasurable until a same-day sync proves it
    // caught up — anything the venue closed since is invisible otherwise.
    lastHistorySyncAt: z.number().int().positive().nullable().catch(null),
});

class RiskManager {
    private _limits = $state<RiskLimitInputs>({ ...INITIAL_RISK_LIMITS });
    private _maxOpenPositionsInvalid = $state(false);
    /** Kept verbatim so unrelated setting changes do not erase repairable corruption. */
    private _invalidMaxOpenPositionsRaw: unknown = null;
    private _killSwitchEngagedAt = $state<number | null>(null);
    private _lastHistorySyncAt = $state<number | null>(null);
    private _killSwitchConfig = $state<KillSwitchConfig>({ ...DEFAULT_KILL_SWITCH_CONFIG });
    private _killSwitchAutoEngageSuppressedFor = $state<number | null>(null);
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

    /** FEAT-0526: the effective scope, defaults included. */
    get killSwitchConfig(): Readonly<KillSwitchConfig> {
        return this._killSwitchConfig;
    }

    /** UTC day start on which a manual release suppressed auto-engage. */
    get killSwitchAutoEngageSuppressedFor(): number | null {
        return this._killSwitchAutoEngageSuppressedFor;
    }

    /** Auto-engage threshold in USDT, or null when off/invalid. */
    public killSwitchAutoEngageLimit(): Decimal | null {
        const raw = this._killSwitchConfig.autoEngageDailyLossUsdt;
        if (raw === null || raw === "") return null;
        try {
            const d = new Decimal(raw);
            return d.isFinite() && !d.isNaN() && d.gt(0) ? d : null;
        } catch {
            return null;
        }
    }

    /**
     * True when storage holds a threshold that is not a positive number.
     *
     * `killSwitchAutoEngageLimit()` reads it as "off", which is the safe
     * behaviour but a silent one: the protection the trader opted into is not
     * armed and the field would otherwise look empty. The UI shows the raw
     * text and an inline error instead.
     */
    get hasInvalidAutoEngageThreshold(): boolean {
        const raw = this._killSwitchConfig.autoEngageDailyLossUsdt;
        return raw !== null && raw !== "" && this.killSwitchAutoEngageLimit() === null;
    }

    /**
     * Epoch ms of the last successful position-history sync, or null when no
     * sync has ever run. Class A like everything else here — a timestamp
     * about this device's journal, never transmitted.
     */
    get lastHistorySyncAt(): number | null {
        return this._lastHistorySyncAt;
    }

    /**
     * Records a successful position-history sync. Called by the sync path,
     * never by the UI — the stamp is evidence about the venue, not a setting.
     * Invalid input is ignored rather than stored, so a bad clock cannot
     * silently re-arm the daily-loss gate.
     */
    public recordHistorySync(now = Date.now()): void {
        if (!Number.isFinite(now) || now <= 0) return;
        this._lastHistorySyncAt = Math.floor(now);
        this.persist();
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
    public releaseKillSwitch(release: KillSwitchRelease, now = Date.now()): boolean {
        if (release?.confirmed !== true) return false;
        if (this._killSwitchEngagedAt === null) return true;
        this._killSwitchEngagedAt = null;
        // FEAT-0526: honour the human override for the rest of the UTC day.
        // Without this the next order would re-arm the switch immediately and
        // a deliberate release would last exactly one click.
        this._killSwitchAutoEngageSuppressedFor = utcDayStart(now);
        this.persist();
        return true;
    }

    /**
     * FEAT-0526: one kill-switch option. Booleans toggle scope or the engage
     * confirmation; the threshold accepts the same non-negative numeric text
     * as `setLimit` but must be positive, because a zero threshold would arm
     * the switch on any loss at all. Empty/null turns auto-engage off.
     */
    public setKillSwitchOption(
        key: "blockAdds" | "blockNonTpSlModifies" | "confirmEngage",
        value: boolean,
    ): boolean;
    public setKillSwitchOption(
        key: "autoEngageDailyLossUsdt",
        value: string | number | null,
    ): boolean;
    public setKillSwitchOption(
        key: keyof KillSwitchConfig,
        value: boolean | string | number | null,
    ): boolean {
        if (key === "autoEngageDailyLossUsdt") {
            const raw = value === null ? null : String(value).trim();
            if (raw !== null && raw !== "") {
                try {
                    const d = new Decimal(raw);
                    if (!d.isFinite() || d.isNaN() || d.lte(0)) return false;
                } catch {
                    return false;
                }
            }
            this._killSwitchConfig = {
                ...this._killSwitchConfig,
                autoEngageDailyLossUsdt: raw === "" ? null : raw,
            };
        } else {
            this._killSwitchConfig = {
                ...this._killSwitchConfig,
                [key]: Boolean(value),
            };
        }
        this.persist();
        return true;
    }

    /**
     * Sets one limit. An empty string or null clears it back to
     * "not configured"; a value that is not a non-negative number is
     * rejected rather than stored, so a typo cannot silently disable a limit.
     *
     * BUG-0557: maxOpenPositions is parsed here and nowhere else. A string
     * must be plain digits after trim — "1e3", "+3", "2.5" and "abc" are
     * rejected, because coercing them would store a ceiling the trader never
     * chose. Explicit zero stays storable: it is the documented
     * block-everything limit, distinct from an unconfigured (null) one.
     */
    public setLimit(key: "maxOpenPositions", value: number | string | null): boolean;
    public setLimit<K extends Exclude<keyof RiskLimitInputs, "maxOpenPositions">>(
        key: K,
        value: RiskLimitInputs[K],
    ): boolean;
    public setLimit(
        key: keyof RiskLimitInputs,
        value: number | string | null,
    ): boolean {
        if (key === "maxOpenPositions") {
            const parsed = parseMaxOpenPositions(value);
            if (parsed.isInvalid) return false;
            this._limits = { ...this._limits, maxOpenPositions: parsed.value };
            this._maxOpenPositionsInvalid = false;
            this._invalidMaxOpenPositionsRaw = null;
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

    /** Clears every limit. Does not touch the kill switch or the sync stamp. */
    public resetLimits(): void {
        this._limits = { ...INITIAL_RISK_LIMITS };
        this._maxOpenPositionsInvalid = false;
        this._invalidMaxOpenPositionsRaw = null;
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

    /** Raw editable text for the field, including an unreadable stored value. */
    get maxOpenPositionsInputValue(): string {
        if (this._maxOpenPositionsInvalid) return String(this._invalidMaxOpenPositionsRaw);
        return this._limits.maxOpenPositions === null
            ? ""
            : String(this._limits.maxOpenPositions);
    }

    /** True when storage contains a value that cannot be safely interpreted. */
    get hasInvalidMaxOpenPositions(): boolean {
        return this._maxOpenPositionsInvalid;
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
                    limits: this._maxOpenPositionsInvalid
                        ? {
                            ...this._limits,
                            maxOpenPositions: persistableInvalidMaxOpenPositions(
                                this._invalidMaxOpenPositionsRaw,
                            ),
                        }
                        : this._limits,
                    killSwitchEngagedAt: this._killSwitchEngagedAt,
                    lastHistorySyncAt: this._lastHistorySyncAt,
                    killSwitch: this._killSwitchConfig,
                    killSwitchAutoEngageSuppressedFor:
                        this._killSwitchAutoEngageSuppressedFor,
                }),
                () => uiState.showError("storage.quotaExceeded"),
            );
            this._persistFailed = !ok;
        } catch {
            this._persistFailed = true;
        }
    }

    private load(): void {
        try {
            const stored = safeLocalStorage.getItem(CONSTANTS.LOCAL_STORAGE_RISK_KEY);
            if (!stored) return;
            const raw = safeJsonParse(stored);
            const parsed = RiskStateSchema.safeParse(raw);
            if (!parsed.success) return;

            const rawLimits = isRecord(raw) && isRecord(raw.limits) ? raw.limits : {};
            const hasMaxOpenPositions = Object.hasOwn(rawLimits, "maxOpenPositions");
            const maxOpenPositions = hasMaxOpenPositions
                ? parseMaxOpenPositions(rawLimits.maxOpenPositions)
                : { value: null, isInvalid: false };
            this._limits = {
                ...INITIAL_RISK_LIMITS,
                ...parsed.data.limits,
                maxOpenPositions: maxOpenPositions.value,
            };
            this._maxOpenPositionsInvalid = maxOpenPositions.isInvalid;
            this._invalidMaxOpenPositionsRaw = hasMaxOpenPositions
                ? rawLimits.maxOpenPositions
                : null;
            this._killSwitchEngagedAt = parsed.data.killSwitchEngagedAt;
            this._lastHistorySyncAt = parsed.data.lastHistorySyncAt ?? null;
            this._killSwitchConfig = {
                ...DEFAULT_KILL_SWITCH_CONFIG,
                ...parsed.data.killSwitch,
            };
            this._killSwitchAutoEngageSuppressedFor =
                parsed.data.killSwitchAutoEngageSuppressedFor ?? null;
        } catch {
            // A wholly corrupt blob leaves the defaults in place. A corrupt
            // maxOpenPositions value is handled above: new positions fail
            // closed, while closes and cancels stay available and a valid
            // setting edit repairs the state.
        }
    }

    /** Test seam: reloads from storage as a fresh session would. */
    public reloadFromStorage(): void {
        this._limits = { ...INITIAL_RISK_LIMITS };
        this._maxOpenPositionsInvalid = false;
        this._invalidMaxOpenPositionsRaw = null;
        this._killSwitchEngagedAt = null;
        this._lastHistorySyncAt = null;
        this._killSwitchConfig = { ...DEFAULT_KILL_SWITCH_CONFIG };
        this._killSwitchAutoEngageSuppressedFor = null;
        this._persistFailed = false;
        if (browser) this.load();
    }
}

export const riskState = new RiskManager();
