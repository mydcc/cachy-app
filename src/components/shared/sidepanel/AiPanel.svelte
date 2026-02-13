<script lang="ts">
  import { aiState } from "../../../stores/ai.svelte";
  import { settingsState } from "../../../stores/settings.svelte";
  import { tradeState } from "../../../stores/trade.svelte";
  import { _ } from "../../../locales/i18n";
  import { markdown } from "../../../actions/markdown";

  let inputEl: HTMLTextAreaElement | undefined = $state();
  let messagesContainer: HTMLDivElement | undefined = $state();
  let messageText = $state("");
  let isSending = $state(false);
  let errorMessage = $state("");
  let errorTimeout: ReturnType<typeof setTimeout> | undefined;

  let isTerminal = $derived(settingsState.chatStyle === "terminal");
  let isBubble = $derived(settingsState.chatStyle === "bubble");
  let isMinimal = $derived(settingsState.chatStyle === "minimal");
  let contextData = $derived(aiState.lastContext);

  // Scroll to bottom on new messages
  $effect(() => {
    if (messagesContainer) {
      // Access length to trigger effect
      const _len = aiState.messages.length;
      // Use requestAnimationFrame or timeout to ensure DOM update
      setTimeout(() => {
        if(messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 0);
    }
  });

  async function handleSend() {
    if (!messageText.trim()) return;

    isSending = true;
    errorMessage = "";

    try {
      await aiState.sendMessage(messageText);
      messageText = "";
      if (inputEl) {
        inputEl.style.height = "auto";
        inputEl.focus();
      }
    } catch (e: any) {
      errorMessage = e.message || "Error";
      if (errorTimeout) clearTimeout(errorTimeout);
      errorTimeout = setTimeout(() => (errorMessage = ""), 3000);
    } finally {
      isSending = false;
      if (inputEl) inputEl.focus();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.target instanceof HTMLTextAreaElement) {
      setTimeout(
        () => adjustTextareaHeight(e.target as HTMLTextAreaElement),
        0,
      );
    }
  }

  function adjustTextareaHeight(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }
</script>

<div class="flex flex-col h-full overflow-hidden">
    <!-- Messages Area -->
    <div
      bind:this={messagesContainer}
      class="flex-1 overflow-y-auto overflow-x-hidden p-4 flex flex-col gap-3 scroll-smooth"
      class:bg-black={isTerminal}
      class:bg-[var(--chat-messages-bg)]={!isTerminal}
    >
      {#each aiState.messages as msg (msg.id)}
        {@const isActionMsg =
          msg.role === "system" &&
          (msg.content.includes("[PENDING:") ||
            msg.content.includes("[✅") ||
            msg.content.includes("[❌"))}
        <div
          class="flex flex-col text-sm {msg.role === 'user'
            ? 'items-end'
            : 'items-start'} {isActionMsg ? 'my-1' : ''}"
        >
          <!-- Label for Terminal / Minimal Mode -->
          {#if !isBubble && !isActionMsg}
            <div
              class="mb-1 text-[10px] uppercase font-bold tracking-wider opacity-60"
            >
              {msg.role === "user" ? "You" : "AI"}
            </div>
          {/if}

          <div
            class="leading-relaxed transition-all relative group"
            style="font-size: {settingsState.chatFontSize || 13}px"
            class:text-green-400={isTerminal && msg.role === "user"}
            class:text-green-600={isTerminal &&
              msg.role === "assistant"}
            class:w-full={isTerminal}
            class:text-right={isTerminal && msg.role === "user"}
            class:text-[var(--accent-color)]={isMinimal &&
              msg.role === "user"}
            class:text-[var(--text-primary)]={isMinimal &&
              msg.role === "assistant"}
            class:max-w-[90%]={isMinimal && msg.role === "user"}
            class:max-w-[95%]={isMinimal && msg.role === "assistant"}
            class:text-left={isMinimal && msg.role === "assistant"}
            class:bg-gradient-to-br={isBubble && msg.role === "user"}
            class:from-indigo-600={isBubble && msg.role === "user"}
            class:to-blue-600={isBubble && msg.role === "user"}
            class:text-white={isBubble && msg.role === "user"}
            class:rounded-[1.2rem]={isBubble && !isActionMsg}
            class:rounded-tr-none={isBubble && msg.role === "user"}
            class:px-4={isBubble && !isActionMsg}
            class:py-2={isBubble && !isActionMsg}
            class:shadow-md={isBubble && msg.role === "user"}
            class:max-w-[85%]={isBubble}
            class:bg-[var(--chat-bubble-bg)]={isBubble &&
              msg.role === "assistant" &&
              !isActionMsg}
            class:rounded-tl-none={isBubble && msg.role === "assistant"}
            class:border={isBubble &&
              msg.role === "assistant" &&
              !isActionMsg}
            class:border-[var(--border-color)]={isBubble &&
              msg.role === "assistant" &&
              !isActionMsg}
            class:shadow-sm={isBubble &&
              msg.role === "assistant" &&
              !isActionMsg}
            class:overflow-x-hidden={isBubble}
            class:terminal-md={isTerminal}
          >
            {#if isActionMsg}
              <div
                class="text-[10px] bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded px-2 py-1 flex items-center gap-2 opacity-80"
              >
                <span>{msg.content}</span>
              </div>
            {:else if msg.role === "assistant"}
              <div
                class="markdown-content"
                use:markdown={msg.content}
              ></div>
            {:else}
              <div class="whitespace-pre-wrap">{msg.content}</div>
            {/if}
          </div>
        </div>
      {/each}

      {#if aiState.isStreaming}
        <div class="flex items-start">
          <div class="text-[var(--text-secondary)] text-xs animate-pulse">
            AI writing...
          </div>
        </div>
      {/if}
    </div>

    <!-- Input Area -->
    <div
      class="p-2 border-t shrink-0 transition-colors bg-[var(--bg-secondary)]"
      class:border-green-900={isTerminal}
      class:border-[var(--border-color)]={!isTerminal}
    >
      <!-- Context Status Bar -->
        <div
          class="flex items-center gap-3 px-1 mb-2 text-[10px] opacity-60 overflow-hidden"
        >
          <div
            class="flex items-center gap-1"
            title="Market Data Available"
            class:text-green-500={contextData?.cmc?.global ||
              contextData?.technicals}
          >
            <span>{contextData?.cmc?.global ? "🟢" : "⚪"}</span> Market
          </div>
          <div
            class="flex items-center gap-1"
            title="News Data Available"
            class:text-green-500={contextData?.news &&
              contextData.news.length > 0}
          >
            <span
              >{contextData?.news && contextData.news.length > 0
                ? "🟢"
                : "⚪"}</span
            > News
          </div>
        </div>

        <!-- Quick Actions -->
        {#if !messageText}
          <div class="flex gap-2 overflow-x-auto mb-2 pb-1 no-scrollbar">
            <button
              class="text-xs border border-[var(--accent-color)] rounded-full px-3 py-1 bg-[var(--accent-color)] text-[var(--text-on-accent)] hover:opacity-90 whitespace-nowrap transition-colors font-bold shadow-sm"
              onclick={() => {
                messageText =
                  "Analysiere den Markt für " +
                  (tradeState.symbol || "BTC");
                handleSend();
              }}
            >
              📊 Market Check
            </button>
            <button
              class="text-xs border border-[var(--accent-color)] rounded-full px-3 py-1 bg-[var(--accent-color)] text-[var(--text-on-accent)] hover:opacity-90 whitespace-nowrap transition-colors font-bold shadow-sm"
              onclick={() => {
                messageText =
                  "Erstelle eine technische Analyse für " +
                  (tradeState.symbol || "BTC");
                handleSend();
              }}
            >
              🧪 Tech Analysis
            </button>
            <button
              class="text-xs border border-[var(--accent-color)] rounded-full px-3 py-1 bg-[var(--accent-color)] text-[var(--text-on-accent)] hover:opacity-90 whitespace-nowrap transition-colors font-bold shadow-sm"
              onclick={() => {
                messageText = "Prüfe mein Setup auf Fehler und Risiken.";
                handleSend();
              }}
            >
              ⚠️ Risk Audit
            </button>
            <button
              class="text-xs border border-[var(--accent-color)] rounded-full px-3 py-1 bg-[var(--accent-color)] text-[var(--text-on-accent)] hover:opacity-90 whitespace-nowrap transition-colors font-bold shadow-sm"
              onclick={() => {
                messageText = "Gibt es wichtige News?";
                handleSend();
              }}
            >
              📰 News check
            </button>
          </div>
        {/if}

      {#if errorMessage}
        {@const isRateLimit =
          errorMessage.toLowerCase().includes("quota") ||
          errorMessage.includes("429")}
        <div
          class="text-xs mb-2 px-2 transition-colors"
          class:text-[var(--danger-color)]={!isRateLimit}
          class:animate-pulse={!isRateLimit}
          class:text-orange-400={isRateLimit}
          class:font-medium={isRateLimit}
        >
          {#if isRateLimit}
            <div class="flex items-center gap-1.5 opacity-90">
              <span>⚠️</span>
              <span
                >{$_("sidePanel.quotaExceeded") || "Generative AI Quota exceeded. Please try again later or check API settings."}</span
              >
            </div>
          {:else}
            {$_(errorMessage as any) || errorMessage || aiState.error}
          {/if}
        </div>
      {/if}
      <div class="relative w-full">
          <textarea
            bind:this={inputEl}
            rows="1"
            class="w-full bg-transparent border-none focus:ring-0 p-2 pr-10 resize-none flex items-center min-h-[40px] max-h-[200px]"
            style="font-size: {settingsState.chatFontSize || 13}px"
            class:bg-black={isTerminal}
            class:text-green-500={isTerminal}
            class:border-green-800={isTerminal}
            class:focus:border-green-500={isTerminal}
            class:font-mono={isTerminal}
            class:bg-[var(--bg-primary)]={!isTerminal}
            class:text-[var(--text-primary)]={!isTerminal}
            class:border-[var(--border-color)]={!isTerminal}
            class:rounded-xl={!isTerminal}
            class:focus:border-[var(--accent-color)]={!isTerminal}
            class:placeholder-[var(--text-tertiary)]={true}
            placeholder={isTerminal
                ? "> ENTER COMMAND"
                : $_("cloud.placeholder") ||
                  "Message AI... (Shift+Enter for new line)"}
            maxlength={2000}
            bind:value={messageText}
            onkeydown={handleKeydown}
            oninput={(e) =>
              adjustTextareaHeight(e.target as HTMLTextAreaElement)}
            disabled={isSending || aiState.isStreaming}
          ></textarea>

        {#if !isTerminal}
          <button
            class="absolute right-2 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--accent-color)] p-2"
            onclick={handleSend}
            disabled={!messageText.trim()}
            aria-label={$_("common.send") || "Send message"}
            title={$_("common.send") || "Send message"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              ><line x1="22" y1="2" x2="11" y2="13"></line><polygon
                points="22 2 15 22 11 13 2 9 22 2"
              ></polygon></svg
            >
          </button>
        {/if}
      </div>
    </div>
</div>

<style>
  }

  /* Markdown Styles - Theme Aware */
  .markdown-content :global(p) {
    margin-bottom: 0.75rem;
    line-height: 1.5;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }
  .markdown-content :global(strong) {
    font-weight: 700;
    color: inherit;
  }
  .markdown-content :global(code) {
    background: rgba(125, 125, 125, 0.1);
    padding: 0.1rem 0.3rem;
    border-radius: 0.2rem;
    font-family: monospace;
    font-size: 0.9em;
  }
  .markdown-content :global(pre) {
    background: rgba(0, 0, 0, 0.2);
    padding: 0.75rem;
    border-radius: 0.3rem;
    border: 1px solid rgba(125, 125, 125, 0.1);
    overflow-x: auto;
    margin-bottom: 1rem;
    margin-top: 0.5rem;
  }

  .markdown-content :global(small) {
    font-size: 0.8em;
    opacity: 0.6;
    display: block;
    margin-top: 0.5rem;
  }

  /* Terminal Overrides */
  .terminal-md :global(*) {
    color: #22c55e !important; /* Tailwind green-500 */
    font-family: monospace !important;
  }

  .no-scrollbar::-webkit-scrollbar {
    display: none;
  }
  .no-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
</style>
