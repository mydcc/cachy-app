<script lang="ts">
  import { onMount } from "svelte";
  import { fly, scale, fade } from "svelte/transition";
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

  const transitionParams = { y: 20, duration: 200 };
</script>

{#if $settingsStore.enableSidePanel}
  <div
    class="fixed z-[60] pointer-events-none transition-all duration-300"
    class:bottom-6={isFloating}
    class:right-6={isFloating}
    class:flex={true}
    class:flex-col-reverse={isFloating}
    class:items-end={isFloating}
    class:top-0={!isFloating}
    class:left-0={!isFloating}
    class:h-full={!isFloating}
    class:flex-row={!isFloating}
  >
    <!-- TRIGGER BUTTON / STRIP -->
    <div
      class="pointer-events-auto"
      onclick={toggle}
      role="button"
      tabindex="0"
      onkeydown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}
    >
      {#if isFloating}
        <!-- Floating Action Button (FAB) -->
        {#if !isOpen}
          <div
            in:scale={{ duration: 200 }}
            class="w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-xl flex items-center justify-center cursor-pointer transition-transform hover:scale-110 active:scale-95 border-2 border-white/10"
          >
            {#if $settingsStore.sidePanelMode === "ai"}
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path
                  d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                ></path></svg
              >
            {:else}
              {@html icons.messageSquare}
            {/if}
            <!-- Notification Dot (fake) -->
            <div
              class="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-[#111]"
            ></div>
          </div>
        {/if}
      {:else}
        <!-- Configurable Sidebar Strip -->
        <div
          class="h-full w-10 bg-[var(--bg-tertiary)] border-r border-[var(--border-color)] flex flex-col items-center py-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors outline-none focus:bg-[var(--bg-secondary)] shadow-lg"
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
      {/if}
    </div>

    <!-- MAIN PANEL CONTENT -->
    {#if isOpen}
      <div
        transition:fly={{
          y: isFloating ? 20 : 0,
          x: isFloating ? 0 : -30,
          duration: 250,
        }}
        class="flex flex-col border border-[var(--border-color)] pointer-events-auto shadow-2xl overflow-hidden glass-panel"
        class:w-80={!isFloating}
        class:h-full={!isFloating}
        class:w-[90vw]={isFloating}
        class:sm:w-[400px]={isFloating}
        class:h-[600px]={isFloating}
        class:max-h-[80vh]={isFloating}
        class:mb-4={isFloating}
        class:rounded-2xl={isFloating}
        class:bg-[var(--bg-tertiary)]={isStandard}
        class:backdrop-blur-xl={isTransparent || isFloating}
        class:bg-zinc-900={isTransparent}
        class:bg-opacity-95={isTransparent}
        class:bg-[var(--bg-secondary)]={isFloating}
        style={isTransparent ? "background-color: rgba(17, 17, 17, 0.95);" : ""}
      >
        <!-- Header -->
        <div
          class="h-14 border-b border-[var(--border-color)] flex items-center justify-between px-5 bg-gradient-to-r from-[var(--bg-secondary)] to-[var(--bg-primary)]"
        >
          <div class="flex items-center gap-3">
            <div
              class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-600 flex items-center justify-center text-white shadow ring-2 ring-white/10"
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
                class="font-bold text-[var(--text-primary)] text-sm tracking-wide"
              >
                {getPanelTitle($settingsStore.sidePanelMode)}
              </h3>
              <span
                class="text-[10px] text-green-400 font-medium flex items-center gap-1"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"
                ></span>
                Online
              </span>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            {#if $settingsStore.sidePanelMode === "ai"}
              <button
                class="p-2 text-[var(--text-secondary)] hover:text-red-400 hover:bg-white/5 rounded-lg transition-all"
                onclick={() =>
                  confirm("Clear chat history?") && aiStore.clearHistory()}
                title="Clear History"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4.5 w-4.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  ><polyline points="3 6 5 6 21 6" /><path
                    d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                  /></svg
                >
              </button>
            {/if}
            <button
              class="p-2 text-[var(--text-secondary)] hover:text-white hover:bg-white/5 rounded-lg transition-all"
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
                    ? 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white rounded-[1.2rem] rounded-tr-sm'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-[1.2rem] rounded-tl-sm border border-[var(--border-color)] shadow-sm'}"
                >
                  {#if msg.role === "assistant"}
                    <div class="markdown-content text-sm">
                      {@html renderMarkdown(msg.content)}
                    </div>
                  {:else}
                    {msg.content}
                  {/if}
                </div>
                <span
                  class="text-[10px] text-[var(--text-tertiary)] mt-1.5 px-1 opacity-70"
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            {/each}

            {#if $aiStore.isStreaming}
              <div class="flex flex-col items-start animate-fade-in">
                <div
                  class="px-5 py-4 rounded-[1.2rem] rounded-tl-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]"
                >
                  <div class="flex gap-1.5">
                    <span
                      class="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full animate-bounce"
                    ></span>
                    <span
                      class="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full animate-bounce delay-100"
                    ></span>
                    <span
                      class="w-1.5 h-1.5 bg-[var(--text-secondary)] rounded-full animate-bounce delay-200"
                    ></span>
                  </div>
                </div>
              </div>
            {/if}

            {#if $aiStore.messages.length === 0}
              <div
                class="flex flex-col items-center justify-center h-full text-[var(--text-secondary)] opacity-50 select-none"
              >
                <div
                  class="w-16 h-16 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-color)] flex items-center justify-center mb-4 shadow-sm rotate-3 transform transition-transform hover:rotate-0"
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
                <span
                  class="text-xs mt-2 font-mono bg-[var(--bg-secondary)] px-2 py-1 rounded"
                  >{$settingsStore.aiProvider}</span
                >
              </div>
            {/if}
          {:else}
            <!-- Standard Chat / Notes -->
            {#each $chatStore.messages as msg (msg.id)}
              <div
                class="flex flex-col animate-fade-in text-sm mb-2 items-start"
              >
                <div
                  class="p-3 rounded-xl bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)] break-words shadow-sm"
                >
                  {msg.text}
                </div>
                <span
                  class="text-[10px] text-[var(--text-tertiary)] ml-1 mt-1 opacity-60"
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
          class="p-4 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]/90 backdrop-blur-md"
        >
          {#if errorMessage || $aiStore.error}
            <div
              class="text-xs text-[var(--danger-color)] mb-2 animate-pulse bg-red-500/10 p-2 rounded-md border border-red-500/20 flex items-center gap-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><circle cx="12" cy="12" r="10" /><line
                  x1="12"
                  y1="8"
                  x2="12"
                  y2="12"
                /><line x1="12" y1="16" x2="12.01" y2="16" /></svg
              >
              {$_(errorMessage) || errorMessage || $aiStore.error}
            </div>
          {/if}
          <div class="relative w-full shadow-sm">
            <input
              bind:this={inputEl}
              type="text"
              class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-full pl-5 pr-12 py-3.5 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all placeholder-[var(--text-tertiary)]"
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
              class="absolute right-1.5 top-1.5 bottom-1.5 w-10 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition-all transform active:scale-95 ease-out duration-200"
              aria-label="Send"
              onclick={handleSend}
              disabled={!messageText.trim() ||
                isSending ||
                ($settingsStore.sidePanelMode === "ai" && $aiStore.isStreaming)}
            >
              {#if isSending}
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"
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
                  class="h-4 w-4 ml-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  ><line x1="22" y1="2" x2="11" y2="13" /><polygon
                    points="22 2 15 22 11 13 2 9 22 2"
                  /></svg
                >
              {/if}
            </button>
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

  .glass-panel {
    box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.5);
  }

  /* Markdown Styles */
  .markdown-content :global(p) {
    margin-bottom: 0.75rem;
    line-height: 1.6;
  }
  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }
  .markdown-content :global(strong) {
    font-weight: 700;
  }
  .markdown-content :global(code) {
    background: rgba(0, 0, 0, 0.2);
    padding: 0.15rem 0.4rem;
    border-radius: 0.3rem;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    font-size: 0.85em;
    color: inherit;
  }
  .markdown-content :global(pre) {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.75rem;
    border-radius: 0.5rem;
    overflow-x: auto;
    margin-bottom: 1rem;
    font-size: 0.85em;
    border: 1px solid rgba(255, 255, 255, 0.05);
  }
</style>
