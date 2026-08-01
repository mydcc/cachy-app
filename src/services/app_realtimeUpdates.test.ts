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

import { describe, it, expect, vi, beforeEach } from "vitest";

// setupRealtimeUpdates() (like most of app.ts) is gated behind `if (!browser)
// return`. Vitest's default test environment resolves $app/environment's
// `browser` to false, so without this mock the function under test - and
// settingsState's own constructor - would both silently no-op.
vi.mock("$app/environment", () => ({
  browser: true,
}));

vi.mock("./connectionManager", () => ({
  connectionManager: {
    registerProvider: vi.fn(),
    registerPolling: vi.fn(),
    switchProvider: vi.fn(),
    onProviderConnected: vi.fn(),
    onProviderDisconnected: vi.fn(),
  },
}));

import { app } from "./app";
import { connectionManager } from "./connectionManager";
import { settingsState, type Settings } from "../stores/settings.svelte";

// settingsState's pub/sub is a plain listener Set behind subscribe()/toJSON(),
// separate from the reactive $effect that normally drives notifyListeners()
// on a 500ms debounce. setupRealtimeUpdates() never unsubscribes, so calling
// it once per test would otherwise leave every previous test's listener
// registered too. Capturing only the listener this call just added - and
// invoking it directly - keeps each test isolated without needing to reset
// settingsState's shared internal state.
type SettingsInternals = {
  listeners: Set<(value: Settings) => void>;
};

function registerAndCaptureListener(register: () => void): (value: Settings) => void {
  const internals = settingsState as unknown as SettingsInternals;
  const before = new Set(internals.listeners);
  register();
  for (const listener of internals.listeners) {
    if (!before.has(listener)) return listener;
  }
  throw new Error("register() did not add a settings listener");
}

function emit(listener: (value: Settings) => void) {
  listener(settingsState.toJSON());
}

describe("app.setupRealtimeUpdates - init race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsState.apiProvider = "bitunix";
    settingsState.apiKeys = {
      bitunix: { key: "", secret: "" },
      bitget: { key: "", secret: "", passphrase: "" },
    };
  });

  it("does not call switchProvider on the initial synchronous subscribe emit", () => {
    // Regression test: app.init() connects exactly once via its own explicit
    // connectionManager.switchProvider() call. Before this fix,
    // setupRealtimeUpdates()'s settings subscription always saw a change on
    // its first (synchronous) emit - lastKeys started as "" instead of the
    // real current keys - and fired a second, competing switchProvider call
    // in the same tick, racing the first and closing the socket before it
    // finished opening.
    registerAndCaptureListener(() => app.setupRealtimeUpdates());

    expect(connectionManager.switchProvider).not.toHaveBeenCalled();
  });

  it("calls switchProvider exactly once when the provider actually changes", () => {
    const listener = registerAndCaptureListener(() => app.setupRealtimeUpdates());

    settingsState.apiProvider = "bitget";
    emit(listener);

    expect(connectionManager.switchProvider).toHaveBeenCalledTimes(1);
    expect(connectionManager.switchProvider).toHaveBeenCalledWith("bitget", { force: true });
  });

  it("calls switchProvider exactly once when only the API keys change", () => {
    const listener = registerAndCaptureListener(() => app.setupRealtimeUpdates());

    settingsState.apiKeys = {
      bitunix: { key: "new-key", secret: "new-secret" },
      bitget: { key: "", secret: "", passphrase: "" },
    };
    emit(listener);

    expect(connectionManager.switchProvider).toHaveBeenCalledTimes(1);
    expect(connectionManager.switchProvider).toHaveBeenCalledWith("bitunix", { force: true });
  });

  it("does not call switchProvider again when nothing relevant changed", () => {
    const listener = registerAndCaptureListener(() => app.setupRealtimeUpdates());

    emit(listener);
    emit(listener);

    expect(connectionManager.switchProvider).not.toHaveBeenCalled();
  });
});
