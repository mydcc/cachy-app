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
    expect(container.querySelector('[role="tooltip"]')).toBeNull();

    // Trigger hover
    trigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    flushSync();

    const tooltipEl = container.querySelector('[role="tooltip"]');
    expect(tooltipEl).not.toBeNull();
    expect(tooltipEl?.textContent?.trim()).toContain("Sample Help Text");

    // Trigger mouseleave
    trigger.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    flushSync();

    expect(container.querySelector('[role="tooltip"]')).toBeNull();

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

    expect(container.querySelector('[role="tooltip"]')).toBeNull();

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

  it("describes its trigger with a per-instance id, not a shared one", () => {
    const first = mount(Tooltip, {
      target: container,
      props: { text: "First", underline: false },
    });
    const second = mount(Tooltip, {
      target: container,
      props: { text: "Second", underline: false },
    });
    flushSync();

    const triggers = container.querySelectorAll<HTMLElement>(".tooltip-container");
    const [firstTrigger, secondTrigger] = triggers;

    firstTrigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    secondTrigger.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    flushSync();

    const tooltips = container.querySelectorAll<HTMLElement>('[role="tooltip"]');
    expect(tooltips).toHaveLength(2);
    const ids = [...tooltips].map((el) => el.id);
    expect(new Set(ids).size).toBe(2);

    // Each trigger points at its own tooltip, and only while it is shown.
    expect(firstTrigger.getAttribute("aria-describedby")).toBe(ids[0]);
    expect(secondTrigger.getAttribute("aria-describedby")).toBe(ids[1]);
    expect(firstTrigger.getAttribute("aria-describedby")).not.toBe(
      secondTrigger.getAttribute("aria-describedby"),
    );

    unmount(first);
    unmount(second);
  });

  it("keeps the trigger focusable but free of an interactive role", () => {
    const component = mount(Tooltip, {
      target: container,
      props: { text: "Help", underline: false },
    });
    flushSync();

    const trigger = container.querySelector(".tooltip-container") as HTMLElement;
    expect(trigger.getAttribute("tabindex")).toBe("0");
    // A tooltip trigger may wrap a real button; giving it role="button" would
    // nest interactive elements.
    expect(trigger.getAttribute("role")).toBeNull();
    // Nothing to describe until the tooltip is visible.
    expect(trigger.getAttribute("aria-describedby")).toBeNull();

    unmount(component);
  });

  it("renders nothing to hover for a text-only tooltip — pass children, or use InfoTip", () => {
    const component = mount(Tooltip, {
      target: container,
      props: { text: "Orphan help" },
    });
    flushSync();

    const trigger = container.querySelector(".tooltip-container") as HTMLElement;
    expect(trigger).not.toBeNull();
    // `text` alone leaves an empty 0×0 trigger, so the explanation has no
    // affordance to hover. This is why `children` is documented as required
    // and why the chart call sites use InfoTip's always-visible marker.
    expect(trigger.childElementCount).toBe(0);
    expect(trigger.textContent?.trim()).toBe("");

    unmount(component);
  });
});
