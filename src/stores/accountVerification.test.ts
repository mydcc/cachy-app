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
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
    accountVerification,
    credentialFingerprint,
    ensureCurrent,
    hasCompleteCredentials,
    subjectFor,
    verifyAccount,
    VERIFICATION_FRESH_MS,
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

describe("accountVerification", () => {
    beforeEach(() => {
        accountVerification.resetForTest();
        signedFetch.mockReset();
        vi.mocked(paperAccountFeed).mockReturnValue(null);
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
            accountVerification.markVerifying(s);
            expect(accountVerification.statusFor(s)).toBe("verifying");
        });

        it("replaces a previous rejection with the in-flight state", () => {
            const s = subject();
            accountVerification.recordFailure(s, "rejected", "10001");
            expect(accountVerification.statusFor(s)).toBe("rejected");

            accountVerification.markVerifying(s);
            expect(accountVerification.statusFor(s)).toBe("verifying");
        });
    });

    describe("verified", () => {
        it("is the status after a successful read", () => {
            const s = subject();
            accountVerification.recordSuccess(s);
            expect(accountVerification.statusFor(s)).toBe("verified");
            expect(accountVerification.recordFor(s)?.checkedAt).not.toBeNull();
        });

        it("is per account, never shared", () => {
            accountVerification.recordSuccess(subject({ id: "acct-1" }));
            expect(
                accountVerification.statusFor(subject({ id: "acct-2" })),
            ).toBe("unconfigured");
        });

        it("expires into stale once the freshness window has passed", () => {
            const s = subject();
            const outsideWindow = Date.now() - VERIFICATION_FRESH_MS - 1_000;
            accountVerification.recordSuccess(s, outsideWindow);

            expect(accountVerification.statusFor(s)).toBe("stale");
        });

        it("is still verified just inside the freshness window", () => {
            const s = subject();
            accountVerification.recordSuccess(s, Date.now() - VERIFICATION_FRESH_MS + 60_000);
            expect(accountVerification.statusFor(s)).toBe("verified");
        });
    });

    describe("rejected", () => {
        it("keeps the venue's error code for the message to use", () => {
            const s = subject();
            accountVerification.recordFailure(s, "rejected", "10001");

            expect(accountVerification.statusFor(s)).toBe("rejected");
            expect(accountVerification.recordFor(s)?.errorCode).toBe("10001");
            expect(accountVerification.recordFor(s)?.failure).toBe("rejected");
        });

        it("separates a refused credential from a network that never answered", () => {
            const refused = subject({ id: "a" });
            const dropped = subject({ id: "b" });
            accountVerification.recordFailure(refused, "rejected", "10001");
            accountVerification.recordFailure(dropped, "unreachable");

            expect(accountVerification.recordFor(refused)?.failure).toBe("rejected");
            expect(accountVerification.recordFor(dropped)?.failure).toBe("unreachable");
            // Same status: neither is a licence to trade.
            expect(accountVerification.statusFor(refused)).toBe("rejected");
            expect(accountVerification.statusFor(dropped)).toBe("rejected");
        });
    });

    describe("credential edits", () => {
        it("drops a verified verdict the moment a field changes", () => {
            const s = subject();
            accountVerification.recordSuccess(s);
            expect(accountVerification.statusFor(s)).toBe("verified");

            // AC2: an edit must not inherit the old read's verdict, even
            // though nothing has refetched yet — this is the window in which a
            // revoked key used to keep showing green.
            const edited = subject({ keys: { ...KEYS, secret: "rotated-secret-9" } });
            expect(accountVerification.statusFor(edited)).toBe("stale");
        });

        it("binds the verdict to the account as well as the fields", () => {
            accountVerification.recordSuccess(subject({ id: "acct-1" }));
            const otherAccount = subject({ id: "acct-2" });
            expect(accountVerification.statusFor(otherAccount)).toBe("unconfigured");
        });

        it("gives two accounts with identical fields separate verdicts", () => {
            const one = subject({ id: "acct-1" });
            const two = subject({ id: "acct-2" });
            accountVerification.recordSuccess(one);
            accountVerification.recordFailure(two, "rejected", "10001");

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

        it("carries no part of the secret beyond its edges", () => {
            // Display-grade by design; this pins that down so a future "just
            // hash it properly" change cannot quietly widen what is stored.
            const printed = credentialFingerprint({
                key: "abcdefgh-secret-value-1",
                secret: "zzzzzzzz",
            });
            expect(printed).not.toContain("secret-value");
        });
    });

    describe("verifyAccount", () => {
        /** One real account in settings, which is what `subjectFor` resolves. */
        function installAccount(keys = KEYS) {
            settingsState.accounts = [
                { id: "acct-1", name: "Main", exchange: "bitunix", keys: { ...keys } },
            ];
            settingsState.activeAccountId = "acct-1";
            settingsState.apiProvider = "bitunix";
        }

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
            const release = accountVerification.claimVerification(subject());
            await verifyAccount("bitunix");
            expect(exchangeSignedFetch).not.toHaveBeenCalled();

            // Releasing the claim is what lets a later verification run; a
            // claim left behind would suppress it forever.
            release();
            await verifyAccount("bitunix");
            expect(exchangeSignedFetch).toHaveBeenCalledTimes(1);
        });

        it("releases a claim idempotently, so a double release cannot clear a newer one", async () => {
            installAccount();
            const first = accountVerification.claimVerification(subject());
            first();
            const second = accountVerification.claimVerification(subject());
            first();
            // The stale release must not free the newer claim.
            expect(accountVerification.isVerificationInFlight(subject())).toBe(true);
            second();
            expect(accountVerification.isVerificationInFlight(subject())).toBe(false);
        });
    });

    describe("ensureCurrent", () => {
        function installAccount(keys = KEYS) {
            settingsState.accounts = [
                { id: "acct-1", name: "Main", exchange: "bitunix", keys: { ...keys } },
            ];
            settingsState.activeAccountId = "acct-1";
            settingsState.apiProvider = "bitunix";
        }

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

        it("re-reads once the verdict has expired", async () => {
            installAccount();
            signedOk();
            await ensureCurrent("bitunix");
            accountVerification.recordSuccess(
                subject(),
                Date.now() - VERIFICATION_FRESH_MS - 1_000,
            );
            signedFetch.mockClear();

            await ensureCurrent("bitunix");
            expect(exchangeSignedFetch).toHaveBeenCalledTimes(1);
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
            accountVerification.recordSuccess(s);
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
