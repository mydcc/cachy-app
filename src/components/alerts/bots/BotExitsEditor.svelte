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
  FEAT-0811 — the exits section of the bot editor.

  One compact row per exit: when the price is at least X, close all or a
  fraction of the position. Every row renders its live sentence through the
  same renderer the sidebar will read it back with, so what the trader saves
  and what the list later shows cannot drift into two vocabularies.

  The section never validates and never writes: the host owns the draft and
  the save. What it owns is the shape — removing the last row hands the host
  `undefined` (the document's honest "no exits", never an empty array the
  core refuses and a reload would have to interpret), and a partial row
  carries its fraction so the host's pre-save check can anchor to it.
-->

<script lang="ts">
    import { untrack } from "svelte";
    import Button from "../../shared/Button.svelte";
    import { _, locale } from "../../../locales/i18n";
    import type { TranslationKey } from "../../../locales/schema";
    import {
        renderExitConditionSentence,
        type SentenceTranslator,
    } from "../../../lib/rules/ruleSentence";
    import type {
        CompareOp,
        ExitClose,
        ExitRule,
        PriceField,
        StopDistance,
        TimeframeString,
    } from "../../../lib/rules/types";

    /** One row's editable shape — strings, the way inputs hold them. */
    interface ExitRowState {
        field: PriceField;
        op: CompareOp;
        value: string;
        close: ExitClose;
        /** Present exactly when `close` is partial; the host anchors to it. */
        fraction: string;
    }

    let {
        /** The exits being edited (empty means none yet). */
        exits,
        /** The take-profit distance as typed; "" means none. */
        takeProfitDistance,
        /** Side-aware wording (AC 6): a long's exits read one way, a short's
         * the mirrored way. */
        side,
        /** The rule's own trigger timeframe — a compact exit row reads the
         * same series the entry does; coarser exits are a later extension. */
        timeframe,
        /** DOM anchor — the bot id in edit mode, "draft" in create mode. */
        anchor,
        /** The host's save-time refusal anchor, so the row that earned it is
         * the row that shows it. */
        refusalField,
        /** The host's refusal message id, wired as described-by. */
        refusalDescribedBy,
        onexits,
        ontarget,
    }: {
        exits: ExitRule[];
        takeProfitDistance: string;
        side: "buy" | "sell";
        timeframe: TimeframeString;
        anchor: string;
        refusalField: string | null;
        refusalDescribedBy: string | undefined;
        /** `undefined` is a value: it is how "no exits" reaches the document. */
        onexits: (exits: ExitRule[] | undefined) => void;
        ontarget: (distance: string) => void;
    } = $props();

    // Read once, the same snapshot discipline BotEditor's order fields use:
    // the trader's typing is the state, and a live re-read would rewrite it
    // under their hands whenever the host's derived draft recomputed.
    let rows = $state<ExitRowState[]>(
        untrack(() =>
            exits.map((exit) => ({
                field: exit.when.kind === "compare" && exit.when.left.kind === "price"
                    ? exit.when.left.field
                    : "close",
                op: exit.when.kind === "compare" ? exit.when.op : "gte",
                value: exit.when.kind === "compare" && exit.when.right.kind === "constant"
                    ? exit.when.right.value
                    : "",
                close: exit.close,
                fraction: exit.fraction ?? "",
            })),
        ),
    );
    let target = $state(untrack(() => takeProfitDistance));

    const priceFields: PriceField[] = ["close", "open", "high", "low", "hl2", "hlc3"];
    const ops: CompareOp[] = ["gte", "lte", "gt", "lt"];

    function translator(): SentenceTranslator {
        return (key, values) => $_(key as TranslationKey, { values: values || {} });
    }

    /** One row as the document would carry it. */
    function exitOf(row: ExitRowState): ExitRule {
        return {
            when: {
                kind: "compare",
                left: { kind: "price", field: row.field },
                op: row.op,
                right: { kind: "constant", value: row.value },
                timeframe,
            },
            close: row.close,
            ...(row.close === "partial" ? { fraction: row.fraction } : {}),
        };
    }

    /** Every mutation pushes the whole current set, so the host's draft and
     * the read-back sentence are the row state, not a copy of it. */
    function publish(): void {
        onexits(rows.length === 0 ? undefined : rows.map(exitOf));
    }

    function addRow(): void {
        rows.push({
            field: "close",
            op: side === "buy" ? "gte" : "lte",
            value: "",
            close: "all",
            fraction: "",
        });
        publish();
    }

    function removeRow(index: number): void {
        rows.splice(index, 1);
        // AC 8: the last row's removal is "no exits" — `undefined`, never an
        // array the core refuses and a reload would have to interpret.
        publish();
    }

    function rowSentence(row: ExitRowState): string {
        void $locale;
        return renderExitConditionSentence(exitOf(row), timeframe, translator());
    }

    function targetOf(distance: string): StopDistance | undefined {
        const trimmed = distance.trim();
        return trimmed === "" ? undefined : { basis: "percent_of_entry", distance: trimmed };
    }

    /** The document's own words for the target, already side-aware. */
    function targetId(index: number): string {
        return `${anchor}-exit-${index}`;
    }
</script>

<section class="flex flex-col gap-2">
    <h4 class="text-sm font-semibold text-[var(--text-primary)]">
        {$_(
            side === "buy"
                ? "settings.automation.editor.exitsTitleLong"
                : "settings.automation.editor.exitsTitleShort",
        )}
    </h4>
    <p class="text-xs text-[var(--text-secondary)]">
        {$_("settings.automation.editor.exitsHint")}
    </p>

    {#each rows as row, i (targetId(i))}
        <div class="flex flex-col gap-1 rounded border border-[var(--border-color)] p-2">
            <div class="flex flex-wrap items-center gap-2">
                <label class="flex flex-col gap-1 text-xs" for={`${targetId(i)}-field`}>
                    <span class="text-[var(--text-secondary)]">
                        {$_("settings.automation.editor.exitWhen")}
                    </span>
                    <select
                        id={`${targetId(i)}-field`}
                        value={row.field}
                        onchange={(e) => {
                            row.field = e.currentTarget.value as PriceField;
                            publish();
                        }}
                        class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-[var(--text-primary)]"
                    >
                        {#each priceFields as field (field)}
                            <option value={field}>
                                {$_(`rules.sentence.price.${field}`)}
                            </option>
                        {/each}
                    </select>
                </label>

                <label class="flex flex-col gap-1 text-xs" for={`${targetId(i)}-op`}>
                    <span class="text-[var(--text-secondary)]">&nbsp;</span>
                    <select
                        id={`${targetId(i)}-op`}
                        value={row.op}
                        onchange={(e) => {
                            row.op = e.currentTarget.value as CompareOp;
                            publish();
                        }}
                        class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-[var(--text-primary)]"
                    >
                        {#each ops as op (op)}
                            <option value={op}>{$_(`rules.sentence.op.${op}`)}</option>
                        {/each}
                    </select>
                </label>

                <label class="flex flex-col gap-1 text-xs" for={`${targetId(i)}-value`}>
                    <span class="text-[var(--text-secondary)]">
                        {$_("settings.automation.editor.exitValue")}
                    </span>
                    <input
                        id={`${targetId(i)}-value`}
                        type="text"
                        inputmode="decimal"
                        bind:value={row.value}
                        oninput={publish}
                        aria-invalid={refusalField === `${targetId(i)}-value` ? "true" : "false"}
                        class="w-28 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-[var(--text-primary)]"
                        class:border-[var(--danger-color)]={refusalField === `${targetId(i)}-value`}
                    />
                </label>

                <label class="flex flex-col gap-1 text-xs" for={`${targetId(i)}-close`}>
                    <span class="text-[var(--text-secondary)]">
                        {$_("settings.automation.editor.exitClose")}
                    </span>
                    <select
                        id={`${targetId(i)}-close`}
                        value={row.close}
                        onchange={(e) => {
                            row.close = e.currentTarget.value as ExitClose;
                            publish();
                        }}
                        class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-[var(--text-primary)]"
                    >
                        <option value="all">
                            {$_("settings.automation.editor.exitCloseAll")}
                        </option>
                        <option value="partial">
                            {$_("settings.automation.editor.exitClosePartial")}
                        </option>
                    </select>
                </label>

                {#if row.close === "partial"}
                    <label class="flex flex-col gap-1 text-xs" for={`${targetId(i)}-fraction`}>
                        <span class="text-[var(--text-secondary)]">
                            {$_("settings.automation.editor.exitFraction")}
                        </span>
                        <input
                            id={`${targetId(i)}-fraction`}
                            type="text"
                            inputmode="decimal"
                            bind:value={row.fraction}
                            oninput={publish}
                            aria-invalid={refusalField === `${targetId(i)}-fraction`
                                ? "true"
                                : "false"}
                            aria-describedby={refusalField === `${targetId(i)}-fraction`
                                ? refusalDescribedBy
                                : undefined}
                            class="w-20 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-[var(--text-primary)]"
                            class:border-[var(--danger-color)]={refusalField
                                === `${targetId(i)}-fraction`}
                        />
                    </label>
                {/if}

                <Button
                    variant="ghost-danger"
                    size="sm"
                    onClick={() => removeRow(i)}
                >
                    {$_("settings.automation.editor.exitRemove")}
                </Button>
            </div>
            <p class="text-xs text-[var(--text-secondary)]" data-testid="exit-row-sentence">
                {rowSentence(row)}
            </p>
        </div>
    {/each}

    <div class="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={addRow}>
            {$_("settings.automation.editor.exitAdd")}
        </Button>

        <label class="flex flex-col gap-1 text-xs" for={`${anchor}-take-profit`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.editor.takeProfitDistance")}
            </span>
            <input
                id={`${anchor}-take-profit`}
                type="text"
                inputmode="decimal"
                bind:value={target}
                oninput={() => ontarget(target)}
                aria-invalid={refusalField === `${anchor}-take-profit` ? "true" : "false"}
                aria-describedby={refusalField === `${anchor}-take-profit`
                    ? refusalDescribedBy
                    : undefined}
                class="w-28 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-[var(--text-primary)]"
                class:border-[var(--danger-color)]={refusalField === `${anchor}-take-profit`}
            />
        </label>
        <span class="text-xs text-[var(--text-secondary)]">
            {$_(
                side === "buy"
                    ? "settings.automation.editor.takeProfitSideLong"
                    : "settings.automation.editor.takeProfitSideShort",
            )}
        </span>
    </div>

    {#if targetOf(target) !== undefined}
        <p class="text-xs text-[var(--text-secondary)]" data-testid="take-profit-sentence">
            {$_("settings.automation.editor.takeProfitReadback", {
                values: { distance: target.trim() },
            })}
        </p>
    {/if}
</section>
