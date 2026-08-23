/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

// @vitest-environment happy-dom

/**
 * BUG-0286 — Matomo telemetry consent gate.
 *
 * Telemetry is strict opt-in, default off, and no cookie banner is shown:
 * the settings toggle is the consent surface. These tests assert the gate at
 * the network boundary — with consent off, no element that would trigger a
 * request to the tracking endpoint may exist in the document.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CONTAINER_URL_PART = "s.cachy.app/js/container_h6eaMUR9.js";

/** Vitest runs with cwd = project root, so repo paths resolve from there. */
const repoFile = (...segments: string[]) => join(process.cwd(), ...segments);

type TrackingService = typeof import("./trackingService");

/**
 * Fresh module instance per test: `trackingService` keeps a module-level
 * "container already requested" flag and `settingsState` is a singleton, so
 * resetting the module registry gives every test an untouched consent gate.
 */
async function loadTrackingService(): Promise<{
  tracking: TrackingService;
  settingsState: import("../stores/settings.svelte").SettingsManager;
}> {
  vi.resetModules();
  const tracking = await import("./trackingService");
  const { settingsState } = await import("../stores/settings.svelte");
  return { tracking, settingsState };
}

function injectedTrackingScripts(): HTMLScriptElement[] {
  return Array.from(document.querySelectorAll("script")).filter((s) =>
    (s.getAttribute("src") ?? "").includes(CONTAINER_URL_PART),
  );
}

describe("BUG-0286 — telemetry consent gate", () => {
  let insertBeforeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    delete (window as { _mtm?: unknown })._mtm;
    // happy-dom defaults to http://localhost/, where telemetry stays off by
    // design (same as production dev machines). Simulate the deployed origin
    // so the consent path itself is what the tests exercise.
    window.location.href = "https://cachy.app/";
    // Network-boundary guard: catch ANY DOM insertion attempt, regardless of
    // which insertion API the loader uses. happy-dom does not fetch scripts,
    // so the created element IS the network request that production makes.
    insertBeforeSpy = vi.spyOn(Node.prototype, "insertBefore");
  });

  it("default-off: initTracking() triggers no request to the tracking endpoint", async () => {
    const { tracking } = await loadTrackingService();

    tracking.initTracking();

    expect(injectedTrackingScripts()).toHaveLength(0);
    expect(window._mtm).toBeUndefined();
    expect(insertBeforeSpy).not.toHaveBeenCalled();
  });

  it("default-off: trackCustomEvent() pushes nothing", async () => {
    const { tracking } = await loadTrackingService();

    expect(() => tracking.trackCustomEvent("Calculation", "Success")).not.toThrow();
    expect(window._mtm).toBeUndefined();

    // Even if a container were present, the live consent check must block it.
    const dataLayer: unknown[] = [];
    window._mtm = dataLayer;
    tracking.trackCustomEvent("Calculation", "Success");
    expect(dataLayer).toHaveLength(0);
  });

  it("opt-in loads exactly one container script and starts the data layer", async () => {
    const { tracking, settingsState } = await loadTrackingService();

    settingsState.enableTelemetry = true;
    tracking.initTracking();

    const scripts = injectedTrackingScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].getAttribute("src")).toBe(
      "https://s.cachy.app/js/container_h6eaMUR9.js",
    );

    const dataLayer = window._mtm as unknown[] | undefined;
    expect(Array.isArray(dataLayer)).toBe(true);
    expect(dataLayer).toContainEqual(
      expect.objectContaining({ event: "mtm.Start" }),
    );
  });

  it("initTracking() is idempotent while consent stays on", async () => {
    const { tracking, settingsState } = await loadTrackingService();

    settingsState.enableTelemetry = true;
    tracking.initTracking();
    tracking.initTracking();
    tracking.initTracking();

    expect(injectedTrackingScripts()).toHaveLength(1);
  });

  it("opting out stops event pushes immediately", async () => {
    const { tracking, settingsState } = await loadTrackingService();

    settingsState.enableTelemetry = true;
    tracking.initTracking();
    expect(injectedTrackingScripts()).toHaveLength(1);
    const dataLayerBefore = window._mtm;
    expect(dataLayerBefore).toBeDefined();

    settingsState.enableTelemetry = false;
    tracking.applyTelemetryConsent(false);

    // Data layer reference dropped: nothing can be pushed afterwards, even
    // though the already-loaded container script stays in the document until
    // a reload fully unloads it (documented behaviour).
    tracking.trackCustomEvent("Sync", "BitunixHistory", "Success", 3);
    expect(window._mtm).toBeUndefined();

    // Re-consent may load again: the stale container from the earlier
    // consent is still in the document until reload, so a second script is
    // expected here.
    settingsState.enableTelemetry = true;
    tracking.applyTelemetryConsent(true);
    expect(injectedTrackingScripts()).toHaveLength(2);
  });

  it("pushed events carry no app_symbol dimension by default", async () => {
    const { tracking, settingsState } = await loadTrackingService();

    settingsState.enableTelemetry = true;
    tracking.initTracking();
    tracking.trackCustomEvent("Price", "Fetch", "BTCUSDT");

    const dataLayer = window._mtm as unknown[];
    const pushed = dataLayer[dataLayer.length - 1] as Record<string, unknown>;
    expect(pushed["custom-event-category"]).toBe("Price");
    expect(pushed).not.toHaveProperty("app_symbol");
  });

  it("app.ts registers no app_symbol default dimension (source guard)", async () => {
    // The default context provider lives in app.init(); asserting on the
    // source keeps this AC verifiable without booting the full service graph.
    const source = readFileSync(repoFile("src", "services", "app.ts"), "utf-8");
    expect(source).not.toContain("app_symbol");
  });

  it("consent copy exists in DE + EN and states what is collected and where", async () => {
    vi.resetModules();
    const en = JSON.parse(
      readFileSync(repoFile("src", "locales", "locales", "en.json"), "utf-8"),
    ) as { settings: { system: Record<string, string> } };
    const de = JSON.parse(
      readFileSync(repoFile("src", "locales", "locales", "de.json"), "utf-8"),
    ) as { settings: { system: Record<string, string> } };

    for (const locale of [en, de]) {
      expect(locale.settings.system.telemetry).toBeTruthy();
      // What is collected ("anonym…" covers EN "anonymous" and DE "anonyme")
      // …
      expect(locale.settings.system.telemetryDesc.toLowerCase()).toMatch(
        /anonym/,
      );
      // … and where it goes.
      expect(locale.settings.system.telemetryDesc).toContain("s.cachy.app");
    }
  });
});
