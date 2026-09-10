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
  FEAT-0394 -- the candlestick pattern picker.

  One choice and nothing else: which of the fourteen patterns the core can
  detect should arm this alarm. No thresholds to tune, because the geometry is
  the core's business and a trader tuning "how long is a long shadow" would be
  tuning something they cannot see the effect of.

  The tiles are grouped by how many candles the pattern spans, which is the
  same 1/2/3 split `CandlePattern::candles_spanned()` makes in Rust. Mirrors
  are placed side by side -- hammer next to hanging man, bullish engulfing next
  to bearish -- because picking the wrong half of a pair is the expensive
  mistake here, and the shapes are identical.

  Detection is not in this file and not anywhere in TypeScript. The catalogue it
  reads carries names, groups and drawings; `technicals-wasm/src/rule/pattern.rs`
  decides what actually printed.
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import {
        alertPanelState,
        refusalsForField,
    } from "../../../stores/alertPanel.svelte";
    import {
        CANDLES_SPANNED,
        NEEDS_TREND_CONTEXT,
        PATTERN_GLYPHS,
        PATTERN_GROUPS,
        PATTERN_GROUP_ORDER,
        TREND_LOOKBACK,
        buildPatternCondition,
        groupOf,
        readPatternForm,
        warmupCandles,
        type GlyphCandle,
        type PatternGroup,
    } from "../../../lib/alerts/patternCatalogue";
    import type { CandlePatternName } from "../../../lib/rules/types";
    import type { TranslationKey } from "../../../locales/schema";

    let { symbol: _symbol }: { symbol: string } = $props();

    const GROUP_KEYS: Record<PatternGroup, TranslationKey> = {
        single: "dashboard.alerts.candlesticks.group.single",
        multiple: "dashboard.alerts.candlesticks.group.multiple",
        structural: "dashboard.alerts.candlesticks.group.structural",
    };

    const GROUP_HINT_KEYS: Record<PatternGroup, TranslationKey> = {
        single: "dashboard.alerts.candlesticks.groupHint.single",
        multiple: "dashboard.alerts.candlesticks.groupHint.multiple",
        structural: "dashboard.alerts.candlesticks.groupHint.structural",
    };

    // The form starts from the draft, not from blank (FEAT-0395): a pattern
    // chosen here survives a trip to the Price tab and back. Read once at init
    // -- from here the form owns the document, and re-reading would fight the
    // write-through effect below.
    const initial = readPatternForm(alertPanelState.draft.conditions);
    let chosen = $state<CandlePatternName | null>(initial.pattern);

    // Same contract as every other builder: the document is the single source
    // of truth, so the tab writes through on every edit rather than converting
    // on arm. Null clears the condition, which is what disables the arm button
    // -- an empty pattern rule would be an alarm with no trigger.
    $effect(() => {
        alertPanelState.setSingleCondition(
            chosen
                ? buildPatternCondition(chosen, alertPanelState.draft.trigger_timeframe)
                : null,
        );
    });

    let conditionRefusals = $derived(
        refusalsForField(alertPanelState.refusals, "conditions"),
    );

    function nameKey(pattern: CandlePatternName): TranslationKey {
        // The Academy translations, reused by id (FEAT-0394). Not a second set
        // of names written for this panel.
        return `candlestickPatterns.${pattern}.name` as TranslationKey;
    }

    function meaningKey(pattern: CandlePatternName): TranslationKey {
        return `dashboard.alerts.candlesticks.meaning.${pattern}` as TranslationKey;
    }

    /*
     * Glyph geometry.
     *
     * The catalogue's candles are on an arbitrary 0-100 price scale; these map
     * it into the tile's viewBox. Drawn from data rather than as hand-authored
     * SVG per pattern so a shape and its mirror cannot drift apart in the
     * drawing while staying mirrored in the data.
     */
    const SLOT_WIDTH = 14;
    const BODY_WIDTH = 8;
    const VIEW_HEIGHT = 40;
    const PAD = 2;

    function y(value: number): number {
        return VIEW_HEIGHT - PAD - (value / 100) * (VIEW_HEIGHT - PAD * 2);
    }

    function centre(index: number): number {
        return index * SLOT_WIDTH + SLOT_WIDTH / 2;
    }

    function bodyTop(candle: GlyphCandle): number {
        return y(Math.max(candle.open, candle.close));
    }

    function bodyHeight(candle: GlyphCandle): number {
        // A floor of 1px so a body that is nearly a doji still draws as a line
        // rather than vanishing.
        return Math.max(y(Math.min(candle.open, candle.close)) - bodyTop(candle), 1);
    }

    function isBullish(candle: GlyphCandle): boolean {
        return candle.close >= candle.open;
    }

    function historyHint(pattern: CandlePatternName): string {
        const count = warmupCandles(pattern);
        if (!NEEDS_TREND_CONTEXT.includes(pattern)) {
            return $_("dashboard.alerts.candlesticks.historyHint", {
                values: { count },
            });
        }
        // Worth spelling out: these four need five extra candles purely to tell
        // a hammer from a hanging man, and a trader watching a fresh symbol
        // deserves to know why nothing fires at first.
        return $_("dashboard.alerts.candlesticks.trendHint", {
            values: {
                count,
                span: CANDLES_SPANNED[groupOf(pattern)],
                lookback: TREND_LOOKBACK,
            },
        });
    }
</script>

<div class="candlesticks-tab">
    {#each PATTERN_GROUP_ORDER as group (group)}
        <fieldset class="group">
            <legend class="group-legend">{$_(GROUP_KEYS[group])}</legend>
            <p class="group-hint">{$_(GROUP_HINT_KEYS[group])}</p>

            <div class="tiles">
                {#each PATTERN_GROUPS[group] as pattern (pattern)}
                    <label class="tile" class:chosen={chosen === pattern}>
                        <input
                            class="tile-input"
                            type="radio"
                            name="candlestick-pattern"
                            value={pattern}
                            bind:group={chosen}
                        />
                        <svg
                            class="glyph"
                            viewBox="0 0 {PATTERN_GLYPHS[pattern].length * SLOT_WIDTH} {VIEW_HEIGHT}"
                            aria-hidden="true"
                        >
                            {#each PATTERN_GLYPHS[pattern] as candle, i (i)}
                                <line
                                    class="wick"
                                    class:up={isBullish(candle)}
                                    x1={centre(i)}
                                    x2={centre(i)}
                                    y1={y(candle.high)}
                                    y2={y(candle.low)}
                                />
                                <rect
                                    class="body"
                                    class:up={isBullish(candle)}
                                    x={centre(i) - BODY_WIDTH / 2}
                                    y={bodyTop(candle)}
                                    width={BODY_WIDTH}
                                    height={bodyHeight(candle)}
                                />
                            {/each}
                        </svg>
                        <span class="tile-name">{$_(nameKey(pattern))}</span>
                        <span class="tile-meaning">{$_(meaningKey(pattern))}</span>
                    </label>
                {/each}
            </div>
        </fieldset>
    {/each}

    <!--
      What the trader has actually armed, and the two things about it that are
      not visible from the tiles: how much history it needs before it can say
      anything, and that it is only ever checked on a close.
    -->
    <div class="summary" role="status">
        {#if chosen}
            <p class="summary-line">{historyHint(chosen)}</p>
            <p class="summary-line muted">
                {$_("dashboard.alerts.candlesticks.closedOnly")}
            </p>
            <button type="button" class="clear" onclick={() => (chosen = null)}>
                {$_("dashboard.alerts.candlesticks.clear")}
            </button>
        {:else}
            <p class="summary-line muted">{$_("dashboard.alerts.candlesticks.none")}</p>
        {/if}
    </div>

    <!--
      Refusals the core raised against this tab's condition, anchored here
      rather than left to the shell: a refusal shown far from the control that
      caused it is one a trader has to hunt for.
    -->
    {#if conditionRefusals.length > 0}
        <div class="field-refusals" role="alert">
            {#each conditionRefusals as refusal (refusal.code + refusal.field)}
                <span class="refusal">{$_(refusal.i18n_key as TranslationKey)}</span>
            {/each}
        </div>
    {/if}
</div>

<style>
    .candlesticks-tab {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-1);
    }
    .group {
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        padding: var(--space-2);
        margin: 0;
        min-width: 0;
    }
    .group-legend {
        font-size: 0.75rem;
        color: var(--text-secondary);
        padding: 0 var(--space-1);
    }
    .group-hint {
        margin: 0 0 var(--space-2) 0;
        font-size: 0.7rem;
        line-height: 1.4;
        color: var(--text-secondary);
    }
    .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
        gap: var(--space-2);
    }
    .tile {
        display: grid;
        grid-template-columns: auto 1fr;
        grid-template-areas:
            "glyph name"
            "glyph meaning";
        align-items: start;
        gap: 0 var(--space-2);
        padding: var(--space-2);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        background: var(--bg-primary);
        cursor: pointer;
        min-width: 0;
    }
    .tile:hover {
        border-color: var(--accent-color);
    }
    .tile.chosen {
        border-color: var(--accent-color);
        background: var(--bg-secondary);
    }
    /*
     * The radio stays in the accessibility tree and keeps arrow-key navigation
     * within the group; only its default box is hidden. `display: none` would
     * take the keyboard behaviour with it.
     */
    .tile-input {
        position: absolute;
        opacity: 0;
        width: 1px;
        height: 1px;
        pointer-events: none;
    }
    .tile:focus-within {
        outline: 2px solid var(--accent-color);
        outline-offset: 1px;
    }
    .glyph {
        grid-area: glyph;
        width: 2.75rem;
        height: 2.5rem;
        flex: none;
    }
    .wick {
        stroke: var(--danger-color);
        stroke-width: 1.25;
    }
    .wick.up {
        stroke: var(--success-color);
    }
    .body {
        fill: var(--danger-color);
    }
    .body.up {
        fill: var(--success-color);
    }
    .tile-name {
        grid-area: name;
        font-size: 0.8rem;
        color: var(--text-primary);
        font-weight: var(--font-bold);
        line-height: 1.3;
    }
    .tile-meaning {
        grid-area: meaning;
        font-size: 0.7rem;
        color: var(--text-secondary);
        line-height: 1.4;
        margin-top: 0.15rem;
    }
    .summary {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        align-items: flex-start;
    }
    .summary-line {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.4;
        color: var(--text-primary);
    }
    .summary-line.muted {
        color: var(--text-secondary);
    }
    .clear {
        margin-top: var(--space-1);
        background: none;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        font-size: 0.7rem;
        padding: 0.2rem var(--space-2);
        cursor: pointer;
    }
    .clear:hover {
        color: var(--text-primary);
        border-color: var(--accent-color);
    }
    .refusal {
        display: block;
        color: var(--danger-color);
        font-size: 0.75rem;
        line-height: 1.4;
    }
</style>
