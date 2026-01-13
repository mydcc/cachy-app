<script lang="ts">
  import { onMount, afterUpdate } from "svelte";
  import { fly } from "svelte/transition";
  import { chatStore } from "../../stores/chatStore";
  import { aiStore } from "../../stores/aiStore";
  import { settingsStore } from "../../stores/settingsStore";
  import { _ } from "../../locales/i18n";
  import { icons } from "../../lib/constants";
  import { marked } from "marked";

  let isOpen = false;
  let inputEl: HTMLInputElement;
  let messagesContainer: HTMLDivElement;
  let messageText = "";
  let isSending = false;
  let errorMessage = "";

  // Scroll to bottom on new messages
  afterUpdate(() => {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  });

  onMount(() => {
    chatStore.init();
  });

  async function handleSend() {
    if (!messageText.trim()) return;

    isSending = true;
    errorMessage = "";
    const mode = $settingsStore.sidePanelMode;

    try {
      if (mode === "ai") {
        await aiStore.sendMessage(messageText);
      } else {
        await chatStore.sendMessage(messageText);
      }
      messageText = "";
    } catch (e: any) {
      errorMessage = e.message || "Error";
      setTimeout(() => (errorMessage = ""), 3000);
    } finally {
      isSending = false;
      // Refocus input
      if (inputEl) inputEl.focus();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      // Allow shift+enter for new lines if textarea (future)
      e.preventDefault();
      handleSend();
    }
  }

  function toggle() {
    isOpen = !isOpen;
  }

  function getPanelTitle(mode: string) {
    if (mode === "chat") return "Global Chat";
    if (mode === "notes") return "My Notes";
    if (mode === "ai") return "AI Assistant";
    return "Side Panel";
  }

  function renderMarkdown(text: string) {
    try {
      return marked(text);
    } catch (e) {
      return text;
    }
  }

  // Reactive layout variables
  $: isFloating = $settingsStore.sidePanelLayout === "floating";
  $: isStandard =
    $settingsStore.sidePanelLayout === "standard" ||
    !$settingsStore.sidePanelLayout;
  $: isTransparent = $settingsStore.sidePanelLayout === "transparent";

  const transitionParams = { x: 300, duration: 300 };
</script>

{#if $settingsStore.enableSidePanel}
  <div
    class="fixed z-[60] flex transition-all duration-300 pointer-events-none"
    class:left-0={!isFloating}
    class:top-0={!isFloating}
    class:h-full={!isFloating}
    class:bottom-4={isFloating}
    class:left-4={isFloating}
    class:items-end={isFloating}
    class:flex-col-reverse={isFloating}
  >
    <!-- Toggle Strip (Visible when collapsed) -->
    <div
      role="button"
      tabindex="0"
      class="h-full w-10 bg-[var(--bg-tertiary)] border-r border-[var(--border-color)] flex flex-col items-center py-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors pointer-events-auto outline-none focus:bg-[var(--bg-secondary)]"
      on:click={toggle}
      on:keydown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}
      title={getPanelTitle($settingsStore.sidePanelMode)}
    >
      <div class="mb-4 text-[var(--text-primary)]">
        {#if $settingsStore.sidePanelMode === "chat"}
          {@html icons.messageSquare ||
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'}
        {:else if $settingsStore.sidePanelMode === "ai"}
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
            />
            <path
              d="M12 16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z"
            />
            <path
              d="M2 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"
            />
            <path
              d="M16 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"
            />
            <circle cx="12" cy="12" r="3" />
          </svg>
        {:else}
          {@html icons.edit ||
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'}
        {/if}
      </div>

      <div
        class="writing-vertical-lr text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-2 transform rotate-180"
      >
        {#if $settingsStore.sidePanelMode === "chat"}
          CHAT
        {:else if $settingsStore.sidePanelMode === "ai"}
          AI ASSISTANT
        {:else}
          NOTES
        {/if}
      </div>
    </div>

    <!-- Expanded Content Panel -->
    {#if isOpen}
      <div
        transition:fly={transitionParams}
        class="flex flex-col border border-[var(--border-color)] pointer-events-auto shadow-2xl overflow-hidden"
        class:w-80={!isFloating}
        class:h-full={!isFloating}
        class:w-96={isFloating}
        class:max-h-[38vh]={isFloating}
        class:rounded-lg={isFloating}
        class:mb-2={isFloating}
        class:bg-[var(--bg-tertiary)]={isStandard}
        class:backdrop-blur-md={isTransparent}
        class:bg-black={isTransparent}
        class:bg-opacity-50={isTransparent}
        class:bg-[var(--bg-secondary)]={isFloating}
        style={isTransparent ? "background-color: rgba(0,0,0,0.6);" : ""}
      >
        <!-- Header -->
        <div
          class="h-12 border-b border-[var(--border-color)] flex items-center justify-between px-4"
          class:bg-[var(--bg-secondary)]={isStandard}
          class:bg-transparent={isTransparent}
        >
          <h3 class="font-bold text-[var(--text-primary)]">
            {getPanelTitle($settingsStore.sidePanelMode)}
          </h3>
          <div class="flex items-center gap-2">
            {#if $settingsStore.sidePanelMode === "ai"}
              <!-- Clear History Button -->
              <button
                class="text-[var(--text-secondary)] hover:text-[var(--danger-color)]"
                on:click={() =>
                  confirm("Clear chat history?") && aiStore.clearHistory()}
                title="Clear History"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  ><polyline points="3 6 5 6 21 6" /><path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  /></svg
                >
              </button>
            {/if}
            <button
              class="text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              on:click={toggle}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <!-- Messages Area -->
        <div
          bind:this={messagesContainer}
          class="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-[var(--bg-primary)]"
        >
          {#if $settingsStore.sidePanelMode === "ai"}
            <!-- AI Messages -->
            {#each $aiStore.messages as msg (msg.id)}
              <div
                class="flex flex-col animate-fade-in text-sm {msg.role ===
                'user'
                  ? 'items-end'
                  : 'items-start'}"
              >
                <div
                  class="max-w-[85%] p-2 rounded break-words {msg.role ===
                  'user'
                    ? 'bg-[var(--accent-color)] text-[var(--btn-accent-text)]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)]'}"
                >
                  {#if msg.role === "assistant"}
                    <div class="markdown-content">
                      {@html renderMarkdown(msg.content)}
                    </div>
                  {:else}
                    {msg.content}
                  {/if}
                </div>
                <span class="text-[10px] text-[var(--text-tertiary)] mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
            {/each}

            {#if $aiStore.isStreaming}
              <div class="flex flex-col items-start animate-pulse">
                <div
                  class="p-2 rounded bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)]"
                >
                  <span class="text-xs italic">Thinking...</span>
                </div>
              </div>
            {/if}

            {#if $aiStore.messages.length === 0}
              <div
                class="text-center text-[var(--text-secondary)] text-xs mt-10"
              >
                <p class="mb-2 font-bold">Trading Assistant</p>
                <p class="italic">
                  I can analyze your trades, explain market data, or chat about
                  strategy.
                </p>
                <p class="mt-4 text-[10px]">
                  Using {$settingsStore.aiProvider || "Unknown Provider"}
                </p>
              </div>
            {/if}
          {:else}
            <!-- Standard Chat / Notes -->
            {#each $chatStore.messages as msg (msg.id)}
              <div class="flex flex-col animate-fade-in text-sm">
                <div class="flex items-baseline justify-between mb-0.5">
                  <span
                    class="text-[10px] text-[var(--text-tertiary)] font-mono"
                  >
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <div
                  class="p-2 rounded bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)] break-words"
                >
                  {msg.text}
                </div>
              </div>
            {/each}

            {#if $chatStore.messages.length === 0}
              <div
                class="text-center text-[var(--text-secondary)] text-xs mt-10 italic"
              >
                {$settingsStore.sidePanelMode === "chat"
                  ? "No messages yet."
                  : "Write your first note..."}
              </div>
            {/if}
          {/if}
        </div>

        <!-- Input Area -->
        <div
          class="p-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]"
        >
          {#if errorMessage || $aiStore.error}
            <div class="text-xs text-[var(--danger-color)] mb-2 animate-pulse">
              {errorMessage || $aiStore.error}
            </div>
          {/if}
          <div class="relative">
            <input
              id="side-panel-input"
              name="sidePanelInput"
              bind:this={inputEl}
              type="text"
              class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)] pr-10"
              placeholder={$settingsStore.sidePanelMode === "ai"
                ? "Ask AI..."
                : "Type a message..."}
              maxlength={$settingsStore.sidePanelMode === "ai" ? 1000 : 140}
              bind:value={messageText}
              on:keydown={handleKeydown}
              disabled={isSending ||
                ($settingsStore.sidePanelMode === "ai" && $aiStore.isStreaming)}
            />
            <button
              class="absolute right-2 top-1/2 transform -translate-y-1/2 text-[var(--accent-color)] hover:text-[var(--accent-hover)] disabled:opacity-50"
              on:click={handleSend}
              disabled={!messageText.trim() ||
                isSending ||
                ($settingsStore.sidePanelMode === "ai" && $aiStore.isStreaming)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          <div class="text-[10px] text-right text-[var(--text-tertiary)] mt-1">
            {#if $settingsStore.sidePanelMode !== "ai"}
              {messageText.length}/140
            {/if}
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .writing-vertical-lr {
    writing-mode: vertical-lr;
    text-orientation: mixed;
  }
  .markdown-content :global(p) {
    margin-bottom: 0.5rem;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }
  .markdown-content :global(code) {
    background: rgba(0, 0, 0, 0.2);
    padding: 0.1rem 0.3rem;
    border-radius: 0.2rem;
    font-family: monospace;
    font-size: 0.9em;
  }
</style>
