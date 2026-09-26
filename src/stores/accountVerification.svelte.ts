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
 *   `credentialFingerprint` — a 32-bit FNV-1a digest of the concatenated
 *   credential fields, in the spirit of `orderGate.accountFingerprint`, which
 *   established the same idea for the BUG-0551 dispatch guard. It answers "are
 *   these the same credentials this verdict was about" without being able to
 *   answer "what are the credentials". It is deliberately not a crypto
 *   boundary: 32 bits collide by the birthday bound after ~65k distinct key
 *   sets, and it protects no secret — it only detects an edit. The failure
 *   direction is safe, because a false match keeps a *verified* verdict alive
 *   only for a key set whose next read replaces that verdict anyway.
 * - **Paper mode never consults this.** The simulated book is local and needs
 *   no credentials (AC5); `statusFor` is not asked in paper mode, and
 *   `verifyAccount` returns immediately when the feed is active.
 * - **Freshness is computed, not stored.** `stale` is derived from `checkedAt`
 *   against `VERIFICATION_FRESH_MS`, so a verdict cannot stay green forever by
 *   sitting still. No verdict is re-read on a timer: a cheap clock tick
 *   (`startClock`) is all it takes to make the comparison re-evaluate, and the
 *   consumer that needs a live verdict asks for one (`ensureCurrent`). The tick
 *   exists because `Date.now()` is not a reactive dependency — without it the
 *   derived comparison would never run again after the first render, and a
 *   green dot would outlive its window.
 */

import { appFetch } from "../lib/appAuth";
import { unwrapApiEnvelope } from "../utils/utils";
import { exchangeSignedFetch } from "../utils/exchange/browserSigning";
import { buildAccountQueryParams } from "../utils/exchange/venueQueries";
import { accountEpoch } from "../services/accountEpoch.svelte";
import { settingsState, type ApiKeys } from "./settings.svelte";
import { paperAccountFeed } from "../services/paperAccountFeed";
import { logger } from "../services/logger";
import { correctedNow } from "../utils/exchange/clockDrift";
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
 * How soon a *non*-`verified` account may be read again.
 *
 * `ensureCurrent` only short-circuits on `verified`, so a `rejected` or
 * `unreachable` account is re-read every time a consumer's effect re-runs — and
 * those effects read the credential fields, so typing into a key field fires one
 * per keystroke. Without a floor, a wrong key becomes a request loop, and a
 * half-typed one becomes a loop per character.
 *
 * Bounds the repeat, not the possibility of a fresh read: a rotated key in an
 * already-filled credential set, or a verdict that has expired, is read straight
 * away. See `isCoolingDown`, which is where the two cases are told apart.
 */
export const RETRY_FLOOR_MS = 15_000;

/**
 * How long a consumer waits after a credential field changes before asking.
 *
 * The credential inputs are text fields, and the panel watches all three, so
 * every keystroke re-runs its effect. Each one is a different fingerprint as far
 * as the store is concerned — a rotated key and a key mid-word are the same
 * event — and a read is a signed request, so the cost of asking on every
 * character is a request per character. Long enough that a pasted or typed
 * credential produces one read at the end of it rather than one per keypress,
 * short enough that the verdict still feels immediate.
 *
 * A consumer's choice, not the store's: the store holds no timers, and a
 * consumer that watches something other than a text field can ask directly.
 */
export const VERIFICATION_INPUT_DEBOUNCE_MS = 400;

/**
 * How often the store's clock advances so freshness can expire on its own.
 *
 * Cheap on purpose: it moves one number, reads no venue, and decides nothing.
 * It exists only because `Date.now()` is not a reactive dependency in Svelte 5.
 */
export const CLOCK_TICK_MS = 30_000;

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
     * When a read for this account was last *started*, settled or not.
     *
     * `isCoolingDown` reads this to hold off a repeat. It is stamped at issue
     * time rather than settle time so a read that is still in flight also
     * suppresses a second one.
     */
    lastAttemptAt: number | null;
    /**
     * Which credential set that last attempt was for.
     *
     * Read next to `lastAttemptAt`, because a floor on "a read recently ran" is
     * the wrong question: a *different* key deserves its own read immediately,
     * and only a repeat of the same one should wait.
     */
    attemptFingerprint?: string;
    /**
     * The read that produced this verdict, by sequence number.
     *
     * Ordering runs on this rather than on `checkedAt`: wall-clock stamps make
     * "started earliest" and "settled last" the same field, so an older read
     * that settles late would suppress every newer verdict. A monotonic counter
     * has no such ambiguity, and it cannot tie.
     */
    settledSeq?: number;
    /**
     * Why the last read did not verify, kept apart from `status` because the
     * two failures deserve different words: a venue that answered "these
     * credentials are not acceptable" is a different fact from a network drop
     * that never reached an answer at all (AC3). Only one of them is the
     * trader's mistake.
     */
    failure?: AccountVerificationFailure;
    /**
     * The venue's error code, when it named one.
     *
     * The *venue's* code and nothing else.
     *
     * A thrown `TypeError` from the transport is not one, so that goes to the
     * log at the catch site instead — the distinction is why this field may
     * exist at all: it is the venue's own answer, not ours.
     *
     * No message renders it yet, and that is a deliberate gap rather than an
     * oversight. The card shows a translated refusal, and a bare `10001` helps
     * nobody; what would help is a mapped one. It stays because it is the input
     * such a message needs, and a venue code is safe to render once it has one —
     * unlike the transport text, which is ours and never will be.
     */
    errorCode?: string | number;
}

/** What a read reports when it settles. */
export interface VerificationOutcome {
    /**
     * The credentials the request was signed with, snapshotted at issue time.
     *
     * Required, and deliberately not defaulted: `subject.keys` is a live
     * `$state` proxy, so reading it after the `await` hashes whatever the user
     * has typed *since* — which would stamp a `verified` verdict onto a key the
     * venue never saw. The caller owns this value because the caller is the only
     * place that knows which strings it actually signed.
     */
    fingerprint: string;
    /** The sequence number `readIssued` handed out for this read. */
    seq: number;
    /** When it settled. Defaults to now. */
    at?: number;
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
 * FNV-1a over the three credential fields, synchronously — `crypto.subtle` is
 * async and this has to answer inside a `$derived`. A hash rather than a
 * slice of the material, because a slice cannot tell `"a"/"b"` from `"x"/"y"`:
 * two different short key sets produced the same string, so rotating between
 * them would have left a `verified` verdict standing. The stored value is hex
 * plus a length, so it is plain ASCII that outlives a session safely and shows
 * nothing of the secret.
 *
 * See the file note for what 32 bits do and do not buy.
 */
export function credentialFingerprint(keys: ApiKeys): string {
    const material = `${keys.key}|${keys.secret}|${keys.passphrase ?? ""}`;
    let hash = 0x811c9dc5;
    for (let index = 0; index < material.length; index++) {
        hash ^= material.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${hash.toString(16)}#${material.length}`;
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
     * The reads for this account that are still on their way, by sequence
     * number.
     *
     * The sidebar sets one while its own `/api/account` read is in flight, so
     * `verifyAccount` knows a verdict is coming and does not spend a second
     * request on the same answer. The sidebar's read and the fallback read can
     * overlap legitimately, so this is a list and not a flag: with a flag, the
     * first of them to finish would clear the claim while the other was still
     * outstanding. And it is keyed by sequence rather than counted, because
     * `invalidateAll` empties it on a session rotation — a release arriving
     * afterwards belongs to a read that is no longer part of this store's
     * world, and a counter would take the *new* read's claim down with it.
     */
    private claims = $state<Record<string, number[]>>({});

    /**
     * The store's notion of now, advanced by `startClock`.
     *
     * `statusFor` derives freshness from `checkedAt` against this, and a
     * comparison against `Date.now()` would never re-run: `Date.now()` is not a
     * reactive dependency, so the derived would keep returning the answer it
     * computed on first render and a `verified` verdict would outlive its
     * window by however long the tab stayed open. Reading `$state` here is what
     * makes the tick land.
     */
    private clock = $state(correctedNow());

    /**
     * Hands out read numbers, in issue order.
     *
     * Monotonic by construction, so two reads can never compare equal however
     * fast they run — which a wall-clock comparison could.
     */
    private seq = 0;

    /**
     * Advance the clock until the returned function is called.
     *
     * One long-lived component owns this. It spends no request and learns
     * nothing; it exists so an expired verdict can become `stale` on its own and
     * let the consumer that needs one ask for a fresh read.
     */
    startClock(intervalMs: number = CLOCK_TICK_MS): () => void {
        const handle = setInterval(() => {
            this.clock = correctedNow();
        }, intervalMs);
        return () => clearInterval(handle);
    }

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
        // Asked before the status, and for every status. A verdict is evidence
        // about one credential set only: a `rejected` recorded for the old key
        // says nothing about the one now in the inputs, so answering `rejected`
        // first would name the venue's verdict on a key it was never shown.
        if (record.credentialFingerprint !== credentialFingerprint(subject.keys)) {
            return "stale";
        }
        if (record.status === "verifying" || record.status === "rejected") return record.status;
        // An expired one is not evidence about now.
        if (
            record.checkedAt !== null &&
            Math.max(0, this.clock - record.checkedAt) <= VERIFICATION_FRESH_MS
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
     * Announce a read, and take the number that will order its verdict.
     *
     * `fingerprint` is the caller's snapshot of the credentials it is about to
     * sign with — not this store's reading of them, because `subject.keys` is a
     * live `$state` proxy the trader can retype while the request is in flight.
     *
     * The returned release is idempotent and must be called in a `finally`: a
     * read that early-returns — dropped by a session rotation, or outranked by
     * a newer one — records nothing, and a claim left behind would suppress
     * every future verification.
     *
     * Deliberately *not* the same thing as "this caller will report". A read
     * may be coalesced away by `accountFetchSingleflight` and never reach its
     * verdict at all, so recording is done by whichever caller actually
     * performed the read. Coupling the two would let a claim holder that never
     * reads leave the account stuck in `verifying`.
     */
    readIssued(subject: VerificationSubject, fingerprint: string): { seq: number; release: () => void } {
        const key = recordKey(subject);
        const seq = ++this.seq;
        this.claims[key] = [...(this.claims[key] ?? []), seq];
        this.markVerifying(subject, fingerprint);

        let released = false;
        return {
            seq,
            release: () => {
                if (released) return;
                released = true;
                // Removes this read's own entry and nothing else, so a release
                // that arrives after an `invalidateAll` — from a read belonging
                // to the session that just left — cannot take a newer read's
                // claim with it.
                const outstanding = (this.claims[key] ?? []).filter(
                    (outstandingSeq) => outstandingSeq !== seq,
                );
                if (outstanding.length > 0) this.claims[key] = outstanding;
                else delete this.claims[key];
            },
        };
    }

    /** Whether a read that will record a verdict is already in flight. */
    isVerificationInFlight(subject: VerificationSubject): boolean {
        return (this.claims[recordKey(subject)] ?? []).length > 0;
    }

    /**
     * Whether a read issued after `seq` has already settled.
     *
     * A read that started earlier must not overwrite one that started later and
     * finished first, even inside the same account session — otherwise "last to
     * arrive" wins, and that is not "most correct".
     */
    isSuperseded(subject: VerificationSubject, seq: number): boolean {
        const record = this.records[recordKey(subject)];
        if (!record || record.settledSeq === undefined) return false;
        return record.settledSeq > seq;
    }

    /** Mark the account as being read right now. */
    private markVerifying(subject: VerificationSubject, fingerprint: string): void {
        const key = recordKey(subject);
        const previous = this.records[key];
        this.records[key] = {
            status: "verifying",
            credentialFingerprint: fingerprint,
            // Kept, not cleared: a `verifying` state that has never settled has
            // no timestamp of its own, and the fingerprint above is what binds
            // the eventual verdict to these credentials.
            checkedAt: previous?.checkedAt ?? null,
            // Stamped from the real clock, not `this.clock`: a caller decides
            // whether to retry by comparing against wall time, and that decision
            // must not depend on whether a component happens to be holding the
            // tick.
            lastAttemptAt: correctedNow(),
            attemptFingerprint: fingerprint,
            settledSeq: previous?.settledSeq,
            failure: undefined,
            errorCode: undefined,
        };
    }

    /** The read succeeded: these credentials work. */
    recordSuccess(subject: VerificationSubject, outcome: VerificationOutcome): void {
        const key = recordKey(subject);
        this.records[key] = {
            status: "verified",
            credentialFingerprint: outcome.fingerprint,
            checkedAt: outcome.at ?? correctedNow(),
            lastAttemptAt: correctedNow(),
            attemptFingerprint: outcome.fingerprint,
            settledSeq: outcome.seq,
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
        outcome: VerificationOutcome & { errorCode?: string | number },
    ): void {
        const key = recordKey(subject);
        this.records[key] = {
            status: "rejected",
            credentialFingerprint: outcome.fingerprint,
            checkedAt: outcome.at ?? correctedNow(),
            lastAttemptAt: correctedNow(),
            attemptFingerprint: outcome.fingerprint,
            settledSeq: outcome.seq,
            failure,
            errorCode: outcome.errorCode,
        };
    }

    /**
     * Whether the last read for this account is still inside its retry floor.
     *
     * Suppresses a *repeat* of a read that already ran on these same
     * credentials. The floor exists because the effects that call
     * `ensureCurrent` read the credential fields to stay reactive, so without
     * one a key the venue keeps rejecting would be re-read on every keystroke.
     *
     * A different credential set is a different question, not a repeat: the
     * trader has just pasted or rotated a key, and "does this one work?" is what
     * they are asking. Read straight away, floor or not.
     *
     * What this does *not* bound is typing into a field that already has
     * content. Every character changes the fingerprint, so each one is a
     * "different set" and each one spends a signed read — the read is never
     * issued for a half-empty set at all, because both callers check
     * completeness first, so "still typing" cannot be recognised from here. The
     * consumers debounce their own calls instead; see the effect in
     * `PlaceOrderPanel`.
     */
    isCoolingDown(subject: VerificationSubject): boolean {
        const record = this.records[recordKey(subject)];
        if (!record || record.lastAttemptAt === null) return false;
        // The window itself, for every branch: an expired verdict has to be
        // re-readable even when the credentials are the same ones, or a
        // `stale` account would sit unverified for the rest of the session.
        if (correctedNow() - record.lastAttemptAt >= RETRY_FLOOR_MS) return false;
        if (record.attemptFingerprint !== credentialFingerprint(subject.keys)) return false;
        return true;
    }

    /**
     * When this account was last asked, settled or not.
     *
     * `null` when it never was. Exposed for the freshness story in the record's
     * own doc comment; `isCoolingDown` is what callers should ask.
     */
    lastAttemptAt(subject: VerificationSubject): number | null {
        return this.records[recordKey(subject)]?.lastAttemptAt ?? null;
    }

    /**
     * Drop every verdict.
     *
     * Called when the account session rotates: the accounts the old verdicts
     * were about are no longer the ones on screen, and a switch back must not
     * find a green dot waiting for it. Claims go with them — a read still in
     * flight belongs to the session that left.
     */
    invalidateAll(): void {
        this.records = {};
        this.claims = {};
    }

    /** Test-only: forget everything between cases. */
    resetForTest(): void {
        this.invalidateAll();
        this.clock = correctedNow();
    }
}

export const accountVerification = new AccountVerificationStore();

/**
 * Whether an account has the credentials it needs, independent of any verdict.
 *
 * `statusFor` answers "unconfigured" for three different situations: no account
 * for this venue, an incomplete credential set, and *a complete set that nobody
 * has read yet*. Only the first two mean the trader has nothing to trade with.
 * The third is the ordinary state of a working account before its first read
 * lands, and the state of every account for a moment after a session rotation —
 * so anything that words its message off the status alone tells a trader with a
 * working key that they have no credentials.
 *
 * Three values rather than a boolean, because "no account at all" and "an
 * account with a blank field" call for the same sentence but are not the same
 * fact, and a caller that cares can still tell them apart.
 */
export function credentialPresence(
    subject: VerificationSubject | null,
): "none" | "incomplete" | "present" {
    if (!subject) return "none";
    if (!hasCompleteCredentials(subject.keys, subject.exchange)) return "incomplete";
    return "present";
}

/**
 * Whether an envelope that carried no data is the venue refusing.
 *
 * `{ success: false, error: { code, message } }` is a refusal. `{ success: true }`
 * with no payload is a response this client cannot read, which is a fact about
 * the response and not about the key. Only the first is evidence about the
 * credentials, and reading the second as a refusal would name the trader's key
 * as the cause of our own parsing problem. Anything unrecognised answers
 * `false`, so an unknown shape is never reported as a venue judgement.
 */
export function isVenueRefusal(json: unknown): boolean {
    return (
        typeof json === "object" && json !== null && (json as { success?: unknown }).success === false
    );
}

/**
 * Read the active account's private state and record the verdict.
 *
 * The fallback, not the primary path: `PositionsSidebar` reports the verdict of
 * the read it already performs (`readIssued`/`recordSuccess`/`recordFailure`),
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
    // Snapshotted before the request is built, and read once. `subject.keys` is
    // a live `$state` proxy behind `bind:value`, so anything read from it after
    // the `await` is whatever the trader has typed since — a verdict fingerprinted
    // then would belong to a key the venue was never shown. These same three
    // strings are what gets signed, so the fingerprint and the request cannot
    // disagree about which credentials this verdict is about.
    const apiKey = subject.keys.key;
    const apiSecret = subject.keys.secret;
    const passphrase = subject.keys.passphrase;
    const fingerprint = credentialFingerprint({ key: apiKey, secret: apiSecret, passphrase });

    // Claimed like any other read, so the claim count and `verifying` mean the
    // same thing whoever set them, and a second caller cannot spend a request on
    // an answer already on its way.
    const { seq, release } = accountVerification.readIssued(subject, fingerprint);

    try {
        const response = await exchangeSignedFetch({
            cachyPath: "/api/account",
            keys: {
                apiKey,
                apiSecret,
                passphrase,
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
        // BUG-0551 dispatch guard and the BUG-0412 read ticket. The sequence
        // check covers a competing read inside the same session, which the epoch
        // cannot see.
        if (!accountEpoch.isCurrent(session)) return;
        if (accountVerification.isSuperseded(subject, seq)) return;

        const json = await response.json();
        const { data, code } = unwrapApiEnvelope<unknown>(json);
        if (data === null) {
            accountVerification.recordFailure(
                subject,
                isVenueRefusal(json) ? "rejected" : "unreachable",
                { fingerprint, seq, errorCode: code },
            );
            return;
        }
        accountVerification.recordSuccess(subject, { fingerprint, seq });
    } catch (error) {
        if (!accountEpoch.isCurrent(session)) return;
        if (accountVerification.isSuperseded(subject, seq)) return;
        // A thrown error is transport, not a verdict: the venue never answered,
        // so this records "unreachable" rather than pretending the key was
        // judged. The status stays `rejected` either way — both mean "not
        // verified", which is the only thing a caller may act on. The reason
        // itself goes to the log and not into the record: it is our own
        // exception text, not something the venue said, and a field no message
        // reads is a field someone will eventually render.
        logger.debug(
            "api",
            `accountVerification: ${subject.exchange} account read failed`,
            error instanceof Error ? error : undefined,
        );
        accountVerification.recordFailure(subject, "unreachable", { fingerprint, seq });
    } finally {
        // Every early return above — superseded session, outranked read — ends
        // here, so the claim cannot outlive the read that took it.
        release();
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

    // A read that just ran on these same credentials is left alone for a
    // moment. `statusFor` only short-circuits on `verified`, and the effects
    // that call this read the credential fields to stay reactive — so without
    // the floor, an account that was just refused would be re-read on every
    // keystroke in the key field. A freshly pasted key is not a repeat and is
    // read straight away.
    if (accountVerification.isCoolingDown(subject)) return;

    await verifyAccount(exchange);
}
