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
 * FEAT-0346 — ToastContainer is a thin map from the toast queue to rendered
 * rows (BUG-0008 bounded that queue). One toast in, one row out.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

const toastMock = vi.hoisted(() => ({ toasts: [] as Array<Record<string, unknown>>, remove: vi.fn() }));
vi.mock("../../services/toastService.svelte", () => ({ toastService: toastMock }));

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return { _: readable((key: string) => key), locale: readable("en"), setLocale: vi.fn() };
});

import ToastContainer from "./ToastContainer.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    toastMock.toasts = [];
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render() {
    component = mount(ToastContainer, { target: host }) as never;
    flushSync();
}

describe("FEAT-0346 — ToastContainer maps the queue to rows", () => {
    it("renders one row per toast with its message", () => {
        toastMock.toasts = [
            { id: "1", type: "success", message: "Saved" },
            { id: "2", type: "error", message: "Failed" },
        ];
        render();

        const items = host.querySelectorAll(".toast-item");
        expect(items).toHaveLength(2);
        expect(host.textContent).toContain("Saved");
        expect(host.textContent).toContain("Failed");
    });

    it("renders nothing while the queue is empty", () => {
        render();

        expect(host.querySelectorAll(".toast-item")).toHaveLength(0);
    });
});
