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
  import { _ } from "../../locales/i18n";
  import { getModels, type AiModelInfo } from "../../services/aiModelsService";
  import type { AiProvider } from "../../stores/settings.svelte";

  interface Props {
    provider: AiProvider;
    apiKey?: string;
    baseUrl?: string;
    model: string;
  }

  let {
    provider,
    apiKey = "",
    baseUrl = "",
    model = $bindable(""),
  }: Props = $props();

  let models = $state<AiModelInfo[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let testedOk = $state<boolean | null>(null);

  // Bumped on every (re)load so a stale response from a superseded request
  // (e.g. the user switched provider or edited the key mid-flight) never
  // overwrites newer state.
  let generation = 0;

  function runLoad(forceRefresh: boolean) {
    const gen = ++generation;
    loading = true;
    error = null;
    getModels(provider, { apiKey, baseUrl }, { forceRefresh })
      .then((result) => {
        if (gen !== generation) return;
        models = result.models;
        if (forceRefresh || result.models.length > 0) testedOk = true;
      })
      .catch((e) => {
        if (gen !== generation) return;
        error = e instanceof Error ? e.message : String(e);
        testedOk = false;
      })
      .finally(() => {
        if (gen === generation) loading = false;
      });
  }

  $effect(() => {
    // Track provider + credential so switching either re-fetches (from
    // cache first) automatically. Debounced so typing an API key character
    // by character doesn't fire a request per keystroke — only once input
    // settles.
    void provider;
    void apiKey;
    void baseUrl;
    const timer = setTimeout(() => runLoad(false), 600);
    return () => clearTimeout(timer);
  });

  const selectedKnown = $derived(models.length === 0 || models.some((m) => m.id === model));

  function formatModelLabel(m: AiModelInfo): string {
    let label = m.label;
    if (m.contextWindow) label += ` · ${Math.round(m.contextWindow / 1000)}K`;
    if (m.inputPrice !== undefined) label += ` · $${m.inputPrice.toFixed(2)}/1M`;
    if (m.deprecated) label += ` · ${$_("settings.ai.model.deprecated")}`;
    return label;
  }
</script>

<div class="field-group">
  <div class="flex items-center justify-between">
    <label for="ai-model-select-{provider}">{$_("settings.ai.model.label")}</label>
    <button
      type="button"
      class="text-[10px] font-semibold text-[var(--accent-color)] hover:underline disabled:opacity-50 disabled:no-underline"
      onclick={() => runLoad(true)}
      disabled={loading}
    >
      {loading ? $_("settings.ai.model.testing") : $_("settings.ai.model.refresh")}
    </button>
  </div>

  {#if models.length > 0}
    <select id="ai-model-select-{provider}" bind:value={model} class="input-field">
      {#if !selectedKnown && model}
        <option value={model}>{model} ({$_("settings.ai.model.custom")})</option>
      {/if}
      {#each models as m (m.id)}
        <option value={m.id}>{formatModelLabel(m)}</option>
      {/each}
    </select>
  {:else}
    <input
      id="ai-model-select-{provider}"
      bind:value={model}
      class="input-field"
      placeholder={$_("settings.ai.model.placeholder")}
    />
  {/if}

  {#if error}
    <p class="text-[10px] text-[var(--danger-color)]">⚠️ {error}</p>
  {:else if testedOk && !loading}
    <p class="text-[10px] text-[var(--success-color)]">✅ {$_("settings.ai.model.connectionOk")}</p>
  {/if}

  {#if !selectedKnown && model && models.length > 0 && !error}
    <p class="text-[10px] text-[var(--warning-color)]">
      ⚠️ {$_("settings.ai.model.notInList")}
    </p>
  {/if}
</div>
