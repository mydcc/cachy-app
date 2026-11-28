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
  FEAT-0819 stage 5 + FEAT-0820 — grid bot configuration and pre-start risk panel.

  Kept store-free (all market/account inputs enter via props) so this component
  adds zero edges to the control-center import cycle and mounts standalone in
  component tests.
-->

<script lang="ts">
    import { untrack } from "svelte";
    import { Decimal } from "decimal.js";
    import {
        computeGridPreview,
        DEFAULT_GRID_ATR_PERIOD,
        MAX_GRID_LEVEL_COUNT,
        MIN_GRID_LEVEL_COUNT,
        suggestGridLevelsFromAtr,
    } from "../../../lib/calculators/gridEditorPreview";
    import {
        renderExitConditionSentence,
        type SentenceTranslator,
    } from "../../../lib/rules/ruleSentence";
    import type {
        CompareOp,
        Condition,
        EvaluationCandle,
        GridDocument,
        GridSide,
        GridSpacing,
        PriceField,
        TimeframeString,
    } from "../../../lib/rules/types";

    interface ConditionRowState {
        field: PriceField;
        op: CompareOp;
        value: string;
        original?: Condition;
    }

    interface Props {
        /** Existing grid document in edit mode, or `null` in create mode. */
        grid: GridDocument | null;
        /** Active paper taker fee rate as a fraction (e.g. `0.0006` for 6 bps). */
        feeRate: Decimal;
        /** Current paper account equity in quote currency. */
        accountEquity: Decimal;
        /** Lookup closed candles for `(symbol, timeframe)` to power ATR suggestion. */
        candlesFor?: (symbol: string, timeframe: TimeframeString) => readonly EvaluationCandle[];
        /** Lookup tick/quantity step for `symbol`. */
        stepsFor?: (symbol: string) => { priceStep?: Decimal; quantityStep?: Decimal };
        /** Locale translator passed down from host. */
        t: SentenceTranslator;
        /** Validates and persists `draft`. Returns an error message on refusal, or `null` on success. */
        onsave: (draft: GridDocument) => string | null;
        /** Validates, persists, and starts `draft`. Returns an error message on refusal, or `null` on success. */
        onsaveandstart?: (draft: GridDocument) => Promise<string | null>;
        oncancel: () => void;
    }

    let {
        grid,
        feeRate,
        accountEquity,
        candlesFor,
        stepsFor,
        t,
        onsave,
        onsaveandstart,
        oncancel,
    }: Props = $props();

    const creating = untrack(() => grid === null);
    const idPrefix = untrack(() => (grid ? `grid-edit-${grid.id}` : "grid-create"));
    const priceFields: PriceField[] = ["close", "open", "high", "low", "hl2", "hlc3"];
    const ops: CompareOp[] = ["lte", "lt", "gte", "gt"];
    const timeframes: TimeframeString[] = ["1m", "5m", "15m", "1h", "4h", "1d"];
    const WHOLE_NUMBER = /^\d+$/;

    function toRow(cond: Condition, tf: TimeframeString): ConditionRowState {
        if (
            cond.kind === "compare" &&
            cond.timeframe === tf &&
            cond.left.kind === "price" &&
            cond.left.source === undefined &&
            priceFields.includes(cond.left.field) &&
            cond.right.kind === "constant" &&
            ops.includes(cond.op)
        ) {
            return {
                field: cond.left.field,
                op: cond.op,
                value: cond.right.value,
            };
        }
        return {
            field: "close",
            op: "lte",
            value: "",
            original: cond,
        };
    }

    function toCondition(row: ConditionRowState, tf: TimeframeString): Condition {
        if (row.original !== undefined) {
            return $state.snapshot(row.original) as Condition;
        }
        return {
            kind: "compare",
            left: { kind: "price", field: row.field },
            op: row.op,
            right: { kind: "constant", value: row.value.trim() },
            timeframe: tf,
        };
    }

    let name = $state(untrack(() => grid?.name ?? ""));
    let symbol = $state(untrack(() => grid?.symbol ?? "BTCUSDT"));
    let side = $state<GridSide>(untrack(() => grid?.side ?? "long"));
    let timeframe = $state<TimeframeString>(
        untrack(() => grid?.evaluation_timeframe ?? "1h"),
    );
    let lowerPrice = $state(untrack(() => grid?.lower_price ?? ""));
    let upperPrice = $state(untrack(() => grid?.upper_price ?? ""));
    let levelCountRaw = $state(untrack(() => String(grid?.level_count ?? 5)));
    let spacing = $state<GridSpacing>(untrack(() => grid?.spacing ?? "arithmetic"));
    let quoteBudget = $state(untrack(() => grid?.sizing.amount ?? "500"));

    let trendRow = $state<ConditionRowState | null>(
        untrack(() =>
            grid?.trend_filter
                ? toRow(grid.trend_filter, grid.evaluation_timeframe)
                : null,
        ),
    );
    let stopOutRows = $state<ConditionRowState[]>(
        untrack(() =>
            grid && grid.stop_out.length > 0
                ? grid.stop_out.map((c) => toRow(c, grid.evaluation_timeframe))
                : [{ field: "close", op: "lte", value: "" }],
        ),
    );

    let refusalMessage = $state<string | null>(null);
    let refusalField = $state<string | null>(null);
    let startingBusy = $state(false);

    let normalizedSym = $derived(symbol.trim().toUpperCase());
    let parsedLevelCount = $derived.by(() => {
        const trimmed = levelCountRaw.trim();
        if (!WHOLE_NUMBER.test(trimmed)) return NaN;
        return Number(trimmed); // audit: safe — whole-number level count (core: u32), validated by WHOLE_NUMBER
    });

    let currentSteps = $derived(
        normalizedSym ? (stepsFor?.(normalizedSym) ?? {}) : {},
    );
    let currentCandles = $derived(
        normalizedSym ? (candlesFor?.(normalizedSym, timeframe) ?? []) : [],
    );

    let draftStopOut = $derived(stopOutRows.map((r) => toCondition(r, timeframe)));

    let preview = $derived(
        computeGridPreview({
            side,
            lowerPrice,
            upperPrice,
            levelCount: parsedLevelCount,
            spacing,
            budgetAmount: quoteBudget,
            stopOut: draftStopOut,
            feeRate,
            accountEquity,
            priceStep: currentSteps.priceStep,
            quantityStep: currentSteps.quantityStep,
        }),
    );

    let atrSuggestion = $derived(
        suggestGridLevelsFromAtr({
            lowerPrice,
            upperPrice,
            spacing,
            timeframe,
            candles: currentCandles,
            feeRate,
            period: DEFAULT_GRID_ATR_PERIOD,
        }),
    );

    function formatDec(value: Decimal, dp = 2): string {
        return value.toDecimalPlaces(dp, Decimal.ROUND_HALF_UP).toFixed(dp);
    }

    function formatPct(value: Decimal): string {
        return value.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3);
    }

    function applyAtrSuggestion(): void {
        if (!atrSuggestion) return;
        levelCountRaw = String(atrSuggestion.suggestedLevels);
    }

    function addTrendFilter(): void {
        trendRow = {
            field: "close",
            op: side === "long" ? "gte" : "lte",
            value: "",
        };
    }

    function removeTrendFilter(): void {
        trendRow = null;
    }

    function addStopOutRow(): void {
        stopOutRows.push({
            field: "close",
            op: side === "long" ? "lte" : "gte",
            value: "",
        });
    }

    function removeStopOutRow(index: number): void {
        stopOutRows.splice(index, 1);
    }

    function conditionSentence(row: ConditionRowState): string {
        return renderExitConditionSentence(
            { when: toCondition(row, timeframe), close: "all" },
            timeframe,
            t,
        );
    }

    function assembleAndValidate(): GridDocument | null {
        refusalMessage = null;
        refusalField = null;

        if (!normalizedSym) {
            refusalField = `${idPrefix}-symbol`;
            refusalMessage = t("settings.automation.editor.symbolRequired");
            return null;
        }
        if (
            !Number.isInteger(parsedLevelCount) ||
            parsedLevelCount < MIN_GRID_LEVEL_COUNT ||
            parsedLevelCount > MAX_GRID_LEVEL_COUNT
        ) {
            refusalField = `${idPrefix}-levels`;
            refusalMessage = t("settings.automation.grid.rangeInvalid");
            return null;
        }
        if (!preview.ok) {
            if (preview.reason === "levels-collapse") {
                refusalField = `${idPrefix}-levels`;
                refusalMessage = t("settings.automation.grid.levelsCollapse", {
                    levels: levelCountRaw.trim(),
                });
            } else if (preview.reason === "slot-below-step") {
                refusalField = `${idPrefix}-budget`;
                refusalMessage = t("settings.automation.grid.slotBelowStep");
            } else {
                refusalField = `${idPrefix}-lower`;
                refusalMessage = t("settings.automation.grid.rangeInvalid");
            }
            return null;
        }
        if (trendRow !== null && trendRow.original === undefined && !trendRow.value.trim()) {
            refusalField = `${idPrefix}-trend-value`;
            refusalMessage = t("settings.automation.editor.valueRequired");
            return null;
        }
        if (stopOutRows.length === 0) {
            refusalField = `${idPrefix}-stopout`;
            refusalMessage = t("settings.automation.grid.stopOutRequired");
            return null;
        }
        for (const [idx, row] of stopOutRows.entries()) {
            if (row.original === undefined && !row.value.trim()) {
                refusalField = `${idPrefix}-stopout-${idx}-value`;
                refusalMessage = t("settings.automation.editor.valueRequired");
                return null;
            }
        }

        const id =
            grid?.id ??
            (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? `grid-${crypto.randomUUID()}`
                : `grid-${Date.now()}`);
        const defaultName = `${normalizedSym} ${side.toUpperCase()} Grid`;

        return {
            kind: "grid",
            schema_version: grid?.schema_version ?? 1,
            id,
            name: name.trim() || defaultName,
            symbol: normalizedSym,
            side,
            evaluation_timeframe: timeframe,
            lower_price: lowerPrice.trim(),
            upper_price: upperPrice.trim(),
            level_count: parsedLevelCount,
            spacing,
            sizing: {
                basis: "quote_budget",
                amount: quoteBudget.trim(),
            },
            ...(trendRow !== null ? { trend_filter: toCondition(trendRow, timeframe) } : {}),
            stop_out: stopOutRows.map((r) => toCondition(r, timeframe)),
            consequence_level: "simulate",
            enabled: grid?.enabled ?? true,
            provenance: grid?.provenance ?? {
                source: "human",
                created_at_ms: Date.now(),
            },
        };
    }

    function handleSave(): void {
        const doc = assembleAndValidate();
        if (!doc) return;
        const err = onsave(doc);
        if (err !== null) {
            refusalMessage = err;
        }
    }

    async function handleSaveAndStart(): Promise<void> {
        if (!onsaveandstart || startingBusy) return;
        const doc = assembleAndValidate();
        if (!doc) return;
        startingBusy = true;
        try {
            const err = await onsaveandstart(doc);
            if (err !== null) {
                refusalMessage = err;
            }
        } finally {
            startingBusy = false;
        }
    }
</script>

<div
    class="flex flex-col gap-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4"
    data-testid="grid-bot-editor"
>
    <h4 class="text-sm font-semibold text-[var(--text-primary)]">
        {t(creating ? "settings.automation.grid.createTitle" : "settings.automation.grid.editTitle")}
    </h4>
    <p class="text-xs text-[var(--text-secondary)]">
        {t("settings.automation.grid.hint")}
    </p>

    <div class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1 text-sm" for={`${idPrefix}-name`}>
            <span class="text-[var(--text-secondary)]">{t("settings.automation.grid.name")}</span>
            <input
                id={`${idPrefix}-name`}
                type="text"
                bind:value={name}
                class="w-40 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            />
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`${idPrefix}-symbol`}>
            <span class="text-[var(--text-secondary)]">{t("settings.automation.grid.symbol")}</span>
            <input
                id={`${idPrefix}-symbol`}
                type="text"
                bind:value={symbol}
                aria-invalid={refusalField === `${idPrefix}-symbol` ? "true" : "false"}
                class="w-32 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 uppercase text-[var(--text-primary)]"
                class:border-[var(--danger-color)]={refusalField === `${idPrefix}-symbol`}
            />
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`${idPrefix}-side`}>
            <span class="text-[var(--text-secondary)]">{t("settings.automation.grid.side")}</span>
            <select
                id={`${idPrefix}-side`}
                value={side}
                onchange={(e) => {
                    side = e.currentTarget.value as GridSide;
                }}
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            >
                <option value="long">{t("settings.automation.grid.sideLong")}</option>
                <option value="short">{t("settings.automation.grid.sideShort")}</option>
            </select>
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`${idPrefix}-timeframe`}>
            <span class="text-[var(--text-secondary)]">{t("settings.automation.grid.timeframe")}</span>
            <select
                id={`${idPrefix}-timeframe`}
                value={timeframe}
                onchange={(e) => {
                    timeframe = e.currentTarget.value as TimeframeString;
                }}
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            >
                {#each timeframes as tf (tf)}
                    <option value={tf}>{tf}</option>
                {/each}
            </select>
        </label>
    </div>

    <div class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1 text-sm" for={`${idPrefix}-lower`}>
            <span class="text-[var(--text-secondary)]">{t("settings.automation.grid.lowerPrice")}</span>
            <input
                id={`${idPrefix}-lower`}
                type="text"
                inputmode="decimal"
                bind:value={lowerPrice}
                aria-invalid={refusalField === `${idPrefix}-lower` ? "true" : "false"}
                class="w-32 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                class:border-[var(--danger-color)]={refusalField === `${idPrefix}-lower`}
            />
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`${idPrefix}-upper`}>
            <span class="text-[var(--text-secondary)]">{t("settings.automation.grid.upperPrice")}</span>
            <input
                id={`${idPrefix}-upper`}
                type="text"
                inputmode="decimal"
                bind:value={upperPrice}
                class="w-32 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            />
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`${idPrefix}-levels`}>
            <span class="text-[var(--text-secondary)]">{t("settings.automation.grid.levelCount")}</span>
            <input
                id={`${idPrefix}-levels`}
                type="text"
                inputmode="numeric"
                bind:value={levelCountRaw}
                aria-invalid={refusalField === `${idPrefix}-levels` ? "true" : "false"}
                class="w-28 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                class:border-[var(--danger-color)]={refusalField === `${idPrefix}-levels`}
            />
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`${idPrefix}-spacing`}>
            <span class="text-[var(--text-secondary)]">{t("settings.automation.grid.spacing")}</span>
            <select
                id={`${idPrefix}-spacing`}
                value={spacing}
                onchange={(e) => {
                    spacing = e.currentTarget.value as GridSpacing;
                }}
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            >
                <option value="arithmetic">{t("settings.automation.grid.spacingArithmetic")}</option>
                <option value="geometric">{t("settings.automation.grid.spacingGeometric")}</option>
            </select>
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`${idPrefix}-budget`}>
            <span class="text-[var(--text-secondary)]">{t("settings.automation.grid.quoteBudget")}</span>
            <input
                id={`${idPrefix}-budget`}
                type="text"
                inputmode="decimal"
                bind:value={quoteBudget}
                aria-invalid={refusalField === `${idPrefix}-budget` ? "true" : "false"}
                class="w-32 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                class:border-[var(--danger-color)]={refusalField === `${idPrefix}-budget`}
            />
        </label>
    </div>

    {#if atrSuggestion}
        <div
            class="flex items-center justify-between gap-2 flex-wrap rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-secondary)]"
            data-testid="grid-atr-suggestion"
        >
            <span>
                {t("settings.automation.grid.atrSuggestion", {
                    period: DEFAULT_GRID_ATR_PERIOD,
                    atr: formatDec(atrSuggestion.atr),
                    levels: atrSuggestion.suggestedLevels,
                    step: formatDec(atrSuggestion.stepAmount),
                })}
            </span>
            <button
                type="button"
                data-testid="grid-atr-apply"
                class="rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
                onclick={applyAtrSuggestion}
            >
                {t("settings.automation.grid.atrApply")}
            </button>
        </div>
    {/if}

    {#if preview.ok && (preview.lowerMovedInward || preview.upperMovedInward)}
        <p
            class="text-xs text-[var(--warning-color)]"
            role="status"
            data-testid="grid-step-rounding-notice"
        >
            {t("settings.automation.grid.stepRoundingNotice", {
                lower: preview.effectiveLower.toFixed(),
                upper: preview.effectiveUpper.toFixed(),
            })}
        </p>
    {/if}

    {#if preview.ok && preview.spacingBelowFee && preview.narrowestSpacingPct && preview.minViableSpacingPct}
        <p
            class="text-xs text-[var(--warning-color)] rounded border border-[var(--border-color)] bg-[var(--bg-primary)] p-2"
            role="status"
            data-testid="grid-fee-warning"
        >
            {t("settings.automation.grid.feeWarning", {
                narrowest: formatPct(preview.narrowestSpacingPct),
                minViable: formatPct(preview.minViableSpacingPct),
            })}
        </p>
    {/if}

    <!-- Optional Trend Filter -->
    <section class="flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2">
            <h5 class="text-xs font-semibold text-[var(--text-primary)]">
                {t("settings.automation.grid.trendFilterTitle")}
            </h5>
            {#if trendRow === null}
                <button
                    type="button"
                    data-testid="grid-trend-add"
                    class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    onclick={addTrendFilter}
                >
                    {t("settings.automation.grid.trendFilterAdd")}
                </button>
            {:else}
                <button
                    type="button"
                    data-testid="grid-trend-remove"
                    class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--danger-color)] hover:bg-[var(--bg-tertiary)] transition-colors"
                    onclick={removeTrendFilter}
                >
                    {t("settings.automation.grid.trendFilterRemove")}
                </button>
            {/if}
        </div>
        <p class="text-xs text-[var(--text-secondary)]">
            {t("settings.automation.grid.trendFilterHint")}
        </p>
        {#if trendRow !== null}
            <div class="flex flex-col gap-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                {#if trendRow.original === undefined}
                    <div class="flex flex-wrap items-end gap-2">
                        <label class="flex flex-col gap-1 text-xs" for={`${idPrefix}-trend-field`}>
                            <span class="text-[var(--text-secondary)]">{t("settings.automation.editor.exitWhen")}</span>
                            <select
                                id={`${idPrefix}-trend-field`}
                                value={trendRow.field}
                                onchange={(e) => {
                                    if (trendRow) trendRow.field = e.currentTarget.value as PriceField;
                                }}
                                class="rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-primary)]"
                            >
                                {#each priceFields as field (field)}
                                    <option value={field}>{t(`rules.sentence.price.${field}`)}</option>
                                {/each}
                            </select>
                        </label>
                        <label class="flex flex-col gap-1 text-xs" for={`${idPrefix}-trend-op`}>
                            <span class="text-[var(--text-secondary)]">&nbsp;</span>
                            <select
                                id={`${idPrefix}-trend-op`}
                                value={trendRow.op}
                                onchange={(e) => {
                                    if (trendRow) trendRow.op = e.currentTarget.value as CompareOp;
                                }}
                                class="rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-primary)]"
                            >
                                {#each ops as op (op)}
                                    <option value={op}>{t(`rules.sentence.op.${op}`)}</option>
                                {/each}
                            </select>
                        </label>
                        <label class="flex flex-col gap-1 text-xs" for={`${idPrefix}-trend-value`}>
                            <span class="text-[var(--text-secondary)]">{t("settings.automation.editor.exitValue")}</span>
                            <input
                                id={`${idPrefix}-trend-value`}
                                type="text"
                                inputmode="decimal"
                                bind:value={trendRow.value}
                                aria-invalid={refusalField === `${idPrefix}-trend-value` ? "true" : "false"}
                                class="w-28 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-primary)]"
                                class:border-[var(--danger-color)]={refusalField === `${idPrefix}-trend-value`}
                            />
                        </label>
                    </div>
                {/if}
                <p class="text-xs text-[var(--text-secondary)]">{conditionSentence(trendRow)}</p>
            </div>
        {/if}
    </section>

    <!-- Mandatory Stop-Out Rules -->
    <section class="flex flex-col gap-2" id={`${idPrefix}-stopout`}>
        <div class="flex items-center justify-between gap-2">
            <h5 class="text-xs font-semibold text-[var(--text-primary)]">
                {t("settings.automation.grid.stopOutTitle")}
            </h5>
            <button
                type="button"
                data-testid="grid-stopout-add"
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                onclick={addStopOutRow}
            >
                {t("settings.automation.grid.stopOutAdd")}
            </button>
        </div>
        <p class="text-xs text-[var(--text-secondary)]">
            {t("settings.automation.grid.stopOutHint")}
        </p>

        {#each stopOutRows as row, idx (idx)}
            <div class="flex flex-col gap-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] p-2">
                <div class="flex flex-wrap items-end gap-2">
                    {#if row.original === undefined}
                        <label class="flex flex-col gap-1 text-xs" for={`${idPrefix}-stopout-${idx}-field`}>
                            <span class="text-[var(--text-secondary)]">{t("settings.automation.editor.exitWhen")}</span>
                            <select
                                id={`${idPrefix}-stopout-${idx}-field`}
                                value={row.field}
                                onchange={(e) => {
                                    row.field = e.currentTarget.value as PriceField;
                                }}
                                class="rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-primary)]"
                            >
                                {#each priceFields as field (field)}
                                    <option value={field}>{t(`rules.sentence.price.${field}`)}</option>
                                {/each}
                            </select>
                        </label>
                        <label class="flex flex-col gap-1 text-xs" for={`${idPrefix}-stopout-${idx}-op`}>
                            <span class="text-[var(--text-secondary)]">&nbsp;</span>
                            <select
                                id={`${idPrefix}-stopout-${idx}-op`}
                                value={row.op}
                                onchange={(e) => {
                                    row.op = e.currentTarget.value as CompareOp;
                                }}
                                class="rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-primary)]"
                            >
                                {#each ops as op (op)}
                                    <option value={op}>{t(`rules.sentence.op.${op}`)}</option>
                                {/each}
                            </select>
                        </label>
                        <label class="flex flex-col gap-1 text-xs" for={`${idPrefix}-stopout-${idx}-value`}>
                            <span class="text-[var(--text-secondary)]">{t("settings.automation.editor.exitValue")}</span>
                            <input
                                id={`${idPrefix}-stopout-${idx}-value`}
                                type="text"
                                inputmode="decimal"
                                bind:value={row.value}
                                aria-invalid={refusalField === `${idPrefix}-stopout-${idx}-value` ? "true" : "false"}
                                class="w-28 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1 text-[var(--text-primary)]"
                                class:border-[var(--danger-color)]={refusalField === `${idPrefix}-stopout-${idx}-value`}
                            />
                        </label>
                    {/if}
                    <button
                        type="button"
                        class="rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] px-2 py-1 text-xs text-[var(--danger-color)] hover:bg-[var(--bg-tertiary)] transition-colors"
                        onclick={() => removeStopOutRow(idx)}
                    >
                        {t("settings.automation.grid.stopOutRemove")}
                    </button>
                </div>
                <p class="text-xs text-[var(--text-secondary)]">{conditionSentence(row)}</p>
            </div>
        {/each}
    </section>

    {#if preview.ok}
        <div
            class="flex flex-col gap-1 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 text-xs"
            data-testid="grid-prestart-summary"
        >
            <span class="font-semibold text-[var(--text-primary)]">
                {t("settings.automation.grid.prestartTitle")}
            </span>
            <p class="text-[var(--text-secondary)]" data-testid="grid-estimated-budget">
                {t("settings.automation.grid.estimatedBudget", {
                    reserve: formatDec(preview.exposure.reserveWithFees),
                    notional: formatDec(preview.exposure.notional),
                    openFees: formatDec(preview.exposure.openFees),
                    roundTripFees: formatDec(preview.exposure.roundTripFees),
                })}
            </p>
            <p class="text-[var(--text-secondary)]" data-testid="grid-worst-case">
                {#if preview.worstCase && preview.stopOutPrice}
                    {#if preview.worstCaseSharePct !== null}
                        {t("settings.automation.grid.worstCaseWithShare", {
                            stopPrice: preview.stopOutPrice.toFixed(),
                            loss: formatDec(preview.worstCase.loss),
                            share: formatDec(preview.worstCaseSharePct),
                        })}
                    {:else}
                        {t("settings.automation.grid.worstCaseNoShare", {
                            stopPrice: preview.stopOutPrice.toFixed(),
                            loss: formatDec(preview.worstCase.loss),
                        })}
                    {/if}
                {:else}
                    {t("settings.automation.grid.worstCaseNonPrice")}
                {/if}
            </p>
        </div>
    {/if}

    {#if refusalMessage}
        <p
            class="text-sm text-[var(--danger-color)]"
            role="alert"
            data-testid="grid-editor-refusal"
        >
            {refusalMessage}
        </p>
    {/if}

    <div class="flex items-center gap-2 flex-wrap">
        <button
            type="button"
            data-testid="grid-editor-save"
            class="rounded px-3 py-1.5 text-xs font-semibold bg-accent-paired hover-bg-accent-paired transition-colors"
            onclick={handleSave}
        >
            {t("settings.automation.save")}
        </button>
        {#if onsaveandstart}
            <button
                type="button"
                data-testid="grid-editor-save-start"
                disabled={startingBusy}
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50"
                onclick={handleSaveAndStart}
            >
                {t("settings.automation.grid.saveAndStart")}
            </button>
        {/if}
        <button
            type="button"
            data-testid="grid-editor-cancel"
            class="rounded px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            onclick={oncancel}
        >
            {t("settings.automation.cancel")}
        </button>
    </div>
</div>
