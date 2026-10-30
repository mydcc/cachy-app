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

/**
 * FEAT-0748 — the test send's rate limit, through the real service.
 *
 * `alertDelivery.test.ts` mocks the service to prove the rule state is left
 * alone; this file does the opposite, because the stable `test:<ruleId>` key is
 * the throttle the item promised and a mocked service can never exercise it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("../services/logger", () => ({
    logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const toastMock = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    add: vi.fn(),
}));
vi.mock("../services/toastService.svelte", () => ({ toastService: toastMock }));

const soundMock = vi.hoisted(() => ({ play: vi.fn(() => true) }));
vi.mock("../services/soundChannel.svelte", () => ({ soundChannel: soundMock }));

const externalMock = vi.hoisted(() => ({ dispatchExternal: vi.fn() }));
vi.mock("../services/externalDelivery", () => externalMock);

vi.mock("../locales/i18n", () => ({
    _: {
        subscribe: (run: (v: unknown) => void) => {
            run((key: string) => key);
            return () => {};
        },
    },
}));

import type { RuleDocument } from "../lib/rules/types";
import { externalChannelsStore } from "./externalChannels.svelte";
import { notificationPolicyStore } from "./notifications.svelte";
import { notificationService } from "../services/notificationService.svelte";
import { sendTestAnnouncement } from "./alertDelivery";

function rule(id: string): RuleDocument {
    return {
        schema_version: 2,
        id,
        name: id,
        symbol: "BTCUSDT",
        trigger_timeframe: "1m",
        trigger_methods: ["discord"],
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "72000" },
            timeframe: "1m",
        },
        action: { consequence_level: "notify" } as RuleDocument["action"],
        provenance: { source: "human", created_at_ms: 1 },
    };
}

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    notificationService.reset();
    notificationPolicyStore.reset();
    externalChannelsStore.reload();
    externalChannelsStore.setDiscord({
        enabled: true,
        webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_",
        format: "minimal",
    });
    notificationPolicyStore.setChannel("alert-fired", "discord", true);
});

describe("the test send reuses the duplicate window as its rate limit", () => {
    it("sends once and reports the suppression on the second press", () => {
        const first = sendTestAnnouncement(rule("rule-a"));
        const second = sendTestAnnouncement(rule("rule-a"));

        expect(first.duplicate).toBe(false);
        expect(second.duplicate).toBe(true);
        expect(second.delivered).toEqual([]);
        expect(externalMock.dispatchExternal).toHaveBeenCalledTimes(1);
    });

    it("sends again once the window has passed", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-10-30T10:00:00Z"));
        try {
            expect(sendTestAnnouncement(rule("rule-a")).duplicate).toBe(false);

            vi.setSystemTime(new Date("2026-10-30T10:01:01Z"));
            expect(sendTestAnnouncement(rule("rule-a")).duplicate).toBe(false);

            expect(externalMock.dispatchExternal).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });

    it("lets two different rules each send their own test", () => {
        sendTestAnnouncement(rule("rule-a"));
        sendTestAnnouncement(rule("rule-b"));

        expect(externalMock.dispatchExternal).toHaveBeenCalledTimes(2);
    });
});
