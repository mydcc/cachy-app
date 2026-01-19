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

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as HotkeyModule from "./hotkeyService"; // Import as module to access exported function
import { settingsState } from "../stores/settings.svelte";
import { tradeStore } from "../stores/tradeStore";
import { uiStore } from "../stores/uiStore";
import { get } from "svelte/store";
import { CONSTANTS } from "../lib/constants";

// Mock dependencies
vi.mock("../stores/settings.svelte", () => ({
  settingsState: {
    hotkeyMode: "mode1",
    update: vi.fn((fn: any) => Object.assign(settingsState, fn(settingsState))),
  },
}));

vi.mock("../stores/tradeStore", () => {
  const { writable } = require("svelte/store");
  return {
    tradeStore: writable({}),
    updateTradeStore: vi.fn(), // Mock the exported helper
  };
});

vi.mock("../stores/uiStore", () => {
  const { writable } = require("svelte/store");
  return {
    uiStore: writable({
      showSettingsModal: false,
      settingsTab: "general",
      // activeInputId not in UI store, removed
    }),
  };
});

// Mock document for focus management
const mockElement = {
  focus: vi.fn(),
  select: vi.fn(),
  click: vi.fn(),
  tagName: "DIV",
  getAttribute: vi.fn(),
};

global.document.getElementById = vi.fn().mockReturnValue(mockElement);
// @ts-ignore - activeElement is readonly in TS lib but writable in JSDOM/Tests usually
Object.defineProperty(global.document, "activeElement", {
  value: document.body,
  writable: true,
});

describe("HotkeyService", () => {
  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Reset stores to default state
    // Reset stores to default state
    Object.assign(settingsState, {
      hotkeyMode: "mode1", // Default to Direct Mode for testing
      apiProvider: "bitunix",
      marketDataInterval: 1, // Changed to number as expected
      autoUpdatePriceInput: true,
      autoFetchBalance: false,
      showSidebars: true,
      showTechnicals: true,
      showIndicatorParams: false,
      useUtcDateParsing: false, // Added missing prop
      debugMode: false, // Added missing prop
      hideUnfilledOrders: false,
      positionViewMode: "detailed",
      pnlViewMode: "value",
      isPro: true,
      feePreference: "maker",
      favoriteTimeframes: [],
      favoriteSymbols: ["BTCUSDT", "ETHUSDT", "SOLUSDT"],
      syncRsiTimeframe: true,
      imgbbApiKey: "",
      imgbbExpiration: 0,
      apiKeys: {
        bitunix: { key: "", secret: "" },
        binance: { key: "", secret: "" },
      },
      enableSidePanel: true,
      sidePanelMode: "chat",
      sidePanelLayout: "standard", // Fixed: Added missing property
      chatStyle: "minimal",
      customSystemPrompt: "",
      panelState: { width: 400, height: 600, x: 20, y: 20 },
      aiProvider: "gemini",
      openaiApiKey: "",
      openaiModel: "gpt-4o",
      geminiApiKey: "",
      geminiModel: "gemini-2.0-flash",
      anthropicApiKey: "",
      anthropicModel: "claude-3-5-sonnet-20240620",
      disclaimerAccepted: true,
      customHotkeys: {},
      showSpinButtons: "hover",
      syncFavorites: true,
      confirmTradeDeletion: true,
      confirmBulkDeletion: true,
      aiConfirmActions: true,
      aiTradeHistoryLimit: 50,
      forceEnglishTechnicalTerms: false,
      enableGlassmorphism: true,
      maxPrivateNotes: 50,
      aiConfirmClear: true,
      chatFontSize: 13,
      minChatProfitFactor: 0.0,
      panelIsExpanded: false,
      isDeepDiveUnlocked: false,
      fontFamily: "Inter", // Added missing prop
    });

    tradeStore.set({
      // Minimal required mock properties for tradeStore
      targets: [],
      riskPercentage: 1,
      leverage: 10,
      tradeType: "long",
      // Add other required properties to satisfy TS if needed, or cast
      symbol: "BTCUSDT",
      accountSize: 1000,
      entryPrice: null,
      stopLossPrice: null,
      fees: 0.1,
      exitFees: 0.1,
      feeMode: "maker_taker",
      atrValue: null,
      atrMultiplier: 1.5,
      useAtrSl: true,
      atrMode: "auto",
      atrTimeframe: "1h",
      analysisTimeframe: "1h",
      tradeNotes: "",
      tags: [],
      isPositionSizeLocked: false,
      lockedPositionSize: null,
      isRiskAmountLocked: false,
      riskAmount: null,
      journalSearchQuery: "",
      journalFilterStatus: "all",
      currentTradeData: null,
      remoteLeverage: undefined,
      remoteMarginMode: undefined,
      remoteMakerFee: undefined,
      remoteTakerFee: undefined,
    });

    uiStore.set({
      showSettingsModal: false,
      // activeInputId: null // Removed
      currentTheme: "dark",
      showJournalModal: false,
      showChangelogModal: false,
      showGuideModal: false,
      showPrivacyModal: false,
      showWhitepaperModal: false, // Fixed: Added missing property
      showCopyFeedback: false,
      showSaveFeedback: false,
      errorMessage: "",
      showErrorMessage: false,
      isPriceFetching: false,
      settingsTab: "general",
      symbolSuggestions: [],
      showSymbolSuggestions: false,
      isLoading: false,
      loadingMessage: "",
      syncProgress: null,
      isAtrFetching: false, // Added missing property
      tooltip: {
        visible: false,
        type: null,
        data: null,
        x: 0,
        y: 0,
      },
    });

    // hotkeyService doesn't have an init(), it's likely initialized in App or Layout
    // We test handleGlobalKeydown directly
  });

  it("should ignore hotkeys when input is focused", () => {
    // Mock input being focused
    const inputElement = { ...mockElement, tagName: "INPUT" };
    // @ts-ignore
    global.document.activeElement = inputElement;

    const event = new KeyboardEvent("keydown", { key: "t" });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    HotkeyModule.handleGlobalKeydown(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });

  it("should handle Direct Mode (Mode 1) hotkeys", () => {
    settingsState.hotkeyMode = "mode1";
    // @ts-ignore
    global.document.activeElement = document.body;

    const event = new KeyboardEvent("keydown", { key: "e" });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    HotkeyModule.handleGlobalKeydown(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(document.getElementById).toHaveBeenCalledWith("entry-price-input");
    expect(mockElement.focus).toHaveBeenCalled();
  });

  it("should handle Safety Mode (Mode 2) hotkeys", () => {
    settingsState.hotkeyMode = "mode2";
    // @ts-ignore
    global.document.activeElement = document.body;

    // Press 'E' without Alt -> Should do nothing
    const event1 = new KeyboardEvent("keydown", { key: "e", altKey: false });
    HotkeyModule.handleGlobalKeydown(event1);
    expect(mockElement.focus).not.toHaveBeenCalled();

    // Press 'Alt + E' -> Should focus
    const event2 = new KeyboardEvent("keydown", { key: "e", altKey: true });
    const preventDefaultSpy = vi.spyOn(event2, "preventDefault");

    HotkeyModule.handleGlobalKeydown(event2);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(document.getElementById).toHaveBeenCalledWith("entry-price-input");
    expect(mockElement.focus).toHaveBeenCalled();
  });
});
