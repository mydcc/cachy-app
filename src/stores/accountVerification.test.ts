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
 * BUG-0560 — the private-account verification lifecycle.
 *
 * The regression these guard against is the bug itself: a credential set that
 * nobody ever asked the exchange about must not read as good. The first test
 * below is that sentence as an assertion — nonempty fields, no read, and the
 * answer is still "not configured as far as we know".
 *
 * The lifecycle is only trustworthy if a verdict says which credentials it is
 * about, so most of what follows is about that binding: a verdict belongs to
 * the key that was signed, not to whatever is in the input afterwards, and it
 * cannot outlive its freshness window while the app sits still.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    accountVerification,
    credentialFingerprint,
    ensureCurrent,
    hasCompleteCredentials,
    subjectFor,
    verifyAccount,
    RETRY_FLOOR_MS,
    VERIFICATION_FRESH_MS,
    type VerificationOutcome,
    type VerificationSubject,
} from "./accountVerification.svelte";
import { settingsState } from "./settings.svelte";
import { accountEpoch } from "../services/accountEpoch.svelte";
import { paperAccountFeed } from "../services/paperAccountFeed";

vi.mock("../services/paperAccountFeed", () => ({
    paperAccountFeed: vi.fn(() => null),
}));

vi.mock("../utils/exchange/browserSigning", () => ({
    exchangeSignedFetch: vi.fn(),
}));

vi.mock("../utils/exchange/venueQueries", () => ({
    buildAccountQueryParams: vi.fn(() => ({})),
}));

const { exchangeSignedFetch } = await import("../utils/exchange/browserSigning");
const signedFetch = vi.mocked(exchangeSignedFetch);

const KEYS = { key: "live-key-0001", secret: "live-secret-0001" };
const BITGET_KEYS = { ...KEYS, passphrase: "pp-0001" };

function subject(overrides: Partial<VerificationSubject> = {}): VerificationSubject {
    return {
        id: "acct-1",
        exchange: "bitunix",
        keys: { ...KEYS },
        ...overrides,
    };
}

/**
 * Stand in for a caller that issued a read and watched it settle.
 *
 * Goes through `readIssued` rather than inventing a sequence number, so a test
 * cannot pass by inventing an ordering the store would never hand out. The
 * claim is released immediately: these cases are about the verdict, not about
 * keeping a read marked as in flight.
 */
function settled(
    s: VerificationSubject,
    keys: VerificationSubject["keys"] = s.keys,
): VerificationOutcome {
    const { seq, release } = accountVerification.readIssued(
        s,
        credentialFingerprint(keys),
    );
    release();
    return { fingerprint: credentialFingerprint(keys), seq };
}

/** The signed read only ever gets its envelope read off the response. */
function envelope(body: unknown): Response {
    return { json: async () => body } as unknown as Response;
}

/** The signed read succeeded: an envelope with data in it. */
function signedOk() {
    signedFetch.mockResolvedValue(envelope({ success: true, data: { available: "1" } }));
}

/** The venue answered, and refused. */
function signedRefused(code = "10001") {
    signedFetch.mockResolvedValue(
        envelope({ success: false, error: { code, message: "bad key" } }),
    );
}

/** One real account in settings, which is what `subjectFor` resolves. */
function installAccount(keys = KEYS) {
    settingsState.accounts = [
        { id: "acct-1", name: "Main", exchange: "bitunix", keys: { ...keys } },
    ];
    settingsState.activeAccountId = "acct-1";
    settingsState.apiProvider = "bitunix";
}

describe("accountVerification", () => {
    const pristine = {
        accounts: settingsState.accounts,
        activeAccountId: settingsState.activeAccountId,
        apiProvider: settingsState.apiProvider,
    };

    beforeEach(() => {
        accountVerification.resetForTest();
        signedFetch.mockReset();
        vi.mocked(paperAccountFeed).mockReturnValue(null);
    });

    // These cases install a real account into the real settings singleton, and
    // Vitest isolates modules per file — so without this the next file to
    // import the store unmocked would inherit an account and a verdict.
    afterEach(() => {
        settingsState.accounts = pristine.accounts;
        settingsState.activeAccountId = pristine.activeAccountId;
        settingsState.apiProvider = pristine.apiProvider;
    });

    describe("unconfigured", () => {
        it("does not call nonempty credentials verified before any read", () => {
            // The bug, as an assertion: three nonempty fields and the app has
            // learned nothing at all about whether the exchange accepts them.
            expect(
                accountVerification.statusFor(subject({ keys: { ...KEYS } })),
            ).toBe("unconfigured");
        });

        it("is the status while a field is missing", () => {
            expect(hasCompleteCredentials({ key: "", secret: "s" }, "bitunix")).toBe(false);
            expect(hasCompleteCredentials({ key: "k", secret: "" }, "bitunix")).toBe(false);
            expect(
                hasCompleteCredentials({ key: "k", secret: "s" }, "bitget"),
            ).toBe(false);
            expect(
                accountVerification.statusFor(subject({ keys: { key: "k", secret: "" } })),
            ).toBe("unconfigured");
        });

        it("treats a complete Bitget credential set as configured", () => {
            expect(
                hasCompleteCredentials({ ...BITGET_KEYS }, "bitget"),
            ).toBe(true);
        });

        it("reports unconfigured for a subject that does not exist", () => {
            expect(accountVerification.statusFor(null)).toBe("unconfigured");
            expect(accountVerification.recordFor(null)).toBeNull();
        });
    });

    describe("verifying", () => {
        it("is the status between starting a read and its verdict", () => {
            const s = subject();
            accountVerification.readIssued(s, credentialFingerprint(s.keys));
            expect(accountVerification.statusFor(s)).toBe("verifying");
        });

        it("replaces a previous rejection with the in-flight state", () => {
            const s = subject();
            accountVerification.recordFailure(s, "rejected", {
                ...settled(s),
                errorCode: "10001",
            });
            expect(accountVerification.statusFor(s)).toBe("rejected");

            accountVerification.readIssued(s, credentialFingerprint(s.keys));
            expect(accountVerification.statusFor(s)).toBe("verifying");
        });
    });

    describe("verified", () => {
        it("is the status after a successful read", () => {
            const s = subject();
            accountVerification.recordSuccess(s, settled(s));
            expect(accountVerification.statusFor(s)).toBe("verified");
            expect(accountVerification.recordFor(s)?.checkedAt).not.toBeNull();
        });

        it("is per account, never shared", () => {
            const one = subject({ id: "acct-1" });
            accountVerification.recordSuccess(one, settled(one));
            expect(
                accountVerification.statusFor(subject({ id: "acct-2" })),
            ).toBe("unconfigured");
        });

        it("expires into stale once the freshness window has passed", () => {
            // The arithmetic half: the window has to close. The reactive half —
            // that a consumer's derived actually re-runs when it does, which a
            // plain call here cannot observe — is pinned by
            // `AccountCard.verification.component.test.ts`, where a real
            // `$derived` drives the dot.
            vi.useFakeTimers();
            try {
                const stopClock = accountVerification.startClock(1_000);
                const s = subject();
                accountVerification.recordSuccess(s, settled(s));
                expect(accountVerification.statusFor(s)).toBe("verified");

                vi.advanceTimersByTime(VERIFICATION_FRESH_MS + 1_000);
                expect(accountVerification.statusFor(s)).toBe("stale");
                stopClock();
            } finally {
                vi.useRealTimers();
            }
        });

        it("stays verified while the clock is inside the window", () => {
            vi.useFakeTimers();
            try {
                const stopClock = accountVerification.startClock(1_000);
                const s = subject();
                accountVerification.recordSuccess(s, settled(s));

                vi.advanceTimersByTime(VERIFICATION_FRESH_MS - 60_000);
                expect(accountVerification.statusFor(s)).toBe("verified");
                stopClock();
            } finally {
                vi.useRealTimers();
            }
        });

        it("is still verified just inside the freshness window", () => {
            const s = subject();
            accountVerification.recordSuccess(s, {
                ...settled(s),
                at: Date.now() - VERIFICATION_FRESH_MS + 60_000,
            });
            expect(accountVerification.statusFor(s)).toBe("verified");
        });
    });

    describe("rejected", () => {
        it("keeps the venue's error code for the message to use", () => {
            const s = subject();
            accountVerification.recordFailure(s, "rejected", {
                ...settled(s),
                errorCode: "10001",
            });

            expect(accountVerification.statusFor(s)).toBe("rejected");
            expect(accountVerification.recordFor(s)?.errorCode).toBe("10001");
            expect(accountVerification.recordFor(s)?.failure).toBe("rejected");
        });

        it("separates a refused credential from a network that never answered", () => {
            const refused = subject({ id: "a" });
            const dropped = subject({ id: "b" });
            accountVerification.recordFailure(refused, "rejected", settled(refused));
            accountVerification.recordFailure(dropped, "unreachable", settled(dropped));

            expect(accountVerification.recordFor(refused)?.failure).toBe("rejected");
            expect(accountVerification.recordFor(dropped)?.failure).toBe("unreachable");
            // Same status: neither is a licence to trade.
            expect(accountVerification.statusFor(refused)).toBe("rejected");
            expect(accountVerification.statusFor(dropped)).toBe("rejected");
        });

        it("keeps a transport message out of the venue's error code", () => {
            // `errorCode` is what a message renders, and a thrown `TypeError` is
            // our own text about our own request — the venue said nothing.
            const s = subject();
            accountVerification.recordFailure(s, "unreachable", {
                ...settled(s),
                transportDetail: "Failed to fetch",
            });

            expect(accountVerification.recordFor(s)?.errorCode).toBeUndefined();
            expect(accountVerification.recordFor(s)?.transportDetail).toBe("Failed to fetch");
        });
    });

    describe("credential edits", () => {
        it("drops a verified verdict the moment a field changes", () => {
            const s = subject();
            accountVerification.recordSuccess(s, settled(s));
            expect(accountVerification.statusFor(s)).toBe("verified");

            // AC2: an edit must not inherit the old read's verdict, even
            // though nothing has refetched yet — this is the window in which a
            // revoked key used to keep showing green.
            const edited = subject({ keys: { ...KEYS, secret: "rotated-secret-9" } });
            expect(accountVerification.statusFor(edited)).toBe("stale");
        });

        it("drops a rejection too, rather than blaming a key for the old one", () => {
            // A refusal is evidence about one credential set. Answering
            // `rejected` before comparing fingerprints meant the card told the
            // trader "the exchange rejected these credentials" about a key the
            // exchange had never been shown.
            const s = subject();
            accountVerification.recordFailure(s, "rejected", settled(s));
            expect(accountVerification.statusFor(s)).toBe("rejected");

            const edited = subject({ keys: { ...KEYS, key: "other-key-0001" } });
            expect(accountVerification.statusFor(edited)).toBe("stale");
        });

        it("does not hand a verdict to a key pasted in while the read was in flight", async () => {
            // The bug this whole store exists to prevent, in its subtlest form:
            // the read is in flight for key A, the trader pastes key B, the read
            // comes back green — and a verdict fingerprinted *after* the await
            // would be stamped with B and light up for a key nobody asked about.
            //
            // The paste is an in-place mutation on purpose. `AccountCard` binds
            // its inputs with `bind:value={account.keys.key}`, which writes
            // through the settings proxy into the very object the read is
            // holding; swapping the object instead would leave the read's own
            // reference untouched and the case would prove nothing.
            installAccount();
            const pasted = { key: "pasted-key-0002", secret: "pasted-secret-2" };
            let settle!: () => void;
            signedFetch.mockImplementation(async () => {
                // The paste happens while this request is on the wire.
                settingsState.accounts[0].keys.key = pasted.key;
                settingsState.accounts[0].keys.secret = pasted.secret;
                await new Promise<void>((resolve) => {
                    settle = resolve;
                });
                return envelope({ success: true, data: { available: "1" } });
            });

            const read = verifyAccount("bitunix");
            await vi.waitFor(() => expect(exchangeSignedFetch).toHaveBeenCalled());
            // What went on the wire is the key that was in place when the read
            // was built — the paste landed after that, not before.
            expect(vi.mocked(exchangeSignedFetch).mock.calls[0][0].keys).toMatchObject({
                apiKey: KEYS.key,
                apiSecret: KEYS.secret,
            });
            settle();
            await read;

            // What the venue judged still counts…
            expect(accountVerification.statusFor(subject())).toBe("verified");
            // …and what the trader is looking at does not. The read was signed
            // with the old key, so the new one has to be asked about.
            expect(accountVerification.statusFor(subject({ keys: pasted }))).toBe("stale");
        });

        it("binds the verdict to the account as well as the fields", () => {
            const one = subject({ id: "acct-1" });
            accountVerification.recordSuccess(one, settled(one));
            const otherAccount = subject({ id: "acct-2" });
            expect(accountVerification.statusFor(otherAccount)).toBe("unconfigured");
        });

        it("gives two accounts with identical fields separate verdicts", () => {
            const one = subject({ id: "acct-1" });
            const two = subject({ id: "acct-2" });
            accountVerification.recordSuccess(one, settled(one));
            accountVerification.recordFailure(two, "rejected", settled(two));

            expect(accountVerification.statusFor(one)).toBe("verified");
            expect(accountVerification.statusFor(two)).toBe("rejected");
        });
    });

    describe("credentialFingerprint", () => {
        it("changes when any credential field changes", () => {
            const base = credentialFingerprint(KEYS);
            expect(credentialFingerprint({ ...KEYS, key: "other-key-0001" })).not.toBe(base);
            expect(credentialFingerprint({ ...KEYS, secret: "other-secret-1" })).not.toBe(base);
            expect(
                credentialFingerprint({ ...KEYS, passphrase: "added" }),
            ).not.toBe(credentialFingerprint(KEYS));
        });

        it("is stable for the same fields", () => {
            expect(credentialFingerprint(KEYS)).toBe(credentialFingerprint({ ...KEYS }));
        });

        it("tells two one-character credentials apart", () => {
            // A length-only fallback made these two identical, so rotating
            // between them left a `verified` verdict standing on a key the venue
            // had never seen. Short credentials are exactly the ones a test with
            // realistic-looking values would miss.
            expect(credentialFingerprint({ key: "a", secret: "b" })).not.toBe(
                credentialFingerprint({ key: "x", secret: "y" }),
            );
        });

        it("carries no part of the secret", () => {
            // Display-grade by design; this pins that down so a future change
            // cannot quietly start storing key material.
            const printed = credentialFingerprint({
                key: "abcdefgh-secret-value-1",
                secret: "zzzzzzzz",
            });
            expect(printed).not.toContain("secret-value");
            expect(printed).not.toContain("abcdefgh");
        });
    });

    describe("read issuing", () => {
        it("needs one release per claim, not one per read", () => {
            // The sidebar's read and the fallback read can overlap. With a
            // boolean, whichever finished first cleared the flag while the
            // other was still outstanding, and a duplicate went out.
            const s = subject();
            const first = accountVerification.readIssued(s, credentialFingerprint(s.keys));
            const second = accountVerification.readIssued(s, credentialFingerprint(s.keys));
            expect(accountVerification.isVerificationInFlight(s)).toBe(true);

            first.release();
            expect(accountVerification.isVerificationInFlight(s)).toBe(true);
            second.release();
            expect(accountVerification.isVerificationInFlight(s)).toBe(false);
        });

        it("releases a claim idempotently, so a double release cannot free a newer one", () => {
            const s = subject();
            const first = accountVerification.readIssued(s, credentialFingerprint(s.keys));
            first.release();
            const second = accountVerification.readIssued(s, credentialFingerprint(s.keys));
            first.release();
            expect(accountVerification.isVerificationInFlight(s)).toBe(true);
            second.release();
            expect(accountVerification.isVerificationInFlight(s)).toBe(false);
        });

        it("lets the newest read win, whichever order they settle in", () => {
            // Ordering used to compare a settle time against a start time, so
            // the read that started *later* could be told it was superseded by
            // the older one that happened to settle first — the newer verdict
            // was then dropped and the account kept the worse answer. Sequence
            // numbers cannot tie and cannot invert.
            const s = subject();
            const older = accountVerification.readIssued(s, credentialFingerprint(s.keys));
            const newer = accountVerification.readIssued(s, credentialFingerprint(s.keys));

            // The older read settles first, the newer one second — the order
            // that used to lose the newer verdict.
            accountVerification.recordSuccess(s, {
                fingerprint: credentialFingerprint(s.keys),
                seq: older.seq,
            });
            accountVerification.recordSuccess(s, {
                fingerprint: credentialFingerprint(s.keys),
                seq: newer.seq,
            });

            expect(accountVerification.isSuperseded(s, newer.seq)).toBe(false);
            // And the reverse: a read issued before a verdict landed is stale.
            expect(accountVerification.isSuperseded(s, older.seq)).toBe(true);
            older.release();
            newer.release();
        });
    });

    describe("verifyAccount", () => {
        it("reads the account and records a verdict when nothing else will", async () => {
            installAccount();
            signedOk();

            await verifyAccount("bitunix");

            expect(exchangeSignedFetch).toHaveBeenCalledTimes(1);
            expect(accountVerification.statusFor(subject())).toBe("verified");
        });

        it("records a rejection when the venue refuses the credentials", async () => {
            installAccount();
            signedRefused("10001");

            await verifyAccount("bitunix");

            expect(accountVerification.statusFor(subject())).toBe("rejected");
            expect(accountVerification.recordFor(subject())?.failure).toBe("rejected");
            expect(accountVerification.recordFor(subject())?.errorCode).toBe("10001");
        });

        it("does not blame the key for a success envelope it cannot read", async () => {
            // `success: true` with no payload is our parsing problem, not the
            // venue's verdict, and calling it a refusal would tell the trader
            // their key is bad when nobody ever judged it.
            installAccount();
            signedFetch.mockResolvedValue(envelope({ success: true }));

            await verifyAccount("bitunix");

            expect(accountVerification.recordFor(subject())?.failure).toBe("unreachable");
        });

        it("records an unreachable network as a failure of the connection, not of the key", async () => {
            installAccount();
            signedFetch.mockRejectedValue(new Error("network down"));

            await verifyAccount("bitunix");

            // The two failures share a status — neither authorises a trade —
            // and differ in the reason the message will give.
            expect(accountVerification.statusFor(subject())).toBe("rejected");
            expect(accountVerification.recordFor(subject())?.failure).toBe("unreachable");
        });

        it("is the only read that reaches the exchange when credentials are incomplete", async () => {
            installAccount({ key: "k", secret: "" });
            await verifyAccount("bitunix");
            expect(exchangeSignedFetch).not.toHaveBeenCalled();
        });

        it("does nothing in paper mode", async () => {
            installAccount();
            vi.mocked(paperAccountFeed).mockReturnValue({
                accountInfo: () => ({ available: 0, margin: 0, frozen: 0 }),
            } as unknown as ReturnType<typeof paperAccountFeed>);

            await verifyAccount("bitunix");
            expect(exchangeSignedFetch).not.toHaveBeenCalled();
        });

        it("does not issue a second read while one is already reporting", async () => {
            installAccount();
            const { release } = accountVerification.readIssued(
                subject(),
                credentialFingerprint(subject().keys),
            );
            await verifyAccount("bitunix");
            expect(exchangeSignedFetch).not.toHaveBeenCalled();

            // Releasing the claim is what lets a later verification run; a
            // claim left behind would suppress it forever.
            release();
            await verifyAccount("bitunix");
            expect(exchangeSignedFetch).toHaveBeenCalledTimes(1);
        });

        it("gives its own claim back even when the read never settles a verdict", async () => {
            installAccount();
            signedFetch.mockRejectedValue(new Error("network down"));

            await verifyAccount("bitunix");
            expect(accountVerification.isVerificationInFlight(subject())).toBe(false);
        });
    });

    describe("ensureCurrent", () => {
        it("reads once for a verdict it does not have", async () => {
            installAccount();
            signedOk();

            await ensureCurrent("bitunix");
            expect(exchangeSignedFetch).toHaveBeenCalledTimes(1);
            expect(accountVerification.statusFor(subject())).toBe("verified");
        });

        it("does not re-read while the verdict is current", async () => {
            installAccount();
            signedOk();
            await ensureCurrent("bitunix");
            signedFetch.mockClear();

            await ensureCurrent("bitunix");
            expect(exchangeSignedFetch).not.toHaveBeenCalled();
        });

        it("does not re-read a refused account straight away", async () => {
            // The effects that call this read the credential fields to stay
            // reactive, so without a floor a key the venue keeps rejecting would
            // be re-read on every keystroke in the key input.
            installAccount();
            signedRefused();
            await ensureCurrent("bitunix");
            signedFetch.mockClear();

            await ensureCurrent("bitunix");
            expect(exchangeSignedFetch).not.toHaveBeenCalled();
        });

        it("reads a freshly pasted key straight away, floor or not", async () => {
            // The floor is on *repeats*, not on reads. Holding a new credential
            // set back for the rest of the window would leave the trader staring
            // at a stale verdict on the key they just pasted, which is the one
            // moment they are actually waiting for an answer.
            installAccount();
            signedRefused();
            await ensureCurrent("bitunix");
            signedFetch.mockClear();
            signedOk();

            const pasted = { ...KEYS, key: "pasted-key-0002" };
            settingsState.accounts[0].keys = { ...pasted };
            await ensureCurrent("bitunix");

            expect(exchangeSignedFetch).toHaveBeenCalledTimes(1);
            expect(accountVerification.statusFor(subject({ keys: pasted }))).toBe(
                "verified",
            );
        });

        it("re-reads once the verdict has expired", async () => {
            installAccount();
            signedOk();
            await ensureCurrent("bitunix");
            vi.useFakeTimers();
            try {
                const stopClock = accountVerification.startClock(1_000);
                vi.advanceTimersByTime(VERIFICATION_FRESH_MS + RETRY_FLOOR_MS + 1_000);
                signedFetch.mockClear();

                await ensureCurrent("bitunix");
                expect(exchangeSignedFetch).toHaveBeenCalledTimes(1);
                stopClock();
            } finally {
                vi.useRealTimers();
            }
        });

        it("re-reads after a credential edit, because the verdict went stale", async () => {
            installAccount();
            signedOk();
            await ensureCurrent("bitunix");
            signedFetch.mockClear();

            // The user rotates the secret in the settings input. The stored
            // verdict is about the old one, so it cannot stand in for a read.
            const rotated = { ...KEYS, secret: "rotated-secret-9" };
            settingsState.accounts[0].keys = { ...rotated };
            await ensureCurrent("bitunix");

            expect(exchangeSignedFetch).toHaveBeenCalledTimes(1);
            // Verified *for the new secret* — the old one is still `stale`,
            // which is the whole point of binding a verdict to its fields.
            expect(accountVerification.statusFor(subject({ keys: rotated }))).toBe(
                "verified",
            );
            expect(accountVerification.statusFor(subject())).toBe("stale");
        });
    });

    describe("invalidation", () => {
        it("forgets every verdict on a session rotation", () => {
            const s = subject();
            accountVerification.recordSuccess(s, settled(s));
            accountVerification.invalidateAll();

            // A switch away and back must not find a green dot waiting for it.
            expect(accountVerification.statusFor(s)).toBe("unconfigured");
        });
    });

    describe("subjectFor", () => {
        it("returns null when no account matches the venue", () => {
            settingsState.accounts = [];
            settingsState.activeAccountId = "";
            expect(subjectFor("bitget")).toBeNull();
        });

        it("resolves the account that owns the keys, not the id alone", () => {
            // The sidebar used to file its verdict under `activeAccountId`
            // while taking the keys from the venue's own account, so the two
            // could disagree and leave a verdict nothing could find again.
            installAccount();
            settingsState.activeAccountId = "acct-on-another-venue";
            expect(subjectFor("bitunix")?.id).toBe("acct-1");
        });
    });

    describe("accountEpoch", () => {
        it("is the guard verifyAccount drops a superseded verdict by", () => {
            // Named here so the dependency is deliberate: the read is async and
            // the user can switch accounts inside it, exactly as in BUG-0551.
            expect(typeof accountEpoch.current).toBe("function");
            expect(typeof accountEpoch.isCurrent).toBe("function");
        });
    });
});
