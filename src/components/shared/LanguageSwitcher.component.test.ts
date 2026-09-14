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
 * FEAT-0346 — LanguageSwitcher drives the app locale. Each click must go
 * through setLocale, and the active language must be the only one highlighted.
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
    const { readable, writable } = await import("svelte/store");
    return {
        _: readable((key: string) => lookup(key) ?? key),
        locale: writable("en"),
        setLocale: vi.fn(),
    };
});

import LanguageSwitcher from "./LanguageSwitcher.svelte";
import { locale, setLocale } from "../../locales/i18n";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    locale.set("en");
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    component = mount(LanguageSwitcher, { target: host }) as never;
    flushSync();
}

function button(titleKey: string): HTMLButtonElement {
    const el = host.querySelector<HTMLButtonElement>(`button[title="${lookup(titleKey)}"]`);
    if (!el) throw new Error(`button for ${titleKey} not rendered`);
    return el;
}

describe("FEAT-0346 — LanguageSwitcher highlights the active locale", () => {
    it("requests German when the German flag is clicked", () => {
        render();

        button("languages.german").click();

        expect(setLocale).toHaveBeenCalledWith("de");
    });

    it("requests English when the English flag is clicked", () => {
        render();

        button("languages.english").click();

        expect(setLocale).toHaveBeenCalledWith("en");
    });

    it("marks only the active language", () => {
        locale.set("de");
        render();

        const de = button("languages.german");
        const enButton = button("languages.english");

        expect(de.classList.contains("border-2")).toBe(true);
        expect(de.classList.contains("border-[var(--accent-color)]")).toBe(true);
        expect(enButton.classList.contains("opacity-50")).toBe(true);
        expect(enButton.classList.contains("border-2")).toBe(false);
    });

    it("follows the locale store when it changes", () => {
        render();

        locale.set("de");
        flushSync();

        expect(button("languages.german").classList.contains("border-2")).toBe(true);
        expect(button("languages.english").classList.contains("opacity-50")).toBe(true);
    });
});
