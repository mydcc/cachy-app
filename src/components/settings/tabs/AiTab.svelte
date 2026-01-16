<script lang="ts">
  import type { AiProvider } from "../../../stores/settingsStore";

  interface Props {
    aiProvider: AiProvider;
    openaiApiKey: string;
    openaiModel: string;
    geminiApiKey: string;
    geminiModel: string;
    anthropicApiKey: string;
    anthropicModel: string;
  }

  let {
    aiProvider = $bindable(),
    openaiApiKey = $bindable(),
    openaiModel = $bindable(),
    geminiApiKey = $bindable(),
    geminiModel = $bindable(),
    anthropicApiKey = $bindable(),
    anthropicModel = $bindable(),
  }: Props = $props();
</script>

<div class="flex flex-col gap-4" role="tabpanel" id="tab-ai">
  <div
    class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-4"
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
        bind:value={aiProvider}
        class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
      >
        <option value="openai">OpenAI (ChatGPT)</option>
        <option value="gemini">Google Gemini</option>
        <option value="anthropic">Anthropic (Claude)</option>
      </select>
    </div>
    <div class="flex flex-col gap-4 pt-4 border-t border-[var(--border-color)]">
      <div class="flex flex-col gap-2">
        <label
          for="openai-key"
          class="text-xs font-bold flex items-center gap-2"
        >
          <span>OpenAI</span>
          {#if aiProvider === "openai"}<span
              class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"
            ></span>{/if}
        </label>
        <input
          id="openai-key"
          name="openaiKey"
          type="password"
          bind:value={openaiApiKey}
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
            bind:value={openaiModel}
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
          {#if aiProvider === "gemini"}<span
              class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"
            ></span>{/if}
        </label>
        <input
          id="gemini-key"
          name="geminiKey"
          type="password"
          bind:value={geminiApiKey}
          class="input-field p-1 px-2 rounded text-sm mb-1"
          placeholder="API Key (AIza...)"
        />
        <div class="flex flex-col gap-1.5">
          <label class="text-[10px] text-[var(--text-secondary)]">Modell:</label
          >
          <div class="flex gap-3">
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="geminiModel"
                value="flash"
                bind:group={geminiModel}
                class="cursor-pointer"
              />
              <span class="text-xs">⚡ Flash (schnell, kostenlos)</span>
            </label>
            <label class="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="geminiModel"
                value="pro"
                bind:group={geminiModel}
                class="cursor-pointer"
              />
              <span class="text-xs">🚀 Pro (leistungsstark)</span>
            </label>
          </div>
        </div>
        <p class="text-[10px] text-[var(--text-secondary)] italic">
          Flash ist für die meisten Anfragen ausreichend. Pro bietet mehr
          Leistung bei komplexen Aufgaben.
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
          {#if aiProvider === "anthropic"}<span
              class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)]"
            ></span>{/if}
        </label>
        <input
          id="anthropic-key"
          name="anthropicKey"
          type="password"
          bind:value={anthropicApiKey}
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
            bind:value={anthropicModel}
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
</div>
