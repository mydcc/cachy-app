// @vitest-environment jsdom
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
 * BUG-0266: DashboardNav renders `preset.icon` through `{@html}`. Today both
 * callers pass static icon constants or nothing, but the component contract
 * accepts arbitrary HTML — the first future caller passing user-defined icons
 * (imported backups being the obvious path) would turn this into stored XSS.
 *
 * These tests pin the contract the other way around: whatever reaches the
 * {@html} sink must survive DOMPurify first, and today's rendering must not
 * change. They assert on the rendered DOM rather than on script execution
 * because a broken image's onerror does not reliably fire in a test DOM —
 * the executable markup itself is the thing that must not survive.
 *
 * jsdom instead of the suite's usual happy-dom: DOMPurify's parser pipeline
 * misparses under happy-dom (SVG wrappers dropped, javascript: URIs kept),
 * which would make these assertions describe a broken sanitizer rather than
 * the browser behavior traders actually get.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, unmount, flushSync } from "svelte";

vi.mock("../../locales/i18n", async () => {
    const { readable } = await import("svelte/store");
    return {
        _: readable((key: string) => key),
        locale: readable("en"),
        setLocale: vi.fn(),
    };
});

import DashboardNav from "./DashboardNav.svelte";

let host: HTMLElement;
let component: Record<string, unknown> | null = null;

beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
});

afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
});

/** Every element in the rendered nav carrying an event-handler attribute. */
function executableMarkup(host: HTMLElement): Element[] {
    const selector = [
        "[onerror]",
        "[onload]",
        "[onclick]",
        "[onmouseover]",
        "script",
        "iframe",
        "object",
        "embed",
        "[href^='javascript:' i]",
        "[src^='javascript:' i]",
    ].join(",");
    return Array.from(host.querySelectorAll(selector));
}

describe("BUG-0266 — preset.icon cannot smuggle markup through {@html}", () => {
    it("strips event handlers from an icon prop", () => {
        component = mount(DashboardNav, {
            target: host,
            props: {
                activePreset: "safe",
                presets: [
                    {
                        id: "evil",
                        label: "Evil",
                        icon: '<img src=x onerror="window.__bug0266Ran = true">',
                    },
                    { id: "safe", label: "Safe" },
                ],
            },
        }) as never;
        flushSync();

        const offenders = executableMarkup(host);
        expect(
            offenders,
            `executable markup survived rendering:\n${host.innerHTML}`,
        ).toEqual([]);

        // Sanitization, not removal: a benign <img> may still render.
        expect(host.querySelector("button img")).not.toBeNull();
        expect(window.__bug0266Ran).toBeUndefined();
    });

    it("strips script elements and javascript: URLs from an icon prop", () => {
        component = mount(DashboardNav, {
            target: host,
            props: {
                activePreset: "a",
                presets: [
                    {
                        id: "a",
                        label: "A",
                        icon: `<script>window.__bug0266Script = true</script><a href="javascript:window.__bug0266Href = true">x</a>`,
                    },
                    { id: "b", label: "B" },
                ],
            },
        }) as never;
        flushSync();

        const offenders = executableMarkup(host);
        expect(
            offenders,
            `executable markup survived rendering:\n${host.innerHTML}`,
        ).toEqual([]);
        expect(window.__bug0266Script).toBeUndefined();
        expect(window.__bug0266Href).toBeUndefined();
    });
});

describe("BUG-0266 — current callers keep rendering identically", () => {
    it("renders static SVG icons and labels like before", () => {
        const icons = {
            chart:
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 0h1v15h15v1H0V0zm10 3.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5z"/></svg>',
            check:
                '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022"/></svg>',
        };
        component = mount(DashboardNav, {
            target: host,
            props: {
                activePreset: "performance",
                presets: [
                    { id: "performance", label: "Performance", icon: icons.chart },
                    { id: "quality", label: "Quality", icon: icons.check },
                    { id: "plain", label: "Plain" },
                ],
            },
        }) as never;
        flushSync();

        const buttons = host.querySelectorAll("button");
        expect(buttons).toHaveLength(3);

        // Icons still come through as live SVG.
        expect(buttons[0].querySelectorAll("svg")).toHaveLength(1);
        expect(buttons[1].querySelectorAll("svg")).toHaveLength(1);
        expect(buttons[2].querySelector("svg")).toBeNull();

        // Labels unchanged, active styling unchanged.
        expect(buttons[0].textContent).toContain("Performance");
        expect(buttons[0].className).toContain("font-bold");
        expect(buttons[1].className).not.toContain("font-bold");

        // Clicking still forwards the id.
        let selected = "";
        unmount(component);
        component = mount(DashboardNav, {
            target: host,
            props: {
                activePreset: "quality",
                presets: [{ id: "quality", label: "Quality" }],
                onselect: (id: string) => (selected = id),
            },
        }) as never;
        flushSync();
        host.querySelector("button")!.click();
        flushSync();
        expect(selected).toBe("quality");
    });
});
