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
  import { settingsState } from "../../stores/settings.svelte";
  import { formatDynamicDecimal } from "../../utils/utils";
  import { Decimal } from "decimal.js";
  import { _ } from "../../locales/i18n";
  import type { OMSPosition } from "../../services/omsTypes";
  import { tpSlState } from "../../stores/tpsl.svelte";
  import type { TranslationKey } from "../../locales/schema";
  import {
    aggregateFleet,
    buildFleetRows,
    filterFleetRows,
    ownerFilterOptions,
    positionNotional,
    sortFleetRows,
    type FleetRow,
    type FleetSortKey,
  } from "../../services/positionFleet";

  interface Props {
    positions?: OMSPosition[];
    loading?: boolean;
    error?: string;
    // Svelte 5 event props
    onclose?: (pos: OMSPosition) => void;
    ontpSl?: (pos: OMSPosition) => void;
    /** FEAT-0068 — opens the add/withdraw-margin dialog. */
    onadjustMargin?: (pos: OMSPosition) => void;
    /**
     * FEAT-0334 — opens the scale-in dialog.
     *
     * Absent where the venue cannot take an add (FEAT-0017), which is why the
     * *button* is conditioned on the prop being supplied rather than on a
     * capability read here: the panel that knows which adapter is active is
     * the one that decides, and a list component asking the registry itself
     * would be a second place for that answer to live.
     */
    onadd?: (pos: OMSPosition) => void;
    /**
     * FEAT-0330 — the whole position, at market, in one click.
     *
     * Deliberately separate from `onclose`, which opens the partial-close
     * dialog. The two read as the same intent and are not: one asks how much,
     * the other has already decided it is all of it.
     */
    onflashClose?: (pos: OMSPosition) => void;
    /**
     * BUG-0513 — every open position, in one confirmed action.
     *
     * Absent where the parent does not wire it; the list shows no button
     * then, rather than a dead one. The confirmation (count, total notional)
     * is the caller's job — this component only announces the intent.
     */
    oncloseAll?: () => void;
    /**
     * FEAT-0808 — bot ownership of each row, keyed by positionId. Present
     * entries render a badge naming the bot that opened the position and
     * link back to the Bots tab; a manual position carries none because the
     * book stamped no owner for it.
     */
    botOwners?: Map<string, { botId: string; name: string | null }>;
    /** FEAT-0808 — the badge's destination; absent where no tab links back. */
    onshowbot?: () => void;
    /**
     * FEAT-0808 — the row a bot's "view position" link resolved to. The row
     * is highlighted and scrolled into view; null means no link is pending.
     */
    highlightPositionId?: string | null;
  }

  let {
    positions = [],
    loading = false,
    error = "",
    onclose,
    ontpSl,
    onadjustMargin,
    onadd,
    onflashClose,
    oncloseAll,
    botOwners,
    onshowbot,
    highlightPositionId = null,
  }: Props = $props();

  /*
   * FEAT-0068: only an isolated position has margin of its own to move — a
   * cross position draws on the account balance, and the exchange refuses an
   * adjustment on one.
   *
   * The prefix test is deliberate: Bitunix says ISOLATION, the mapper
   * lowercases whatever the venue sent, and `OMSPosition.marginMode` is
   * typed "cross" | "isolated" — three spellings that would otherwise have
   * to be kept in step.
   */
  function canAdjustMargin(pos: OMSPosition): boolean {
    return Boolean(onadjustMargin) && (pos.marginMode ?? "").toLowerCase().startsWith("isolat");
  }

  // PnL Logic
  function getPnlDisplay(pos: OMSPosition, mode: "value" | "percent" | "bar") {
    const val = pos.unrealizedPnl || new Decimal(0);
    if (mode === "percent" || mode === "bar") {
      if (!pos.margin || pos.margin.isZero()) return "ROI: N/A";
      const roi = val.div(pos.margin).mul(100);
      return `${roi.toFixed(2)}%`;
    }
    return `${val.gt(0) ? "+" : ""}${formatDynamicDecimal(val)}`;
  }

  function togglePnlMode() {
    const nextMode =
      settingsState.pnlViewMode === "value"
        ? "percent"
        : settingsState.pnlViewMode === "percent"
          ? "bar"
          : "value";
    settingsState.pnlViewMode = nextMode;
  }

  /*
   * FEAT-0256: the confirmation moved into `ClosePositionModal`, which asks
   * the same question and also answers *how much*. A `confirm()` here as well
   * would make the trader agree twice to one action, and the browser dialog
   * cannot show the quantity, the remainder or the PnL the close would book.
   *
   * `positionsList.confirmClose` is deliberately left in the locale files:
   * FEAT-0024's confirmation policy is the thing that decides which actions
   * are confirmed and how, and it will want that string.
   */
  function handleClose(pos: OMSPosition) {
    onclose?.(pos);
  }

  function getRoi(pos: OMSPosition) {
    if (!pos.margin || pos.margin.isZero()) return 0;
    const pnl = pos.unrealizedPnl || new Decimal(0);
    const margin = pos.margin;
    return pnl.div(margin).mul(100).toNumber();
  }

  // View Modes
  let viewMode = $derived(settingsState.positionViewMode || "detailed");
  let pnlMode = $derived(settingsState.pnlViewMode || "value");

  // Safe access to positions
  let safePositions = $derived(Array.isArray(positions) ? positions : []);

  /*
   * FEAT-0808 — the row a bot's "view position" link named: scroll it into
   * view once the list renders it. Scoped to this component's own DOM
   * (bind:this, not a document query) because the sidebar mounts twice —
   * desktop and mobile — and a document-level query could resolve to the
   * hidden instance's row.
   *
   * No cleanup to return: the effect registers no listener and no
   * subscription; the scroll is a one-shot side effect of the id changing.
   */
  let listHost: HTMLDivElement;

  $effect(() => {
    const id = highlightPositionId;
    if (!id || !listHost) return;
    // Rows can land after the link that named them (a tab switch resolving
    // ahead of the paper hydration), so the effect reads the row count too:
    // it re-runs when one arrives, and a late row still scrolls.
    void safePositions.length;
    const row = listHost.querySelector(`[data-position-id="${CSS.escape(id)}"]`);
    row?.scrollIntoView({ block: "nearest" });
  });

  /*
   * FEAT-0824 — the list is a fleet view: N positions, each with an owner or
   * none, sorted and filtered without ever dropping or doubling a row.
   *
   * The owner join keeps FEAT-0808's rule: no badge (and no owner filter)
   * where nothing links back to the Bots tab. Sort and filter are view state
   * of this list only — nothing here writes to the book.
   */
  const SORT_LABELS: Record<FleetSortKey, TranslationKey> = {
    symbol: "positionsList.sortSymbol",
    owner: "positionsList.sortOwner",
    pnl: "positionsList.sortPnl",
    age: "positionsList.sortAge",
  };
  const SORT_KEYS = Object.keys(SORT_LABELS) as FleetSortKey[];

  let sortKey = $state<FleetSortKey>("symbol");
  let ownerFilter = $state("all");

  let fleetRows = $derived(buildFleetRows(safePositions, onshowbot ? botOwners : undefined));
  let ownerOptions = $derived(ownerFilterOptions(fleetRows));
  // A filter naming a bot whose position just closed falls back to "all"
  // instead of leaving an empty list behind a control that no longer offers it.
  let effectiveFilter = $derived(
    ownerOptions.some((o) => o.value === ownerFilter) ? ownerFilter : "all",
  );
  let visibleRows = $derived(sortFleetRows(filterFleetRows(fleetRows, effectiveFilter), sortKey));
  let hasBotRows = $derived(fleetRows.some((r) => r.owner !== null));
  // One position needs no sorting; the controls appear when there is a fleet.
  let showFleetControls = $derived(fleetRows.length > 1);

  /**
   * The stop a position is protected by, from the shared plan cache the row
   * already reads. Absent (not zero) when there is none, or the plan carries
   * no usable price: the aggregate then counts the position as unprotected
   * instead of pricing its risk as the whole notional.
   */
  function stopFor(pos: OMSPosition): Decimal | undefined {
    if (!tpSlState.hasPlansFor(pos.symbol)) return undefined;
    const raw = tpSlState.plansFor(pos.symbol).loss?.triggerPrice;
    if (raw === undefined || raw === null || raw === "") return undefined;
    try {
      const price = new Decimal(raw);
      return price.gt(0) ? price : undefined;
    } catch {
      return undefined;
    }
  }

  // Over the whole book, not the filtered view: the figures describe the
  // account and must not move when the trader narrows the list. Derived from
  // `positions`, so they follow the book on every update with no polling.
  let aggregate = $derived(aggregateFleet(fleetRows, stopFor));

  function signed(value: Decimal): string {
    return `${value.gt(0) ? "+" : ""}${formatDynamicDecimal(value)}`;
  }

  /** Accessible name of a row: what a screen reader needs before any control. */
  function rowLabel(row: FleetRow): string {
    const pos = row.position;
    const owner = row.owner
      ? (row.owner.name ?? $_("positionsList.botOwner"))
      : $_("positionsList.ownerManual");
    return $_("positionsList.rowLabel", {
      values: {
        symbol: pos.symbol,
        side: pos.side,
        owner,
        pnl: pos.unpriced ? "–" : signed(pos.unrealizedPnl),
      },
    });
  }

  // Roving tabindex: one tab stop for the whole list, arrows move between
  // rows. At N=20+ a tab stop per card (each holding several buttons) would
  // make the list a wall to cross by keyboard.
  let activeRowKey = $state<string | null>(null);
  let rowTabStop = $derived(
    visibleRows.some((r) => r.key === activeRowKey) ? activeRowKey : (visibleRows[0]?.key ?? null),
  );

  function onRowKeydown(event: KeyboardEvent) {
    // Only when the card itself holds focus — a key pressed on a button
    // inside it belongs to that button.
    if (event.target !== event.currentTarget) return;
    const cards = Array.from(listHost.querySelectorAll<HTMLElement>("[data-fleet-row]"));
    const at = cards.indexOf(event.currentTarget as HTMLElement);
    const targetIndex =
      event.key === "ArrowDown"
        ? at + 1
        : event.key === "ArrowUp"
          ? at - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? cards.length - 1
              : null;
    if (targetIndex === null || at < 0) return;
    event.preventDefault();
    cards[Math.min(Math.max(targetIndex, 0), cards.length - 1)]?.focus();
  }
</script>

<div
  class="relative p-2 overflow-y-auto max-h-[500px] scrollbar-thin"
  bind:this={listHost}
>
  {#if loading && safePositions.length === 0}
    <div class="flex justify-center p-4">
      <div
        class="animate-spin rounded-full h-5 w-5 border-b-2 border-[var(--accent-color)]"
      ></div>
    </div>
  {:else if error}
    <div class="text-xs text-[var(--danger-color)] p-2 text-center">
      {error}
    </div>
  {:else if safePositions.length === 0}
    <div class="text-xs text-[var(--text-secondary)] text-center p-4">
      {$_("positionsList.noOpenPositions")}
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#if showFleetControls}
        <!-- FEAT-0824 — book totals, over every position whatever the filter. -->
        <dl
          class="grid grid-cols-2 gap-x-3 gap-y-0.5 p-2 text-[10px] rounded-lg bg-[var(--bg-primary)] border border-[var(--border-color)]"
          data-testid="fleet-aggregates"
          aria-label={$_("positionsList.fleetLabel")}
        >
          <div class="flex justify-between gap-2">
            <dt class="text-[var(--text-secondary)]">{$_("positionsList.fleetCount")}</dt>
            <dd class="font-mono" data-testid="fleet-count">{aggregate.count}</dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-[var(--text-secondary)]">{$_("positionsList.fleetPnl")}</dt>
            <dd
              class="font-mono font-bold"
              class:text-[var(--success-color)]={aggregate.totalPnl.gt(0)}
              class:text-[var(--danger-color)]={aggregate.totalPnl.lt(0)}
              data-testid="fleet-pnl"
            >
              {signed(aggregate.totalPnl)}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-[var(--text-secondary)]">{$_("positionsList.fleetExposure")}</dt>
            <dd class="font-mono" data-testid="fleet-exposure">
              {formatDynamicDecimal(aggregate.exposure)}
            </dd>
          </div>
          <div class="flex justify-between gap-2">
            <dt class="text-[var(--text-secondary)]">{$_("positionsList.fleetOpenRisk")}</dt>
            <dd class="font-mono" data-testid="fleet-open-risk">
              {formatDynamicDecimal(aggregate.openRisk)}
            </dd>
          </div>
          {#if aggregate.unprotectedCount > 0}
            <dd
              class="col-span-2 text-[var(--warning-color)]"
              data-testid="fleet-unprotected"
              title={$_("positionsList.fleetUnprotectedHint")}
            >
              {$_("positionsList.fleetUnprotected", { values: { count: aggregate.unprotectedCount } })}
            </dd>
          {/if}
          {#if aggregate.unpricedCount > 0}
            <dd
              class="col-span-2 text-[var(--warning-color)]"
              data-testid="fleet-unpriced"
              title={$_("positionsList.stalePriceHint")}
            >
              {$_("positionsList.fleetUnpriced", { values: { count: aggregate.unpricedCount } })}
            </dd>
          {/if}
        </dl>

        <div class="flex flex-wrap items-center gap-2 text-[10px]" data-testid="fleet-toolbar">
          <label class="flex items-center gap-1 text-[var(--text-secondary)]">
            {$_("positionsList.sortLabel")}
            <select
              class="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1 py-0.5 text-[var(--text-primary)]"
              data-testid="fleet-sort"
              value={sortKey}
              onchange={(e) => (sortKey = e.currentTarget.value as FleetSortKey)}
            >
              {#each SORT_KEYS as key (key)}
                <option value={key}>{$_(SORT_LABELS[key])}</option>
              {/each}
            </select>
          </label>
          {#if ownerOptions.length > 0}
            <label class="flex items-center gap-1 text-[var(--text-secondary)]">
              {$_("positionsList.filterLabel")}
              <select
                class="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-1 py-0.5 text-[var(--text-primary)] max-w-[10rem]"
                data-testid="fleet-filter"
                value={effectiveFilter}
                onchange={(e) => (ownerFilter = e.currentTarget.value)}
              >
                {#each ownerOptions as option (option.value)}
                  <option value={option.value}>
                    {#if option.kind === "all"}
                      {$_("positionsList.filterAll", { values: { count: option.count } })}
                    {:else if option.kind === "manual"}
                      {$_("positionsList.filterManual", { values: { count: option.count } })}
                    {:else if option.kind === "bots"}
                      {$_("positionsList.filterBots", { values: { count: option.count } })}
                    {:else}
                      {option.name ?? $_("positionsList.botOwner")} ({option.count})
                    {/if}
                  </option>
                {/each}
              </select>
            </label>
          {/if}
          {#if visibleRows.length !== fleetRows.length}
            <span class="text-[var(--text-tertiary)]" data-testid="fleet-showing">
              {$_("positionsList.fleetShowing", {
                values: { shown: visibleRows.length, total: fleetRows.length },
              })}
            </span>
          {/if}
        </div>
      {/if}
      {#if oncloseAll}
        <button
          type="button"
          class="w-full py-1.5 text-[11px] font-bold bg-danger-paired rounded-lg border border-[var(--danger-color)] transition-colors"
          onclick={() => oncloseAll?.()}
        >
          {$_("positionsList.closeAll")}
        </button>
      {/if}
      <div role="list" class="flex flex-col gap-2" aria-label={$_("positionsList.listLabel", { values: { count: visibleRows.length } })}>
      {#each visibleRows as row (row.key)}
        {@const pos = row.position}
        <!--
          Card Container. A listitem the keyboard can land on (roving
          tabindex, arrows in `onRowKeydown`): the card is a landmark in a
          long list, not a control, so the two a11y rules that say a
          non-interactive element must not take focus are overridden on
          purpose — one per comment, as svelte-ignore requires.
        -->
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="bg-[var(--bg-primary)] rounded-lg border border-[var(--border-color)] hover:border-[var(--accent-color)] transition-colors relative overflow-hidden group"
          class:border-[var(--accent-color)]={highlightPositionId !== null &&
            pos.positionId === highlightPositionId}
          class:border-l-[3px]={hasBotRows}
          class:border-l-[var(--accent-color)]={hasBotRows && row.owner !== null}
          role="listitem"
          tabindex={row.key === rowTabStop ? 0 : -1}
          aria-label={rowLabel(row)}
          data-position-id={pos.positionId}
          data-fleet-row
          data-owner={row.owner ? "bot" : "manual"}
          onkeydown={onRowKeydown}
          onfocusin={() => (activeRowKey = row.key)}
        >
          {#if viewMode === "detailed"}
            <!-- MODE 1: DETAILED / COMPACT UNIFIED -->
            <div class="p-2 grid grid-cols-1 gap-1">
              <!-- Header: Symbol + Side/Lev + MarginMode | PnL -->
              <div
                class="flex justify-between items-center pb-1 border-b border-[var(--border-color)] border-opacity-30"
              >
                <div class="flex items-center gap-1.5">
                  <span class="font-bold text-sm text-[var(--text-primary)]"
                    >{pos.symbol}</span
                  >
                  <span
                    class="text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider"
                    class:bg-green-900={pos.side.toLowerCase() === "long"}
                    class:text-green-300={pos.side.toLowerCase() === "long"}
                    class:bg-red-900={pos.side.toLowerCase() === "short"}
                    class:text-red-300={pos.side.toLowerCase() === "short"}
                  >
                    {pos.leverage}x
                  </span>
                  {#if pos.marginMode}
                    <span
                      class="text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                    >
                      {pos.marginMode}
                    </span>
                  {/if}
                  {#if row.owner}
                    {@const owner = row.owner}
                    <!--
                      FEAT-0808 — ownership in the direction the trader reads
                      it: this row was opened by a bot, and the badge is the
                      way back to the Bots tab. A manual position carries
                      none, because the book stamped no owner for it.
                    -->
                    <button
                      type="button"
                      class="text-[9px] px-1 py-0.5 rounded font-bold bg-accent-paired max-w-[10rem] truncate"
                      data-testid="bot-owner-badge"
                      title={owner.name !== null
                        ? $_("positionsList.botOwnerHintName", { values: { name: owner.name } })
                        : $_("positionsList.botOwnerHint")}
                      onclick={() => onshowbot?.()}
                    >
                      {owner.name ?? $_("positionsList.botOwner")}
                    </button>
                  {:else if hasBotRows}
                    <!-- FEAT-0824 — among bot positions a manual one says so,
                         so it is told apart without opening anything. -->
                    <span
                      class="text-[9px] px-1 py-0.5 rounded font-bold bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                      data-testid="manual-badge"
                    >
                      {$_("positionsList.ownerManual")}
                    </span>
                  {/if}
                </div>

                <!-- PnL Toggle -->
                <div
                  class="cursor-pointer select-none relative"
                  onclick={togglePnlMode}
                  role="button"
                  tabindex="0"
                  title={$_("positionsList.pnlToggleHint")}
                  onkeydown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      togglePnlMode();
                    }
                  }}
                >
                  {#if pos.unpriced}
                    <!--
                      BUG-0512: nothing provably fresh and the trader disabled
                      stale display — honestly unpriced ("–") rather than any
                      number. The totals badge that a leg is missing.
                    -->
                    <span
                      class="font-bold text-sm text-[var(--text-tertiary)]"
                      aria-live="off"
                      title={$_("positionsList.stalePriceHint")}
                      data-track-id="unpriced-pnl"
                      >–</span
                    >
                  {:else if pnlMode === "bar"}
                    <!-- Bar Representation -->
                    <div
                      class="h-5 w-20 bg-[var(--bg-secondary)] rounded relative overflow-hidden flex items-center justify-center border border-[var(--border-color)]"
                    >
                      <div
                        class="absolute inset-y-0 left-0 transition-all duration-300 opacity-30"
                        style="width: {Math.min(
                          Math.abs(Number(getRoi(pos))/* audit: safe — ROI percentage driving a CSS bar width, clamped to 100 */),
                          100,
                        )}%; background-color: {pos.unrealizedPnl.gt(0)
                          ? 'var(--success-color)'
                          : 'var(--danger-color)'}"
                      ></div>
                      <!-- Ticking PnL should have aria-live="off" to prevent overwhelming screen reader users -->
                      <span
                        class="text-[10px] font-bold z-10 relative"
                        aria-live="off"
                        class:text-[var(--success-color)]={pos.unrealizedPnl.gt(0)}
                        class:text-[var(--danger-color)]={pos.unrealizedPnl.lt(0)}
                      >
                        {getPnlDisplay(pos, "percent")}
                      </span>
                    </div>
                  {:else}
                    <span
                      class="font-bold text-sm"
                      aria-live="off"
                      class:text-[var(--success-color)]={pos.unrealizedPnl.gt(0)}
                      class:text-[var(--danger-color)]={pos.unrealizedPnl.lt(0)}
                    >
                      {getPnlDisplay(pos, pnlMode)}
                    </span>
                  {/if}
                  {#if pos.priceStale}
                    <!--
                      BUG-0512: this PnL was priced off a substitute or a
                      stale mark, never presented as live. Unmissable by
                      design — a stale number that looks live is the defect.
                    -->
                    <span
                      class="text-[9px] px-1 py-0.5 rounded font-bold uppercase tracking-wider bg-[var(--bg-secondary)] text-[var(--warning-color)] border border-[var(--border-color)]"
                      title={$_("positionsList.stalePriceHint")}
                      data-track-id="stale-price-badge"
                    >
                      {$_("positionsList.stalePriceBadge")}
                    </span>
                  {/if}
                </div>
              </div>

              <!-- Row 1: Size & Notional Value | Entry -> Mark -->
              <div class="grid grid-cols-2 gap-2 text-xs py-1">
                <div class="flex flex-col">
                  <span class="text-[var(--text-secondary)] text-[10px]"
                    >{$_("positionsList.size")}</span
                  >
                  <span class="font-mono">
                    {formatDynamicDecimal(pos.amount)}
                    <!-- Quote-equivalent size. Base quantity alone does not
                         answer "how much am I actually risking" at a glance,
                         which is the question this panel exists for. Mark
                         price when there is one; entry otherwise, matching
                         how the account summary derives its total. -->
                    <span class="text-[10px] text-[var(--text-tertiary)]"
                      >≈ {formatDynamicDecimal(positionNotional(pos))}</span
                    >
                  </span>
                </div>
                <div class="flex flex-col items-end">
                  <span class="text-[var(--text-secondary)] text-[10px]"
                    >{$_("dashboard.orderHistory.details.entry")} → {$_("dashboard.orderHistory.details.mark")}</span
                  >
                  <div class="flex items-center gap-1 text-[10px] font-mono">
                    <span class="text-[var(--text-primary)]"
                      >{formatDynamicDecimal(pos.entryPrice)}</span
                    >
                    <span class="text-[var(--text-tertiary)]">→</span>
                    <span class="text-[var(--text-primary)]"
                      >{pos.markPrice ? formatDynamicDecimal(pos.markPrice) : "?"}</span
                    >
                  </div>
                </div>
              </div>

              <!-- Row 2: Margin | Liquidation Price -->
              <div class="grid grid-cols-2 gap-2 text-[10px] py-1 border-t border-[var(--border-color)] border-opacity-30">
                <div class="flex justify-between items-center pr-2 border-r border-[var(--border-color)] border-opacity-30">
                  <span class="text-[var(--text-secondary)]">{$_("positionsList.margin")}:</span>
                  <span class="font-mono text-[var(--text-primary)]">{formatDynamicDecimal(pos.margin)}</span>
                </div>
                <div class="flex justify-between items-center pl-1">
                  <span class="text-[var(--text-secondary)]">{$_("dashboard.orderHistory.liq")}:</span>
                  {#if pos.liquidationPrice && pos.liquidationPrice.gt(0)}
                    <span class="font-mono text-[var(--warning-color)] font-medium">
                      {formatDynamicDecimal(pos.liquidationPrice)}
                    </span>
                  {:else}
                    <span class="font-mono text-[var(--text-tertiary)]">-</span>
                  {/if}
                </div>
              </div>

              <!-- Row 3: Margin Rate & Realized PnL (if available) -->
              {#if pos.marginRate || (pos.realizedPnl !== undefined && pos.realizedPnl !== null)}
                <div class="grid grid-cols-2 gap-2 text-[10px] py-1 border-t border-[var(--border-color)] border-opacity-30">
                  {#if pos.marginRate}
                    <div class="flex justify-between items-center pr-2 border-r border-[var(--border-color)] border-opacity-30">
                      <span class="text-[var(--text-secondary)]">{$_("positionsList.marginRate")}:</span>
                      <span class="font-mono text-[var(--text-secondary)]">{formatDynamicDecimal(pos.marginRate.mul(100))}%</span>
                    </div>
                  {:else}
                    <div></div>
                  {/if}
                  {#if pos.realizedPnl !== undefined && pos.realizedPnl !== null}
                    <div class="flex justify-between items-center pl-1">
                      <span class="text-[var(--text-secondary)]">{$_("positionsList.realizedPnl")}:</span>
                      <span
                        class="font-mono"
                        class:text-[var(--success-color)]={pos.realizedPnl.gt(0)}
                        class:text-[var(--danger-color)]={pos.realizedPnl.lt(0)}
                        class:text-[var(--text-secondary)]={pos.realizedPnl.isZero()}
                      >
                        {pos.realizedPnl.gt(0) ? "+" : ""}{formatDynamicDecimal(pos.realizedPnl)}
                      </span>
                    </div>
                  {:else}
                    <div></div>
                  {/if}
                </div>
              {/if}

              <!-- Active TP/SL, from the shared plan cache. Absent when the
                   position has none, and equally absent before the first
                   fetch resolves: there is nothing to show in either case,
                   so neither gets a row. -->
              {#if tpSlState.hasPlansFor(pos.symbol)}
                {@const plans = tpSlState.plansFor(pos.symbol)}
                <div
                  class="flex justify-between items-center text-[10px] py-1 border-t border-[var(--border-color)] border-opacity-30"
                >
                  <span class="text-[var(--text-tertiary)]"
                    >{$_("positionsList.tpslActive")}</span
                  >
                  <span class="flex gap-2 font-mono">
                    {#if plans.profit}
                      <span class="text-[var(--success-color)]"
                        >TP {formatDynamicDecimal(
                          new Decimal(plans.profit.triggerPrice || 0),
                        )}</span
                      >
                    {/if}
                    {#if plans.loss}
                      <span class="text-[var(--danger-color)]"
                        >SL {formatDynamicDecimal(
                          new Decimal(plans.loss.triggerPrice || 0),
                        )}</span
                      >
                    {/if}
                  </span>
                </div>
              {/if}

              <!-- Footer: Buttons -->
              <div class="flex gap-2 pt-1">
                <!--
                  FEAT-0254. Absent entirely where the venue cannot take a
                  standalone plan (FEAT-0017: `tpSlStandalone`), the same rule
                  the add-to-position control below follows and for the same
                  reason: a form the trader fills in and submits, and only then
                  fails, is the expensive direction. The button opens a dialog
                  — the commitment is made after the fields, not before.
                -->
                {#if ontpSl}
                  <button
                    class="flex-1 py-1 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                    data-track-id="btn-tp-sl"
                    onclick={() => ontpSl(pos)}
                  >
                    {$_("positionsList.tpsl")}
                  </button>
                {/if}
                {#if canAdjustMargin(pos)}
                  <button
                    class="flex-1 py-1 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                    data-track-id="btn-adjust-margin"
                    onclick={() => onadjustMargin?.(pos)}
                  >
                    {$_("positionsList.adjustMargin")}
                  </button>
                {/if}
                <!--
                  FEAT-0334. Beside the margin control rather than beside the
                  close controls: both open a dialog about how big the position
                  is, and neither takes anything off the table. Absent entirely
                  where the venue cannot scale in — an offered control that
                  fails after the trader has committed is worse than one that
                  was never there.
                -->
                {#if onadd}
                  <button
                    class="flex-1 py-1 text-[10px] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded border border-[var(--border-color)] transition-colors"
                    data-track-id="btn-add-to-position"
                    onclick={() => onadd(pos)}
                    title={$_("positionsList.addToPositionHint")}
                  >
                    {$_("positionsList.addToPosition")}
                  </button>
                {/if}
                <!--
                  FEAT-0330. Before Close, not after — and the ordering is
                  about reach, not reading order. These buttons are `flex-1`
                  in a row, so the last one sits on the right edge, which is
                  where a thumb lands most easily. That position belongs to
                  the control that opens a dialog, not to the one that closes
                  the whole position at market.

                  The focus/panic row follows the same rule and therefore
                  looks reversed: there the X is last and stays on the edge.
                -->
                <button
                  class="flex-1 py-1 text-[10px] bg-danger-paired rounded border border-[var(--danger-color)] transition-colors font-bold"
                  data-track-id="btn-flash-close"
                  onclick={() => onflashClose?.(pos)}
                  title={$_("positionsList.flashCloseHint")}
                >
                  {$_("positionsList.flashClose")}
                </button>
                <button
                  class="flex-1 py-1 text-[10px] bg-[var(--danger-color)] bg-opacity-10 hover:bg-opacity-20 text-[var(--danger-color)] rounded border border-[var(--danger-color)] border-opacity-30 transition-colors font-bold"
                  onclick={() => handleClose(pos)}
                >
                  {$_("positionsList.close")}
                </button>
              </div>
            </div>
          {:else}
            <!-- MODE 2: FOCUS / PANIC -->
            <div class="p-2 flex items-center justify-between h-12">
              <!-- PnL (Dominant) -->
              <div
                class="flex-1 cursor-pointer"
                onclick={togglePnlMode}
                role="button"
                tabindex="0"
                title={$_("positionsList.pnlToggleHint")}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    togglePnlMode();
                  }
                }}
              >
                <span
                  class="font-bold text-lg leading-none"
                  aria-live="off"
                  class:text-[var(--success-color)]={pos.unrealizedPnl.gt(0)}
                  class:text-[var(--danger-color)]={pos.unrealizedPnl.lt(0)}
                >
                  {getPnlDisplay(pos, pnlMode)}
                </span>
              </div>

              <!-- Symbol -->
              <div class="flex flex-col items-center px-2">
                <span class="font-bold text-xs">{pos.symbol}</span>
                <span class="text-[9px] opacity-60"
                  >{pos.side.toUpperCase()}</span
                >
              </div>

              {#if row.owner}
                {@const owner = row.owner}
                <!-- FEAT-0808 — same badge, panic mode: smaller, but the
                     ownership stays visible when the row is at its densest. -->
                <button
                  type="button"
                  class="text-[9px] px-1 py-0.5 rounded font-bold bg-accent-paired max-w-[8rem] truncate mr-1"
                  data-testid="bot-owner-badge"
                  title={owner.name !== null
                    ? $_("positionsList.botOwnerHintName", { values: { name: owner.name } })
                    : $_("positionsList.botOwnerHint")}
                  onclick={() => onshowbot?.()}
                >
                  {owner.name ?? $_("positionsList.botOwner")}
                </button>
              {:else if hasBotRows}
                    <!-- FEAT-0824 — among bot positions a manual one says so,
                         so it is told apart without opening anything. -->
                    <span
                      class="text-[9px] px-1 py-0.5 rounded font-bold bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                      data-testid="manual-badge"
                    >
                      {$_("positionsList.ownerManual")}
                    </span>
                  {/if}

              <!--
                FEAT-0330. The panic mode is where a one-click exit belongs,
                but it does not get to be the X: that already means "open the
                close dialog", and silently changing what a familiar button
                does in the mode people reach for when they are losing money
                is how a safety feature becomes an accident.

                Placed before the X for the same reason the detailed row
                places it before Close: the last element sits on the right
                edge, within easiest thumb reach, and that belongs to the
                control that only opens a dialog.
              -->
              <button
                class="w-8 h-8 mr-1 flex items-center justify-center bg-danger-paired rounded border border-[var(--danger-color)] transition-colors shadow-sm"
                data-track-id="btn-flash-close-focus"
                onclick={() => onflashClose?.(pos)}
                title={$_("positionsList.flashCloseHint")}
                aria-label={$_("positionsList.flashClose")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5Z" />
                </svg>
              </button>

              <!-- Close Button (X) -->
              <button
                class="w-8 h-8 flex items-center justify-center bg-[var(--danger-color)] text-white rounded hover:bg-opacity-80 transition-colors shadow-sm"
                onclick={() => handleClose(pos)}
                title={$_("positionsList.close")}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          {/if}
        </div>
      {/each}
      </div>
    </div>
  {/if}
</div>
