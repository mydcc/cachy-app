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

import { describe, expect, it } from "vitest";
import { collectLazyOnlyFiles, lazyPrecachePlugin, type BundleEntry } from "./lazyPrecache";

const THREE = "_app/immutable/chunks/D50ODbxi.js";
const GALAXY = "_app/immutable/workers/galaxy.worker-DXTZWlr3.js";
const TRADE_FLOW = "_app/immutable/workers/tradeFlow.worker-BhQ4baFC.js";
const TECHNICALS = "_app/immutable/workers/technicals.worker-B5rgX62V.js";

function bundleOf(...entries: BundleEntry[]): Record<string, BundleEntry> {
  return Object.fromEntries(entries.map((entry) => [entry.fileName, entry]));
}

/** The shape of the 2026-11-23 build: three.js reachable only via import(). */
function healthyBundle(): Record<string, BundleEntry> {
  return bundleOf(
    { type: "chunk", fileName: "_app/immutable/entry/start.js", isEntry: true, imports: ["_app/immutable/chunks/shared.js"] },
    { type: "chunk", fileName: "_app/immutable/chunks/shared.js", imports: [] },
    { type: "chunk", fileName: "_app/immutable/chunks/FireOverlay.js", imports: [THREE] },
    { type: "chunk", fileName: THREE, name: "three-vendor", imports: [] },
    { type: "asset", fileName: GALAXY },
    { type: "asset", fileName: TRADE_FLOW },
    { type: "asset", fileName: TECHNICALS },
  );
}

describe("collectLazyOnlyFiles", () => {
  it("returns the three-vendor chunk and both three.js workers, not the indicator worker", () => {
    expect(collectLazyOnlyFiles(healthyBundle())).toEqual([THREE, GALAXY, TRADE_FLOW].sort());
  });

  it("fails the build when an entry reaches three-vendor through static imports", () => {
    const bundle = healthyBundle();
    bundle["_app/immutable/chunks/shared.js"] = {
      type: "chunk",
      fileName: "_app/immutable/chunks/shared.js",
      imports: ["_app/immutable/chunks/FireOverlay.js"],
    };
    expect(() => collectLazyOnlyFiles(bundle)).toThrow(/statically imports .*D50ODbxi/);
  });

  it("fails the build when the codeSplitting group no longer exists", () => {
    const bundle = healthyBundle();
    bundle[THREE] = { type: "chunk", fileName: THREE, name: "renamed-vendor", imports: [] };
    expect(() => collectLazyOnlyFiles(bundle)).toThrow(/no chunk named "three-vendor"/);
  });

  it("fails the build when neither three.js worker is in the bundle", () => {
    const bundle = healthyBundle();
    delete bundle[GALAXY];
    delete bundle[TRADE_FLOW];
    expect(() => collectLazyOnlyFiles(bundle)).toThrow(/worker/);
  });
});

describe("lazyPrecachePlugin", () => {
  const sw = { environment: { name: "serviceWorker" } };
  const client = { environment: { name: "client" } };

  it("serves an empty list in dev, where there are no immutable chunks", () => {
    const plugin = lazyPrecachePlugin();
    plugin.configResolved({ command: "serve" });
    const id = plugin.resolveId("virtual:cachy-lazy-precache") as string;
    expect(plugin.load.call(sw, id)).toBe("export const LAZY_ONLY_FILES = [];");
  });

  it("hands the client bundle's lazy files to the service worker build", () => {
    const plugin = lazyPrecachePlugin();
    plugin.configResolved({ command: "build" });
    plugin.generateBundle.call(client, {}, healthyBundle());
    const id = plugin.resolveId("virtual:cachy-lazy-precache") as string;
    expect(plugin.load.call(sw, id)).toBe(
      `export const LAZY_ONLY_FILES = ${JSON.stringify([THREE, GALAXY, TRADE_FLOW].sort())};`,
    );
  });

  it("ignores bundles of other environments", () => {
    const plugin = lazyPrecachePlugin();
    plugin.configResolved({ command: "build" });
    // An SSR bundle has no three-vendor chunk; collecting it would throw.
    expect(() => plugin.generateBundle.call({ environment: { name: "ssr" } }, {}, {})).not.toThrow();
  });

  it("refuses to build the service worker before the client bundle exists", () => {
    const plugin = lazyPrecachePlugin();
    plugin.configResolved({ command: "build" });
    const id = plugin.resolveId("virtual:cachy-lazy-precache") as string;
    expect(() => plugin.load.call(sw, id)).toThrow(/before the client bundle/);
  });
});
