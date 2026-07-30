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
  import { cloudService, type CloudStatus } from '../../../services/cloudService';
  import { settingsState } from '../../../stores/settings.svelte';
  import { _ } from '../../../locales/i18n';
  import type { Infer } from 'spacetimedb';
  import type GlobalMessageType from '../../../lib/spacetimedb/global_message_type';

  type GlobalMessage = Infer<typeof GlobalMessageType>;

  let messages = $state<GlobalMessage[]>([]);
  let messageText = $state("");
  let errorMsg = $state("");
  let status = $state<CloudStatus>({ connected: false, lastError: null, mySenderId: null });

  const connected = $derived(status.connected);

  $effect(() => {
    cloudService.subscribeMessages((msgs) => {
      messages = msgs;
    });
    cloudService.subscribeStatus((s) => {
      status = s;
    });

    return () => {
      cloudService.subscribeMessages(() => {});
      cloudService.subscribeStatus(() => {});
    };
  });

  async function connect() {
    errorMsg = "";
    try {
      await cloudService.connect(
        settingsState.cloudHost,
        settingsState.cloudDbName,
        settingsState.cloudToken,
      );
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : $_("cloud.connectionFailed");
    }
  }

  function send() {
    if (!messageText) return;
    cloudService.sendMessage(messageText);
    messageText = "";
  }
</script>

<div class="space-y-4">
  <h3 class="text-lg font-bold" style="color: var(--text-primary);">
    {$_("cloud.title")}
  </h3>

  <!--
    ADR-0001 requires Global Chat to be opt-in, off by default, authenticated,
    minimal and non-essential. The four conditions are stated here rather than
    only in a document, because this tab is where someone decides to turn it on.
  -->
  <div class="cloud-panel">
    <p class="text-sm" style="color: var(--text-secondary);">
      {$_("cloud.description")}
    </p>

    <label class="cloud-toggle">
      <input type="checkbox" bind:checked={settingsState.cloudEnabled} />
      <span>{$_("cloud.enableLabel")}</span>
    </label>

    <p class="text-xs" style="color: var(--text-secondary);">
      {settingsState.cloudEnabled
        ? $_("cloud.stateOn")
        : $_("cloud.stateOff")}
    </p>

    <ul class="cloud-conditions">
      <li>{$_("cloud.conditionOptIn")}</li>
      <li>{$_("cloud.conditionAuthenticated")}</li>
      <li>{$_("cloud.conditionMinimal")}</li>
      <li>{$_("cloud.conditionNonEssential")}</li>
    </ul>
  </div>

  {#if settingsState.cloudEnabled}
    <div class="cloud-panel">
      <label class="cloud-field">
        <span>{$_("cloud.hostLabel")}</span>
        <input
          bind:value={settingsState.cloudHost}
          type="text"
          spellcheck="false"
          placeholder="http://127.0.0.1:3000"
          disabled={connected}
        />
      </label>

      <label class="cloud-field">
        <span>{$_("cloud.dbNameLabel")}</span>
        <input
          bind:value={settingsState.cloudDbName}
          type="text"
          spellcheck="false"
          placeholder="cachy-server"
          disabled={connected}
        />
      </label>

      {#if !connected}
        <label class="cloud-field">
          <span>{$_("cloud.tokenLabel")}</span>
          <input bind:value={settingsState.cloudToken} type="password" placeholder="Token" />
        </label>
        <p class="text-xs" style="color: var(--text-secondary);">
          {$_("cloud.tokenHelp")}
        </p>
        <button onclick={connect} class="cloud-button bg-accent-paired hover-bg-accent-paired">
          {$_("cloud.connectButton")}
        </button>
      {:else}
        <p class="text-sm" style="color: var(--success-color);">
          {$_("connection.connected")}
        </p>
      {/if}

      {#if errorMsg || status.lastError}
        <p class="text-sm" style="color: var(--danger-color);">
          {errorMsg || status.lastError}
        </p>
        <p class="text-xs" style="color: var(--text-secondary);">
          {$_("cloud.offlineNotice")}
        </p>
      {/if}
    </div>

    <div class="cloud-log">
      {#each messages as msg}
        <div class="cloud-log-row">
          <span class="cloud-log-sender">
            {typeof msg.sender === 'string' ? msg.sender.substring(0, 8) : 'Unknown'}:
          </span>
          <span style="color: var(--text-primary);">{msg.text}</span>
        </div>
      {/each}
      {#if messages.length === 0}
        <div class="cloud-log-empty">{$_("cloud.noMessages")}</div>
      {/if}
    </div>

    <div class="flex gap-2">
      <input
        bind:value={messageText}
        placeholder={$_("cloud.placeholder")}
        disabled={!connected}
        class="cloud-input flex-1"
      />
      <button
        onclick={send}
        disabled={!connected}
        class="cloud-button bg-success-paired hover-bg-success-paired"
      >
        {$_("cloud.sendButton")}
      </button>
    </div>
  {/if}
</div>

<style>
  .cloud-panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.375rem;
    background-color: var(--bg-secondary);
  }

  .cloud-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--text-primary);
    cursor: pointer;
  }

  .cloud-conditions {
    margin: 0;
    padding-left: 1.1rem;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--text-secondary);
    list-style: disc;
  }

  .cloud-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .cloud-field input,
  .cloud-input {
    padding: 0.5rem;
    border: 1px solid var(--border-color);
    border-radius: 0.375rem;
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    font-size: 0.875rem;
    transition: border-color 0.15s ease;
  }

  .cloud-field input:focus,
  .cloud-input:focus {
    outline: none;
    border-color: var(--accent-color);
  }

  .cloud-field input:disabled,
  .cloud-input:disabled {
    opacity: 0.5;
  }

  .cloud-button {
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.15s ease;
  }

  .cloud-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cloud-log {
    height: 12rem;
    overflow-y: auto;
    padding: 1rem;
    border: 1px solid var(--border-color);
    border-radius: 0.375rem;
    background-color: var(--bg-tertiary);
    font-family: monospace;
    font-size: 0.875rem;
  }

  .cloud-log-row {
    margin-bottom: 0.25rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid var(--border-color);
  }

  .cloud-log-row:last-child {
    border-bottom: 0;
  }

  .cloud-log-sender {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--accent-color);
  }

  .cloud-log-empty {
    margin-top: 2.5rem;
    text-align: center;
    font-style: italic;
    color: var(--text-secondary);
  }
</style>
