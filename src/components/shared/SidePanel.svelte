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

    // Reactive Layout Vars
    $: layout = $settingsStore.sidePanelLayout || 'standard';
    $: isFloating = layout === 'floating';
    $: isTransparent = layout === 'transparent';
    $: isStandard = layout === 'standard';

    // Helper for transition params
    $: transitionParams = isFloating
        ? { y: 20, duration: 200 }
        : { x: -200, duration: 200 };

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
        <!-- Trigger Button -->
        {#if !isOpen}
            <!-- Standard/Transparent Trigger: Vertical Strip -->
            {#if !isFloating}
                <div
                    role="button"
                    tabindex="0"
                    class="h-full w-10 border-r border-[var(--border-color)] flex flex-col items-center py-4 cursor-pointer hover:bg-[var(--bg-secondary)] transition-colors pointer-events-auto outline-none focus:bg-[var(--bg-secondary)]"
                    class:bg-[var(--bg-tertiary)]={true}
                    on:click={toggle}
                    on:keydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
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
            {:else}
                <!-- Floating Trigger: Circle Icon -->
                <button
                    class="w-12 h-12 rounded-full bg-[var(--accent-color)] text-[var(--btn-accent-text)] shadow-lg flex items-center justify-center hover:opacity-90 transition-all pointer-events-auto z-[61]"
                    on:click={toggle}
                    title="Open {$settingsStore.sidePanelMode === 'chat' ? 'Chat' : 'Notes'}"
                >
                    {#if $settingsStore.sidePanelMode === 'chat'}
                        {@html icons.messageSquare || '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>'}
                    {:else}
                         {@html icons.edit || '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>'}
                    {/if}
                </button>
            {/if}
        {/if}

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
                style={isTransparent ? 'background-color: rgba(0,0,0,0.6);' : ''}
            >
                <!-- Header -->
                <div class="h-12 border-b border-[var(--border-color)] flex items-center justify-between px-4"
                     class:bg-[var(--bg-secondary)]={isStandard}
                     class:bg-transparent={isTransparent}
                >
                    <h3 class="font-bold text-[var(--text-primary)]">
                        {$settingsStore.sidePanelMode === 'chat' ? 'Global Chat' : 'My Notes'}
                    </h3>
                    <button class="text-[var(--text-secondary)] hover:text-[var(--text-primary)]" on:click={toggle}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <!-- Messages Area -->
                <div
                    bind:this={messagesContainer}
                    class="flex-1 overflow-y-auto p-4 flex flex-col gap-2"
                    class:bg-transparent={isTransparent || isFloating}
                >
                    {#each $chatStore.messages as msg (msg.id)}
                        <div class="flex flex-col animate-fade-in text-sm">
                            <div class="flex items-baseline justify-between mb-0.5">
                                <span class="text-[10px] text-[var(--text-tertiary)] font-mono">
                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                </span>
                            </div>
                            <div class="p-2 rounded bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border-color)] break-words"
                                 class:bg-opacity-80={isTransparent}
                            >
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
                <div class="p-3 border-t border-[var(--border-color)]"
                     class:bg-[var(--bg-secondary)]={isStandard || isFloating}
                     class:bg-transparent={isTransparent}
                >
                    {#if errorMessage}
                        <div class="text-xs text-[var(--danger-color)] mb-2 animate-pulse">{errorMessage}</div>
                    {/if}
                    <div class="relative">
                        <input
                            bind:this={inputEl}
                            type="text"
                            class="w-full border border-[var(--border-color)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-color)] pr-10"
                            class:bg-[var(--bg-primary)]={!isTransparent}
                            class:bg-black={isTransparent}
                            class:bg-opacity-50={isTransparent}
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
