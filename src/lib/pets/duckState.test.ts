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

import { describe, expect, it, vi } from "vitest";
import type { DuckTriggerEvent } from "./types";
import {
    createDuckNotifier,
    DUCK_STATE_STORAGE_KEY,
    forwardDuckEvent,
    isDuckResetStorageEvent,
    shouldHandleDuckEvent,
} from "./duckState";

const EVENTS: DuckTriggerEvent[] = [
    { type: "feed", amount: 10 },
    { type: "trade_win", pnl: 100 },
    { type: "trade_loss", pnl: -100 },
    { type: "daily_login" },
    { type: "academy_complete", lessonId: "lesson-1" },
    { type: "onboarding_step", step: 0 },
    { type: "onboarding_complete" },
    { type: "pet" },
];

describe("shouldHandleDuckEvent", () => {
    it("drops every event while the duck is hidden", () => {
        for (const event of EVENTS) {
            expect(shouldHandleDuckEvent(event, false, true)).toBe(false);
        }
    });

    it("drops trade events while trade reactions are off", () => {
        for (const event of EVENTS) {
            const isTrade =
                event.type === "trade_win" || event.type === "trade_loss";
            expect(shouldHandleDuckEvent(event, true, false)).toBe(!isTrade);
        }
    });

    it("passes every event while the duck is shown and reactions are on", () => {
        for (const event of EVENTS) {
            expect(shouldHandleDuckEvent(event, true, true)).toBe(true);
        }
    });
});

describe("forwardDuckEvent", () => {
    it("does not touch the logic while the duck is hidden", () => {
        const logic = { handleEvent: vi.fn() };
        expect(
            forwardDuckEvent(logic, { type: "feed", amount: 10 }, false, true),
        ).toBe(false);
        expect(logic.handleEvent).not.toHaveBeenCalled();
    });

    it("does not forward trade events while reactions are off", () => {
        const logic = { handleEvent: vi.fn() };
        expect(
            forwardDuckEvent(
                logic,
                { type: "trade_win", pnl: 100 },
                true,
                false,
            ),
        ).toBe(false);
        expect(logic.handleEvent).not.toHaveBeenCalled();
    });

    it("forwards allowed events and reports that work started", () => {
        const logic = { handleEvent: vi.fn() };
        expect(
            forwardDuckEvent(logic, { type: "feed", amount: 10 }, true, true),
        ).toBe(true);
        expect(logic.handleEvent).toHaveBeenCalledWith({
            type: "feed",
            amount: 10,
        });
    });
});

describe("createDuckNotifier", () => {
    it("suppresses toasts while disabled and forwards them while enabled", () => {
        let enabled = false;
        const toasts = { success: vi.fn(), warning: vi.fn() };
        const notifier = createDuckNotifier(() => enabled, toasts);

        notifier.success("hidden");
        notifier.warning("hidden");
        expect(toasts.success).not.toHaveBeenCalled();
        expect(toasts.warning).not.toHaveBeenCalled();

        enabled = true;
        notifier.success("shown");
        notifier.warning("shown");
        expect(toasts.success).toHaveBeenCalledWith("shown");
        expect(toasts.warning).toHaveBeenCalledWith("shown");
    });
});

describe("isDuckResetStorageEvent", () => {
    it("is true only for the duck key being removed", () => {
        expect(
            isDuckResetStorageEvent({
                key: DUCK_STATE_STORAGE_KEY,
                newValue: null,
            }),
        ).toBe(true);
        expect(
            isDuckResetStorageEvent({
                key: DUCK_STATE_STORAGE_KEY,
                newValue: '{"xp":0}',
            }),
        ).toBe(false);
        expect(
            isDuckResetStorageEvent({ key: "other-key", newValue: null }),
        ).toBe(false);
    });
});
