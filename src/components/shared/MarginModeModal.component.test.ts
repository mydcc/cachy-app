// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * Regression: a broker refresh landing mid-dialog (chip-open re-read, WS
 * bridge) moved the live `current*` props, and the draft-vs-live diff
 * un-picked what the user had just selected — Confirm silently sent
 * nothing although cards were selected. Drafts compare against a frozen
 * mount baseline instead.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

vi.mock("../shared/ModalFrame.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
}));

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string, options?: { values?: Record<string, unknown> }) => {
            const template = lookup(key) ?? key;
            if (!options?.values) return template;
            return Object.entries(options.values).reduce(
                (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
                template,
            );
        }),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import MarginModeRefreshWrapper from "../../tests/helpers/MarginModeRefreshWrapper.svelte";

type Changes = { marginMode?: "ISOLATION" | "CROSS"; positionMode?: "ONE_WAY" | "HEDGE" };

let host: HTMLElement;
let component: { refresh: (
    margin: "ISOLATION" | "CROSS" | undefined,
    position: "ONE_WAY" | "HEDGE" | undefined,
) => void; bump: () => void } | null = null;
const onconfirm = vi.fn<(changes: Changes) => void>();

async function settle(rounds = 6) {
    for (let i = 0; i < rounds; i++) {
        flushSync();
        await Promise.resolve();
    }
    flushSync();
}

async function render() {
    component = mount(MarginModeRefreshWrapper, {
        target: host,
        props: {
            onconfirm,
            initialMargin: "ISOLATION",
            initialPosition: "ONE_WAY",
        },
    }) as never;
    await settle();
}

function button(trackId: string): HTMLButtonElement | null {
    return host.querySelector(`[data-track-id="${trackId}"]`);
}

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

describe("MarginModeModal — mid-dialog refresh keeps the picks", () => {
    it("sends both picks without any refresh", async () => {
        await render();
        button("btn-margin-mode-cross")?.click();
        await settle();
        button("btn-position-mode-hedge")?.click();
        await settle();
        button("btn-mode-confirm")?.click();
        await settle();

        expect(onconfirm).toHaveBeenCalledTimes(1);
        expect(onconfirm).toHaveBeenCalledWith({ marginMode: "CROSS", positionMode: "HEDGE" });
    });

    it("keeps a margin pick when the refresh confirms the same value", async () => {
        await render();
        button("btn-margin-mode-cross")?.click();
        await settle();
        // Broker already holds CROSS; the chip-open re-read lands now.
        component?.refresh("CROSS", "ONE_WAY");
        await settle();

        expect(button("btn-mode-confirm")?.disabled).toBe(false);
        button("btn-mode-confirm")?.click();
        await settle();

        expect(onconfirm).toHaveBeenCalledWith({ marginMode: "CROSS", positionMode: undefined });
    });

    it("resends only the open half when retrying a half-applied change", async () => {
        await render();
        button("btn-margin-mode-cross")?.click();
        await settle();
        button("btn-position-mode-hedge")?.click();
        await settle();
        // Margin write landed and its re-read is in; position write failed.
        component?.refresh("CROSS", "ONE_WAY");
        await settle();
        component?.bump();
        await settle();
        button("btn-mode-confirm")?.click();
        await settle();

        expect(onconfirm).toHaveBeenCalledWith({ marginMode: undefined, positionMode: "HEDGE" });
    });

    it("keeps both picks when the refresh lands after selecting", async () => {
        await render();
        button("btn-margin-mode-cross")?.click();
        await settle();
        button("btn-position-mode-hedge")?.click();
        await settle();
        component?.refresh("CROSS", "ONE_WAY");
        await settle();
        button("btn-mode-confirm")?.click();
        await settle();

        expect(onconfirm).toHaveBeenCalledWith({ marginMode: "CROSS", positionMode: "HEDGE" });
    });
});
