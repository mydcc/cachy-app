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

<script lang="ts">
  import { formatDynamicDecimal } from "../../utils/utils";
  import { _ } from "../../locales/i18n";
  import AccountTooltip from "./AccountTooltip.svelte";
  import { Decimal } from "decimal.js";

  type FinancialValue = number | string | Decimal;

  interface Props {
    available?: FinancialValue;
    margin?: FinancialValue;
    pnl?: FinancialValue;
    /**
     * BUG-0512: true when any leg of the total is not freshly priced —
     * the sum mixes priced, stale-priced and unpriced legs, so it wears
     * the same badge as the rows rather than looking exact.
     */
    pnlStale?: boolean;
    currency?: string;
    // Extended props
    frozen?: FinancialValue;
    transfer?: FinancialValue;
    bonus?: FinancialValue;
    positionMode?: string;
    crossUnrealizedPNL?: FinancialValue;
    isolationUnrealizedPNL?: FinancialValue;
    // Wallet-channel-only fields (WS "Balance Channel", 08_websocket.md) —
    // no REST equivalent, so these stay undefined until the first WS push.
    isolationFrozen?: FinancialValue;
    crossFrozen?: FinancialValue;
    expMoney?: FinancialValue;
    // Client-computed (Σ open position size × mark/entry price) — Bitunix
    // has no API field for this either, its own Assets panel derives it
    // the same way.
    totalPositionSize?: FinancialValue;
    // Set when the REST account fetch failed. Previously a failure here
    // left every field at its all-zero default with nothing in the UI
    // distinguishing that from a genuinely empty account.
    error?: string;
  }

  let {
    available = 0,
    margin = 0,
    pnl = 0,
    pnlStale = false,
    currency = "USDT",
    frozen = 0,
    transfer = 0,
    bonus = 0,
    positionMode = "",
    crossUnrealizedPNL = 0,
    isolationUnrealizedPNL = 0,
    isolationFrozen,
    crossFrozen,
    expMoney,
    totalPositionSize = 0,
    error = ""
  }: Props = $props();

  // BUG-0562: equity and margin details are a disclosure, not a hover.
  // One state flag driven by mouse, focus and keyboard alike, so touch
  // (tap = focus) and keyboard reach the same content as the mouse.
  // The panel renders inline below the balance row — including on narrow
  // screens, where there is no hover to fall back to.
  let detailsOpen = $state(false);
  let triggerEl: HTMLElement | null = $state(null);
  const ACCOUNT_DETAILS_PANEL_ID = "account-details-panel";
  let panelEl: HTMLElement | null = $state(null);
  let pointerOverPanel = $state(false);

  function openDetails() {
    detailsOpen = true;
  }

  // Escape dismisses the disclosure and hands focus back to its trigger.
  // Focus is restored BEFORE closing: a focus() that actually moves focus
  // re-fires onfocus → openDetails(), so the close has to run last for the
  // panel to end up closed. When the trigger already holds focus the
  // focus() call is skipped (it would not move focus anyway).
  function handleEscape() {
    if (document.activeElement !== triggerEl) triggerEl?.focus();
    detailsOpen = false;
  }

  function handleTriggerBlur(event: FocusEvent) {
    // The pointer resting inside the panel keeps the disclosure open even
    // though focus left the trigger (e.g. a mousedown inside the panel).
    const related =
      event.relatedTarget instanceof Node ? event.relatedTarget : null;
    if (pointerOverPanel || panelEl?.contains(related)) return;
    detailsOpen = false;
  }

  function handleWrapperMouseLeave() {
    // Keyboard focus outranks the pointer: a pointer pass must not
    // collapse a disclosure whose trigger still holds focus (finding 7).
    if (document.activeElement !== triggerEl) detailsOpen = false;
  }

  function handleDetailsKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      detailsOpen = !detailsOpen;
    } else if (event.key === "Escape") {
      handleEscape();
    }
  }

  // Document-level Escape (APG): dismisses a hover-opened panel while
  // focus sits elsewhere — the trigger's own handler cannot see that.
  // Registered only while open and always removed again (finding 8).
  $effect(() => {
    if (!detailsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleEscape();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });
</script>

<div
  class="p-3 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)] flex flex-col gap-2 relative"
>
  {#if error}
    <div class="text-xs text-[var(--danger-color)] flex justify-between items-center gap-2">
      <span>{error}</span>
    </div>
  {/if}
  <!-- Trigger + panel live in their own relative wrapper: the panel must
       be a sibling of the role="button" trigger, never its child — a
       button marks children presentational, which would drop the equity
       details out of the accessibility tree (finding 3). The wrapper is
       presentational: its pointer handlers are enhancements, the same
       open/close paths are reachable through focus and keyboard. -->
  <div
    class="relative"
    role="presentation"
    onmouseenter={openDetails}
    onmouseleave={handleWrapperMouseLeave}
  >
    <div
      bind:this={triggerEl}
      class="flex justify-between items-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] rounded"
      role="button"
      tabindex="0"
      aria-expanded={detailsOpen}
      aria-controls={detailsOpen ? ACCOUNT_DETAILS_PANEL_ID : undefined}
      onfocus={openDetails}
      onblur={handleTriggerBlur}
      onkeydown={handleDetailsKeyDown}
    >
      <div class="flex items-center gap-1">
        <span
          class="text-xs text-[var(--text-secondary)] border-b border-dashed border-[var(--text-secondary)]"
          >{$_("dashboard.account.balance")}</span
        >
      </div>
      <span class="text-sm font-bold text-[var(--text-primary)]"
        >{formatDynamicDecimal(available, 2)} {currency}</span
      >
    </div>

    {#if detailsOpen}
      <!-- role="group" marks the panel as a non-interactive content set;
           its pointer handlers only inform the blur logic above. -->
      <div
        id={ACCOUNT_DETAILS_PANEL_ID}
        bind:this={panelEl}
        role="group"
        class="absolute z-[100] left-0 top-full pt-2"
        onmouseenter={() => (pointerOverPanel = true)}
        onmouseleave={() => (pointerOverPanel = false)}
      >
        <AccountTooltip
          account={{
            available,
            margin,
            marginCoin: currency,
            frozen,
            transfer,
            bonus,
            positionMode,
            crossUnrealizedPNL,
            isolationUnrealizedPNL,
            isolationFrozen,
            crossFrozen,
            expMoney,
            totalUnrealizedPnL: pnl,
          }}
        />
      </div>
    {/if}
  </div>

  <div class="flex justify-between items-center">
    <span class="text-xs text-[var(--text-secondary)]"
      >{$_("dashboard.account.margin")}</span
    >
    <span class="text-sm font-bold text-[var(--text-primary)]"
      >{formatDynamicDecimal(margin, 2)} {currency}</span
    >
  </div>

  <div
    class="flex justify-between items-center pt-1 border-t border-[var(--border-primary)] border-dashed"
  >
    <span class="text-xs text-[var(--text-secondary)]"
      >{$_("dashboard.account.pnl")}</span
    >
    <span
      class="text-sm font-bold"
      class:text-[var(--success-color)]={new Decimal(pnl || 0).gt(0)}
      class:text-[var(--danger-color)]={new Decimal(pnl || 0).lt(0)}
      aria-live="off"
    >
      <!-- Ticking PnL should have aria-live="off" to prevent overwhelming screen reader users -->
      {new Decimal(pnl || 0).gt(0) ? "+" : ""}{formatDynamicDecimal(pnl, 2)}
      {currency}
      {#if pnlStale}
        <span
          class="text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider bg-[var(--bg-secondary)] text-[var(--warning-color)] border border-[var(--border-color)] ml-1"
          title={$_("positionsList.staleTotalHint")}
          data-track-id="stale-price-badge"
        >
          {$_("positionsList.stalePriceBadge")}
        </span>
      {/if}
    </span>
  </div>

  {#if new Decimal(totalPositionSize || 0).gt(0)}
    <div class="flex justify-between items-center">
      <span class="text-xs text-[var(--text-secondary)]"
        >{$_("dashboard.account.totalPositionSize")}</span
      >
      <span class="text-sm font-bold text-[var(--text-primary)]"
        >{formatDynamicDecimal(totalPositionSize, 2)} {currency}</span
      >
    </div>
  {/if}
</div>
