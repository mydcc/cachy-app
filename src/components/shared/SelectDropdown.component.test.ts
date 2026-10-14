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
 * SelectDropdown replaces a native `<select>` whose opened popup is drawn by
 * the OS and can never follow the theme. These tests pin the contract that
 * matters: the trigger shows the selected label, the popup lists every
 * option in theme classes (no system blue anywhere), mouse and keyboard
 * both select, and the trigger stays linked to the open option.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import SelectDropdown from "./SelectDropdown.svelte";

const OPTIONS = [
    { value: "all", label: "All" },
    { value: "favorites", label: "Favorites" },
    { value: "reversal", label: "Reversal" },
];

let host: HTMLElement;
let component: Record<string, unknown> | null = null;
let onSelect: ReturnType<typeof vi.fn>;

function render(value = "all") {
    onSelect = vi.fn();
    component = mount(SelectDropdown, {
        target: host,
        props: {
            id: "test-select",
            label: "Category",
            value,
            options: OPTIONS,
            onSelect,
        },
    }) as unknown as Record<string, unknown>;
    flushSync();
}

function trigger(): HTMLButtonElement {
    const el = host.querySelector<HTMLButtonElement>("#test-select");
    if (!el) throw new Error("no trigger button rendered");
    return el;
}

function popupOptions(): HTMLElement[] {
    return [...host.querySelectorAll<HTMLElement>('[role="option"]')];
}

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

describe("SelectDropdown", () => {
    it("shows the selected label and stays closed initially", () => {
        render("favorites");

        expect(trigger().textContent).toContain("Favorites");
        expect(trigger().getAttribute("role")).toBe("combobox");
        expect(trigger().getAttribute("aria-haspopup")).toBe("listbox");
        expect(trigger().getAttribute("aria-expanded")).toBe("false");
        expect(popupOptions()).toHaveLength(0);
    });

    it("opens on click, lists every option, and selects on click", () => {
        render("all");

        trigger().click();
        flushSync();

        expect(trigger().getAttribute("aria-expanded")).toBe("true");
        expect(popupOptions().map((el) => el.textContent?.trim())).toEqual([
            "All",
            "Favorites",
            "Reversal",
        ]);

        popupOptions()[2].click();
        flushSync();

        expect(onSelect).toHaveBeenCalledTimes(1);
        expect(onSelect).toHaveBeenCalledWith("reversal");
        expect(popupOptions()).toHaveLength(0);
    });

    it("paints options in theme classes, never the system highlight", () => {
        render("all");
        trigger().click();
        flushSync();

        for (const el of popupOptions()) {
            expect(el.className).not.toMatch(/#[0-9a-f]{3,8}/i);
            expect(el.className).toMatch(/var\(--/);
        }
        const selected = popupOptions()[0];
        expect(selected.getAttribute("aria-selected")).toBe("true");
        expect(selected.className).toContain("bg-[var(--accent-color)]");
    });

    it("keeps hovered text readable against the hover background", () => {
        render("all");
        trigger().click();
        flushSync();

        // The hovered row previously paired the accent text with the hover
        // background — unreadable in several themes. It now uses the primary
        // text, which is readable on every card by theme contract.
        popupOptions()[1].dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
        flushSync();
        expect(popupOptions()[1].className).toContain("text-[var(--text-primary)]");
        expect(popupOptions()[1].className).not.toContain("text-[var(--accent-color)]");
    });

    it("selects with the keyboard and links the open option", () => {
        render("all");

        trigger().focus();
        trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        flushSync();
        expect(trigger().getAttribute("aria-expanded")).toBe("true");

        trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
        flushSync();
        expect(trigger().getAttribute("aria-activedescendant")).toBe("test-select-opt-1");

        trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        flushSync();
        expect(onSelect).toHaveBeenCalledWith("favorites");
        expect(popupOptions()).toHaveLength(0);
    });

    it("closes on Escape without selecting", () => {
        render("all");

        trigger().click();
        flushSync();
        expect(popupOptions()).toHaveLength(3);

        trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        flushSync();
        expect(onSelect).not.toHaveBeenCalled();
        expect(popupOptions()).toHaveLength(0);
    });

    it("toggles closed on a second trigger click", () => {
        render("all");

        trigger().click();
        flushSync();
        expect(popupOptions()).toHaveLength(3);

        trigger().click();
        flushSync();
        expect(onSelect).not.toHaveBeenCalled();
        expect(popupOptions()).toHaveLength(0);
    });

    it("closes on outside click and on focus leaving the control", () => {
        render("all");
        trigger().click();
        flushSync();
        expect(popupOptions()).toHaveLength(3);

        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        flushSync();
        expect(popupOptions()).toHaveLength(0);
        expect(onSelect).not.toHaveBeenCalled();

        trigger().click();
        flushSync();
        // Real focusout events always bubble (unlike blur) — the flag matters.
        trigger().dispatchEvent(new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }));
        flushSync();
        expect(popupOptions()).toHaveLength(0);
    });

    it("keeps focus on the trigger across mouse picks (no unmount race)", () => {
        render("all");
        trigger().click();
        flushSync();

        // Real browsers blur the trigger on option mousedown; preventDefault
        // keeps focus (and the list mounted) until click dispatches.
        const prevented = !popupOptions()[0].dispatchEvent(
            new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        );
        expect(prevented).toBe(true);
    });

    it("moves with Home and End", () => {
        render("all");
        trigger().click();
        flushSync();

        trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
        flushSync();
        expect(trigger().getAttribute("aria-activedescendant")).toBe("test-select-opt-2");

        trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }));
        flushSync();
        expect(trigger().getAttribute("aria-activedescendant")).toBe("test-select-opt-0");

        trigger().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        flushSync();
        expect(onSelect).toHaveBeenCalledWith("all");
    });

    it("links the listbox only while open", () => {
        render("all");
        expect(trigger().getAttribute("aria-controls")).toBeNull();

        trigger().click();
        flushSync();
        expect(trigger().getAttribute("aria-controls")).toBe("test-select-list");
    });

    it("stays closed and assertion-free with no options", () => {
        onSelect = vi.fn();
        component = mount(SelectDropdown, {
            target: host,
            props: { id: "empty-select", label: "Empty", value: "", options: [], onSelect },
        }) as unknown as Record<string, unknown>;
        flushSync();

        const emptyTrigger = host.querySelector<HTMLButtonElement>("#empty-select");
        expect(emptyTrigger).not.toBeNull();
        emptyTrigger!.click();
        flushSync();
        expect(host.querySelectorAll('[role="option"]')).toHaveLength(0);
        expect(emptyTrigger!.getAttribute("aria-activedescendant")).toBeNull();
    });

    it("falls back to the first option label for an unknown value", () => {
        render("stale-value");

        expect(trigger().textContent).toContain("All");
    });
});
