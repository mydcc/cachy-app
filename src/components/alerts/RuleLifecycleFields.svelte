<!--
  FEAT-0393 — the lifecycle footer: how often a rule announces, until when, on
  which channels, and the note saying why it was armed.

  A component of its own rather than more lines in AlertPanelView, which is
  already 500 lines and owns the header, the tab strip and the arm button. These
  four controls are one cohesive thing and they belong together where they can
  be read — and tested — without the shell around them.

  Every field writes straight into `alertPanelState.draft`. None of them changes
  the document's content hash, so editing them never turns the rule under
  construction into a different strategy.
-->
<script lang="ts">
    import { _, locale } from "../../locales/i18n";
    import { alertPanelState } from "../../stores/alertPanel.svelte";
    import {
        NOTE_MAX_CHARS,
        type TriggerFrequency,
        type TriggerMethod,
    } from "../../lib/rules/types";

    const FREQUENCIES: TriggerFrequency[] = ["once", "every_time", "once_per_candle_close"];
    const METHODS: TriggerMethod[] = ["in_app", "browser", "sound"];

    const draft = $derived(alertPanelState.draft);

    /**
     * An `Intl` locale tag for the app's language, not the browser's.
     *
     * `toLocaleString()` follows the OS locale, so a German UI on an English
     * machine rendered an English date inside a German sentence. The hybrid
     * `de-tech` locale is not a tag `Intl` accepts, so it maps to plain `de`.
     */
    const intlTag = $derived(($locale ?? "en").startsWith("de") ? "de-DE" : "en-US");

    /**
     * The expiry as a `datetime-local` value, or "" when the rule never expires.
     *
     * `datetime-local` has no timezone, so it reads and writes the browser's
     * local time — which is what a trader means by "valid until Friday
     * evening". The stored value stays epoch milliseconds, so the core never
     * has to know which zone it was typed in.
     */
    const validUntilLocal = $derived.by(() => {
        const ms = draft.valid_until_ms;
        if (ms === undefined) return "";

        const at = new Date(ms);
        // `toISOString` would shift into UTC. Build the local wall-clock string
        // instead, which is what the input round-trips.
        const pad = (n: number) => String(n).padStart(2, "0");
        return (
            `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}` +
            `T${pad(at.getHours())}:${pad(at.getMinutes())}`
        );
    });

    function setValidUntil(value: string) {
        // A `datetime-local` input reports "" for anything it cannot parse,
        // incomplete input included — there is no garbage-string case to guard
        // against, so "" is the only signal for "no expiry yet". That does mean
        // the value blanks while a date is being typed and returns when it is
        // complete, which is the input's own behaviour rather than something
        // worth papering over with a debounce.
        if (value === "") {
            draft.valid_until_ms = undefined;
            return;
        }
        draft.valid_until_ms = new Date(value).getTime();
    }

    function setNote(value: string) {
        // Empty means "no note". The core refuses a present-but-blank note, so
        // normalising here keeps a cleared textarea from becoming a refusal the
        // trader cannot act on.
        draft.note = value.trim() === "" ? undefined : value;
    }

    function toggleMethod(method: TriggerMethod, on: boolean) {
        const current = draft.trigger_methods ?? [];
        // A new array rather than a splice: the draft is shared state and the
        // old array may already have been read elsewhere this tick.
        draft.trigger_methods = on
            ? [...current.filter((m) => m !== method), method]
            : current.filter((m) => m !== method);
    }

    const noteLength = $derived(draft.note?.length ?? 0);
    const noteTooLong = $derived(noteLength > NOTE_MAX_CHARS);

    /**
     * The current lifecycle in one line, for the collapsed summary.
     *
     * The fields live behind a disclosure because this is a side panel of fixed
     * height: expanded, four controls squeeze the builder and the arm button off
     * screen, and the arm button is the one thing that must always be reachable.
     * The summary keeps the settings *readable* without expanding, which is what
     * "shown in the footer" is actually for.
     */
    const summary = $derived.by(() => {
        const parts = [
            $_(`dashboard.alerts.panel.lifecycle.frequencyOption.${draft.frequency ?? "once"}`),
        ];
        if (draft.valid_until_ms !== undefined) {
            parts.push(
                $_("dashboard.alerts.panel.lifecycle.summaryUntil", {
                    values: {
                        date: new Intl.DateTimeFormat(intlTag, {
                            dateStyle: "medium",
                            timeStyle: "short",
                        }).format(new Date(draft.valid_until_ms)),
                    },
                }),
            );
        }
        const methods = draft.trigger_methods ?? [];
        if (methods.length > 0) {
            parts.push(
                methods
                    .map((m) => $_(`dashboard.alerts.panel.lifecycle.methodOption.${m}`))
                    .join(", "),
            );
        }
        if (draft.note !== undefined) {
            parts.push($_("dashboard.alerts.panel.lifecycle.summaryNoted"));
        }
        return parts.join(" · ");
    });
</script>

<details class="lifecycle">
    <summary class="lifecycle-summary">
        <span class="summary-label">{$_("dashboard.alerts.panel.lifecycle.legend")}</span>
        <span class="summary-value">{summary}</span>
    </summary>

    <div class="row">
        <label class="field">
            <span class="field-label">{$_("dashboard.alerts.panel.lifecycle.frequency")}</span>
            <select
                class="field-input"
                value={draft.frequency ?? "once"}
                onchange={(e) => (draft.frequency = e.currentTarget.value as TriggerFrequency)}
            >
                {#each FREQUENCIES as frequency (frequency)}
                    <option value={frequency}>
                        {$_(`dashboard.alerts.panel.lifecycle.frequencyOption.${frequency}`)}
                    </option>
                {/each}
            </select>
        </label>

        <label class="field">
            <span class="field-label">{$_("dashboard.alerts.panel.lifecycle.validUntil")}</span>
            <input
                class="field-input"
                type="datetime-local"
                value={validUntilLocal}
                oninput={(e) => setValidUntil(e.currentTarget.value)}
            />
            <span class="field-hint">
                {$_("dashboard.alerts.panel.lifecycle.validUntilHint")}
            </span>
        </label>
    </div>

    <fieldset class="methods">
        <legend class="field-label">
            {$_("dashboard.alerts.panel.lifecycle.triggerMethod")}
        </legend>
        {#each METHODS as method (method)}
            <label class="method">
                <input
                    type="checkbox"
                    checked={(draft.trigger_methods ?? []).includes(method)}
                    onchange={(e) => toggleMethod(method, e.currentTarget.checked)}
                />
                <span>{$_(`dashboard.alerts.panel.lifecycle.methodOption.${method}`)}</span>
            </label>
        {/each}
        <p class="field-hint">
            {$_("dashboard.alerts.panel.lifecycle.triggerMethodHint")}
        </p>
    </fieldset>

    <label class="field">
        <span class="field-label">{$_("dashboard.alerts.panel.lifecycle.note")}</span>
        <textarea
            class="field-input note-input"
            rows="2"
            maxlength={NOTE_MAX_CHARS}
            value={draft.note ?? ""}
            placeholder={$_("dashboard.alerts.panel.lifecycle.notePlaceholder")}
            oninput={(e) => setNote(e.currentTarget.value)}
        ></textarea>
        <span class="field-hint" class:over={noteTooLong}>
            {noteLength} / {NOTE_MAX_CHARS}
        </span>
    </label>
</details>

<style>
    .lifecycle {
        display: flex;
        flex-direction: column;
        gap: var(--spacing-sm, 0.5rem);
    }

    .lifecycle-summary {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        align-items: baseline;
        cursor: pointer;
        font-size: var(--font-size-xs, 0.75rem);
    }

    .summary-label {
        color: var(--text-secondary);
    }

    .summary-value {
        color: var(--text-primary);
    }

    .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--spacing-sm, 0.5rem);
    }

    .field {
        display: flex;
        flex: 1 1 12rem;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
    }

    .field-label {
        color: var(--text-secondary);
        font-size: var(--font-size-xs, 0.75rem);
    }

    .field-input {
        width: 100%;
        padding: 0.35rem 0.5rem;
        border: 1px solid var(--border-color);
        border-radius: var(--radius-sm, 0.25rem);
        background: var(--bg-primary);
        color: var(--text-primary);
        font-size: var(--font-size-sm, 0.875rem);
    }

    .note-input {
        resize: vertical;
        font-family: inherit;
    }

    .field-hint {
        align-self: flex-end;
        color: var(--text-secondary);
        font-size: var(--font-size-xs, 0.75rem);
    }

    .field-hint.over {
        color: var(--danger-color);
    }

    .methods {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--spacing-sm, 0.5rem);
        margin: 0;
        padding: 0;
        border: 0;
    }

    .method {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        color: var(--text-primary);
        font-size: var(--font-size-sm, 0.875rem);
    }

    .methods .field-hint {
        flex-basis: 100%;
        align-self: flex-start;
    }
</style>
