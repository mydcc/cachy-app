<script lang="ts">
    import type { WindowBase } from "../../../lib/windows/WindowBase.svelte";

    interface Props {
        window: WindowBase;
    }

    let { window }: Props = $props();
</script>

<div class="chat-mock">
    <div class="messages">
        <div class="msg system">System: Willkommen im Global Chat.</div>
        <div class="msg">User: Das neue Fenstersystem ist robust!</div>
        <div class="msg admin">Admin: Absolut, Industriestandard erreicht.</div>
    </div>
    <div class="input-area">
        <input type="text" placeholder="Nachricht..." />
        <button>Senden</button>
    </div>
</div>

<style>
    .chat-mock {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--bg-primary);
        padding: 12px;
    }
    .messages {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
        overflow-y: auto;
        margin-bottom: 12px;
    }
    .msg {
        background: rgba(255, 255, 255, 0.05);
        padding: 8px;
        border-radius: 8px;
        font-size: 0.85rem;
    }
    .system {
        color: var(--accent-color);
        font-style: italic;
    }
    .admin {
        color: var(--success-color);
        font-weight: bold;
    }
    .input-area {
        display: flex;
        gap: 8px;
    }
    input {
        flex: 1;
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        outline: none;
    }
    button {
        background: var(--accent-color);
        border: none;
        color: white;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
    }
</style>
