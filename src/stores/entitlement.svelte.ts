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
import { keysForActiveAccount } from "./settings/accounts";

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
    private readonly getAccounts: () => Settings["accounts"],
    private readonly getActiveAccountId: () => Settings["activeAccountId"],
    private readonly getApiProvider: () => Settings["apiProvider"],
    private readonly getAutoTrading: () => boolean,
    private readonly getMultiAccount: () => boolean,
    private readonly getShowMarketActivity: () => boolean,
  ) {}

  get capabilities() {
    const provider = this.getApiProvider();

    // FEAT-0026: one lookup, on the account that is actually active.
    //
    // This used to read both venues and then pick by provider, which was the
    // same answer while a venue meant an account. It is not any more: with
    // two accounts on one venue the venue lookup returns the first, so a
    // funded account A alongside an empty active account B reported
    // `tradeExecution: true` off A's credentials — the Pro surfaces unlocked
    // against keys the pending order would not be signed with.
    const keys = keysForActiveAccount(
      this.getAccounts(),
      this.getActiveAccountId(),
      provider,
    );

    // Bitget needs key, secret AND passphrase; Bitunix just key and secret.
    const hasApiKeys =
      provider === "bitget"
        ? Boolean(keys.key && keys.secret && keys.passphrase)
        : Boolean(keys.key && keys.secret);

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
