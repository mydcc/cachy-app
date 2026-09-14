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
  User-created AI provider management. Built-ins and user entries share the
  same `userProviders` registry; this lists the user entries while the fixed
  tabs cover the built-ins. Credentials bound here are Class A: the settings
  store encrypts them before they reach storage and redacts the serialized
  block, so binding directly to the live object is safe.
-->

<script lang="ts">
  import { _ } from "../../locales/i18n";
  import { settingsState } from "../../stores/settings.svelte";
  import {
    AI_API_FLAVORS,
    VENDOR_PRESETS,
    buildUserProvider,
    isBuiltinEntryId,
    isLoopbackBaseUrl,
    modelProviderForFlavor,
    providerFromPreset,
    type AiApiFlavor,
  } from "../../stores/settings/aiProviders";
  import type { TranslationKey } from "../../locales/schema";
  import AiModelPicker from "./AiModelPicker.svelte";

  const FLAVOR_LABEL_KEYS: Record<AiApiFlavor, TranslationKey> = {
    "openai-chat": "settings.ai.customProviders.flavorOpenaiChat",
    "openai-responses": "settings.ai.customProviders.flavorOpenaiResponses",
    "anthropic-messages": "settings.ai.customProviders.flavorAnthropicMessages",
    "google-generate": "settings.ai.customProviders.flavorGoogleGenerate",
  };

  let selectedPresetId = $state("");

  let customProviders = $derived(
    settingsState.userProviders.filter((entry) => !isBuiltinEntryId(entry.id)),
  );

  function addProvider() {
    const preset = VENDOR_PRESETS.find(
      (entry) => entry.id === selectedPresetId,
    );
    const provider = preset
      ? providerFromPreset(preset)
      : buildUserProvider(settingsState.userProviders);
    settingsState.userProviders = [...settingsState.userProviders, provider];
    settingsState.activeProviderId = provider.id;
    selectedPresetId = "";
  }

  function removeProvider(id: string) {
    if (isBuiltinEntryId(id)) return;
    settingsState.userProviders = settingsState.userProviders.filter(
      (provider) => provider.id !== id,
    );
    if (settingsState.activeProviderId === id) {
      settingsState.activeProviderId = "";
    }
  }

  function activate(id: string) {
    settingsState.activeProviderId = id;
  }
</script>

<section class="settings-section mt-6">
  <div class="flex items-center justify-between mb-2">
    <h3 class="section-title">
      {$_("settings.ai.customProviders.title")}
    </h3>
    <div class="flex items-center gap-2">
      <select
        bind:value={selectedPresetId}
        class="input-field"
        aria-label={$_("settings.ai.customProviders.add")}
      >
        <option value="">{$_("settings.ai.customProviders.presetBlank")}</option>
        {#each VENDOR_PRESETS as preset}
          <option value={preset.id}>{preset.label}</option>
        {/each}
      </select>
      <button
        type="button"
        class="add-btn shrink-0"
        onclick={addProvider}
        aria-label={$_("settings.ai.customProviders.add")}
      >
        + {$_("settings.ai.customProviders.add")}
      </button>
    </div>
  </div>
  <p class="text-[10px] text-[var(--text-secondary)] mb-3">
    {$_("settings.ai.customProviders.desc")}
  </p>

  {#if customProviders.length === 0}
    <p class="text-xs text-[var(--text-secondary)]">
      {$_("settings.ai.customProviders.empty")}
    </p>
  {:else}
    <div class="flex flex-col gap-3">
      {#each customProviders as provider (provider.id)}
        <div
          class="provider-card"
          class:active={settingsState.activeProviderId === provider.id}
        >
          <div class="card-header">
            <span class="font-bold text-sm">
              {provider.label || $_("settings.ai.customProviders.name")}
            </span>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="activate-btn"
                class:is-active={settingsState.activeProviderId === provider.id}
                disabled={settingsState.activeProviderId === provider.id}
                onclick={() => activate(provider.id)}
              >
                {settingsState.activeProviderId === provider.id
                  ? $_("settings.ai.customProviders.active")
                  : $_("settings.ai.customProviders.activate")}
              </button>
              <button
                type="button"
                class="delete-btn"
                onclick={() => removeProvider(provider.id)}
                aria-label={$_("settings.ai.customProviders.delete")}
              >
                ✕
              </button>
            </div>
          </div>

          <div class="card-body">
            <div class="field-group">
              <label for={`cp-name-${provider.id}`}
                >{$_("settings.ai.customProviders.name")}</label
              >
              <input
                id={`cp-name-${provider.id}`}
                bind:value={provider.label}
                class="input-field"
                placeholder={$_("settings.ai.customProviders.namePlaceholder")}
              />
            </div>

            <div class="field-group">
              <label for={`cp-flavor-${provider.id}`}
                >{$_("settings.ai.customProviders.flavor")}</label
              >
              <select
                id={`cp-flavor-${provider.id}`}
                bind:value={provider.flavor}
                class="input-field"
              >
                {#each AI_API_FLAVORS as flavor}
                  <option value={flavor}>{$_(FLAVOR_LABEL_KEYS[flavor])}</option>
                {/each}
              </select>
            </div>

            <div class="field-group">
              <label for={`cp-url-${provider.id}`}
                >{$_("settings.ai.customProviders.baseUrl")}</label
              >
              <input
                id={`cp-url-${provider.id}`}
                bind:value={provider.baseUrl}
                class="input-field"
                placeholder={$_("settings.ai.customProviders.baseUrlPlaceholder")}
              />
            </div>

            <div class="field-group">
              <label for={`cp-key-${provider.id}`}
                >{$_("settings.ai.customProviders.apiKey")}</label
              >
              <input
                id={`cp-key-${provider.id}`}
                type="password"
                bind:value={provider.apiKey}
                class="input-field"
                placeholder={$_("settings.ai.customProviders.apiKeyPlaceholder")}
              />
            </div>

            <AiModelPicker
              provider={modelProviderForFlavor(provider.flavor)}
              apiKey={provider.apiKey}
              baseUrl={provider.baseUrl}
              bind:model={provider.model}
              flavor={provider.flavor}
              transport={provider.allowServerRelay &&
              !isLoopbackBaseUrl(provider.baseUrl)
                ? "server"
                : "direct"}
            />

            <label class="relay-row">
              <input
                type="checkbox"
                bind:checked={provider.allowServerRelay}
                disabled={isLoopbackBaseUrl(provider.baseUrl)}
              />
              <span class="relay-label"
                >{$_("settings.ai.customProviders.relay")}</span
              >
            </label>
            <span class="text-[10px] text-[var(--text-secondary)]">
              {$_("settings.ai.customProviders.relayDesc")}
            </span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .section-title {
    font-size: var(--text-sm);
    font-weight: var(--font-bold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }
  .add-btn {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--accent-color);
    background: transparent;
    border: 1px solid var(--accent-color);
    border-radius: var(--radius-lg);
    padding: 0.25rem 0.6rem;
    cursor: pointer;
  }
  .add-btn:hover {
    color: var(--btn-accent-text);
    background: var(--accent-color);
  }
  .provider-card {
    background: var(--bg-tertiary);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    overflow: hidden;
  }
  .provider-card.active {
    border-color: var(--accent-color);
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
  }
  .card-body {
    padding: 1rem;
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
  .activate-btn {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--accent-color);
    background: transparent;
    border: 1px solid var(--accent-color);
    border-radius: var(--radius-sm);
    padding: 0.2rem 0.5rem;
    cursor: pointer;
  }
  .activate-btn.is-active {
    color: var(--accent-color);
    border-color: transparent;
    cursor: default;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .delete-btn {
    color: var(--danger-color);
    background: transparent;
    border: none;
    font-size: var(--text-sm);
    cursor: pointer;
    padding: 0.2rem;
  }
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
  .input-field {
    background-color: var(--bg-secondary);
    border: 1px solid var(--input-border-color);
    border-radius: var(--radius-lg);
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-sm);
    color: var(--text-primary);
    outline: none;
  }
  .relay-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
  }
  .relay-label {
    font-size: var(--text-xs);
    font-weight: var(--font-semibold);
    color: var(--text-secondary);
  }
</style>
