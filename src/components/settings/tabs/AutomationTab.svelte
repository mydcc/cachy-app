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
  FEAT-0396 — the Automation tab.

  Lists bots, which are `RuleDocument`s at `consequence_level: "simulate"` — the
  same document type the alert panel arms, one rung up the same ladder. The
  separation from the alert panel is one of surface, not of system: both are
  evaluated by the same loop against the same conditions, which is what lets a
  strategy be tested as an alarm and then promoted without being rewritten.

  Nothing here can author a `send` document. This tab writes `simulate`, and the
  guarantee that nothing reaches an exchange is the ladder rather than anything
  on this screen: `authorise(Send)` on a `simulate` document refuses, pinned by
  a core test. Live execution is FEAT-0035, which brings the order gate and the
  confirmation path with it.

  A bot is created by promoting an alert rather than built from scratch here.
  That is the workflow the item exists for — "test it as an alarm, then let it
  act while the alarm keeps watching" — and it keeps one condition builder in
  the app instead of two that drift.
-->

<script lang="ts">
    import { _, locale } from "../../../locales/i18n";
    import { isRuleRefusedError } from "../../../lib/rules/ruleSchema";
    import {
        renderRuleSentence,
        type SentenceTranslator,
    } from "../../../lib/rules/ruleSentence";
    import type { TranslationKey } from "../../../locales/schema";
    import type { OrderIntent, RuleDocument, SizeBasis } from "../../../lib/rules/types";
    import { readRuleStore } from "../../../services/alertEngine/armRule";
    import {
        deleteBot,
        isBot,
        readBots,
        setBotEnabled,
    } from "../../../services/alertEngine/botStore";
    import { AlertNotFoundError, promoteAlertToBot } from "../../../services/alertEngine/promoteAlert";
    import { logger } from "../../../services/logger";
    import Toggle from "../../shared/Toggle.svelte";
    import PaperTradingSettings from "../PaperTradingSettings.svelte";
    import RiskLimitsSettings from "../RiskLimitsSettings.svelte";

    let bots = $state<RuleDocument[]>([]);
    let alerts = $state<RuleDocument[]>([]);
    /** The refusal to show, as an i18n key. Cleared on the next attempt. */
    let refusalKey = $state<string | null>(null);

    let sourceId = $state("");
    let side = $state<"buy" | "sell">("buy");
    let sizeBasis = $state<SizeBasis>("percent_of_equity");
    let size = $state("1");

    /**
     * Reads both halves of the store.
     *
     * Read on demand rather than held in a store of its own: every mutation
     * here goes through `localStorage`, and a cached copy would have to be
     * invalidated from the alert panel too — a staleness bug that would show a
     * trader a bot they had already deleted.
     */
    function refresh() {
        const rules = readRuleStore();
        bots = rules.filter(isBot);
        alerts = rules.filter((r) => !isBot(r));
        if (!alerts.some((a) => a.id === sourceId)) sourceId = alerts[0]?.id ?? "";
    }

    $effect(() => {
        refresh();
    });

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

    function toggleBot(bot: RuleDocument, enabled: boolean) {
        setBotEnabled(bot.id, enabled);
        refresh();
    }

    function removeBot(bot: RuleDocument) {
        deleteBot(bot.id);
        refresh();
    }

    function promote() {
        refusalKey = null;
        const order: OrderIntent = { side, size_basis: sizeBasis, size };
        try {
            promoteAlertToBot(sourceId, order);
            refresh();
        } catch (e) {
            // The core reports an i18n key per refusal; the first is the one a
            // trader has to act on. Anything else is a genuine failure and is
            // not dressed up as "your rule is invalid".
            if (isRuleRefusedError(e)) {
                refusalKey = e.refusals[0]?.i18n_key ?? e.translationKey;
            } else if (e instanceof AlertNotFoundError) {
                // The alert was deleted in another tab after the form was
                // opened: say so, instead of a generic creation failure.
                refusalKey = e.translationKey;
            } else {
                refusalKey = "settings.automation.promoteFailed";
                logger.error("alerts", "[Automation] Promoting an alert failed", e);
            }
        }
    }

    const sizeBases: SizeBasis[] = [
        "percent_of_equity",
        "percent_risk",
        "base_quantity",
        "quote_notional",
    ];
</script>

<div class="flex flex-col gap-8">
    <header class="flex flex-col gap-2">
        <h2 class="text-lg font-semibold text-[var(--text-primary)]">
            {$_("settings.automation.title")}
        </h2>
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
                                <button
                                    type="button"
                                    class="text-xs text-[var(--text-secondary)] hover:text-[var(--danger-color)] transition-colors"
                                    onclick={() => removeBot(bot)}
                                >
                                    {$_("settings.automation.delete")}
                                </button>
                            </div>
                        </div>

                        <p class="text-sm text-[var(--text-secondary)]">{sentenceOf(bot)}</p>

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
                            <option value={alert.id}>{alert.name} — {alert.symbol}</option>
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
                            {#each sizeBases as basis}
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
                </div>

                {#if refusalKey}
                    <p class="text-sm text-[var(--danger-color)]" role="alert">
                        {$_(refusalKey as TranslationKey, {
                            values: { field: "action.order.size" },
                        })}
                    </p>
                {/if}

                <div class="flex items-center gap-3">
                    <button
                        type="button"
                        class="bg-accent-paired rounded px-3 py-1.5 text-sm font-semibold"
                        onclick={promote}
                        disabled={!sourceId}
                    >
                        {$_("settings.automation.promote")}
                    </button>
                    <span class="text-xs text-[var(--text-secondary)]">
                        {$_("settings.automation.startsDisabled")}
                    </span>
                </div>
            </div>
        {/if}
    </section>

    <!-- The account these bots trade into, and the bounds it trades under.
         Reused rather than mirrored: a second copy of either would be a second
         place a trader could set a limit that the first one does not know
         about. -->
    <section class="flex flex-col gap-3">
        <h3 class="text-sm font-semibold text-[var(--text-primary)]">
            {$_("settings.automation.account")}
        </h3>
        <PaperTradingSettings />
        <RiskLimitsSettings />
    </section>
</div>
