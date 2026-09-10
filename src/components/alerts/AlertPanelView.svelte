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
  FEAT-0389 -- the Super-Alert side panel shell.

  Owns four things no builder tab owns: the header that fixes symbol, price
  source and evaluation anchor for the whole rule; the tab strip and its lazy
  loader; the plain-language sentence; and the engine-failed banner. Each
  builder tab (FEAT-0028, FEAT-0030, FEAT-0390, FEAT-0391, FEAT-0394) edits
  `alertPanelState.draft` and lands into this shell without changing it.

  Dragging, resizing and viewport clamping are not implemented here:
  this component is the body of an `AlertPanelWindow`, and WindowFrame
  provides all of that once (ADR-0006).

  Escape and Tab-focus containment ARE implemented here, because WindowFrame
  does not provide either centrally yet: Escape-close is wired through
  WindowManager's own global handler (this panel is named there explicitly
  since it's `closeOnBlur: false`), and the Tab-trap below has no shared
  home to live in instead. Both should move out once WindowFrame grows the
  capability -- see the ADR-0006 gap noted in review on PR #2727.
-->

<script lang="ts">
    import type { Component } from "svelte";
    import { _ } from "../../locales/i18n";
    import { alertState } from "../../stores/alerts.svelte";
    import {
        ALERT_PANEL_TABS,
        alertPanelState,
        refusalsForField,
        unclaimedRefusals,
        type AlertPanelTab,
    } from "../../stores/alertPanel.svelte";
    import { renderRuleSentence, type SentenceTranslator } from "../../lib/rules/ruleSentence";
    import { armRule, RuleStoreUnreadableError } from "../../services/alertEngine/armRule";
    import type { PriceField, TimeframeString } from "../../lib/rules/types";
    import type { TranslationKey } from "../../locales/schema";
    import { uiState } from "../../stores/ui.svelte";
    import { logger } from "../../services/logger";

let rootElement: HTMLElement | null = null;

    /**
     * One dynamic import per tab, so opening the panel pulls in the Manage tab
     * and nothing else. Written as a literal map rather than a computed
     * `import(\`./tabs/${tab}.svelte\`)`: Vite can only split what it can see
     * statically, and a template-literal import silently bundles the whole
     * directory into one chunk -- the acceptance criterion would then pass by
     * inspection and fail in the build.
     */
    const TAB_LOADERS: Record<AlertPanelTab, () => Promise<{ default: Component<{ symbol: string }> }>> = {
        templates: () => import("./tabs/TemplatesTab.svelte"),
        combo: () => import("./tabs/ComboTab.svelte"),
        price: () => import("./tabs/PriceTab.svelte"),
        indicators: () => import("./tabs/IndicatorsTab.svelte"),
        candlesticks: () => import("./tabs/CandlesticksTab.svelte"),
        manage: () => import("./tabs/ManageTab.svelte"),
    };

    /**
     * Explicit key maps rather than `$_(\`rules.sentence.price.${field}\`)`: the
     * generated `TranslationKey` union is what catches a locale entry someone
     * deleted, and a computed key silently opts out of it.
     */
    const PRICE_FIELD_KEYS: Record<PriceField, TranslationKey> = {
        close: "rules.sentence.price.close",
        open: "rules.sentence.price.open",
        high: "rules.sentence.price.high",
        low: "rules.sentence.price.low",
        hl2: "rules.sentence.price.hl2",
        hlc3: "rules.sentence.price.hlc3",
    };

    const TAB_LABEL_KEYS: Record<AlertPanelTab, TranslationKey> = {
        templates: "dashboard.alerts.panel.tab.templates",
        combo: "dashboard.alerts.panel.tab.combo",
        price: "dashboard.alerts.panel.tab.price",
        indicators: "dashboard.alerts.panel.tab.indicators",
        candlesticks: "dashboard.alerts.panel.tab.candlesticks",
        manage: "dashboard.alerts.panel.tab.manage",
    };

    const PRICE_FIELDS: PriceField[] = ["close", "open", "high", "low", "hl2", "hlc3"];
    const TIMEFRAMES: TimeframeString[] = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"];

    /** Fields the shell renders a control for, and can therefore anchor a
     *  refusal against. Anything else falls to `unclaimedRefusals` below. */
    const SHELL_FIELDS = ["symbol", "trigger_timeframe"] as const;

    let priceSource = $state<PriceField>("close");

    let TabComponent = $state<Component<{ symbol: string }> | null>(null);
    let tabLoadFailed = $state(false);

    /**
     * Loads the active tab's chunk. `token` guards the race a fast tab switch
     * creates: two imports are then in flight, and without the check the
     * slower one wins and shows a tab the trader already left.
     */
    let loadToken = 0;
    $effect(() => {
        const tab = alertPanelState.activeTab;
        const token = ++loadToken;
        TabComponent = null;
        tabLoadFailed = false;
        TAB_LOADERS[tab]()
            .then((module) => {
                if (token !== loadToken) return;
                TabComponent = module.default;
            })
            .catch((error) => {
                if (token !== loadToken) return;
                logger.error("alerts", `failed to load alert panel tab: ${tab}`, error);
                tabLoadFailed = true;
            });
    });

    // The renderer composes its own keys from the document's shape, so the
    // cast is unavoidable here; `ruleSentence.test.ts` resolves the same keys
    // against the real locale files, which is the check the union would have
    // given us.
    const translate: SentenceTranslator = (key, values) =>
        $_(key as TranslationKey, { values: values || {} });

    let sentence = $derived(renderRuleSentence(alertPanelState.draft, translate));

    let hasCondition = $derived(
        alertPanelState.draft.conditions.kind !== "group" ||
            alertPanelState.draft.conditions.of.length > 0,
    );

    let otherRefusals = $derived(
        unclaimedRefusals(alertPanelState.refusals, SHELL_FIELDS as readonly string[]),
    );

    function selectTab(tab: AlertPanelTab) {
        alertPanelState.activeTab = tab;
    }

    /**
     * Arrow-key movement across the tab strip, which is what `role="tablist"`
     * promises a screen-reader user. Without it the strip announces itself as
     * a tablist and then behaves like six unrelated buttons.
     */
    function onTabKeydown(event: KeyboardEvent, index: number) {
        const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        const next = (index + delta + ALERT_PANEL_TABS.length) % ALERT_PANEL_TABS.length;
        selectTab(ALERT_PANEL_TABS[next]);
        document.getElementById(`alert-tab-${ALERT_PANEL_TABS[next]}`)?.focus();
    }

    /**
     * Tab-cycle focus containment. Escape-close is handled centrally by
     * WindowManager (which now treats `windowType: "alertpanel"` as
     * dismissible despite `closeOnBlur: false`) rather than here, so it
     * fires regardless of where focus currently is -- not just while it's
     * inside this panel.
     */
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Tab" && rootElement) {
            const focusables = rootElement.querySelectorAll(
                "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
            ) as NodeListOf<HTMLElement>;
            if (focusables.length > 0) {
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        }
    }

    function arm() {
        const accepted = alertPanelState.validateDraft();
        if (!accepted) return;
        try {
            armRule(accepted);
            uiState.showToast($_("dashboard.alerts.panel.armed"), "success");
        } catch (e) {
            const key: TranslationKey =
                e instanceof RuleStoreUnreadableError
                    ? (e.translationKey as TranslationKey)
                    : "dashboard.alerts.panel.storeUnreadable";
            logger.error("alerts", "failed to arm rule", e);
            uiState.showToast($_(key), "error");
        }
    }
</script>

<div class="alert-panel" bind:this={rootElement} onkeydown={handleKeydown}>
    <!--
      BUG-0382: while the engine failed to load, rules are stored but nothing
      evaluates them. In the shell rather than in a tab, so it stays on screen
      whichever builder the trader is in.
    -->
    {#if alertState.engineStatus === "failed"}
        <div class="banner banner--warning" role="alert">
            {$_("dashboard.alerts.engineUnavailableHint")}
        </div>
    {/if}

    <header class="panel-header">
        <label class="field">
            <span class="field-label">{$_("dashboard.alerts.panel.symbol")}</span>
            <input
                class="field-input"
                type="text"
                value={alertPanelState.draft.symbol}
                oninput={(e) => alertPanelState.setSymbol(e.currentTarget.value)}
                aria-invalid={refusalsForField(alertPanelState.refusals, "symbol").length > 0}
                aria-describedby="alert-refusal-symbol"
            />
            <div class="field-refusals" id="alert-refusal-symbol">
                {#each refusalsForField(alertPanelState.refusals, "symbol") as refusal (refusal.code + refusal.field)}
                    <span class="refusal">{$_(refusal.i18n_key as TranslationKey)}</span>
                {/each}
            </div>
        </label>

        <label class="field">
            <span class="field-label">{$_("dashboard.alerts.panel.priceSource")}</span>
            <select class="field-input" bind:value={priceSource}>
                {#each PRICE_FIELDS as field (field)}
                    <option value={field}>{$_(PRICE_FIELD_KEYS[field])}</option>
                {/each}
            </select>
        </label>

        <label class="field">
            <span class="field-label">{$_("dashboard.alerts.panel.timeframe")}</span>
            <select
                class="field-input"
                value={alertPanelState.draft.trigger_timeframe}
                onchange={(e) => alertPanelState.setTimeframe(e.currentTarget.value)}
                aria-invalid={refusalsForField(alertPanelState.refusals, "trigger_timeframe")
                    .length > 0}
                aria-describedby="alert-refusal-timeframe"
            >
                {#each TIMEFRAMES as tf (tf)}
                    <option value={tf}>{tf}</option>
                {/each}
            </select>
            <div class="field-refusals" id="alert-refusal-timeframe">
                {#each refusalsForField(alertPanelState.refusals, "trigger_timeframe") as refusal (refusal.code + refusal.field)}
                    <span class="refusal">{$_(refusal.i18n_key as TranslationKey)}</span>
                {/each}
            </div>
        </label>
    </header>

    <div class="tab-strip" role="tablist" aria-label={$_("dashboard.alerts.panel.tabs")}>
        {#each ALERT_PANEL_TABS as tab, index (tab)}
            <button
                id="alert-tab-{tab}"
                role="tab"
                type="button"
                aria-selected={alertPanelState.activeTab === tab}
                aria-controls="alert-tab-panel"
                tabindex={alertPanelState.activeTab === tab ? 0 : -1}
                class:active={alertPanelState.activeTab === tab}
                onclick={() => selectTab(tab)}
                onkeydown={(e) => onTabKeydown(e, index)}
            >
                {$_(TAB_LABEL_KEYS[tab])}
            </button>
        {/each}
    </div>

    <div
        class="tab-body"
        id="alert-tab-panel"
        role="tabpanel"
        aria-labelledby="alert-tab-{alertPanelState.activeTab}"
    >
        {#if tabLoadFailed}
            <div class="banner banner--warning" role="alert">
                {$_("dashboard.alerts.panel.tabLoadFailed")}
            </div>
        {:else if TabComponent}
            <TabComponent symbol={alertPanelState.draft.symbol} />
        {:else}
            <div class="loading" role="status">{$_("dashboard.alerts.panel.loading")}</div>
        {/if}
    </div>

    <footer class="panel-footer">
        <!--
          The rule in words, above the arm button and never behind a toggle.
          This is what a trader actually arms from: the sentence is rendered
          from the document the core will be handed, not from the form, so the
          two cannot drift apart.
        -->
        <div class="sentence" aria-live="polite">
            <span class="sentence-label">{$_("dashboard.alerts.panel.sentenceLabel")}</span>
            <p class="sentence-text">{sentence}</p>
        </div>

        {#if alertPanelState.coreUnavailable}
            <div class="banner banner--warning" role="alert">
                {$_("dashboard.alerts.panel.coreUnavailable")}
            </div>
        {/if}

        <!--
          Refusals no header control claimed -- typically against a field a
          builder tab owns. Shown rather than dropped: a refused arm with
          nothing on screen explaining it is the shape of BUG-0382.
        -->
        {#if otherRefusals.length > 0}
            <div class="banner banner--warning" role="alert">
                <strong>{$_("dashboard.alerts.panel.otherRefusals")}</strong>
                <ul>
                    {#each otherRefusals as refusal (refusal.code + refusal.field)}
                        <li><code>{refusal.field}</code> — {$_(refusal.i18n_key as TranslationKey)}</li>
                    {/each}
                </ul>
            </div>
        {/if}

        <button
            class="arm-btn"
            type="button"
            onclick={arm}
            disabled={!hasCondition}
            title={hasCondition ? undefined : $_("dashboard.alerts.panel.armDisabled")}
        >
            {$_("dashboard.alerts.panel.arm")}
        </button>
    </footer>
</div>

<style>
    .alert-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        gap: var(--space-3);
        padding: var(--space-3);
        color: var(--text-primary);
    }
    .banner {
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        font-size: 0.85rem;
        line-height: 1.5;
    }
    .banner--warning {
        border-left: 3px solid var(--warning-color, var(--border-color));
    }
    .banner ul {
        margin: var(--space-2) 0 0 0;
        padding-left: var(--space-4);
    }
    .panel-header {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-2);
    }
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
    }
    .field:first-child {
        grid-column: 1 / -1;
    }
    .field-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
    }
    .field-input {
        width: 100%;
        min-width: 0;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        color: var(--text-primary);
        padding: var(--space-2);
        border-radius: var(--radius-sm);
    }
    .field-input[aria-invalid="true"] {
        border-color: var(--danger-color);
    }
    .field-refusals:empty {
        display: none;
    }
    .refusal {
        display: block;
        color: var(--danger-color);
        font-size: 0.75rem;
        line-height: 1.4;
    }
    .tab-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 0.25rem;
        border-bottom: 1px solid var(--border-color);
    }
    .tab-strip button {
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        padding: var(--space-2);
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 0.8rem;
    }
    .tab-strip button.active {
        color: var(--text-primary);
        border-bottom-color: var(--accent-color);
    }
    .tab-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
    }
    .loading {
        padding: var(--space-6);
        text-align: center;
        color: var(--text-secondary);
        font-size: 0.85rem;
    }
    .panel-footer {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        border-top: 1px solid var(--border-color);
        padding-top: var(--space-3);
    }
    .sentence {
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        padding: var(--space-3);
    }
    .sentence-label {
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--text-secondary);
    }
    .sentence-text {
        margin: var(--space-1) 0 0 0;
        font-size: 0.9rem;
        line-height: 1.5;
    }
    .arm-btn {
        background: var(--accent-color);
        color: var(--bg-primary);
        border: none;
        padding: var(--space-3);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-weight: var(--font-bold);
    }
    .arm-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
