<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
  import { cloudService } from '../../../services/cloudService';
  import { _ } from '../../../locales/i18n';
  import { onMount } from 'svelte';

  let connected = $state(false);
  let messages = $state<any[]>([]);
  let messageText = $state("");

  onMount(() => {
    cloudService.subscribeMessages((msgs) => {
        messages = msgs;
    });
  });

  function connect() {
    cloudService.connect();
    connected = true;
  }

  function send() {
    if(!messageText) return;
    cloudService.sendMessage(messageText);
    messageText = "";
  }
</script>

<div class="space-y-4">
  <h3 class="text-lg font-bold">{$_("cloud.title")}</h3>

  <div class="p-4 border border-gray-700 rounded bg-gray-900/50">
    <p class="text-sm text-gray-400 mb-2">{$_("cloud.description")}</p>
    <button onclick={connect} class="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 cursor-pointer text-white font-medium transition-colors">
      {$_("cloud.connectButton")}
    </button>
  </div>

  <div class="border border-gray-700 rounded p-4 h-48 overflow-y-auto bg-black/80 font-mono text-sm">
    {#each messages as msg}
      <div class="mb-1 border-b border-gray-800 pb-1 last:border-0">
        <span class="text-green-500 text-xs font-bold opacity-70">
            {typeof msg.sender === 'string' ? msg.sender.substring(0,8) : 'Unknown'}:
        </span>
        <span class="text-gray-300 ml-2">{msg.text}</span>
      </div>
    {/each}
    {#if messages.length === 0}
        <div class="text-gray-600 italic text-center mt-10">{$_("cloud.noMessages")}</div>
    {/if}
  </div>

  <div class="flex gap-2">
    <input bind:value={messageText} placeholder={$_("cloud.placeholder")} class="flex-1 p-2 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500 transition-colors" />
    <button onclick={send} class="px-4 py-2 bg-green-600 rounded hover:bg-green-500 cursor-pointer text-white font-medium transition-colors">{$_("cloud.sendButton")}</button>
  </div>
</div>
