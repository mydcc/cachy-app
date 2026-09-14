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
    }: {
        entryId: string;
        vendor: AiProvider;
        showApiKey?: boolean;
        keyLabel?: string;
        keyPlaceholder?: string;
        baseUrlLabel?: string;
        baseUrlPlaceholder?: string;
        baseUrlHint?: string;
    } = $props();

    let entry = $derived(
        settingsState.userProviders.find((candidate) => candidate.id === entryId),
    );
    let transport = $derived<"server" | "direct">(
        entry && entry.allowServerRelay && !isLoopbackBaseUrl(entry.baseUrl)
            ? "server"
            : "direct",
    );
    let flavor = $derived<AiApiFlavor>(entry?.flavor ?? "openai-chat");
</script>

{#if entry}
    <div class="grid grid-cols-1 gap-4">
        {#if showApiKey}
            <div class="field-group">
                <label for="{entryId}-key">{keyLabel}</label>
                <input
                    id="{entryId}-key"
                    type="password"
                    bind:value={entry.apiKey}
                    class="input-field"
                    placeholder={keyPlaceholder}
                />
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
