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

import type { Settings } from "./settings.svelte";

/**
 * Edition/entitlement state (FEAT-0197 PR 2, feeding FEAT-0187): whether this
 * device is Pro-unlocked, and the capability map every gated feature reads.
 *
 * Takes the settings fields the capability map depends on (API credentials,
 * provider, market-activity toggle) as getters supplied by the caller rather
 * than importing `settings.svelte.ts` directly -- `SettingsManager` owns and
 * constructs this store, so importing back would be circular. This mirrors
 * the collaborator pattern used to split `activeTechnicalsManager.svelte.ts`
 * (FEAT-0196): the caller wires dependencies in, the collaborator doesn't
 * reach out for them.
 */
export class EntitlementStore {
  isPro = $state(false);
  isProLicenseActive = $state(false);

  constructor(
    private readonly getApiKeys: () => Settings["apiKeys"],
    private readonly getApiProvider: () => Settings["apiProvider"],
    private readonly getAutoTrading: () => boolean,
    private readonly getMultiAccount: () => boolean,
    private readonly getShowMarketActivity: () => boolean,
  ) {}

  get capabilities() {
    const apiKeys = this.getApiKeys();

    // For Bitget, we need key, secret AND passphrase
    const hasBitgetKeys = Boolean(
      apiKeys?.bitget?.key && apiKeys?.bitget?.secret && apiKeys?.bitget?.passphrase,
    );

    // For Bitunix, just key and secret
    const hasBitunixKeys = Boolean(apiKeys?.bitunix?.key && apiKeys?.bitunix?.secret);

    const hasApiKeys =
      this.getApiProvider() === "bitget" ? hasBitgetKeys : hasBitunixKeys;

    return {
      // ========== PUBLIC FEATURES (Community + Pro) ==========
      // Market data via WebSocket/API - available for all users
      marketData: this.getShowMarketActivity(),

      // Position calculator - always available (core feature)
      positionCalculator: true,

      // Technical indicators (RSI, Bollinger, etc.) - free for all
      technicals: true,

      // News sentiment analysis - free for all
      newsSentiment: true,

      // ========== PRO FEATURES (PowerToggle + API Secret) ==========
      // Trade execution - requires Pro license AND API credentials
      tradeExecution: this.isPro && hasApiKeys,

      // Live account data from private WebSocket
      livePositions: this.isPro && hasApiKeys,
      liveOrders: this.isPro && hasApiKeys,
      liveBalance: this.isPro && hasApiKeys,

      // Pro-only settings (require live data access)
      pnlSettings: this.isPro && hasApiKeys,
      feeSettings: this.isPro && hasApiKeys,

      // Future features (prepared for expansion)
      autoTrading: this.getAutoTrading(),
      multiAccount: this.getMultiAccount(),
    };
  }
}
