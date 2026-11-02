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
    import { _ } from "../../../locales/i18n";
    import { settingsState } from "../../../stores/settings.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import { windowRegistry } from "../../../lib/windows/WindowRegistry.svelte";
    import {
        RULE_SYMBOL_PATTERN,
        WINDOW_RULE_TYPES,
        hasSymbolRule,
        normalizeRuleSymbol,
        ruleKey,
        ruleTargetsInstance,
        supportsSymbolScope,
        windowRulePatch,
    } from "../../../lib/windows/windowRules";
    import { windowManager } from "../../../lib/windows/WindowManager.svelte";
    import {
        dismissDroppedWindowRuleTypes,
        windowRuleDrops,
    } from "../../../lib/windows/windowRuleDrops.svelte";
    import type { WindowRule, WindowRuleType } from "../../../stores/settings/settingsTypes";
    import type { TranslationKey } from "../../../locales/schema";
    import Toggle from "../../shared/Toggle.svelte";
    import SettingsGrid from "../shared/SettingsGrid.svelte";

    type GeometryKey = "x" | "y" | "width" | "height";

    /**
     * The types the picker offers. A type drops out as soon as it has a rule,
     * except the symbol-scoped ones: a chart may hold one type-wide rule plus
     * one per symbol, so it has to stay addable.
     */
    function availableRuleTypes(rules: readonly WindowRule[]): WindowRuleType[] {
        return WINDOW_RULE_TYPES.filter(
            (type) =>
                supportsSymbolScope(type) ||
                !rules.some((rule) => rule.windowType === type),
        );
    }

    /** FEAT-0743 — the type the next "Add rule" creates. */
    let nextRuleType = $state<WindowRuleType | "">(
        availableRuleTypes(settingsState.windowRules)[0] ?? "",
    );
    /** FEAT-0769 — the symbol the next chart rule is scoped to ("" = all). */
    let nextRuleSymbol = $state("");

    /** Labels for every type a rule can target (the selectable set). */
    const TYPE_LABEL_KEYS: Record<WindowRuleType, TranslationKey> = {
        journal: "settings.windowRulesTypes.journal",
        chart: "settings.windowRulesTypes.chart",
        academy: "settings.windowRulesTypes.academy",
        assistant: "settings.windowRulesTypes.assistant",
        alertpanel: "settings.windowRulesTypes.alertpanel",
        controlcenter: "settings.windowRulesTypes.controlcenter",
        chatbox: "settings.windowRulesTypes.chatbox",
    };

    const availableTypes = $derived(availableRuleTypes(settingsState.windowRules));

    function syncNextRuleType() {
        if (!nextRuleType || !availableTypes.includes(nextRuleType)) {
            nextRuleType = availableTypes[0] ?? "";
        }
        if (nextRuleType !== "chart") nextRuleSymbol = "";
    }

    /**
     * The rule "Add" would append, or `null` when the draft is not usable. Both
     * the button's disabled state and `addRule()` read this, so the two cannot
     * disagree about whether a click does something.
     */
    function draftRule(): WindowRule | null {
        if (!nextRuleType) return null;
        const symbol =
            nextRuleType === "chart" ? normalizeRuleSymbol(nextRuleSymbol) : "";
        if (symbol && !RULE_SYMBOL_PATTERN.test(symbol)) return null;
        return symbol
            ? {
                  windowType: nextRuleType,
                  match: { kind: "symbol", value: symbol },
                  enabled: true,
              }
            : { windowType: nextRuleType, enabled: true };
    }

    const draftSymbol = $derived(normalizeRuleSymbol(nextRuleSymbol));
    const isSymbolDraft = $derived(
        nextRuleType === "chart" && draftSymbol !== "",
    );
    const draftSymbolInvalid = $derived(
        isSymbolDraft && !RULE_SYMBOL_PATTERN.test(draftSymbol),
    );
    const draftSymbolTaken = $derived(
        isSymbolDraft &&
            hasSymbolRule(settingsState.windowRules, "chart", draftSymbol),
    );
    /**
     * A type-wide chart rule already covers every chart, so a second one would
     * collide on the dedupe key. `canAddRule` is false in that state; this is
     * the reason the button is disabled, so the UI is not silently dead.
     */
    const draftTypeWideTaken = $derived(
        nextRuleType === "chart" &&
            !isSymbolDraft &&
            settingsState.windowRules.some(
                (rule) => rule.windowType === "chart" && !rule.match,
            ),
    );
    const draftRefusal = $derived(
        draftSymbolTaken || draftTypeWideTaken || draftSymbolInvalid,
    );
    const canAddRule = $derived.by(() => {
        const draft = draftRule();
        if (!draft) return false;
        const key = ruleKey(draft);
        return !settingsState.windowRules.some(
            (rule) => ruleKey(rule) === key,
        );
    });

    function addRule() {
        const draft = draftRule();
        if (!draft) return;
        if (
            settingsState.windowRules.some(
                (rule) => ruleKey(rule) === ruleKey(draft),
            )
        ) {
            return;
        }
        settingsState.windowRules.push(draft);
        nextRuleSymbol = "";
        syncNextRuleType();
    }

    function removeRule(rule: WindowRule) {
        const key = ruleKey(rule);
        settingsState.windowRules = settingsState.windowRules.filter(
            (entry) => ruleKey(entry) !== key,
        );
        syncNextRuleType();
    }

    /**
     * DOM id stem for a rule: the type, plus the symbol for a scoped rule. Two
     * chart rules would otherwise share every input id in the card.
     */
    function ruleDomId(rule: WindowRule): string {
        const stem = `window-rule-${rule.windowType}`;
        return rule.match ? `${stem}-${rule.match.value}` : stem;
    }

    /**
     * Why the card refused the last rename, or `null`. Without it the field
     * would snap back with no explanation, which reads as a broken input.
     */
    let symbolRefusal = $state<{
        key: string;
        message: TranslationKey;
    } | null>(null);

    /**
     * Re-scopes a chart rule to another symbol (FEAT-0769). Refused values snap
     * the field back instead of being stored, so the card never shows a symbol
     * the rule does not carry — and the reason is rendered next to the field
     * instead of the revert happening silently.
     */
    function renameSymbol(rule: WindowRule, input: HTMLInputElement) {
        if (rule.match?.kind !== "symbol") return;
        const next = normalizeRuleSymbol(input.value);
        if (next === rule.match.value) {
            // A case- or suffix-only edit canonicalises to the stored value;
            // the field has to show the form the rule actually holds.
            input.value = rule.match.value;
            symbolRefusal = null;
            return;
        }
        const taken = hasSymbolRule(
            settingsState.windowRules,
            rule.windowType,
            next,
            ruleKey(rule),
        );
        if (!RULE_SYMBOL_PATTERN.test(next) || taken) {
            input.value = rule.match.value;
            symbolRefusal = {
                key: ruleKey(rule),
                message: taken
                    ? "settings.windowRulesDuplicateSymbol"
                    : "settings.windowRulesSymbolInvalid",
            };
            return;
        }
        symbolRefusal = null;
        rule.match.value = next;
    }

    /**
     * Number inputs are controlled rather than `bind:value`: Svelte stores
     * `null` for a cleared number field, while the rule model uses `undefined`
     * for "not set". Normalising here keeps the persisted payload and
     * `windowRulePatch`'s "only present fields" contract honest.
     */
    function setNumber(rule: WindowRule, key: GeometryKey, raw: string) {
        const trimmed = raw.trim();
        // audit: safe — window geometry in CSS pixels, not a financial value
        const value =
            trimmed === "" ? Number.NaN : Number(trimmed); // audit: safe — CSS pixel geometry
        if (!Number.isFinite(value)) {
            delete rule[key];
            return;
        }
        rule[key] = value;
    }

    /**
     * FEAT-0770 — the window "Apply now" would move. The manager tracks the
     * last focused window that is not this settings window, because the editor
     * itself is focused the moment the button is pressed.
     */
    const ruleTarget = $derived(windowManager.lastActiveWindow);

    /**
     * FEAT-0771 — rules the load path had to discard because their window
     * types left the target list. The report is transient: once the surviving
     * rules are saved, the next start has nothing left to report.
     */
    const droppedRuleTypes = $derived(windowRuleDrops.types);

    const droppedRuleNotice = $derived.by(() => {
        const count = droppedRuleTypes.length;
        if (count === 0) return "";
        return $_(
            count === 1
                ? "settings.windowRulesDroppedOne"
                : "settings.windowRulesDroppedOther",
            { count, types: droppedRuleTypes.join(", ") },
        );
    });

    /** FEAT-0770 — the transient refusal after a press that the window rejected. */
    let applyRefusal = $state<{ key: string; message: TranslationKey } | null>(
        null,
    );

    /**
     * Why "Apply now" cannot act on this rule right now, or `null` when it can.
     *
     * One predicate feeds both the button state and the reason it renders, so
     * "enabled" and "explained" cannot disagree — and the refusal the window
     * itself can return is part of the same decision instead of a silent
     * no-op click.
     */
    function applyNowRefusal(rule: WindowRule): TranslationKey | null {
        const target = ruleTarget;
        // A disabled rule keeps its settings but does nothing; applying it
        // behind the toggle's back would contradict the card.
        if (!rule.enabled) return "settings.windowRulesApplyEnableFirst";
        if (!target) return "settings.windowRulesApplyNoTarget";
        if (!ruleTargetsInstance(rule, target.windowType, target.symbol)) {
            return "settings.windowRulesApplyNoMatch";
        }
        if (rule.isMaximized === true && target.allowMaximize === false) {
            return "settings.windowRulesApplyNoMaximize";
        }
        // The same patch the window builds: a rule whose fields are all
        // "inherit" has nothing to apply, and an enabled button that does
        // nothing is worse than an explained one.
        const patch = windowRulePatch(rule, target.closeOnBlur === true);
        if (
            patch.isMaximized === undefined &&
            patch.isKeepAbove === undefined &&
            patch.x === undefined &&
            patch.y === undefined &&
            patch.width === undefined &&
            patch.height === undefined
        ) {
            return "settings.windowRulesApplyNothing";
        }
        return null;
    }

    function canApplyNow(rule: WindowRule): boolean {
        return applyNowRefusal(rule) === null;
    }

    function applyNow(rule: WindowRule) {
        const target = ruleTarget;
        if (!target || applyNowRefusal(rule) !== null) return;

        const wasKeepAbove = target.isKeepAbove;
        if (!target.applyRuleNow(rule)) {
            applyRefusal = {
                key: ruleKey(rule),
                message: "settings.windowRulesApplyRefused",
            };
            return;
        }
        applyRefusal = null;

        // FEAT-0742: the flag alone never moves a window between bands, and
        // `bringToFront` would move focus to the target (and could sweep this
        // editor window), so ask for a band-only re-stack instead. Only a real
        // change needs it — keying off the rule field would pop the window for
        // a "keep above: off" rule on a window that was already ordinary.
        if (target.isKeepAbove !== wasKeepAbove) {
            windowManager.restack(target.id);
        }
    }

    function typeAllowsMaximize(type: WindowRuleType): boolean {
        return windowRegistry.getConfig(type).flags.allowMaximize !== false;
    }

    function typeHasFixedAspect(type: WindowRuleType): boolean {
        return windowRegistry.getConfig(type).layout.aspectRatio != null;
    }

    /** The card's subtitle: the type label plus the instance it is scoped to. */
    function ruleHeading(rule: WindowRule): string {
        const label = $_(TYPE_LABEL_KEYS[rule.windowType]);
        return rule.match ? `${label} · ${rule.match.value}` : label;
    }
</script>

<section class="settings-section animate-fade-in">
    <SettingsGrid gap="gap-4">
        <label class="toggle-card gap-3">
            <div class="flex flex-col min-w-0 flex-1">
                <span class="text-sm font-medium"
                    >{$_("settings.showSidebars")}</span
                >
                <span
                    class="text-[10px] text-[var(--text-secondary)]"
                    >{$_("settings.sidePanelDesc")}</span
                >
            </div>
            <Toggle bind:checked={settingsState.showSidebars} />
        </label>

        <label class="toggle-card gap-3">
            <div class="flex flex-col min-w-0 flex-1">
                <span class="text-sm font-medium"
                    >{$_("settings.enableSidePanel")}</span
                >
                <span
                    class="text-[10px] text-[var(--text-secondary)]"
                    >{$_("settings.workspace.aiAssistant")} / {$_(
                        "settings.workspace.privateNotes",
                    )} / {$_("settings.workspace.marketChat")}</span
                >
            </div>
            <Toggle
                checked={uiState.showAssistant}
                onchange={(e) =>
                    uiState.toggleAssistant((e.currentTarget as HTMLInputElement).checked)}
            />
        </label>

        <!-- News articles (BUG-0729). One home: the setting decides how a
             clicked article is displayed, which is what this tab owns. -->
        <div class="col-span-full border-t border-[var(--border-color)] pt-4">
            <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
                {$_("settings.newsArticlesTitle")}
            </h4>
            <div class="toggle-card news-card flex-col items-start gap-2">
                <div class="flex justify-between items-center w-full">
                    <div class="flex flex-col min-w-0 flex-1">
                        <span class="text-sm font-medium">{$_("settings.newsOpenBehavior")}</span>
                        <span class="text-xs text-[var(--text-secondary)]">{$_("settings.newsOpenBehaviorDesc")}</span>
                    </div>
                </div>
                <SettingsGrid gap="gap-2">
                    <!-- FEAT-0611 escape: selection-card group — a single-choice option, not an action button. -->
                    <button
                        type="button"
                        class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                        class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "smart"}
                        class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "smart"}
                        class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "smart"}
                        class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "smart"}
                        onclick={() => settingsState.newsOpenBehavior = "smart"}
                    >
                        <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorSmart")}</span>
                        {#if settingsState.newsOpenBehavior === "smart"}
                            <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                        {/if}
                    </button>
                    <!-- FEAT-0611 escape: selection-card group — a single-choice option, not an action button. -->
                    <button
                        type="button"
                        class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                        class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "reader"}
                        class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "reader"}
                        class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "reader"}
                        class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "reader"}
                        onclick={() => settingsState.newsOpenBehavior = "reader"}
                    >
                        <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorReader")}</span>
                        {#if settingsState.newsOpenBehavior === "reader"}
                            <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                        {/if}
                    </button>
                    <!-- FEAT-0611 escape: selection-card group — a single-choice option, not an action button. -->
                    <button
                        type="button"
                        class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                        class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "new_tab"}
                        class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "new_tab"}
                        class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "new_tab"}
                        class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "new_tab"}
                        onclick={() => settingsState.newsOpenBehavior = "new_tab"}
                    >
                        <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorNewTab")}</span>
                        {#if settingsState.newsOpenBehavior === "new_tab"}
                            <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                        {/if}
                    </button>
                    <!-- FEAT-0611 escape: selection-card group — a single-choice option, not an action button. -->
                    <button
                        type="button"
                        class="p-2.5 rounded-lg border text-xs text-left transition-colors cursor-pointer flex items-center justify-between"
                        class:border-[var(--accent-color)]={settingsState.newsOpenBehavior === "window"}
                        class:bg-[var(--bg-tertiary)]={settingsState.newsOpenBehavior === "window"}
                        class:border-[var(--border-color)]={settingsState.newsOpenBehavior !== "window"}
                        class:bg-[var(--bg-secondary)]={settingsState.newsOpenBehavior !== "window"}
                        onclick={() => settingsState.newsOpenBehavior = "window"}
                    >
                        <span class="font-medium text-[var(--text-primary)]">{$_("settings.newsOpenBehaviorWindow")}</span>
                        {#if settingsState.newsOpenBehavior === "window"}
                            <span class="text-[var(--accent-color)] font-bold text-xs">✓</span>
                        {/if}
                    </button>
                </SettingsGrid>
            </div>
        </div>

        <!-- Density (FEAT-0614). Tokens move height, type, padding and gap
             together; the select uses .input-field so it follows the mode. -->
        <div class="col-span-full border-t border-[var(--border-color)] pt-4">
            <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
                {$_("settings.densityTitle")}
            </h4>
            <div class="field-group">
                <label for="density-mode">{$_("settings.densityLabel")}</label>
                <select
                    id="density-mode"
                    bind:value={settingsState.density}
                    class="input-field w-full"
                    aria-describedby="density-mode-hint"
                >
                    <option value="compact">{$_("settings.densityCompact")}</option>
                    <option value="default">{$_("settings.densityDefault")}</option>
                    <option value="wide">{$_("settings.densityWide")}</option>
                </select>
                <p id="density-mode-hint" class="text-[10px] text-[var(--text-secondary)]">
                    {$_("settings.densityHint")}
                </p>
            </div>
        </div>

        <!-- Window docking -->
        <div class="col-span-full border-t border-[var(--border-color)] pt-4">
            <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
                {$_("settings.dockingTitle")}
            </h4>
            <label class="toggle-card mb-4 gap-3">
                <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-sm font-medium">{$_("settings.dockingCentered")}</span>
                    <span class="text-[10px] text-[var(--text-secondary)]">{$_("settings.dockingCenteredDesc")}</span>
                </div>
                <Toggle
                    id="docking-centered"
                    bind:checked={settingsState.enableDockingCentered}
                />
            </label>
            <div class="field-group">
                <label for="docking-position">{$_("settings.dockingPosition")}</label>
                <select id="docking-position" bind:value={settingsState.dockingPosition} class="input-field w-full">
                    <option value="top">{$_("settings.dockingTop")}</option>
                    <option value="bottom">{$_("settings.dockingBottom")}</option>
                </select>
                <p class="text-[10px] text-[var(--text-secondary)]">{$_("settings.dockingPositionDesc")}</p>
            </div>
        </div>

        <!-- Window behaviour (FEAT-0740) -->
        <div class="col-span-full border-t border-[var(--border-color)] pt-4">
            <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
                {$_("settings.windowBehaviorTitle")}
            </h4>
            <label class="toggle-card gap-3">
                <div class="flex flex-col min-w-0 flex-1">
                    <span class="text-sm font-medium">{$_("settings.focusFollowsMouse")}</span>
                    <span class="text-[10px] text-[var(--text-secondary)]">{$_("settings.focusFollowsMouseDesc")}</span>
                </div>
                <Toggle
                    id="focus-follows-mouse"
                    bind:checked={settingsState.focusFollowsMouse}
                />
            </label>
        </div>

        <!-- Window rules (FEAT-0743, scopes in FEAT-0769, apply-now in FEAT-0770).
             One rule per window type and scope: a chart may hold a type-wide
             rule plus one per symbol. A rule applies on the next open, and
             only "Apply now" touches a window that is already open. -->
        <div class="col-span-full border-t border-[var(--border-color)] pt-4">
            <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
                {$_("settings.windowRulesTitle")}
            </h4>
            <p class="text-[10px] text-[var(--text-secondary)] mb-3">
                {$_("settings.windowRulesDesc")}
            </p>

            {#if droppedRuleTypes.length > 0}
                <div
                    class="flex items-start gap-2 mb-3 rounded border border-[var(--border-color)] px-2 py-1.5"
                    role="status"
                >
                    <p class="flex-1 text-[10px] text-[var(--text-secondary)]">
                        {droppedRuleNotice}
                    </p>
                    <button
                        type="button"
                        class="text-[10px] text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]"
                        onclick={dismissDroppedWindowRuleTypes}
                    >
                        {$_("settings.windowRulesDroppedDismiss")}
                    </button>
                </div>
            {/if}

            {#if settingsState.windowRules.length === 0}
                <p class="text-xs text-[var(--text-secondary)] mb-3">
                    {$_("settings.windowRulesEmpty")}
                </p>
            {/if}

            <div class="flex flex-col gap-3">
                <!-- Keyed by object identity, not by `ruleKey`: renaming a
                     scoped rule changes its key and would remount the card,
                     dropping focus and swallowing a click on a sibling. -->
                {#each settingsState.windowRules as rule (rule)}
                    {@const applyReason =
                        applyNowRefusal(rule) ??
                        (applyRefusal?.key === ruleKey(rule)
                            ? applyRefusal.message
                            : null)}
                    <fieldset class="rule-card">
                        <legend class="sr-only">
                            {ruleHeading(rule)}
                        </legend>
                        <div class="flex items-center justify-between gap-3 flex-wrap">
                            <span class="text-sm font-medium">
                                {ruleHeading(rule)}
                            </span>
                            <div class="flex items-center gap-3">
                                <span
                                    class="text-[10px] text-[var(--text-secondary)]"
                                    aria-hidden="true"
                                >
                                    {$_(
                                        rule.enabled
                                            ? "settings.windowRulesEnabled"
                                            : "settings.windowRulesDisabled",
                                    )}
                                </span>
                                <Toggle
                                    id={`${ruleDomId(rule)}-enabled`}
                                    ariaLabel={`${$_(
                                        "settings.windowRulesEnableToggle",
                                    )}: ${ruleHeading(rule)}`}
                                    checked={rule.enabled}
                                    onchange={(e) =>
                                        (rule.enabled = (
                                            e.currentTarget as HTMLInputElement
                                        ).checked)}
                                />
                                <!-- FEAT-0611 escape: icon-only destructive action inside a rule card; the button primitive has no icon-only danger variant. -->
                                <button
                                    type="button"
                                    id={`${ruleDomId(rule)}-remove`}
                                    class="rule-remove"
                                    aria-label={`${$_(
                                        "settings.windowRulesRemove",
                                    )}: ${ruleHeading(rule)}`}
                                    title={`${$_(
                                        "settings.windowRulesRemove",
                                    )}: ${ruleHeading(rule)}`}
                                    onclick={() => removeRule(rule)}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {#if supportsSymbolScope(rule.windowType)}
                            {#if rule.match?.kind === "symbol"}
                                <label class="field-group mt-2">
                                    <span>{$_("settings.windowRulesSymbol")}</span>
                                    <input
                                        id={`${ruleDomId(rule)}-symbol`}
                                        type="text"
                                        class="input-field"
                                        list="window-rule-symbol-options"
                                        value={rule.match.value}
                                        aria-invalid={symbolRefusal?.key ===
                                            ruleKey(rule)}
                                        aria-describedby={symbolRefusal?.key ===
                                        ruleKey(rule)
                                            ? `${ruleDomId(rule)}-symbol-error`
                                            : undefined}
                                        onchange={(e) =>
                                            renameSymbol(
                                                rule,
                                                e.currentTarget as HTMLInputElement,
                                            )}
                                    />
                                    {#if symbolRefusal?.key === ruleKey(rule)}
                                        <p
                                            id={`${ruleDomId(rule)}-symbol-error`}
                                            role="status"
                                            aria-live="polite"
                                            class="text-[10px] text-[var(--danger-color)]"
                                        >
                                            {$_(symbolRefusal.message)}
                                        </p>
                                    {/if}
                                </label>
                            {:else}
                                <p class="text-[10px] text-[var(--text-secondary)] mt-2">
                                    {$_("settings.windowRulesScope")}:
                                    {$_("settings.windowRulesScopeAll")}
                                </p>
                            {/if}
                        {/if}

                        <p class="text-[10px] text-[var(--text-secondary)] mt-2">
                            {$_("settings.windowRulesGeometryHint")}
                        </p>
                        {#if typeHasFixedAspect(rule.windowType)}
                            <p class="text-[10px] text-[var(--text-secondary)]">
                                {$_("settings.windowRulesAspectHint")}
                            </p>
                        {/if}

                        <div class="rule-grid mt-2">
                            <label class="field-group">
                                <span>{$_("settings.windowRulesX")}</span>
                                <input
                                    id={`${ruleDomId(rule)}-x`}
                                    type="number"
                                    step="1"
                                    class="input-field"
                                    value={rule.x ?? ""}
                                    oninput={(e) =>
                                        setNumber(
                                            rule,
                                            "x",
                                            (e.currentTarget as HTMLInputElement)
                                                .value,
                                        )}
                                />
                            </label>
                            <label class="field-group">
                                <span>{$_("settings.windowRulesY")}</span>
                                <input
                                    id={`${ruleDomId(rule)}-y`}
                                    type="number"
                                    step="1"
                                    class="input-field"
                                    value={rule.y ?? ""}
                                    oninput={(e) =>
                                        setNumber(
                                            rule,
                                            "y",
                                            (e.currentTarget as HTMLInputElement)
                                                .value,
                                        )}
                                />
                            </label>
                            <label class="field-group">
                                <span>{$_("settings.windowRulesWidth")}</span>
                                <input
                                    id={`${ruleDomId(rule)}-width`}
                                    type="number"
                                    min="1"
                                    step="1"
                                    class="input-field"
                                    value={rule.width ?? ""}
                                    oninput={(e) =>
                                        setNumber(
                                            rule,
                                            "width",
                                            (e.currentTarget as HTMLInputElement)
                                                .value,
                                        )}
                                />
                            </label>
                            {#if !typeHasFixedAspect(rule.windowType)}
                                <label class="field-group">
                                    <span>{$_("settings.windowRulesHeight")}</span>
                                    <input
                                        id={`${ruleDomId(rule)}-height`}
                                        type="number"
                                        min="1"
                                        step="1"
                                        class="input-field"
                                        value={rule.height ?? ""}
                                        oninput={(e) =>
                                            setNumber(
                                                rule,
                                                "height",
                                                (
                                                    e.currentTarget as HTMLInputElement
                                                ).value,
                                            )}
                                    />
                                </label>
                            {/if}
                        </div>

                        <div class="rule-grid mt-2">
                            {#if typeAllowsMaximize(rule.windowType)}
                                <label class="field-group">
                                    <span>{$_("settings.windowRulesMaximized")}</span>
                                    <select
                                        id={`${ruleDomId(rule)}-maximized`}
                                        class="input-field"
                                        value={rule.isMaximized === undefined
                                            ? ""
                                            : rule.isMaximized
                                              ? "on"
                                              : "off"}
                                        onchange={(e) => {
                                            const value = (
                                                e.currentTarget as HTMLSelectElement
                                            ).value;
                                            if (!value) delete rule.isMaximized;
                                            else rule.isMaximized = value === "on";
                                        }}
                                    >
                                        <option value="">
                                            {$_("settings.windowRulesInherit")}
                                        </option>
                                        <option value="on">
                                            {$_("settings.windowRulesMaximizedOn")}
                                        </option>
                                        <option value="off">
                                            {$_("settings.windowRulesMaximizedOff")}
                                        </option>
                                    </select>
                                </label>
                            {/if}

                            <label class="field-group">
                                <span>{$_("settings.windowRulesKeepAbove")}</span>
                                <select
                                    id={`${ruleDomId(rule)}-keepabove`}
                                    class="input-field"
                                    value={rule.isKeepAbove === undefined
                                        ? ""
                                        : rule.isKeepAbove
                                          ? "on"
                                          : "off"}
                                    onchange={(e) => {
                                        const value = (
                                            e.currentTarget as HTMLSelectElement
                                        ).value;
                                        if (!value) delete rule.isKeepAbove;
                                        else rule.isKeepAbove = value === "on";
                                    }}
                                >
                                    <option value="">
                                        {$_("settings.windowRulesInherit")}
                                    </option>
                                    <option value="on">
                                        {$_("settings.windowRulesKeepAboveOn")}
                                    </option>
                                    <option value="off">
                                        {$_("settings.windowRulesKeepAboveOff")}
                                    </option>
                                </select>
                            </label>
                        </div>

                        <!-- FEAT-0770 — explicit application to the window the
                             user was working in. Nothing moves while a field is
                             edited; only this button acts on a live window. -->
                        <div class="flex items-center gap-2 flex-wrap mt-2">
                            <!-- FEAT-0611 escape: inline action inside a rule card; the button primitive does not fit this row. -->
                            <button
                                type="button"
                                id={`${ruleDomId(rule)}-apply`}
                                class="rule-add"
                                aria-disabled={!canApplyNow(rule)}
                                aria-describedby={applyReason
                                    ? `${ruleDomId(rule)}-apply-reason`
                                    : undefined}
                                aria-label={`${$_(
                                    "settings.windowRulesApplyNow",
                                )}: ${ruleHeading(rule)}`}
                                onclick={() => applyNow(rule)}
                            >
                                {$_("settings.windowRulesApplyNow")}
                            </button>
                            {#if applyReason}
                                <span
                                    id={`${ruleDomId(rule)}-apply-reason`}
                                    aria-live="polite"
                                    class="text-[10px] text-[var(--text-secondary)]"
                                >
                                    {$_(applyReason)}
                                </span>
                            {/if}
                        </div>
                    </fieldset>
                {/each}
            </div>

            <div class="flex items-end gap-2 mt-3 flex-wrap">
                <label class="field-group flex-1">
                    <span>{$_("settings.windowRulesAddType")}</span>
                    <select
                        id="window-rule-add-type"
                        class="input-field w-full"
                        bind:value={nextRuleType}
                        disabled={availableTypes.length === 0}
                    >
                        {#each availableTypes as type (type)}
                            <option value={type}>
                                {$_(TYPE_LABEL_KEYS[type])}
                            </option>
                        {/each}
                    </select>
                </label>
                {#if nextRuleType === "chart"}
                    <label class="field-group flex-1">
                        <span>{$_("settings.windowRulesSymbol")}</span>
                        <input
                            id="window-rule-add-symbol"
                            type="text"
                            class="input-field w-full"
                            list="window-rule-symbol-options"
                            placeholder={$_(
                                "settings.windowRulesSymbolPlaceholder",
                            )}
                            autocomplete="off"
                            aria-invalid={draftRefusal}
                            aria-describedby={draftRefusal
                                ? "window-rule-add-symbol-hint window-rule-add-symbol-error"
                                : "window-rule-add-symbol-hint"}
                            bind:value={nextRuleSymbol}
                        />
                    </label>
                {/if}
                <!-- FEAT-0611 escape: primary action that must sit inline with the type picker; the button primitive does not fit this row. -->
                <button
                    type="button"
                    id="window-rule-add"
                    class="rule-add"
                    disabled={!canAddRule}
                    onclick={addRule}
                >
                    {$_("settings.windowRulesAdd")}
                </button>
            </div>

            {#if nextRuleType === "chart"}
                <p
                    id="window-rule-add-symbol-hint"
                    class="text-[10px] text-[var(--text-secondary)] mt-1"
                >
                    {$_("settings.windowRulesSymbolHint")}
                </p>
                {#if draftSymbolTaken}
                    <p
                        id="window-rule-add-symbol-error"
                        role="alert"
                        class="text-[10px] text-[var(--danger-color)] mt-1"
                    >
                        {$_("settings.windowRulesDuplicateSymbol")}
                    </p>
                {:else if draftSymbolInvalid}
                    <p
                        id="window-rule-add-symbol-error"
                        role="alert"
                        class="text-[10px] text-[var(--danger-color)] mt-1"
                    >
                        {$_("settings.windowRulesSymbolInvalid")}
                    </p>
                {:else if draftTypeWideTaken}
                    <p
                        id="window-rule-add-symbol-error"
                        role="alert"
                        class="text-[10px] text-[var(--danger-color)] mt-1"
                    >
                        {$_("settings.windowRulesTypeWideExists")}
                    </p>
                {/if}
            {/if}

            <!-- Suggestions, not a restriction: a rule may name a symbol that is
                 not (or no longer) a favourite. -->
            <datalist id="window-rule-symbol-options">
                {#each settingsState.favoriteSymbols as symbol (symbol)}
                    <option value={symbol}></option>
                {/each}
            </datalist>
        </div>
    </SettingsGrid>
</section>

<style>
    /* Svelte scoped styles do not cross component boundaries: this shape is
       restated here (same values as the other settings tabs) instead of
       relying on the former VisualsTab shell. */
    .toggle-card {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-4);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl);
        cursor: pointer;
    }
    /* The news card is a container, not a control: only its option buttons
       act, so the pointer the toggle-card rule sets would lie. */
    .toggle-card.news-card {
        cursor: default;
    }
    .field-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .field-group label,
    /* The rule editor is a <label class="field-group"> whose caption is the */
    /* bare span; without this the new captions render at body size. */
    .field-group > span {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--text-secondary);
    }
    /* FEAT-0743 — one rule card. Same surface as .toggle-card, but a
       container rather than a click target, so it gets no pointer cursor. */
    .rule-card {
        margin: 0;
        padding: var(--space-4);
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: var(--radius-xl);
    }
    .rule-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 0.5rem;
    }
    .rule-remove {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.75rem;
        height: 1.75rem;
        border-radius: var(--radius-md);
        border: 1px solid var(--border-color);
        background: var(--bg-tertiary);
        color: var(--text-secondary);
        cursor: pointer;
    }
    .rule-remove:hover {
        color: var(--danger-color);
        border-color: var(--danger-color);
    }
    .rule-remove:focus-visible,
    .rule-add:focus-visible {
        outline: 2px solid var(--accent-color);
        outline-offset: 1px;
    }
    .rule-add {
        padding: 0.5rem 0.9rem;
        border-radius: var(--radius-lg);
        border: 1px solid var(--accent-color);
        background: var(--accent-color);
        color: var(--btn-accent-text);
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        cursor: pointer;
    }
    .rule-add:hover:not(:disabled):not([aria-disabled="true"]) {
        filter: brightness(1.06);
    }
    .rule-add:disabled,
    .rule-add[aria-disabled="true"] {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
