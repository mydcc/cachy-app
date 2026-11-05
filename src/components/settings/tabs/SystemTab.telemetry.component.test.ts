// @vitest-environment happy-dom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any
 * later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE.  See the GNU Affero General Public License for more
 * details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * FEAT-0802 — the telemetry card keeps its data-flow fact visible.
 *
 * The full paragraph names the endpoint, the event fields and the
 * anonymisation. That belongs behind the marker. What must not disappear is
 * the sentence a trader needs to decide: anonymous events only, never the
 * journal, settings or API keys.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync, mount, unmount } from "svelte";
import en from "../../../locales/locales/en.json";

vi.mock("../../../locales/i18n", async () => {
  const { readable } = await import("svelte/store");
  const translate = (key: string) => {
    let value: unknown = en;
    for (const part of key.split(".")) {
      value = (value as Record<string, unknown>)?.[part];
    }
    return typeof value === "string" ? value : key;
  };
  return { _: readable(translate), locale: readable("en") };
});

const settingsMock = vi.hoisted(() => ({
  showTooltips: true,
  debugMode: false,
  enableNetworkLogs: false,
  enableTelemetry: true,
  forceEnglishTechnicalTerms: false,
  hotkeyMode: "mode1",
}));
vi.mock("../../../stores/settings.svelte", () => ({ settingsState: settingsMock }));

const uiMock = vi.hoisted(() => ({
  settingsSystemSubTab: "performance",
  showError: vi.fn(),
  showFeedback: vi.fn(),
}));
vi.mock("../../../stores/ui.svelte", () => ({ uiState: uiMock }));

vi.mock("../../../stores/modal.svelte", () => ({
  modalState: { show: vi.fn(async () => false) },
}));
vi.mock("../../../stores/onboarding.svelte", () => ({
  onboardingState: { triggerStartWithDelay: vi.fn() },
}));
vi.mock("../../../services/toastService.svelte", () => ({
  toastService: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("../../../services/trackingService", () => ({
  applyTelemetryConsent: vi.fn(),
  trackCustomEvent: vi.fn(),
}));
vi.mock("../../../services/autoBackupService.svelte", () => ({
  autoBackupState: { isOpfsSupported: false, lastSnapshotTime: null },
  triggerAutoBackup: vi.fn(),
}));
vi.mock("../../../services/fileTargetBackupService.svelte", () => ({
  fileTargetState: {
    slots: {},
    intervalMinutes: 60,
    permission: "unknown",
  },
  isFileSystemAccessSupported: () => false,
  pickFileTarget: vi.fn(),
  clearFileTarget: vi.fn(),
  setFileTargetInterval: vi.fn(),
  requestFileTargetPermission: vi.fn(),
  MIN_INTERVAL_MINUTES: 5,
  MAX_INTERVAL_MINUTES: 1440,
}));
vi.mock("../../../services/backupService", () => ({
  createBackup: vi.fn(),
  restoreFromBackup: vi.fn(),
}));
vi.mock("../../../utils/appReset", () => ({ wipeLocalData: vi.fn() }));
vi.mock("../../../services/hotkeyService", () => ({
  HOTKEY_ACTIONS: [],
  HOTKEY_CATEGORY_KEYS: {},
  MODE1_MAP: {},
  MODE2_MAP: {},
}));

// The surrounding panels are separate surfaces; only the performance section
// and its three action cards are under test here.
vi.mock("../CalculationSettings.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));
vi.mock("../../shared/CalculationDashboard.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));
vi.mock("../../shared/PerformanceMonitor.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));
vi.mock("../EngineDebugPanel.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));
vi.mock("../DataMaintenance.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));
vi.mock("../HotkeySettings.svelte", async () => ({
  default: (await import("../../../tests/helpers/EmptySvelteComponent.svelte")).default,
}));

import SystemTab from "./SystemTab.svelte";

function translation(key: string): string {
  return key
    .split(".")
    .reduce<unknown>((value, part) => (value as Record<string, unknown>)?.[part], en) as string;
}

let host: HTMLElement;
let component: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  uiMock.settingsSystemSubTab = "performance";
  host = document.createElement("div");
  document.body.appendChild(host);
  component = mount(SystemTab, { target: host });
  flushSync();
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  host.remove();
});

describe("Telemetry disclosure (FEAT-0802)", () => {
  it("keeps the data-flow sentence visible", () => {
    expect(host.textContent).toContain(
      translation("settings.system.telemetryNote"),
    );
  });

  it("moves the full paragraph behind the marker", () => {
    expect(host.textContent).not.toContain(
      translation("settings.system.telemetryDesc"),
    );
    expect(host.querySelector(".info-tip")).not.toBeNull();
  });
});
