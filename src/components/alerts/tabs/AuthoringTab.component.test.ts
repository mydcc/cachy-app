// @vitest-environment happy-dom
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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0817 — what only the mounted tab can prove.
 *
 * The modules under `lib/ai/ruleAuthoring/` are tested on their own, and they
 * take the payload's four parts as parameters with no store access at all.
 * That is the right shape, but it also means those tests cannot prove the
 * claim a reviewer actually cares about: that the call path *which does* have
 * store access still sends nothing else. Only a mounted component has that
 * access, so the proof belongs here.
 *
 * The method is to plant. Every store this component reads is handed values
 * tagged `PLANTED_`, including the strategy draft's stop, its lineage hash and
 * a private note — Class A data under ADR-0001, each one a field a careless
 * `JSON.stringify(draft)` would have carried off the device. One assertion
 * then covers the whole class: the bytes handed to the transport contain no
 * `PLANTED_` at all. A Class A field added to `RuleDocument` tomorrow is
 * caught by the same line, without anyone remembering to extend a denylist.
 *
 * The model is mocked and the port is real. Mocking `requestRuleDraft` would
 * have made this a test of the mock: the egress gate, the parser and the
 * four-field builder all have to run for the assertions below to mean
 * anything. `authoringTransport` is the only seam, and it is exactly the seam
 * ADR-0030 draws — everything on this side of it is Cachy's, everything on
 * the far side is the provider's.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

import en from "../../../locales/locales/en.json";

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>(
            (acc, part) => (acc as Record<string, unknown>)?.[part],
            en,
        ) as string;
}

vi.mock("../../../locales/i18n", async () => {
    const { readable, writable } = await import("svelte/store");
    const translate = (
        key: string,
        vars?: { values?: Record<string, unknown> },
    ) => {
        const template = lookup(key) ?? key;
        if (!vars?.values) return template;
        return template.replace(/\{(\w+)\}/g, (_, name: string) =>
            String(vars.values?.[name] ?? ""),
        );
    };
    return {
        _: readable(translate),
        locale: writable("en"),
        setLocale: vi.fn(),
    };
});

const mocks = vi.hoisted(() => ({
    transport: vi.fn(),
    armRule: vi.fn(),
    resolveChatTarget: vi.fn(),
    validate: vi.fn(),
    renderRuleSentence: vi.fn(),
    showToast: vi.fn(),
    setConditionGroup: vi.fn(),
    setVeto: vi.fn(),
    setModelProvenance: vi.fn(),
    /** Set per test *before* mount; the component reads it in a `$derived`. */
    settings: { aiRuleAuthoringEgress: true },
    draft: {} as Record<string, unknown>,
    panel: { activeTab: "authoring" },
}));

/*
 * The draft the panel shell would have built, plus the Class A fields a real
 * one carries. `trigger_timeframe` is the one value the payload is allowed to
 * take from here; everything else is bait.
 */
function plantedDraft(): Record<string, unknown> {
    return {
        id: "PLANTED_RULE_ID",
        name: "PLANTED_RULE_NAME",
        symbol: "PLANTED_DRAFT_SYMBOL",
        trigger_timeframe: "1h",
        schema_version: 3,
        enabled: true,
        conditions: { kind: "group", op: "and", children: [] },
        // Class A, every one of them.
        notes: "PLANTED_PRIVATE_NOTE",
        stop: { kind: "price", value: "PLANTED_STOP_41999" },
        derived_from_hash: "PLANTED_LINEAGE_HASH",
        action: {
            consequence_level: "notify",
            size_basis: "PLANTED_SIZE_BASIS",
            balance: "PLANTED_BALANCE_12345",
        },
        journal: [{ entry: "PLANTED_JOURNAL_ENTRY" }],
        position: { entryPrice: "PLANTED_ENTRY_41000" },
        provenance: { source: "human", created_at_ms: 1 },
    };
}

vi.mock("../../../stores/alertPanel.svelte", () => ({
    alertPanelState: {
        get draft() {
            return mocks.draft;
        },
        get activeTab() {
            return mocks.panel.activeTab;
        },
        set activeTab(value: string) {
            mocks.panel.activeTab = value;
        },
        setConditionGroup: mocks.setConditionGroup,
        setVeto: mocks.setVeto,
        setModelProvenance: mocks.setModelProvenance,
    },
}));

vi.mock("../../../stores/alerts.svelte", () => ({
    alertState: { rulesVersion: 0 },
}));

vi.mock("../../../stores/settings.svelte", () => ({
    settingsState: {
        get aiRuleAuthoringEgress() {
            return mocks.settings.aiRuleAuthoringEgress;
        },
    },
}));

vi.mock("../../../stores/ai.svelte", () => ({
    aiState: {
        // Deliberately laced: if the component ever put this straight into the
        // payload instead of asking `resolveChatTarget` for a target, the
        // planted guard below would catch it.
        resolveInput: () => ({ apiKey: "PLANTED_API_KEY" }),
    },
}));

vi.mock("../../../stores/ui.svelte", () => ({
    uiState: { showToast: mocks.showToast },
}));

vi.mock("../../../lib/ai/completion", () => ({
    resolveChatTarget: mocks.resolveChatTarget,
}));

vi.mock("../../../lib/ai/ruleAuthoring/authoringTransport", () => ({
    authoringTransport: mocks.transport,
}));

vi.mock("../../../lib/rules/ruleSchema", () => ({
    ruleSchema: {
        isReady: () => true,
        schemaVersion: () => 3,
        validate: mocks.validate,
    },
    isRuleRefusedError: (error: unknown): boolean =>
        typeof error === "object" && error !== null && "refusals" in error,
}));

vi.mock("../../../lib/rules/ruleSentence", () => ({
    renderRuleSentence: mocks.renderRuleSentence,
}));

vi.mock("../../../services/alertEngine/armRule", () => ({
    armRule: mocks.armRule,
}));

vi.mock("../../../services/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import AuthoringTab from "./AuthoringTab.svelte";

const PROSE = "long above short on the hourly, no entry while funding is hot";

/** A reply the real parser accepts, so the port runs end to end. */
const MODEL_REPLY = JSON.stringify({
    ok: true,
    draft: {
        name: "Hourly cross",
        conditions: { kind: "group", op: "and", children: [] },
        notes: "watch the funding leg",
    },
});

function mountTab(): { host: HTMLElement; component: unknown } {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const component = mount(AuthoringTab, {
        target: host,
        props: { symbol: "BTCUSDT" },
    });
    flushSync();
    return { host, component };
}

function sendButton(host: HTMLElement): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(".actions .send-btn");
    if (!button) throw new Error("send button not rendered");
    return button;
}

function typeProse(host: HTMLElement, text: string): void {
    const textarea = host.querySelector<HTMLTextAreaElement>(".prose-input");
    if (!textarea) throw new Error("prose input not rendered");
    textarea.value = text;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

/** Let the port's awaited transport settle, then re-render. */
async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();
}

/**
 * What the model is *told*, as bytes.
 *
 * The messages only, and that narrowing is the point. The transport is handed
 * two things, and they sit on different sides of a boundary. The messages are
 * what the provider learns about this trader's strategy. The target is the
 * request's own auth, and it carries the provider credential — ADR-0001's
 * stated key exception, the credential of a request the trader initiated.
 *
 * Folding the target in here would fail the planted-field assertion below on
 * the one value that is *supposed* to travel, and would bury the question
 * worth asking: beyond the four closed parts, what does the provider learn?
 * Nothing — and that is what these bytes prove.
 */
function sentBytes(): string {
    expect(mocks.transport).toHaveBeenCalledTimes(1);
    const [target, messages] = mocks.transport.mock.calls[0];
    // The provider actually reached is the resolved browser-direct one. A
    // relay target would mean the gate let strategy prose take the Cachy hop.
    expect(target.kind).toBe("direct");
    return JSON.stringify(messages);
}

describe("AuthoringTab (FEAT-0817)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = "";
        mocks.settings.aiRuleAuthoringEgress = true;
        mocks.draft = plantedDraft();
        mocks.panel.activeTab = "authoring";
        mocks.transport.mockResolvedValue(MODEL_REPLY);
        mocks.renderRuleSentence.mockReturnValue("the rendered sentence");
        mocks.validate.mockImplementation((doc: unknown) => doc);
        mocks.resolveChatTarget.mockReturnValue({
            kind: "direct",
            label: "Test Provider",
            baseUrl: "https://provider.example/v1",
            model: "test-model",
            apiKey: "PLANTED_API_KEY",
        });
    });

    it("names the recipient and the whole payload before anything is sent", () => {
        const { host, component } = mountTab();

        const preview = host.querySelector(".payload");
        expect(preview).not.toBeNull();
        // The market under discussion is the prop the shell passed, not the
        // one sitting in the draft: the preview must name what the trader
        // reads in the panel header.
        expect(preview?.textContent).toContain("BTCUSDT");
        expect(preview?.textContent).toContain("1h");
        expect(host.querySelector(".recipient")?.textContent).toContain(
            "https://provider.example/v1",
        );
        // ADR-0030 decision 4: shown *before* a first request exists.
        expect(mocks.transport).not.toHaveBeenCalled();

        unmount(component as never);
    });

    it("sends the prose, symbol, timeframe and language — and no Class A field", async () => {
        const { host, component } = mountTab();
        typeProse(host, PROSE);
        sendButton(host).click();
        await settle();

        const bytes = sentBytes();

        // Not vacuous: the four parts really did travel.
        expect(bytes).toContain(PROSE);
        expect(bytes).toContain("BTCUSDT");
        expect(bytes).toContain("1h");
        expect(bytes).toContain("rsi");

        // And nothing else did. Every planted field — the stop, the lineage
        // hash, the private note, the balance, the journal, the open position,
        // the draft's own symbol and the provider credential — is absent.
        expect(bytes).not.toContain("PLANTED_");

        unmount(component as never);
    });

    it("refuses to send while the authoring switch is off", () => {
        mocks.settings.aiRuleAuthoringEgress = false;
        const { host, component } = mountTab();

        typeProse(host, PROSE);
        expect(sendButton(host).disabled).toBe(true);
        // Clicked anyway: a disabled attribute is a UI state, not the gate.
        sendButton(host).click();
        flushSync();
        expect(mocks.transport).not.toHaveBeenCalled();
        expect(
            host.querySelector(".banner")?.textContent?.length,
        ).toBeGreaterThan(0);

        unmount(component as never);
    });

    it("names the relay instead of quietly falling back to it", () => {
        mocks.resolveChatTarget.mockReturnValue({
            kind: "relay",
            label: "Relay Provider",
            endpoint: "/api/ai/chat",
            model: "relayed-model",
        });
        const { host, component } = mountTab();

        typeProse(host, PROSE);
        const refused = host.querySelector(".banner--refused");
        expect(refused?.textContent).toContain("Relay Provider");
        expect(sendButton(host).disabled).toBe(true);
        sendButton(host).click();
        flushSync();
        expect(mocks.transport).not.toHaveBeenCalled();

        unmount(component as never);
    });

    it("lists a refusal under every field the core named", async () => {
        mocks.validate.mockImplementation(() => {
            throw {
                refusals: [
                    {
                        code: "LookbackOutOfRange",
                        field: "conditions",
                        i18n_key: "rules.refusal.lookbackOutOfRange",
                    },
                    {
                        code: "UnknownIndicator",
                        field: "veto",
                        i18n_key: "rules.refusal.unknownIndicator",
                    },
                ],
            };
        });

        const { host, component } = mountTab();
        typeProse(host, PROSE);
        sendButton(host).click();
        await settle();

        const refusals = host.querySelector(".refusals");
        const fields = [...(refusals?.querySelectorAll("code") ?? [])].map(
            (node) => node.textContent,
        );
        expect(fields).toEqual(["conditions", "veto"]);
        // A draft the core refused is neither adoptable nor storable.
        const buttons = [
            ...host.querySelectorAll<HTMLButtonElement>(
                ".draft .actions button",
            ),
        ];
        expect(buttons.length).toBe(2);
        expect(buttons.every((button) => button.disabled)).toBe(true);

        unmount(component as never);
    });

    it("stores a draft disarmed, and storing is not arming", async () => {
        const { host, component } = mountTab();
        typeProse(host, PROSE);
        sendButton(host).click();
        await settle();

        const saveButton = host.querySelector<HTMLButtonElement>(
            ".draft .actions .ghost-btn",
        );
        expect(saveButton?.disabled).toBe(false);
        saveButton?.click();
        flushSync();

        expect(mocks.armRule).toHaveBeenCalledTimes(1);
        const stored = mocks.armRule.mock.calls[0][0] as Record<
            string,
            unknown
        >;
        // ADR-0030 decision 5: saving is one act, arming is the other.
        expect(stored.enabled).toBe(false);
        expect(stored.provenance).toMatchObject({
            source: "model",
            model: "test-model",
        });

        unmount(component as never);
    });
});
