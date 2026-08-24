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

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, unmount, flushSync } from "svelte";
import Tooltip from "./Tooltip.svelte";
import { settingsState } from "../../stores/settings.svelte";

describe("Tooltip.svelte component", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    settingsState.showTooltips = true;
  });

  afterEach(() => {
    container.remove();
    settingsState.showTooltips = true;
  });

  it("renders with has-underline and displays tooltip text on mouseenter when showTooltips is enabled", async () => {
    const component = mount(Tooltip, {
      target: container,
      props: {
        text: "Sample Help Text",
        underline: true,
      },
    });

    flushSync();
    const trigger = container.querySelector(".tooltip-container") as HTMLElement;
    expect(trigger).not.toBeNull();
    expect(trigger.classList.contains("has-underline")).toBe(true);

    // Initial state: tooltip text not visible
    expect(container.querySelector("#tooltip-text")).toBeNull();

    // Trigger hover
    trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    flushSync();

    const tooltipEl = container.querySelector("#tooltip-text");
    expect(tooltipEl).not.toBeNull();
    expect(tooltipEl?.textContent?.trim()).toContain("Sample Help Text");

    // Trigger mouseleave
    trigger.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    flushSync();

    expect(container.querySelector("#tooltip-text")).toBeNull();

    unmount(component);
  });

  it("suppresses underline and ignores mouseenter when showTooltips is disabled", async () => {
    settingsState.showTooltips = false;

    const component = mount(Tooltip, {
      target: container,
      props: {
        text: "Sample Help Text",
        underline: true,
      },
    });

    flushSync();
    const trigger = container.querySelector(".tooltip-container") as HTMLElement;
    expect(trigger).not.toBeNull();
    expect(trigger.classList.contains("has-underline")).toBe(false);

    // Trigger hover
    trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    flushSync();

    expect(container.querySelector("#tooltip-text")).toBeNull();

    unmount(component);
  });

  it("reacts dynamically to toggling showTooltips state", async () => {
    settingsState.showTooltips = true;

    const component = mount(Tooltip, {
      target: container,
      props: {
        text: "Dynamic Help Text",
        underline: true,
      },
    });

    flushSync();
    const trigger = container.querySelector(".tooltip-container") as HTMLElement;
    expect(trigger.classList.contains("has-underline")).toBe(true);

    // Disable tooltips dynamically
    settingsState.showTooltips = false;
    flushSync();
    expect(trigger.classList.contains("has-underline")).toBe(false);

    // Re-enable tooltips dynamically
    settingsState.showTooltips = true;
    flushSync();
    expect(trigger.classList.contains("has-underline")).toBe(true);

    unmount(component);
  });
});
