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
 * FEAT-0346 — JournalEntryTags is the tag editor on a journal row. The parent
 * owns the list, so every edit must leave through `onTagsChange` as a new
 * array, and a tag must never appear twice.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

vi.mock("../../lib/actions/clickOutside", () => ({
    clickOutside: () => ({ update() {}, destroy() {} }),
}));

import JournalEntryTags from "./JournalEntryTags.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown> = {}) {
    component = mount(JournalEntryTags, {
        target: host,
        props: { tradeId: 7, tags: [], availableTags: [], onTagsChange: vi.fn(), ...props },
    }) as never;
    flushSync();
}

function tagInput(): HTMLInputElement {
    const el = host.querySelector<HTMLInputElement>("#journal-entry-tag-input-7");
    if (!el) throw new Error("tag input not rendered");
    return el;
}

function pressEnter() {
    tagInput().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    flushSync();
}

function type(value: string) {
    const el = tagInput();
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    flushSync();
}

describe("FEAT-0346 — JournalEntryTags edits tags through its parent", () => {
    it("renders the existing tags and a trade-scoped input", () => {
        render({ tags: ["breakout", "scalp"] });

        expect(host.textContent).toContain("#breakout");
        expect(host.textContent).toContain("#scalp");
        expect(host.querySelector("#journal-entry-tag-input-7")).toBeTruthy();
    });

    it("appends a typed tag and clears the input", () => {
        const onTagsChange = vi.fn();
        render({ tags: ["breakout"], onTagsChange });

        type("reversal");
        pressEnter();

        expect(onTagsChange).toHaveBeenCalledWith(["breakout", "reversal"]);
        expect(tagInput().value).toBe("");
    });

    it("refuses to add a tag that is already present", () => {
        const onTagsChange = vi.fn();
        render({ tags: ["breakout"], onTagsChange });

        type("breakout");
        pressEnter();

        expect(onTagsChange).not.toHaveBeenCalled();
    });

    it("removes a tag through its parent", () => {
        const onTagsChange = vi.fn();
        render({ tags: ["breakout", "scalp"], onTagsChange });

        const removeButtons = [...host.querySelectorAll<HTMLButtonElement>("button")];
        removeButtons[0].click();

        expect(onTagsChange).toHaveBeenCalledWith(["scalp"]);
    });

    it("adds a tag chosen from a filtered suggestion", () => {
        const onTagsChange = vi.fn();
        render({
            tags: [],
            availableTags: ["breakout", "breakdown", "scalp"],
            onTagsChange,
        });

        tagInput().dispatchEvent(new Event("focus"));
        type("break");

        const suggestion = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
            (b) => b.textContent?.trim() === "#breakdown",
        );
        expect(suggestion).toBeTruthy();
        suggestion?.click();

        expect(onTagsChange).toHaveBeenCalledWith(["breakdown"]);
    });
});
