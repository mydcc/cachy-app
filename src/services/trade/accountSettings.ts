/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * Leverage, margin mode, position mode and isolated-margin adjustments —
 * extracted from tradeService.ts (FEAT-0342).
 *
 * This is the one lane that talks to the venue *about the account* rather than
 * about an order or a plan. That makes it the one lane with no gate pass: a
 * leverage change is not an order, so `signedRequest` would either demand a
 * pass it cannot produce or force a hole in `assertGatePass`. The separation
 * is deliberate and lives in `accountSettingRequest` — the comment there says
 * so in full.
 *
 * Everything it needs from the owner arrives as a port: the venue and its
 * credentials, the displayed-state writes a service may not perform itself, and
 * the one session-guarded fetch (eslint.architecture.boundaries.js).
 */

import { Decimal } from "decimal.js";
import { appFetch } from "../../lib/appAuth";
import { logger } from "../logger";
import { accountEpoch } from "../accountEpoch.svelte";
import { accountReadOrder, leverageReadOrder } from "../accountReadOrder";
import { paperAccountFeed } from "../paperAccountFeed";
import { safeJsonParse } from "../../utils/safeJson";
import { unwrapApiEnvelope } from "../../utils/utils";
import { normalizeMarginMode } from "../../utils/marginMode";
import { exchangeSignedFetch } from "../../utils/exchange/browserSigning";
import {
    buildAccountQueryParams,
    buildLeverageMarginModeQueryParams,
} from "../../utils/exchange/venueQueries";
import { AccountSettingsRequestSchema } from "../../types/accountSettingsSchemas";
import { BitunixLeverageMarginModeSchema } from "../../types/apiSchemas";
// Type-only, so the store layer is not reached at runtime — the boundary rule
// allows it (`allowTypeImports: true`) precisely because this carries no
// coupling. Re-declaring the union here would be a second place to change.
import type { ExchangeProvider } from "../../stores/settings/accounts";
import { BitunixApiError } from "./tradeErrors";

/**
 * Attempts for a post-write read-back, the immediate one included
 * (BUG-0409).
 */
const READ_BACK_ATTEMPTS = 3;

/**
 * Gaps before the second and third attempt.
 *
 * Two numbers rather than a formula: a venue that has not settled within
 * ~2.7 s of a confirmed write will not settle at ~3 s either, and a trader
 * watching a chip must not be left in front of an open-ended backoff. Whoever
 * widens this owes the request-budget arithmetic — the venue allows 10 req/s
 * per endpoint and every other account read is event-driven.
 */
const READ_BACK_DELAYS_MS = [700, 2000];

/** `appFetch`'s call shape, minus the guard hook the session wrapper consumes. */
type ExchangeFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * What the service is given rather than reads.
 *
 * A service must not import stores (eslint.architecture.boundaries.js), so every
 * store read and write below is a port, and `tradeService.ts` supplies the
 * arrow functions. Each port names a capability, not a store, so the wiring
 * reads as "where the value comes from" instead of "which module holds it".
 */
export interface AccountSettingsPorts {
    /** The configured venue, exactly as the setting holds it. */
    activeVenue(): ExchangeProvider;
    /** Credentials of the active account for `provider`. */
    activeKeys(provider: ExchangeProvider): {
        key: string;
        secret: string;
        passphrase?: string;
    };
    /**
     * A fetch bound to the session this write started in, so a switch that
     * happens while the signature is computed is caught (BUG-0551).
     */
    sessionFetch(): ExchangeFetch;
    /** Whether the trader is in paper mode. */
    isPaperMode(): boolean;

    /** Writes the displayed leverage and margin mode, and re-stamps their age. */
    applyRemoteLeverageMargin(leverage: Decimal, marginMode: string): void;
    /** The displayed margin mode, for the read-back predicate. */
    readRemoteMarginMode(): string | undefined;

    /** Writes the displayed position mode. */
    setPositionMode(mode: string | undefined): void;
    /** The displayed position mode, for the read-back predicate. */
    readPositionMode(): string | undefined;
    /** Raises/lowers the "a margin-mode write is being confirmed" marker. */
    setMarginModeVerifying(busy: boolean): void;
    /** Raises/lowers the "a position-mode write is being confirmed" marker. */
    setPositionModeVerifying(busy: boolean): void;
    /** Asks the position views to re-read from the venue. */
    requestSync(): void;
    /**
     * Says out loud that the venue never confirmed the change.
     *
     * The alternative this replaces was a `logger` line: the write succeeded,
     * the toast said so, and the chip kept the old value with nothing to
     * distinguish "the exchange is slow" from "Cachy is broken". The displayed
     * value stays whatever the venue last reported — it is not overwritten
     * with what was requested, because that would be the optimistic write
     * FEAT-0068 exists to avoid.
     *
     * A port rather than a toast call here, and the reason is the one
     * `tpSlService` already follows: this module produces message *keys* and
     * lets the owner translate. Translating here would put svelte-i18n on the
     * failure path of every read-back that gives up.
     */
    warnUnconfirmed(): void;
}

/** The account-settings surface `tradeService` re-exposes. */
export interface AccountSettingsService {
    fetchLeverageMarginMode(symbol: string): Promise<void>;
    fetchPositionMode(): Promise<void>;
    changeLeverage(symbol: string, leverage: Decimal): Promise<void>;
    changeMarginMode(symbol: string, marginMode: "ISOLATION" | "CROSS"): Promise<void>;
    changePositionMode(positionMode: "ONE_WAY" | "HEDGE"): Promise<void>;
    adjustPositionMargin(params: {
        symbol: string;
        amount: Decimal;
        side?: "LONG" | "SHORT";
        positionId?: string;
    }): Promise<void>;
}

/**
 * Read one account setting back until the venue reports what was written
 * (BUG-0409).
 *
 * The write returning 200 is not the same as the change being readable.
 * A single immediate re-read can land inside the venue's own propagation
 * window and answer with the pre-write value — captured live: an
 * `/api/account` body still saying `HEDGE` seconds after a confirmed
 * `ONE_WAY` write, with the broker app already showing `ONE_WAY`. The
 * chip then showed the old mode and nothing ever corrected it, so the
 * trader's next write diffed against a value that was never current.
 *
 * Bounded and finite on purpose: this is a read-back for one write, not a
 * poller. It stops the moment the venue agrees, gives up after
 * `READ_BACK_ATTEMPTS`, and abandons immediately if the account is
 * switched underneath — the answer would describe an account the trader
 * has left.
 *
 * Returns how the read-back ended. `confirmed` and `unconfirmed`
 * both mean the account is still the trader's own — only then may the
 * caller warn. `switched` means the account moved underneath: warning
 * about the previous account's value would blame the venue for a read
 * that no longer belongs to this session. It deliberately does not
 * decide beyond that: the caller knows which control the trader is
 * looking at.
 */
async function readBackUntilApplied(
    read: () => Promise<void>,
    isApplied: () => boolean,
): Promise<"confirmed" | "unconfirmed" | "switched"> {
    const session = accountEpoch.current();

    for (let attempt = 0; attempt < READ_BACK_ATTEMPTS; attempt++) {
        if (attempt > 0) {
            await new Promise((resolve) =>
                setTimeout(resolve, READ_BACK_DELAYS_MS[attempt - 1]),
            );
            if (!accountEpoch.isCurrent(session)) return "switched";
        }
        await read();
        if (!accountEpoch.isCurrent(session)) return "switched";
        if (isApplied()) return "confirmed";
    }
    return "unconfirmed";
}

/**
 * FEAT-0068 — the account-settings write transport.
 *
 * Deliberately separate from `signedRequest`: none of these is an order,
 * so none carries a FEAT-0011 gate pass, and routing them through the
 * order transport would either need a pass they cannot produce or a hole
 * in `assertGatePass`. They are still writes, which is why they throw on
 * failure rather than resolving quietly the way the account *reads* above
 * do — a leverage change that reported nothing would leave the trader
 * sizing a position against a number the exchange never accepted.
 *
 * FEAT-0405 A5: the credential rides as a pre-signed envelope like every
 * other migrated route, so the secret never leaves the device.
 *
 * Paper mode never reaches the network. `paperExchange` simulates orders,
 * not account settings; there is nothing on the far side to change, so
 * this refuses instead of pretending.
 */
async function accountSettingRequest(
    ports: AccountSettingsPorts,
    payload: Record<string, unknown>,
): Promise<unknown> {
    if (ports.isPaperMode()) {
        throw new Error("exchange.accountSettings.paperMode");
    }

    const provider = ports.activeVenue();
    const keys = ports.activeKeys(provider);
    if (!keys?.key || !keys?.secret) {
        throw new Error("apiErrors.missingCredentials");
    }

    // BUG-0551: this lane signs and dispatches on its own, so it carries
    // its own re-check. The paper guard above has the same gap it was
    // written to close — the switch that happens while the signature is
    // being computed is not the one it can see.
    //
    // Parsed here as well as in the route, and for the same reason the route
    // parses: `marginCoin` carries a default and `amount` a transform, so the
    // two sides only build the same bytes if they build from the same parsed
    // payload. Signing the raw object instead would be refused as
    // `PRESIGNED_DIVERGENCE` before anything left Cachy.
    const parsed = AccountSettingsRequestSchema.safeParse({ exchange: provider, ...payload });
    if (!parsed.success) {
        const details = parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(", ");
        throw new BitunixApiError("VALIDATION_ERROR", "apiErrors.generic", details);
    }

    const response = await exchangeSignedFetch({
        cachyPath: "/api/account-settings",
        keys: { apiKey: keys.key, apiSecret: keys.secret, passphrase: keys.passphrase },
        method: "POST",
        // Named rather than inferred: the route resolves its venue from the
        // body, and the envelope itself carries only credentials.
        venue: provider,
        fetchFn: ports.sessionFetch(),
        headers: { "X-Provider": provider },
        payload: parsed.data,
    });

    const text = await response.text();
    let data: Record<string, unknown> = {};
    try {
        data = safeJsonParse(text);
    } catch {
        if (!response.ok) throw new BitunixApiError(response.status, "apiErrors.invalidResponse");
    }

    const code = data.code as string | number | undefined;
    if (!response.ok || (code !== undefined && String(code) !== "0")) {
        const rawMsg = String(data.error || data.msg || "Unknown API Error");
        logger.debug("api", `[TradeService] Account setting rejected: ${rawMsg}`);
        throw new BitunixApiError(code ?? response.status ?? -1, "apiErrors.generic", rawMsg);
    }

    return data.data ?? null;
}

export function createAccountSettingsService(
    ports: AccountSettingsPorts,
): AccountSettingsService {
    /** Read-only: current leverage + margin mode for a symbol, straight from
     * the exchange (not the local calculator input). Populates
     * tradeState.remoteLeverage/remoteMarginMode, which GeneralInputs.svelte
     * already reads for its "synced with API" indicator but which nothing
     * has ever set until now. */
    async function fetchLeverageMarginMode(symbol: string): Promise<void> {
        const provider = ports.activeVenue();
        if (provider !== "bitunix") return; // Bitget equivalent: follow the M2 adapter shape
        const keys = ports.activeKeys(provider);
        if (!keys?.key || !keys?.secret) return;

        // FEAT-0026. These three fields are what the FEAT-0011 gate ages: it
        // asks "is this recent enough", never "is this the account I am
        // signing for". A late response writing them would look freshly
        // confirmed while describing the account the trader just left.
        //
        // BUG-0412's ordering rides on the same ticket, in its own lane: this
        // read has five-plus triggers (symbol selection, the order-submit
        // stale gate, post-write read-backs) and the read-back below fires it
        // repeatedly on purpose, so overlapping answers are the normal case
        // here rather than the exception.
        const ticket = leverageReadOrder.begin();

        try {
            const response = await exchangeSignedFetch({
                cachyPath: "/api/leverage-margin-mode",
                keys: { apiKey: keys.key, apiSecret: keys.secret },
                fetchFn: appFetch,
                payload: { exchange: provider, symbol },
                queryParams: buildLeverageMarginModeQueryParams({ symbol }),
            });
            const json = await response.json();
            const { data } = unwrapApiEnvelope<Record<string, unknown>>(json);
            if (!data) return;

            const validation = BitunixLeverageMarginModeSchema.safeParse(data);
            if (!validation.success) {
                logger.error("network", "[TradeService] Invalid leverage/margin-mode response", validation.error.issues);
                return;
            }
            if (!leverageReadOrder.mayApply(ticket)) return;

            ports.applyRemoteLeverageMargin(
                new Decimal(validation.data.leverage),
                validation.data.marginMode,
            );
        } catch (e) {
            logger.debug("api", "[TradeService] fetchLeverageMarginMode failed", e);
        }
    }

    /**
     * Read-only: the account-wide position mode (FEAT-0068), straight from
     * the exchange. Populates `accountState.positionMode`, which
     * ExchangeAccountControls reads for its mode chip — previously only
     * PositionsSidebar's snapshot fed it, so the chip showed "—" wherever
     * the sidebar never fetched. Same silent-read contract as
     * `fetchLeverageMarginMode`: no keys, stale session or failed request
     * leaves the previous value alone.
     */
    async function fetchPositionMode(): Promise<void> {
        const provider = ports.activeVenue() || "bitunix";
        const keys = ports.activeKeys(provider);
        if (!keys?.key || !keys?.secret) return;

        // BUG-0412: this read competes with PositionsSidebar's two mounted
        // instances for the same store field, so the ticket has to be taken
        // here — before the first `await` — rather than at the write.
        const ticket = accountReadOrder.begin();

        // Paper mode answers from the simulated book, exactly like
        // PositionsSidebar: paperExchange simulates orders only and knows
        // no venue margin modes, so there is no live read to take here.
        const paper = paperAccountFeed();
        if (paper) {
            if (!accountReadOrder.mayApply(ticket)) return;
            ports.setPositionMode(paper.accountInfo().positionMode);
            return;
        }

        try {
            // FEAT-0405 A5 — this read used to carry the secret, and its failure
            // is swallowed by every caller (`.catch(() => {})` in
            // ExchangeAccountControls), which is exactly how an unmigrated call
            // site here would present: position mode silently stuck on its
            // default. Signing it in the browser is what keeps that quiet.
            const response = await exchangeSignedFetch({
                cachyPath: "/api/account",
                keys: { apiKey: keys.key, apiSecret: keys.secret, passphrase: keys.passphrase },
                venue: provider,
                payload: { exchange: provider },
                queryParams: buildAccountQueryParams(provider),
                headers: { "X-Provider": provider },
                fetchFn: appFetch,
            });
            const json = await response.json();
            const { data } = unwrapApiEnvelope<{ positionMode?: unknown }>(json);
            if (!data) return;
            // Leaves the "a failed read changes nothing" contract above
            // intact: only a read that actually produced a snapshot claims
            // the ordering slot.
            if (!accountReadOrder.mayApply(ticket)) return;

            ports.setPositionMode(
                typeof data.positionMode === "string" ? data.positionMode : undefined,
            );
        } catch (e) {
            logger.debug("api", "[TradeService] fetchPositionMode failed", e);
        }
    }

    /**
     * Leverage for one symbol, on the exchange (FEAT-0068).
     *
     * The range check against the pair's own `minLeverage`/`maxLeverage` is
     * the caller's — `marketState.symbolMeta` holds it and this service does
     * not read the UI's stores for validation. What is enforced here is that
     * the value is a whole number the endpoint can take.
     *
     * Confirmation comes from re-reading the exchange, not from the response
     * body: `fetchLeverageMarginMode` is what updates
     * `tradeState.remoteLeverage`, so the indicator turns green because the
     * exchange said so on a second, independent read.
     */
    async function changeLeverage(symbol: string, leverage: Decimal): Promise<void> {
        if (!leverage.isFinite() || !leverage.isInteger() || leverage.lte(0)) {
            throw new Error("apiErrors.invalidAmount");
        }
        // Leverage is already validated as finite, integer, and positive.
        // Converting to native number for the wire protocol.
        await accountSettingRequest(ports, {
            type: "change-leverage",
            symbol,
            leverage: +leverage,
        });
        await fetchLeverageMarginMode(symbol);
    }

    /**
     * Margin mode for one symbol (FEAT-0068). The exchange refuses this while
     * the symbol carries a position or a resting order; the UI disables the
     * control in that case, and the refusal below is what happens when the
     * two disagree.
     */
    async function changeMarginMode(
        symbol: string,
        marginMode: "ISOLATION" | "CROSS",
    ): Promise<void> {
        await accountSettingRequest(ports, { type: "change-margin-mode", symbol, marginMode });

        ports.setMarginModeVerifying(true);
        try {
            const outcome = await readBackUntilApplied(
                () => fetchLeverageMarginMode(symbol),
                () =>
                    normalizeMarginMode(ports.readRemoteMarginMode()) ===
                    normalizeMarginMode(marginMode),
            );
            if (outcome === "unconfirmed") ports.warnUnconfirmed();
        } finally {
            ports.setMarginModeVerifying(false);
        }
    }

    /**
     * Position mode for the whole futures account (FEAT-0068) — ONE_WAY or
     * HEDGE. Takes no symbol: the endpoint does not.
     *
     * Read back twice, on purpose.
     *
     * `fetchPositionMode()` is the one that must happen: it writes the field
     * the mode chip reads, and it belongs to this service, so it runs whether
     * or not anything else is on screen. `requestSync()` used to be the only
     * refresh here, and it is a *no-op* unless `PositionsSidebar` is mounted
     * to register the callback — so a trader with the sidebar hidden saw the
     * toast, the broker applied the change, and the chip kept the old value
     * until a reload (BUG-0410).
     *
     * `requestSync()` stays because the mode is reported on the account *and*
     * on every position, and both views have to stop disagreeing — but it is
     * now the extra, not the mechanism.
     *
     * Ordering is not load-bearing: overlapping account reads are sequenced
     * by `accountReadOrder` (BUG-0412), so whichever of the two lands last
     * cannot be an older answer than the one already applied.
     */
    async function changePositionMode(positionMode: "ONE_WAY" | "HEDGE"): Promise<void> {
        await accountSettingRequest(ports, { type: "change-position-mode", positionMode });

        ports.setPositionModeVerifying(true);
        try {
            const outcome = await readBackUntilApplied(
                () => fetchPositionMode(),
                () => (ports.readPositionMode() ?? "").toUpperCase() === positionMode,
            );
            if (outcome === "unconfirmed") ports.warnUnconfirmed();
        } finally {
            ports.setPositionModeVerifying(false);
        }

        ports.requestSync();
    }

    /**
     * Adds or withdraws margin on one isolated position (FEAT-0068). A
     * positive amount adds, a negative one withdraws — the exchange's own
     * convention, kept rather than split into two verbs so the sign the
     * trader sees is the sign that travels.
     *
     * Nothing is written optimistically. The position's new margin arrives on
     * the private WebSocket position channel, with `requestSync()` as the
     * fallback for a socket that is not connected.
     */
    async function adjustPositionMargin(params: {
        symbol: string;
        amount: Decimal;
        side?: "LONG" | "SHORT";
        positionId?: string;
    }): Promise<void> {
        const { symbol, amount, side, positionId } = params;
        if (!amount.isFinite() || amount.isZero()) {
            throw new Error("apiErrors.invalidAmount");
        }
        if (!side && !positionId) {
            throw new Error("apiErrors.invalidAmount");
        }
        // All financial calculations are complete; converting to string for the
        // wire protocol with full precision.
        const amountStr = amount.toFixed(amount.decimalPlaces() ?? 0);
        await accountSettingRequest(ports, {
            type: "adjust-position-margin",
            symbol,
            amount: amountStr,
            ...(side ? { side } : {}),
            ...(positionId ? { positionId } : {}),
        });
        ports.requestSync();
    }

    return {
        fetchLeverageMarginMode,
        fetchPositionMode,
        changeLeverage,
        changeMarginMode,
        changePositionMode,
        adjustPositionMargin,
    };
}