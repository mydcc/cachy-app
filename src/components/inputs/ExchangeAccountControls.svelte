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
  FEAT-0328 — two labelled chips that open confirming dialogs.

  This component emits TWO sibling columns (leverage, margin/position) with no
  wrapper of its own, so the parent can lay them out in one row beside its own
  fee column. Svelte allows multiple roots; that is what is being used here.
  It emits nothing at all where the venue declares no `accountSettings`
  support, and the row then simply has one fewer column.

  NOTHING HERE SENDS ON A CLICK. Both chips open a dialog that collects a
  draft, and only its Confirm reaches the exchange. Every write in this
  component changes a live account, so every one of them is a deliberate,
  second act — a stray tap must never be enough.

  THE THREE WRITES ARE NOT GATED THE SAME, AND THE SHARED DIALOG MUST NOT MAKE
  THEM LOOK IT. The exchange documents a different precondition for each
  (docs/bitunix-api/02_account.md):

    leverage      no precondition at all — changeable with an open position
                  and with resting orders. Gated by nothing; the confirmation
                  carries the liquidation shift instead, because that is what
                  actually moves.
    margin mode   refused while THIS symbol carries a position or an order
                  -> symbolBusy
    position mode refused while ANY pair carries a position or an order; the
                  endpoint takes no symbol -> accountBusy

  Putting margin and position mode in one dialog is a layout choice. Giving
  them one gate would be a money bug. Each section carries its own reason.

  `busy` is a fourth, unrelated thing — one request is in flight — and blocks
  all of them so a double-apply cannot race.

  Nothing is written optimistically. Every action re-reads through
  `tradeService`, which is what moves `tradeState.remoteLeverage` /
  `remoteMarginMode`, so the chips show what the exchange confirmed on a
  second read rather than what was pressed.
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
  import { formatDynamicDecimal } from "../../utils/utils";
  import { normalizeSymbol } from "../../utils/symbolUtils";
  import { projectLiquidation } from "../../lib/calculators/liquidation";
  import type { TranslationKey } from "../../locales/schema";
  import LeverageModal from "../shared/LeverageModal.svelte";
  import MarginModeModal from "../shared/MarginModeModal.svelte";

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
  const marginModeValue = $derived<"ISOLATION" | "CROSS" | undefined>(
    remoteMarginMode === undefined ? undefined : isIsolated ? "ISOLATION" : "CROSS",
  );

  const positionMode = $derived((accountState.positionMode ?? "").toUpperCase());
  const positionModeValue = $derived<"ONE_WAY" | "HEDGE" | undefined>(
    positionMode === "HEDGE"
      ? "HEDGE"
      : positionMode === "ONE_WAY"
        ? "ONE_WAY"
        : undefined,
  );

  /*
   * The exchange's preconditions — see the header comment for why these two
   * are deliberately different, and why leverage uses neither.
   *
   * This is the courtesy layer. The exchange enforces the same rules and its
   * refusal surfaces as an error, so a stale local view costs a rejected
   * request, never a silent wrong write.
   */
  const symbolBusy = $derived(
    accountState.positions.some((p) => p.symbol === venueSymbol) ||
      accountState.openOrders.some((o) => o.symbol === venueSymbol),
  );
  const accountBusy = $derived(
    accountState.positions.length > 0 || accountState.openOrders.length > 0,
  );

  /** The open position on this symbol, when there is one. */
  const openPosition = $derived(
    accountState.positions.find((p) => p.symbol === venueSymbol),
  );

  const pairMeta = $derived(venueSymbol ? marketState.symbolMeta[venueSymbol] : undefined);
  const minLeverage = $derived(pairMeta?.minLeverage ?? 1);
  const maxLeverage = $derived(pairMeta?.maxLeverage ?? 125);

  let busy = $state<"" | "leverage" | "modes">("");
  let leverageOpen = $state(false);
  let modeOpen = $state(false);

  /*
   * FEAT-0328 decision 5, applied to a single control: with a broker
   * reporting a leverage this chip *is* the exchange's value, and confirming
   * sends it. In paper trading, or before any broker value has arrived, there
   * is no remote truth — the chip edits the local planning value instead,
   * which is what the calculator sizes with.
   */
  const localOnly = $derived(paperState.enabled || remoteLeverage === undefined);

  const shownLeverage = $derived.by(() => {
    if (!localOnly && remoteLeverage !== undefined) return remoteLeverage.toString();
    const raw = tradeState.leverage;
    return raw === null || raw === undefined || String(raw).trim() === ""
      ? ""
      : String(raw);
  });

  const marginModeReason = $derived.by(() => {
    if (paperState.enabled) return $_("exchange.accountSettings.paperMode");
    if (symbolBusy)
      return $_("exchange.accountSettings.blockedBySymbol", {
        values: { exchange: venueName, symbol: venueSymbol },
      });
    return "";
  });

  const positionModeReason = $derived.by(() => {
    if (paperState.enabled) return $_("exchange.accountSettings.paperMode");
    if (accountBusy)
      return $_("exchange.accountSettings.blockedByAnyPosition", {
        values: { exchange: venueName },
      });
    return "";
  });

  /*
   * The liquidation price the position would sit at under a new leverage,
   * calibrated out of the venue's own entry/liquidation/leverage triple
   * rather than a guessed maintenance-margin rate. Direction comes from the
   * numbers — a long liquidates below its entry, a short above it.
   *
   * An ESTIMATE, labelled as one, and null whenever an input is missing: a
   * wrong number on a money screen is worse than none.
   */

  function report(e: unknown) {
    // `getDisplayMessage` renders a venue refusal and an exchange rejection;
    // a bare i18n key (paper mode, missing credentials) still needs
    // translating, and a key is the only message here without a space in it.
    const raw = getDisplayMessage(e, $_);
    toastService.error(raw.includes(" ") ? raw : $_(raw as TranslationKey));
  }

  async function confirmLeverage(desired: Decimal) {
    if (busy) return;

    // No broker value to change: this is the calculator's own planning
    // leverage, and nothing travels.
    if (localOnly) {
      tradeState.leverage = desired.toString();
      leverageOpen = false;
      return;
    }
    if (!symbol) {
      leverageOpen = false;
      return;
    }

    /*
     * FEAT-0068's open question, answered yes: leverage on an open position
     * moves the liquidation price the moment it lands. The dialog already
     * showed the projection live; this is the commit, and it repeats the
     * number so the last thing read before sending is the consequence.
     */
    if (symbolBusy) {
      const projection = openPosition
        ? projectLiquidation(openPosition.entryPrice, openPosition.liquidationPrice, openPosition.leverage, desired)
        : null;
      const base = $_("exchange.accountSettings.confirmLeverageMessage", {
        values: {
          symbol: venueSymbol,
          from: remoteLeverage ? remoteLeverage.toString() : "?",
          to: desired.toString(),
        },
      });
      const message = projection
        ? base +
          "\n\n" +
          $_("exchange.accountSettings.confirmLeverageLiquidation", {
            values: {
              from: formatDynamicDecimal(projection.from),
              to: formatDynamicDecimal(projection.to),
            },
          })
        : base;

      const confirmed = await modalState.show(
        $_("exchange.accountSettings.confirmLeverageTitle"),
        message,
        "confirm",
      );
      if (confirmed !== true) return;
    }

    busy = "leverage";
    try {
      await activeExchange().account.changeLeverage(symbol, desired);
      toastService.success(
        $_("exchange.accountSettings.leverageChanged", {
          values: { value: desired.toString() },
        }),
      );
      leverageOpen = false;
    } catch (e) {
      report(e);
    } finally {
      busy = "";
    }
  }

  /*
   * Two modes can change in one confirmation, and they are two separate
   * endpoints — so this can succeed halfway. Each is reported on its own and
   * the dialog stays open when anything failed, because a half-applied
   * account state is exactly the thing the trader must not have to guess at.
   */
  async function confirmModes(changes: {
    marginMode?: "ISOLATION" | "CROSS";
    positionMode?: "ONE_WAY" | "HEDGE";
  }) {
    if (busy) return;
    busy = "modes";
    let failed = false;

    try {
      if (changes.marginMode && symbol && !marginModeReason) {
        try {
          await activeExchange().account.changeMarginMode(symbol, changes.marginMode);
          toastService.success($_("exchange.accountSettings.marginModeChanged"));
        } catch (e) {
          failed = true;
          report(e);
        }
      }

      if (changes.positionMode && !positionModeReason) {
        try {
          await activeExchange().account.changePositionMode(changes.positionMode);
          toastService.success($_("exchange.accountSettings.positionModeChanged"));
        } catch (e) {
          failed = true;
          report(e);
        }
      }
    } finally {
      busy = "";
    }

    if (!failed) modeOpen = false;
  }
</script>

{#if supported}
  <!-- Leverage column. Gated by nothing; see the header comment. -->
  <div class="flex flex-col gap-1 min-w-0">
    <span class="text-[11px] font-medium text-[var(--text-secondary)]"
      >{$_("dashboard.generalInputs.leverage")}</span
    >
    <button
      type="button"
      class="chip"
      data-track-id="btn-leverage-chip"
      aria-haspopup="dialog"
      aria-expanded={leverageOpen}
      disabled={busy !== ""}
      title={$_("exchange.accountSettings.leverageEdit")}
      onclick={() => {
        if (!busy) leverageOpen = true;
      }}
    >
      {#if busy === "leverage"}
        {$_("exchange.accountSettings.pending")}
      {:else}
        <span class="font-semibold">{shownLeverage ? shownLeverage + "x" : "—"}</span>
      {/if}
    </button>
  </div>

  <!--
    Margin and position mode share one chip: two halves of how the account
    holds positions, the way the venue's own dialog presents them.
  -->
  <div class="flex flex-col gap-1 min-w-0">
    <span class="text-[11px] font-medium text-[var(--text-secondary)]"
      >{$_("dashboard.generalInputs.marginMode")}</span
    >
    <button
      type="button"
      class="chip"
      data-track-id="btn-mode-chip"
      aria-haspopup="dialog"
      aria-expanded={modeOpen}
      disabled={busy !== ""}
      title={$_("exchange.accountSettings.modeTitle")}
      onclick={() => {
        if (!busy) modeOpen = true;
      }}
    >
      {#if busy === "modes"}
        {$_("exchange.accountSettings.pending")}
      {:else}
        <span class="font-semibold truncate">
          {marginModeValue === undefined
            ? "—"
            : isIsolated
              ? $_("exchange.accountSettings.isolated")
              : $_("exchange.accountSettings.cross")}
          <span class="text-[var(--text-tertiary)]">•</span>
          {positionModeValue === undefined
            ? "—"
            : positionModeValue === "HEDGE"
              ? $_("exchange.accountSettings.hedge")
              : $_("exchange.accountSettings.oneWay")}
        </span>
      {/if}
    </button>
  </div>

  {#if leverageOpen}
    <LeverageModal
      current={shownLeverage}
      {minLeverage}
      {maxLeverage}
      {localOnly}
      busy={busy === "leverage"}
      position={openPosition}
      onclose={() => (leverageOpen = false)}
      onconfirm={confirmLeverage}
    />
  {/if}

  {#if modeOpen}
    <MarginModeModal
      currentMarginMode={marginModeValue}
      currentPositionMode={positionModeValue}
      marginReason={marginModeReason}
      positionReason={positionModeReason}
      busy={busy === "modes"}
      onclose={() => (modeOpen = false)}
      onconfirm={confirmModes}
    />
  {/if}
{/if}

<style>
  /*
   * Sized to match the fee field the parent renders beside it, so the three
   * columns read as one row rather than three stacked controls.
   */
  .chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.5rem 0.6rem;
    min-height: 2.25rem;
    font-size: 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border-color);
    background-color: var(--bg-secondary);
    color: var(--text-primary);
    transition: border-color 0.15s ease;
  }
  .chip:hover:not(:disabled) {
    border-color: var(--accent-color);
  }
  .chip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
