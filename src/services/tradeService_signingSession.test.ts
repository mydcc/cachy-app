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

/*
 * BUG-0551 — a write that crosses the signing boundary under a stale context.
 *
 * The transport resolves the provider, the account and the paper/live branch
 * synchronously, then `exchangeSignedFetch` awaits the WebCrypto digests
 * before it dispatches. A trader who switched account, venue or mode inside
 * that window used to get the write anyway — the live-to-paper case being the
 * one that costs money: a simulated order on screen, a live dispatch on the
 * wire.
 *
 * The harness holds the *signature* open rather than the fetch, because that
 * is the gap under test: `appFetch` is the network, and a request parked there
 * has already passed every check. `crypto.subtle.digest` is the first await
 * inside the real signer, so deferring it parks the request exactly between
 * the context read and the dispatch, with no module mocked away.
 *
 * `appFetch` itself is real here. The BUG-0551 guard rides its per-attempt
 * hook, so mocking it away would mock away the thing under test — and "no
 * network request" would become unfalsifiable, since the mock's own body would
 * be the boundary. The network assertion therefore sits on
 * `globalThis.fetch`, one layer down, where a byte leaving the device is a
 * `fetch` call and nothing else.
 *
 * The three accounts exist so a switch has somewhere to switch *to*: two on
 * Bitunix (a bare id change) and one on Bitget (a venue change, which also
 * changes which key signs).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Decimal } from "decimal.js";

vi.mock("$app/environment", () => ({ browser: true, dev: true }));

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const settings = vi.hoisted(() => ({
    apiProvider: "bitunix" as "bitunix" | "bitget",
    accounts: [
        {
            id: "bx-one",
            name: "Bitunix one",
            exchange: "bitunix" as const,
            keys: { key: "bx-one-key", secret: "bx-one-secret" },
        },
        {
            id: "bx-two",
            name: "Bitunix two",
            exchange: "bitunix" as const,
            keys: { key: "bx-two-key", secret: "bx-two-secret" },
        },
        {
            id: "bg-one",
            name: "Bitget one",
            exchange: "bitget" as const,
            keys: { key: "bg-one-key", secret: "bg-one-secret", passphrase: "bg-one-pass" },
        },
    ],
    activeAccountId: "bx-one",
    journalPaperTrades: true,
    // The real `appFetch` waits for these before its first attempt. A token is
    // present so it never takes the token-issuing branch — that one is pinned
    // in `appAuth.test.ts`.
    appAccessToken: "test-app-token",
    secretsReady: Promise.resolve(),
}));
vi.mock("../stores/settings.svelte", () => ({ settingsState: settings }));

vi.mock("./toastService.svelte", () => ({
    toastService: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

// `../lib/appAuth` is deliberately NOT mocked: the guard rides `appFetch`'s
// per-attempt hook, so a mocked `appFetch` would mock away the thing under
// test. The network boundary asserted on is `globalThis.fetch` instead.
import { tradeService } from "./tradeService";
import { accountEpoch } from "./accountEpoch.svelte";
import { paperTradingService } from "./paperTradingService";
import { paperState } from "../stores/paperTrading.svelte";
import { accountState } from "../stores/account.svelte";
import { tradeState } from "../stores/trade.svelte";
import { marketState } from "../stores/market.svelte";
import {
    registerKillSwitch,
    registerRiskLimitCheck,
    registerAuditRecorder,
    BOT_PAPER_ONLY_MESSAGE_KEY,
    type OrderAttempt,
} from "./orderGate";

/**
 * A well-formed manual entry, the same shape `tradeService.paperProvenance`
 * uses: 1000 USDT, 1 % risk, 500 stop distance → 0.02 BTC, so the gate's
 * re-derivation agrees and the request reaches the transport.
 */
function entryParams(origin: "manual" | "bot" = "manual") {
    return {
        symbol: "BTCUSDT",
        side: "BUY" as const,
        origin,
        orderType: "MARKET" as const,
        qty: new Decimal("0.02"),
        stopLoss: { price: new Decimal(49500) },
        displayed: {
            accountSize: new Decimal(1000),
            riskPercentage: new Decimal(1),
            entryPrice: new Decimal(50000),
            stopLossPrice: new Decimal(49500),
        },
    };
}

/** Held at the first digest until `releaseSigning()` — the signing boundary. */
let signingHeld = false;
let reachedSigning: () => void = () => {};
let releaseHeld: () => void = () => {};

/**
 * The one byte-level boundary: a `fetch` here is a request that left the
 * device, with nothing between it and the wire.
 */
const networkFetch = vi.fn(
    async (): Promise<Response> =>
        new Response(JSON.stringify({ code: "0", data: {} }), {
            status: 200,
            headers: { "content-type": "application/json" },
        }),
);

function holdSigning(): Promise<void> {
    signingHeld = true;
    return new Promise<void>((resolve) => {
        reachedSigning = resolve;
    });
}

function releaseSigning(): void {
    signingHeld = false;
    releaseHeld();
}

/**
 * Waits for the signer, failing loudly instead of hanging.
 *
 * The held digest is the only thing that resolves `reached`, so a request
 * refused before signing — a bypass, a key-shape error — would leave the test
 * to time out on a bare "Test timed out", naming neither. This message says
 * which half of the harness is wrong.
 */
async function waitForSigning(reached: Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const never = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new Error("the request never reached the signer")),
            2000,
        );
    });
    try {
        await Promise.race([reached, never]);
    } finally {
        clearTimeout(timer);
    }
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    settings.apiProvider = "bitunix";
    settings.activeAccountId = "bx-one";

    const realDigest = crypto.subtle.digest.bind(crypto.subtle);
    const gate = new Promise<void>((resolve) => {
        releaseHeld = resolve;
    });
    vi.spyOn(crypto.subtle, "digest").mockImplementation(async (algorithm, data) => {
        if (signingHeld) {
            signingHeld = false;
            reachedSigning();
            await gate;
        }
        return realDigest(algorithm, data);
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(networkFetch);
    networkFetch.mockClear();

    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    registerAuditRecorder(null);
    marketState.setSymbolMeta("BTCUSDT", {
        symbol: "BTCUSDT",
        basePrecision: 4,
        quotePrecision: 2,
        minTradeVolume: null,
        maxLimitOrderVolume: null,
        maxMarketOrderVolume: null,
        minLeverage: 1,
        maxLeverage: 125,
        defaultLeverage: 10,
        priceProtectScope: null,
        symbolStatus: "OPEN",
        isApiSupported: true,
    });
    paperState.reloadFromStorage();
    paperState.resetBook();
    paperTradingService.setEnabled(false);
    accountState.reset();
    tradeState.clearRemoteAccountState();
});

afterEach(() => {
    releaseSigning();
    paperTradingService.setEnabled(false);
    registerKillSwitch(null);
    registerRiskLimitCheck(null);
    registerAuditRecorder(null);
    vi.restoreAllMocks();
});

/**
 * Places an order, switches context while it is signing, then lets it go.
 *
 * The switch runs *after* the digest is reached, which is the only ordering
 * that reproduces the race: before it, the context read has not happened yet.
 */
async function placeAcrossSwitch(switchContext: () => void) {
    const reached = holdSigning();
    const placed = tradeService.placeOrder(entryParams()).then(
        (result) => ({ sent: true as const, result }),
        (error: unknown) => ({ sent: false as const, error }),
    );
    await waitForSigning(reached);
    switchContext();
    releaseSigning();
    return placed;
}

function refusalOf(outcome: Awaited<ReturnType<typeof placeAcrossSwitch>>) {
    if (outcome.sent) throw new Error("expected a refusal, the order was sent");
    return (outcome.error as { refusal?: { field: string; messageKey: string } }).refusal;
}

describe("BUG-0551 — a write signed under a switched context is refused", () => {
    it("sends nothing when paper trading is switched on mid-signing", async () => {
        const outcome = await placeAcrossSwitch(() => paperTradingService.setEnabled(true));

        expect(networkFetch).not.toHaveBeenCalled();
        expect(refusalOf(outcome)).toMatchObject({
            field: "mode",
            messageKey: "orderGate.sessionChanged",
        });
    });

    it("sends nothing to the previous account when the account is switched mid-signing", async () => {
        // The switch a `settingsState` write performs: the id changes, and
        // nothing rotates the session on that path.
        const outcome = await placeAcrossSwitch(() => {
            settings.activeAccountId = "bx-two";
        });

        expect(networkFetch).not.toHaveBeenCalled();
        expect(refusalOf(outcome)).toMatchObject({
            field: "account",
            messageKey: "orderGate.sessionChanged",
        });
    });

    it("sends nothing to the previous exchange when the venue is switched mid-signing", async () => {
        const outcome = await placeAcrossSwitch(() => {
            settings.apiProvider = "bitget";
            settings.activeAccountId = "bg-one";
            accountEpoch.rotate("venue-switch");
        });

        expect(networkFetch).not.toHaveBeenCalled();
        expect(refusalOf(outcome)).toMatchObject({
            field: "exchange",
            messageKey: "orderGate.sessionChanged",
        });
    });

    it("refuses a session that rotated and came back, naming the rotation", async () => {
        // Every field reads the same again, so only the session token can see
        // this one. It is the case the field comparison alone would miss.
        const outcome = await placeAcrossSwitch(() => {
            settings.activeAccountId = "bx-two";
            accountEpoch.rotate("account-switch");
            settings.activeAccountId = "bx-one";
        });

        expect(networkFetch).not.toHaveBeenCalled();
        expect(refusalOf(outcome)).toMatchObject({
            field: "session",
            messageKey: "orderGate.sessionRotated",
        });
    });

    it("still dispatches an order whose context never moved", async () => {
        const reached = holdSigning();
        const placed = tradeService.placeOrder(entryParams());
        await waitForSigning(reached);
        releaseSigning();
        await placed;

        expect(networkFetch).toHaveBeenCalledTimes(1);
    });

    it("leaves a read-only request on its exact behaviour", async () => {
        // No `type`/`action` means no write, so the guard stays out of it:
        // a stale read is dropped at the store (BUG-0412, BUG-0419), not here.
        const reached = holdSigning();
        const read = tradeService.fetchPositionMode().catch(() => undefined);
        await waitForSigning(reached);
        settings.activeAccountId = "bx-two";
        accountEpoch.rotate("account-switch");
        releaseSigning();
        await read;

        expect(networkFetch).toHaveBeenCalledTimes(1);
    });

    it("records the mode switch in the audit trail, not just the refusal", async () => {
        // Nothing was sent, so no console line would ever mention this. The
        // audit entry is the only place the attempt stays visible.
        const attempts: OrderAttempt[] = [];
        registerAuditRecorder((attempt) => attempts.push(attempt));

        await placeAcrossSwitch(() => paperTradingService.setEnabled(true));

        expect(attempts).toHaveLength(1);
        expect(attempts[0]).toMatchObject({
            outcome: "refused",
            action: "place-order",
            refusal: {
                field: "mode",
                messageKey: "orderGate.sessionChanged",
                values: { expected: "live", actual: "paper" },
            },
        });
    });

    it("sends no account-settings write when paper is switched on mid-signing", async () => {
        // `/api/account-settings` has its own transport lane — the one write
        // path that does not go through `signedRequest` — and it had the same
        // gap. Switching position mode on the live account while the UI shows
        // paper is the same deception as an order.
        const reached = holdSigning();
        const changed = tradeService.changePositionMode("ONE_WAY").then(
            () => ({ sent: true as const }),
            (error: unknown) => ({ sent: false as const, error }),
        );
        await waitForSigning(reached);
        paperTradingService.setEnabled(true);
        releaseSigning();
        const outcome = await changed;

        expect(networkFetch).not.toHaveBeenCalled();
        // The message key, not just the field: `assertGatePass`'s own paperMode
        // check would also report `field: "mode"`, so only the key says this
        // refusal came from the guard rather than from the gate.
        expect(
            (outcome as { error?: { refusal?: { field: string; messageKey: string } } }).error
                ?.refusal,
        ).toMatchObject({
            field: "mode",
            messageKey: "orderGate.sessionChanged",
        });
    });

    it("keeps the bot paper-only refusal ahead of this one", async () => {
        // BUG-0494's refusal is raised before the transport context is even
        // read, so a bot order with paper off still names its own cause.
        await expect(
            tradeService.placeOrder(entryParams("bot")),
        ).rejects.toMatchObject({ refusal: { messageKey: BOT_PAPER_ONLY_MESSAGE_KEY } });

        expect(networkFetch).not.toHaveBeenCalled();
    });
});
