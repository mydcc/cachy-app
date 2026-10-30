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
  FEAT-0749 — the intent editor for one bot, extracted from
  `settings/tabs/AutomationTab.svelte` (FEAT-0396) so the bot list and its
  editor can live in the control center without dragging a 576-line file along.

  It edits the *order intent* only — side, size basis, size, stop — and
  re-validates the whole document under the same id, so the conditions the bot
  was promoted with stay untouched. `action.order` is likewise rewritten while
  `consequence_level` stays `simulate`: this form cannot raise a bot to `send`.
-->

<script lang="ts">
    import { untrack } from "svelte";
    import Button from "../../shared/Button.svelte";
    import { _ } from "../../../locales/i18n";
    import { isRuleRefusedError, ruleSchema } from "../../../lib/rules/ruleSchema";
    import type { TranslationKey } from "../../../locales/schema";
    import type { OrderIntent, RuleDocument, SizeBasis } from "../../../lib/rules/types";
    import { armRule, readRuleStore, RuleConflictError } from "../../../services/alertEngine/armRule";
    import { logger } from "../../../services/logger";

    let {
        bot,
        onsaved,
        oncancel,
    }: {
        /** The bot as it was when the editor opened — the conflict snapshot. */
        bot: RuleDocument;
        onsaved: () => void;
        oncancel: () => void;
    } = $props();

    // A snapshot, read once on purpose: the form is the editor of the document
    // it was opened on, and a live binding would rewrite the trader's inputs
    // whenever the store changed underneath them. The parent closes the editor
    // when the bot changes, so there is nothing to follow anyway.
    const order = untrack(() => bot.action.order);

    let side = $state<"buy" | "sell">(order?.side ?? "buy");
    let sizeBasis = $state<SizeBasis>(order?.size_basis ?? "percent_of_equity");
    let size = $state(order?.size ?? "1");
    let stopDistance = $state(order?.stop?.distance ?? "");
    let refusal = $state<{ key: string; field: string } | null>(null);

    const sizeBases: SizeBasis[] = [
        "percent_of_equity",
        "percent_risk",
        "base_quantity",
        "quote_notional",
    ];

    function save() {
        // Re-read rather than trust the snapshot: the bot may have been
        // deleted or changed in another tab since this editor opened, and
        // writing the snapshot back would silently recreate a deleted bot.
        const current = readRuleStore().find((candidate) => candidate.id === bot.id);
        if (!current) {
            refusal = { key: "settings.automation.botChanged", field: "" };
            return;
        }
        refusal = null;
        if (!stopDistance.trim()) {
            refusal = { key: "settings.automation.stopRequired", field: "editStopDistance" };
            return;
        }
        const intent: OrderIntent = {
            side,
            size_basis: sizeBasis,
            size,
            stop: { basis: "percent_of_entry", distance: stopDistance.trim() },
        };
        try {
            const updated = ruleSchema.validate({
                ...current,
                action: { ...current.action, order: intent },
            });
            armRule(updated, bot);
            onsaved();
        } catch (e) {
            if (e instanceof RuleConflictError) {
                refusal = { key: e.translationKey, field: "" };
                return;
            }
            if (isRuleRefusedError(e)) {
                const first = e.refusals[0];
                const field = first?.field === "action.order.size"
                    ? "editSize"
                    : first?.field.startsWith("action.order.stop")
                      ? "editStopDistance"
                      : "";
                refusal = { key: first?.i18n_key ?? e.translationKey, field };
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
    <div class="flex flex-wrap gap-3">
        <label class="flex flex-col gap-1 text-sm" for={`bot-edit-side-${bot.id}`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.side")}
            </span>
            <select
                id={`bot-edit-side-${bot.id}`}
                bind:value={side}
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            >
                <option value="buy">{$_("rules.sentence.orderSide.buy")}</option>
                <option value="sell">{$_("rules.sentence.orderSide.sell")}</option>
            </select>
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`bot-edit-size-basis-${bot.id}`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.sizeBasis")}
            </span>
            <select
                id={`bot-edit-size-basis-${bot.id}`}
                bind:value={sizeBasis}
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            >
                {#each sizeBases as basis (basis)}
                    <option value={basis}>
                        {$_(`rules.sentence.basis.${basis}`)}
                    </option>
                {/each}
            </select>
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`bot-edit-size-${bot.id}`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.size")}
            </span>
            <input
                id={`bot-edit-size-${bot.id}`}
                type="text"
                inputmode="decimal"
                bind:value={size}
                aria-invalid={refusal?.field === "editSize" ? "true" : "false"}
                aria-describedby={refusal?.field === "editSize" ? "bot-edit-refusal-size" : undefined}
                class="w-28 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                class:border-[var(--danger-color)]={refusal?.field === "editSize"}
            />
        </label>

        <label class="flex flex-col gap-1 text-sm" for={`bot-edit-stop-distance-${bot.id}`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.stopDistance")}
            </span>
            <input
                id={`bot-edit-stop-distance-${bot.id}`}
                type="text"
                inputmode="decimal"
                bind:value={stopDistance}
                aria-invalid={refusal?.field === "editStopDistance" ? "true" : "false"}
                aria-describedby={refusal?.field === "editStopDistance" ? "bot-edit-refusal-stop-distance" : undefined}
                class="w-36 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                class:border-[var(--danger-color)]={refusal?.field === "editStopDistance"}
            />
        </label>
    </div>

    {#if refusal}
        <p
            id={refusal.field === "editSize"
                ? "bot-edit-refusal-size"
                : refusal.field === "editStopDistance"
                  ? "bot-edit-refusal-stop-distance"
                  : "bot-edit-refusal-general"}
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
