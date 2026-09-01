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
 *
 * Confirmation policy at the gate — FEAT-0024.
 *
 * The load-bearing test here is "a disabled confirmation still verifies". It
 * is the acceptance criterion that keeps the feature honest: the settings
 * screen offers to switch prompts off, and a user who believed that also
 * switched off the price and size checks would be trading on a false idea of
 * what the software is doing for them.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Decimal } from "decimal.js";
import {
    orderGate,
    mutatingActionOf,
    registerConfirmationCheck,
    type OrderIntent,
} from "./orderGate";
import {
    DEFAULT_CONFIRMATION_POLICY,
    GATED_ACTIONS,
    isConfirmableAction,
    normalizePolicy,
    type ConfirmableAction,
} from "../lib/confirmationPolicy";

const ACCOUNT = {
    provider: "bitunix",
    accountFingerprint: "abcd…wxyz",
};

/** A well-formed close whose numbers all agree with the displayed state. */
function closeIntent(): OrderIntent {
    return {
        kind: "reduce",
        endpoint: "/api/orders",
        payload: {
            type: "flash-close-position",
            symbol: "BTCUSDT",
            side: "BUY",
            orderType: "MARKET",
            qty: "0.5",
            reduceOnly: true,
            tradeSide: "CLOSE",
            positionId: "pos-1",
        },
        displayed: {
            ...ACCOUNT,
            symbol: "BTCUSDT",
            side: "BUY",
            positionAmount: new Decimal("0.5"),
            fullClose: true,
            positionId: "pos-1",
        },
    };
}

/** Requires a confirmation for everything, so the policy is never the variable. */
const alwaysConfirm = () => true;
const neverConfirm = () => false;

beforeEach(() => {
    registerConfirmationCheck(null);
});

afterEach(() => {
    registerConfirmationCheck(null);
});

describe("confirmation policy at the gate", () => {
    it("approves an unconfirmed action when no policy is registered", () => {
        // Unregistered means "no policy configured", matching the convention
        // registerRiskLimitCheck established.
        const verdict = orderGate.verify(closeIntent());

        expect(verdict.approved).toBe(true);
    });

    it("refuses an action the policy requires a confirmation for", () => {
        registerConfirmationCheck(alwaysConfirm);

        const verdict = orderGate.verify(closeIntent());

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).toBe("confirmation");
        expect(verdict.refusal?.reason).toBe("unconfirmed");
    });

    it("names the action in the refusal so the message can quote it", () => {
        registerConfirmationCheck(alwaysConfirm);

        const verdict = orderGate.verify(closeIntent());

        expect(verdict.refusal?.values.action).toBe("flash-close-position");
    });

    it("approves once a human has confirmed", () => {
        registerConfirmationCheck(alwaysConfirm);
        const intent = { ...closeIntent(), confirmedAt: Date.now() };

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(true);
    });

    it("approves an unconfirmed action the policy does not require one for", () => {
        registerConfirmationCheck(neverConfirm);

        const verdict = orderGate.verify(closeIntent());

        expect(verdict.approved).toBe(true);
    });

    it("records the confirmation check in the audit trail either way", () => {
        registerConfirmationCheck(neverConfirm);

        const verdict = orderGate.verify(closeIntent());

        // FEAT-0015 reads `checked` to show what was actually compared. A
        // policy that passed silently would be indistinguishable from one that
        // never ran.
        expect(verdict.checked).toContain("confirmation");
    });
});

describe("a disabled confirmation never disables a verification", () => {
    /*
     * The acceptance criterion, asserted directly. With confirmations switched
     * off for everything, an order whose numbers disagree with the screen is
     * still refused — and refused for the disagreement, not for the missing
     * prompt.
     */
    it("still refuses a payload that disagrees with the displayed state", () => {
        registerConfirmationCheck(neverConfirm);
        const intent = closeIntent();
        // The screen says 0.5; the payload says 5. One of them is wrong, and
        // the gate does not care which.
        intent.payload.qty = "5";

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.field).not.toBe("confirmation");
        expect(verdict.refusal?.reason).not.toBe("unconfirmed");
    });

    it("refuses a mismatched payload before it asks for a confirmation", () => {
        // Confirmations on AND the payload broken: the verification refusal
        // wins, because an order that will be refused anyway must never reach
        // a human. A dialog shown here trains the user to click through the
        // one that matters.
        registerConfirmationCheck(alwaysConfirm);
        const intent = closeIntent();
        intent.payload.qty = "5";

        const verdict = orderGate.verify(intent);

        expect(verdict.approved).toBe(false);
        expect(verdict.refusal?.reason).not.toBe("unconfirmed");
    });
});

describe("policy catalogue", () => {
    it("defaults the destructive and irreversible actions to on", () => {
        // The four the acceptance criteria name, plus cancel-all.
        expect(DEFAULT_CONFIRMATION_POLICY["flash-close-position"]).toBe(true);
        expect(DEFAULT_CONFIRMATION_POLICY["leverage-change"]).toBe(true);
        expect(DEFAULT_CONFIRMATION_POLICY["margin-mode-change"]).toBe(true);
        expect(DEFAULT_CONFIRMATION_POLICY["account-switch"]).toBe(true);
        expect(DEFAULT_CONFIRMATION_POLICY["cancel-all"]).toBe(true);
    });

    it("leaves order placement off so scalping stays usable", () => {
        expect(DEFAULT_CONFIRMATION_POLICY["place-order"]).toBe(false);
    });

    it("gates every order action but no account-settings action", () => {
        expect(GATED_ACTIONS.has("flash-close-position")).toBe(true);
        // These never reach the gate — their call sites consult the policy.
        expect(GATED_ACTIONS.has("leverage-change")).toBe(false);
        expect(GATED_ACTIONS.has("account-switch")).toBe(false);
    });

    it("rejects an action name it does not know", () => {
        expect(isConfirmableAction("place-order")).toBe(true);
        expect(isConfirmableAction("order-history")).toBe(false);
    });
});

describe("normalizePolicy", () => {
    it("fills a missing action from the defaults, not from false", () => {
        // A policy stored before an action existed must not arrive switched
        // off — the user opted out of the prompts that existed when they
        // chose, not of every prompt Cachy will ever add.
        const stored = { "place-order": true };

        const policy = normalizePolicy(stored);

        expect(policy["place-order"]).toBe(true);
        expect(policy["flash-close-position"]).toBe(true);
    });

    it("keeps an explicit opt-out", () => {
        const policy = normalizePolicy({ "flash-close-position": false });

        expect(policy["flash-close-position"]).toBe(false);
    });

    it("ignores a non-boolean value", () => {
        const policy = normalizePolicy({ "flash-close-position": "yes" });

        expect(policy["flash-close-position"]).toBe(true);
    });

    it("survives a corrupt blob", () => {
        expect(normalizePolicy(null)).toEqual(DEFAULT_CONFIRMATION_POLICY);
        expect(normalizePolicy("nonsense")).toEqual(DEFAULT_CONFIRMATION_POLICY);
    });

    it("covers every action in the catalogue", () => {
        const policy = normalizePolicy({});
        const actions = Object.keys(policy) as ConfirmableAction[];

        expect(actions.sort()).toEqual(
            (Object.keys(DEFAULT_CONFIRMATION_POLICY) as ConfirmableAction[]).sort(),
        );
    });
});

describe("one user intent, two venue payloads, one policy", () => {
    /*
     * A flash close reaches Bitunix as `flash-close-position` and every other
     * venue as an ordinary reduce-only `place-order`. Reading the policy off
     * the wire would ask the `place-order` question — which defaults to off —
     * about the button the user pressed expecting a flash-close prompt, so the
     * same setting would apply on one venue and not the other. `confirmAs`
     * carries the user's intent past that difference.
     */
    const policyForFlashClose = (intent: OrderIntent) =>
        (intent.confirmAs ?? mutatingActionOf(intent.payload) ?? "") === "flash-close-position";

    it("asks the flash-close question on the native payload", () => {
        registerConfirmationCheck(policyForFlashClose);
        const intent = { ...closeIntent(), confirmAs: "flash-close-position" };

        const verdict = orderGate.verify(intent);

        expect(verdict.refusal?.reason).toBe("unconfirmed");
        expect(verdict.refusal?.values.action).toBe("flash-close-position");
    });

    it("asks the same question when the payload says place-order", () => {
        registerConfirmationCheck(policyForFlashClose);
        const intent = { ...closeIntent(), confirmAs: "flash-close-position" };
        // The generic venue path: a reduce-only market order, not a native
        // flash close.
        intent.payload = { ...intent.payload, type: "place-order" };

        const verdict = orderGate.verify(intent);

        expect(verdict.refusal?.reason).toBe("unconfirmed");
        expect(verdict.refusal?.values.action).toBe("flash-close-position");
    });

    it("sends on either path once confirmed", () => {
        registerConfirmationCheck(policyForFlashClose);
        const confirmedAt = Date.now();

        for (const type of ["flash-close-position", "place-order"]) {
            const intent = {
                ...closeIntent(),
                confirmAs: "flash-close-position",
                confirmedAt,
            };
            intent.payload = { ...intent.payload, type };

            expect(orderGate.verify(intent).approved).toBe(true);
        }
    });

    it("leaves an unrelated action alone", () => {
        registerConfirmationCheck(policyForFlashClose);
        // No `confirmAs`: the wire action stands, and it is not flash close.
        const intent = closeIntent();
        intent.payload = { ...intent.payload, type: "place-order" };

        expect(orderGate.verify(intent).approved).toBe(true);
    });
});
