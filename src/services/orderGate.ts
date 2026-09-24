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
 * Order Gate — FEAT-0011.
 *
 * The single mandatory checkpoint between order construction and transport.
 *
 * Three properties make this worth having, and all three are load-bearing:
 *
 * 1. It RECOMPUTES rather than inspects. A check that reads the same
 *    variable the payload was built from proves nothing — the value has to
 *    be derived a second way. Size is re-derived from account size, risk and
 *    stop distance; prices are compared against a snapshot the UI captured
 *    separately from the payload.
 * 2. It REFUSES and names the field. It never repairs a payload and proceeds
 *    — a gate that fixes its input is a second source of orders.
 * 3. It is STRUCTURALLY UNAVOIDABLE. The transport refuses to run without a
 *    pass, and passes can only be minted here. See `assertGatePass`.
 *
 * It is local: no network, no server, works offline (ADR-0004 §3). `verify`
 * is pure — same intent in, same verdict out, no I/O and no store reads.
 *
 * Where "displayed state" comes from
 * ----------------------------------
 * The gate never reads a store. Call sites pass a `DisplayedState` snapshot
 * captured at the moment the user confirmed, and the payload separately. A
 * store that is corrupt in one place therefore has to be corrupt in the same
 * way in both, at the same instant, to get through — which is the practical
 * ceiling short of scraping the rendered DOM. See the FEAT-0011 backlog item
 * for why the DOM variant was rejected.
 */

import { Decimal } from "decimal.js";
import {
    normalizePositionSide,
    validateTpSlPrice,
    type TpSlPriceKind,
} from "../lib/calculators/tpsl";
/*
 * FEAT-0017. Safe to import here despite this module's no-dependencies rule:
 * `exchangeCapabilities` gathers per-venue declarations that are frozen data
 * with no runtime imports of their own, so nothing of the transport graph —
 * `apiService`, the WebSocket services, `tradeService`, `settingsState` —
 * enters. Reading capabilities through the adapter registry instead would
 * have pulled in all four.
 */
import { capabilitiesOf, isKnownExchange } from "./exchangeCapabilities";
import type { OrderEntryType, TimeInForce } from "./exchangeCapabilities";
import { cachyAction } from "../utils/exchange/restSigningPlan";

// ---------------------------------------------------------------------------
// Gate pass
// ---------------------------------------------------------------------------

// `passBrand` is declared but never exported, so no code outside this module
// can produce a value assignable to `GatePass`. `issuedPasses` closes the
// runtime hole: a hand-rolled `{} as GatePass` is not in the set and the
// transport rejects it.
declare const passBrand: unique symbol;

export interface GatePass {
    readonly [passBrand]: true;
}

/** What the gate approved, re-checked by the transport at transmit time. */
interface PassRecord {
    provider: string;
    accountFingerprint: string;
    accountId?: string;
    endpoint: string;
    action: string;
    symbol?: string;
    /** Paper or live, as it stood when the gate approved (FEAT-0012). */
    paperMode: boolean;
}

const issuedPasses = new WeakMap<object, PassRecord>();

/**
 * Order actions that mutate exchange state. Anything on this list reaches
 * the network only with a pass; everything else (history, pending,
 * order-detail, TP/SL listing) is read-only and ungated.
 */
export const MUTATING_ORDER_ACTIONS = new Set([
    "place-order",
    "close-position",
    "close-all-positions",
    "flash-close-position",
    "cancel-order",
    "cancel-all",
    "modify-order",
    // /api/tpsl actions
    "cancel",
    "modify",
    "place",
    "place-position",
]);

/**
 * Reads the mutating action out of a transport payload, or null when the
 * payload is read-only. `/api/orders` carries it as `type`; `/api/tpsl`
 * carries it as `action`.
 */
export function mutatingActionOf(
    payload: Record<string, unknown>,
    endpoint?: string,
): string | null {
    const candidates = [
        endpoint ? cachyAction(endpoint) : undefined,
        payload.action,
        payload.type,
    ];
    for (const candidate of candidates) {
        if (typeof candidate !== "string") continue;
        if (MUTATING_ORDER_ACTIONS.has(candidate)) return candidate;
    }
    return null;
}

/**
 * Deterministic serialization for intent fingerprinting (BUG-0507). Key
 * order is normalized so two identically built payloads fingerprint alike
 * regardless of insertion order; `Decimal` serializes through its `toJSON`,
 * so "100.10" and 100.1 still differ here — the gate's `decimalsAgree`
 * handles numeric equivalence during verification, while the fingerprint
 * only ever compares payloads built by the same code path.
 */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "";
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
        .join(",")}}`;
}

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

export type RefusalReason =
    | "mismatch"
    | "missing"
    | "stale"
    | "killSwitch"
    | "riskLimit"
    | "sizeMismatch"
    | "unsupported"
    | "duplicate"
    | "unconfirmed";

export interface OrderRefusal {
    /** The field that disagreed — always named, never a bare "invalid order". */
    field: string;
    reason: RefusalReason;
    /** i18n key, present in both de and en (see locales/*.json → orderGate). */
    messageKey: string;
    /** Interpolation values for `messageKey`. Already stringified. */
    values: Record<string, string>;
}

/**
 * Where an order came from. BUG-0494 — a bot's order carries its provenance
 * so "paper only" is a property of the order rather than a precondition read
 * twice from mutable global state. The transport could not honour "this one
 * is paper only" before because nothing on the order said so.
 */
export type OrderOrigin = "manual" | "bot";

/**
 * Refusal key for a bot order that reached approval or transmission while
 * paper trading is off. Shared with the transport (`signedRequest`) and the
 * bot submission path (`submitBotOrder` maps it back to the trader-facing
 * `paper-trading-off` toast), so all three name the same cause.
 */
export const BOT_PAPER_ONLY_MESSAGE_KEY = "orderGate.botPaperOnly";

export class OrderRefusedError extends Error {
    public readonly refusal: OrderRefusal;
    constructor(refusal: OrderRefusal) {
        super(`Order refused: ${refusal.field} (${refusal.reason})`);
        this.name = "OrderRefusedError";
        this.refusal = refusal;
    }
}

export interface OrderGateVerdict {
    approved: boolean;
    /** Populated iff `approved` is false. */
    refusal: OrderRefusal | null;
    /** Every field the gate actually compared, for the audit trail (FEAT-0015). */
    checked: string[];
}

// ---------------------------------------------------------------------------
// Intent
// ---------------------------------------------------------------------------

/**
 * What a submission is trying to do, which decides how its size is verified.
 *
 * `open` and `add` both increase exposure, but they are verified differently
 * and that is the whole reason `add` exists as its own kind (FEAT-0334):
 *
 * - An **open** is risk-sized. The gate re-derives its quantity from account
 *   size, risk percentage and stop distance, and refuses a payload that
 *   disagrees.
 * - An **add** is trader-sized. It scales into a position that already has an
 *   entry and a stop; there is no new stop distance to divide by, so there is
 *   no risk formula to re-derive it from. Routing it through `open` would mean
 *   inventing an `accountSize`/`riskPercentage`/`stopLossPrice` triple that
 *   reproduces the wanted quantity — the gate would then verify a fiction,
 *   which is the exact failure it exists to prevent.
 *
 * So `add` is verified the way `reduce` is: against the quantity the UI
 * displayed, against the instrument's step, and — uniquely — against available
 * margin, which is the only real ceiling an add has.
 */
export type OrderIntentKind = "open" | "add" | "reduce" | "cancel" | "modify" | "bulk";

/**
 * The state the UI displayed at the moment of confirmation, captured
 * independently of the payload. Fields are optional because the gate checks
 * what it is given: an absent field is simply not compared, a present field
 * that disagrees is always a refusal.
 */
export interface DisplayedState {
    /** Exchange the UI showed as active. */
    provider: string;
    /** Non-secret identifier of the active API key (never the key itself). */
    accountFingerprint: string;
    /**
     * The account the surface believed was active — FEAT-0026.
     *
     * Distinct from `accountFingerprint`, which is derived from the key and
     * therefore says nothing when two accounts share one. Optional, per this
     * interface's contract: an absent id is not compared, so every caller
     * that predates FEAT-0026 keeps working unchanged.
     */
    accountId?: string;
    /**
     * Whether the UI showed paper mode as active (FEAT-0012). The dangerous
     * direction is believing you are simulating while live, so the transport
     * re-reads the real mode and compares it against this.
     */
    paperMode?: boolean;
    symbol?: string;
    side?: string;
    /**
     * Direction of the exposure a TP/SL level relates to (BUG-0550). Read by
     * the direction check instead of `side`, because `/api/tpsl` and
     * `modify-order` payloads carry no `side` field — setting `side` on them
     * would trip the payload-side parity check above.
     */
    positionSide?: string;
    entryPrice?: Decimal;
    stopLossPrice?: Decimal;
    takeProfits?: Decimal[];
    accountSize?: Decimal;
    riskPercentage?: Decimal;
    leverage?: Decimal;
    marginMode?: string;
    /**
     * For reduce intents: the size the position actually has, read back
     * fresh rather than taken from whatever the payload was built from.
     */
    positionAmount?: Decimal;
    /**
     * For `add` intents: the venue-reported average entry before the add.
     * Together with `positionAmount`, the fill estimate in `entryPrice` and
     * the add quantity, the gate re-derives the resulting average entry and
     * measures the loss-per-trade limit against the resulting position
     * (BUG-0510) — recomputed from displayed inputs, never trusted from
     * the constructor.
     */
    positionEntryPrice?: Decimal;
    /**
     * For `add` intents: the position's resting stop, when one is safely
     * attributable (BUG-0510).
     *
     * Deliberately NOT `stopLossPrice`: that field means "the stop this
     * request carries" and drives the price comparison, the entry-protection
     * rules and the unplaceable-stop refusal — an add carries no new stop,
     * so stating the resting one there would refuse the add for not
     * carrying a level it never promised. The loss-per-trade limit is the
     * only reader of this field.
     */
    restingStopPrice?: Decimal;
    /** True when the caller declares this closes the position entirely. */
    fullClose?: boolean;
    /**
     * For `add` intents: the quantity the UI previewed and the trader agreed
     * to — FEAT-0334.
     *
     * The counterpart of `positionAmount` on the reduce side. An add has no
     * risk formula to be re-derived from (see `OrderIntentKind`), so the only
     * honest verification is that the payload carries the same quantity the
     * screen showed. Absent on an `add` is disqualifying: an unverifiable size
     * is not a verified size.
     */
    addQuantity?: Decimal;
    /**
     * For `modify` intents: the flat order quantity the caller asked to set
     * (`modifyOrder`), never re-derived, only compared — BUG-0505.
     *
     * The counterpart of `addQuantity`: a modify's quantity is not described
     * by any risk formula, so the only honest verification is that the
     * payload carries the same quantity the caller supplied (or the live
     * order read the constructor merged in).
     */
    modifyQuantity?: Decimal;
    /**
     * For `modify` intents: the per-leg take-profit quantity, read off the
     * nested TP/SL payload shape via `qtyFields` — BUG-0505.
     */
    takeProfitQty?: Decimal;
    /**
     * For `modify` intents: the per-leg stop-loss quantity — the number that
     * decides how much of a position is actually protected.
     */
    stopLossQty?: Decimal;
    /**
     * Free margin the account had when the add was previewed — FEAT-0334.
     *
     * Compared against `addQuantity × price / leverage`. Absent on an `open`
     * means the check is skipped rather than guessed: the open keeps its
     * risk-derived size check. Absent on an `add` refuses (BUG-0511): margin
     * is the only ceiling an add has, so skipping leaves the order with no
     * ceiling at all. Paper accounts hydrate the same channel from the
     * simulated balance, so no paper exemption is needed.
     */
    availableMargin?: Decimal;
    positionId?: string;
    orderId?: string;
    /**
     * Instrument step size, used to derive the size tolerance. Absent means
     * "no rounding allowed" — the recomputed size must match exactly.
     */
    stepSize?: Decimal;
    tickSize?: Decimal;
    /**
     * `Date.now()` of the last exchange-confirmed leverage/margin-mode read.
     * Undefined or older than MAX_ACCOUNT_STATE_AGE_MS refuses an `open`.
     */
    accountStateAt?: number;
    /** Minimum opening amount (Base currency). */
    minTradeVolume?: Decimal;
    /** Maximum limit order volume (Base currency). */
    maxLimitOrderVolume?: Decimal;
    /** Maximum market order volume (Base currency). */
    maxMarketOrderVolume?: Decimal;
    /** Trading pair status ('OPEN' | 'CANCEL_ONLY' | 'STOP'). */
    symbolStatus?: string;
    /** Whether API trading is supported for the trading pair. */
    isApiSupported?: boolean;
}

/**
 * Which payload keys hold which price. Values are dotted paths into the
 * payload (`"params.triggerPrice"`), because endpoints do not agree on a
 * shape — `/api/tpsl` nests its fields under `params` and calls the level a
 * `triggerPrice` regardless of whether it is a stop or a target.
 *
 * This names a location, never a value: what gets compared is still read out
 * of the payload that will be transmitted.
 */
export interface PriceFieldMap {
    price?: string;
    stopLoss?: string;
    takeProfit?: string;
}

const DEFAULT_PRICE_FIELDS: Required<PriceFieldMap> = {
    price: "price",
    stopLoss: "slPrice",
    takeProfit: "tpPrice",
};

/**
 * Which payload keys hold which quantity. Values are dotted paths into the
 * payload, mirroring `PriceFieldMap` — `/api/tpsl` nests its quantities
 * under `params` as `tpQty`/`slQty`, while `modify-order` carries a flat
 * `qty`.
 *
 * The `*OrderType` paths resolve the leg's own order type for the
 * min/max-volume selection. Absent, the payload's top-level `orderType`
 * decides, exactly as `checkVolumeLimits` has always read it.
 *
 * This names a location, never a value: what gets compared is still read out
 * of the payload that will be transmitted.
 */
export interface QtyFieldMap {
    quantity?: string;
    quantityOrderType?: string;
    takeProfit?: string;
    takeProfitOrderType?: string;
    stopLoss?: string;
    stopLossOrderType?: string;
}

const DEFAULT_QTY_FIELDS: Required<QtyFieldMap> = {
    quantity: "qty",
    quantityOrderType: "orderType",
    takeProfit: "tpQty",
    takeProfitOrderType: "tpOrderType",
    stopLoss: "slQty",
    stopLossOrderType: "slOrderType",
};

export interface OrderIntent {
    kind: OrderIntentKind;
    /** The endpoint the payload is bound for. */
    endpoint: string;
    /** The exact payload that will be transmitted. */
    payload: Record<string, unknown>;
    displayed: DisplayedState;
    /**
     * Where the order came from. Absent means "not a bot order" — every
     * pre-provenance call site (closes, cancels, modifies) keeps its exact
     * behaviour, and only the entry path stamps it. The gate refuses a
     * bot-stamped intent approved while paper trading is off (BUG-0494).
     */
    origin?: OrderOrigin;
    /** Overrides for endpoints whose payload shape deviates from the default. */
    priceFields?: PriceFieldMap;
    /** Quantity-path overrides for endpoints that nest their quantities. */
    qtyFields?: QtyFieldMap;
    /**
     * When a human confirmed this action, as `Date.now()` — FEAT-0024.
     *
     * Absent means "not confirmed", which is why the field is optional but its
     * absence is never benign: for an action the policy requires a
     * confirmation for, the gate refuses. Every existing call site therefore
     * keeps compiling and starts failing closed, which is the intended
     * migration — a call site that has not been taught to confirm should stop,
     * not proceed silently.
     */
    confirmedAt?: number;
    /**
     * The policy action to ask about, when it differs from the wire action —
     * FEAT-0024.
     *
     * One user intent can travel as different payloads. A flash close reaches
     * Bitunix as `flash-close-position` but every other venue as an ordinary
     * reduce-only `place-order`, and reading the policy off the wire would
     * then ask the `place-order` question — which defaults to off — about the
     * button the user pressed expecting a flash-close prompt. The same policy
     * would apply or not depending on the venue, which is not a distinction
     * any user made.
     *
     * The gate does not interpret this; it hands the string to the registered
     * check, which owns the catalogue. Absent, the wire action is used.
     */
    confirmAs?: string;
}

// ---------------------------------------------------------------------------
// FEAT-0013 seam
// ---------------------------------------------------------------------------

/**
 * One submission attempt, as it happened — the payload, the verdict, the
 * outcome. FEAT-0015 records these; the gate does not care what happens to
 * them, and passes the payload through unredacted because redaction is the
 * recorder's job and doing it here would mean the gate handed the transport
 * a payload it had modified.
 */
export interface OrderAttempt {
    at: number;
    completedAt: number;
    outcome: "sent" | "refused" | "failed";
    endpoint: string;
    action: string;
    kind: OrderIntentKind;
    provider: string;
    accountFingerprint: string;
    paperMode: boolean;
    payload: Record<string, unknown>;
    checked: string[];
    refusal?: OrderRefusal;
    response?: unknown;
    error?: { name: string; message: string };
}

export type AuditRecorder = (attempt: OrderAttempt) => void;

let auditRecorder: AuditRecorder | null = null;

/**
 * FEAT-0015 attaches here. Every attempt that reaches `submit` is reported,
 * refusals included — those are precisely the ones no console would have
 * shown, because nothing was sent.
 */
export function registerAuditRecorder(fn: AuditRecorder | null): void {
    auditRecorder = fn;
}

export type RiskLimitCheck = (intent: OrderIntent) => OrderRefusal | null;

/**
 * Receives the intent, because "stop all trading" is not the same as "stop
 * all traffic": FEAT-0013's switch blocks orders that create or increase
 * exposure and lets closes and cancels through. A switch that also blocked
 * closing would turn a scare into a loss.
 */
export type KillSwitchCheck = (intent: OrderIntent) => boolean;

let riskLimitCheck: RiskLimitCheck | null = null;
let killSwitchCheck: KillSwitchCheck | null = null;

/**
 * FEAT-0013 registers the limits here. The gate calls them; it does not
 * define them. Unregistered means "no limits configured", not "limits pass".
 */
export function registerRiskLimitCheck(fn: RiskLimitCheck | null): void {
    riskLimitCheck = fn;
}

/** FEAT-0013 registers the kill switch here. Returns true when engaged. */
export function registerKillSwitch(fn: KillSwitchCheck | null): void {
    killSwitchCheck = fn;
}

/**
 * Answers whether this action needs a human's confirmation — FEAT-0024.
 *
 * Takes the resolved action name — `confirmAs` where the caller set one, the
 * wire action otherwise — rather than the whole intent. A call site that needs
 * to know the verdict before acting runs `verify` early instead (see
 * `flashClosePosition`, BUG-0331): that answers for every refusal, not just
 * this one, and keeps a single way of asking.
 *
 * Returning `true` means "ask first". The gate then refuses unless
 * `intent.confirmedAt` is set, which is what makes the policy structural
 * rather than advisory: a call site that forgets to confirm gets a refusal it
 * cannot miss, instead of quietly skipping the prompt.
 */
export type ConfirmationCheck = (action: string) => boolean;

let confirmationCheck: ConfirmationCheck | null = null;

/**
 * FEAT-0024 registers the policy here. Unregistered means "no policy
 * configured" and nothing is required — matching `registerRiskLimitCheck`'s
 * convention, and safe because an unconfigured policy cannot have opinions
 * the user has not expressed. The defaults live in
 * `lib/confirmationPolicy.ts`, not here; the gate enforces a decision, it does
 * not make one.
 */
export function registerConfirmationCheck(fn: ConfirmationCheck | null): void {
    confirmationCheck = fn;
}


// ---------------------------------------------------------------------------
// Comparison helpers
// ---------------------------------------------------------------------------

/**
 * Leverage and margin mode have to be checked against the exchange's truth,
 * and that truth can be stale. The gate is local by construction (it must
 * work offline), so it cannot refresh — it fails closed instead and names
 * the staleness, leaving the refresh to the caller.
 */
export const MAX_ACCOUNT_STATE_AGE_MS = 60_000;

/**
 * Relative component of the size window: the floor under the downward
 * tolerance when the step is finer than 0.1 % of the position, and the
 * entire upward allowance (BUG-0506). Tight enough that no sizing error of a
 * meaningful magnitude — let alone 10x — can pass.
 */
const SIZE_TOLERANCE_RELATIVE = new Decimal("0.001"); // 0.1 %

function toDecimal(value: unknown): Decimal | null {
    if (value === null || value === undefined || value === "") return null;
    if (value instanceof Decimal || Decimal.isDecimal(value)) return value as Decimal;
    if (typeof value !== "string" && typeof value !== "number") return null;
    try {
        const d = new Decimal(value);
        return d.isFinite() ? d : null;
    } catch {
        return null;
    }
}

/**
 * Reads a dotted path out of the payload. Own properties only — a value
 * inherited from a prototype is not something the payload actually carries,
 * and resolving one would let a polluted prototype answer for a field the
 * order never set.
 */
function resolvePath(payload: Record<string, unknown>, path: string): unknown {
    let current: unknown = payload;
    for (const segment of path.split(".")) {
        if (typeof current !== "object" || current === null) return undefined;
        if (!Object.prototype.hasOwnProperty.call(current, segment)) return undefined;
        current = (current as Record<string, unknown>)[segment];
    }
    return current;
}

/**
 * Normalises an identifier for comparison. IDs reach the payload as strings
 * most of the time, but not always — an ID that arrives as a `Decimal` is
 * the exact shape of the bug that corrupted order IDs through
 * `response.json()`, and the gate has to be able to see it rather than
 * refuse it as "missing".
 */
function asId(value: unknown): string | undefined {
    if (typeof value === "string") return value === "" ? undefined : value;
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : undefined;
    if (value instanceof Decimal || Decimal.isDecimal(value)) return (value as Decimal).toString();
    return undefined;
}

/**
 * Exported for `tradeService.completeIntent`, which refuses a supplied
 * account id that disagrees with the store before the intent ever reaches
 * the gate. Same refusal shape as every gate-side mismatch, so the trader
 * sees one vocabulary; carries no credential material — `redact.ts`
 * whitelists the `account` field precisely because an id and a key prefix
 * are not secrets.
 */
export function mismatch(
    field: string,
    expected: unknown,
    actual: unknown,
    messageKey = "orderGate.mismatch",
): OrderRefusal {
    return {
        field,
        reason: "mismatch",
        messageKey,
        values: {
            field,
            expected: expected === undefined || expected === null ? "—" : String(expected),
            actual: actual === undefined || actual === null ? "—" : String(actual),
        },
    };
}

/**
 * How the payload's order type reads against the capability vocabulary.
 *
 * Three outcomes, not two, because "no order type" and "an order type I cannot
 * read" call for opposite treatment: the first is another rule's business, the
 * second is a refusal. Collapsing them into `null` let any spelling outside
 * MARKET/LIMIT skip the capability check entirely — a hole under exactly the
 * verb no venue declares.
 */
type EntryTypeReading =
    | { kind: "known"; type: OrderEntryType }
    | { kind: "unreadable"; raw: string }
    | { kind: "absent" };

/**
 * Reads the payload's wire spelling of an order type.
 *
 * Trigger spellings are mapped rather than rejected outright, so the answer
 * stays a *capability* question: no venue declares `trigger` today and the
 * check refuses it, but a venue that later declares one is allowed without
 * touching this function.
 *
 * Anything else present is `unreadable`, and the caller refuses it. An order
 * type the gate cannot verify is not a verified order type — the same rule the
 * symbol check applies a few lines up.
 */
function entryTypeOf(value: unknown): EntryTypeReading {
    if (value === undefined || value === null) return { kind: "absent" };
    if (typeof value !== "string") return { kind: "unreadable", raw: String(value) };
    switch (value.toUpperCase()) {
        case "MARKET":
            return { kind: "known", type: "market" };
        case "LIMIT":
            return { kind: "known", type: "limit" };
        case "STOP":
        case "STOP_MARKET":
        case "STOP_LIMIT":
        case "TRIGGER":
        case "TAKE_PROFIT":
        case "TAKE_PROFIT_MARKET":
            return { kind: "known", type: "trigger" };
        default:
            return { kind: "unreadable", raw: value };
    }
}

function missing(field: string): OrderRefusal {
    return { field, reason: "missing", messageKey: "orderGate.missing", values: { field } };
}

/**
 * Exact `Decimal` comparison. "100.10" and 100.1, "1e-7" and "0.0000001"
 * are the same number written differently and must not be refused — which is
 * exactly why this cannot be a string compare.
 */
function decimalsAgree(a: Decimal, b: Decimal): boolean {
    return a.eq(b);
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

class OrderGate {
    /**
     * Fingerprints of intents with a transport call currently in flight
     * (BUG-0507). `verify` is pure and safe to call twice, but `submit`
     * sends — a second identical intent while the first is still travelling
     * is a duplicate order, not a retry.
     */
    private inFlight = new Set<string>();

    /**
     * Identity of an intent for the in-flight guard: account, endpoint,
     * action, symbol and the full payload. The payload carries the quantity,
     * so two different sizes never collide — while two presses of the same
     * button build byte-identical payloads and do.
     */
    private fingerprintOf(intent: OrderIntent): string {
        const action = mutatingActionOf(intent.payload, intent.endpoint) ?? "";
        const symbol = typeof intent.payload.symbol === "string" ? intent.payload.symbol : "";
        return [
            intent.kind,
            intent.endpoint,
            action,
            symbol,
            intent.displayed.provider,
            intent.displayed.accountId ?? intent.displayed.accountFingerprint,
            intent.displayed.paperMode === true ? "paper" : "live",
            stableStringify(intent.payload),
        ].join("|");
    }

    /**
     * Pure verification. No network, no store reads, no side effects — safe
     * to call with the network down, and safe to call twice.
     */
    public verify(intent: OrderIntent): OrderGateVerdict {
        const checked: string[] = [];
        const refuse = (r: OrderRefusal): OrderGateVerdict => ({
            approved: false,
            refusal: r,
            checked,
        });

        const { payload, displayed, kind } = intent;

        // --- kill switch (FEAT-0013) ---------------------------------------
        checked.push("killSwitch");
        if (killSwitchCheck?.(intent) === true) {
            return refuse({
                field: "killSwitch",
                reason: "killSwitch",
                messageKey: "orderGate.killSwitch",
                values: {},
            });
        }

        // --- provenance (BUG-0494) ---------------------------------------
        // A bot proposes an order into paper; live sending is FEAT-0035.
        // The bot's own `paperEnabled()` pre-check and the transport's paper
        // seam each re-read mutable global state with an `await` and a module
        // fetch between them, so a switch flipped in between used to send a
        // never-clicked order to the real venue. The order now carries its
        // provenance, and the gate — which reads the mode fresh at approval
        // time — refuses a bot-stamped intent that is not paper. The
        // approval-to-transmission flip stays covered by the pass's paperMode
        // comparison in `assertGatePass`; the transport repeats this refusal
        // as defence in depth. Pure: both inputs ride the intent already.
        checked.push("provenance");
        if (intent.origin === "bot" && displayed.paperMode !== true) {
            return refuse({
                field: "mode",
                reason: "unsupported",
                messageKey: BOT_PAPER_ONLY_MESSAGE_KEY,
                values: {},
            });
        }

        // --- account -------------------------------------------------------
        checked.push("account");
        // `NO_CREDENTIALS` is deliberately NOT refused here, though it is
        // truthy and so slips through this test.
        //
        // Refusing it looks like an improvement and is not. `verify` runs
        // identically in paper mode — the live/paper seam is further down, in
        // `signedRequest` (FEAT-0012) — and a simulated order needs no
        // credentials at all, so refusing here would break paper trading for
        // every profile that has not entered keys. The transport already
        // refuses a *live* order with no key, on the correct side of that
        // seam.
        //
        // The hazard this would have addressed — two credential-free accounts
        // being indistinguishable, since both fingerprint to the same string
        // — is answered by `accountId` above instead, which distinguishes
        // them whether or not either holds a key.
        if (!displayed.provider || !displayed.accountFingerprint) {
            return refuse(missing("account"));
        }

        // --- symbol --------------------------------------------------------
        // Anything that moves a position has to name one. `cancel-all` and
        // `close-all-positions` are account-wide, and a modify identified by
        // order ID needs no symbol either — for those, a symbol absent from
        // both sides is simply nothing to compare. A symbol present on one
        // side and not the other is not: an unverifiable symbol is not a
        // verified symbol.
        const payloadSymbol = typeof payload.symbol === "string" ? payload.symbol : undefined;
        if (kind === "open" || kind === "reduce" || payloadSymbol !== undefined || displayed.symbol !== undefined) {
            checked.push("symbol");
            if (payloadSymbol === undefined) return refuse(missing("symbol"));
            if (displayed.symbol === undefined) return refuse(missing("symbol"));
            if (payloadSymbol !== displayed.symbol) {
                return refuse(mismatch("symbol", displayed.symbol, payloadSymbol));
            }
        }

        // --- symbol status / api support (FEAT-0067) -----------------------
        if (displayed.symbolStatus !== undefined) {
            checked.push("symbolStatus");
            if (displayed.symbolStatus !== "OPEN") {
                return refuse({
                    field: "symbolStatus",
                    reason: "unsupported",
                    messageKey: "orderGate.symbolStatus",
                    values: { field: "symbolStatus", status: displayed.symbolStatus },
                });
            }
        }

        if (displayed.isApiSupported !== undefined) {
            checked.push("isApiSupported");
            if (displayed.isApiSupported === false) {
                return refuse({
                    field: "isApiSupported",
                    reason: "unsupported",
                    messageKey: "orderGate.apiUnsupported",
                    values: { field: "isApiSupported" },
                });
            }
        }

        // --- exchange capabilities (FEAT-0017) -----------------------------
        // The venue's own declaration, looked up here rather than accepted
        // from `displayed`. A UI offering a control the venue cannot honour
        // is precisely what this refuses, so taking the capability list from
        // that same UI would make the check agree with the bug.
        //
        // Scoped to `place-order`: the standalone TP/SL endpoints carry their
        // levels under `params.` and are governed by `TradingSupport`, not by
        // whether protection may ride along with an *entry*.
        if (payload.type === "place-order") {
            const caps = capabilitiesOf(displayed.provider);

            // `checked` is the audit trail, so it records only comparisons
            // that happened. An absent order type is the missing-field rule's
            // business, not this one's.
            const reading = entryTypeOf(payload.orderType);
            if (reading.kind !== "absent") {
                checked.push("orderTypeSupported");
                if (reading.kind === "unreadable") {
                    return refuse({
                        field: "orderType",
                        reason: "unsupported",
                        messageKey: "orderGate.unsupportedOrderType",
                        values: {
                            field: "orderType",
                            orderType: reading.raw,
                            exchange: displayed.provider,
                        },
                    });
                }
                if (!caps.orderTypes.includes(reading.type)) {
                    return refuse({
                        field: "orderType",
                        reason: "unsupported",
                        messageKey: "orderGate.unsupportedOrderType",
                        values: {
                            field: "orderType",
                            orderType: reading.type,
                            exchange: displayed.provider,
                        },
                    });
                }
            }

            // Only when one is actually sent. A market order carries no
            // `effect`, and a venue that accepts none must still take market
            // orders — refusing on absence would close the venue entirely.
            const effect = typeof payload.effect === "string" ? payload.effect : undefined;
            if (effect !== undefined) {
                checked.push("timeInForceSupported");
                if (!caps.timeInForce.includes(effect as TimeInForce)) {
                    return refuse({
                        field: "effect",
                        reason: "unsupported",
                        messageKey: "orderGate.unsupportedTimeInForce",
                        values: { field: "effect", timeInForce: effect, exchange: displayed.provider },
                    });
                }
            }

            // Attaching protection to an entry the venue will not carry it on
            // means the stop is silently dropped and the position opens
            // naked. `orderPlacementService` reads the same flag and places
            // protection separately; this refuses the case where something
            // attached it anyway.
            const attachesProtection = payload.tpPrice !== undefined || payload.slPrice !== undefined;
            if (attachesProtection) {
                checked.push("tpSlAtEntrySupported");
                if (!caps.tpSlAtEntry) {
                    return refuse({
                        field: "tpSlAtEntry",
                        reason: "unsupported",
                        messageKey: "orderGate.unsupportedTpSlAtEntry",
                        values: { field: "tpSlAtEntry", exchange: displayed.provider },
                    });
                }
            }

            /*
             * BUG-0503 — a displayed stop the venue can neither attach to the
             * entry (`tpSlAtEntry`) nor take as a standalone request
             * (`tpSlStandalone`) is unfulfillable as specified: sending the
             * entry anyway opens a position that can never be protected, and
             * no later request can repair it. Refused here, before anything
             * leaves, naming the venue and the missing capability.
             *
             * Only a real stop counts: a non-positive level means "no stop
             * requested" (the same reading `orderPlacementService` uses for
             * `wantsStop`), so a deliberately stopless entry still passes.
             * Scoped to `place-order` like the block above — standalone TP/SL
             * payloads are governed by `TradingSupport`, not by this.
             */
            const stopRequested =
                displayed.stopLossPrice !== undefined && displayed.stopLossPrice.gt(0);
            if (stopRequested && !caps.tpSlAtEntry && !caps.tpSlStandalone) {
                checked.push("unplaceableStop");
                return refuse({
                    field: "stopLoss",
                    reason: "unsupported",
                    messageKey: "orderGate.unplaceableStop",
                    values: { field: "stopLoss", exchange: displayed.provider },
                });
            }

            /*
             * A venue carrying one target at entry cannot carry a ladder:
             * the extras are dropped without an error, so the trader believes
             * in targets that do not exist.
             *
             * Keyed on the payload actually carrying a target, not on
             * protection generally. An entry that attaches only a stop while
             * its targets are placed as separate requests is a ladder the
             * entry never claimed to hold, and refusing it would refuse the
             * normal shape on every no-attach venue.
             */
            if (payload.tpPrice !== undefined && !caps.multipleTakeProfits) {
                checked.push("multipleTakeProfits");
                const targetCount = displayed.takeProfits?.length ?? 0;
                if (targetCount > 1) {
                    return refuse({
                        field: "takeProfits",
                        reason: "unsupported",
                        messageKey: "orderGate.unsupportedMultipleTakeProfits",
                        values: {
                            field: "takeProfits",
                            count: String(targetCount),
                            exchange: displayed.provider,
                        },
                    });
                }
            }
        }

        // --- side ----------------------------------------------------------
        if (displayed.side !== undefined) {
            checked.push("side");
            const payloadSide = typeof payload.side === "string" ? payload.side.toUpperCase() : undefined;
            const displayedSide = displayed.side.toUpperCase();
            if (payloadSide === undefined) return refuse(missing("side"));
            if (payloadSide !== displayedSide) {
                return refuse(mismatch("side", displayedSide, payloadSide));
            }
        }

        // --- reduce-only ---------------------------------------------------
        // A close that forgets `reduceOnly` can open a position in the
        // opposite direction. Bitunix's own close endpoints
        // (flash-close-position, close-all-positions) carry no such field —
        // they are close-only by construction, and `tradeSide: "CLOSE"`
        // covers the place-order shape.
        if (kind === "reduce" && payload.type === "place-order") {
            checked.push("reduceOnly");
            const isReduceOnly = payload.reduceOnly === true;
            const closesByTradeSide = payload.tradeSide === "CLOSE";
            if (!isReduceOnly && !closesByTradeSide) {
                return refuse(mismatch("reduceOnly", "true", String(payload.reduceOnly ?? "—")));
            }
        }

        // --- position identity ---------------------------------------------
        const displayedPositionId = asId(displayed.positionId);
        if (displayedPositionId !== undefined) {
            checked.push("positionId");
            const payloadPositionId = asId(payload.positionId);
            if (payloadPositionId !== undefined && payloadPositionId !== displayedPositionId) {
                return refuse(mismatch("positionId", displayedPositionId, payloadPositionId));
            }
        }

        // --- order identity (cancel / modify) -------------------------------
        const displayedOrderId = asId(displayed.orderId);
        if (displayedOrderId !== undefined) {
            checked.push("orderId");
            const payloadOrderId = asId(payload.orderId) ?? asId(payload.clientId);
            if (payloadOrderId === undefined) return refuse(missing("orderId"));
            if (payloadOrderId !== displayedOrderId) {
                return refuse(mismatch("orderId", displayedOrderId, payloadOrderId));
            }
        }

        // --- size ------------------------------------------------------------
        const sizeRefusal = this.checkSize(intent, checked);
        if (sizeRefusal) return refuse(sizeRefusal);

        // --- prices -----------------------------------------------------------
        const priceRefusal = this.checkPrices(intent, checked);
        if (priceRefusal) return refuse(priceRefusal);

        // --- TP/SL trigger direction (BUG-0550) -------------------------------
        // After size/price parity so existing refusal precedence (e.g. a zero
        // stop distance refusing as `qty`) stays intact; fail-closed when the
        // side or entry context is missing while a level is attached.
        const tpSlDirectionRefusal = this.checkTpSlDirection(intent, checked);
        if (tpSlDirectionRefusal) return refuse(tpSlDirectionRefusal);

        // --- leverage / margin mode -------------------------------------------
        // Only meaningful when opening exposure. A reduce-only close inherits
        // the position's own leverage; re-checking it there would refuse valid
        // closes whenever the cached account read had gone stale — the exact
        // situation in which closing matters most.
        if (kind === "open" || kind === "add") {
            const accountRefusal = this.checkAccountState(intent, checked);
            if (accountRefusal) return refuse(accountRefusal);
        }

        // --- available margin (FEAT-0334) --------------------------------------
        // Only for an add. An `open` is sized from account size and risk, so
        // its margin cost is already bounded by inputs the gate re-derives;
        // an add's size is the trader's own number and nothing else limits it.
        if (kind === "add") {
            const marginRefusal = this.checkMargin(intent, checked);
            if (marginRefusal) return refuse(marginRefusal);
        }

        // --- risk limits (FEAT-0013) -------------------------------------------
        checked.push("riskLimits");
        const limitRefusal = riskLimitCheck?.(intent) ?? null;
        if (limitRefusal) return refuse(limitRefusal);

        // --- confirmation policy (FEAT-0024) -----------------------------------
        // Last, so that disabling a confirmation cannot skip a verification —
        // see `confirmationRefusal` for why the ordering is the design.
        checked.push("confirmation");
        const unconfirmed = this.confirmationRefusal(
            intent,
            intent.confirmAs ?? mutatingActionOf(payload, intent.endpoint) ?? "",
        );
        if (unconfirmed) return refuse(unconfirmed);

        return { approved: true, refusal: null, checked };
    }

    /**
     * Size is the field a defect turns into money fastest, so it is the one
     * field the gate never takes from the payload's own lineage: for an open
     * it is re-derived from account size, risk and stop distance; for a
     * reduce it is compared against the size the UI displayed.
     */
    private checkSize(intent: OrderIntent, checked: string[]): OrderRefusal | null {
        const { payload, displayed, kind } = intent;
        if (kind === "cancel" || kind === "bulk") return null;

        const payloadQty = toDecimal(payload.qty);

        if (kind === "reduce") {
            // Bitunix's own close endpoints carry no qty at all
            // (flash-close-position, close-all-positions) — there is nothing
            // to compare and nothing that can be oversized.
            if (displayed.positionAmount === undefined) return null;
            checked.push("qty");
            if (payloadQty === null) return missing("qty");
            if (payloadQty.lte(0)) {
                return mismatch("qty", "> 0", payloadQty.toString());
            }
            // A reduce that exceeds the position opens exposure in the
            // opposite direction. The ceiling is the size the position
            // actually has, read back fresh — not the size the payload was
            // built from.
            if (payloadQty.gt(displayed.positionAmount)) {
                return mismatch(
                    "qty",
                    `<= ${displayed.positionAmount.toString()}`,
                    payloadQty.toString(),
                );
            }
            if (displayed.fullClose === true && !decimalsAgree(payloadQty, displayed.positionAmount)) {
                return mismatch("qty", displayed.positionAmount.toString(), payloadQty.toString());
            }

            // A *partial* reduce has to be a quantity the venue can fill, or it
            // is refused there instead of here — and a control that routinely
            // produces refused orders is broken, not safe (FEAT-0256).
            //
            // Deliberately not applied to a full close. The exchange can hold a
            // size that is not a whole multiple of the current step — after a
            // partial liquidation, or when the step itself changed — and the
            // only order that closes such a position is one for exactly that
            // size. A step rule without this exemption would lock a trader
            // inside their own position, which is a worse failure than the one
            // it prevents.
            //
            // The same exemption logic covers the venue minimum (BUG-0509): a
            // partial below `minTradeVolume` is refused here, where the trader
            // can still act; a full close of a position smaller than the
            // minimum must still go out. A partial whose instrument metadata
            // never loaded states no minimum and is refused rather than
            // approved — an unmeasurable size is not a verified size
            // (BUG-0501). Maximum volumes stay out deliberately: a position
            // larger than the maximum cannot be closed in one order, and
            // refusing it would lock the trader in; splitting is its own item.
            //
            // The modulo is written out rather than taken from
            // `partialClose.ts`, whose `isWholeMultipleOfStep` the input uses to
            // *produce* this quantity. Checking with the producer's own function
            // would prove only that it agrees with itself — the same reason
            // `checkSize` recomputes the risk size below instead of reading the
            // calculator's result.
            const step = displayed.stepSize;
            if (
                displayed.fullClose !== true &&
                step !== undefined &&
                step.isFinite() &&
                step.gt(0)
            ) {
                checked.push("stepSize");
                if (!payloadQty.div(step).isInteger()) {
                    return {
                        field: "stepSize",
                        reason: "mismatch",
                        messageKey: "orderGate.stepSize",
                        values: {
                            field: "stepSize",
                            step: step.toString(),
                            actual: payloadQty.toString(),
                        },
                    };
                }
            }
            if (displayed.fullClose !== true) {
                const minVolume = displayed.minTradeVolume;
                if (minVolume === undefined) return missing("minTradeVolume");
                checked.push("minTradeVolume");
                if (payloadQty.lt(minVolume)) {
                    return {
                        field: "minTradeVolume",
                        reason: "riskLimit",
                        messageKey: "orderGate.minTradeVolume",
                        values: {
                            field: "minTradeVolume",
                            limit: minVolume.toString(),
                            actual: payloadQty.toString(),
                        },
                    };
                }
            }
            return null;
        }

        if (kind === "add") {
            // FEAT-0334. Verified against the quantity the screen showed, the
            // way a reduce is verified against the position it reduces — and
            // for the same reason: there is no second, independent way to
            // derive it. An add carries no new stop, so the risk formula below
            // has nothing to divide by, and feeding it invented inputs would
            // make the gate agree with a fiction.
            //
            // What *is* checked independently is available margin
            // (`checkMargin`), which is the ceiling an add actually has — the
            // counterpart of the position ceiling on the reduce side.
            checked.push("qty");
            if (payloadQty === null) return missing("qty");
            if (payloadQty.lte(0)) {
                return mismatch("qty", "> 0", payloadQty.toString());
            }
            if (displayed.addQuantity === undefined) {
                // An unverifiable size is not a verified size — the same
                // standard the `open` branch holds itself to below.
                return missing("qty.inputs");
            }
            if (!decimalsAgree(payloadQty, displayed.addQuantity)) {
                return mismatch(
                    "qty",
                    displayed.addQuantity.toString(),
                    payloadQty.toString(),
                );
            }

            // An add has to be a quantity the venue can fill. Unlike a full
            // close there is no exemption to make here: nothing forces an add
            // to be an odd size, so a non-fillable one is a defect rather than
            // the only way out of a position.
            //
            // The modulo is written out rather than taken from
            // `addToPosition.ts`, whose rounding *produces* this quantity —
            // checking with the producer's own function would prove only that
            // it agrees with itself.
            const step = displayed.stepSize;
            if (step !== undefined && step.isFinite() && step.gt(0)) {
                checked.push("stepSize");
                if (!payloadQty.div(step).isInteger()) {
                    return {
                        field: "stepSize",
                        reason: "mismatch",
                        messageKey: "orderGate.stepSize",
                        values: {
                            field: "stepSize",
                            step: step.toString(),
                            actual: payloadQty.toString(),
                        },
                    };
                }
            }

            return this.checkVolumeLimits(intent, checked, payloadQty);
        }

        // kind === "open" | "modify"
        if (kind === "modify") {
            // A modify's quantity is verified against what the trader was
            // shown, never re-derived from a risk formula that does not
            // describe it — the `add` branch (FEAT-0334) is the working
            // model. BUG-0505.
            return this.checkModifyQuantities(intent, checked);
        }
        const { accountSize, riskPercentage, entryPrice, stopLossPrice } = displayed;
        if (
            accountSize === undefined ||
            riskPercentage === undefined ||
            entryPrice === undefined ||
            stopLossPrice === undefined
        ) {
            // Not enough displayed state to derive size a second way. For an
            // open that is itself disqualifying — an unverifiable size is not
            // a verified size.
            if (kind === "open") {
                checked.push("qty");
                return missing("qty.inputs");
            }
            return null;
        }

        checked.push("qty");
        if (payloadQty === null) return missing("qty");

        const riskPerUnit = entryPrice.minus(stopLossPrice).abs();
        if (riskPerUnit.isZero()) {
            return mismatch(
                "qty",
                "stop distance > 0",
                "0",
                "orderGate.mismatch",
            );
        }

        // Mirrors calculateBaseMetrics() in src/lib/calculators/core.ts, but
        // computed here from the displayed inputs rather than read out of the
        // calculator's own result — deriving it the same way twice would
        // prove nothing.
        const expected = accountSize.times(riskPercentage.div(100)).div(riskPerUnit);
        const tolerance = this.sizeTolerance(expected, displayed.stepSize);
        // BUG-0506. Rounding only ever shrinks a size, so the window is
        // one-sided: a full step below absorbs the venue rounding, while
        // above expected only decimal-representation noise is allowed — never
        // a step-scaled oversize no producer could have generated.
        const upward = expected.abs().times(SIZE_TOLERANCE_RELATIVE);

        if (payloadQty.lt(expected.minus(tolerance)) || payloadQty.gt(expected.plus(upward))) {
            return {
                field: "qty",
                reason: "sizeMismatch",
                messageKey: "orderGate.sizeMismatch",
                values: {
                    field: "qty",
                    expected: expected.toString(),
                    actual: payloadQty.toString(),
                    tolerance: tolerance.toString(),
                },
            };
        }

        return this.checkVolumeLimits(intent, checked, payloadQty);
    }

    /**
     * A modify's quantities, compared against what the caller showed rather
     * than re-derived — BUG-0505.
     *
     * Three shapes reach here: a flat order quantity (`modifyOrder`), and the
     * per-leg TP/SL quantities the TP/SL endpoints nest under `params`
     * (`modifyTpSlOrder`, `placeTpSlOrder`). Legs the payload does not send
     * carry nothing to verify — a price-only modify stays approved. A leg the
     * payload sends with no displayed counterpart is disqualifying, exactly
     * as an open treats it: an unverifiable size is not a verified size, and
     * without this the next payload that grows a quantity field inherits the
     * same silence.
     *
     * Every compared leg additionally runs the venue's minimum, maximum and
     * step-size rules. A TP/SL leg is bounded by the position it protects
     * when the intent states it, the way a reduce is bounded by
     * `positionAmount` — when the intent does not state it, the bound is
     * skipped rather than guessed.
     */
    private checkModifyQuantities(intent: OrderIntent, checked: string[]): OrderRefusal | null {
        const { payload, displayed } = intent;
        const fields = { ...DEFAULT_QTY_FIELDS, ...intent.qtyFields };

        const pairs: Array<[field: string, expected: Decimal | undefined, raw: unknown, orderTypePath: string | undefined, boundByPosition: boolean]> = [
            ["qty", displayed.modifyQuantity, resolvePath(payload, fields.quantity), fields.quantityOrderType, false],
            ["takeProfitQty", displayed.takeProfitQty, resolvePath(payload, fields.takeProfit), fields.takeProfitOrderType, true],
            ["stopLossQty", displayed.stopLossQty, resolvePath(payload, fields.stopLoss), fields.stopLossOrderType, true],
        ];

        for (const [field, expected, raw, orderTypePath, boundByPosition] of pairs) {
            const actual = toDecimal(raw);
            if (actual === null) continue;
            if (expected === undefined) {
                checked.push(field);
                return missing("qty.inputs");
            }
            checked.push(field);
            if (!decimalsAgree(actual, expected)) {
                return mismatch(field, expected.toString(), actual.toString());
            }
            if (actual.lte(0)) {
                return mismatch(field, "> 0", actual.toString());
            }
            if (boundByPosition && displayed.positionAmount !== undefined && actual.gt(displayed.positionAmount)) {
                return mismatch(
                    field,
                    `<= ${displayed.positionAmount.toString()}`,
                    actual.toString(),
                );
            }
            const step = displayed.stepSize;
            if (step !== undefined && step.isFinite() && step.gt(0)) {
                checked.push("stepSize");
                if (!actual.div(step).isInteger()) {
                    return {
                        field: "stepSize",
                        reason: "mismatch",
                        messageKey: "orderGate.stepSize",
                        values: {
                            field: "stepSize",
                            step: step.toString(),
                            actual: actual.toString(),
                        },
                    };
                }
            }
            const rawOrderType = orderTypePath !== undefined ? resolvePath(payload, orderTypePath) : payload.orderType;
            const isMarket = typeof rawOrderType === "string"
                ? rawOrderType.toUpperCase() === "MARKET"
                : String(payload.orderType ?? "").toUpperCase() === "MARKET";
            const volumeRefusal = this.checkVolumeLimits(intent, checked, actual, isMarket);
            if (volumeRefusal) return volumeRefusal;
        }

        return null;
    }

    /**
     * Whether the account can fund the add — FEAT-0334.
     *
     * `addQuantity × price / leverage` against the free margin the UI showed.
     * This is the one ceiling an add has: a reduce is bounded by the position
     * and an open by its risk inputs, but an add is bounded only by what the
     * account can pay for.
     *
     * Deliberately gross of fees and of any maintenance buffer. The venue is
     * the authority on what it will fund, and a threshold that guessed at the
     * taker fee would refuse orders the venue would have accepted. This
     * catches the case where the answer is already plainly no — which is the
     * case a trader scaling in under pressure most needs caught.
     *
     * Every input absent means the check is skipped rather than guessed, and
     * `checked` records which ones were actually compared, so the audit shows
     * a decision rather than an omission — with one exception (BUG-0511): an
     * add with no balance to measure against is refused, not skipped. An add
     * is the one intent whose only ceiling is available margin; skipping the
     * check leaves it with no ceiling at all, while an open keeps its
     * risk-derived size check.
     */
    private checkMargin(intent: OrderIntent, checked: string[]): OrderRefusal | null {
        const { payload, displayed } = intent;

        const available = displayed.availableMargin;
        if (available === undefined) {
            if (intent.kind === "add") {
                checked.push("availableMargin");
                return {
                    field: "availableMargin",
                    reason: "missing",
                    messageKey: "orderGate.availableMarginUnmeasured",
                    values: { field: "availableMargin" },
                };
            }
            return null;
        }

        const qty = toDecimal(payload.qty);
        if (qty === null) return null;

        // The limit price for a limit add, the previewed mark for a market
        // one — `entryPrice` carries whichever the caller committed to.
        const price = toDecimal(resolvePath(payload, "price")) ?? displayed.entryPrice;
        if (price === undefined || price === null || price.lte(0)) return null;

        checked.push("availableMargin");

        const leverage = displayed.leverage;
        const notional = qty.times(price);
        const required =
            leverage !== undefined && leverage.isFinite() && leverage.gt(0)
                ? notional.div(leverage)
                : notional;

        if (required.gt(available)) {
            return {
                field: "availableMargin",
                reason: "riskLimit",
                messageKey: "orderGate.insufficientMargin",
                values: {
                    field: "availableMargin",
                    limit: available.toString(),
                    actual: required.toString(),
                },
            };
        }

        return null;
    }

    /**
     * The instrument's own size limits (FEAT-0067) — below the minimum or
     * above the maximum the venue accepts.
     *
     * Extracted so the `add` branch enforces exactly the same limits as an
     * `open` rather than a second, drifting copy of them. The limits belong to
     * the instrument, not to the intent: a quantity the venue will not fill is
     * refused whether the trader arrived at it through the calculator or
     * through the position panel.
     */
    private checkVolumeLimits(
        intent: OrderIntent,
        checked: string[],
        payloadQty: Decimal,
        marketOverride?: boolean,
    ): OrderRefusal | null {
        const { payload, displayed } = intent;

        if (displayed.minTradeVolume !== undefined && displayed.minTradeVolume.gt(0)) {
            checked.push("minTradeVolume");
            if (payloadQty.lt(displayed.minTradeVolume)) {
                return {
                    field: "minTradeVolume",
                    reason: "riskLimit",
                    messageKey: "orderGate.minTradeVolume",
                    values: {
                        field: "minTradeVolume",
                        limit: displayed.minTradeVolume.toString(),
                        actual: payloadQty.toString(),
                    },
                };
            }
        }

        const isMarket = marketOverride ?? payload.orderType === "MARKET";
        const maxVolume = isMarket ? displayed.maxMarketOrderVolume : displayed.maxLimitOrderVolume;
        const maxField = isMarket ? "maxMarketOrderVolume" : "maxLimitOrderVolume";
        if (maxVolume !== undefined && maxVolume.gt(0)) {
            checked.push(maxField);
            if (payloadQty.gt(maxVolume)) {
                return {
                    field: maxField,
                    reason: "riskLimit",
                    messageKey: "orderGate.maxOrderVolume",
                    values: {
                        field: maxField,
                        limit: maxVolume.toString(),
                        actual: payloadQty.toString(),
                    },
                };
            }
        }

        return null;
    }

    /**
     * Exchange step sizes force rounding down, so an exact size match would
     * refuse valid orders. The downward tolerance is therefore derived from
     * the instrument — one step — never picked as a constant, with a 0.1 %
     * relative floor for instruments whose step is finer than 0.1 % of the
     * position. The upward allowance is the relative floor only: rounding
     * never grows a size, so nothing above expected plus representation noise
     * is legitimate (BUG-0506).
     */
    private sizeTolerance(expected: Decimal, stepSize?: Decimal): Decimal {
        const relative = expected.abs().times(SIZE_TOLERANCE_RELATIVE);
        if (stepSize === undefined || !stepSize.isFinite() || stepSize.lte(0)) {
            return relative;
        }
        return Decimal.max(stepSize, relative);
    }

    /**
     * Whether the protection the trader set is expected on *this* payload
     * (BUG-0297).
     *
     * `displayed.stopLossPrice` answers "the stop this position will have".
     * The price rule below needs a narrower question — "the stop this request
     * carries" — and the two diverge on a venue that cannot attach protection
     * to an entry: the stop is real, and it belongs to a second request.
     * Reading the wide field as the narrow one refused every such entry as
     * having forgotten a stop the trader had plainly entered.
     *
     * Derived from the venue's own declaration rather than taken from the
     * caller, deliberately. A `stopLossAttached` flag on `DisplayedState`
     * would let any caller switch the stop comparison off by passing `false`
     * — which is the one thing a gate must not accept from the code it is
     * checking. `tpSlAtEntry: false` is a fact about the venue, and a payload
     * that attaches a stop anyway is already refused as unsupported before
     * this rule runs, so nothing reaches transport uncompared.
     *
     * BUG-0503 narrowed the excuse: a stop is deferred only onto a later
     * request that exists (`tpSlStandalone`). A venue with neither way to
     * take the stop is refused by `unplaceableStop` before this runs.
     *
     * Scoped to `place-order`: the standalone TP/SL endpoints exist precisely
     * to carry these levels, and their payloads must still match.
     */
    private entryCarriesProtection(intent: OrderIntent): boolean {
        if (intent.payload.type !== "place-order") return true;
        /*
         * An undeclared venue gets the stricter rule, not the looser one.
         * `UNKNOWN_EXCHANGE` reports `tpSlAtEntry: false`, which is the right
         * answer to "may this order attach a stop" and the wrong one to "is a
         * displayed stop excused from comparison here" — nothing is known
         * about such a venue, so nothing is excused.
         *
         * The order-type rule already refuses an undeclared venue before this
         * runs, so this changes no outcome today. It is here so that the rule
         * is correct on its own terms rather than by depending on the order
         * two rules happen to run in.
         */
        if (!isKnownExchange(intent.displayed.provider)) return true;
        const caps = capabilitiesOf(intent.displayed.provider);
        /*
         * BUG-0503 — excused from comparison only when a later request will
         * actually carry the stop. Attachment compares here; a venue that
         * cannot attach but takes a standalone plan defers to that request;
         * a venue with neither excuses nothing (the `unplaceableStop` rule
         * above already refused such an entry, so this is the belt to those
         * braces for callers that reach the gate directly).
         */
        if (caps.tpSlAtEntry) return true;
        return !caps.tpSlStandalone;
    }

    private checkTpSlDirection(intent: OrderIntent, checked: string[]): OrderRefusal | null {
        const { payload, displayed } = intent;
        const levels: Array<[TpSlPriceKind, string, unknown]> = [
            ["TP", "takeProfit", resolvePath(payload, "tpPrice") ?? resolvePath(payload, "params.tpPrice")],
            ["SL", "stopLoss", resolvePath(payload, "slPrice") ?? resolvePath(payload, "params.slPrice")],
        ];
        const presentLevels = levels.filter(([, , raw]) => raw !== undefined);
        if (presentLevels.length === 0) return null;

        checked.push("tpSlDirection");
        const side = normalizePositionSide(displayed.positionSide ?? displayed.side);
        if (side === null) return missing("side");
        if (displayed.entryPrice === undefined || !displayed.entryPrice.isFinite() || displayed.entryPrice.lte(0)) {
            return missing("entryPrice");
        }

        for (const [kind, field, raw] of presentLevels) {
            const price = toDecimal(raw);
            const validation = price === null
                ? ({ valid: false, reason: "invalidPrice" } as const)
                : validateTpSlPrice(kind, price, {
                      entryPrice: displayed.entryPrice,
                      side,
                  }, displayed.tickSize);
            if (validation.valid) continue;
            return {
                field,
                reason: validation.reason === "missingContext" ? "missing" : "unsupported",
                messageKey: "orderGate.invalidTpSl",
                values: {
                    field,
                    actual: price?.toString() ?? String(raw),
                    entryPrice: displayed.entryPrice.toString(),
                    side,
                },
            };
        }
        return null;
    }

    private checkPrices(intent: OrderIntent, checked: string[]): OrderRefusal | null {
        const { payload, displayed } = intent;
        const fields = { ...DEFAULT_PRICE_FIELDS, ...intent.priceFields };

        const carriesProtection = this.entryCarriesProtection(intent);
        /*
         * Only a real stop defers or compares. A non-positive level means
         * "no stop requested" — the `unplaceableStop` rule reads it the same
         * way — so a deliberately stopless entry on a no-attach venue is
         * neither deferred nor asked to match a payload stop it never had.
         */
        const displayedStop =
            displayed.stopLossPrice !== undefined && displayed.stopLossPrice.gt(0)
                ? displayed.stopLossPrice
                : undefined;
        // Recorded so the audit shows a decision rather than an omission: the
        // stop was not compared here *because* it travels separately.
        if (!carriesProtection && displayedStop !== undefined) {
            checked.push("protectionDeferred");
        }

        // A TP/SL plan has no order price on the wire: its `entryPrice` is
        // position context for the direction check (BUG-0550), not the
        // price this request sends, so it must not be compared against a
        // field that structurally never exists in a `/api/tpsl` payload.
        const entryPrice = intent.endpoint === "/api/tpsl" ? undefined : displayed.entryPrice;
        const pairs: Array<[string, Decimal | undefined, unknown]> = [
            ["price", entryPrice, resolvePath(payload, fields.price)],
            [
                "stopLoss",
                carriesProtection ? displayedStop : undefined,
                resolvePath(payload, fields.stopLoss) ?? resolvePath(payload, "stopPrice"),
            ],
        ];

        for (const [field, expected, raw] of pairs) {
            if (expected === undefined) continue;
            checked.push(field);
            const actual = toDecimal(raw);
            // A market order carries no limit price; that is not a mismatch.
            if (actual === null) {
                if (field === "price" && payload.orderType === "MARKET") continue;
                return missing(field);
            }
            if (!decimalsAgree(actual, expected)) {
                return mismatch(field, expected.toString(), actual.toString());
            }
        }

        // Same split as the stop above: a target the entry cannot carry is
        // placed by a later request and compared there. `placeEntryGroup`
        // already leaves `takeProfits` undefined in that case, so this is the
        // belt to that braces — a caller that sets it anyway must not turn a
        // separately-placed target into a missing one.
        if (displayed.takeProfits !== undefined && carriesProtection) {
            const payloadTps = this.payloadTakeProfits(payload, fields.takeProfit);
            checked.push("takeProfit");
            if (payloadTps.length !== displayed.takeProfits.length) {
                return mismatch(
                    "takeProfit",
                    `${displayed.takeProfits.length} level(s)`,
                    `${payloadTps.length} level(s)`,
                );
            }
            for (let i = 0; i < displayed.takeProfits.length; i++) {
                const expected = displayed.takeProfits[i];
                const actual = payloadTps[i];
                if (actual === null) return missing(`takeProfit[${i}]`);
                if (!decimalsAgree(actual, expected)) {
                    return mismatch(
                        `takeProfit[${i}]`,
                        expected.toString(),
                        actual.toString(),
                    );
                }
            }
        }

        return null;
    }

    /** Bitunix carries a single `tpPrice`; batched shapes carry `tpPrices`. */
    private payloadTakeProfits(
        payload: Record<string, unknown>,
        path: string,
    ): Array<Decimal | null> {
        const single = resolvePath(payload, path);
        if (Array.isArray(single)) return single.map(toDecimal);

        const plural = resolvePath(payload, `${path}s`);
        if (Array.isArray(plural)) return plural.map(toDecimal);

        if (single !== undefined && single !== null && single !== "") {
            return [toDecimal(single)];
        }
        return [];
    }

    private checkAccountState(intent: OrderIntent, checked: string[]): OrderRefusal | null {
        const { payload, displayed } = intent;

        if (displayed.leverage !== undefined || displayed.marginMode !== undefined) {
            checked.push("accountState");
            // In paper mode there is no remote account for this to be stale
            // relative to — the simulator *is* the account, and nothing ever
            // stamps `accountStateAt` because no exchange read happens. Without
            // this, every simulated order is refused, which is the opposite of
            // what a practice mode is for.
            //
            // A live order cannot reach this by claiming to be paper:
            // `assertGatePass` re-reads the real mode at transmit time and
            // refuses a pass whose paperMode disagrees.
            if (displayed.paperMode === true) return null;
            const age =
                displayed.accountStateAt === undefined
                    ? Number.POSITIVE_INFINITY
                    : Date.now() - displayed.accountStateAt;
            if (!(age <= MAX_ACCOUNT_STATE_AGE_MS)) {
                return {
                    field: "accountState",
                    reason: "stale",
                    messageKey: "orderGate.stale",
                    values: {
                        field: "accountState",
                        age: Number.isFinite(age) ? String(Math.round(age / 1000)) : "∞",
                        max: String(Math.round(MAX_ACCOUNT_STATE_AGE_MS / 1000)),
                    },
                };
            }
        }

        if (displayed.leverage !== undefined && payload.leverage !== undefined) {
            checked.push("leverage");
            const actual = toDecimal(payload.leverage);
            if (actual === null) return missing("leverage");
            if (!decimalsAgree(actual, displayed.leverage)) {
                return mismatch("leverage", displayed.leverage.toString(), actual.toString());
            }
        }

        if (displayed.marginMode !== undefined && payload.marginMode !== undefined) {
            checked.push("marginMode");
            const actual = typeof payload.marginMode === "string" ? payload.marginMode : undefined;
            if (actual === undefined) return missing("marginMode");
            if (actual.toUpperCase() !== displayed.marginMode.toUpperCase()) {
                return mismatch("marginMode", displayed.marginMode, actual);
            }
        }

        return null;
    }

    /**
     * Has a human agreed to this, where the policy says one must — FEAT-0024.
     *
     * Deliberately the LAST check in `verify`, and the ordering is the design:
     *
     * 1. A confirmation is not a verification. Running it last makes that
     *    literal — every FEAT-0011 comparison has already happened by the time
     *    this is consulted, so switching a confirmation off cannot skip one.
     *    `orderGate.confirmation.test.ts` asserts exactly this by refusing a
     *    price-mismatched order with the policy disabled and checking the
     *    refusal names `price`, not `confirmation`.
     * 2. An order that fails verification should never reach a human. Asking
     *    "really send this?" about a payload the gate is going to refuse
     *    anyway trains the user to click through the dialog that matters.
     * 3. The dialog quotes concrete numbers, and those are only trustworthy
     *    once they have been compared against the displayed state.
     */
    private confirmationRefusal(intent: OrderIntent, action: string): OrderRefusal | null {
        if (confirmationCheck?.(action) !== true) return null;
        if (typeof intent.confirmedAt === "number") return null;

        return {
            field: "confirmation",
            reason: "unconfirmed",
            messageKey: "orderGate.unconfirmed",
            values: { action },
        };
    }

    /**
     * Verify, then transmit. The transport callback receives a single-use
     * pass; without one `assertGatePass` rejects the request, which is what
     * makes the gate unavoidable rather than merely available.
     *
     * On refusal it throws before `transport` is ever invoked — no network
     * call is made, not even a cancelled one.
     */
    /**
     * Verify, record a refusal, and throw it — `submit`'s refusal half on its
     * own.
     *
     * Exposed for a caller that has side effects on the way to the gate and
     * therefore has to know the verdict first (`flashClosePosition` cancels
     * the position's stops, BUG-0331). Running bare `verify` there was a
     * silent regression: the refusal never reached `submit`, so FEAT-0015
     * never recorded it, and a trader asking "why did my close not go
     * through" found nothing in the order log. A refusal that is not audited
     * is the one refusal nobody can explain afterwards.
     *
     * Returns the verdict when it approves; the caller may submit the same
     * intent. Verifying twice is safe and cheap — `verify` is pure.
     */
    public verifyOrThrow(intent: OrderIntent): OrderGateVerdict {
        const verdict = this.verify(intent);

        if (!verdict.approved && verdict.refusal) {
            this.audit(intent, {
                at: Date.now(),
                action: mutatingActionOf(intent.payload, intent.endpoint) ?? "",
                outcome: "refused",
                checked: verdict.checked,
                refusal: verdict.refusal,
            });
            throw new OrderRefusedError(verdict.refusal);
        }

        return verdict;
    }

    public async submit<T>(
        intent: OrderIntent,
        transport: (pass: GatePass) => Promise<T>,
    ): Promise<T> {
        const at = Date.now();
        const action = mutatingActionOf(intent.payload, intent.endpoint) ?? "";
        const verdict = this.verifyOrThrow(intent);

        const pass = {} as GatePass;
        issuedPasses.set(pass as unknown as object, {
            provider: intent.displayed.provider,
            accountFingerprint: intent.displayed.accountFingerprint,
            accountId: intent.displayed.accountId,
            endpoint: intent.endpoint,
            action,
            symbol: typeof intent.payload.symbol === "string" ? intent.payload.symbol : undefined,
            paperMode: intent.displayed.paperMode === true,
        });

        let fingerprint: string | null = null;
        // Ownership of the guard entry: a refused duplicate must not clear
        // the flight it collided with. `Set.delete` removes the shared entry
        // regardless of who added it, so only the call that added the
        // fingerprint may remove it — deleting a key this call never added
        // would open the gate for the still-travelling original.
        let added = false;
        try {
            // BUG-0507: the panel's own guard used to sit past the
            // confirmation dialog, so a second submit during the dialog
            // reached this line. Refuse it here — at the one layer every
            // order path (panel, bot, future controls) passes through.
            fingerprint = this.fingerprintOf(intent);
            if (this.inFlight.has(fingerprint)) {
                const refusal: OrderRefusal = {
                    field: "order",
                    reason: "duplicate",
                    messageKey: "orderGate.duplicateInFlight",
                    values: {
                        action,
                        symbol:
                            typeof intent.payload.symbol === "string"
                                ? intent.payload.symbol
                                : "",
                    },
                };
                this.audit(intent, {
                    at,
                    action,
                    outcome: "refused",
                    checked: verdict.checked,
                    refusal,
                });
                throw new OrderRefusedError(refusal);
            }
            this.inFlight.add(fingerprint);
            added = true;
            const response = await transport(pass);
            this.audit(intent, {
                at,
                action,
                outcome: "sent",
                checked: verdict.checked,
                response,
            });
            return response;
        } catch (error) {
            if (error instanceof OrderRefusedError) {
                // A refusal discovered late — the account, credentials or
                // mode changed between approval and transmission, so
                // `assertGatePass` threw inside the transport — is still a
                // refusal, not a transport failure. One already recorded
                // (the in-flight guard above, which throws before adding)
                // is not recorded twice: `added` tells them apart, so the
                // audit log keeps exactly one entry per attempt.
                if (added) {
                    this.audit(intent, {
                        at,
                        action,
                        outcome: "refused",
                        checked: verdict.checked,
                        refusal: error.refusal,
                    });
                }
                throw error;
            }
            // A transport that threw is the most interesting case of all —
            // the order may or may not have reached the exchange.
            this.audit(intent, {
                at,
                action,
                outcome: "failed",
                checked: verdict.checked,
                error: {
                    name: error instanceof Error ? error.name : "Error",
                    message: error instanceof Error ? error.message : String(error),
                },
            });
            throw error;
        } finally {
            // The flight is over however it ended — a stuck fingerprint
            // would refuse every identical order from here on. Only the call
            // that added the entry removes it: a refused duplicate leaves
            // the original flight's guard untouched.
            if (added && fingerprint !== null) this.inFlight.delete(fingerprint);
        }
    }

    /**
     * Reports an attempt to the recorder. Never throws: an audit trail that
     * can refuse an order is a second gate, and a broken recorder must not
     * be able to stop a close.
     */
    private audit(
        intent: OrderIntent,
        part: Pick<OrderAttempt, "at" | "action" | "outcome" | "checked"> &
            Partial<Pick<OrderAttempt, "refusal" | "response" | "error">>,
    ): void {
        if (!auditRecorder) return;
        try {
            auditRecorder({
                ...part,
                completedAt: Date.now(),
                endpoint: intent.endpoint,
                kind: intent.kind,
                provider: intent.displayed.provider,
                accountFingerprint: intent.displayed.accountFingerprint,
                paperMode: intent.displayed.paperMode === true,
                payload: intent.payload,
            });
        } catch {
            // Deliberately swallowed. See above.
        }
    }
}

export const orderGate = new OrderGate();

// ---------------------------------------------------------------------------
// Transport-side enforcement
// ---------------------------------------------------------------------------

export interface TransportContext {
    endpoint: string;
    payload: Record<string, unknown>;
    /** Provider the transport is about to sign with, read at transmit time. */
    provider: string;
    /** Fingerprint of the key the transport is about to sign with. */
    accountFingerprint: string;
    /** The account the transport actually resolved (FEAT-0026). */
    accountId?: string;
    /** The live paper/live mode, read at transmit time (FEAT-0012). */
    paperMode: boolean;
}

/**
 * Called by the transport immediately before it touches the network.
 *
 * Read-only requests pass straight through. Mutating ones need a pass that
 * (a) this module issued, (b) has not been used, and (c) was issued for the
 * same endpoint, action, symbol and account the transport is about to use.
 *
 * (c) is not redundant with `verify`: settings can change between the click
 * and the send. Re-reading the provider and key here and comparing them
 * against what the gate approved is a genuinely second derivation of "which
 * account is this order going to".
 */
/**
 * Discriminator coherence for the endpoint and payload action fields.
 *
 * A mismatch is a malformed transport context, not a read-only request, and
 * must be refused even when no recognized action remains. Returned rather
 * than thrown so `assertGatePass` can consume a presented pass before
 * refusing, preserving the single-use guarantee.
 */
function discriminatorMismatch(ctx: TransportContext): OrderRefusal | null {
    const endpointAction = cachyAction(ctx.endpoint);
    const payloadActions = [ctx.payload.action, ctx.payload.type].filter(
        (value): value is string => typeof value === "string",
    );
    if (new Set(payloadActions).size > 1) {
        return mismatch("action", payloadActions[0], payloadActions[1]);
    }
    const payloadAction = payloadActions[0];
    if (endpointAction && payloadAction && endpointAction !== payloadAction) {
        return mismatch("action", endpointAction, payloadAction);
    }
    return null;
}

export function assertGatePass(ctx: TransportContext, pass?: GatePass): void {
    const discriminatorRefusal = discriminatorMismatch(ctx);
    const action = mutatingActionOf(ctx.payload, ctx.endpoint);
    if (action === null) {
        if (discriminatorRefusal) throw new OrderRefusedError(discriminatorRefusal);
        return; // read-only
    }

    const record = pass ? issuedPasses.get(pass as unknown as object) : undefined;
    if (!pass || !record) {
        if (discriminatorRefusal) throw new OrderRefusedError(discriminatorRefusal);
        throw new OrderRefusedError({
            field: "gate",
            reason: "missing",
            messageKey: "orderGate.bypassed",
            values: { action },
        });
    }
    // Single use: a pass is consumed whether or not the checks below hold, so
    // a rejected attempt cannot be retried with the same approval.
    issuedPasses.delete(pass as unknown as object);
    if (discriminatorRefusal) throw new OrderRefusedError(discriminatorRefusal);

    if (record.endpoint !== ctx.endpoint) {
        throw new OrderRefusedError(mismatch("endpoint", record.endpoint, ctx.endpoint));
    }
    if (record.action !== action) {
        throw new OrderRefusedError(mismatch("action", record.action, action));
    }
    const payloadSymbol = typeof ctx.payload.symbol === "string" ? ctx.payload.symbol : undefined;
    if (record.symbol !== payloadSymbol) {
        throw new OrderRefusedError(
            mismatch("symbol", record.symbol ?? "—", payloadSymbol ?? "—"),
        );
    }
    if (record.provider !== ctx.provider) {
        throw new OrderRefusedError(mismatch("account", record.provider, ctx.provider));
    }
    // Checked before the fingerprint so the two refusals stay distinguishable:
    // an id change with the same key means the account was switched under the
    // order, a key change with the same id means the credentials were edited.
    // Only compared when the pass carries one — see `DisplayedState.accountId`.
    if (record.accountId !== undefined && record.accountId !== ctx.accountId) {
        throw new OrderRefusedError(
            mismatch("account", record.accountId, ctx.accountId ?? "—"),
        );
    }
    if (record.accountFingerprint !== ctx.accountFingerprint) {
        throw new OrderRefusedError(
            mismatch("account", record.accountFingerprint, ctx.accountFingerprint),
        );
    }
    // The failure that matters is not "I placed a paper order thinking it was
    // live" — it is the reverse. If the mode changed between approval and
    // transmission, the order does not go anywhere.
    if (record.paperMode !== ctx.paperMode) {
        throw new OrderRefusedError(
            mismatch(
                "mode",
                record.paperMode ? "paper" : "live",
                ctx.paperMode ? "paper" : "live",
            ),
        );
    }
}

/**
 * Renders a refusal in the user's language. Takes the translate function as
 * an argument rather than importing the i18n store, so the gate stays a pure
 * module that tests can exercise without a Svelte runtime.
 *
 * Field names are translated too: "qty" is what the code calls it, "the
 * position size" is what the trader needs to read.
 */
export function translateRefusal(
    refusal: OrderRefusal,
    t: (key: string, options?: { values?: Record<string, string> }) => string,
): string {
    const values = { ...refusal.values };
    if (values.field) {
        const translated = t(`orderGate.fields.${values.field}`);
        // svelte-i18n echoes the key back when it has no entry — a field like
        // "takeProfit[0]" legitimately has none, so fall back to the raw name
        // rather than showing the user a dotted key path.
        if (translated && translated !== `orderGate.fields.${values.field}`) {
            values.field = translated;
        }
    }
    /*
     * FEAT-0024's refusal names an action, and it should read the way the
     * settings screen names it — "Flash close", not "flash-close-position".
     * Same fallback as the field above: a wire action outside the confirmable
     * catalogue has no label, and svelte-i18n echoes the key back, so the raw
     * name is shown rather than a dotted path.
     */
    if (values.action) {
        const key = `settings.confirmations.actions.${values.action}.label`;
        const translated = t(key);
        if (translated && translated !== key) {
            values.action = translated;
        }
    }
    return t(refusal.messageKey, { values });
}

/**
 * Non-secret, stable identifier for an API key. Class A data never leaves the
 * device, and this shortened form additionally keeps the key out of refusal
 * messages and logs.
 */
/** What `accountFingerprint` reports for an account with no key at all. */
export const NO_CREDENTIALS = "none";

export function accountFingerprint(apiKey: string | undefined | null): string {
    if (!apiKey) return NO_CREDENTIALS;
    if (apiKey.length <= 8) return `${apiKey.slice(0, 2)}…${apiKey.length}`;
    return `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`;
}
