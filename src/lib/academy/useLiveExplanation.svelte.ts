/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

/*
 * FEAT-0678 — the state of one live explanation.
 *
 * Kept out of `aiState` on purpose: the assistant's `messages`, `error` and
 * `isStreaming` are its transcript, and a lesson is not a chat turn. The state
 * lives as long as the control does, which is what "leaving the lesson discards
 * the answer" means in code.
 *
 * Cancellation is a first-class outcome: a request aborted because the reader
 * moved on must not surface as a failure. That is why `ask` returns silently on
 * an abort instead of writing `error`.
 */

import { aiState } from "../../stores/ai.svelte";
import type { CatalogueEntry } from "../alerts/indicatorCatalogue";
import { isAbortError } from "../ai/completion";
import type { LessonSeries } from "./indicatorLessonSeries";
import {
    buildExplanationContext,
    buildExplanationMessages,
    type ExplanationLocale,
} from "./liveExplanation";
import type { ParamValue, PriceField } from "../rules/types";

export type ExplanationStatus = "idle" | "streaming" | "done" | "error";

export interface ExplanationRequest {
    entry: CatalogueEntry;
    params: Readonly<Record<string, ParamValue>>;
    field: PriceField | undefined;
    symbol: string;
    timeframe: string;
    series: LessonSeries;
    locale: ExplanationLocale;
}

export class LiveExplanationState {
    status = $state<ExplanationStatus>("idle");
    /** The answer so far. Written once per streamed delta. */
    text = $state("");
    /** Set only for a real failure; an abort never reaches here. */
    error = $state<string | null>(null);
    /** The instant the values were read, for the frozen header. */
    at = $state<string | null>(null);

    #controller: AbortController | null = null;

    /**
     * Ask once. A second press while an answer streams is ignored rather than
     * queued — two answers to the same lesson help nobody.
     */
    async ask(request: ExplanationRequest): Promise<void> {
        if (this.status === "streaming") return;

        this.#controller?.abort();
        const controller = new AbortController();
        this.#controller = controller;

        try {
            // The build sits inside the try: a throw here must become an error
            // state, not leave the control frozen at "streaming" with no way
            // back. JS is single-threaded, so the mutations below cannot be
            // observed between the abort and themselves.
            const context = buildExplanationContext({
                entry: request.entry,
                params: request.params,
                field: request.field,
                symbol: request.symbol,
                timeframe: request.timeframe,
                series: request.series,
                generatedAt: new Date().toISOString(),
            });
            this.at = context.generatedAt;

            this.status = "streaming";
            this.text = "";
            this.error = null;

            await aiState.askOnce(
                buildExplanationMessages(context, request.locale),
                {
                    signal: controller.signal,
                    onDelta: (content) => {
                        this.text = content;
                    },
                },
            );
            if (controller.signal.aborted) return;
            this.status = "done";
        } catch (error) {
            if (isAbortError(error) || controller.signal.aborted) {
                // A cancellation is not a failure, and no half sentence is left
                // behind. Guarded on this request still being the current one,
                // so a late abort cannot wipe the answer that replaced it.
                if (this.#controller === controller) {
                    this.status = "idle";
                    this.text = "";
                }
                return;
            }
            this.status = "error";
            this.error = error instanceof Error ? error.message : String(error);
        } finally {
            if (this.#controller === controller) {
                this.#controller = null;
            }
        }
    }

    /** Cancel a running request and return to the untouched state. */
    reset(): void {
        this.#controller?.abort();
        this.#controller = null;
        this.status = "idle";
        this.text = "";
        this.error = null;
        this.at = null;
    }
}

export function createLiveExplanation(): LiveExplanationState {
    return new LiveExplanationState();
}
