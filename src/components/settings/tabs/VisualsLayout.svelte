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
    import { WINDOW_RULE_TYPES, isRuleTarget } from "../../../lib/windows/windowRules";
    import type { WindowRule, WindowRuleType } from "../../../stores/settings/settingsTypes";
    import type { TranslationKey } from "../../../locales/schema";
    import Toggle from "../../shared/Toggle.svelte";
    import SettingsGrid from "../shared/SettingsGrid.svelte";

    type GeometryKey = "x" | "y" | "width" | "height";

    /** FEAT-0743 — the type the next "Add rule" creates. */
    let nextRuleType = $state<WindowRuleType | "">(
        WINDOW_RULE_TYPES.find(
            (type) =>
                !settingsState.windowRules.some(
                    (rule) => rule.windowType === type,
                ),
        ) ?? "",
    );

    /** Labels for every type a rule can target (the selectable set). */
    const TYPE_LABEL_KEYS: Record<WindowRuleType, TranslationKey> = {
        journal: "settings.windowRulesTypes.journal",
        chart: "settings.windowRulesTypes.chart",
        academy: "settings.windowRulesTypes.academy",
        assistant: "settings.windowRulesTypes.assistant",
        settings: "settings.windowRulesTypes.settings",
        news: "settings.windowRulesTypes.news",
        alertpanel: "settings.windowRulesTypes.alertpanel",
        controlcenter: "settings.windowRulesTypes.controlcenter",
        channel: "settings.windowRulesTypes.channel",
        iframe: "settings.windowRulesTypes.iframe",
        chatbox: "settings.windowRulesTypes.chatbox",
        guide: "settings.windowRulesTypes.guide",
        changelog: "settings.windowRulesTypes.changelog",
        privacy: "settings.windowRulesTypes.privacy",
        whitepaper: "settings.windowRulesTypes.whitepaper",
    };

    /** Types that do not have a rule yet. At most one rule per type. */
    const unusedRuleTypes = $derived(
        WINDOW_RULE_TYPES.filter(
            (type) =>
                !settingsState.windowRules.some(
                    (rule) => rule.windowType === type,
                ),
        ),
    );

    function syncNextRuleType() {
        if (!nextRuleType || !unusedRuleTypes.includes(nextRuleType)) {
            nextRuleType = unusedRuleTypes[0] ?? "";
        }
    }

    function addRule() {
        const type = nextRuleType;
        if (!type || !isRuleTarget(type)) return;
        if (settingsState.windowRules.some((rule) => rule.windowType === type)) {
            return;
        }
        settingsState.windowRules.push({ windowType: type, enabled: true });
        syncNextRuleType();
    }

    function removeRule(type: WindowRuleType) {
        settingsState.windowRules = settingsState.windowRules.filter(
            (rule) => rule.windowType !== type,
        );
        syncNextRuleType();
    }

    /**
     * Number inputs are controlled rather than `bind:value`: Svelte stores
     * `null` for a cleared number field, while the rule model uses `undefined`
     * for "not set". Normalising here keeps the persisted payload and
     * `windowRulePatch`'s "only present fields" contract honest.
     */
    function setNumber(rule: WindowRule, key: GeometryKey, raw: string) {
        const trimmed = raw.trim();
        const value = trimmed === "" ? Number.NaN : Number(trimmed);
        if (!Number.isFinite(value)) {
            delete rule[key];
            return;
        }
        rule[key] = value;
    }

    function typeClosesOnBlur(type: WindowRuleType): boolean {
        return windowRegistry.getConfig(type).flags.closeOnBlur === true;
    }

    function typeAllowsMaximize(type: WindowRuleType): boolean {
        return windowRegistry.getConfig(type).flags.allowMaximize !== false;
    }

    function typeHasFixedAspect(type: WindowRuleType): boolean {
        return windowRegistry.getConfig(type).layout.aspectRatio != null;
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

        <!-- Window rules (FEAT-0743). One rule per window type; a rule only
             applies the next time that window opens. -->
        <div class="col-span-full border-t border-[var(--border-color)] pt-4">
            <h4 class="text-xs font-bold text-[var(--text-secondary)] uppercase mb-2">
                {$_("settings.windowRulesTitle")}
            </h4>
            <p class="text-[10px] text-[var(--text-secondary)] mb-3">
                {$_("settings.windowRulesDesc")}
            </p>

            {#if settingsState.windowRules.length === 0}
                <p class="text-xs text-[var(--text-secondary)] mb-3">
                    {$_("settings.windowRulesEmpty")}
                </p>
            {/if}

            <div class="flex flex-col gap-3">
                {#each settingsState.windowRules as rule (rule.windowType)}
                    <fieldset class="rule-card">
                        <legend class="sr-only">
                            {$_(TYPE_LABEL_KEYS[rule.windowType])}
                        </legend>
                        <div class="flex items-center justify-between gap-3 flex-wrap">
                            <span class="text-sm font-medium">
                                {$_(TYPE_LABEL_KEYS[rule.windowType])}
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
                                    id={`window-rule-${rule.windowType}-enabled`}
                                    ariaLabel={`${$_(
                                        "settings.windowRulesEnableToggle",
                                    )}: ${$_(TYPE_LABEL_KEYS[rule.windowType])}`}
                                    checked={rule.enabled}
                                    onchange={(e) =>
                                        (rule.enabled = (
                                            e.currentTarget as HTMLInputElement
                                        ).checked)}
                                />
                                <!-- FEAT-0611 escape: icon-only destructive action inside a rule card; the button primitive has no icon-only danger variant. -->
                                <button
                                    type="button"
                                    id={`window-rule-${rule.windowType}-remove`}
                                    class="rule-remove"
                                    aria-label={`${$_(
                                        "settings.windowRulesRemove",
                                    )}: ${$_(TYPE_LABEL_KEYS[rule.windowType])}`}
                                    title={`${$_(
                                        "settings.windowRulesRemove",
                                    )}: ${$_(TYPE_LABEL_KEYS[rule.windowType])}`}
                                    onclick={() => removeRule(rule.windowType)}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

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
                                    id={`window-rule-${rule.windowType}-x`}
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
                                    id={`window-rule-${rule.windowType}-y`}
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
                                    id={`window-rule-${rule.windowType}-width`}
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
                                        id={`window-rule-${rule.windowType}-height`}
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
                                        id={`window-rule-${rule.windowType}-maximized`}
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

                            {#if typeClosesOnBlur(rule.windowType)}
                                <p class="text-[10px] text-[var(--text-secondary)] self-end">
                                    {$_("settings.windowRulesKeepAboveUnavailable")}
                                </p>
                            {:else}
                                <label class="field-group">
                                    <span>{$_("settings.windowRulesKeepAbove")}</span>
                                    <select
                                        id={`window-rule-${rule.windowType}-keepabove`}
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
                            {/if}
                        </div>
                    </fieldset>
                {/each}
            </div>

            <div class="flex items-end gap-2 mt-3">
                <label class="field-group flex-1">
                    <span>{$_("settings.windowRulesAddType")}</span>
                    <select
                        id="window-rule-add-type"
                        class="input-field w-full"
                        bind:value={nextRuleType}
                        disabled={unusedRuleTypes.length === 0}
                    >
                        {#each unusedRuleTypes as type (type)}
                            <option value={type}>
                                {$_(TYPE_LABEL_KEYS[type])}
                            </option>
                        {/each}
                    </select>
                </label>
                <!-- FEAT-0611 escape: primary action that must sit inline with the type picker; the button primitive does not fit this row. -->
                <button
                    type="button"
                    id="window-rule-add"
                    class="rule-add"
                    disabled={!nextRuleType || unusedRuleTypes.length === 0}
                    onclick={addRule}
                >
                    {$_("settings.windowRulesAdd")}
                </button>
            </div>
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
    .rule-add:hover:not(:disabled) {
        filter: brightness(1.06);
    }
    .rule-add:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
