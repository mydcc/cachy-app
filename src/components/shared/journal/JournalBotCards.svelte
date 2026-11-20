<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<!--
  FEAT-0812 — one card per bot, so "keep it, change it, delete it" stops
  being a guess.

  The card shows what the bot's own exits earned and, beside it and never
  inside it, what a human took away by closing one of its positions by hand.
  Mixing the two would answer the wrong question: a trade the trader closed
  says nothing about whether the bot's exit works.

  Every figure arrives as a `Decimal` and is only formatted here. Nothing in
  this component does arithmetic on money.
-->

<script lang="ts">
    import { Decimal } from "decimal.js";
    import { _ } from "../../../locales/i18n";
    import type { BotTrackRecord } from "../../../lib/botTrackRecord";
    import Button from "../Button.svelte";

    interface Props {
        records: BotTrackRecord[];
        /** botId → the rule's name today, or null when the rule is gone. */
        botNames?: Map<string, string | null>;
        /** Closed trades written before attribution existed. */
        unattributedCount?: number;
        /** The bot whose trades the table is filtered to, "" for none. */
        selectedBotId?: string;
        onselect?: (botId: string) => void;
    }

    let {
        records,
        botNames = new Map(),
        unattributedCount = 0,
        selectedBotId = "",
        onselect,
    }: Props = $props();

    const MS_PER_MINUTE = 60_000;
    const MS_PER_HOUR = 3_600_000;
    const SPARK_WIDTH = 120;
    const SPARK_HEIGHT = 28;

    /** How many records one bot has — decides whether a version badge helps. */
    let versionsPerBot = $derived.by(() => {
        const counts = new Map<string, number>();
        for (const record of records) {
            counts.set(record.botId, (counts.get(record.botId) ?? 0) + 1);
        }
        return counts;
    });

    function labelOf(record: BotTrackRecord): string {
        const name = botNames.get(record.botId);
        if (typeof name === "string" && name.trim() !== "") return name;
        return record.botId;
    }

    /** Short form of the strategy version, shown only when a bot has several. */
    function versionBadge(record: BotTrackRecord): string | null {
        if ((versionsPerBot.get(record.botId) ?? 0) < 2) return null;
        return record.strategyHash === null ? "—" : record.strategyHash.slice(0, 7);
    }

    function money(value: Decimal): string {
        return value.toFixed(2);
    }

    function percent(value: Decimal): string {
        return `${value.toFixed(1)}%`;
    }

    function rMultiple(value: Decimal): string {
        return `${value.toFixed(2)}R`;
    }

    /**
     * Holding time as hours and minutes. A duration is not money, so it is
     * formatted off the `Decimal` rather than carried as one any further.
     */
    function holding(value: Decimal | null): string {
        if (value === null) return "—";
        const hours = value.div(MS_PER_HOUR).floor();
        const minutes = value.minus(hours.times(MS_PER_HOUR)).div(MS_PER_MINUTE).floor();
        if (hours.gt(0)) return `${hours.toFixed(0)}h ${minutes.toFixed(0)}m`;
        return `${minutes.toFixed(0)}m`;
    }

    /**
     * The equity curve as SVG coordinates.
     *
     * The values are money and stay `Decimal` until the last step; what comes
     * out is a pixel position, which is a display fact and nothing else.
     */
    function sparkline(curve: Decimal[]): string {
        if (curve.length < 2) return "";
        let min = curve[0];
        let max = curve[0];
        for (const point of curve) {
            if (point.lt(min)) min = point;
            if (point.gt(max)) max = point;
        }
        const span = max.minus(min);
        return curve
            .map((point, index) => {
                const x = (index / (curve.length - 1)) * SPARK_WIDTH;
                const y = span.isZero()
                    ? SPARK_HEIGHT / 2
                    : SPARK_HEIGHT -
                      point.minus(min).div(span).times(SPARK_HEIGHT).toNumber();
                return `${x.toFixed(2)},${y.toFixed(2)}`;
            })
            .join(" ");
    }

    function toneOf(value: Decimal): string {
        if (value.gt(0)) return "tone-up";
        if (value.lt(0)) return "tone-down";
        return "tone-flat";
    }

    function select(botId: string) {
        onselect?.(selectedBotId === botId ? "" : botId);
    }
</script>

<section class="bot-cards" data-testid="journal-bot-cards">
    <header class="cards-header">
        <h3 class="cards-title">{$_("journal.bots.title")}</h3>
        {#if selectedBotId !== ""}
            <Button
                variant="ghost"
                size="xs"
                id="bot-filter-clear"
                onClick={() => onselect?.("")}
            >
                {$_("journal.bots.clearSelection")}
            </Button>
        {/if}
    </header>

    {#if records.length === 0}
        <p class="empty" data-testid="bot-cards-empty">
            {$_("journal.bots.empty")}
        </p>
    {:else}
        <div class="cards-grid">
            {#each records as record (record.botId + (record.strategyHash ?? ""))}
                {@const badge = versionBadge(record)}
                <article
                    class="bot-card"
                    class:selected={selectedBotId === record.botId}
                    data-testid={`bot-card-${record.botId}`}
                >
                    <!-- FEAT-0613 escape: selection card head (class:selected on the card) — the primitive has no selected state and no card geometry -->
                    <button
                        type="button"
                        class="card-head"
                        title={$_("journal.bots.selectBot")}
                        onclick={() => select(record.botId)}
                    >
                        <span class="bot-name">{labelOf(record)}</span>
                        {#if badge !== null}
                            <span class="version-badge" data-testid="bot-version-badge">
                                {$_("journal.bots.version")}
                                {badge}
                            </span>
                        {/if}
                        {#if botNames.get(record.botId) === null}
                            <span class="deleted-badge" data-testid="bot-deleted-badge">
                                {$_("journal.bots.deletedBot")}
                            </span>
                        {/if}
                    </button>

                    <dl class="metrics">
                        <div class="metric">
                            <dt>{$_("journal.bots.trades")}</dt>
                            <dd data-testid="metric-trades">{record.trades}</dd>
                        </div>
                        <div class="metric">
                            <dt>{$_("journal.bots.winRate")}</dt>
                            <dd data-testid="metric-win-rate">{percent(record.winRate)}</dd>
                        </div>
                        <div class="metric">
                            <dt>{$_("journal.bots.avgR")}</dt>
                            <dd data-testid="metric-avg-r">{rMultiple(record.avgR)}</dd>
                        </div>
                        <div class="metric">
                            <dt>{$_("journal.bots.expectancy")}</dt>
                            <dd data-testid="metric-expectancy" class={toneOf(record.expectancy)}>
                                {money(record.expectancy)}
                            </dd>
                        </div>
                        <div class="metric">
                            <dt>{$_("journal.bots.maxDrawdown")}</dt>
                            <dd data-testid="metric-max-drawdown">{money(record.maxDrawdown)}</dd>
                        </div>
                        <div class="metric">
                            <dt>{$_("journal.bots.totalPnl")}</dt>
                            <dd data-testid="metric-total-pnl" class={toneOf(record.totalPnl)}>
                                {money(record.totalPnl)}
                            </dd>
                        </div>
                        <div class="metric">
                            <dt>{$_("journal.bots.avgHolding")}</dt>
                            <dd data-testid="metric-avg-holding">{holding(record.avgHoldingMs)}</dd>
                        </div>
                    </dl>

                    {#if record.equityCurve.length > 1}
                        <svg
                            class="sparkline"
                            viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
                            preserveAspectRatio="none"
                            aria-hidden="true"
                            data-testid="bot-sparkline"
                        >
                            <polyline points={sparkline(record.equityCurve)} />
                        </svg>
                    {/if}

                    {#if record.manualExits > 0}
                        <p class="side-row" data-testid="manual-exit-row">
                            <span class="side-label">{$_("journal.bots.manualExits")}</span>
                            <span class="side-value">
                                {record.manualExits} · {money(record.manualExitPnl)}
                            </span>
                            <span class="side-note">{$_("journal.bots.manualExitsNote")}</span>
                        </p>
                    {/if}

                    {#if record.openTrades > 0}
                        <p class="side-row" data-testid="open-trades-row">
                            <span class="side-label">{$_("journal.bots.openTrades")}</span>
                            <span class="side-value">{record.openTrades}</span>
                        </p>
                    {/if}
                </article>
            {/each}
        </div>
    {/if}

    {#if unattributedCount > 0}
        <p class="unattributed" data-testid="unattributed-note">
            {unattributedCount}
            {$_("journal.bots.unattributed")}
        </p>
    {/if}
</section>

<style>
    .bot-cards {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .cards-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
    }

    .cards-title {
        font-size: 0.9rem;
        font-weight: var(--font-semibold);
        color: var(--text-primary);
    }

    .empty,
    .unattributed {
        font-size: 0.78rem;
        color: var(--text-secondary);
        line-height: 1.45;
    }

    .cards-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
        gap: 0.75rem;
    }

    .bot-card {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 0.75rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-lg);
        background: var(--bg-secondary);
    }

    .bot-card.selected {
        border-color: var(--accent-color);
    }

    .card-head {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.4rem;
        background: transparent;
        border: none;
        padding: 0;
        cursor: pointer;
        text-align: left;
        color: inherit;
    }

    .bot-name {
        font-size: 0.85rem;
        font-weight: var(--font-semibold);
        color: var(--text-primary);
    }

    .version-badge,
    .deleted-badge {
        font-size: 0.65rem;
        font-family: monospace;
        padding: 0.05rem 0.35rem;
        border-radius: var(--radius-full);
        background: var(--bg-tertiary);
        color: var(--text-secondary);
    }

    .metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.35rem 0.75rem;
        margin: 0;
    }

    .metric {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
        min-width: 0;
    }

    .metric dt {
        font-size: 0.7rem;
        color: var(--text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .metric dd {
        margin: 0;
        font-size: 0.78rem;
        font-family: monospace;
        color: var(--text-primary);
    }

    .tone-up {
        color: var(--success-color);
    }

    .tone-down {
        color: var(--danger-color);
    }

    .tone-flat {
        color: var(--text-primary);
    }

    .sparkline {
        width: 100%;
        height: 28px;
    }

    .sparkline polyline {
        fill: none;
        stroke: var(--accent-color);
        stroke-width: 1.5;
        vector-effect: non-scaling-stroke;
    }

    .side-row {
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        gap: 0.35rem;
        font-size: 0.7rem;
        color: var(--text-secondary);
        border-top: 1px solid var(--border-color);
        padding-top: 0.4rem;
    }

    .side-value {
        font-family: monospace;
        color: var(--text-primary);
    }

    .side-note {
        flex-basis: 100%;
        font-style: italic;
    }
</style>
