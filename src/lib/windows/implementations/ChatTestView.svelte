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
    import { _ } from "../../../locales/i18n";
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
        <button>{$_("common.sendBtn")}</button>
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
