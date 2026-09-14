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
 * FEAT-0346 — ConnectionStatus is the corner dot that tells a trader whether
 * the socket is alive. The colour and the pulse have to match the state, and
 * the tooltip has to name it in words.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import en from "../../locales/locales/en.json";

function lookup(key: string, values?: Record<string, unknown>): string {
    let current: unknown = en;
    for (const part of key.split(".")) {
        if (!current || typeof current !== "object") return key;
        current = (current as Record<string, unknown>)[part];
    }
    if (typeof current !== "string") return key;
    if (!values) return current;
    return Object.entries(values).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        current,
    );
}

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string, options?: { values?: Record<string, unknown> }) =>
            lookup(key, options?.values),
        ),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

const marketMock = vi.hoisted(() => ({ connectionStatus: "connected" }));
vi.mock("../../stores/market.svelte", () => ({ marketState: marketMock }));

import ConnectionStatus from "./ConnectionStatus.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    marketMock.connectionStatus = "connected";
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component as never);
    component = null;
    host.remove();
});

function render(status: string) {
    marketMock.connectionStatus = status;
    component = mount(ConnectionStatus, { target: host }) as never;
    flushSync();
}

function indicator(): HTMLElement {
    const el = host.querySelector<HTMLElement>("div[style]");
    if (!el) throw new Error("indicator not rendered");
    return el;
}

describe("FEAT-0346 — ConnectionStatus reflects the socket state", () => {
    it("is green and still while connected", () => {
        render("connected");

        expect(indicator().getAttribute("style")).toContain("--success-color");
        expect(indicator().classList.contains("animate-pulse")).toBe(false);
        expect(indicator().getAttribute("title")).toBe(
            lookup("connection.webSocket", { statusText: lookup("connection.connected") }),
        );
    });

    it("is amber and pulsing while reconnecting", () => {
        render("reconnecting");

        expect(indicator().getAttribute("style")).toContain("--warning-color");
        expect(indicator().classList.contains("animate-pulse")).toBe(true);
        expect(indicator().getAttribute("title")).toContain(
            lookup("connection.reconnecting"),
        );
    });

    it("is red and pulsing when the socket is down", () => {
        render("disconnected");

        expect(indicator().getAttribute("style")).toContain("--danger-color");
        expect(indicator().classList.contains("animate-pulse")).toBe(true);
        expect(indicator().getAttribute("title")).toContain(
            lookup("connection.disconnected"),
        );
    });
});
