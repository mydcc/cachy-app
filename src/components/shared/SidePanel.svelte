<script lang="ts">
  import { onMount } from "svelte";
  import { fly } from "svelte/transition";
  import { chatStore } from "../../stores/chatStore";
  import { aiStore } from "../../stores/aiStore";
  import { settingsStore } from "../../stores/settingsStore";
  import { _ } from "../../locales/i18n";
  import { icons } from "../../lib/constants";
  import { marked } from "marked";

  let isOpen = $state(false);
  let inputEl: HTMLInputElement | undefined = $state();
  let messagesContainer: HTMLDivElement | undefined = $state();
  let messageText = $state("");
  let isSending = $state(false);
  let errorMessage = $state("");

  // Scroll to bottom on new messages
  $effect(() => {
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
  let isFloating = $derived($settingsStore.sidePanelLayout === "floating");
  let isStandard = $derived(
    $settingsStore.sidePanelLayout === "standard" ||
      !$settingsStore.sidePanelLayout,
  );
  let isTransparent = $derived(
    $settingsStore.sidePanelLayout === "transparent",
  );

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
    class:right-4={isFloating && window.innerWidth < 640}
    class:items-end={isFloating}
    class:flex-col-reverse={isFloating}
  >
    <!-- Toggle Strip (Visible when collapsed) -->
    <div
      role="button"
      tabindex="0"
      class="h-full w-10 bg-[var(--bg-tertiary)] border-r border-[var(--border-color)] flex flex-col items-center py-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors pointer-events-auto outline-none focus:bg-[var(--bg-secondary)] shadow-lg"
      onclick={toggle}
      onkeydown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}
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
        class="flex flex-col border border-[var(--border-color)] pointer-events-auto shadow-2xl overflow-hidden glass-panel"
        class:w-80={!isFloating}
        class:h-full={!isFloating}
        class:w-[calc(100vw-32px)]={isFloating}
        class:md:w-96={isFloating}
        class:h-[60vh]={isFloating}
        class:md:max-h-[70vh]={isFloating}
        class:rounded-lg={isFloating}
        class:mb-2={isFloating}
        class:mr-4={isFloating}
        class:bg-[var(--bg-tertiary)]={isStandard}
        class:backdrop-blur-xl={isTransparent || isFloating}
        class:bg-black={isTransparent}
        class:bg-opacity-50={isTransparent}
        class:bg-[var(--bg-secondary)]={isFloating}
        style={isTransparent ? "background-color: rgba(0,0,0,0.6);" : ""}
      >
        <!-- Header -->
        <div
          class="h-14 border-b border-[var(--border-color)] flex items-center justify-between px-4"
          class:bg-[var(--bg-secondary)]={isStandard}
          class:bg-transparent={isTransparent}
        >
          <div class="flex items-center gap-2">
            <div
              class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-sm"
            >
              {#if $settingsStore.sidePanelMode === "ai"}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  ><circle cx="12" cy="12" r="3" /><path d="M12 2v4" /><path
                    d="M12 18v4"
                  /><path d="M4.93 4.93l2.83 2.83" /><path
                    d="M16.24 16.24l2.83 2.83"
                  /><path d="M2 12h4" /><path d="M18 12h4" /><path
                    d="M4.93 19.07l2.83-2.83"
                  /><path d="M16.24 7.76l2.83-2.83" /></svg
                >
              {:else}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  ><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle
                    cx="9"
                    cy="7"
                    r="4"
                  /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path
                    d="M16 3.13a4 4 0 0 1 0 7.75"
                  /></svg
                >
              {/if}
            </div>
            <div>
              <h3
                class="font-bold text-[var(--text-primary)] text-sm leading-tight"
              >
                {getPanelTitle($settingsStore.sidePanelMode)}
              </h3>
              <span
                class="text-[10px] text-[var(--text-secondary)] block status-dot"
                >Online</span
              >
            </div>
          </div>

          <div class="flex items-center gap-1">
            {#if $settingsStore.sidePanelMode === "ai"}
              <button
                class="p-2 text-[var(--text-secondary)] hover:text-[var(--danger-color)] hover:bg-[var(--bg-primary)] rounded-full transition-colors"
                onclick={() =>
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
              class="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-primary)] rounded-full transition-colors"
              aria-label="Close"
              onclick={toggle}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                ><path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M6 18L18 6M6 6l12 12"
                /></svg
              >
            </button>
          </div>
        </div>

        <!-- Messages Area -->
        <div
          bind:this={messagesContainer}
          class="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[var(--bg-primary)] scroll-smooth"
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
                  class="relative px-4 py-3 max-w-[85%] shadow-sm leading-relaxed
                    {msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-2xl rounded-tl-sm border border-[var(--border-color)] prose-invert'}"
                >
                  {#if msg.role === "assistant"}
                    <div class="markdown-content text-sm">
                      {@html renderMarkdown(msg.content)}
                    </div>
                  {:else}
                    {msg.content}
                  {/if}
                </div>
                <span class="text-[10px] text-[var(--text-tertiary)] mt-1 px-1">
                  {msg.role === "user" ? "You" : "AI"} • {new Date(
                    msg.timestamp,
                  ).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            {/each}

            {#if $aiStore.isStreaming}
              <div class="flex flex-col items-start animate-pulse">
                <div
                  class="px-4 py-3 rounded-2xl rounded-tl-sm bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)]"
                >
                  <div class="flex gap-1">
                    <span
                      class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    ></span>
                    <span
                      class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-100"
                    ></span>
                    <span
                      class="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce delay-200"
                    ></span>
                  </div>
                </div>
              </div>
            {/if}

            {#if $aiStore.messages.length === 0}
              <div
                class="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] opacity-60"
              >
                <div
                  class="w-16 h-16 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mb-4"
                >
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    ><circle cx="12" cy="12" r="10" /><path
                      d="M12 16v-4"
                    /><path d="M12 8h.01" /></svg
                  >
                </div>
                <p class="font-medium text-sm">
                  How can I help you trade today?
                </p>
                <span class="text-xs mt-2"
                  >Powered by {$settingsStore.aiProvider}</span
                >
              </div>
            {/if}
          {:else}
            <!-- Standard Chat / Notes -->
            {#each $chatStore.messages as msg (msg.id)}
              <div class="flex flex-col animate-fade-in text-sm mb-2">
                <div
                  class="p-3 rounded-lg bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)] break-words shadow-sm"
                >
                  {msg.text}
                </div>
                <span
                  class="text-[10px] text-[var(--text-tertiary)] text-right mt-1 px-1"
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            {/each}
            {#if $chatStore.messages.length === 0}
              <div
                class="flex items-center justify-center h-full text-[var(--text-secondary)] italic text-sm"
              >
                {$settingsStore.sidePanelMode === "chat"
                  ? "No messages."
                  : "Your notes are empty."}
              </div>
            {/if}
          {/if}
        </div>

        <!-- Input Area -->
        <div
          class="p-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/50 backdrop-blur-md"
        >
          {#if errorMessage || $aiStore.error}
            <div
              class="text-xs text-[var(--danger-color)] mb-2 animate-pulse bg-[var(--bg-primary)] p-2 rounded border border-red-500/20"
            >
              {$_(errorMessage) || errorMessage || $aiStore.error}
            </div>
          {/if}
          <div class="relative flex items-center gap-2">
            <input
              bind:this={inputEl}
              type="text"
              class="flex-1 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-full px-4 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all shadow-inner"
              placeholder={$settingsStore.sidePanelMode === "ai"
                ? "Ask AI about trades..."
                : "Type away..."}
              maxlength={$settingsStore.sidePanelMode === "ai" ? 1000 : 140}
              bind:value={messageText}
              onkeydown={handleKeydown}
              disabled={isSending ||
                ($settingsStore.sidePanelMode === "ai" && $aiStore.isStreaming)}
            />
            <button
              class="w-10 h-10 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105 active:scale-95"
              aria-label="Send"
              onclick={handleSend}
              disabled={!messageText.trim() ||
                isSending ||
                ($settingsStore.sidePanelMode === "ai" && $aiStore.isStreaming)}
            >
              {#if isSending}
                <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"
                  ><circle
                    class="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    stroke-width="4"
                  ></circle><path
                    class="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path></svg
                >
              {:else}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5 ml-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  ><line x1="22" y1="2" x2="11" y2="13" /><polygon
                    points="22 2 15 22 11 13 2 9 22 2"
                  /></svg
                >
              {/if}
            </button>
          </div>
          <div
            class="text-[10px] text-right text-[var(--text-tertiary)] mt-1 px-2"
          >
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
  .status-dot::before {
    content: "";
    display: inline-block;
    width: 6px;
    height: 6px;
    background-color: #10b981;
    border-radius: 50%;
    margin-right: 4px;
  }

  /* Markdown Styles for Bubbles */
  .markdown-content :global(p) {
    margin-bottom: 0.5rem;
    line-height: 1.5;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }
  .markdown-content :global(code) {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.1rem 0.4rem;
    border-radius: 0.3rem;
    font-family: ui-monospace, monospace;
    font-size: 0.9em;
  }
  .markdown-content :global(pre) {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.75rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin-bottom: 0.5rem;
  }
  .markdown-content :global(ul) {
    list-style-type: disc;
    padding-left: 1.25rem;
    margin-bottom: 0.5rem;
  }
  .markdown-content :global(strong) {
    font-weight: 600;
  }
</style>
