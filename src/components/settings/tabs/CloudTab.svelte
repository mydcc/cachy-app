<script lang="ts">
  import { cloudService } from '../../../services/cloudService';
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
  <h3 class="text-lg font-bold">Community Cloud (Beta)</h3>

  <div class="p-4 border border-gray-700 rounded bg-gray-900/50">
    <p class="text-sm text-gray-400 mb-2">Connect to SpacetimeDB to chat with other traders.</p>
    <button onclick={connect} class="px-4 py-2 bg-blue-600 rounded hover:bg-blue-500 cursor-pointer text-white font-medium transition-colors">
      Connect to Local Cloud
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
        <div class="text-gray-600 italic text-center mt-10">No messages yet.</div>
    {/if}
  </div>

  <div class="flex gap-2">
    <input bind:value={messageText} placeholder="Say hello..." class="flex-1 p-2 bg-gray-800 border border-gray-700 rounded text-white focus:outline-none focus:border-blue-500 transition-colors" />
    <button onclick={send} class="px-4 py-2 bg-green-600 rounded hover:bg-green-500 cursor-pointer text-white font-medium transition-colors">Send</button>
  </div>
</div>
