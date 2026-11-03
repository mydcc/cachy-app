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
  FEAT-0678 — the live explanation control in a lesson.

  Three rules shape this component, all of them ADR-0011 consequences:

  1. Nothing is sent until the button is pressed. No `$effect` here asks, so
     opening a lesson, switching tabs or changing symbol cannot become an
     unrequested egress.
  2. The recipient is named before the request exists. The provider label sits
     in the button; with no provider configured the button is disabled and the
     line points at Settings.
  3. Leaving discards. The answer is frozen with the symbol, timeframe and time
     it was read at, and is dropped when any of those change — a paragraph about
     another symbol must not read like a statement about this one.
-->

<script lang="ts">
    import { _, locale } from "../../locales/i18n";
    import type { TranslationKey } from "../../locales/schema";
    import { aiState } from "../../stores/ai.svelte";
    import { tradeState } from "../../stores/trade.svelte";
    import { createLiveExplanation } from "../../lib/academy/useLiveExplanation.svelte";
    import type { CatalogueEntry } from "../../lib/alerts/indicatorCatalogue";
    import type { LessonSeries } from "../../lib/academy/indicatorLessonSeries";
    import type { ParamValue, PriceField } from "../../lib/rules/types";

    interface Props {
        entry: CatalogueEntry;
        params: Readonly<Record<string, ParamValue>>;
        field: PriceField | undefined;
        timeframe: string;
        /** The series the chart drew; `null` until the chart has one. */
        series: LessonSeries | null;
    }

    let { entry, params, field, timeframe, series }: Props = $props();

    const live = createLiveExplanation();

    /** Reactive to Settings: the label must change when the provider does. */
    const provider = $derived(aiState.providerStatus());
    // `$locale` auto-subscribes to the store; `get(locale)` would read it once
    // at mount and freeze the lesson in its mount-time language.
    const currentLocale = $derived($locale === "de" ? "de" : "en");

    const canAsk = $derived(
        provider.ready && series !== null && live.status !== "streaming",
    );

    const headline = $derived(
        live.at
            ? $_(`academy.liveExplain.frozen` as TranslationKey, {
                  values: {
                      symbol: tradeState.symbol,
                      timeframe,
                      time: new Date(live.at).toLocaleTimeString(
                          currentLocale === "de" ? "de-DE" : "en-GB",
                      ),
                  },
              })
            : "",
    );

    function ask() {
        if (!series) return;
        void live.ask({
            entry,
            params,
            field,
            symbol: tradeState.symbol,
            timeframe,
            series,
            locale: currentLocale,
        });
    }

    /*
     * A plain variable, not `$state`: it only remembers the previous key, and
     * making it reactive would re-run the effect that writes it.
     */
    let lastKey = "";
    $effect(() => {
        const key = `${entry.id}|${timeframe}|${tradeState.symbol}`;
        if (lastKey !== "" && key !== lastKey) {
            live.reset();
        }
        lastKey = key;
    });

    // Leaving the lesson cancels a running request (FEAT-0678, decision 6).
    $effect(() => () => live.reset());
</script>

<section
    class="bg-[var(--bg-tertiary)] p-4 rounded-xl border border-[var(--border-color)] flex flex-col gap-3"
    aria-labelledby="lesson-live-explain-heading"
>
    <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="flex flex-col gap-1 min-w-0">
            <h3
                id="lesson-live-explain-heading"
                class="text-sm font-bold uppercase text-[var(--text-secondary)]"
            >
                {$_("academy.liveExplain.heading")}
            </h3>
            <p class="text-xs text-[var(--text-tertiary)] max-w-prose">
                {provider.ready
                    ? $_("academy.liveExplain.hint")
                    : $_("academy.liveExplain.noProvider")}
            </p>
        </div>

        <button
            type="button"
            class="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border-color)] transition-all
                   focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-color)]
                   {canAsk
                ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)] hover:opacity-90'
                : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] cursor-not-allowed'}"
            disabled={!canAsk}
            onclick={ask}
        >
            {provider.ready
                ? $_(`academy.liveExplain.ask`, {
                      values: { provider: provider.label },
                  })
                : $_("academy.liveExplain.askDisabled")}
        </button>
    </div>

    {#if live.status === "streaming" && live.text === ""}
        <p class="text-sm text-[var(--text-tertiary)]" aria-live="polite">
            {$_("academy.liveExplain.streaming")}
        </p>
    {/if}

    {#if live.text !== ""}
        <div class="flex flex-col gap-2">
            {#if live.status === "done" && headline}
                <p class="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">
                    {headline}
                </p>
            {/if}
            <p
                class="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-line"
                aria-live="polite"
            >
                {live.text}
            </p>
        </div>
    {/if}

    {#if live.status === "error" && live.error}
        <p class="text-sm text-[var(--danger-color)]" role="alert">
            {$_("academy.liveExplain.failed")}
            {live.error}
        </p>
    {/if}
</section>
