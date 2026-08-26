// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mount, unmount } from "svelte";
import DashboardNav from "./DashboardNav.svelte";

describe("DashboardNav", () => {
  let container: HTMLElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let component: Record<string, any>;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (component) {
      unmount(component);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      component = undefined as any;
    }
    if (container) {
      container.remove();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      container = undefined as any;
    }
  });

  it("sanitizes preset.icon to prevent XSS", () => {
    const maliciousIcon = "<img src=x onerror=alert(1)>";
    component = mount(DashboardNav, {
      target: container,
      props: {
        activePreset: "test",
        presets: [
          {
            id: "test",
            label: "Test Preset",
            icon: maliciousIcon,
          },
        ],
      },
    });

    const img = container.querySelector("img");
    if (img) {
      expect(img.hasAttribute("onerror")).toBe(false);
    } else {
      expect(img).toBeNull();
    }

    expect(container.innerHTML).not.toContain("onerror=alert(1)");
  });
});
