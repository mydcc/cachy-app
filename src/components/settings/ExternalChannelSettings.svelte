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

<!--
  External notification channels — FEAT-0397.

  Three channels the trader points at services they own: Mailgun for e-mail, a
  Discord webhook, a Telegram bot. Each is set up here and then chosen per event
  in the notification list above, on the same channel toggles as in-app, browser
  and sound — one policy, not two.

  What this screen refuses to do is call the credentials encrypted. They are not.
  Encrypting them under a key the app also holds would be obfuscation, and the
  honest alternative — a passphrase — would mean alarms cannot fire while the app
  is locked. So the trade-off is stated at the top, where the trader can decide
  whether this device is one they want to keep a bot token on. See ADR-0018.

  The per-channel row lives in `ExternalChannelCard.svelte`; only the credential
  fields differ, and a copy of that row per channel is how one of them would
  quietly stop reporting failures.
-->

<script lang="ts">
  import { _ } from "../../locales/i18n";
  import ExternalChannelCard from "./ExternalChannelCard.svelte";
  import { externalChannelsStore } from "../../stores/externalChannels.svelte";
  import { externalDeliveryLog } from "../../stores/externalDeliveryLog.svelte";
  import { fetchTelegramChats } from "../../services/externalDelivery";

  const config = $derived(externalChannelsStore.config);

  const CHANNEL_LABEL_KEYS = {
    email: "settings.notifications.channelEmail",
    discord: "settings.notifications.channelDiscord",
    telegram: "settings.notifications.channelTelegram",
  } as const;

  /** Empty while idle, a key once a lookup has something to say. */
  let chatLookupNote = $state("");
  let lookingUpChats = $state(false);

  /*
   * Telegram only reports a chat while a recent message from it is still in the
   * bot's update queue, so the result is cached rather than re-fetched — and a
   * failed lookup must not wipe the list the trader is choosing from.
   */
  async function lookupChats(): Promise<void> {
    lookingUpChats = true;
    chatLookupNote = "";
    try {
      const chats = await fetchTelegramChats(config.telegram.botToken);
      if (chats === null) {
        chatLookupNote = $_("settings.externalChannels.telegram.lookupFailed");
        return;
      }
      if (chats.length === 0) {
        chatLookupNote = $_("settings.externalChannels.telegram.lookupEmpty");
        return;
      }
      externalChannelsStore.setTelegramChats(chats);
    } finally {
      lookingUpChats = false;
    }
  }

  const FIELD_CLASS =
    "mt-1 w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]";
</script>

<section class="settings-section">
  <h3 class="section-title mb-3">{$_("settings.externalChannels.title")}</h3>

  <p class="text-[11px] mb-2 text-[var(--text-secondary)]">
    {$_("settings.externalChannels.intro")}
  </p>

  <p
    class="text-[11px] mb-3 rounded-lg border border-[var(--warning-color)] bg-[var(--bg-secondary)] p-3 font-semibold text-[var(--warning-color)]"
    data-testid="external-storage-warning"
  >
    {$_("settings.externalChannels.storageWarning")}
  </p>

  {#if externalChannelsStore.persistFailed}
    <p class="text-[11px] mb-3 font-semibold text-[var(--danger-color)]">
      {$_("settings.notifications.persistFailed")}
    </p>
  {/if}

  <ExternalChannelCard
    channel="email"
    title={$_("settings.externalChannels.email.title")}
    hint={$_("settings.externalChannels.email.hint")}
    enabled={config.email.enabled}
    onEnabledChange={(enabled) => externalChannelsStore.setEmail({ enabled })}
    onClear={() => externalChannelsStore.clear("email")}
  >
    {#snippet fields()}
      <label class="block text-[11px] text-[var(--text-secondary)]">
        {$_("settings.externalChannels.email.domain")}
        <input
          class={FIELD_CLASS}
          type="text"
          autocomplete="off"
          value={config.email.domain}
          oninput={(e) =>
            externalChannelsStore.setEmail({
              domain: (e.currentTarget as HTMLInputElement).value,
            })}
        />
      </label>
      <label class="block text-[11px] text-[var(--text-secondary)]">
        {$_("settings.externalChannels.email.apiKey")}
        <input
          class={FIELD_CLASS}
          type="password"
          autocomplete="off"
          value={config.email.apiKey}
          oninput={(e) =>
            externalChannelsStore.setEmail({
              apiKey: (e.currentTarget as HTMLInputElement).value,
            })}
        />
      </label>
      <label class="block text-[11px] text-[var(--text-secondary)]">
        {$_("settings.externalChannels.email.from")}
        <input
          class={FIELD_CLASS}
          type="email"
          autocomplete="off"
          value={config.email.from}
          oninput={(e) =>
            externalChannelsStore.setEmail({ from: (e.currentTarget as HTMLInputElement).value })}
        />
      </label>
      <label class="block text-[11px] text-[var(--text-secondary)]">
        {$_("settings.externalChannels.email.to")}
        <input
          class={FIELD_CLASS}
          type="text"
          autocomplete="off"
          value={config.email.to}
          oninput={(e) =>
            externalChannelsStore.setEmail({ to: (e.currentTarget as HTMLInputElement).value })}
        />
      </label>
    {/snippet}
  </ExternalChannelCard>

  <ExternalChannelCard
    channel="discord"
    title={$_("settings.externalChannels.discord.title")}
    hint={$_("settings.externalChannels.discord.hint")}
    enabled={config.discord.enabled}
    onEnabledChange={(enabled) => externalChannelsStore.setDiscord({ enabled })}
    onClear={() => externalChannelsStore.clear("discord")}
  >
    {#snippet fields()}
      <label class="block text-[11px] text-[var(--text-secondary)] sm:col-span-2">
        {$_("settings.externalChannels.discord.webhookUrl")}
        <input
          class={FIELD_CLASS}
          type="password"
          autocomplete="off"
          value={config.discord.webhookUrl}
          oninput={(e) =>
            externalChannelsStore.setDiscord({
              webhookUrl: (e.currentTarget as HTMLInputElement).value,
            })}
        />
      </label>
      <label class="block text-[11px] text-[var(--text-secondary)]">
        {$_("settings.externalChannels.discord.format")}
        <select
          class={FIELD_CLASS}
          value={config.discord.format}
          onchange={(e) =>
            externalChannelsStore.setDiscord({
              format:
                (e.currentTarget as HTMLSelectElement).value === "detailed"
                  ? "detailed"
                  : "minimal",
            })}
        >
          <option value="minimal">{$_("settings.externalChannels.discord.formatMinimal")}</option>
          <option value="detailed">{$_("settings.externalChannels.discord.formatDetailed")}</option>
        </select>
      </label>
    {/snippet}
  </ExternalChannelCard>

  <ExternalChannelCard
    channel="telegram"
    title={$_("settings.externalChannels.telegram.title")}
    hint={$_("settings.externalChannels.telegram.hint")}
    enabled={config.telegram.enabled}
    onEnabledChange={(enabled) => externalChannelsStore.setTelegram({ enabled })}
    onClear={() => externalChannelsStore.clear("telegram")}
  >
    {#snippet fields()}
      <label class="block text-[11px] text-[var(--text-secondary)]">
        {$_("settings.externalChannels.telegram.botToken")}
        <input
          class={FIELD_CLASS}
          type="password"
          autocomplete="off"
          value={config.telegram.botToken}
          oninput={(e) =>
            externalChannelsStore.setTelegram({
              botToken: (e.currentTarget as HTMLInputElement).value,
            })}
        />
      </label>
      <label class="block text-[11px] text-[var(--text-secondary)]">
        {$_("settings.externalChannels.telegram.chatId")}
        <input
          class={FIELD_CLASS}
          type="text"
          autocomplete="off"
          value={config.telegram.chatId}
          oninput={(e) =>
            externalChannelsStore.setTelegram({
              chatId: (e.currentTarget as HTMLInputElement).value,
            })}
        />
      </label>

      <div class="sm:col-span-2">
        <p class="text-[11px] text-[var(--text-secondary)]">
          {$_("settings.externalChannels.telegram.lookupChatsHint")}
        </p>
        <div class="mt-1 flex flex-wrap items-end gap-2">
          <button
            type="button"
            class="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors disabled:opacity-50"
            disabled={!config.telegram.botToken.trim() || lookingUpChats}
            onclick={lookupChats}
          >
            {lookingUpChats
              ? $_("settings.externalChannels.testing")
              : $_("settings.externalChannels.telegram.lookupChats")}
          </button>

          {#if config.telegram.knownChats.length > 0}
            <label class="block text-[11px] text-[var(--text-secondary)]">
              {$_("settings.externalChannels.telegram.chatPick")}
              <select
                class={FIELD_CLASS}
                value={config.telegram.chatId}
                onchange={(e) =>
                  externalChannelsStore.setTelegram({
                    chatId: (e.currentTarget as HTMLSelectElement).value,
                  })}
              >
                {#each config.telegram.knownChats as chat (chat.id)}
                  <option value={chat.id}>{chat.name} ({chat.id})</option>
                {/each}
              </select>
            </label>
          {/if}
        </div>

        {#if chatLookupNote}
          <p class="mt-1 text-[11px] font-semibold text-[var(--warning-color)]">{chatLookupNote}</p>
        {/if}
      </div>
    {/snippet}
  </ExternalChannelCard>

  <!--
    The log is the acceptance criterion "log the reason in the UI (not silent)".
    It only appears once something has been sent, so an untouched settings screen
    does not carry an empty box explaining itself.
  -->
  {#if externalDeliveryLog.entries.length > 0}
    <div class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-semibold text-[var(--text-primary)]">
          {$_("settings.externalChannels.logTitle")}
        </span>
        <button
          type="button"
          class="px-2 py-1 text-[11px] font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:border-[var(--accent-color)] transition-colors"
          onclick={() => externalDeliveryLog.clear()}
        >
          {$_("settings.externalChannels.logClear")}
        </button>
      </div>
      <ul class="mt-2 space-y-1" data-testid="external-delivery-log">
        {#each externalDeliveryLog.entries as entry, i (`${entry.channel}-${entry.atMs}-${i}`)}
          <li class="text-[11px] text-[var(--text-secondary)]">
            <span class="font-semibold text-[var(--text-primary)]">
              {$_(CHANNEL_LABEL_KEYS[entry.channel])}
            </span>
            · {new Date(entry.atMs).toLocaleTimeString()}
            {#if entry.test}· {$_("settings.externalChannels.logTest")}{/if}
            ·
            <span class={entry.ok ? "text-[var(--success-color)]" : "text-[var(--danger-color)]"}>
              {entry.ok
                ? $_("settings.externalChannels.testSent")
                : entry.reason
                  ? $_(`settings.externalChannels.failures.${entry.reason}`)
                  : (entry.detail ?? "")}
            </span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>
