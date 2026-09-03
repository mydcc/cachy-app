// @vitest-environment happy-dom
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

import { migrateAccounts } from "../stores/settings/accounts";
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
import { settingsState } from "../stores/settings.svelte";
import { accountState } from "../stores/account.svelte";
import { accountSession } from "./accountSession.svelte";

import { flushSync } from "svelte";

describe("app.setupRealtimeUpdates - init race", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    settingsState.apiProvider = "bitunix";
    settingsState.accounts = migrateAccounts({ apiKeys: {
      bitunix: { key: "", secret: "" },
      bitget: { key: "", secret: "", passphrase: "" },
    } }).accounts;
  });

  it("does not call switchProvider on the initial synchronous subscribe emit", () => {
    app.setupRealtimeUpdates();
    flushSync();

    expect(connectionManager.switchProvider).not.toHaveBeenCalled();
  });

  it("calls switchProvider exactly once when the provider actually changes", async () => {
    app.setupRealtimeUpdates();
    flushSync();

    settingsState.apiProvider = "bitget";
    flushSync();

    await vi.waitFor(() => {
      expect(connectionManager.switchProvider).toHaveBeenCalledTimes(1);
    });
    expect(connectionManager.switchProvider).toHaveBeenCalledWith("bitget", { force: true });
  });

  it("calls switchProvider exactly once when only the API keys change", async () => {
    app.setupRealtimeUpdates();
    flushSync();

    settingsState.accountFor("bitunix").keys.key = "new-key";
    flushSync();

    await vi.waitFor(() => {
      expect(connectionManager.switchProvider).toHaveBeenCalledTimes(1);
    });
    expect(connectionManager.switchProvider).toHaveBeenCalledWith("bitunix", { force: true });
  });

  it("does not call switchProvider again when nothing relevant changed", async () => {
    app.setupRealtimeUpdates();
    flushSync();
    
    // Clear the initial potential mock calls (e.g. from the bug where lastKeys captures stale state)
    vi.clearAllMocks();

    // Triggering an update that shouldn't affect keys or provider
    settingsState.autoUpdatePriceInput = !settingsState.autoUpdatePriceInput;
    flushSync();

    // We can't waitFor a negative condition directly (it would timeout), but we can wait a bit
    await new Promise((r) => setTimeout(r, 50));
    expect(connectionManager.switchProvider).not.toHaveBeenCalled();
  });
});

/*
 * FEAT-0026 review finding.
 *
 * `computeKeys` includes the credential string, and the settings form binds
 * straight into `account.keys.key`, so every keystroke while a user types an
 * API key reaches this effect. Clearing there would blank their positions,
 * orders and balance once per character — a regression introduced by wiring
 * the clear into the same branch as the reconnect.
 *
 * Editing a key does not change which account is active. It still rotates the
 * session, because a response fetched with the previous key belongs to a
 * request the new one would not have made.
 */
describe("app.setupRealtimeUpdates - clearing is for identity, not keystrokes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    accountState.reset();
    settingsState.apiProvider = "bitunix";
    settingsState.accounts = migrateAccounts({ apiKeys: {
      bitunix: { key: "", secret: "" },
      bitget: { key: "", secret: "", passphrase: "" },
    } }).accounts;
    settingsState.activeAccountId = "bitunix";
  });

  const withOnePosition = () => {
    accountState.positions = [
      { symbol: "BTCUSDT", side: "long" },
    ] as unknown as typeof accountState.positions;
  };

  it("keeps the positions on screen while an API key is being typed", async () => {
    app.setupRealtimeUpdates();
    flushSync();
    withOnePosition();

    settingsState.accountFor("bitunix").keys.key = "n";
    flushSync();
    settingsState.accountFor("bitunix").keys.key = "ne";
    flushSync();

    await new Promise((r) => setTimeout(r, 20));
    expect(accountState.positions).toHaveLength(1);
  });

  it("still rotates the session on a key edit, so a stale response cannot land", async () => {
    app.setupRealtimeUpdates();
    flushSync();
    const before = accountSession.current();

    settingsState.accountFor("bitunix").keys.key = "edited";
    flushSync();

    await vi.waitFor(() => {
      expect(accountSession.isCurrent(before)).toBe(false);
    });
  });

  it("clears the positions when the active account actually changes", async () => {
    app.setupRealtimeUpdates();
    flushSync();
    withOnePosition();

    settingsState.accounts = [
      ...settingsState.accounts,
      { id: "bitunix-2", name: "Second", exchange: "bitunix", keys: { key: "k2", secret: "s2" } },
    ];
    settingsState.activeAccountId = "bitunix-2";
    flushSync();

    await vi.waitFor(() => {
      expect(accountState.positions).toHaveLength(0);
    });
  });
});

