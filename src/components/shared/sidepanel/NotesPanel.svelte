<script lang="ts">
  import { notesState } from "../../../stores/notes.svelte";
  import { settingsState } from "../../../stores/settings.svelte";
  import { _ } from "../../../locales/i18n";

  let inputEl: HTMLTextAreaElement | undefined = $state();
  let messagesContainer: HTMLDivElement | undefined = $state();
  let messageText = $state("");
  let isSending = $state(false);
  let errorMessage = $state("");
  let errorTimeout: ReturnType<typeof setTimeout> | undefined;

  let isTerminal = $derived(settingsState.chatStyle === "terminal");
  let isBubble = $derived(settingsState.chatStyle === "bubble");
  let isMinimal = $derived(settingsState.chatStyle === "minimal");

  // Scroll to bottom on new messages
  $effect(() => {
    if (messagesContainer) {
      const _len = notesState.messages.length;
      setTimeout(() => {
        if(messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 0);
    }
  });

  function handleSend() {
    if (!messageText.trim()) return;

    isSending = true;
    errorMessage = "";

    try {
      notesState.addNote(messageText);
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
        {#each notesState.messages as msg (msg.id)}
            <div
            class="flex flex-col text-sm items-end"
            >
            <!-- Label for Terminal / Minimal Mode -->
            {#if !isBubble}
                <div
                class="mb-1 text-[10px] uppercase font-bold tracking-wider opacity-60"
                >
                Note
                </div>
            {/if}

            <div
                class="leading-relaxed transition-all relative group"
                style="font-size: {settingsState.chatFontSize || 13}px"
                class:text-green-400={isTerminal}
                class:w-full={isTerminal}
                class:text-right={isTerminal}
                class:text-[var(--accent-color)]={isMinimal}
                class:max-w-[90%]={isMinimal}
                class:bg-gradient-to-br={isBubble}
                class:from-indigo-600={isBubble}
                class:to-blue-600={isBubble}
                class:text-white={isBubble}
                class:rounded-[1.2rem]={isBubble}
                class:rounded-tr-none={isBubble}
                class:px-4={isBubble}
                class:py-2={isBubble}
                class:shadow-md={isBubble}
                class:max-w-[85%]={isBubble}
                class:terminal-md={isTerminal}
            >
                <div class="whitespace-pre-wrap">{msg.text}</div>
                <div class="text-[9px] opacity-60 mt-1">
                    {new Date(msg.timestamp).toLocaleString()}
                </div>
            </div>
            </div>
        {/each}
    </div>

    <!-- Input Area -->
    <div
      class="p-2 border-t shrink-0 transition-colors bg-[var(--bg-secondary)]"
      class:border-green-900={isTerminal}
      class:border-[var(--border-color)]={!isTerminal}
    >
      {#if errorMessage}
        <div class="text-xs mb-2 px-2 text-[var(--danger-color)]">
           {errorMessage}
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
            placeholder={$_("journal.placeholder.notes") || "Type a note..."}
            maxlength={2000}
            bind:value={messageText}
            onkeydown={handleKeydown}
            oninput={(e) =>
              adjustTextareaHeight(e.target as HTMLTextAreaElement)}
            disabled={isSending}
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
  /* Terminal Overrides */
  .terminal-md :global(*) {
    color: #22c55e !important; /* Tailwind green-500 */
    font-family: monospace !important;
  }
</style>
