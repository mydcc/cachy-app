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
  import { _ } from "../../../locales/i18n";
  import { settingsState } from "../../../stores/settings.svelte";
  import { uiState } from "../../../stores/ui.svelte";
  import { locale, setLocale } from "../../../locales/i18n";

  interface Props {
    themes: Array<{ value: string; label: string }>;
  }

  let { themes }: Props = $props();

  const fonts = [
    { value: "Inter", label: "Inter" },
    { value: "IBM Plex Sans", label: "IBM Plex Sans" },
    { value: "JetBrains Mono", label: "JetBrains Mono" },
    { value: "Roboto Mono", label: "Roboto Mono" },
    { value: "Source Sans 3", label: "Source Sans 3" },
    { value: "Manrope", label: "Manrope" },
    { value: "Nunito Sans", label: "Nunito Sans" },
    { value: "Red Hat Display", label: "Red Hat Display" },
    { value: "Schibsted Grotesk", label: "Schibsted Grotesk" },
    { value: "Space Grotesk", label: "Space Grotesk" },
  ];
</script>

<div
  class="flex flex-col gap-4"
  role="tabpanel"
  id="tab-general"
  aria-labelledby="tab-general-label"
>
  <div class="grid grid-cols-2 gap-4">
    <div class="flex flex-col gap-1">
      <label
        for="settings-language"
        class="text-xs font-medium text-[var(--text-secondary)]"
        >{$_("settings.language")}</label
      >
      <select
        id="settings-language"
        name="language"
        value={$locale}
        onchange={(e) => setLocale(e.currentTarget.value)}
        class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm"
      >
        <option value="en">English</option>
        <option value="de">Deutsch</option>
      </select>
    </div>
    <div class="flex flex-col gap-1">
      <label
        for="settings-theme"
        class="text-xs font-medium text-[var(--text-secondary)]"
        >{$_("settings.theme")}</label
      >
      <select
        id="settings-theme"
        name="theme"
        value={uiState.currentTheme}
        onchange={(e) => uiState.setTheme(e.currentTarget.value)}
        class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm"
      >
        {#each themes as theme, index}
          <option
            value={theme.value}
            disabled={!settingsState.isPro && index >= 5}
            >{theme.label}
            {!settingsState.isPro && index >= 5 ? "(Pro)" : ""}</option
          >
        {/each}
      </select>
    </div>
    <div class="flex flex-col gap-1">
      <label
        for="settings-font"
        class="text-xs font-medium text-[var(--text-secondary)]"
        >{$_("settings.fontFamily")}</label
      >
      <select
        id="settings-font"
        name="fontFamily"
        bind:value={settingsState.fontFamily}
        class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm"
      >
        {#each fonts as font}
          <option value={font.value}>{font.label}</option>
        {/each}
      </select>
    </div>
  </div>

  {#if $locale === "de"}
    <label class="flex items-center gap-2 cursor-pointer mt-1">
      <input
        type="checkbox"
        bind:checked={settingsState.forceEnglishTechnicalTerms}
        class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded border-[var(--border-color)] bg-[var(--bg-secondary)]"
      />
      <span class="text-sm text-[var(--text-primary)]"
        >{$_("settings.forceEnglishTechnicalTerms")}</span
      >
    </label>
  {/if}

  <div class="flex flex-col gap-1 mt-2">
    <span class="text-sm font-medium">{$_("settings.feePreference")}</span>
    <div class="flex gap-2">
      <label
        class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
      >
        <input
          id="fee-maker"
          name="feePreference"
          type="radio"
          bind:group={settingsState.feePreference}
          value="maker"
          class="accent-[var(--accent-color)]"
        />
        <span class="text-sm">Maker</span>
      </label>
      <label
        class="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-[var(--bg-tertiary)] flex-1 border border-[var(--border-color)]"
      >
        <input
          id="fee-taker"
          name="feePreference"
          type="radio"
          bind:group={settingsState.feePreference}
          value="taker"
          class="accent-[var(--accent-color)]"
        />
        <span class="text-sm">Taker</span>
      </label>
    </div>
    <p class="text-xs text-[var(--text-secondary)]">
      {$_("settings.feePreferenceDesc")}
    </p>
  </div>

  <div class="h-px bg-[var(--border-color)] my-2"></div>

  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between">
       <span class="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">AI & External APIs</span>
    </div>

    <!-- AI Provider Key Section (Dynamic) -->
    {#if settingsState.aiProvider === "gemini"}
      <div class="flex flex-col gap-1">
        <label for="gemini-key" class="text-xs font-medium text-[var(--text-secondary)]">
          Google Gemini API Key
        </label>
        <div class="flex gap-2">
            <input
              id="gemini-key"
              type="password"
              class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm flex-1"
              placeholder="Enter Gemini API key"
              bind:value={settingsState.geminiApiKey}
            />
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-secondary-action flex items-center px-3 rounded text-xs"
              title="Get Key"
            >Get Key</a>
        </div>
      </div>
    {:else if settingsState.aiProvider === "openai"}
       <div class="flex flex-col gap-1">
        <label for="openai-key" class="text-xs font-medium text-[var(--text-secondary)]">
          OpenAI API Key
        </label>
        <div class="flex gap-2">
            <input
              id="openai-key"
              type="password"
              class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm flex-1"
              placeholder="Enter OpenAI API key"
              bind:value={settingsState.openaiApiKey}
            />
             <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-secondary-action flex items-center px-3 rounded text-xs"
              title="Get Key"
            >Get Key</a>
        </div>
      </div>
    {:else if settingsState.aiProvider === "anthropic"}
       <div class="flex flex-col gap-1">
        <label for="anthropic-key" class="text-xs font-medium text-[var(--text-secondary)]">
          Anthropic API Key
        </label>
        <div class="flex gap-2">
            <input
              id="anthropic-key"
              type="password"
              class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm flex-1"
              placeholder="Enter Anthropic API key"
              bind:value={settingsState.anthropicApiKey}
            />
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              class="btn-secondary-action flex items-center px-3 rounded text-xs"
              title="Get Key"
            >Get Key</a>
        </div>
      </div>
    {/if}

    <div class="h-px bg-[var(--border-color)] my-1 opacity-50"></div>

    <!-- News Toggle -->
    <label class="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        bind:checked={settingsState.enableNewsAnalysis}
        class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded border-[var(--border-color)] bg-[var(--bg-secondary)]"
      />
      <div>
        <span class="text-sm font-medium text-[var(--text-primary)]">Enable Market Sentiment Analysis</span>
        <p class="text-xs text-[var(--text-tertiary)]">Requires external news API keys. Adds a sentiment panel to Market Overview.</p>
      </div>
    </label>

    <!-- Conditional News Inputs -->
    {#if settingsState.enableNewsAnalysis}
      <div class="flex flex-col gap-3 pl-4 border-l-2 border-[var(--border-color)]">

        <div class="flex flex-col gap-1">
          <label for="cryptopanic-key" class="text-xs font-medium text-[var(--text-secondary)]">
            CryptoPanic API Key (Recommended)
          </label>
          <div class="flex gap-2">
              <input
                id="cryptopanic-key"
                type="password"
                class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm flex-1"
                placeholder="Optional: Enter key"
                bind:value={settingsState.cryptoPanicApiKey}
              />
               <a
                href="https://cryptopanic.com/developers/api/"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-secondary-action flex items-center px-3 rounded text-xs whitespace-nowrap"
                title="Get Key"
              >Get Key</a>
          </div>
          <!-- Endpoint Config for CryptoPanic -->
          <div class="mt-1">
             <label for="cryptopanic-url" class="text-[10px] text-[var(--text-tertiary)] flex items-center gap-1 cursor-pointer">
                <span>Advanced: Custom API Endpoint</span>
             </label>
             <input
                id="cryptopanic-url"
                type="text"
                class="input-field p-1.5 rounded border border-[var(--border-color)] bg-[var(--bg-tertiary)] text-xs w-full mt-1"
                placeholder="https://cryptopanic.com/api/v1/posts/"
                bind:value={settingsState.cryptoPanicBaseUrl}
             />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label for="newsapi-key" class="text-xs font-medium text-[var(--text-secondary)]">
            NewsAPI.org Key (Backup)
          </label>
          <div class="flex gap-2">
              <input
                id="newsapi-key"
                type="password"
                class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)] text-sm flex-1"
                placeholder="Optional: Enter key"
                bind:value={settingsState.newsApiKey}
              />
              <a
                href="https://newsapi.org/register"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-secondary-action flex items-center px-3 rounded text-xs whitespace-nowrap"
                title="Get Key"
              >Get Key</a>
          </div>
        </div>

      </div>
    {/if}
  </div>
</div>
