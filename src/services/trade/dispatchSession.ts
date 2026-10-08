/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

/**
 * The rule that refuses a request whose dispatch context moved while it was
 * being signed — extracted from tradeService.ts (FEAT-0342).
 *
 * The reads it needs are injected rather than imported: a service must not
 * reach into stores (see eslint.architecture.boundaries.js), and the rule is
 * worth owning independently of where the state lives. What arrives here is
 * "what is the context right now" and "is this session still current"; what
 * leaves is a fetch wrapper that refuses when they no longer match.
 */

import { appFetch } from "../../lib/appAuth";
import type { AccountSession } from "../accountEpoch.svelte";
import { OrderRefusedError, type TransportContext } from "../orderGate";

/** The part of a transport context that a switch can move. */
export type DispatchContext = Pick<
    TransportContext,
    "provider" | "accountFingerprint" | "accountId" | "paperMode"
>;

/** Reads the context a request would be sent under, right now. */
export type DispatchContextReader = () => DispatchContext;

/**
 * Whether the account session a request was built for is still the current
 * one. Catches a rotation whose context fields came back unchanged.
 */
export type SessionCurrentCheck = (session: AccountSession) => boolean;

/** Wraps `fetch` so a request whose context moved under the signing await throws. */
export type DispatchUnderSession = (
    session: AccountSession,
    expected: DispatchContext,
) => (input: string, init?: RequestInit) => Promise<Response>;

/**
 * BUG-0551 — the last check before a write leaves the device.
 *
 * Everything the transport decides is decided synchronously: the provider,
 * the account whose keys sign the request, the paper/live branch. The one
 * thing that is not is signing itself — `exchangeSignedFetch` awaits the
 * WebCrypto digests before it dispatches — and a trader who switches account,
 * venue or mode inside that window used to get the write anyway. The
 * live-to-paper case is the one that costs real money: the UI shows a
 * simulated order while the live branch, chosen before the switch, dispatches
 * it.
 *
 * `assertGatePass` cannot see it. That check answers "does the account
 * the transport resolved still match what the gate approved", and it reads
 * both sides in the same synchronous block — a switch that happens one await
 * later is invisible to it.
 *
 * So the context is read once, kept, and compared again at the point where
 * the bytes go out. Two layers, because they fail differently: the session
 * token catches a rotation whose fields came back unchanged (switch away and
 * back while signing), and the field comparison catches a context write that
 * never rotated one.
 *
 * The check rides `appFetch`'s per-attempt hook rather than this wrapper's
 * body. Signing is not the last await in the dispatch path: `appFetch` awaits
 * the token restore, may issue a token, and on a client-token 401 issues
 * another and tries again — and that retry is the attempt that reaches the
 * venue. A check here would run once, before all of it.
 *
 * Read-only requests are deliberately untouched. A read that crosses the
 * boundary is stale, not dangerous — it cannot dispatch a write. Three of the
 * read lanes take a read-order ticket and drop a late answer at the store
 * write: the leverage read, and both account reads (`/api/account` for the
 * position mode and the account itself). The two position-list reads —
 * `/api/sync/positions-pending` and `/api/positions` — take none, and
 * BUG-0419 owns that gap. Refusing reads here would turn every account switch
 * into an error in the polling paths for no safety gain.
 */
export function createSessionDispatch(
    readContext: DispatchContextReader,
    isCurrentSession: SessionCurrentCheck,
): DispatchUnderSession {
    /**
     * Whether the write may still go out, and throws the named refusal if not.
     *
     * Split from the wrapper so the rule is readable on its own: the
     * hook is the seam, this is what it enforces.
     */
    function assertSessionIntact(session: AccountSession, expected: DispatchContext): void {
        const current = readContext();
        // Both layers, in this order. The session token catches a rotation whose
        // fields came back unchanged; the field comparison then catches a context
        // write that never rotated one — `settingsState` setters do not.
        if (isCurrentSession(session) && sameDispatchContext(current, expected)) return;
        throw sessionChangedRefusal(expected, current);
    }

    return function dispatchUnderSession(
        session: AccountSession,
        expected: DispatchContext,
    ): (input: string, init?: RequestInit) => Promise<Response> {
        return (input, init) =>
            appFetch(input, init, () => assertSessionIntact(session, expected));
    };
}

/**
 * The refusal for a context that moved under the signing await.
 *
 * Named after what actually changed rather than "invalid request": a mode
 * flip, a venue switch and an account switch are three different mistakes,
 * and the trader reading the toast is the one who has to know which one
 * happened.
 */
function sessionChangedRefusal(
    expected: DispatchContext,
    current: DispatchContext,
): OrderRefusedError {
    const changed = (
        field: string,
        from: string | undefined,
        to: string | undefined,
    ): OrderRefusedError =>
        new OrderRefusedError({
            field,
            reason: "mismatch",
            messageKey: "orderGate.sessionChanged",
            values: { field, expected: from ?? "—", actual: to ?? "—" },
        });

    if (current.provider !== expected.provider) {
        return changed("exchange", expected.provider, current.provider);
    }
    if (current.paperMode !== expected.paperMode) {
        return changed(
            "mode",
            expected.paperMode ? "paper" : "live",
            current.paperMode ? "paper" : "live",
        );
    }
    if (current.accountId !== expected.accountId) {
        return changed("account", expected.accountId, current.accountId);
    }
    if (current.accountFingerprint !== expected.accountFingerprint) {
        return changed("account", expected.accountFingerprint, current.accountFingerprint);
    }
    // The session rotated while every field it describes reads the same: the
    // trader went to another account and came back, or the credentials were
    // re-entered. The request would technically be safe, but nothing about it
    // was verified against the context on screen now, so it is refused.
    //
    // Its own message rather than a field mismatch, because there is no field
    // to name: naming one would point the trader at the account or the switch
    // when neither is what moved, and interpolating the rotation counter would
    // put an internal sequence number in front of them. `accountEpoch.rotate`
    // already logs the sequence it moved to.
    return new OrderRefusedError({
        field: "session",
        reason: "mismatch",
        messageKey: "orderGate.sessionRotated",
        values: { field: "session" },
    });
}

function sameDispatchContext(a: DispatchContext, b: DispatchContext): boolean {
    return (
        a.provider === b.provider &&
        a.accountId === b.accountId &&
        a.accountFingerprint === b.accountFingerprint &&
        a.paperMode === b.paperMode
    );
}
