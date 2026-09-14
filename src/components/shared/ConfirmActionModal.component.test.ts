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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0346 — the confirmation dialog takes facts, not a question (FEAT-0024).
 * What matters here: every fact reaches the trader verbatim, the confirmation
 * carries the timestamp the order gate measures staleness from, and an
 * irreversible action says so.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

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

vi.mock("./ModalFrame.svelte", async () => ({
    default: (await import("../../tests/helpers/PassthroughModalFrame.svelte")).default,
}));

import ConfirmActionModal from "./ConfirmActionModal.svelte";

const FACTS = [
    { label: "Close", value: "0.5 BTC at 94 180" },
    { label: "Realised PnL", value: "−412.60 USDT", tone: "danger" as const },
];

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

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

function render(props: Record<string, unknown> = {}) {
    component = mount(ConfirmActionModal, {
        target: host,
        props: {
            isOpen: true,
            action: "close-position",
            facts: FACTS,
            onconfirm: vi.fn(),
            ...props,
        },
    }) as never;
    flushSync();
}

function buttonByText(text: string): HTMLButtonElement | null {
    return (
        [...host.querySelectorAll<HTMLButtonElement>("button")].find(
            (b) => b.textContent?.trim() === text,
        ) ?? null
    );
}

describe("FEAT-0346 — ConfirmActionModal shows the facts and stamps the moment", () => {
    it("renders each fact label and value", () => {
        render();

        expect(host.textContent).toContain("Close");
        expect(host.textContent).toContain("0.5 BTC at 94 180");
        expect(host.textContent).toContain("Realised PnL");
        expect(host.textContent).toContain("−412.60 USDT");
    });

    it("passes the confirmation timestamp to the caller", () => {
        const onconfirm = vi.fn();
        const before = Date.now();
        render({ onconfirm });

        buttonByText(lookup("settings.confirmations.dialog.confirm"))?.click();

        expect(onconfirm).toHaveBeenCalledTimes(1);
        const stamped = onconfirm.mock.calls[0][0];
        expect(typeof stamped).toBe("number");
        expect(stamped).toBeGreaterThanOrEqual(before);
        expect(stamped).toBeLessThanOrEqual(Date.now());
    });

    it("says when the action cannot be undone", () => {
        render({ irreversible: true });

        expect(host.textContent).toContain(lookup("settings.confirmations.dialog.irreversible"));
    });

    it("omits the warning for a reversible action", () => {
        render({ irreversible: false });

        expect(host.textContent).not.toContain(
            lookup("settings.confirmations.dialog.irreversible"),
        );
    });

    it("routes cancel to the caller without confirming", () => {
        const oncancel = vi.fn();
        const onconfirm = vi.fn();
        render({ oncancel, onconfirm });

        buttonByText(lookup("settings.confirmations.dialog.cancel"))?.click();

        expect(oncancel).toHaveBeenCalledTimes(1);
        expect(onconfirm).not.toHaveBeenCalled();
    });
});
