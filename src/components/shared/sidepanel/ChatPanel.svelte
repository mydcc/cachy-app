<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import { chatState } from "../../../stores/chat.svelte";
  import { settingsState } from "../../../stores/settings.svelte";
  import { _ } from "../../../locales/i18n";

  let inputEl: HTMLInputElement | undefined = $state();
  let messagesContainer: HTMLDivElement | undefined = $state();
  let messageText = $state("");
  let isSending = $state(false);
  let errorMessage = $state("");
  let errorTimeout: ReturnType<typeof setTimeout> | undefined;

  let isTerminal = $derived(settingsState.chatStyle === "terminal");

  // Scroll to bottom on new messages
  $effect(() => {
    if (messagesContainer) {
      const _len = chatState.messages.length;
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
      await chatState.sendMessage(messageText);
      messageText = "";
      if (inputEl) {
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
      {#each chatState.messages as msg (msg.id)}
         {#if msg.sender === "system"}
            <div
              class="my-1 text-[10px] text-[var(--text-tertiary)] opacity-60 text-center uppercase tracking-wider"
            >
              --- {msg.text} ---
            </div>
          {:else}
            {@const isMe =
              msg.clientId === chatState.clientId ||
              msg.senderId === "me"}
            <div class="flex flex-col">
               <span
                class="text-[9px] font-bold opacity-60 uppercase mb-0.5 flex items-center gap-1.5"
                class:text-[var(--accent-color)]={isMe}
                class:opacity-100={isMe}
              >
                <span>
                  {isMe ? "You" : "User"}
                </span>
                {#if msg.profitFactor !== undefined}
                  <span
                    class="px-1.5 py-0.5 bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded text-[7px] font-black shadow-sm"
                    style="line-height: 1;"
                  >
                    PF {msg.profitFactor.toFixed(2)}
                  </span>
                {/if}
              </span>
              <span
                class="leading-tight text-[var(--text-primary)]"
                style="font-size: {settingsState.chatFontSize || 13}px"
                >{msg.text}</span
              >
              <span class="text-[9px] opacity-30 mt-1 font-mono">
                {new Date(msg.timestamp).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          {/if}
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
         <input
            bind:this={inputEl}
            type="text"
            class="w-full bg-transparent border-none focus:ring-0 p-2 pr-10 resize-none h-10 flex items-center"
            style="font-size: {settingsState.chatFontSize || 13}px"
            class:bg-black={isTerminal}
            class:text-green-500={isTerminal}
            class:border-green-800={isTerminal}
            class:focus:border-green-500={isTerminal}
            class:font-mono={isTerminal}
            class:bg-[var(--bg-primary)]={!isTerminal}
            class:text-[var(--text-primary)]={!isTerminal}
            class:border-[var(--border-color)]={!isTerminal}
            class:rounded-full={!isTerminal}
            class:focus:border-[var(--accent-color)]={!isTerminal}
            class:placeholder-[var(--text-tertiary)]={true}
            placeholder={$_("cloud.placeholder") || "Message chat..."}
            maxlength={140}
            bind:value={messageText}
            onkeydown={handleKeydown}
            disabled={isSending}
          />

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
