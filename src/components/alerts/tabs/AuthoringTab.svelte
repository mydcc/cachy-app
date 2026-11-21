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
  FEAT-0817 — describe a setup in prose, get a draft back unarmed.

  ## Why the state lives here and not in a `.svelte.ts` beside the port

  `useLiveExplanation.svelte.ts` is the obvious model, and copying it would
  have been wrong: it sits in `src/lib/academy/` and imports `aiState`, which
  is `lib -> stores` — an **uphill** edge, the direction `arch-cycles.mjs`
  freezes. That particular edge is grandfathered in the baseline; a second one
  would turn the ratchet red. A component is layer `components`, from which
  every import here is downhill, so the state belongs in the component and the
  logic stays in the pure modules under `lib/ai/ruleAuthoring/`.

  ## What this component is careful about

  - **The preview is the request.** `payload` is one `$derived` object; the
    preview renders from it and `requestRuleDraft` sends it. There is no second
    construction that could drift from what the trader read.
  - **Resolution happens here, the decision does not.** `resolveChatTarget`
    runs in this component; whether its answer may receive strategy prose is
    `decideAuthoringEgress`'s call, inside the port.
  - **Saving is not arming.** Two buttons, and the save writes
    `enabled: false` explicitly. The footer's Arm button is the other act.
  - **Exits are staged, not written.** The core refuses `exits` on a `notify`
    document (`ExitsAtNotifyLevel` — an alert owns no position to close), so a
    proposed exit is shown and held, never forced into the draft.
-->

<script lang="ts">
    import { _ } from "../../../locales/i18n";
    import type { TranslationKey } from "../../../locales/schema";
    import { alertPanelState } from "../../../stores/alertPanel.svelte";
    import { alertState } from "../../../stores/alerts.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { aiState } from "../../../stores/ai.svelte";
    import { uiState } from "../../../stores/ui.svelte";
    import { resolveChatTarget, type ChatTarget } from "../../../lib/ai/completion";
    import { buildConditionLanguageDescription } from "../../../lib/ai/ruleAuthoring/conditionLanguage";
    import {
        buildAuthoringPayload,
        previewAuthoringPayload,
    } from "../../../lib/ai/ruleAuthoring/authoringPayload";
    import {
        requestRuleDraft,
        type AuthoringOutcome,
    } from "../../../lib/ai/ruleAuthoring/requestRuleDraft";
    import { authoringTransport } from "../../../lib/ai/ruleAuthoring/authoringTransport";
    import {
        isRuleRefusedError,
        ruleSchema,
    } from "../../../lib/rules/ruleSchema";
    import {
        renderRuleSentence,
        type SentenceTranslator,
    } from "../../../lib/rules/ruleSentence";
    import type {
        ExitRule,
        RuleDocument,
        RuleRefusal,
    } from "../../../lib/rules/types";
    import { armRule } from "../../../services/alertEngine/armRule";
    import { logger } from "../../../services/logger";

    /**
     * The shell's contract for every builder tab: the symbol the panel header
     * fixed. It is the payload's symbol too, so the preview names exactly what
     * the trader reads in the header — and the candidate document inherits the
     * same value from `alertPanelState.draft`, which is where the shell writes
     * it, so the preview and the document cannot disagree about the market.
     */
    let { symbol }: { symbol: string } = $props();

    let prose = $state("");
    let isSending = $state(false);
    let outcome = $state<AuthoringOutcome | null>(null);
    /** The document the draft would become, validated or refused. */
    let candidate = $state<RuleDocument | null>(null);
    let refusals = $state<RuleRefusal[]>([]);
    /** Exits the model proposed. Shown and held; see the file comment. */
    let stagedExits = $state<ExitRule[] | null>(null);

    let controller: AbortController | null = null;

    /**
     * Abort an in-flight request when the tab unmounts.
     *
     * Every `$effect` that registers something must return a cleanup, and here
     * it is not cosmetic: the tabs are code-split and unmount on a tab switch,
     * so without this a trader who switches away leaves a request running
     * whose answer nothing will read.
     */
    $effect(() => {
        return () => {
            controller?.abort();
            controller = null;
        };
    });

    const translate: SentenceTranslator = (key, values) =>
        $_(key as TranslationKey, { values: values || {} });

    let language = $derived(
        buildConditionLanguageDescription(
            ruleSchema.isReady() ? ruleSchema.schemaVersion() : 1,
        ),
    );

    /**
     * Exactly what a request would carry. One object: the preview below reads
     * it and the request sends it, so they cannot differ.
     */
    let payload = $derived(
        buildAuthoringPayload(
            prose,
            symbol,
            alertPanelState.draft.trigger_timeframe,
            language,
        ),
    );

    let preview = $derived(previewAuthoringPayload(payload));

    /**
     * Who would answer, resolved from the same input the chat uses.
     *
     * A throw means the provider is not configured, which is a state the panel
     * has to render rather than a crash — `resolveChatTarget` throws for a
     * missing key, base URL or model.
     */
    let resolved = $derived.by<
        { target: ChatTarget; error?: undefined } | { target: null; error: string }
    >(() => {
        try {
            return { target: resolveChatTarget(aiState.resolveInput()) };
        } catch (error) {
            return {
                target: null,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    });

    let consentOff = $derived(!settingsState.aiRuleAuthoringEgress);
    let relayOnly = $derived(resolved.target?.kind === "relay");
    let canSend = $derived(
        !isSending &&
            prose.trim().length > 0 &&
            !consentOff &&
            !relayOnly &&
            resolved.target !== null,
    );

    let sentence = $derived(
        candidate ? renderRuleSentence(candidate, translate) : "",
    );

    /** Refusals grouped by the field they name, so each is read once. */
    let refusalsByField = $derived.by(() => {
        const grouped = new Map<string, RuleRefusal[]>();
        for (const refusal of refusals) {
            const list = grouped.get(refusal.field) ?? [];
            list.push(refusal);
            grouped.set(refusal.field, list);
        }
        return [...grouped.entries()];
    });

    /**
     * Build the document the model's conditions would produce, and ask the
     * core about it.
     *
     * The draft is assembled from the panel's current document, so the symbol,
     * the anchor and the lifecycle fields stay the trader's. The model
     * contributes `conditions`, `veto` and a name — and `provenance` records
     * that it did, which per ADR-0030 decision 7 authorises nothing.
     */
    function buildCandidate(
        answered: Extract<AuthoringOutcome, { kind: "draft" }>,
    ): void {
        const base = alertPanelState.draft;
        const proposed: RuleDocument = {
            ...base,
            name: answered.draft.name || base.name,
            conditions: answered.draft.conditions,
            // Never armed by arriving. ADR-0030 decision 5.
            enabled: false,
            provenance: {
                source: "model",
                created_at_ms: Date.now(),
                model: answered.model,
            },
        };
        if (answered.draft.veto) {
            proposed.veto = answered.draft.veto;
        } else {
            // Removed rather than set to undefined: a document without a veto
            // must keep the hash it had before the field was touched.
            delete proposed.veto;
        }

        stagedExits = answered.draft.exits ?? null;

        try {
            candidate = ruleSchema.validate(proposed);
            refusals = [];
        } catch (error) {
            if (isRuleRefusedError(error)) {
                // Keep the refused document so the sentence still renders:
                // a trader repairing a draft needs to read what was proposed.
                candidate = proposed;
                refusals = error.refusals;
                return;
            }
            logger.warn("alerts", "authoring draft could not be validated", error);
            candidate = null;
            refusals = [];
        }
    }

    async function ask(): Promise<void> {
        if (isSending) return;

        controller?.abort();
        const own = new AbortController();
        controller = own;

        isSending = true;
        outcome = null;
        candidate = null;
        refusals = [];
        stagedExits = null;

        const result = await requestRuleDraft({
            egress: {
                consent: settingsState.aiRuleAuthoringEgress,
                target: resolved.target,
                resolveError: resolved.error,
            },
            payload,
            transport: authoringTransport,
            signal: own.signal,
        });

        // A later request replaced this one; its answer is not the current one.
        if (controller !== own) return;
        controller = null;
        isSending = false;

        if (result.kind === "cancelled") return;
        outcome = result;
        if (result.kind === "draft") buildCandidate(result);
    }

    function cancel(): void {
        controller?.abort();
        controller = null;
        isSending = false;
    }

    /**
     * Put the proposed conditions into the panel's draft and hand over to the
     * Combo builder, where every value is editable before anything is armed.
     */
    function adopt(): void {
        if (!candidate) return;
        alertPanelState.setConditionGroup(candidate.conditions);
        alertPanelState.setVeto(candidate.veto ?? null);
        alertPanelState.setModelProvenance(
            candidate.provenance.model ?? "",
            candidate.name,
        );
        alertPanelState.activeTab = "combo";
        uiState.showToast(
            $_("dashboard.alerts.panel.authoring.adopted"),
            "success",
        );
    }

    /**
     * Store the draft disarmed.
     *
     * `enabled: false` is written here explicitly, and the rule loop skips a
     * disabled rule, so a saved draft cannot fire. Arming it is the footer's
     * button — a second, deliberate act (ADR-0030 decision 5).
     */
    function saveDraft(): void {
        if (!candidate || refusals.length > 0) return;
        try {
            armRule({ ...candidate, enabled: false });
            alertState.rulesVersion += 1;
            uiState.showToast(
                $_("dashboard.alerts.panel.authoring.saved"),
                "success",
            );
        } catch (error) {
            logger.error("alerts", "authoring draft could not be stored", error);
            uiState.showToast(
                $_("dashboard.alerts.panel.storeUnreadable"),
                "error",
            );
        }
    }
</script>

<div class="authoring">
    <p class="intro">{$_("dashboard.alerts.panel.authoring.intro")}</p>

    {#if consentOff}
        <!--
          The feature is unavailable without its own consent, and the reason
          says which switch and where — a disabled button with no explanation
          is the shape this panel avoids elsewhere too.
        -->
        <div class="banner" role="note">
            <strong>{$_("dashboard.alerts.panel.authoring.consentOff")}</strong>
            <span>{$_("dashboard.alerts.panel.authoring.consentOffHint")}</span>
        </div>
    {/if}

    <label class="field">
        <span class="field-label"
            >{$_("dashboard.alerts.panel.authoring.prose")}</span
        >
        <textarea
            class="prose-input"
            bind:value={prose}
            rows="4"
            disabled={consentOff}
            placeholder={$_("dashboard.alerts.panel.authoring.prosePlaceholder")}
        ></textarea>
    </label>

    <!--
      ADR-0030 decision 4: the closed list, shown before the first request.
      Rendered from the payload object itself, not from a copy of its parts.
    -->
    <section class="payload" aria-label={$_("dashboard.alerts.panel.authoring.previewTitle")}>
        <h4 class="payload-heading">
            {$_("dashboard.alerts.panel.authoring.previewTitle")}
        </h4>
        <dl class="payload-list">
            <dt>{$_("dashboard.alerts.panel.authoring.previewProse")}</dt>
            <dd class="payload-prose">
                {preview.prose ||
                    $_("dashboard.alerts.panel.authoring.previewProseEmpty")}
            </dd>
            <dt>{$_("dashboard.alerts.panel.symbol")}</dt>
            <dd>{preview.symbol}</dd>
            <dt>{$_("dashboard.alerts.panel.timeframe")}</dt>
            <dd>{preview.triggerTimeframe}</dd>
            <dt>{$_("dashboard.alerts.panel.authoring.previewLanguage")}</dt>
            <dd>
                {$_("dashboard.alerts.panel.authoring.previewLanguageValue", {
                    values: { count: preview.indicatorCount },
                })}
            </dd>
        </dl>
        <p class="payload-note">
            {$_("dashboard.alerts.panel.authoring.previewExcluded")}
        </p>

        {#if resolved.target}
            <p class="recipient">
                {$_("dashboard.alerts.panel.authoring.recipient", {
                    values: {
                        provider: resolved.target.label,
                        baseUrl: resolved.target.baseUrl,
                    },
                })}
            </p>
        {:else}
            <p class="recipient recipient--missing">
                {$_("dashboard.alerts.panel.authoring.recipientMissing", {
                    values: { detail: resolved.error },
                })}
            </p>
        {/if}
    </section>

    {#if relayOnly && resolved.target}
        <!--
          ADR-0030 decision 2. The relay carries a credential to a provider
          that refuses a cross-origin request; carrying strategy prose through
          it would make Cachy a recipient of Class A strategy. Named, never a
          silent fallback.
        -->
        <div class="banner banner--refused" role="alert">
            <strong>{$_("dashboard.alerts.panel.authoring.relayRefused")}</strong>
            <span>
                {$_("dashboard.alerts.panel.authoring.relayRefusedHint", {
                    values: { provider: resolved.target.label },
                })}
            </span>
        </div>
    {/if}

    <div class="actions">
        <button class="send-btn" type="button" onclick={ask} disabled={!canSend}>
            {isSending
                ? $_("dashboard.alerts.panel.authoring.sending")
                : $_("dashboard.alerts.panel.authoring.send")}
        </button>
        {#if isSending}
            <button class="ghost-btn" type="button" onclick={cancel}>
                {$_("dashboard.alerts.panel.authoring.cancel")}
            </button>
        {/if}
    </div>

    {#if outcome && outcome.kind === "not_expressible"}
        <!--
          A stated inability, with the model's own reason. ADR-0030 decision 6
          calls a plausible document for an inexpressible request the worst
          available outcome, so this is deliberately not an error box: nothing
          is broken, the language simply has no equivalent.
        -->
        <div class="banner" role="status">
            <strong
                >{$_("dashboard.alerts.panel.authoring.notExpressible")}</strong
            >
            <span>{outcome.reason}</span>
        </div>
    {:else if outcome && outcome.kind === "unreadable"}
        <div class="banner banner--refused" role="alert">
            <strong>{$_("dashboard.alerts.panel.authoring.unreadable")}</strong>
            <span>{outcome.detail}</span>
        </div>
    {:else if outcome && outcome.kind === "failed"}
        <div class="banner banner--refused" role="alert">
            <strong>{$_("dashboard.alerts.panel.authoring.failed")}</strong>
            <span>{outcome.detail}</span>
        </div>
    {:else if outcome && outcome.kind === "refused" && outcome.refusal === "unresolved"}
        <div class="banner banner--refused" role="alert">
            <strong>{$_("dashboard.alerts.panel.authoring.unresolved")}</strong>
            <span>{outcome.detail}</span>
        </div>
    {/if}

    {#if candidate}
        <section class="draft" aria-label={$_("dashboard.alerts.panel.authoring.draftTitle")}>
            <h4 class="payload-heading">
                {$_("dashboard.alerts.panel.authoring.draftTitle")}
            </h4>

            <p class="sentence-text">{sentence}</p>

            {#if outcome?.kind === "draft" && outcome.draft.notes}
                <p class="notes">
                    {$_("dashboard.alerts.panel.authoring.notes", {
                        values: { notes: outcome.draft.notes },
                    })}
                </p>
            {/if}

            {#if refusalsByField.length > 0}
                <!--
                  Field by field, not a wall of text — the item's first
                  acceptance criterion. The core reports every problem in one
                  pass, so a trader repairs a draft without one round trip per
                  mistake.
                -->
                <div class="refusals" role="alert">
                    <strong
                        >{$_(
                            "dashboard.alerts.panel.authoring.refusalsTitle",
                        )}</strong
                    >
                    <ul>
                        {#each refusalsByField as [field, list] (field)}
                            <li>
                                <code>{field}</code>
                                <ul>
                                    {#each list as refusal (refusal.code + refusal.field)}
                                        <li>
                                            {$_(
                                                refusal.i18n_key as TranslationKey,
                                                { values: { field: refusal.field } },
                                            )}
                                        </li>
                                    {/each}
                                </ul>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/if}

            {#if stagedExits}
                <!--
                  Held, not written. An exit on a `notify` document is refused
                  by the core, so these travel when the trader makes a bot.
                -->
                <div class="banner" role="note">
                    <strong
                        >{$_("dashboard.alerts.panel.authoring.exitsStaged", {
                            values: { count: stagedExits.length },
                        })}</strong
                    >
                    <span
                        >{$_(
                            "dashboard.alerts.panel.authoring.exitsStagedHint",
                        )}</span
                    >
                </div>
            {/if}

            <div class="actions">
                <button
                    class="send-btn"
                    type="button"
                    onclick={adopt}
                    disabled={refusals.length > 0}
                    title={refusals.length > 0
                        ? $_("dashboard.alerts.panel.authoring.adoptRefused")
                        : undefined}
                >
                    {$_("dashboard.alerts.panel.authoring.adopt")}
                </button>
                <button
                    class="ghost-btn"
                    type="button"
                    onclick={saveDraft}
                    disabled={refusals.length > 0}
                >
                    {$_("dashboard.alerts.panel.authoring.save")}
                </button>
            </div>
            <p class="payload-note">
                {$_("dashboard.alerts.panel.authoring.notArmed")}
            </p>
        </section>
    {/if}
</div>

<style>
    .authoring {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }
    .intro {
        margin: 0;
        font-size: 0.8rem;
        line-height: 1.5;
        color: var(--text-secondary);
    }
    .field {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 0;
    }
    .field-label {
        font-size: 0.75rem;
        color: var(--text-secondary);
    }
    .prose-input {
        width: 100%;
        min-width: 0;
        background: var(--bg-primary);
        border: 1px solid var(--input-border-color, var(--border-color));
        border-radius: var(--radius-sm);
        color: var(--text-primary);
        padding: var(--space-2);
        font-family: inherit;
        font-size: 0.85rem;
        resize: vertical;
    }
    .prose-input:disabled {
        opacity: 0.5;
    }
    .payload,
    .draft {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
        padding: var(--space-3);
    }
    .payload-heading {
        margin: 0;
        font-size: 0.7rem;
        font-weight: var(--font-bold);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--text-secondary);
    }
    .payload-list {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.25rem var(--space-3);
        margin: 0;
        font-size: 0.8rem;
    }
    .payload-list dt {
        color: var(--text-secondary);
    }
    .payload-list dd {
        margin: 0;
        min-width: 0;
        color: var(--text-primary);
        overflow-wrap: anywhere;
    }
    .payload-prose {
        white-space: pre-wrap;
    }
    .payload-note {
        margin: 0;
        font-size: 0.7rem;
        line-height: 1.5;
        color: var(--text-secondary);
    }
    .recipient {
        margin: 0;
        font-size: 0.75rem;
        color: var(--text-primary);
        overflow-wrap: anywhere;
    }
    .recipient--missing {
        color: var(--danger-color);
    }
    .banner {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        padding: var(--space-3);
        background: var(--bg-secondary);
        border-left: 3px solid var(--warning-color, var(--border-color));
        border-radius: var(--radius-sm);
        font-size: 0.8rem;
        line-height: 1.5;
    }
    .banner--refused {
        border-left-color: var(--danger-color);
    }
    .banner span {
        color: var(--text-secondary);
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
    }
    .send-btn {
        background: var(--accent-color);
        color: var(--bg-primary);
        border: none;
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-weight: var(--font-bold);
        font-size: 0.85rem;
    }
    .ghost-btn {
        background: none;
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        padding: var(--space-2) var(--space-4);
        border-radius: var(--radius-sm);
        cursor: pointer;
        font-size: 0.85rem;
    }
    .send-btn:disabled,
    .ghost-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .sentence-text {
        margin: 0;
        font-size: 0.9rem;
        line-height: 1.5;
        color: var(--text-primary);
    }
    .notes {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.5;
        color: var(--text-secondary);
    }
    .refusals {
        font-size: 0.8rem;
        line-height: 1.5;
        color: var(--danger-color);
    }
    .refusals ul {
        margin: var(--space-1) 0 0 0;
        padding-left: var(--space-4);
    }
    .refusals code {
        color: var(--text-primary);
    }
</style>
