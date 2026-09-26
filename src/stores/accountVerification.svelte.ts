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
 * Private-account verification state — BUG-0560.
 *
 * The bug: a credential card was green whenever its three input fields were
 * nonempty, and the order button was live whenever the calculator had a size.
 * Neither asked the exchange. A user could paste a revoked key, see green, and
 * only learn the truth when an order was rejected.
 *
 * What already existed and was not enough: `PositionsSidebar` keeps a local
 * `errorAccount` from its `/api/account` read and shows it in `AccountSummary`.
 * That is a real private-account signal, but it is component state — invisible
 * to the settings card, invisible to the order panel, and gone when the
 * sidebar unmounts (it renders only while `showSidebars` is on). So the
 * question "do these credentials work?" had an answer in the codebase that
 * almost nothing could read.
 *
 * This store is that answer, promoted to account-scoped shared state. It owns
 * *what we know*, not *what we fetch*: `PositionsSidebar` reports the verdict of
 * the read it already performs, and `verifyAccount` below only issues a read of
 * its own when nothing else is going to report one (hidden sidebars, or a
 * trader who never opens the positions panel).
 *
 * Three deliberate boundaries:
 *
 * - **No secret ever reaches this file.** The record keeps a
 *   `credentialFingerprint` — first/last characters and length of the
 *   concatenated credential fields, in the shape `orderGate.accountFingerprint`
 *   already established for the BUG-0551 dispatch guard. It answers "are these
 *   the same credentials this verdict was about" without being able to answer
 *   "what are the credentials", and it is a display-grade digest: two different
 *   key sets that share a first four, a last four and a length in all three
 *   fields would compare equal. That is a UI trust signal, not a crypto
 *   boundary, and the failure direction is safe — a false match keeps a stale
 *   *verified* verdict only for a key set the user is actively editing, whose
 *   next read replaces the verdict anyway.
 * - **Paper mode never consults this.** The simulated book is local and needs
 *   no credentials (AC5); `statusFor` is not asked in paper mode, and
 *   `verifyAccount` returns immediately when the feed is active.
 * - **Freshness is computed, not stored.** `stale` is derived from `checkedAt`
 *   against `VERIFICATION_FRESH_MS`, so a verdict cannot stay green forever by
 *   sitting still. Nothing polls: the consumer that needs a live verdict asks
 *   for one (`ensureCurrent`), which is why staleness is safe to derive.
 */

import { appFetch } from "../lib/appAuth";
import { unwrapApiEnvelope } from "../utils/utils";
import { exchangeSignedFetch } from "../utils/exchange/browserSigning";
import { buildAccountQueryParams } from "../utils/exchange/venueQueries";
import { accountEpoch } from "../services/accountEpoch.svelte";
import { settingsState, type ApiKeys } from "./settings.svelte";
import { paperAccountFeed } from "../services/paperAccountFeed";
import {
    activeAccountFor,
    type ExchangeAccount,
    type ExchangeProvider,
} from "./settings/accounts";

/**
 * How long a `verified` verdict stays current.
 *
 * One signed account read per this window, per account, and only when someone
 * asks. It bounds how long a key revoked *after* a successful read can still
 * show green — the same order of staleness the market-data badges elsewhere in
 * the app accept for a value that has stopped updating.
 */
export const VERIFICATION_FRESH_MS = 5 * 60_000;

/**
 * What we know about one account's credentials.
 *
 * `unconfigured` is the absence of input, `rejected` is a verdict, and the
 * remaining three describe a verdict that is or was true. Only `verified`
 * authorises anything.
 */
export type AccountVerificationStatus =
    | "unconfigured"
    | "verifying"
    | "verified"
    | "rejected"
    | "stale";

/** What one account's credentials are currently worth. */
export interface AccountVerificationRecord {
    status: AccountVerificationStatus;
    /** Which credential set this verdict belongs to. See the file note. */
    credentialFingerprint: string;
    /** When the last read settled, or `null` if none ever did. */
    checkedAt: number | null;
    /**
     * Why the last read did not verify, kept apart from `status` because the
     * two failures deserve different words: a venue that answered "these
     * credentials are not acceptable" is a different fact from a network drop
     * that never reached an answer at all (AC3). Only one of them is the
     * trader's mistake.
     */
    failure?: AccountVerificationFailure;
    /** The venue's error code, when it named one. */
    errorCode?: string | number;
}

/** Why a read failed, as far as the app can tell. */
export type AccountVerificationFailure = "rejected" | "unreachable";

/** What `statusFor` needs; the caller resolves it from settings either way. */
export interface VerificationSubject {
    id: string;
    exchange: ExchangeProvider;
    keys: ApiKeys;
}

/**
 * Display-grade identity of a credential set.
 *
 * Deliberately the weakest thing that still detects an edit, and deliberately
 * not a hash: `crypto.subtle` is async, and this has to answer synchronously
 * inside a `$derived`. See the file note for what that costs.
 */
export function credentialFingerprint(keys: ApiKeys): string {
    // Plain ASCII on purpose: this string is stored, compared and never shown,
    // and a control character in a value that outlives a session is a trap.
    const material = `${keys.key}|${keys.secret}|${keys.passphrase ?? ""}`;
    if (material.length === 0) return "none";
    if (material.length <= 8) return `short-${material.length}`;
    return `${material.slice(0, 4)}..${material.slice(-4)}#${material.length}`;
}

/**
 * Whether the fields are complete enough to sign with.
 *
 * Mirrors what the transports already require (Bitget additionally needs the
 * passphrase) so a card cannot read "unconfigured" for a credential set every
 * request would reject.
 */
export function hasCompleteCredentials(keys: ApiKeys, exchange: ExchangeProvider): boolean {
    if (!keys.key || !keys.secret) return false;
    return exchange !== "bitget" || Boolean(keys.passphrase);
}

/** The account a component is asking about, resolved from settings. */
export function subjectFor(exchange?: ExchangeProvider): VerificationSubject | null {
    const provider = exchange || settingsState.apiProvider || "bitunix";
    const account: ExchangeAccount | undefined = activeAccountFor(
        settingsState.accounts,
        settingsState.activeAccountId,
        provider,
    );
    if (!account) return null;
    return { id: account.id, exchange: account.exchange, keys: account.keys };
}

function recordKey(subject: VerificationSubject): string {
    return `${subject.exchange}:${subject.id}`;
}

class AccountVerificationStore {
    /** Keyed per account: a verdict belongs to the account it was about. */
    records = $state<Record<string, AccountVerificationRecord>>({});

    /**
     * Whether a read for this account is already on its way.
     *
     * The sidebar sets this while its own `/api/account` read is in flight, so
     * `verifyAccount` knows there is a verdict coming and does not spend a
     * second request on the same answer. Cleared by whoever set it.
     */
    reported = $state<Record<string, boolean>>({});

    /**
     * The current status of one account's credentials.
     *
     * Derived from the stored record plus two things the record cannot know on
     * its own: whether the fields are complete at all, and whether the verdict
     * still belongs to the credentials now in the inputs. A record whose
     * fingerprint no longer matches is `stale` — that is the "key edit returns
     * the state to unverified" half of AC2, and it holds even if nothing has
     * refetched yet.
     */
    statusFor(subject: VerificationSubject | null): AccountVerificationStatus {
        if (!subject) return "unconfigured";
        if (!hasCompleteCredentials(subject.keys, subject.exchange)) return "unconfigured";

        const record = this.records[recordKey(subject)];
        if (!record) return "unconfigured";
        if (record.status === "verifying" || record.status === "rejected") return record.status;
        // A `verified` verdict about different credentials is not evidence about
        // these ones, and an expired one is not evidence about now.
        if (record.credentialFingerprint !== credentialFingerprint(subject.keys)) {
            return "stale";
        }
        if (
            record.checkedAt !== null &&
            Date.now() - record.checkedAt <= VERIFICATION_FRESH_MS
        ) {
            return "verified";
        }
        return "stale";
    }

    /** The raw record, for a component that wants the venue's error code. */
    recordFor(subject: VerificationSubject | null): AccountVerificationRecord | null {
        if (!subject) return null;
        return this.records[recordKey(subject)] ?? null;
    }

    /**
     * Announce that a read is in flight and will record its own verdict.
     *
     * `verifyAccount` consults this to avoid spending a second request on an
     * answer that is already on its way. The returned release is idempotent
     * and must be called in a `finally`: a read that early-returns — dropped by
     * a session rotation, or outranked by a newer one — records nothing, and a
     * claim left behind would suppress every future verification.
     *
     * Deliberately *not* the same thing as "this caller will report". A read
     * may be coalesced away by `accountFetchSingleflight` and never reach its
     * verdict at all, so recording is done by whichever caller actually
     * performed the read. Coupling the two would let a claim holder that never
     * reads leave the account stuck in `verifying`.
     */
    claimVerification(subject: VerificationSubject): () => void {
        const key = recordKey(subject);
        this.reported[key] = true;
        this.markVerifying(subject);

        let released = false;
        return () => {
            if (released) return;
            released = true;
            this.reported[key] = false;
        };
    }

    /** Whether a read that will record a verdict is already in flight. */
    isVerificationInFlight(subject: VerificationSubject): boolean {
        return this.reported[recordKey(subject)] === true;
    }

    /**
     * Whether a verdict newer than `startedAt` already landed.
     *
     * A read that started earlier must not overwrite one that finished later,
     * even inside the same account session — otherwise the last response to
     * arrive wins, and "last to arrive" is not "most correct". Only a settled
     * verdict supersedes; an in-flight one has nothing to compare against yet.
     */
    isSuperseded(subject: VerificationSubject, startedAt: number): boolean {
        const record = this.records[recordKey(subject)];
        if (!record) return false;
        if (record.status === "verifying") return false;
        return record.checkedAt !== null && record.checkedAt > startedAt;
    }

    /** Mark the account as being read right now. */
    markVerifying(subject: VerificationSubject): void {
        const key = recordKey(subject);
        const previous = this.records[key];
        this.records[key] = {
            status: "verifying",
            credentialFingerprint: credentialFingerprint(subject.keys),
            // Kept, not cleared: a `verifying` state that has never settled has
            // no timestamp of its own, and the fingerprint above is what binds
            // the eventual verdict to these credentials.
            checkedAt: previous?.checkedAt ?? null,
            failure: undefined,
            errorCode: undefined,
        };
    }

    /** The read succeeded: these credentials work. */
    recordSuccess(subject: VerificationSubject, at: number = Date.now()): void {
        const key = recordKey(subject);
        this.records[key] = {
            status: "verified",
            credentialFingerprint: credentialFingerprint(subject.keys),
            checkedAt: at,
            failure: undefined,
            errorCode: undefined,
        };
    }

    /**
     * The read failed. `rejected` is the venue naming a credential problem,
     * `unreachable` is everything else — a network drop says nothing about
     * whether the key is good, and saying so is what made this bug possible in
     * the first place. Both land on the same status, because the only thing a
     * caller may act on is "not verified"; the distinction survives in
     * `failure` so the message can be honest about whose problem it is.
     */
    recordFailure(
        subject: VerificationSubject,
        failure: AccountVerificationFailure,
        errorCode?: string | number,
        at: number = Date.now(),
    ): void {
        const key = recordKey(subject);
        this.records[key] = {
            status: "rejected",
            credentialFingerprint: credentialFingerprint(subject.keys),
            checkedAt: at,
            failure,
            errorCode,
        };
    }

    /**
     * Drop every verdict.
     *
     * Called when the account session rotates: the accounts the old verdicts
     * were about are no longer the ones on screen, and a switch back must not
     * find a green dot waiting for it.
     */
    invalidateAll(): void {
        this.records = {};
        this.reported = {};
    }

    /** Test-only: forget everything between cases. */
    resetForTest(): void {
        this.invalidateAll();
    }
}

export const accountVerification = new AccountVerificationStore();

/**
 * Read the active account's private state and record the verdict.
 *
 * The fallback, not the primary path: `PositionsSidebar` reports the verdict of
 * the read it already performs (`beginReport`/`recordSuccess`/`recordFailure`),
 * and this returns without spending a request when a report is already on its
 * way. It earns its keep in the two cases where no report is coming — the
 * sidebars are hidden (`PositionsSidebar` renders only under `showSidebars`),
 * or a trader who never opens the positions panel.
 *
 * Least privilege by construction: it asks `/api/account`, the same
 * balance-shaped read the sidebar makes, and it uses the account's own
 * credentials through the same signed proxy path. It places no order, reads no
 * position, and sends the secret nowhere the sidebar's read would not.
 */
export async function verifyAccount(exchange?: ExchangeProvider): Promise<void> {
    if (paperAccountFeed()) return;

    const subject = subjectFor(exchange);
    if (!subject) return;
    if (!hasCompleteCredentials(subject.keys, subject.exchange)) return;

    if (accountVerification.isVerificationInFlight(subject)) return;

    const session = accountEpoch.current();
    // The epoch guard covers an account switch, not a competing read inside the
    // same session: if the sidebar's read starts here and finishes first, this
    // older response must not overwrite the newer verdict. The read's own start
    // time is what distinguishes them.
    const startedAt = Date.now();
    accountVerification.markVerifying(subject);

    try {
        const response = await exchangeSignedFetch({
            cachyPath: "/api/account",
            keys: {
                apiKey: subject.keys.key,
                apiSecret: subject.keys.secret,
                passphrase: subject.keys.passphrase,
            },
            venue: subject.exchange,
            payload: { exchange: subject.exchange },
            queryParams: buildAccountQueryParams(subject.exchange),
            headers: { "X-Provider": subject.exchange },
            fetchFn: appFetch,
        });

        // Asked after the last `await` and before anything is written, so a
        // verdict from a session the user has already left is dropped instead of
        // describing the account now on screen. Same rule, same reason as the
        // BUG-0551 dispatch guard and the BUG-0412 read ticket.
        if (!accountEpoch.isCurrent(session)) return;
        if (accountVerification.isSuperseded(subject, startedAt)) return;

        const json = await response.json();
        const { data, code } = unwrapApiEnvelope<unknown>(json);
        if (data === null) {
            accountVerification.recordFailure(subject, "rejected", code);
            return;
        }
        accountVerification.recordSuccess(subject);
    } catch (error) {
        if (!accountEpoch.isCurrent(session)) return;
        if (accountVerification.isSuperseded(subject, startedAt)) return;
        // A thrown error is transport, not a verdict: the venue never answered,
        // so this records "unreachable" rather than pretending the key was
        // judged. The status stays `rejected` either way — both mean "not
        // verified", which is the only thing a caller may act on.
        accountVerification.recordFailure(
            subject,
            "unreachable",
            error instanceof Error ? error.message : undefined,
        );
    }
}

/**
 * Make sure the active account has a current verdict, reading if it does not.
 *
 * The entry point for consumers that need to gate on it: cheap when a verdict
 * is current or in flight, one read when it is missing, expired or about
 * different credentials.
 */
export async function ensureCurrent(exchange?: ExchangeProvider): Promise<void> {
    const subject = subjectFor(exchange);
    if (!subject) return;
    if (!hasCompleteCredentials(subject.keys, subject.exchange)) return;
    if (accountVerification.statusFor(subject) === "verified") return;
    await verifyAccount(exchange);
}
