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
  import { untrack } from "svelte";
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
  import { normalizeMarginMode } from "../../utils/marginMode";
  import { projectLiquidation } from "../../lib/calculators/liquidation";
  import { confirmationPolicyStore } from "../../stores/confirmationPolicy.svelte";
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

  /**
   * How far the chip's two halves may drift apart before the pair stops
   * being one statement about the account (BUG-0409).
   *
   * They are fed by different endpoints on different triggers, so some skew
   * is normal and blanking on every second of it would be noise. What is not
   * normal is a gap this wide: that is the shape that produced `Cross • Hedge`
   * on screen, a pairing that had never existed on any venue — margin truth
   * from one era beside position truth from another.
   */
  const MODE_PAIR_MAX_SKEW_MS = 120_000;

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

  /*
   * The two halves come from different endpoints on different triggers, each
   * carrying its own stamp. When they drift far enough apart the pair stops
   * describing one account state, and showing it anyway is what produced
   * `Cross • Hedge` — a combination no venue ever reported (BUG-0409). The
   * older half is shown as unknown instead; the chip's own triggers read both
   * together, so opening it resolves the gap.
   */
  const modeStamps = $derived({
    margin: tradeState.remoteAccountStateAt,
    position: accountState.positionModeAt,
  });
  const modesSkewed = $derived(
    modeStamps.margin !== undefined &&
      modeStamps.position !== undefined &&
      Math.abs(modeStamps.margin - modeStamps.position) > MODE_PAIR_MAX_SKEW_MS,
  );
  const marginHalfOutdated = $derived(
    modesSkewed && (modeStamps.margin ?? 0) < (modeStamps.position ?? 0),
  );
  const positionHalfOutdated = $derived(modesSkewed && !marginHalfOutdated);

  const verifyingModes = $derived(
    accountState.marginModeVerifying || accountState.positionModeVerifying,
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
  let modeDialogEpoch = $state(0);

  /**
   * Read both halves of the chip in one go.
   *
   * Every trigger the chip owns uses this rather than refreshing one half:
   * a pair read together is a pair that agrees about when it was true, which
   * is the cheaper half of "never compose halves from different eras". The
   * skew check below covers what is left — a half refreshed by somebody
   * else's trigger.
   *
   * Both reads follow the silent contract (a failure leaves the previous
   * value and its previous stamp alone), so there is nothing to report here.
   */
  function refreshModes(forSymbol: string): void {
    if (paperState.enabled || !supported || exchange !== "bitunix") return;
    if (forSymbol) {
      void activeExchange().account.fetchLeverageMarginMode?.(forSymbol).catch(() => {});
    }
    void activeExchange().account.fetchPositionMode?.().catch(() => {});
  }

  /*
   * BUG-1 initial read: positionMode arrives via PositionsSidebar
   * /api/account on mount, but remoteMarginMode only refreshed in
   * PlaceOrderPanel when stale before an order + after a write.
   * This effect fires on symbol/provider change, skips paper +
   * unsupported venues, and lets the service guards (credentials,
   * session) decide the rest. No remote values read here, so the
   * write cannot loop. Cleanup flags this run's error handling; a
   * successful in-flight fetch still writes, ordered by the read ticket.
   */
  $effect(() => {
    const currentSymbol = symbol;
    const provider = exchange;
    const paper = paperState.enabled;
    const allowed = supported;
    if (!allowed || !currentSymbol || paper || provider !== "bitunix") return;
    let cancelled = false;
    // Both halves, not just the leverage one. The position mode is
    // account-wide and does not change with the symbol, but reading it here
    // is what keeps the pair stamped from the same moment — one extra
    // event-driven read against a 10 req/s budget (BUG-0409).
    void activeExchange().account.fetchLeverageMarginMode?.(currentSymbol).catch(() => {
      if (cancelled) return;
    });
    void activeExchange().account.fetchPositionMode?.().catch(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  });

  /**
   * Minimum gap between two focus-driven refreshes.
   *
   * Alt-tabbing is not a request for account data; returning to Cachy after
   * doing something in the broker app is. This keeps the useful case and
   * drops the drum roll of a trader switching windows repeatedly.
   */
  const FOCUS_REFRESH_MIN_GAP_MS = 15_000;

  let lastFocusRefreshAt = 0;

  /*
   * Window focus return — the trap the reporter named: anything changed in
   * the broker app between two Cachy interactions left Cachy showing
   * pre-change values with no indication, and the next Cachy write then
   * diffed and confirmed against them. No venue pushes settings changes
   * (push chain audited Sep 2026), so coming back to the tab is the only
   * moment Cachy can learn about an external change without polling.
   */
  $effect(() => {
    const forSymbol = symbol;
    const allowed = supported;
    const paper = paperState.enabled;
    const provider = exchange;
    if (!allowed || paper || provider !== "bitunix") return;

    const onReturn = () => {
      if (document.visibilityState === "hidden") return;
      const now = Date.now(); // audit: safe — epoch-ms timestamp, not a financial value
      if (now - lastFocusRefreshAt < FOCUS_REFRESH_MIN_GAP_MS) return;
      lastFocusRefreshAt = now;
      refreshModes(forSymbol);
    };

    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  });

  /*
   * BUG-2 live push: the WS position/order channels carry marginMode,
   * positionMode and leverage per object, but none ever reaches the chip's
   * sources (`tradeState.remote*`, `accountState.positionMode`) — an
   * external change only appeared after a reload. This effect bridges
   * them: any push on this symbol disagreeing with the chip re-reads REST
   * truth. Only the push side reads reactively; the authoritative values
   * are compared via untrack, so the re-read cannot loop — once it lands,
   * nothing disagrees anymore. No polling, no store cycle. A duplicate
   * fetch alongside the mount effect above is harmless (same endpoint).
   * Cleanup below flags this run's error handling only.
   */
  $effect(() => {
    const vs = venueSymbol;
    const sym = symbol;
    const allowed = supported;
    const paper = paperState.enabled;
    const provider = exchange;
    if (!allowed || !vs || !sym || paper || provider !== "bitunix") return;
    const pushMargin = normalizeMarginMode(
      accountState.positions.find((p) => p.symbol === vs)?.marginMode ??
        accountState.openOrders.find((o) => o.symbol === vs)?.marginMode,
    );
    const rawPos = String(
      accountState.openOrders.find((o) => o.symbol === vs)?.positionMode ?? "",
    ).toUpperCase();
    const pushPos = rawPos === "HEDGE" || rawPos === "ONE_WAY" ? rawPos : "";
    const pushLev = String(
      accountState.positions.find((p) => p.symbol === vs)?.leverage ??
        accountState.openOrders.find((o) => o.symbol === vs)?.leverage ??
        "",
    );
    const marginDrift = untrack(
      () => pushMargin !== "" && normalizeMarginMode(tradeState.remoteMarginMode) !== pushMargin,
    );
    const posDrift = untrack(
      () => pushPos !== "" && (accountState.positionMode ?? "").toUpperCase() !== pushPos,
    );
    // Same gap one field over: a leverage changed on the venue only
    // arrives here inside position/order pushes, never into
    // `remoteLeverage`. Non-numeric push junk never counts as drift.
    const levDrift = untrack(() => {
      const cur = tradeState.remoteLeverage;
      if (pushLev === "" || cur === undefined) return false;
      try {
        return !cur.equals(new Decimal(pushLev));
      } catch {
        return false;
      }
    });

    if (!marginDrift && !posDrift && !levDrift) return;
    let cancelled = false;
    if (marginDrift || levDrift) {
      void activeExchange().account.fetchLeverageMarginMode?.(sym).catch(() => {
        if (cancelled) return;
      });
    }
    if (posDrift) {
      // BUG-0410: `requestSync()` is a no-op unless PositionsSidebar is
      // mounted to register the callback, so drift the chip had already
      // *detected* was then silently dropped wherever the sidebar is hidden.
      // The chip reads for itself; the sync stays for the panel's own data.
      void activeExchange().account.fetchPositionMode?.().catch(() => {
        if (cancelled) return;
      });
      accountState.requestSync();
    }
    return () => {
      cancelled = true;
    };
  });

  /*
   * BUG-1b, the chip's right half: `accountState.positionMode` only arrived
   * via PositionsSidebar's snapshot — wherever the sidebar never fetched,
   * the chip showed "—" next to a working margin mode. Same shape as the margin-mode mount effect: fire while
   * unknown, stop once set. No loop:
   * the fetch resolves the condition it fires on; a failed fetch leaves it
   * unknown until a dependency moves, and only the dialog's own read
   * refreshes an already-known value. Cleanup flags this run's error
   * handling only.
   */
  $effect(() => {
    const allowed = supported;
    const paper = paperState.enabled;
    const provider = exchange;
    const currentSymbol = symbol;
    if (!allowed || paper || provider !== "bitunix") return;
    // With a symbol selected the paired refresh above already reads this half
    // and stamps it alongside the other one (BUG-0409); firing here as well
    // would only double the request. Without one, nothing else reads it, and
    // the right half would stay empty next to a working left half — which is
    // the gap this effect was added for.
    if (currentSymbol) return;
    if (accountState.positionMode !== undefined) return;
    let cancelled = false;
    void activeExchange().account.fetchPositionMode?.().catch(() => {
      if (cancelled) return;
    });
    return () => {
      cancelled = true;
    };
  });

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

  const modeChipTitle = $derived.by(() => {
    const margin =
      marginModeValue === undefined
        ? "\u2014"
        : isIsolated
          ? $_("exchange.accountSettings.isolated")
          : $_("exchange.accountSettings.cross");
    const pos =
      positionModeValue === undefined
        ? "\u2014"
        : positionModeValue === "HEDGE"
          ? $_("exchange.accountSettings.hedge")
          : $_("exchange.accountSettings.oneWay");
    const pair = `${margin} \u2022 ${pos}`;
    // The tooltip keeps naming both values even when one is blanked in the
    // chip: hiding the pairing is the point, hiding the reason is not.
    return modesSkewed
      ? `${pair}\n${$_("exchange.accountSettings.halvesOutOfSync")}`
      : pair;
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
    /*
     * FEAT-0020 wires this to FEAT-0024's policy, and the two ask different
     * questions.
     *
     * An open position always warns, whatever the policy says: the dialog
     * carries the projected liquidation price, a number the trader has no
     * other way to see before it becomes real. That is a consequence, not a
     * prompt — the same reason FEAT-0011's verification cannot be configured
     * away.
     *
     * Without a position there is nothing to project, so the question really
     * is "do you want to be asked", and the user's setting decides.
     */
    if (symbolBusy || confirmationPolicyStore.requires("leverage-change")) {
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

    /*
     * FEAT-0020. This path had no confirmation at all, while
     * `margin-mode-change` shipped defaulted on — the settings toggle existed
     * and changed nothing.
     *
     * Only the policy decides here, unlike leverage. The open-position case
     * that makes leverage always ask does not arise for either mode: both are
     * *blocked* rather than warned about — `marginModeReason` on a busy
     * symbol, `positionModeReason` on any open position — because the venue
     * refuses the change outright. A confirmation for a state the buttons are
     * disabled in would be unreachable code pretending to be a safeguard.
     *
     * Position mode has no toggle of its own in the catalogue, so it inherits
     * whatever margin mode's answer is when both change together, and asks
     * nothing when it changes alone.
     */
    const modeNeedsAsking =
      changes.marginMode !== undefined &&
      confirmationPolicyStore.requires("margin-mode-change");

    if (modeNeedsAsking) {
      const lines = [$_("exchange.accountSettings.confirmModesMessage")];
      if (changes.marginMode) {
        lines.push(
          $_("exchange.accountSettings.confirmMarginModeLine", {
            values: { symbol: venueSymbol, to: changes.marginMode },
          }),
        );
      }
      if (changes.positionMode) {
        lines.push(
          $_("exchange.accountSettings.confirmPositionModeLine", {
            values: { to: changes.positionMode },
          }),
        );
      }

      const confirmed = await modalState.show(
        $_("exchange.accountSettings.confirmModesTitle"),
        lines.join("\n\n"),
        "confirm",
      );
      if (confirmed !== true) return;
    }

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
      // Re-anchor the dialog's diff baseline (see baseEpoch): a retry after
      // a half-applied change then resends only what is still open.
      modeDialogEpoch += 1;
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
  <div class="flex min-w-0 flex-1 flex-col gap-1">
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
        if (busy) return;
        // BUG-2: the dialog seeds its drafts once from the chip's sources,
        // so re-read before opening — the next open (and the chip itself)
        // then shows what the exchange holds right now, not last reload.
        // Both halves re-read from a source the chip owns, together.
        // `requestSync()` alone left the right half seeded from the last
        // reload wherever PositionsSidebar is hidden — the dialog then opened
        // on a stale baseline and its diff proposed a change the trader never
        // made (BUG-0410).
        refreshModes(symbol);
        if (!paperState.enabled && supported && symbol && exchange === "bitunix") {
          accountState.requestSync();
        }
        modeOpen = true;
      }}
    >
      {#if verifyingModes}
        <!--
          The write already returned 200; what is running now is the read-back
          that proves the venue actually holds it (BUG-0409). Told apart from
          the write itself on purpose: "pending" and "checking" fail for
          different reasons and a trader deciding whether to wait needs to
          know which one is on screen.
        -->
        {$_("exchange.accountSettings.verifying")}
      {:else if busy === "modes"}
        {$_("exchange.accountSettings.pending")}
      {:else}
        <span class="font-semibold whitespace-nowrap" title={modeChipTitle}>
          {marginModeValue === undefined || marginHalfOutdated
            ? "—"
            : isIsolated
              ? $_("exchange.accountSettings.isolated")
              : $_("exchange.accountSettings.cross")}
          <span class="text-[var(--text-tertiary)]">•</span>
          {positionModeValue === undefined || positionHalfOutdated
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
      marginMode={marginModeValue}
      onclose={() => (leverageOpen = false)}
      onconfirm={confirmLeverage}
    />
  {/if}

  {#if modeOpen}
    <MarginModeModal
      baseEpoch={modeDialogEpoch}
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
    gap: var(--space-1);
    padding: var(--space-2) 0.6rem;
    min-height: 2.25rem;
    font-size: var(--text-xs);
    border-radius: var(--radius-md);
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
