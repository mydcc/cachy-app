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
</script>

<div class="flex flex-col gap-4" role="tabpanel" id="tab-api">
  <div
    class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-2"
  >
    <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">
      {$_("settings.imgbbHeader")}
    </h4>
    <div class="flex flex-col gap-1">
      <label for="imgbb-key" class="text-xs">{$_("settings.imgbbApiKey")}</label
      >
      <input
        id="imgbb-key"
        name="imgbbApiKey"
        type="password"
        bind:value={settingsState.imgbbApiKey}
        class="input-field p-1 px-2 rounded text-sm"
        placeholder="Paste ImgBB Key"
        onblur={() =>
          (settingsState.imgbbApiKey = settingsState.imgbbApiKey.trim())}
      />
    </div>
    <div class="flex flex-col gap-1">
      <label for="imgbb-exp" class="text-xs"
        >{$_("settings.imgbbExpiration")}</label
      >
      <select
        id="imgbb-exp"
        name="imgbbExpiration"
        bind:value={settingsState.imgbbExpiration}
        class="input-field p-2.5 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]"
      >
        <option value={0}>{$_("settings.imgbbPermanent")}</option>
        <option value={600}>{$_("settings.imgbb10m")}</option>
        <option value={3600}>{$_("settings.imgbb1h")}</option>
        <option value={86400}>{$_("settings.imgbb1d")}</option>
        <option value={604800}>{$_("settings.imgbb1w")}</option>
        <option value={2592000}>{$_("settings.imgbb1m")}</option>
      </select>
    </div>
    <p class="text-xs text-[var(--text-secondary)]">
      {$_("settings.imgbbGetKey")}
      <a
        href="https://api.imgbb.com/"
        target="_blank"
        class="text-[var(--accent-color)] hover:underline">api.imgbb.com</a
      >.
    </p>
  </div>

  <!-- AI Provider Key Section (Dynamic) -->
  <div
    class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3"
  >
    <div class="flex items-center justify-between">
      <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">
        AI & Intelligence
      </h4>
      <span
        class="text-[10px] bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-1.5 py-0.5 rounded font-bold"
        >PRO</span
      >
    </div>

    {#if settingsState.aiProvider === "gemini"}
      <div class="flex flex-col gap-1">
        <label
          for="gemini-key"
          class="text-xs font-medium text-[var(--text-secondary)]"
        >
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
            class="btn-secondary-action flex items-center px-3 rounded text-xs whitespace-nowrap"
            title="Get Key">Get Key</a
          >
        </div>
      </div>
    {:else if settingsState.aiProvider === "openai"}
      <div class="flex flex-col gap-1">
        <label
          for="openai-key"
          class="text-xs font-medium text-[var(--text-secondary)]"
        >
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
            class="btn-secondary-action flex items-center px-3 rounded text-xs whitespace-nowrap"
            title="Get Key">Get Key</a
          >
        </div>
      </div>
    {:else if settingsState.aiProvider === "anthropic"}
      <div class="flex flex-col gap-1">
        <label
          for="anthropic-key"
          class="text-xs font-medium text-[var(--text-secondary)]"
        >
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
            class="btn-secondary-action flex items-center px-3 rounded text-xs whitespace-nowrap"
            title="Get Key">Get Key</a
          >
        </div>
      </div>
    {/if}
    <p class="text-[10px] text-[var(--text-tertiary)] italic">
      The selected AI provider ({settingsState.aiProvider}) is used for Chat,
      Journal Analysis and Trade Deep Dives.
    </p>
  </div>

  <!-- News Section -->
  <div
    class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-3"
  >
    <div class="flex items-center justify-between">
      <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">
        Market Sentiment & News
      </h4>
    </div>

    <label class="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        bind:checked={settingsState.enableNewsAnalysis}
        class="form-checkbox h-4 w-4 text-[var(--accent-color)] rounded border-[var(--border-color)] bg-[var(--bg-secondary)]"
      />
      <div>
        <span class="text-sm font-medium text-[var(--text-primary)]"
          >Enable Market Sentiment Analysis</span
        >
        <p class="text-[10px] text-[var(--text-tertiary)]">
          Adds a sentiment panel to Market Overview based on external news.
        </p>
      </div>
    </label>

    {#if settingsState.enableNewsAnalysis}
      <div
        class="flex flex-col gap-3 pl-3 border-l-2 border-[var(--border-color)] mt-1"
      >
        <div class="flex flex-col gap-1">
          <label
            for="cryptopanic-key"
            class="text-xs font-medium text-[var(--text-secondary)]"
          >
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
              title="Get Key">Get Key</a
            >
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label
            for="newsapi-key"
            class="text-xs font-medium text-[var(--text-secondary)]"
          >
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
              title="Get Key">Get Key</a
            >
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="flex flex-col gap-1">
    <label for="api-provider" class="text-sm font-medium"
      >{$_("settings.providerLabel")}</label
    >
    <select
      id="api-provider"
      name="apiProvider"
      bind:value={settingsState.apiProvider}
      class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
    >
      <option value="bitunix">Bitunix</option>
      <option value="binance">Binance Futures</option>
    </select>
  </div>
  {#if settingsState.apiProvider === "bitunix"}
    <div
      class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-2"
    >
      <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">
        Bitunix Credentials
      </h4>
      <div class="flex flex-col gap-1">
        <label for="bx-key" class="text-sm">API Key</label>
        <input
          id="bx-key"
          name="bitunixKey"
          type="password"
          bind:value={settingsState.apiKeys.bitunix.key}
          class="input-field p-1 px-2 rounded text-sm"
          placeholder="Paste Key"
          onblur={() =>
            (settingsState.apiKeys.bitunix.key =
              settingsState.apiKeys.bitunix.key.trim())}
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="bx-secret" class="text-sm">Secret Key</label>
        <input
          id="bx-secret"
          name="bitunixSecret"
          type="password"
          bind:value={settingsState.apiKeys.bitunix.secret}
          class="input-field p-1 px-2 rounded text-sm"
          placeholder="Paste Secret"
          onblur={() =>
            (settingsState.apiKeys.bitunix.secret =
              settingsState.apiKeys.bitunix.secret.trim())}
        />
      </div>
    </div>
  {:else}
    <div
      class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-2"
    >
      <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">
        Binance Credentials
      </h4>
      <div class="flex flex-col gap-1">
        <label for="bn-key" class="text-sm">API Key</label>
        <input
          id="bn-key"
          name="binanceKey"
          type="password"
          bind:value={settingsState.apiKeys.binance.key}
          class="input-field p-1 px-2 rounded text-sm"
          placeholder="Paste Key"
          onblur={() =>
            (settingsState.apiKeys.binance.key =
              settingsState.apiKeys.binance.key.trim())}
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="bn-secret" class="text-sm">Secret Key</label>
        <input
          id="bn-secret"
          name="binanceSecret"
          type="password"
          bind:value={settingsState.apiKeys.binance.secret}
          class="input-field p-1 px-2 rounded text-sm"
          placeholder="Paste Secret"
          onblur={() =>
            (settingsState.apiKeys.binance.secret =
              settingsState.apiKeys.binance.secret.trim())}
        />
      </div>
    </div>
  {/if}
  <p class="text-xs text-[var(--text-secondary)] italic">
    {$_("settings.securityNote")}
  </p>
</div>
