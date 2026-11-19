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
  FEAT-0811 — the bot editor: one editor, two modes.

  Edit mode absorbs `BotIntentEditor` whole — the same order fields, the same
  save discipline (conflict re-read, whole-document validation under the same
  id, `armRule` with the snapshot as the expected shape), and the same DOM
  ids, because the control center's tests anchor to them. What it adds are
  the sections `BotExitsEditor` and `BotFiringEditor` carry, and the refusal
  anchoring for their fields.

  Create mode is the direct path (AC 1): no alert to promote, the fields the
  trader answers are the whole document, and `createBotDraft` assembles it —
  unarmed, validated before anything is written, refused with the field named
  while the form is still open.

  The editor never raises a bot to `send` and never lowers one to `notify`
  (AC 9): `consequence_level` rides the stored document through unchanged.
-->

<script lang="ts">
    import { untrack } from "svelte";
    import Button from "../../shared/Button.svelte";
    import { _ } from "../../../locales/i18n";
    import type { TranslationKey } from "../../../locales/schema";
    import { isRuleRefusedError, ruleSchema } from "../../../lib/rules/ruleSchema";
    import type {
        CompareOp,
        Condition,
        ExitRule,
        OrderIntent,
        PriceField,
        RuleDocument,
        SizeBasis,
        TimeframeString,
    } from "../../../lib/rules/types";
    import { armRule, readRuleStore, RuleConflictError } from "../../../services/alertEngine/armRule";
    import { createBotDraft } from "../../../services/alertEngine/promoteAlert";
    import { logger } from "../../../services/logger";
    import BotExitsEditor from "./BotExitsEditor.svelte";
    import BotFiringEditor from "./BotFiringEditor.svelte";
    import type { BotFiringState } from "./botEditorTypes";

    let {
        /** The bot as it was when the editor opened — the conflict snapshot.
         * `null` is create mode: no document exists yet. */
        bot,
        onsaved,
        oncancel,
    }: {
        bot: RuleDocument | null;
        onsaved: () => void;
        oncancel: () => void;
    } = $props();

    const creating = bot === null;
    /** The DOM id prefix: edit mode keeps the ids the control center's tests
     * anchor to; create mode gets its own namespace. */
    const mode = creating ? "bot-create" : "bot-edit";
    const idSuffix = creating ? "" : `-${bot.id}`;

    // ---- The order intent, as BotIntentEditor held it ----------------------
    const order = untrack(() => bot?.action.order);
    let side = $state<"buy" | "sell">(order?.side ?? "buy");
    let sizeBasis = $state<SizeBasis>(order?.size_basis ?? "percent_of_equity");
    let size = $state(order?.size ?? "1");
    let stopDistance = $state(order?.stop?.distance ?? "");

    // ---- Create mode's own answers (AC 1) ----------------------------------
    let name = $state(untrack(() => bot?.name ?? ""));
    let symbol = $state(untrack(() => bot?.symbol ?? ""));
    let timeframe = $state<TimeframeString>(untrack(() => bot?.trigger_timeframe ?? "1h"));
    let entryField = $state<PriceField>("close");
    let entryOp = $state<CompareOp>("gte");
    let entryValue = $state("");

    // ---- The sections' drafts, pushed up on every change ------------------
    let draftExits = $state<ExitRule[] | undefined>(untrack(() => bot?.exits));
    let draftTarget = $state(untrack(() => bot?.take_profit?.distance ?? ""));
    let draftFiring = $state<BotFiringState>(
        untrack(() => ({
            policy: bot?.firing_policy,
            maxPositions: bot?.max_positions !== undefined
                ? String(bot.max_positions)
                : "",
            maxEntriesPerDay: bot?.max_entries_per_day !== undefined
                ? String(bot.max_entries_per_day)
                : "",
            maxRiskPerPosition: bot?.max_risk_per_position ?? "",
            budgetCap: bot?.budget_cap ?? "",
            entryTrigger: bot?.entry_trigger,
        })),
    );

    let refusal = $state<{ key: string; field: string } | null>(null);

    const sizeBases: SizeBasis[] = [
        "percent_of_equity",
        "percent_risk",
        "base_quantity",
        "quote_notional",
    ];
    const priceFields: PriceField[] = ["close", "open", "high", "low", "hl2", "hlc3"];
    const ops: CompareOp[] = ["gte", "lte", "gt", "lt"];

    /** The refusal message element a field's input points at — the shape
     * `BotIntentEditor` established, extended for the sections' fields. */
    function refusalIdFor(field: string): string {
        if (field === `${mode}-size${idSuffix}`) return `${mode}-refusal-size`;
        if (field === `${mode}-stop-distance${idSuffix}`) {
            return `${mode}-refusal-stop-distance`;
        }
        return `${mode}-refusal-general`;
    }

    /** Map the core's field path to the DOM anchor the trader can see. */
    function anchorFor(field: string): string {
        if (field === "action.order.size") return `${mode}-size${idSuffix}`;
        if (field.startsWith("action.order.stop")) {
            return `${mode}-stop-distance${idSuffix}`;
        }
        const fraction = /^exits\[(\d+)\]\.fraction$/.exec(field);
        if (fraction) return `${mode}-exit-${fraction[1]}-fraction`;
        if (field === "take_profit" || field.startsWith("take_profit.")) {
            return `${mode}-take-profit`;
        }
        if (field === "max_positions") return `${mode}-maxPositions`;
        if (field === "max_entries_per_day") return `${mode}-maxEntriesPerDay`;
        if (field === "max_risk_per_position") return `${mode}-maxRiskPerPosition`;
        if (field === "budget_cap") return `${mode}-budgetCap`;
        if (field === "entry_trigger") return `${mode}-entry-trigger`;
        return "";
    }

    /** The fraction pre-save check (AC 3): an empty fraction on a partial
     * row is refused before the core ever sees it, anchored to the row. */
    function fractionViolation(): string | null {
        const exits = draftExits ?? [];
        for (const [i, exit] of exits.entries()) {
            if (exit.close === "partial" && !(exit.fraction ?? "").trim()) {
                return `${mode}-exit-${i}-fraction`;
            }
        }
        return null;
    }

    /** A count the core stores as an unsigned integer. */
    const WHOLE_NUMBER = /^\d+$/;

    /**
     * The limits pre-check (AC 5): a count that is not a whole number is
     * refused here, before anything coerces it.
     *
     * Numeric coercion is total where typing is not: `"abc"` coerces to
     * `NaN`, `JSON.stringify` writes `NaN` as `null`, and the core reads
     * `null` for an optional count as *absent* — which for
     * `max_entries_per_day` means "unbounded by day", the loosest setting
     * there is. A limit the trader typed would vanish rather than be
     * refused. `"1e2"`, `"0x10"` and `" 5 "` are the same class of
     * surprise: accepted as something other than what was typed.
     */
    function countViolation(): string | null {
        const counts: [string, string][] = [
            [draftFiring.maxPositions, `${mode}-maxPositions`],
            [draftFiring.maxEntriesPerDay, `${mode}-maxEntriesPerDay`],
        ];
        for (const [raw, anchor] of counts) {
            const typed = raw.trim();
            if (typed !== "" && !WHOLE_NUMBER.test(typed)) return anchor;
        }
        return null;
    }

    /**
     * Every constant the trader typed carries a value (AC 1, 2).
     *
     * The core does refuse an empty one — but with an empty `field`, so
     * `anchorFor` cannot place it and the trader reads a general message
     * with nothing highlighted. The form owns this one, exactly as it
     * already owns the empty symbol and the empty stop.
     */
    function emptyValueViolation(): string | null {
        if (creating && !entryValue.trim()) return "bot-create-entry-value";
        for (const [i, exit] of (draftExits ?? []).entries()) {
            if (exit.when.kind !== "compare") continue;
            const right = exit.when.right;
            if (right.kind === "constant" && !right.value.trim()) {
                return `${mode}-exit-${i}-value`;
            }
        }
        return null;
    }

    function save() {
        refusal = null;
        if (creating && !symbol.trim()) {
            // The core never sees the symbol as anything but a string, so an
            // empty one is this form's to catch — anchored where it is typed.
            refusal = {
                key: "settings.automation.editor.symbolRequired",
                field: "bot-create-symbol",
            };
            return;
        }
        if (!stopDistance.trim()) {
            refusal = {
                key: "settings.automation.stopRequired",
                field: `${mode}-stop-distance${idSuffix}`,
            };
            return;
        }
        const missingValue = emptyValueViolation();
        if (missingValue !== null) {
            refusal = { key: "settings.automation.editor.valueRequired", field: missingValue };
            return;
        }
        const missingFraction = fractionViolation();
        if (missingFraction !== null) {
            refusal = { key: "settings.automation.editor.fractionRequired", field: missingFraction };
            return;
        }
        const badCount = countViolation();
        if (badCount !== null) {
            refusal = { key: "settings.automation.editor.countWholeNumber", field: badCount };
            return;
        }

        const intent: OrderIntent = {
            side,
            size_basis: sizeBasis,
            size,
            stop: { basis: "percent_of_entry", distance: stopDistance.trim() },
        };
        const targetDistance = draftTarget.trim();

        try {
            if (creating) {
                const entry: Condition = {
                    kind: "compare",
                    left: { kind: "price", field: entryField },
                    op: entryOp,
                    right: { kind: "constant", value: entryValue.trim() },
                    timeframe,
                };
                createBotDraft({
                    ...(name.trim() !== "" ? { name: name.trim() } : {}),
                    symbol: symbol.trim(),
                    trigger_timeframe: timeframe,
                    conditions: entry,
                    order: intent,
                    ...(draftExits !== undefined ? { exits: draftExits } : {}),
                    ...(targetDistance !== ""
                        ? { take_profit: { basis: "percent_of_entry", distance: targetDistance } }
                        : {}),
                    ...(draftFiring.policy !== undefined
                        ? { firing_policy: draftFiring.policy }
                        : {}),
                    ...(draftFiring.maxPositions.trim() !== ""
                        ? { max_positions: Number(draftFiring.maxPositions.trim()) } // audit: safe — a count, not money (core: u32); countViolation() proved the digits
                        : {}),
                    ...(draftFiring.maxEntriesPerDay.trim() !== ""
                        ? { max_entries_per_day: Number(draftFiring.maxEntriesPerDay.trim()) } // audit: safe — a count, not money (core: u32); countViolation() proved the digits
                        : {}),
                    ...(draftFiring.maxRiskPerPosition.trim() !== ""
                        ? { max_risk_per_position: draftFiring.maxRiskPerPosition.trim() }
                        : {}),
                    ...(draftFiring.budgetCap.trim() !== ""
                        ? { budget_cap: draftFiring.budgetCap.trim() }
                        : {}),
                    ...(draftFiring.entryTrigger !== undefined
                        ? { entry_trigger: draftFiring.entryTrigger }
                        : {}),
                });
                onsaved();
                return;
            }

            // Edit mode: re-read rather than trust the snapshot — the bot may
            // have been deleted or changed in another tab since this editor
            // opened, and writing the snapshot back would silently recreate a
            // deleted bot.
            const current = readRuleStore().find((candidate) => candidate.id === bot.id);
            if (!current) {
                refusal = { key: "settings.automation.botChanged", field: "" };
                return;
            }

            const updated: RuleDocument = {
                ...current,
                action: { ...current.action, order: intent },
            };
            // The sections' word is the whole word: undefined deletes the key
            // (the document's "no exits" is absence, never an empty array),
            // a value sets it.
            if (draftExits === undefined) delete updated.exits;
            else updated.exits = draftExits;
            if (targetDistance === "") delete updated.take_profit;
            else updated.take_profit = { basis: "percent_of_entry", distance: targetDistance };
            if (draftFiring.policy === undefined) delete updated.firing_policy;
            else updated.firing_policy = draftFiring.policy;
            if (draftFiring.maxPositions.trim() === "") delete updated.max_positions;
            else updated.max_positions = Number(draftFiring.maxPositions.trim()); // audit: safe — a count, not money (core: u32); countViolation() proved the digits
            if (draftFiring.maxEntriesPerDay.trim() === "") delete updated.max_entries_per_day;
            else updated.max_entries_per_day = Number(draftFiring.maxEntriesPerDay.trim()); // audit: safe — a count, not money (core: u32); countViolation() proved the digits
            if (draftFiring.maxRiskPerPosition.trim() === "") delete updated.max_risk_per_position;
            else updated.max_risk_per_position = draftFiring.maxRiskPerPosition.trim();
            if (draftFiring.budgetCap.trim() === "") delete updated.budget_cap;
            else updated.budget_cap = draftFiring.budgetCap.trim();
            if (draftFiring.entryTrigger === undefined) delete updated.entry_trigger;
            else updated.entry_trigger = draftFiring.entryTrigger;

            const validated = ruleSchema.validate(updated);
            armRule(validated, bot);
            onsaved();
        } catch (e) {
            if (e instanceof RuleConflictError) {
                refusal = { key: e.translationKey, field: "" };
                return;
            }
            if (isRuleRefusedError(e)) {
                const first = e.refusals[0];
                refusal = {
                    key: first?.i18n_key ?? e.translationKey,
                    field: anchorFor(first?.field ?? ""),
                };
                return;
            }
            const keyed = (e as { translationKey?: unknown }).translationKey;
            refusal = {
                key: typeof keyed === "string" ? keyed : "settings.automation.editFailed",
                field: "",
            };
            logger.error("alerts", "[Automation] Saving a bot failed", e);
        }
    }
</script>

<div class="flex flex-col gap-3 rounded border border-[var(--border-color)] p-3">
    {#if creating}
        <h4 class="text-sm font-semibold text-[var(--text-primary)]">
            {$_("settings.automation.editor.createTitle")}
        </h4>
        <p class="text-xs text-[var(--text-secondary)]">
            {$_("settings.automation.editor.createHint")}
        </p>
        <div class="flex flex-wrap gap-3">
            <label class="flex flex-col gap-1 text-sm" for="bot-create-name">
                <span class="text-[var(--text-secondary)]">
                    {$_("settings.automation.editor.createName")}
                </span>
                <input
                    id="bot-create-name"
                    type="text"
                    bind:value={name}
                    class="w-40 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                />
            </label>
            <label class="flex flex-col gap-1 text-sm" for="bot-create-symbol">
                <span class="text-[var(--text-secondary)]">
                    {$_("settings.automation.editor.createSymbol")}
                </span>
                <input
                    id="bot-create-symbol"
                    type="text"
                    bind:value={symbol}
                    aria-invalid={refusal?.field === "bot-create-symbol" ? "true" : "false"}
                    class="w-32 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 uppercase text-[var(--text-primary)]"
                    class:border-[var(--danger-color)]={refusal?.field === "bot-create-symbol"}
                />
            </label>
            <label class="flex flex-col gap-1 text-sm" for="bot-create-timeframe">
                <span class="text-[var(--text-secondary)]">
                    {$_("settings.automation.editor.createTimeframe")}
                </span>
                <select
                    id="bot-create-timeframe"
                    value={timeframe}
                    onchange={(e) => {
                        timeframe = e.currentTarget.value as TimeframeString;
                    }}
                    class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                >
                    {#each ["1m", "5m", "15m", "1h", "4h", "1d"] as tf (tf)}
                        <option value={tf}>{tf}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-sm" for="bot-create-entry-field">
                <span class="text-[var(--text-secondary)]">
                    {$_("settings.automation.editor.createEntry")}
                </span>
                <select
                    id="bot-create-entry-field"
                    value={entryField}
                    onchange={(e) => {
                        entryField = e.currentTarget.value as PriceField;
                    }}
                    class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                >
                    {#each priceFields as field (field)}
                        <option value={field}>{$_(`rules.sentence.price.${field}`)}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-sm" for="bot-create-entry-op">
                <span class="text-[var(--text-secondary)]">&nbsp;</span>
                <select
                    id="bot-create-entry-op"
                    value={entryOp}
                    onchange={(e) => {
                        entryOp = e.currentTarget.value as CompareOp;
                    }}
                    class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                >
                    {#each ops as op (op)}
                        <option value={op}>{$_(`rules.sentence.op.${op}`)}</option>
                    {/each}
                </select>
            </label>
            <label class="flex flex-col gap-1 text-sm" for="bot-create-entry-value">
                <span class="text-[var(--text-secondary)]">&nbsp;</span>
                <input
                    id="bot-create-entry-value"
                    type="text"
                    inputmode="decimal"
                    bind:value={entryValue}
                    aria-invalid={refusal?.field === "bot-create-entry-value" ? "true" : "false"}
                    class="w-32 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                    class:border-[var(--danger-color)]={refusal?.field === "bot-create-entry-value"}
                />
            </label>
        </div>
    {/if}

    <div class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1 text-sm" for={`${mode}-side${idSuffix}`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.side")}
            </span>
            <select
                id={`${mode}-side${idSuffix}`}
                value={side}
                onchange={(e) => {
                    side = e.currentTarget.value as "buy" | "sell";
                }}
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            >
                <option value="buy">{$_("rules.sentence.orderSide.buy")}</option>
                <option value="sell">{$_("rules.sentence.orderSide.sell")}</option>
            </select>
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`${mode}-size-basis${idSuffix}`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.sizeBasis")}
            </span>
            <select
                id={`${mode}-size-basis${idSuffix}`}
                value={sizeBasis}
                onchange={(e) => {
                    sizeBasis = e.currentTarget.value as SizeBasis;
                }}
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            >
                {#each sizeBases as basis (basis)}
                    <option value={basis}>
                        {$_(`rules.sentence.basis.${basis}`)}
                    </option>
                {/each}
            </select>
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`${mode}-size${idSuffix}`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.size")}
            </span>
            <input
                id={`${mode}-size${idSuffix}`}
                type="text"
                inputmode="decimal"
                bind:value={size}
                aria-invalid={refusal?.field === `${mode}-size${idSuffix}` ? "true" : "false"}
                aria-describedby={refusal?.field === `${mode}-size${idSuffix}`
                    ? `${mode}-refusal-size`
                    : undefined}
                class="w-28 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                class:border-[var(--danger-color)]={refusal?.field === `${mode}-size${idSuffix}`}
            />
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`${mode}-stop-distance${idSuffix}`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.stopDistance")}
            </span>
            <input
                id={`${mode}-stop-distance${idSuffix}`}
                type="text"
                inputmode="decimal"
                bind:value={stopDistance}
                aria-invalid={refusal?.field === `${mode}-stop-distance${idSuffix}`
                    ? "true"
                    : "false"}
                aria-describedby={refusal?.field === `${mode}-stop-distance${idSuffix}`
                    ? `${mode}-refusal-stop-distance`
                    : undefined}
                class="w-36 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                class:border-[var(--danger-color)]={refusal?.field
                    === `${mode}-stop-distance${idSuffix}`}
            />
        </label>
    </div>

    <BotExitsEditor
        exits={draftExits ?? []}
        takeProfitDistance={draftTarget}
        {side}
        {timeframe}
        anchor={mode}
        refusalField={refusal?.field ?? null}
        refusalDescribedBy={refusal && refusal.field !== ""
            ? refusalIdFor(refusal.field)
            : undefined}
        onexits={(exits) => (draftExits = exits)}
        ontarget={(distance) => (draftTarget = distance)}
    />

    <BotFiringEditor
        initial={draftFiring}
        anchor={mode}
        refusalField={refusal?.field ?? null}
        refusalDescribedBy={refusal && refusal.field !== ""
            ? refusalIdFor(refusal.field)
            : undefined}
        onchange={(next) => (draftFiring = next)}
    />

    {#if refusal}
        <p
            id={refusalIdFor(refusal.field)}
            class="text-sm text-[var(--danger-color)]"
            role="alert"
        >
            {$_(refusal.key as TranslationKey, {
                values: { field: refusal.field },
            })}
        </p>
    {/if}

    <div class="flex items-center gap-3">
        <Button variant="accent" size="sm" onClick={save}>
            {$_("settings.automation.save")}
        </Button>
        <Button variant="ghost" size="sm" onClick={oncancel}>
            {$_("settings.automation.cancel")}
        </Button>
    </div>
</div>
