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
 * FEAT-0607 — the settings window had two tab-bar languages: a left rail and
 * a row of pills. This component carries both as one contract, so the cases
 * below pin the contract a caller relies on: the list renders in order, the
 * active tab is the only selected one, and a click reports the id it owns.
 */

import { describe, it, expect, vi } from "vitest";
import { mount, unmount, flushSync, type ComponentProps } from "svelte";
import TabBar from "./TabBar.svelte";

type Props = ComponentProps<typeof TabBar>;

const TABS = [
    {
        id: "alpha",
        label: "Alpha",
        icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h1"/></svg>',
    },
    { id: "beta", label: "Beta" },
    { id: "gamma", label: "Gamma" },
];

function render(props: Partial<Props> = {}) {
    const target = document.createElement("div");
    document.body.appendChild(target);
    const component = mount(TabBar, {
        target,
        props: {
            tabs: TABS,
            active: "beta",
            onSelect: () => {},
            variant: "rail",
            ariaLabel: "Sections",
            ...props,
        } as Props,
    });
    flushSync();
    return { target, component };
}

describe("TabBar (FEAT-0607)", () => {
    it("renders the tabs in order and names the tab list", () => {
        const { target, component } = render();

        const list = target.querySelector('[role="tablist"]');
        expect(list?.getAttribute("aria-label")).toBe("Sections");

        const labels = [...target.querySelectorAll('[role="tab"]')].map((tab) =>
            tab.textContent?.trim(),
        );
        expect(labels).toEqual(["Alpha", "Beta", "Gamma"]);

        unmount(component);
        target.remove();
    });

    it("marks exactly the active tab as selected", () => {
        const { target, component } = render({ active: "beta" });

        const selected = [...target.querySelectorAll('[role="tab"]')]
            .filter((tab) => tab.getAttribute("aria-selected") === "true")
            .map((tab) => tab.textContent?.trim());

        expect(selected).toEqual(["Beta"]);

        unmount(component);
        target.remove();
    });

    it("reports the clicked tab's id and not its index", () => {
        const onSelect = vi.fn();
        const { target, component } = render({ onSelect });

        const buttons = [...target.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
        buttons[2].click();

        expect(onSelect).toHaveBeenCalledWith("gamma");

        unmount(component);
        target.remove();
    });

    it("renders an icon only in the rail variant", () => {
        const rail = render({ variant: "rail" });
        const railIcons = rail.target.querySelectorAll('[role="tab"] svg');
        expect(railIcons).toHaveLength(1); // only `alpha` carries an icon

        const pills = render({ variant: "pills" });
        expect(pills.target.querySelectorAll('[role="tab"] svg')).toHaveLength(0);

        unmount(rail.component);
        rail.target.remove();
        unmount(pills.component);
        pills.target.remove();
    });

    it("uses a different class language per variant", () => {
        const rail = render({ variant: "rail" });
        const railTab = rail.target.querySelector('[role="tab"]')!;
        expect(railTab.className).toContain("md:border-l-2");

        const pills = render({ variant: "pills" });
        const pillTab = pills.target.querySelector('[role="tab"]')!;
        expect(pillTab.className).toContain("rounded-lg");
        expect(pillTab.className).not.toContain("md:border-l-2");

        unmount(rail.component);
        rail.target.remove();
        unmount(pills.component);
        pills.target.remove();
    });
});
