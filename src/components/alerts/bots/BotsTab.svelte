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
  FEAT-0749 — the bots half of the control center, moved out of
  `settings/tabs/AutomationTab.svelte` (FEAT-0396).

  The move is one of surface, not of system: a bot is still a `RuleDocument` at
  `consequence_level: "simulate"`, created by promoting an alert rather than
  built from scratch. What changes is where it lives — beside the alerts that
  produce it, not three settings tabs away from them. `AutomationTab` keeps the
  account and the risk limits those bots trade under.

  Nothing here can author a `send` document: this tab writes `simulate`, and
  `authorise(Send)` refuses a `simulate` document in the core, pinned by a test.
-->

<script lang="ts">
    import Button from "../../shared/Button.svelte";
    import { _, locale } from "../../../locales/i18n";
    import { isRuleRefusedError } from "../../../lib/rules/ruleSchema";
    import {
        renderConditionSentence,
        renderRuleSentence,
        type SentenceTranslator,
    } from "../../../lib/rules/ruleSentence";
    import type { TranslationKey } from "../../../locales/schema";
    import type { OrderIntent, RuleDocument, SizeBasis } from "../../../lib/rules/types";
    import { readRuleStore } from "../../../services/alertEngine/armRule";
    import {
        deleteBot,
        isBot,
        setBotEnabled,
    } from "../../../services/alertEngine/botStore";
    import { promoteAlertToBot } from "../../../services/alertEngine/promoteAlert";
    import { logger } from "../../../services/logger";
    import { alertState } from "../../../stores/alerts.svelte";
    import Toggle from "../../shared/Toggle.svelte";
    import BotIntentEditor from "./BotIntentEditor.svelte";

    /**
     * What to tell the trader about the last failed promotion: the i18n key and
     * the field it names. Cleared on the next attempt.
     *
     * The field travels with the key rather than being hardcoded at the render
     * site: the core refuses `action.order.size` most often, but not only, and a
     * message that always names the size would point at the wrong field the
     * first time it does not.
     */
    let refusal = $state<{ key: string; field: string } | null>(null);

    let sourceId = $state("");
    let side = $state<"buy" | "sell">("buy");
    let sizeBasis = $state<SizeBasis>("percent_of_equity");
    let size = $state("1");
    let stopDistance = $state("");

    /** The bot whose intent the open editor is editing, if any. */
    let editingBotId = $state<string | null>(null);
    let editingBotSnapshot = $state<RuleDocument | null>(null);

    /**
     * The rule set, re-read whenever it changes.
     *
     * `rulesVersion` is the read that makes this reactive: the rules live in
     * `localStorage`, which no rune observes, so every writer bumps that
     * counter. Deriving here rather than caching on mount is what keeps the
     * desk honest while the Super-Alert panel is open beside it — a bot
     * promoted there shows up here without closing and reopening the window.
     *
     * A store that cannot be parsed comes back as a refusal rather than as an
     * empty list: this window also hosts the alerts tab, so throwing here would
     * take down the surface a trader opens to find out what went wrong.
     */
    let read = $derived.by<{ rules: RuleDocument[]; failure: string | null }>(() => {
        void alertState.rulesVersion;
        try {
            return { rules: readRuleStore(), failure: null };
        } catch (e) {
            const keyed = (e as { translationKey?: unknown }).translationKey;
            return {
                rules: [],
                failure:
                    typeof keyed === "string"
                        ? keyed
                        : "dashboard.alerts.panel.storeUnreadable",
            };
        }
    });

    let bots = $derived(read.rules.filter(isBot));
    let alerts = $derived(read.rules.filter((rule) => !isBot(rule)));

    // The notice is what the trader sees; the cause belongs in the log.
    $effect(() => {
        if (read.failure) {
            logger.error("alerts", "[Bots] The rule store could not be read", read.failure);
        }
    });

    // A source that vanished — deleted, or promoted into the bot above it —
    // falls back to the first remaining alert rather than leaving the select
    // on a ghost.
    $effect(() => {
        if (!alerts.some((alert) => alert.id === sourceId)) {
            sourceId = alerts[0]?.id ?? "";
        }
    });

    /**
     * Every write here changes the rule set, which lives in `localStorage` and
     * is invisible to runes. Bumping `rulesVersion` is what tells the alert
     * list, the log, the rail entry and this tab that the set they rendered is
     * stale — without it a promoted or renamed bot kept its old label until
     * reload.
     */
    function notifyChanged() {
        alertState.rulesVersion += 1;
    }

    /**
     * The rule as one sentence, in the active locale.
     *
     * `$locale` is read so the sentence re-renders when the trader switches
     * language; `renderRuleSentence` takes the translator as an argument and
     * would otherwise be invisible to Svelte's dependency tracking.
     */
    function sentenceOf(rule: RuleDocument): string {
        void $locale;
        // Cast at the boundary, the way every refusal renderer in the alert
        // panel does: the renderer composes its keys from fragments, so they
        // are strings by construction, and `schema.d.ts` can only check a
        // literal. `translatorFor` in `ruleSentence.test.ts` throws on a
        // missing fragment, which is where that guarantee is actually kept.
        const translate: SentenceTranslator = (key, values) =>
            $_(key as TranslationKey, { values: values || {} });
        return renderRuleSentence(rule, translate);
    }

    function conditionOf(rule: RuleDocument): string {
        void $locale;
        const translate: SentenceTranslator = (key, values) =>
            $_(key as TranslationKey, { values: values || {} });
        return renderConditionSentence(rule, translate);
    }

    function toggleBot(bot: RuleDocument, enabled: boolean) {
        setBotEnabled(bot.id, enabled);
        notifyChanged();
    }

    function removeBot(bot: RuleDocument) {
        deleteBot(bot.id);
        notifyChanged();
    }

    function promote() {
        refusal = null;
        if (!stopDistance.trim()) {
            refusal = { key: "settings.automation.stopRequired", field: "promoteStopDistance" };
            return;
        }
        const order: OrderIntent = {
            side,
            size_basis: sizeBasis,
            size,
            stop: { basis: "percent_of_entry", distance: stopDistance.trim() },
        };
        try {
            promoteAlertToBot(sourceId, order);
            notifyChanged();
        } catch (e) {
            // The core reports an i18n key per refusal, each naming the field a
            // trader has to change; the first is the one to act on.
            if (isRuleRefusedError(e)) {
                const first = e.refusals[0];
                refusal = {
                    key: first?.i18n_key ?? e.translationKey,
                    field: first?.field ?? "",
                };
                return;
            }
            // `AlertNotFoundError` and `RuleStoreUnreadableError` each carry
            // their own key, and each says something the generic message
            // cannot: the alert was deleted in another tab, or the store could
            // not be read and nothing was written. Falling through to
            // `promoteFailed` would replace a specific answer with a shrug.
            const keyed = (e as { translationKey?: unknown }).translationKey;
            if (typeof keyed === "string") {
                refusal = { key: keyed, field: "" };
                return;
            }
            // Only genuinely unexpected failures reach the log. An alert that
            // vanished between opening this form and confirming it is a race,
            // not a fault.
            refusal = { key: "settings.automation.promoteFailed", field: "" };
            logger.error("alerts", "[Automation] Promoting an alert failed", e);
        }
    }

    function beginEdit(bot: RuleDocument) {
        if (!bot.action.order || bot.action.order.reduce_only) return;
        editingBotId = bot.id;
        editingBotSnapshot = bot;
    }

    function finishEdit() {
        editingBotId = null;
        editingBotSnapshot = null;
        notifyChanged();
    }

    function cancelEdit() {
        editingBotId = null;
        editingBotSnapshot = null;
    }

    const sizeBases: SizeBasis[] = [
        "percent_of_equity",
        "percent_risk",
        "base_quantity",
        "quote_notional",
    ];
</script>

<div class="bots-tab">
    {#if read.failure}
        <p class="text-sm text-[var(--danger-color)]" role="alert">
            {$_(read.failure as TranslationKey)}
        </p>
    {/if}

    <header class="flex flex-col gap-2">
        <p class="text-sm text-[var(--text-secondary)] max-w-2xl">
            {$_("settings.automation.intro")}
        </p>
        <p class="text-sm text-[var(--text-secondary)] max-w-2xl">
            {$_("settings.automation.simulateOnly")}
        </p>
    </header>

    <section class="flex flex-col gap-3">
        <h3 class="text-sm font-semibold text-[var(--text-primary)]">
            {$_("settings.automation.yourBots")}
        </h3>

        {#if bots.length === 0}
            <p class="text-sm text-[var(--text-secondary)] rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
                {$_("settings.automation.noBots")}
            </p>
        {:else}
            <ul class="flex flex-col gap-2">
                {#each bots as bot (bot.id)}
                    <li
                        class="flex flex-col gap-2 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4"
                        class:opacity-60={bot.enabled === false}
                    >
                        <div class="flex items-center justify-between gap-3 flex-wrap">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="font-semibold text-[var(--text-primary)] truncate">
                                    {bot.name}
                                </span>
                                <span class="text-xs text-[var(--text-secondary)]">{bot.symbol}</span>
                                <!-- Shown as disabled, never hidden: a bot that
                                     vanished when switched off would read as
                                     deleted, and one a trader cannot see is one
                                     they cannot switch back on. -->
                                {#if bot.enabled === false}
                                    <span class="rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide border border-[var(--border-color)] text-[var(--text-secondary)]">
                                        {$_("settings.automation.disabled")}
                                    </span>
                                {/if}
                            </div>
                            <div class="flex items-center gap-3">
                                <Toggle
                                    checked={bot.enabled !== false}
                                    onchange={(e) =>
                                        toggleBot(
                                            bot,
                                            (e.currentTarget as HTMLInputElement).checked,
                                        )}
                                />
                                {#if !bot.action.order?.reduce_only}
                                    <Button variant="ghost" size="sm" onClick={() => beginEdit(bot)}>
                                        {$_("settings.automation.edit")}
                                    </Button>
                                {/if}
                                <Button variant="ghost-danger" size="sm" onClick={() => removeBot(bot)}>
                                    {$_("settings.automation.delete")}
                                </Button>
                            </div>
                        </div>

                        <p class="text-sm text-[var(--text-secondary)]">{sentenceOf(bot)}</p>

                        {#if !bot.action.order?.stop}
                            <p
                                id={`bot-no-stop-${bot.id}`}
                                class="text-xs text-[var(--danger-color)]"
                                role="status"
                            >
                                {$_("settings.automation.noStop")}
                            </p>
                        {/if}

                        {#if editingBotId === bot.id && editingBotSnapshot}
                            <BotIntentEditor
                                bot={editingBotSnapshot}
                                onsaved={finishEdit}
                                oncancel={cancelEdit}
                            />
                        {/if}

                        {#if bot.provenance.derived_from_hash}
                            <p class="text-xs text-[var(--text-secondary)] font-mono">
                                {$_("settings.automation.derivedFrom", {
                                    values: {
                                        hash: bot.provenance.derived_from_hash.slice(0, 12),
                                    },
                                })}
                            </p>
                        {/if}
                    </li>
                {/each}
            </ul>
        {/if}
    </section>

    <section class="flex flex-col gap-3">
        <h3 class="text-sm font-semibold text-[var(--text-primary)]">
            {$_("settings.automation.promoteTitle")}
        </h3>
        <p class="text-sm text-[var(--text-secondary)] max-w-2xl">
            {$_("settings.automation.promoteHint")}
        </p>

        {#if alerts.length === 0}
            <p class="text-sm text-[var(--text-secondary)] rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
                {$_("settings.automation.noAlerts")}
            </p>
        {:else}
            <div class="flex flex-col gap-3 rounded-md border border-[var(--border-color)] bg-[var(--bg-secondary)] p-4">
                <label class="flex flex-col gap-1 text-sm">
                    <span class="text-[var(--text-secondary)]">
                        {$_("settings.automation.sourceAlert")}
                    </span>
                    <select
                        bind:value={sourceId}
                        class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                    >
                        {#each alerts as alert (alert.id)}
                            <option value={alert.id}>
                                {alert.name} — {alert.symbol} — {conditionOf(alert)}
                            </option>
                        {/each}
                    </select>
                </label>

                <div class="flex flex-wrap gap-3">
                    <label class="flex flex-col gap-1 text-sm">
                        <span class="text-[var(--text-secondary)]">
                            {$_("settings.automation.side")}
                        </span>
                        <select
                            bind:value={side}
                            class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                        >
                            <option value="buy">{$_("rules.sentence.orderSide.buy")}</option>
                            <option value="sell">{$_("rules.sentence.orderSide.sell")}</option>
                        </select>
                    </label>

                    <label class="flex flex-col gap-1 text-sm">
                        <span class="text-[var(--text-secondary)]">
                            {$_("settings.automation.sizeBasis")}
                        </span>
                        <select
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

                    <label class="flex flex-col gap-1 text-sm">
                        <span class="text-[var(--text-secondary)]">
                            {$_("settings.automation.size")}
                        </span>
                        <input
                            type="text"
                            inputmode="decimal"
                            bind:value={size}
                            class="w-28 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                        />
                    </label>

                    <label class="flex flex-col gap-1 text-sm" for="promote-stop-distance">
                        <span class="text-[var(--text-secondary)]">
                            {$_("settings.automation.stopDistance")}
                        </span>
                        <input
                            id="promote-stop-distance"
                            type="text"
                            inputmode="decimal"
                            bind:value={stopDistance}
                            aria-invalid={refusal?.field === "promoteStopDistance" ? "true" : "false"}
                            aria-describedby={refusal?.field === "promoteStopDistance" ? "promote-refusal-stop-distance" : undefined}
                            class="w-36 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                        />
                    </label>
                </div>

                {#if refusal}
                    <p
                        id={refusal.field === "promoteStopDistance" ? "promote-refusal-stop-distance" : undefined}
                        class="text-sm text-[var(--danger-color)]"
                        role="alert"
                    >
                        {$_(refusal.key as TranslationKey, {
                            values: { field: refusal.field },
                        })}
                    </p>
                {/if}

                <div class="flex items-center gap-3">
                    <Button variant="accent" size="sm" onClick={promote} disabled={!sourceId}>
                        {$_("settings.automation.promote")}
                    </Button>
                    <span class="text-xs text-[var(--text-secondary)]">
                        {$_("settings.automation.startsDisabled")}
                    </span>
                </div>
            </div>
        {/if}
    </section>
</div>

<style>
    .bots-tab {
        display: flex;
        flex-direction: column;
        gap: var(--space-8);
    }
</style>
