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
 * store access still sends nothing else, and still writes nothing it should
 * not. Only a mounted component has that access, so the proof belongs here.
 *
 * The method for the egress half is to plant. Every store this component
 * reads is handed values tagged `PLANTED_`, including the strategy draft's
 * stop, its lineage hash and a private note — Class A data under ADR-0001,
 * each one a field a careless `JSON.stringify(draft)` would have carried off
 * the device. One assertion then covers the whole class: the bytes handed to
 * the transport contain no `PLANTED_` at all. A Class A field added to
 * `RuleDocument` tomorrow is caught by the same line, without anyone
 * remembering to extend a denylist.
 *
 * The model is mocked and the port is real. Mocking `requestRuleDraft` would
 * have made this a test of the mock: the egress gate, the parser and the
 * four-field builder all have to run for the assertions below to mean
 * anything. `authoringTransport` is the only seam, and it is exactly the seam
 * ADR-0030 draws — everything on this side of it is Cachy's, everything on
 * the far side is the provider's.
 *
 * The second half of the file is regression cover for the review of #4608,
 * where four of these cases were live defects. Each one is written as the
 * behaviour, not as "the bug": a store write that lands on the wrong rule, a
 * single condition that vanishes, a draft that saves yesterday's settings,
 * and a refusal that cannot be read because rendering it threw.
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
    readRuleStore: vi.fn(),
    freeRuleId: vi.fn(),
    resolveChatTarget: vi.fn(),
    validate: vi.fn(),
    renderRuleSentence: vi.fn(),
    showToast: vi.fn(),
    adoptModelDraft: vi.fn(),
    /** Set per test *before* mount; the component reads it in a `$derived`. */
    settings: { aiRuleAuthoringEgress: true },
    draft: {} as Record<string, unknown>,
    panel: { activeTab: "authoring" },
}));

/*
 * The draft the panel shell would have built, plus the Class A fields a real
 * one carries. `trigger_timeframe` is the one value the payload is allowed to
 * take from here; everything else is bait.
 *
 * `id` matters twice over: it is bait for the egress assertion, and it is the
 * id of a *stored* rule, because `loadForEdit` leaves one here when a trader
 * opens an existing alert for editing. A save that reused it would replace
 * that alert.
 */
function plantedDraft(): Record<string, unknown> {
    return {
        id: "PLANTED_RULE_ID",
        name: "PLANTED_RULE_NAME",
        symbol: "PLANTED_DRAFT_SYMBOL",
        trigger_timeframe: "1h",
        schema_version: 3,
        enabled: true,
        frequency: "once",
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
        adoptModelDraft: mocks.adoptModelDraft,
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

// Both exports are needed: the component reads the store to pick a free id,
// and a module mock that omitted `readRuleStore` would make the call throw
// into the component's own catch — which reads as "storing failed" and hides
// whatever the test meant to check.
vi.mock("../../../services/alertEngine/armRule", () => ({
    armRule: mocks.armRule,
    readRuleStore: mocks.readRuleStore,
}));

vi.mock("../../../services/alertEngine/ruleIdentity", () => ({
    freeRuleId: mocks.freeRuleId,
}));

vi.mock("../../../services/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import AuthoringTab from "./AuthoringTab.svelte";

const PROSE = "long above short on the hourly, no entry while funding is hot";

const GROUP_CONDITION = { kind: "group", op: "all", of: [] };

/** A reply the real parser accepts, so the port runs end to end. */
const MODEL_REPLY = JSON.stringify({
    ok: true,
    draft: {
        name: "Hourly cross",
        conditions: GROUP_CONDITION,
        notes: "watch the funding leg",
    },
});

/** The same, with one ungrouped condition — which the language allows. */
const SINGLE_CONDITION_REPLY = JSON.stringify({
    ok: true,
    draft: {
        name: "RSI floor",
        conditions: {
            kind: "compare",
            left: { kind: "indicator", indicator: { id: "rsi", params: {} } },
            op: "lt",
            right: { kind: "constant", value: "30" },
            timeframe: "1h",
        },
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

function adoptButton(host: HTMLElement): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
        ".draft .actions .send-btn",
    );
    if (!button) throw new Error("adopt button not rendered");
    return button;
}

function saveButton(host: HTMLElement): HTMLButtonElement {
    const button = host.querySelector<HTMLButtonElement>(
        ".draft .actions .ghost-btn",
    );
    if (!button) throw new Error("save button not rendered");
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

/** Ask once and wait for the answer to land. */
async function ask(host: HTMLElement): Promise<void> {
    typeProse(host, PROSE);
    sendButton(host).click();
    await settle();
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

/** The document the component handed to the store. */
function stored(call = 0): Record<string, unknown> {
    return mocks.armRule.mock.calls[call][0] as Record<string, unknown>;
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
        mocks.readRuleStore.mockReturnValue([{ id: "PLANTED_RULE_ID" }]);
        mocks.freeRuleId.mockReturnValue("ai-draft-1");
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
        await ask(host);

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

    it("tells the model which veto feeds exist, so it cannot invent one", async () => {
        const { host, component } = mountTab();
        await ask(host);

        const bytes = sentBytes();
        // A feed id outside this list has no source in the build, so the core
        // would accept the veto and the loop would drop it at every
        // evaluation — the alert fires unsuppressed. The real ids are named
        // so the model has no reason to guess.
        expect(bytes).toContain("funding_rate");
        expect(bytes).toContain("open_interest_change");
        expect(bytes).toContain("fear_greed");

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
        await ask(host);

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

    it("still shows the refusals when the refused draft cannot be read back", async () => {
        // The refusal branch keeps the rejected document on purpose, and a
        // rejected document can be malformed in ways the sentence renderer
        // does not survive — a `compare` with no `right` reaches
        // `formatOperand` as undefined. The refusal list is the output that
        // must not be lost with it.
        mocks.renderRuleSentence.mockImplementation(() => {
            throw new TypeError("Cannot read properties of undefined");
        });
        mocks.validate.mockImplementation(() => {
            throw {
                refusals: [
                    {
                        code: "MissingOperand",
                        field: "conditions",
                        i18n_key: "rules.refusal.missingOperand",
                    },
                ],
            };
        });

        const { host, component } = mountTab();
        await ask(host);

        const fields = [
            ...(host.querySelector(".refusals")?.querySelectorAll("code") ?? []),
        ].map((node) => node.textContent);
        expect(fields).toEqual(["conditions"]);
        expect(host.querySelector(".sentence-text")?.textContent).toBe("");

        unmount(component as never);
    });

    it("adopts a single ungrouped condition as a group the builder can edit", async () => {
        mocks.transport.mockResolvedValue(SINGLE_CONDITION_REPLY);
        const { host, component } = mountTab();
        await ask(host);

        adoptButton(host).click();
        flushSync();

        expect(mocks.adoptModelDraft).toHaveBeenCalledTimes(1);
        const adopted = mocks.adoptModelDraft.mock.calls[0][0] as {
            conditions: { kind: string; op: string; of: unknown[] };
        };
        // `setConditionGroup` replaces a bare condition with an *empty* group,
        // deliberately. Handing it one would lose the model's work between the
        // sentence the trader read and the builder that opened.
        expect(adopted.conditions.kind).toBe("group");
        expect(adopted.conditions.of).toHaveLength(1);

        unmount(component as never);
    });

    it("stores a draft disarmed, and storing is not arming", async () => {
        const { host, component } = mountTab();
        await ask(host);

        expect(saveButton(host).disabled).toBe(false);
        saveButton(host).click();
        flushSync();

        expect(mocks.armRule).toHaveBeenCalledTimes(1);
        // ADR-0030 decision 5: saving is one act, arming is the other.
        expect(stored().enabled).toBe(false);
        expect(stored().provenance).toMatchObject({
            source: "model",
            model: "test-model",
        });

        unmount(component as never);
    });

    it("never stores a draft under the id of the rule being edited", async () => {
        const { host, component } = mountTab();
        await ask(host);
        saveButton(host).click();
        flushSync();

        // `armRule` upserts by id and the panel draft carries a stored rule's
        // id whenever one was loaded for editing. Writing under it would
        // replace a live alert with a disarmed AI draft and stop it firing.
        expect(mocks.freeRuleId).toHaveBeenCalledTimes(1);
        expect(stored().id).toBe("ai-draft-1");
        expect(stored().id).not.toBe(mocks.draft.id);

        unmount(component as never);
    });

    it("updates the same rule when the same answer is saved twice", async () => {
        const { host, component } = mountTab();
        await ask(host);

        saveButton(host).click();
        flushSync();
        saveButton(host).click();
        flushSync();

        expect(mocks.armRule).toHaveBeenCalledTimes(2);
        // One free id for one answer: a second save must not leave a
        // near-identical twin for the trader to arm by mistake.
        expect(mocks.freeRuleId).toHaveBeenCalledTimes(1);
        expect(stored(1).id).toBe(stored(0).id);

        unmount(component as never);
    });

    it("stores the lifecycle fields as they stand at save time", async () => {
        const { host, component } = mountTab();
        await ask(host);

        // The footer keeps editing the panel draft while this tab holds an
        // answer. A candidate frozen when the reply arrived would store the
        // frequency the trader had before they changed it.
        mocks.draft.frequency = "always";
        saveButton(host).click();
        flushSync();

        expect(stored().frequency).toBe("always");
        // And the model's contribution is still on top of it.
        expect(stored().name).toBe("Hourly cross");

        unmount(component as never);
    });

    it("reports a refusal raised by the recomposed document instead of storing it", async () => {
        const { host, component } = mountTab();
        await ask(host);

        // The document composed at save time is not the one the core already
        // approved: its lifecycle fields are the live ones, so it is asked
        // again — and a refusal must stop the write.
        mocks.validate.mockImplementation(() => {
            throw {
                refusals: [
                    {
                        code: "ExpiryInPast",
                        field: "expires_at_ms",
                        i18n_key: "rules.refusal.expiryInPast",
                    },
                ],
            };
        });
        saveButton(host).click();
        flushSync();

        expect(mocks.armRule).not.toHaveBeenCalled();
        const fields = [
            ...(host.querySelector(".refusals")?.querySelectorAll("code") ?? []),
        ].map((node) => node.textContent);
        expect(fields).toEqual(["expires_at_ms"]);

        unmount(component as never);
    });
});
