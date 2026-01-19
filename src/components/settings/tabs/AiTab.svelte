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
  import { settingsState } from "../../../stores/settings.svelte";
</script>

<div class="flex flex-col gap-4" role="tabpanel" id="tab-ai">
  <div
    class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-4"
  >
    <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">
      AI Provider Settings
    </h4>
    <div class="flex flex-col gap-1">
      <label for="ai-provider" class="text-sm font-medium"
        >Default Provider</label
      >
      <select
        id="ai-provider"
        name="aiProvider"
        bind:value={settingsState.aiProvider}
        class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
      >
        <option value="openai">OpenAI (ChatGPT)</option>
        <option value="gemini">Google Gemini</option>
        <option value="anthropic">Anthropic (Claude)</option>
      </select>
    </div>

    <!-- AI Actions Toggle -->
    <div class="flex items-center justify-between py-2">
      <div class="flex flex-col">
        <span class="text-xs font-bold">Ask before Actions</span>
        <span class="text-[10px] text-[var(--text-secondary)]"
          >If unchecked, AI can directly modify trade values.</span
        >
      </div>
      <input
        type="checkbox"
        bind:checked={settingsState.aiConfirmActions}
        class="toggle-checkbox"
      />
    </div>

    <!-- AI Clear Confirm Toggle -->
    <div
      class="flex items-center justify-between py-2 border-t border-[var(--border-color)]"
    >
      <div class="flex flex-col">
        <span class="text-xs font-bold">Confirm Clear History</span>
        <span class="text-[10px] text-[var(--text-secondary)]"
          >Show confirmation dialog before clearing AI chat.</span
        >
      </div>
      <input
        type="checkbox"
        bind:checked={settingsState.aiConfirmClear}
        class="toggle-checkbox"
      />
    </div>

    <!-- Custom System Prompt -->
    <div class="flex flex-col gap-1 py-2 border-t border-[var(--border-color)]">
      <span class="text-xs font-bold">Custom System Instructions (Prompt)</span>
      <span class="text-[10px] text-[var(--text-secondary)]">
        Append custom rules, persona, or constraints to the AI (e.g. "Be
        cynical", "Focus on Scalping").
      </span>
      <textarea
        bind:value={settingsState.customSystemPrompt}
        rows="3"
        class="input-field p-2 rounded text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] w-full resize-none"
        placeholder="e.g. You are a risk-averse mentor. Always scold me for high leverage."
      ></textarea>
    </div>

    <!-- Trade Context Limit -->
    <div
      class="flex items-center justify-between py-2 border-t border-[var(--border-color)]"
    >
      <div class="flex flex-col">
        <span class="text-xs font-bold">Trade History Context</span>
        <span class="text-[10px] text-[var(--text-secondary)]"
          >Number of past trades sent to AI (Context)</span
        >
      </div>
      <input
        type="number"
        min="5"
        max="500"
        step="5"
        bind:value={settingsState.aiTradeHistoryLimit}
        class="input-field p-1 px-2 rounded text-xs w-16 text-center bg-[var(--bg-secondary)] border border-[var(--border-color)]"
      />
    </div>

    <div class="flex flex-col gap-4 pt-4 border-t border-[var(--border-color)]">
      <div class="flex flex-col gap-2">
        <label
          for="openai-key"
          class="text-xs font-bold flex items-center gap-2"
        >
          <span>OpenAI</span>
          {#if settingsState.aiProvider === "openai"}<span
              class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"
            ></span>{/if}
        </label>
        <input
          id="openai-key"
          name="openaiKey"
          type="password"
          bind:value={settingsState.openaiApiKey}
          class="input-field p-1 px-2 rounded text-sm mb-1"
          placeholder="API Key (sk-...)"
        />
        <div class="flex items-center gap-2">
          <label
            for="openai-model"
            class="text-[10px] text-[var(--text-secondary)] w-12">Model:</label
          >
          <input
            id="openai-model"
            name="openaiModel"
            type="text"
            bind:value={settingsState.openaiModel}
            class="input-field p-1 px-2 rounded text-xs flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)]"
            placeholder="gpt-4o"
          />
        </div>
      </div>
      <div
        class="flex flex-col gap-2 border-t border-[var(--border-color)] pt-3"
      >
        <label
          for="gemini-key"
          class="text-xs font-bold flex items-center gap-2"
        >
          <span>Google Gemini</span>
          {#if settingsState.aiProvider === "gemini"}<span
              class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"
            ></span>{/if}
        </label>
        <input
          id="gemini-key"
          name="geminiKey"
          type="password"
          bind:value={settingsState.geminiApiKey}
          class="input-field p-1 px-2 rounded text-sm mb-1"
          placeholder="API Key (AIza...)"
        />
        <div class="flex flex-col gap-1.5">
          <span class="text-[10px] text-[var(--text-secondary)]">Modell:</span>
          <select
            bind:value={settingsState.geminiModel}
            class="input-field p-1.5 px-2 rounded text-xs bg-[var(--bg-secondary)] border border-[var(--border-color)] w-full"
          >
            <option value="gemini-3-flash-preview"
              >Gemini 3 Flash (Vorschau 🚀)</option
            >
            <option value="gemini-3-pro-preview"
              >Gemini 3 Pro (Vorschau 🧠)</option
            >
            <option value="gemini-2.5-flash"
              >Gemini 2.5 Flash (Empfohlen ⭐)</option
            >
            <option value="gemini-2.0-flash">Gemini 2.0 Flash (Stabil)</option>
            <option value="gemma-3-27b-it">Gemma 3 27b (Open Model ✨)</option>
          </select>
        </div>
        <p class="text-[10px] text-[var(--text-secondary)] italic">
          Tipp: 'Gemini 2.5 Flash' ist ideal für den Alltag. 'Gemma 3' bietet
          hohe Ratenlimits (14.4k/Tag). Gemini 3 für maximale Intelligenz.
        </p>
      </div>
      <div
        class="flex flex-col gap-2 border-t border-[var(--border-color)] pt-3"
      >
        <label
          for="anthropic-key"
          class="text-xs font-bold flex items-center gap-2"
        >
          <span>Anthropic</span>
          {#if settingsState.aiProvider === "anthropic"}<span
              class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"
            ></span>{/if}
        </label>
        <input
          id="anthropic-key"
          name="anthropicKey"
          type="password"
          bind:value={settingsState.anthropicApiKey}
          class="input-field p-1 px-2 rounded text-sm mb-1"
          placeholder="API Key (sk-ant-...)"
        />
        <div class="flex items-center gap-2">
          <label
            for="anthropic-model"
            class="text-[10px] text-[var(--text-secondary)] w-12">Model:</label
          >
          <input
            id="anthropic-model"
            name="anthropicModel"
            type="text"
            bind:value={settingsState.anthropicModel}
            class="input-field p-1 px-2 rounded text-xs flex-1 bg-[var(--bg-secondary)] border border-[var(--border-color)]"
            placeholder="claude-3-5-sonnet-20240620"
          />
        </div>
      </div>
    </div>
    <p
      class="text-[10px] text-[var(--text-secondary)] mt-2 italic border-t border-[var(--border-color)] pt-2"
    >
      Your API keys are stored locally in your browser and are never saved to
      our servers. They are only used to communicate directly with the AI
      providers.
    </p>
  </div>

  <div
    class="p-4 border border-[var(--border-color)] rounded bg-[var(--bg-secondary)] flex flex-col gap-4"
  >
    <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">
      External Context
    </h4>

    <!-- CMC Context Toggle -->
    <div class="flex items-center justify-between py-2">
      <div class="flex flex-col">
        <span class="text-xs font-bold">CoinMarketCap Smart Context</span>
        <span class="text-[10px] text-[var(--text-secondary)]"
          >Fetch global metrics and coin metadata for AI.</span
        >
      </div>
      <input
        type="checkbox"
        bind:checked={settingsState.enableCmcContext}
        class="toggle-checkbox"
      />
    </div>

    <!-- CMC API Key -->
    {#if settingsState.enableCmcContext}
      <div class="flex flex-col gap-2">
        <label
          for="cmc-key"
          class="text-xs font-bold flex items-center gap-2"
        >
          <span>CMC API Key</span>
        </label>
        <input
          id="cmc-key"
          name="cmcKey"
          type="password"
          bind:value={settingsState.cmcApiKey}
          class="input-field p-1 px-2 rounded text-sm mb-1"
          placeholder="CoinMarketCap API Key..."
        />
        <span class="text-[10px] text-[var(--text-secondary)]"
          >Required for sector analysis and global metrics.</span
        >
      </div>
    {/if}
  </div>
</div>
