<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  FEAT-0068 — the exchange's own account settings, from the trade panel.

  Three writes live here: leverage and margin mode for the active symbol, and
  the account-wide position mode. Each one the exchange documents a
  precondition for is shown *disabled with the reason* rather than hidden —
  the same rule PlaceOrderPanel follows for order types, and for the same
  reason: a control that vanishes reads as a missing feature in Cachy, while
  a disabled one says the exchange will not take it right now.

  Nothing here writes the displayed state optimistically. Every action
  re-reads through `tradeService`, which is what moves
  `tradeState.remoteLeverage`/`remoteMarginMode` — so the "synced" indicator
  next door turns green because the exchange confirmed it on a second read,
  not because a button was pressed.
-->

<script lang="ts">
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import { tradeState } from "../../stores/trade.svelte";
  import { marketState } from "../../stores/market.svelte";
  import { accountState } from "../../stores/account.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { paperState } from "../../stores/paperTrading.svelte";
  import { modalState } from "../../stores/modal.svelte";
  import { activeExchange } from "../../services/exchange";
  import { toastService } from "../../services/toastService.svelte";
  import { getDisplayMessage } from "../../utils/errorUtils";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import type { TranslationKey } from "../../locales/schema";

  const exchange = $derived(settingsState.apiProvider);
  const venueName = $derived(exchange.charAt(0).toUpperCase() + exchange.slice(1));

  /** The venue's own declaration (FEAT-0229) — not a venue-name test. */
  const supported = $derived(activeExchange().supports.accountSettings);

  const symbol = $derived(tradeState.symbol ?? "");
  const venueSymbol = $derived(
    symbol ? normalizeSymbol(symbol, exchange === "bitget" ? "bitget" : "bitunix") : "",
  );

  const remoteLeverage = $derived(tradeState.remoteLeverage);
  const remoteMarginMode = $derived(tradeState.remoteMarginMode);
  const isIsolated = $derived(
    // Bitunix spells it ISOLATION, the position mapper lowercases whatever
    // arrives, and Bitget would say "isolated". Matching the common prefix
    // beats keeping three spellings in step.
    (remoteMarginMode ?? "").toLowerCase().startsWith("isolat"),
  );

  const positionMode = $derived((accountState.positionMode ?? "").toUpperCase());

  /*
   * The exchange's preconditions, evaluated against the state Cachy already
   * holds: margin mode needs the *symbol* free of positions and resting
   * orders, position mode needs the *account* free of both
   * (docs/bitunix-api/02_account.md).
   *
   * This is the courtesy layer. The exchange enforces the same rules and its
   * refusal surfaces as an error — so a stale local view costs a rejected
   * request, never a silent wrong write.
   */
  const symbolBusy = $derived(
    accountState.positions.some((p) => p.symbol === venueSymbol) ||
      accountState.openOrders.some((o) => o.symbol === venueSymbol),
  );
  const accountBusy = $derived(
    accountState.positions.length > 0 || accountState.openOrders.length > 0,
  );

  const pairMeta = $derived(venueSymbol ? marketState.symbolMeta[venueSymbol] : undefined);
  const minLeverage = $derived(pairMeta?.minLeverage ?? 1);
  const maxLeverage = $derived(pairMeta?.maxLeverage ?? 125);

  /** The calculator's leverage input, as a whole number or null. */
  const desiredLeverage = $derived.by(() => {
    const raw = tradeState.leverage;
    if (raw === null || raw === undefined || String(raw).trim() === "") return null;
    try {
      const d = new Decimal(String(raw));
      return d.isFinite() && d.isInteger() && d.gt(0) ? d : null;
    } catch {
      return null;
    }
  });

  const leverageInRange = $derived(
    desiredLeverage !== null &&
      desiredLeverage.gte(minLeverage) &&
      desiredLeverage.lte(maxLeverage),
  );
  const leverageAlreadySet = $derived(
    desiredLeverage !== null &&
      remoteLeverage !== undefined &&
      desiredLeverage.eq(remoteLeverage),
  );

  let busy = $state<"" | "leverage" | "margin" | "position">("");

  const disabledReason = $derived.by(() => {
    if (paperState.enabled) return $_("exchange.accountSettings.paperMode");
    return "";
  });

  /** Reason the leverage button cannot be pressed, or "" when it can. */
  const leverageReason = $derived.by(() => {
    if (disabledReason) return disabledReason;
    if (desiredLeverage === null) return $_("exchange.accountSettings.leverageNeedsValue");
    if (!leverageInRange)
      return $_("exchange.accountSettings.leverageOutOfRange", {
        values: { symbol: venueSymbol, min: minLeverage, max: maxLeverage },
      });
    if (leverageAlreadySet)
      return $_("exchange.accountSettings.leverageInSync", {
        values: { value: desiredLeverage.toString() },
      });
    return "";
  });

  const marginModeReason = $derived.by(() => {
    if (disabledReason) return disabledReason;
    if (symbolBusy)
      return $_("exchange.accountSettings.blockedBySymbol", {
        values: { exchange: venueName, symbol: venueSymbol },
      });
    return "";
  });

  const positionModeReason = $derived.by(() => {
    if (disabledReason) return disabledReason;
    if (accountBusy)
      return $_("exchange.accountSettings.blockedByAnyPosition", {
        values: { exchange: venueName },
      });
    return "";
  });

  function report(e: unknown) {
    // `getDisplayMessage` renders a venue refusal and an exchange rejection;
    // a bare i18n key (paper mode, missing credentials) still needs
    // translating, and a key is the only message here without a space in it.
    const raw = getDisplayMessage(e, $_);
    toastService.error(raw.includes(" ") ? raw : $_(raw as TranslationKey));
  }

  async function applyLeverage() {
    if (!symbol || desiredLeverage === null || leverageReason || busy) return;

    /*
     * FEAT-0068's open question, answered yes: leverage on an open position
     * moves the liquidation price the moment it lands, so this one action
     * gets a confirmation the others do not. Opening a dialog for a symbol
     * with nothing open would just be noise.
     */
    if (symbolBusy) {
      const confirmed = await modalState.show(
        $_("exchange.accountSettings.confirmLeverageTitle"),
        $_("exchange.accountSettings.confirmLeverageMessage", {
          values: {
            symbol: venueSymbol,
            from: remoteLeverage ? remoteLeverage.toString() : "?",
            to: desiredLeverage.toString(),
          },
        }),
        "confirm",
      );
      if (confirmed !== true) return;
    }

    busy = "leverage";
    try {
      await activeExchange().account.changeLeverage(symbol, desiredLeverage);
      toastService.success(
        $_("exchange.accountSettings.leverageChanged", {
          values: { value: desiredLeverage.toString() },
        }),
      );
    } catch (e) {
      report(e);
    } finally {
      busy = "";
    }
  }

  async function applyMarginMode(mode: "ISOLATION" | "CROSS") {
    if (!symbol || marginModeReason || busy) return;
    busy = "margin";
    try {
      await activeExchange().account.changeMarginMode(symbol, mode);
      toastService.success($_("exchange.accountSettings.marginModeChanged"));
    } catch (e) {
      report(e);
    } finally {
      busy = "";
    }
  }

  async function applyPositionMode(mode: "ONE_WAY" | "HEDGE") {
    if (positionModeReason || busy) return;
    busy = "position";
    try {
      await activeExchange().account.changePositionMode(mode);
      toastService.success($_("exchange.accountSettings.positionModeChanged"));
    } catch (e) {
      report(e);
    } finally {
      busy = "";
    }
  }
</script>

{#if supported}
  <div
    class="flex flex-col gap-1.5 text-[10px] pt-1 border-t border-[var(--border-color)] border-opacity-40"
  >
    <div class="flex items-center justify-between">
      <span class="uppercase tracking-wider text-[var(--text-tertiary)]"
        >{$_("exchange.accountSettings.title")}</span
      >
      {#if paperState.enabled}
        <span class="text-[var(--warning-color)]"
          >{$_("exchange.accountSettings.paperMode")}</span
        >
      {/if}
    </div>

    <!-- Leverage: pushes the calculator's own input to the exchange. -->
    <div class="flex items-center justify-between gap-2">
      <span class="text-[var(--text-secondary)]">
        {$_("dashboard.generalInputs.leverage")}:
        <span class="font-semibold text-[var(--text-primary)]"
          >{remoteLeverage ? remoteLeverage.toString() + "x" : "—"}</span
        >
      </span>
      <button
        type="button"
        class="px-2 py-0.5 rounded border border-[var(--border-color)] text-[var(--text-primary)]
               hover-bg-accent-paired disabled:opacity-40 disabled:cursor-not-allowed"
        data-track-id="btn-apply-leverage"
        disabled={busy !== "" || leverageReason !== ""}
        title={leverageReason || undefined}
        onclick={applyLeverage}
      >
        {busy === "leverage"
          ? $_("exchange.accountSettings.pending")
          : $_("exchange.accountSettings.applyLeverage", {
              values: { value: desiredLeverage ? desiredLeverage.toString() : "—" },
            })}
      </button>
    </div>

    <!-- Margin mode: per symbol, refused by the venue while it is busy. -->
    <div class="flex items-center justify-between gap-2">
      <span class="text-[var(--text-secondary)]"
        >{$_("dashboard.generalInputs.marginMode")}:</span
      >
      <div class="flex gap-1" title={marginModeReason || undefined}>
        <button
          type="button"
          class="px-2 py-0.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          class:border-[var(--accent-color)]={remoteMarginMode !== undefined && isIsolated}
          class:text-[var(--accent-color)]={remoteMarginMode !== undefined && isIsolated}
          class:border-[var(--border-color)]={!(remoteMarginMode !== undefined && isIsolated)}
          data-track-id="btn-margin-mode-isolated"
          disabled={busy !== "" || marginModeReason !== ""}
          onclick={() => applyMarginMode("ISOLATION")}
        >
          {$_("exchange.accountSettings.isolated")}
        </button>
        <button
          type="button"
          class="px-2 py-0.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          class:border-[var(--accent-color)]={remoteMarginMode !== undefined && !isIsolated}
          class:text-[var(--accent-color)]={remoteMarginMode !== undefined && !isIsolated}
          class:border-[var(--border-color)]={!(remoteMarginMode !== undefined && !isIsolated)}
          data-track-id="btn-margin-mode-cross"
          disabled={busy !== "" || marginModeReason !== ""}
          onclick={() => applyMarginMode("CROSS")}
        >
          {$_("exchange.accountSettings.cross")}
        </button>
      </div>
    </div>

    <!-- Position mode: account-wide, so its precondition is account-wide too. -->
    <div class="flex items-center justify-between gap-2">
      <span class="text-[var(--text-secondary)]"
        >{$_("exchange.accountSettings.positionMode")}:</span
      >
      <div class="flex gap-1" title={positionModeReason || undefined}>
        <button
          type="button"
          class="px-2 py-0.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          class:border-[var(--accent-color)]={positionMode === "ONE_WAY"}
          class:text-[var(--accent-color)]={positionMode === "ONE_WAY"}
          class:border-[var(--border-color)]={positionMode !== "ONE_WAY"}
          data-track-id="btn-position-mode-one-way"
          disabled={busy !== "" || positionModeReason !== ""}
          onclick={() => applyPositionMode("ONE_WAY")}
        >
          {$_("exchange.accountSettings.oneWay")}
        </button>
        <button
          type="button"
          class="px-2 py-0.5 rounded border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          class:border-[var(--accent-color)]={positionMode === "HEDGE"}
          class:text-[var(--accent-color)]={positionMode === "HEDGE"}
          class:border-[var(--border-color)]={positionMode !== "HEDGE"}
          data-track-id="btn-position-mode-hedge"
          disabled={busy !== "" || positionModeReason !== ""}
          onclick={() => applyPositionMode("HEDGE")}
        >
          {$_("exchange.accountSettings.hedge")}
        </button>
      </div>
    </div>
  </div>
{/if}
