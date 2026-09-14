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
 * FEAT-0346 — ToastItem is a single notification row. It must announce itself
 * (role=alert), carry its severity, and let the user dismiss it — the row
 * leaves the queue only after the exit animation has run.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

const toastMock = vi.hoisted(() => ({ remove: vi.fn(), toasts: [] as unknown[] }));
vi.mock("../../services/toastService.svelte", () => ({ toastService: toastMock }));

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return { _: readable((key: string) => key), locale: readable("en"), setLocale: vi.fn() };
});

import ToastItem from "./ToastItem.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    vi.useRealTimers();
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(props: Record<string, unknown> = {}) {
    component = mount(ToastItem, {
        target: host,
        props: { toast: { id: "t1", type: "success", message: "Order placed" }, ...props },
    }) as never;
    flushSync();
}

function item(): HTMLElement {
    const el = host.querySelector<HTMLElement>(".toast-item");
    if (!el) throw new Error("toast not rendered");
    return el;
}

describe("FEAT-0346 — ToastItem announces and dismisses a notification", () => {
    it("renders the message with its severity and alert role", () => {
        render();

        expect(item().getAttribute("role")).toBe("alert");
        expect(item().classList.contains("success")).toBe(true);
        expect(host.textContent).toContain("Order placed");
    });

    it("removes the toast only after the exit delay", () => {
        vi.useFakeTimers();
        render();

        host.querySelector<HTMLButtonElement>(".close-btn")?.click();
        expect(toastMock.remove).not.toHaveBeenCalled();

        vi.advanceTimersByTime(300);
        expect(toastMock.remove).toHaveBeenCalledWith("t1");
    });

    it("marks itself visible after the entry frame", async () => {
        render();

        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        flushSync();

        expect(item().classList.contains("visible")).toBe(true);
    });
});
