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

/**
 * FEAT-0608 — the card's two-up field grid is the converted component whose
 * full-width children live in `ExternalChannelSettings`. This pins that the
 * card renders the container-query `SettingsGrid`, not a hand-written grid.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRawSnippet, flushSync, mount, unmount } from "svelte";
import ExternalChannelCard from "./ExternalChannelCard.svelte";

vi.mock("../../stores/externalChannels.svelte", () => ({
  externalChannelsStore: { problem: () => null },
}));
vi.mock("../../stores/externalDeliveryLog.svelte", () => ({
  externalDeliveryLog: { latest: () => null },
}));
vi.mock("../../services/externalDelivery", () => ({
  deliverExternal: vi.fn(),
}));

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

describe("ExternalChannelCard grid (FEAT-0608)", () => {
  it("renders the pair grid through SettingsGrid", () => {
    const fields = createRawSnippet(() => ({
      render: () => `<span>field</span>`,
    }));

    component = mount(ExternalChannelCard, {
      target: host,
      props: {
        channel: "discord" as never,
        title: "Discord",
        hint: "Hint",
        enabled: false,
        fields,
        onEnabledChange: vi.fn(),
        onClear: vi.fn(),
      },
    }) as never;
    flushSync();

    const grid = host.querySelector<HTMLElement>(
      'div[class*="@min-[560px]:grid-cols-2"]',
    );
    expect(grid).not.toBeNull();
    expect(grid?.className).toContain("grid-cols-1");
  });
});
