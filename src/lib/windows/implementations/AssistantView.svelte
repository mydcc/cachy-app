<script lang="ts">
    import { onMount, untrack } from "svelte";
    import { chatState } from "../../../stores/chat.svelte";
    import { notesState } from "../../../stores/notes.svelte";
    import { aiState } from "../../../stores/ai.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { tradeState } from "../../../stores/trade.svelte";
    import { _ } from "../../../locales/i18n";
    import { icons } from "../../../lib/constants";
    import { marked } from "marked";
    // @ts-ignore
    import DOMPurify from "dompurify";
    import type { WindowBase } from "../WindowBase.svelte";

    interface Props {
        window: WindowBase;
    }

    let { window: win }: Props = $props();

    let inputEl: HTMLInputElement | HTMLTextAreaElement | undefined = $state();
    let messagesContainer: HTMLDivElement | undefined = $state();
    let messageText = $state("");
    let isSending = $state(false);
    let errorMessage = $state("");

    // Scroll to bottom on new messages
    $effect(() => {
        if (
            messagesContainer &&
            (aiState.messages.length ||
                notesState.messages.length ||
                chatState.messages.length)
        ) {
            // Small timeout to ensure DOM is updated
            setTimeout(() => {
                if (messagesContainer)
                    messagesContainer.scrollTop =
                        messagesContainer.scrollHeight;
            }, 0);
        }
    });

    let errorTimeout: ReturnType<typeof setTimeout> | undefined;

    async function handleSend() {
        if (!messageText.trim()) return;

        // Pre-check for API key in AI mode
        const mode = settingsState.sidePanelMode;
        if (mode === "ai" && !hasApiKey) {
            errorMessage = "API key missing. Please check settings.";
            return;
        }

        isSending = true;
        errorMessage = "";

        try {
            if (mode === "ai") {
                await aiState.sendMessage(messageText);
            } else if (mode === "notes") {
                notesState.addNote(messageText);
            } else {
                await chatState.sendMessage(messageText);
            }
            messageText = "";
        } catch (e: any) {
            errorMessage = e.message || "Error";
            // Critical fix: Do NOT auto-clear error after 3s.
            // Users need to see what went wrong.
            // if (errorTimeout) clearTimeout(errorTimeout);
            // errorTimeout = setTimeout(() => (errorMessage = ""), 3000);
        } finally {
            isSending = false;
            // Keep focus only if not error?
            // Actually nice to keep focus to retry.
            if (inputEl) inputEl.focus();
        }
    }

    // Cleanup effect
    $effect(() => {
        return () => {
            if (errorTimeout) clearTimeout(errorTimeout);
        };
    });

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

    function cleanStreamingContent(text: string): string {
        return text
            .replace(/```json\s*[\s\S]*?("action"|$)[\s\S]*?(?:```|$)/g, "")
            .trim();
    }

    function renderMarkdown(text: string): string {
        try {
            const cleaned = cleanStreamingContent(text);
            const raw = marked.parse(cleaned) as string;
            if (typeof window !== "undefined") {
                return DOMPurify.sanitize(raw);
            }
            return "";
        } catch (e) {
            console.error("Markdown rendering error:", e);
            return text;
        }
    }

    let styleMode = $derived(settingsState.chatStyle || "minimal");
    let isTerminal = $derived(styleMode === "terminal");
    let isBubble = $derived(styleMode === "bubble");
    let isMinimal = $derived(styleMode === "minimal");
    let isAiMode = $derived(settingsState.sidePanelMode === "ai");
    let contextData = $derived(aiState.lastContext);

    let hasApiKey = $derived.by(() => {
        const provider = settingsState.aiProvider;
        if (provider === "gemini") return !!settingsState.geminiApiKey;
        if (provider === "openai") return !!settingsState.openaiApiKey;
        if (provider === "anthropic") return !!settingsState.anthropicApiKey;
        return false;
    });

    function adjustTextareaHeight(el: HTMLTextAreaElement) {
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }

    $effect(() => {
        if (inputEl && messageText === "") {
            inputEl.style.height = "auto";
        }
    });

    function changeFontSize(delta: number) {
        win.setFontSize(win.fontSize + delta);
    }

    function copyToClipboard(text: string) {
        if (typeof navigator !== "undefined") {
            navigator.clipboard.writeText(text);
        }
    }

    function cycleMode() {
        win.onHeaderTitleClick();
    }
</script>

<div class="assistant-container">
    <!-- Redundant header removed - now in Titlebar -->

    <!-- Messages Area -->
    <div
        bind:this={messagesContainer}
        class="messages-area"
        class:bg-black={isTerminal}
        class:bg-[var(--chat-messages-bg)]={!isTerminal}
    >
        {#if settingsState.sidePanelMode === "ai"}
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
                    {#if !isBubble && !isActionMsg}
                        <div
                            class="mb-1 text-[10px] uppercase font-bold tracking-wider opacity-60"
                        >
                            {msg.role === "user" ? "You" : "AI"}
                        </div>
                    {/if}

                    <div
                        class="message-content group"
                        style="font-size: {win.fontSize}px"
                        class:role-user={msg.role === "user"}
                        class:role-ai={msg.role === "assistant"}
                        class:is-terminal={isTerminal}
                        class:is-bubble={isBubble}
                        class:is-minimal={isMinimal}
                        class:is-action={isActionMsg}
                    >
                        <button
                            class="copy-btn"
                            class:left={msg.role === "user"}
                            class:right={msg.role !== "user"}
                            onclick={() => copyToClipboard(msg.content)}
                            title="Copy Content"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="h-3 w-3"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                ><rect
                                    x="9"
                                    y="9"
                                    width="13"
                                    height="13"
                                    rx="2"
                                    ry="2"
                                /><path
                                    d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                /></svg
                            >
                        </button>

                        {#if msg.role === "assistant"}
                            <div
                                class="markdown-content"
                                class:terminal-md={isTerminal}
                            >
                                {@html renderMarkdown(msg.content)}
                            </div>
                        {:else if msg.role === "system"}
                            {@const pendingMatch =
                                msg.content.match(/\[PENDING:([^\]]+)\]/)}
                            {#if pendingMatch}
                                {@const pendingId = pendingMatch[1]}
                                {@const pending =
                                    aiState.pendingActions.get(pendingId)}
                                {#if pending}
                                    <div class="action-confirmation-block">
                                        <div class="action-table-container">
                                            <table class="action-mini-table">
                                                <thead
                                                    ><tr
                                                        ><th colspan="2"
                                                            >Vorgeschlagene
                                                            Änderungen</th
                                                        ></tr
                                                    ></thead
                                                >
                                                <tbody>
                                                    {#each pending.actions as action}
                                                        <tr
                                                            ><td
                                                                class="action-label"
                                                                >{aiState
                                                                    .describeAction(
                                                                        action,
                                                                    )
                                                                    .split(
                                                                        ": ",
                                                                    )[0]}</td
                                                            ><td
                                                                class="action-value"
                                                                >{aiState
                                                                    .describeAction(
                                                                        action,
                                                                    )
                                                                    .split(
                                                                        ": ",
                                                                    )[1] ||
                                                                    ""}</td
                                                            ></tr
                                                        >
                                                    {/each}
                                                </tbody>
                                            </table>
                                        </div>
                                        <div class="flex gap-2 mt-2">
                                            <button
                                                class="confirm-btn"
                                                onclick={() =>
                                                    aiState.confirmAction(
                                                        pendingId,
                                                    )}>Anwenden</button
                                            >
                                            <button
                                                class="reject-btn"
                                                onclick={() =>
                                                    aiState.rejectAction(
                                                        pendingId,
                                                    )}>Ignorieren</button
                                            >
                                        </div>
                                    </div>
                                {/if}
                            {:else if msg.content.includes("[✅") || msg.content.includes("[❌")}
                                <div class="text-[0.7rem] opacity-50 italic">
                                    {msg.content.replace(/\[|\]/g, "")}
                                </div>
                            {:else}
                                <div class="text-[0.75rem] opacity-60">
                                    {msg.content}
                                </div>
                            {/if}
                        {:else}
                            {msg.content}
                        {/if}
                    </div>
                    <span class="timestamp"
                        >{new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                        })}</span
                    >
                </div>
            {/each}

            {#if aiState.isStreaming}
                <div class="flex flex-col items-start animate-pulse">
                    {#if isTerminal}<span class="text-xs text-green-500 blink"
                            >_ PROCESSING...</span
                        >
                    {:else}<span
                            class="text-[10px] uppercase font-bold text-[var(--accent-color)]"
                            >Thinking...</span
                        >{/if}
                </div>
            {/if}

            {#if aiState.messages.length === 0}
                <div class="empty-state">
                    {#if isTerminal}<p class="text-xs text-green-800">
                            SYSTEM READY. AWAITING INPUT.
                        </p>
                    {:else}<p
                            class="text-xs font-medium text-[var(--text-secondary)]"
                        >
                            Ready to assist.
                        </p>{/if}
                </div>
            {/if}
        {:else if settingsState.sidePanelMode === "notes"}
            {#each notesState.messages as msg (msg.id)}
                <div class="note-card group">
                    <div class="note-text" style="font-size: {win.fontSize}px">
                        {msg.text}
                    </div>
                    <div class="note-date">
                        {new Date(msg.timestamp).toLocaleString()}
                    </div>
                </div>
            {/each}
        {:else}
            <div class="chat-status">--- Connected to Global Chat ---</div>
            {#each chatState.messages.filter((m) => {
                if (m.sender === "system") return true;
                if (m.clientId === chatState.clientId) return true;
                if (m.profitFactor === undefined) return true;
                return m.profitFactor >= (settingsState.minChatProfitFactor || 0);
            }) as msg (msg.id)}
                <div class="chat-msg">
                    {#if msg.sender === "system"}
                        <div class="system-msg">--- {msg.text} ---</div>
                    {:else}
                        {@const isMe =
                            msg.clientId === chatState.clientId ||
                            msg.senderId === "me"}
                        <div class="flex flex-col">
                            <span class="msg-sender" class:is-me={isMe}>
                                <span>{isMe ? "You" : "User"}</span>
                                {#if msg.profitFactor !== undefined}<span
                                        class="pf-badge"
                                        >PF {msg.profitFactor.toFixed(2)}</span
                                    >{/if}
                            </span>
                            <span
                                class="msg-text"
                                style="font-size: {win.fontSize}px"
                                >{msg.text}</span
                            >
                            <span class="timestamp"
                                >{new Date(msg.timestamp).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                )}</span
                            >
                        </div>
                    {/if}
                </div>
            {/each}
        {/if}
    </div>

    <!-- Missing Key Overlay -->
    {#if isAiMode && !hasApiKey}
        <div
            class="absolute inset-0 z-20 flex items-center justify-center bg-black/50 backdrop-blur-sm p-8"
        >
            <div
                class="bg-[var(--bg-secondary)] border border-[var(--border-color)] rounded-xl p-6 text-center shadow-2xl max-w-sm"
            >
                <div class="text-3xl mb-3">🔑</div>
                <h3 class="text-lg font-bold mb-2">Setup Required</h3>
                <p class="text-sm opacity-70 mb-4">
                    Please configure your <b>{settingsState.aiProvider}</b> API Key
                    in Settings to use the AI Assistant.
                </p>
            </div>
        </div>
    {/if}

    <!-- Input Area -->
    <div
        class="input-area"
        class:border-green-900={isTerminal}
        class:border-[var(--border-color)]={!isTerminal}
    >
        {#if isAiMode}
            <div class="context-indicators">
                <div
                    class="indicator"
                    title="Market Data Available"
                    class:active={contextData?.cmc?.global ||
                        contextData?.technicals}
                >
                    <span>{contextData?.cmc?.global ? "🟢" : "⚪"}</span> Market
                </div>
                <div
                    class="indicator"
                    title="News Data Available"
                    class:active={contextData?.news &&
                        contextData.news.length > 0}
                >
                    <span
                        >{contextData?.news && contextData.news.length > 0
                            ? "🟢"
                            : "⚪"}</span
                    > News
                </div>
            </div>

            {#if !messageText}
                <div class="quick-actions no-scrollbar">
                    <button
                        class="qa-btn"
                        onclick={() => {
                            messageText =
                                "Analysiere den Markt für " +
                                (tradeState.symbol || "BTC");
                            handleSend();
                        }}>📊 Market Check</button
                    >
                    <button
                        class="qa-btn"
                        onclick={() => {
                            messageText =
                                "Erstelle eine technische Analyse für " +
                                (tradeState.symbol || "BTC");
                            handleSend();
                        }}>🧪 Tech Analysis</button
                    >
                    <button
                        class="qa-btn"
                        onclick={() => {
                            messageText =
                                "Prüfe mein Setup auf Fehler und Risiken.";
                            handleSend();
                        }}>⚠️ Risk Audit</button
                    >
                    <button
                        class="qa-btn"
                        onclick={() => {
                            messageText = "Gibt es wichtige News?";
                            handleSend();
                        }}>📰 News check</button
                    >
                </div>
            {/if}
        {/if}

        {#if errorMessage}
            {@const isRateLimit =
                errorMessage.toLowerCase().includes("quota") ||
                errorMessage.includes("429")}
            <div
                class="error-msg"
                class:is-danger={!isRateLimit}
                class:is-warning={isRateLimit}
            >
                {#if isRateLimit}<div
                        class="flex items-center gap-1.5 opacity-90"
                    >
                        <span>⚠️</span><span
                            >Generative AI Quota exceeded. Please try again
                            later.</span
                        >
                    </div>
                {:else}{$_(errorMessage as any) ||
                        errorMessage ||
                        aiState.error}{/if}
            </div>
        {/if}

        <div class="input-wrapper">
            {#if isAiMode || settingsState.sidePanelMode === "notes"}
                <textarea
                    bind:this={inputEl}
                    rows="1"
                    class="main-input textarea"
                    style="font-size: {win.fontSize}px"
                    class:is-terminal={isTerminal}
                    class:is-standard={!isTerminal}
                    placeholder={settingsState.sidePanelMode === "ai"
                        ? isTerminal
                            ? "> ENTER COMMAND"
                            : "Message AI..."
                        : "Type note..."}
                    bind:value={messageText}
                    onkeydown={handleKeydown}
                    oninput={(e) =>
                        adjustTextareaHeight(e.target as HTMLTextAreaElement)}
                    disabled={isSending ||
                        (settingsState.sidePanelMode === "ai" &&
                            aiState.isStreaming)}
                ></textarea>
            {:else}
                <input
                    bind:this={inputEl}
                    type="text"
                    class="main-input text-input"
                    style="font-size: {win.fontSize}px"
                    class:is-terminal={isTerminal}
                    class:is-bubble={isBubble}
                    class:is-standard={!isTerminal}
                    placeholder="Type here..."
                    bind:value={messageText}
                    onkeydown={handleKeydown}
                    disabled={isSending}
                />
            {/if}

            {#if !isTerminal}
                <button
                    class="send-btn"
                    onclick={handleSend}
                    disabled={!messageText.trim()}
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

<style>
    .assistant-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        min-height: 0;
        background: transparent;
        font-size: inherit;
        position: relative;
    }

    .messages-area {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        scroll-behavior: smooth;
    }

    .message-content {
        position: relative;
        max-width: 90%;
        line-height: 1.5;
        transition: all 0.2s;
        font-size: inherit;
    }

    .message-content.is-bubble {
        padding: 10px 16px;
        border-radius: 18px;
    }

    .message-content.is-bubble.role-user {
        background: linear-gradient(135deg, var(--accent-color), #4f46e5);
        color: white;
        border-bottom-right-radius: 4px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    }

    .message-content.is-bubble.role-ai {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-bottom-left-radius: 4px;
    }

    .message-content.is-minimal.role-user {
        color: var(--accent-color);
    }

    .message-content.is-terminal {
        width: 100%;
        font-family: monospace;
    }

    .message-content.is-terminal.role-user {
        color: #4ade80;
        text-align: right;
    }
    .message-content.is-terminal.role-ai {
        color: #16a34a;
    }

    .copy-btn {
        position: absolute;
        top: -8px;
        padding: 4px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        opacity: 0;
        transition: opacity 0.2s;
        cursor: pointer;
        z-index: 10;
    }

    .message-content:hover .copy-btn {
        opacity: 1;
    }
    .copy-btn.left {
        left: -30px;
    }
    .copy-btn.right {
        right: -30px;
    }

    .timestamp {
        font-size: 9px;
        opacity: 0.4;
        margin-top: 4px;
        font-family: monospace;
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        opacity: 0.3;
    }

    .note-card {
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        padding: 12px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
    }

    .note-date {
        font-size: 9px;
        opacity: 0.5;
        text-align: right;
        margin-top: 8px;
    }

    .chat-msg {
        padding: 4px 8px;
        background: rgba(255, 255, 255, 0.02);
        border-left: 3px solid var(--accent-color);
        border-radius: 0 4px 4px 0;
    }

    .pf-badge {
        background: var(--accent-color);
        color: white;
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 8px;
        font-weight: 900;
    }

    .input-area {
        padding: 12px;
        border-top: 1px solid var(--border-color);
        background: rgba(0, 0, 0, 0.1);
    }

    .context-indicators {
        display: flex;
        gap: 12px;
        margin-bottom: 8px;
        font-size: 10px;
        opacity: 0.5;
    }

    .quick-actions {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        margin-bottom: 8px;
        padding-bottom: 4px;
    }

    .qa-btn {
        white-space: nowrap;
        font-size: 10px;
        font-weight: 700;
        padding: 4px 12px;
        border-radius: 20px;
        border: 1px solid var(--accent-color);
        background: var(--accent-color);
        color: white;
        cursor: pointer;
    }

    .main-input {
        width: 100%;
        background: var(--bg-primary);
        border: 1px solid var(--border-color);
        padding: 8px 40px 8px 12px;
        outline: none;
        transition: border-color 0.2s;
    }

    .main-input.is-standard {
        border-radius: 12px;
    }
    .main-input.is-bubble {
        border-radius: 20px;
    }
    .main-input.is-terminal {
        background: black;
        border-color: #166534;
        color: #4ade80;
        font-family: monospace;
    }
    .main-input:focus {
        border-color: var(--accent-color);
    }

    .send-btn {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        background: transparent;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
    }

    .send-btn:hover {
        color: var(--accent-color);
    }

    .input-wrapper {
        position: relative;
    }

    .blink {
        animation: blinker 1s linear infinite;
    }
    @keyframes blinker {
        50% {
            opacity: 0;
        }
    }

    /* Markdown & Actions */
    .markdown-content :global(p) {
        margin-bottom: 0.5em;
    }
    .action-confirmation-block {
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        padding: 10px;
        border-radius: 8px;
        margin-top: 8px;
    }
    .action-mini-table {
        width: 100%;
        font-size: 11px;
    }
    .confirm-btn {
        background: var(--accent-color);
        color: white;
        border: none;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
    }
    .reject-btn {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        margin-left: 4px;
    }

    .no-scrollbar::-webkit-scrollbar {
        display: none;
    }
    .no-scrollbar {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
</style>
