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
 * FEAT-0346 — GlobalTracker is the fallback analytics net: it walks up from a
 * click to the nearest element that opted in with `data-track-id`, or falls
 * back to a heuristic label. It must respect `data-track-ignore` and must not
 * re-track an event another handler already claimed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

const { trackInteraction } = vi.hoisted(() => ({ trackInteraction: vi.fn() }));
vi.mock("../../services/trackingService", () => ({ trackInteraction }));

import GlobalTracker from "./GlobalTracker.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    component = mount(GlobalTracker, { target: host }) as never;
    flushSync();
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function click(el: HTMLElement) {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

describe("FEAT-0346 — GlobalTracker follows the click up to an opted-in element", () => {
    it("tracks the nearest data-track-id", () => {
        const button = document.createElement("button");
        button.dataset.trackId = "place-order";
        host.appendChild(button);

        click(button);

        expect(trackInteraction).toHaveBeenCalledWith("place-order", "click", {});
    });

    it("inherits the id from an ancestor", () => {
        const wrapper = document.createElement("div");
        wrapper.dataset.trackId = "toolbar";
        const icon = document.createElement("span");
        wrapper.appendChild(icon);
        host.appendChild(wrapper);

        click(icon);

        expect(trackInteraction).toHaveBeenCalledWith("toolbar", "click", {});
    });

    it("honours the data-track-ignore opt-out", () => {
        const button = document.createElement("button");
        button.dataset.trackId = "secret";
        button.dataset.trackIgnore = "";
        host.appendChild(button);

        click(button);

        expect(trackInteraction).not.toHaveBeenCalled();
    });

    it("falls back to a heuristic label for unnamed controls", () => {
        const button = document.createElement("button");
        button.setAttribute("aria-label", "Save preset");
        host.appendChild(button);

        click(button);

        expect(trackInteraction).toHaveBeenCalledWith(
            "Auto:BUTTON:Save preset",
            "click",
            expect.objectContaining({ auto: true }),
        );
    });

    it("skips an event another handler already claimed", () => {
        const button = document.createElement("button");
        button.dataset.trackId = "place-order";
        host.appendChild(button);

        const event = new MouseEvent("click", { bubbles: true });
        (event as MouseEvent & { __tracking_handled?: boolean }).__tracking_handled = true;
        button.dispatchEvent(event);

        expect(trackInteraction).not.toHaveBeenCalled();
    });
});
