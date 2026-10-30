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
 * FEAT-0748 — trying a rule's channels must not spend the rule.
 *
 * The load-bearing assertion is the last one: a `once` rule tested at 09:00
 * still has to fire at 10:00. Everything else here checks that the test tells
 * the truth about where it went.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true }));

vi.mock("./logger", () => ({
    logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("./toastService.svelte", () => ({
    toastService: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("../locales/i18n", () => ({
    _: {
        subscribe: (run: (v: unknown) => void) => {
            run((key: string, options?: { values?: Record<string, unknown> }) =>
                options?.values ? `${key}::${JSON.stringify(options.values)}` : key,
            );
            return () => {};
        },
    },
}));

const { mockNotify } = vi.hoisted(() => ({
    mockNotify: vi.fn(() => ["in-app"]),
}));

vi.mock("./notificationService.svelte", () => ({
    notificationService: { notify: mockNotify },
}));

import type { RuleDocument } from "../lib/rules/types";
import { notificationPolicyStore } from "../stores/notifications.svelte";
import { externalChannelsStore } from "../stores/externalChannels.svelte";
import { readRuleState, recordRuleFiring } from "./alertEngine/ruleStateStore";
import { sendTestAnnouncement } from "./alertTest";

const ANCHOR = 1_800_000_000_000;

function ruleDoc(overrides: Partial<RuleDocument> = {}): RuleDocument {
    return {
        schema_version: 2,
        id: "rule-test",
        name: "Support retest",
        symbol: "BTCUSDT",
        trigger_timeframe: "1m",
        conditions: {
            kind: "compare",
            left: { kind: "price", field: "close" },
            op: "gte",
            right: { kind: "constant", value: "72000" },
            timeframe: "1m",
        },
        action: { consequence_level: "notify" } as RuleDocument["action"],
        provenance: { source: "human", created_at_ms: ANCHOR - 1_000 },
        ...overrides,
    };
}

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mockNotify.mockReturnValue(["in-app"]);
    notificationPolicyStore.reset();
    externalChannelsStore.reload();
});

describe("sendTestAnnouncement", () => {
    it("goes through the notification service, labelled as a test", () => {
        sendTestAnnouncement(ruleDoc());

        expect(mockNotify).toHaveBeenCalledTimes(1);
        const request = mockNotify.mock.calls[0][0] as Record<string, unknown>;
        expect(request.test).toBe(true);
        expect(request.exactChannels).toBe(true);
        expect(String(request.message)).toContain("dashboard.alerts.testAnnouncement");
    });

    it("names the channels the rule would use", () => {
        notificationPolicyStore.setChannel("alert-fired", "discord", true);
        externalChannelsStore.setDiscord({
            enabled: true,
            webhookUrl: "https://discord.com/api/webhooks/123456789/abcdefQWERTY-_",
            format: "minimal",
        });

        sendTestAnnouncement(ruleDoc({ trigger_methods: ["in_app", "discord"] }));

        const request = mockNotify.mock.calls[0][0] as Record<string, unknown>;
        expect(request.localChannels).toEqual(["in-app"]);
        expect(request.externalChannels).toEqual(["discord"]);
    });

    it("leaves fired_count, the anchor and the rule itself untouched", () => {
        recordRuleFiring("rule-test", ANCHOR);
        const before = readRuleState("rule-test");
        const rule = ruleDoc({ enabled: true });
        const ruleBefore = JSON.stringify(rule);

        sendTestAnnouncement(rule);

        const after = readRuleState("rule-test");
        expect(after.fired_count).toBe(before.fired_count);
        expect(after.last_fired_anchor_ms).toBe(before.last_fired_anchor_ms);
        expect(JSON.stringify(rule)).toBe(ruleBefore);
        expect(mockNotify).toHaveBeenCalledTimes(1);
    });
});
