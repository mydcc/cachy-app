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
    import { settingsState, type AiProvider } from "../../stores/settings.svelte";
    import {
        isLoopbackBaseUrl,
        type AiApiFlavor,
    } from "../../stores/settings/aiProviders";
    import { isOpenCodeUrl } from "../../lib/ai/opencodeTarget";
    import AiModelPicker from "./AiModelPicker.svelte";

    let {
        entryId,
        vendor,
        showApiKey = true,
        keyLabel = "",
        keyPlaceholder = "",
        baseUrlLabel = "",
        baseUrlPlaceholder = "",
        baseUrlHint = "",
        apiKeyUrl = "",
        apiKeyUrlLabel = "",
    }: {
        entryId: string;
        vendor: AiProvider;
        showApiKey?: boolean;
        keyLabel?: string;
        keyPlaceholder?: string;
        baseUrlLabel?: string;
        baseUrlPlaceholder?: string;
        baseUrlHint?: string;
        /** Key-creation page for the vendor; empty renders no link. */
        apiKeyUrl?: string;
        /** Translated label for the link. */
        apiKeyUrlLabel?: string;
    } = $props();

    let entry = $derived(
        settingsState.userProviders.find((candidate) => candidate.id === entryId),
    );
    let transport = $derived<"server" | "direct">(
        entry &&
        (isOpenCodeUrl(entry.baseUrl) ||
            (entry.allowServerRelay && !isLoopbackBaseUrl(entry.baseUrl)))
            ? "server"
            : "direct",
    );
    let flavor = $derived<AiApiFlavor>(entry?.flavor ?? "openai-chat");
    // The prop is derived from a static table today, but it ends up as an
    // anchor `href`, so only an http(s) value is ever rendered.
    let hasSafeKeyLink = $derived(/^https?:\/\//i.test(apiKeyUrl));
</script>

{#if entry}
    <div class="grid grid-cols-1 gap-4">
        {#if showApiKey}
            <div class="field-group">
                <div class="field-label-row">
                    <label for="{entryId}-key">{keyLabel}</label>
                    {#if hasSafeKeyLink}
                        <a
                            class="key-link"
                            href={apiKeyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            referrerpolicy="no-referrer"
                        >
                            {apiKeyUrlLabel}<span aria-hidden="true">↗</span>
                        </a>
                    {/if}
                </div>
                <input
                    id="{entryId}-key"
                    type="password"
                    bind:value={entry.apiKey}
                    class="input-field"
                    placeholder={keyPlaceholder}
                />
            </div>
        {:else if hasSafeKeyLink}
            <div class="field-group">
                <a
                    class="key-link"
                    href={apiKeyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    referrerpolicy="no-referrer"
                >
                    {apiKeyUrlLabel}<span aria-hidden="true">↗</span>
                </a>
            </div>
        {/if}
        <div class="field-group">
            <label for="{entryId}-base-url">{baseUrlLabel}</label>
            <input
                id="{entryId}-base-url"
                bind:value={entry.baseUrl}
                class="input-field"
                placeholder={baseUrlPlaceholder}
            />
            {#if baseUrlHint}
                <span class="text-[10px] text-[var(--text-secondary)]">
                    {baseUrlHint}
                </span>
            {/if}
        </div>
        <AiModelPicker
            provider={vendor}
            apiKey={entry.apiKey}
            baseUrl={entry.baseUrl}
            bind:model={entry.model}
            {flavor}
            {transport}
        />
    </div>
{/if}

<style>
    /* This card is rendered by the tab shell, whose scoped styles do not reach
       it. Without these rules the label and the input fall back to inline
       layout and the field renders too narrow to read. */
    .field-group {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .field-group label {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--text-secondary);
    }
    .field-label-row {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
    }
    .input-field {
        background-color: var(--bg-secondary);
        border: 1px solid var(--input-border-color);
        border-radius: var(--radius-lg);
        padding: var(--space-2) var(--space-3);
        font-size: var(--text-sm);
        color: var(--text-primary);
        outline: none;
    }
    .key-link {
        display: inline-flex;
        align-items: center;
        gap: 0.25rem;
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--accent-color);
        text-decoration: none;
        white-space: nowrap;
    }
    .key-link:hover {
        text-decoration: underline;
    }
</style>
