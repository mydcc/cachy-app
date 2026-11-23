// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCC
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
 * FEAT-0265 review: the galaxy and trade-flow workers are cached on first use.
 * A background selected offline before that cannot start; once the connection
 * is back it has to start without the user re-selecting it — and a background
 * that is running must not be torn down by every `online` event.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";

const settings = vi.hoisted(() => ({
  backgroundType: "threejs" as string,
  backgroundUrl: "",
  backgroundOpacity: 1,
  backgroundBlur: 0,
  videoPlaybackSpeed: 1,
}));
vi.mock("../../stores/settings.svelte", () => ({ settingsState: settings }));
vi.mock("./ThreeBackground.svelte", async () => import("../../tests/helpers/OfflineBackgroundProbe.svelte"));
vi.mock("./backgrounds/TradeFlowBackground.svelte", async () =>
  import("../../tests/helpers/OfflineBackgroundProbe.svelte"),
);
vi.mock("./BackgroundAnimations.svelte", async () => import("../../tests/helpers/EmptyStub.svelte"));

import BackgroundRenderer from "./BackgroundRenderer.svelte";

interface Probe {
  mounts: number;
  failOffline: boolean;
}
const probe = (): Probe => (globalThis as unknown as { __backgroundProbe: Probe }).__backgroundProbe;

const MAX_SETTLE_TICKS = 50;

/** Lets the dynamic import resolve and Svelte flush, until the probe is in the DOM. */
async function settle(): Promise<void> {
  for (let i = 0; i < MAX_SETTLE_TICKS; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    flushSync();
    if (i > 2 && host.querySelector('[data-testid="background-probe"]')) return;
  }
}

let host: HTMLElement;
let app: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  (globalThis as unknown as { __backgroundProbe: Probe }).__backgroundProbe = { mounts: 0, failOffline: false };
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  if (app) unmount(app);
  app = null;
  host.remove();
});

describe.each(["threejs", "tradeflow"])("BackgroundRenderer with %s", (type) => {
  it("remounts a background that could not start offline once the connection is back", async () => {
    settings.backgroundType = type;
    probe().failOffline = true;
    app = mount(BackgroundRenderer, { target: host });
    await settle();
    expect(probe().mounts).toBe(1);

    probe().failOffline = false;
    window.dispatchEvent(new Event("online"));
    await settle();

    expect(probe().mounts).toBe(2);
  });

  it("leaves a running background alone on reconnect", async () => {
    settings.backgroundType = type;
    app = mount(BackgroundRenderer, { target: host });
    await settle();

    window.dispatchEvent(new Event("online"));
    await settle();

    expect(probe().mounts).toBe(1);
  });
});
