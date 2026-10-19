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
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * BUG-0704 — the warning line is the only user-visible part of the context
 * check. The helper and the queued batch are tested elsewhere; this pins the
 * text a trader actually reads, resolved against the real English catalogue.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
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
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import UnverifiedPriceWarning from "./UnverifiedPriceWarning.svelte";
import type { UnverifiedPrice } from "../../ai/actionContextCheck";

let host: HTMLElement;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    host.remove();
});

function render(props: {
    entries?: UnverifiedPrice[];
    unchecked?: boolean;
}) {
    const component = mount(UnverifiedPriceWarning, { target: host, props });
    flushSync();
    return component;
}

describe("UnverifiedPriceWarning", () => {
    it("names every flagged price, with the target index", () => {
        const component = render({
            entries: [
                { action: "setEntryPrice", value: "81859.7" },
                { action: "setTakeProfit", index: 1, value: "70000" },
            ],
        });

        const text = host.textContent ?? "";
        expect(text).toContain("Not confirmed by the context");
        expect(text).toContain("81859.7");
        expect(text).toContain("70000 (TP 2)");
        expect(host.querySelector('[role="status"]')).not.toBeNull();
        unmount(component);
    });

    it("says the prices could not be checked when the context had none", () => {
        const component = render({ unchecked: true });

        const text = host.textContent ?? "";
        expect(text).toContain("could not be checked");
        expect(text).not.toContain("Not confirmed by the context");
        unmount(component);
    });

    it("renders nothing when the context confirmed every price", () => {
        const component = render({});

        expect(host.textContent?.trim()).toBe("");
        expect(host.querySelector('[role="status"]')).toBeNull();
        unmount(component);
    });
});
