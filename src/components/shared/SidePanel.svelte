<script lang="ts">
    import { onMount, afterUpdate } from 'svelte';
    import { fly } from 'svelte/transition';
    import { chatStore } from '../../stores/chatStore';
    import { settingsStore } from '../../stores/settingsStore';
    import { _ } from '../../locales/i18n';
    import { icons } from '../../lib/constants';

    let isOpen = false;
    let inputEl: HTMLInputElement;
    let messagesContainer: HTMLDivElement;
    let messageText = '';
    let isSending = false;
    let errorMessage = '';

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
        errorMessage = '';

        try {
            await chatStore.sendMessage(messageText);
            messageText = '';
        } catch (e: any) {
            errorMessage = e.message || 'Error';
            setTimeout(() => errorMessage = '', 3000);
        } finally {
            isSending = false;
            // Refocus input
            if(inputEl) inputEl.focus();
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            handleSend();
        }
    }

    function toggle() {
        isOpen = !isOpen;
    }
</script>

{#if $settingsStore.enableSidePanel}
    <div
        class="fixed left-0 top-0 h-full z-[60] flex transition-all duration-300 pointer-events-none"
        class:w-80={isOpen}
        class:w-10={!isOpen}
    >
        <!-- Toggle Strip (Visible when collapsed) -->
        <div
            class="h-full w-10 bg-[var(--bg-tertiary)] border-r border-[var(--border-color)] flex flex-col items-center py-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors pointer-events-auto"
            on:click={toggle}
            title={$settingsStore.sidePanelMode === 'chat' ? 'Open Chat' : 'Open Notes'}
        >
            <div class="mb-4 text-[var(--text-primary)]">
                {#if $settingsStore.sidePanelMode === 'chat'}
                    {@html icons.messageSquare || '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'}
                {:else}
                    {@html icons.edit || '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'}
                {/if}
            </div>

            <div class="writing-vertical-lr text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mt-2 transform rotate-180">
                {$settingsStore.sidePanelMode === 'chat' ? 'CHAT' : 'NOTES'}
            </div>
        </div>

        <!-- Expanded Content Panel -->
        {#if isOpen}
            <div
                transition:fly={{ x: -200, duration: 200 }}
                class="flex-1 h-full bg-[var(--bg-primary)] shadow-2xl flex flex-col border-r border-[var(--border-color)] pointer-events-auto"
            >
                <!-- Header -->
                <div class="h-12 border-b border-[var(--border-color)] flex items-center justify-between px-4 bg-[var(--bg-secondary)]">
                    <h3 class="font-bold text-[var(--text-primary)]">
                        {$settingsStore.sidePanelMode === 'chat' ? 'Global Chat' : 'My Notes'}
                    </h3>
                    <button class="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" on:click={toggle}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <!-- Messages Area (Blank Background as requested) -->
                <div
                    bind:this={messagesContainer}
                    class="flex-1 overflow-y-auto p-4 flex flex-col gap-2 bg-[var(--bg-primary)]"
                >
                    {#each $chatStore.messages as msg (msg.id)}
                        <div class="flex flex-col animate-fade-in text-sm">
                            <div class="flex items-baseline justify-between mb-0.5">
                                <span class="text-[10px] text-[var(--text-tertiary)] font-mono">
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            <div class="p-2 rounded bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)] break-words">
                                {msg.text}
                            </div>
                        </div>
                    {/each}

                    {#if $chatStore.messages.length === 0}
                        <div class="text-center text-[var(--text-secondary)] text-xs mt-10 italic">
                            {$settingsStore.sidePanelMode === 'chat' ? 'No messages yet.' : 'Write your first note...'}
                        </div>
                    {/if}
                </div>

                <!-- Input Area -->
                <div class="p-3 border-t border-[var(--border-color)] bg-[var(--bg-secondary)]">
                    {#if errorMessage}
                        <div class="text-xs text-[var(--danger-color)] mb-2 animate-pulse">{errorMessage}</div>
                    {/if}
                    <div class="relative">
                        <input
                            bind:this={inputEl}
                            type="text"
                            class="w-full bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)] pr-10"
                            placeholder="Type a message (max 140)..."
                            maxlength="140"
                            bind:value={messageText}
                            on:keydown={handleKeydown}
                            disabled={isSending}
                        />
                        <button
                            class="absolute right-2 top-1/2 transform -translate-y-1/2 text-[var(--accent-color)] hover:text-[var(--accent-hover)] disabled:opacity-50"
                            on:click={handleSend}
                            disabled={!messageText.trim() || isSending}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                    <div class="text-[10px] text-right text-[var(--text-tertiary)] mt-1">
                        {messageText.length}/140
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
</style>
