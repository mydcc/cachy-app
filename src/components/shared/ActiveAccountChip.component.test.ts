// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
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
 * The order panel must state where the money goes without inviting a click:
 * one label while the default account carries the venue name
 * ("Bitunix", not "Bitunix · Bitunix"), both halves once renamed
 * ("Main · Bitunix"), and never a button.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";
const settingsStateMock = vi.hoisted(() => ({
    accounts: [{ id: "bu-1", name: "Bitunix", exchange: "bitunix" }],
    activeAccountId: "bu-1",
    apiProvider: "bitunix",
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settingsStateMock }));

function lookup(key: string): string {
    return key
        .split(".")
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], en) as string;
}

vi.mock("../../locales/i18n", async () => {
    const { readable: r } = await import("svelte/store");
    return {
        _: r((key: string) => lookup(key) ?? key),
        locale: r("en"),
        setLocale: vi.fn(),
    };
});

import ActiveAccountChip from "./ActiveAccountChip.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

function render(props: Record<string, unknown> = {}) {
    component = mount(ActiveAccountChip, { target: host, props }) as unknown as Record<string, unknown>;
    flushSync();
}

function text(): string {
    return host.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

beforeEach(() => {
    settingsStateMock.accounts = [{ id: "bu-1", name: "Bitunix", exchange: "bitunix" }];
    settingsStateMock.activeAccountId = "bu-1";
    settingsStateMock.apiProvider = "bitunix";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});
describe("ActiveAccountChip — one label for the default account", () => {
    it("shows the name once when it matches the venue", () => {
        render();
        expect(text()).toBe("Bitunix");
        expect(host.querySelector(".venue")).toBeNull();
    });

    it("matches case-insensitively", () => {
        settingsStateMock.accounts = [{ id: "bu-1", name: "bitunix", exchange: "bitunix" }];
        render();
        expect(host.querySelector(".venue")).toBeNull();
    });

    it("shows both halves once the account is renamed", () => {
        settingsStateMock.accounts = [{ id: "bu-1", name: "Main", exchange: "bitunix" }];
        render();
        expect(text()).toContain("Main");
        expect(text()).toContain("Bitunix");
        expect(host.querySelector(".venue")).not.toBeNull();
    });

    it("maps the venue id to its display name", () => {
        settingsStateMock.accounts = [{ id: "bg-1", name: "Scalp", exchange: "bitget" }];
        settingsStateMock.activeAccountId = "bg-1";
        settingsStateMock.apiProvider = "bitget";
        render();
        expect(text()).toContain("Bitget");
    });

    it("hides the venue in compact mode", () => {
        settingsStateMock.accounts = [{ id: "bu-1", name: "Main", exchange: "bitunix" }];
        render({ compact: true });
        expect(host.querySelector(".venue")).toBeNull();
    });

    it("is a label, never a button", () => {
        render();
        expect(host.querySelector("button")).toBeNull();
        expect(host.querySelector(".chip")?.tagName).toBe("SPAN");
    });
});
