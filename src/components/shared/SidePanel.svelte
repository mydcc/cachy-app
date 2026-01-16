<script lang="ts">
  import { onMount } from "svelte";
  import { fly, scale } from "svelte/transition";
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
  let layout = $derived($settingsStore.sidePanelLayout || "floating");
  let isFloating = $derived(layout === "floating");
  let isSidebar = $derived(!isFloating); // Standard

  let styleMode = $derived($settingsStore.chatStyle || "minimal"); // minimal, bubble, terminal

  let isTerminal = $derived(styleMode === "terminal");
  let isBubble = $derived(styleMode === "bubble");
  let isMinimal = $derived(styleMode === "minimal");

  // Panel State (Position & Size)
  let panelState = $state($settingsStore.panelState);
  let isDragging = $state(false);
  let dragType:
    | "move"
    | "n"
    | "s"
    | "e"
    | "w"
    | "ne"
    | "nw"
    | "se"
    | "sw"
    | null = $state(null);

  // Drag Start State
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;
  let startWidth = 0;
  let startHeight = 0;

  function handleMouseDown(e: MouseEvent, type: typeof dragType) {
    if (isSidebar && type !== "w" && type !== "e") return; // Sidebar only supports width resize

    isDragging = true;
    dragType = type;
    startX = e.clientX;
    startY = e.clientY;

    // Check if panelState needs init (though store has defaults)
    if (!panelState) {
      panelState = { width: 450, height: 550, x: 20, y: 20 };
    }

    startLeft = panelState.x;
    startTop = panelState.y;
    startWidth = panelState.width;
    startHeight = panelState.height;

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging || !dragType) return;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (dragType === "move") {
      panelState.x = startLeft + dx;
      panelState.y = startTop + dy;
    } else {
      // Resizing
      // Constraints
      const minW = 300;
      const minH = 200;

      if (dragType.includes("e")) {
        panelState.width = Math.max(minW, startWidth + dx);
      }
      if (dragType.includes("w")) {
        const newW = Math.max(minW, startWidth - dx);
        panelState.x = startLeft + (startWidth - newW);
        panelState.width = newW;
      }
      if (dragType.includes("s")) {
        panelState.height = Math.max(minH, startHeight + dy);
      }
      if (dragType.includes("n")) {
        const newH = Math.max(minH, startHeight - dy);
        panelState.y = startTop + (startHeight - newH);
        panelState.height = newH;
      }
    }
  }

  function handleMouseUp() {
    isDragging = false;
    dragType = null;
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "";

    // Save to store
    settingsStore.update((s) => ({
      ...s,
      panelState: { ...panelState },
    }));
  }
</script>

{#if $settingsStore.enableSidePanel}
  <div
    class="fixed z-[60] pointer-events-none transition-all duration-300 flex"
    class:bottom-4={isFloating}
    class:left-4={isFloating}
    class:flex-col-reverse={isFloating}
    class:items-start={isFloating}
    class:left-0={isSidebar}
    class:top-0={isSidebar}
    class:h-full={isSidebar}
    class:flex-row={isSidebar}
  >
    <!-- TRIGGER BUTTON / STRIP -->
    <!-- Console and Floating use same FAB style trigger, Sidebar uses Strip -->
    <div
      class="pointer-events-auto"
      onclick={toggle}
      role="button"
      tabindex="0"
      onkeydown={(e) => (e.key === "Enter" || e.key === " ") && toggle()}
    >
      {#if isSidebar}
        <!-- Configurable Sidebar Strip -->
        <div
          class="h-full w-10 bg-[var(--bg-tertiary)] border-r border-[var(--border-color)] flex flex-col items-center py-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors outline-none focus:bg-[var(--bg-secondary)] shadow-lg"
          title={getPanelTitle($settingsStore.sidePanelMode)}
        >
          <div class="mb-4 text-[var(--text-primary)]">
            {#if $settingsStore.sidePanelMode === "ai"}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path
                  d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
                /><path
                  d="M12 16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z"
                /><path
                  d="M2 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"
                /><path
                  d="M16 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"
                /><circle cx="12" cy="12" r="3" /></svg
              >
            {:else}
              {@html icons.messageSquare}
            {/if}
          </div>
          <div
            class="writing-vertical-lr text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-2 transform rotate-180"
          >
            {$settingsStore.sidePanelMode}
          </div>
        </div>
      {:else}
        <!-- Floating / Console Widget Button -->
        <!-- Hide button if Console is Open? Maybe yes for cleaner look, or keep as toggle -->
        {#if !isOpen}
          <div
            in:scale={{ duration: 200 }}
            class="w-12 h-12 rounded-full border shadow-lg flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
            class:bg-black={isTerminal}
            class:border-green-500={isTerminal}
            class:text-green-500={isTerminal}
            class:bg-[var(--bg-tertiary)]={!isTerminal}
            class:text-[var(--text-primary)]={!isTerminal}
            class:border-[var(--border-color)]={!isTerminal}
            class:hover:bg-[var(--bg-secondary)]={!isTerminal}
          >
            {#if $settingsStore.sidePanelMode === "ai"}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                ><path
                  d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
                /><path
                  d="M12 16a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z"
                /><path
                  d="M2 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z"
                /><path
                  d="M16 12a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"
                /><circle cx="12" cy="12" r="3" /></svg
              >
            {:else}
              {@html icons.messageSquare}
            {/if}
          </div>
        {/if}
      {/if}
    </div>

    <!-- MAIN PANEL CONTENT -->
    {#if isOpen}
      <div
        class="flex flex-col border border-[var(--border-color)] pointer-events-auto shadow-2xl overflow-hidden panel-transition fixed"
        transition:fly={{
          y: isFloating ? 20 : 0,
          x: isSidebar ? -30 : 0,
          duration: 250,
        }}
        style={isSidebar
          ? `width: ${panelState?.width || 320}px;`
          : panelState
            ? `width: ${panelState.width}px; height: ${panelState.height}px; left: ${panelState.x}px; top: ${panelState.y}px;`
            : ""}
        class:mb-4={isFloating}
        class:rounded-lg={isFloating}
        class:w-80={isSidebar}
        class:h-full={isSidebar}
        class:bg-[var(--bg-secondary)]={isTerminal}
        class:border-green-800={isTerminal}
        class:text-green-500={isTerminal}
        class:font-mono={isTerminal}
        class:bg-[var(--bg-tertiary)]={!isTerminal}
      >
        <!-- RESIZE HANDLES -->
        {#if !isSidebar}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="absolute top-0 left-0 w-3 h-3 cursor-nw-resize z-50"
            onmousedown={(e) => handleMouseDown(e, "nw")}
            role="separator"
            tabindex="0"
            aria-label="Resize NW"
          ></div>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="absolute top-0 right-0 w-3 h-3 cursor-ne-resize z-50"
            onmousedown={(e) => handleMouseDown(e, "ne")}
            role="separator"
            tabindex="0"
            aria-label="Resize NE"
          ></div>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="absolute bottom-0 left-0 w-3 h-3 cursor-sw-resize z-50"
            onmousedown={(e) => handleMouseDown(e, "sw")}
            role="separator"
            tabindex="0"
            aria-label="Resize SW"
          ></div>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="absolute bottom-0 right-0 w-3 h-3 cursor-se-resize z-50"
            onmousedown={(e) => handleMouseDown(e, "se")}
            role="separator"
            tabindex="0"
            aria-label="Resize SE"
          ></div>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="absolute top-0 left-2 right-2 h-2 cursor-n-resize z-50"
            onmousedown={(e) => handleMouseDown(e, "n")}
            role="separator"
            tabindex="0"
            aria-label="Resize N"
          ></div>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="absolute bottom-0 left-2 right-2 h-2 cursor-s-resize z-50"
            onmousedown={(e) => handleMouseDown(e, "s")}
            role="separator"
            tabindex="0"
            aria-label="Resize S"
          ></div>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="absolute left-0 top-2 bottom-2 w-2 cursor-w-resize z-50"
            onmousedown={(e) => handleMouseDown(e, "w")}
            role="separator"
            tabindex="0"
            aria-label="Resize W"
          ></div>
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="absolute right-0 top-2 bottom-2 w-2 cursor-e-resize z-50"
            onmousedown={(e) => handleMouseDown(e, "e")}
            role="separator"
            tabindex="0"
            aria-label="Resize E"
          ></div>
        {:else}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <div
            class="absolute top-0 right-0 w-1 h-full cursor-ew-resize z-50 hover:bg-blue-500 hover:opacity-50 transition-colors"
            onmousedown={(e) => handleMouseDown(e, "e")}
            role="separator"
            tabindex="0"
            aria-label="Resize Width"
          ></div>
        {/if}
        <div
          class="h-10 border-b flex items-center justify-between px-4 shrink-0 transition-colors bg-[var(--bg-secondary)]"
          class:border-green-900={isTerminal}
          class:border-[var(--border-color)]={!isTerminal}
          class:cursor-move={!isSidebar}
          onmousedown={!isSidebar ? (e) => handleMouseDown(e, "move") : null}
          role="toolbar"
          tabindex="0"
        >
          <h3
            class="font-bold text-xs tracking-widest uppercase"
            class:text-green-500={isTerminal}
            class:text-[var(--text-primary)]={!isTerminal}
          >
            {getPanelTitle($settingsStore.sidePanelMode)}
          </h3>

          <div class="flex items-center gap-3">
            {#if $settingsStore.sidePanelMode === "ai"}
              <button
                class="transition-colors hover:text-red-500"
                class:text-green-700={isTerminal}
                class:text-[var(--text-secondary)]={!isTerminal}
                onclick={() =>
                  confirm("Clear chat history?") && aiStore.clearHistory()}
                title="Clear History"
              >
                <!-- TRASH ICON -->
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
              class="transition-colors"
              class:text-green-500={isTerminal}
              class:text-[var(--text-secondary)]={!isTerminal}
              class:hover:text-[var(--text-primary)]={!isTerminal}
              class:hover:text-green-300={isTerminal}
              aria-label="Close"
              onclick={toggle}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-4 w-4"
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
          class="flex-1 overflow-y-auto p-4 flex flex-col gap-3 scroll-smooth"
          class:bg-black={isTerminal}
          class:bg-[var(--bg-primary)]={!isTerminal}
        >
          {#if $settingsStore.sidePanelMode === "ai"}
            <!-- AI Messages -->
            {#each $aiStore.messages as msg (msg.id)}
              <div
                class="flex flex-col text-sm {msg.role === 'user'
                  ? 'items-end'
                  : 'items-start'}"
              >
                <!-- Label for Terminal / Minimal Mode -->
                {#if !isBubble}
                  <div
                    class="mb-1 text-[10px] uppercase font-bold tracking-wider opacity-60"
                  >
                    {msg.role === "user" ? "You" : "AI"}
                  </div>
                {/if}

                <div
                  class="leading-relaxed transition-all
                    {isTerminal
                    ? msg.role === 'user'
                      ? 'text-green-400 w-full text-right'
                      : 'text-green-600 w-full'
                    : ''}
                    {isMinimal
                    ? msg.role === 'user'
                      ? 'text-[var(--accent-color)] text-right max-w-[90%]'
                      : 'text-[var(--text-primary)] max-w-[95%] text-left'
                    : ''}
                    {isBubble
                    ? msg.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-600 to-blue-600 text-white rounded-[1.2rem] rounded-tr-none px-4 py-2 shadow-md max-w-[85%]'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-primary)] rounded-[1.2rem] rounded-tl-none px-4 py-2 border border-[var(--border-color)] shadow-sm max-w-[85%]'
                    : ''}
                    "
                >
                  {#if msg.role === "assistant"}
                    <div
                      class="markdown-content text-sm"
                      class:terminal-md={isTerminal}
                    >
                      {@html renderMarkdown(msg.content)}
                    </div>
                  {:else}
                    {msg.content}
                  {/if}
                </div>

                {#if isBubble}
                  <span
                    class="text-[9px] text-[var(--text-tertiary)] mt-1 px-1 opacity-70"
                  >
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                {/if}
              </div>
            {/each}

            {#if $aiStore.isStreaming}
              <div class="flex flex-col items-start animate-pulse">
                {#if isTerminal}
                  <span class="text-xs text-green-500 blink"
                    >_ PROCESSING...</span
                  >
                {:else}
                  <span
                    class="text-[10px] uppercase font-bold text-[var(--accent-color)]"
                    >Thinking...</span
                  >
                {/if}
              </div>
            {/if}

            {#if $aiStore.messages.length === 0}
              <div
                class="flex flex-col items-center justify-center h-full opacity-40 select-none"
              >
                {#if isTerminal}
                  <p class="text-xs text-green-800">
                    SYSTEM READY. AWAITING INPUT.
                  </p>
                {:else}
                  <p class="text-xs font-medium text-[var(--text-secondary)]">
                    Ready to assist.
                  </p>
                {/if}
              </div>
            {/if}
          {:else}
            <!-- Standard Chat (Not AI) -->
            {#each $chatStore.messages as msg (msg.id)}
              <div class="mb-2 text-[var(--text-primary)]">{msg.text}</div>
            {/each}
          {/if}
        </div>

        <!-- Input Area -->
        <div
          class="p-2 border-t shrink-0 transition-colors bg-[var(--bg-secondary)]"
          class:border-green-900={isTerminal}
          class:border-[var(--border-color)]={!isTerminal}
        >
          {#if errorMessage || $aiStore.error}
            <div
              class="text-xs text-[var(--danger-color)] mb-2 animate-pulse px-2"
            >
              {$_(errorMessage) || errorMessage || $aiStore.error}
            </div>
          {/if}
          <div class="relative w-full">
            <input
              bind:this={inputEl}
              type="text"
              class="w-full border rounded px-4 py-2 text-sm focus:outline-none transition-all"
              class:bg-black={isTerminal}
              class:text-green-500={isTerminal}
              class:border-green-800={isTerminal}
              class:focus:border-green-500={isTerminal}
              class:font-mono={isTerminal}
              class:bg-[var(--bg-primary)]={!isTerminal}
              class:text-[var(--text-primary)]={!isTerminal}
              class:border-[var(--border-color)]={!isTerminal}
              class:rounded-full={isBubble}
              class:focus:border-[var(--accent-color)]={!isTerminal}
              class:placeholder-[var(--text-tertiary)]={true}
              placeholder={$settingsStore.sidePanelMode === "ai"
                ? isTerminal
                  ? "> ENTER COMMAND"
                  : "Message AI..."
                : "Type here..."}
              maxlength={$settingsStore.sidePanelMode === "ai" ? 1000 : 140}
              bind:value={messageText}
              onkeydown={handleKeydown}
              disabled={isSending ||
                ($settingsStore.sidePanelMode === "ai" && $aiStore.isStreaming)}
            />
            {#if !isTerminal}
              <button
                class="absolute right-2 top-1/2 transform -translate-y-1/2 text-[var(--text-secondary)] hover:text-[var(--accent-color)] p-2"
                onclick={handleSend}
                disabled={!messageText.trim()}
                aria-label="Send message"
                title="Send message"
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
    {/if}
  </div>
{/if}

<style>
  .writing-vertical-lr {
    writing-mode: vertical-lr;
    text-orientation: mixed;
  }

  .blink {
    animation: blinker 1s linear infinite;
  }
  @keyframes blinker {
    50% {
      opacity: 0;
    }
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

  /* Terminal Overrides */
  .terminal-md :global(*) {
    color: #22c55e !important; /* Tailwind green-500 */
    font-family: monospace !important;
  }
</style>
