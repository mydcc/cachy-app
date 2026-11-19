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
  FEAT-0811 — the firing section of the bot editor.

  How often the bot may enter, what it may spend doing so, and when the
  entry releases: every field FEAT-0822 put on the document and the entry
  timing FEAT-0823 added. The section never validates and never writes —
  the host owns the draft and the save — but every control is labelled and
  keyboard-reachable, the safe default is stated rather than implied, and
  the confirmation option carries its own trade-off ("enters one candle
  later"), the sentence FEAT-0823's spec deferred to exactly this editor.
-->

<script lang="ts">
    import { untrack } from "svelte";
    import { _ } from "../../../locales/i18n";
    import type { TranslationKey } from "../../../locales/schema";
    import type { EntryTriggerMode, FiringPolicy } from "../../../lib/rules/types";
    import type { BotFiringState } from "./botEditorTypes";

    let {
        initial,
        anchor,
        /** The host's save-time refusal anchor, wired into the matching input. */
        refusalField,
        refusalDescribedBy,
        onchange,
    }: {
        initial: BotFiringState;
        anchor: string;
        refusalField: string | null;
        refusalDescribedBy: string | undefined;
        onchange: (state: BotFiringState) => void;
    } = $props();

    // The snapshot discipline the other sections use: typed state is the
    // trader's, pushed up on every change, never re-read from the host. The
    // selects hold "" for "absent" — an option value Svelte can round-trip —
    // and publish maps it back to the undefined the document means.
    let policy = $state<FiringPolicy | "">(
        untrack(() => initial.policy ?? ""),
    );
    let maxPositions = $state(untrack(() => initial.maxPositions));
    let maxEntriesPerDay = $state(untrack(() => initial.maxEntriesPerDay));
    let maxRiskPerPosition = $state(untrack(() => initial.maxRiskPerPosition));
    let budgetCap = $state(untrack(() => initial.budgetCap));
    let entryTrigger = $state<EntryTriggerMode | "">(
        untrack(() => initial.entryTrigger ?? ""),
    );

    function publish(): void {
        onchange({
            policy: policy === "" ? undefined : policy,
            maxPositions,
            maxEntriesPerDay,
            maxRiskPerPosition,
            budgetCap,
            entryTrigger: entryTrigger === "" ? undefined : entryTrigger,
        });
    }

    /** The read-back (AC 4): what the trader chose, said back in one line.
     * Composed from the same labels the controls carry, so the choice and
     * its echo are one vocabulary, never two. */
    const readback = $derived.by(() => {
        const parts: string[] = [];
        parts.push(
            $_(
                policy === "once"
                    ? "settings.automation.editor.policyOnce"
                    : policy === "multi"
                      ? "settings.automation.editor.policyMulti"
                      : "settings.automation.editor.policyOncePerCandle",
            ),
        );
        if (maxPositions.trim() !== "") {
            parts.push(
                $_("settings.automation.editor.readbackPositions", {
                    values: { count: maxPositions.trim() },
                }),
            );
        }
        if (maxEntriesPerDay.trim() !== "") {
            parts.push(
                $_("settings.automation.editor.readbackEntriesDay", {
                    values: { count: maxEntriesPerDay.trim() },
                }),
            );
        }
        if (maxRiskPerPosition.trim() !== "") {
            parts.push(
                $_("settings.automation.editor.readbackRisk", {
                    values: { amount: maxRiskPerPosition.trim() },
                }),
            );
        }
        if (budgetCap.trim() !== "") {
            parts.push(
                $_("settings.automation.editor.readbackBudget", {
                    values: { amount: budgetCap.trim() },
                }),
            );
        }
        parts.push(
            $_(
                entryTrigger === "confirmation"
                    ? "settings.automation.editor.triggerConfirmation"
                    : "settings.automation.editor.triggerImmediate",
            ),
        );
        return parts.join(" · ");
    });

    const limitFields = [
        {
            key: "maxPositions",
            label: "settings.automation.editor.maxPositions",
            value: () => maxPositions,
            set: (v: string) => (maxPositions = v),
        },
        {
            key: "maxEntriesPerDay",
            label: "settings.automation.editor.maxEntriesPerDay",
            value: () => maxEntriesPerDay,
            set: (v: string) => (maxEntriesPerDay = v),
        },
        {
            key: "maxRiskPerPosition",
            label: "settings.automation.editor.maxRiskPerPosition",
            value: () => maxRiskPerPosition,
            set: (v: string) => (maxRiskPerPosition = v),
        },
        {
            key: "budgetCap",
            label: "settings.automation.editor.budgetCap",
            value: () => budgetCap,
            set: (v: string) => (budgetCap = v),
        },
    ] as const;
</script>

<section class="flex flex-col gap-2">
    <h4 class="text-sm font-semibold text-[var(--text-primary)]">
        {$_("settings.automation.editor.firingTitle")}
    </h4>

    <div class="flex flex-wrap items-start gap-3">
        <label class="flex flex-col gap-1 text-xs" for={`${anchor}-firing-policy`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.editor.firingPolicy")}
            </span>
            <select
                id={`${anchor}-firing-policy`}
                value={policy}
                onchange={(e) => {
                    policy = e.currentTarget.value as FiringPolicy | "";
                    publish();
                }}
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            >
                <option value="">
                    {$_("settings.automation.editor.policyOncePerCandle")}
                </option>
                <option value="once">{$_("settings.automation.editor.policyOnce")}</option>
                <option value="multi">{$_("settings.automation.editor.policyMulti")}</option>
            </select>
        </label>

        {#each limitFields as field (field.key)}
            <label class="flex flex-col gap-1 text-xs" for={`${anchor}-${field.key}`}>
                <span class="text-[var(--text-secondary)]">
                    {$_(field.label)}
                </span>
                <input
                    id={`${anchor}-${field.key}`}
                    type="text"
                    inputmode="decimal"
                    value={field.value()}
                    oninput={(e) => {
                        field.set(e.currentTarget.value);
                        publish();
                    }}
                    aria-invalid={refusalField === `${anchor}-${field.key}` ? "true" : "false"}
                    aria-describedby={refusalField === `${anchor}-${field.key}`
                        ? refusalDescribedBy
                        : undefined}
                    class="w-28 rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
                    class:border-[var(--danger-color)]={refusalField === `${anchor}-${field.key}`}
                />
            </label>
        {/each}

        <label class="flex flex-col gap-1 text-xs" for={`${anchor}-entry-trigger`}>
            <span class="text-[var(--text-secondary)]">
                {$_("settings.automation.editor.entryTrigger")}
            </span>
            <select
                id={`${anchor}-entry-trigger`}
                value={entryTrigger}
                onchange={(e) => {
                    entryTrigger = e.currentTarget.value as EntryTriggerMode | "";
                    publish();
                }}
                class="rounded border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1.5 text-[var(--text-primary)]"
            >
                <option value="">
                    {$_("settings.automation.editor.triggerImmediate")}
                </option>
                <option value="confirmation">
                    {$_("settings.automation.editor.triggerConfirmation")}
                </option>
            </select>
        </label>
    </div>

    <p class="text-xs text-[var(--text-secondary)]">
        {$_("settings.automation.editor.firingHint")}
    </p>

    {#if entryTrigger === "confirmation"}
        <!-- FEAT-0823 AC 7's sentence, delivered by the only surface that
             could: the control that sets the mode states the trade-off. -->
        <p class="text-xs text-[var(--warning-color)]" data-testid="trigger-tradeoff">
            {$_("settings.automation.editor.triggerTradeoff")}
        </p>
    {/if}

    <p class="text-xs text-[var(--text-secondary)]" data-testid="firing-readback">
        {readback}
    </p>
</section>
