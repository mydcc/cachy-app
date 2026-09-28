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
  Per-category notification channels — FEAT-0025.

  Permission is requested here and only here, at the moment the user switches a
  browser channel on. Asking on startup is what trains people to refuse, and a
  refusal is permanent for the origin — so the ask happens when the answer is
  obviously yes.

  Connection loss is not in this list on purpose. `OfflineBanner` shows it in
  the app regardless of any setting, and offering a switch would imply it can
  be turned off.
-->

<script lang="ts">
  import { _ } from "../../locales/i18n";
  import Toggle from "../shared/Toggle.svelte";
  import { notificationPolicyStore } from "../../stores/notifications.svelte";
  import { notificationService } from "../../services/notificationService.svelte";
  import { soundChannel } from "../../services/soundChannel.svelte";
  import { notificationSoundStore } from "../../stores/notificationSound.svelte";
  import { MAX_SOUND_VOLUME, MIN_SOUND_VOLUME } from "../../lib/notificationTones";
  import {
    isExternalChannel,
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_CHANNELS,
    type NotificationCategory,
    type NotificationChannel,
  } from "../../lib/notificationPolicy";
  import { externalChannelsStore } from "../../stores/externalChannels.svelte";
  import type { ExternalChannelId } from "../../lib/notifications/externalChannels";

  const CHANNEL_LABEL_KEYS = {
    "in-app": "settings.notifications.channelInApp",
    browser: "settings.notifications.channelBrowser",
    sound: "settings.notifications.channelSound",
    email: "settings.notifications.channelEmail",
    discord: "settings.notifications.channelDiscord",
    telegram: "settings.notifications.channelTelegram",
  } as const satisfies Record<NotificationChannel, string>;

  /**
   * An external channel with no credentials has nothing to offer here.
   *
   * It is disabled rather than hidden, with a hint pointing at the section
   * below: a trader looking for "Discord" in this list needs to find out *why*
   * it is not available, and a row that silently is not rendered tells them the
   * feature does not exist.
   */
  function externalProblem(channel: NotificationChannel): boolean {
    if (!isExternalChannel(channel)) return false;
    return externalChannelsStore.problem(channel as ExternalChannelId) !== null;
  }

  let permission = $state(notificationService.permission());

  const soundAvailability = $derived(notificationSoundStore.availability);

  const soundNote = $derived(
    soundAvailability === "unsupported"
      ? $_("settings.notifications.soundUnsupported")
      : soundAvailability === "muted"
        ? $_("settings.notifications.soundMuted")
        : soundAvailability === "locked"
          ? $_("settings.notifications.soundLocked")
          : $_("settings.notifications.soundReady"),
  );

  /*
   * The preview takes the alarm's own code path, from inside this click — which
   * is the user gesture the autoplay rules are waiting for. A preview served by
   * a special case would prove the preview works and nothing about the alarm.
   */
  async function previewTone(): Promise<void> {
    await soundChannel.unlockAndPlay("alarm");
  }

  const rows = $derived(
    NOTIFICATION_CATEGORIES.map((category: NotificationCategory) => ({
      category,
      label: $_(`settings.notifications.categories.${category}`),
      channels: NOTIFICATION_CHANNELS.map((channel: NotificationChannel) => ({
        channel,
        label: $_(CHANNEL_LABEL_KEYS[channel]),
        enabled: notificationPolicyStore.wants(category, channel),
        /*
         * A browser toggle stays operable while permission is merely
         * undecided — switching it on is what triggers the ask. It is only
         * disabled once the browser has actually refused or cannot be asked,
         * because then the switch could not do anything.
         */
        blocked:
          (channel === "browser" && (permission === "denied" || permission === "unsupported")) ||
          /*
           * A sound toggle stays operable while the channel is merely locked by
           * the autoplay rules — that resolves itself on the trader's next
           * click, and disabling the switch would make a temporary state look
           * permanent. Only a browser that cannot play at all blocks it.
           */
          (channel === "sound" && soundAvailability === "unsupported") ||
          externalProblem(channel),
        needsSetup: externalProblem(channel),
      })),
    })),
  );

  const permissionNote = $derived(
    permission === "denied"
      ? $_("settings.notifications.permissionDenied")
      : permission === "unsupported"
        ? $_("settings.notifications.permissionUnsupported")
        : "",
  );

  async function toggle(
    category: NotificationCategory,
    channel: NotificationChannel,
    enabled: boolean,
  ): Promise<void> {
    if (channel === "browser" && enabled) {
      permission = await notificationService.requestPermission();
      // Storing `true` against a refusal would leave a switch that reads on
      // and delivers nothing.
      if (permission !== "granted") return;
    }
    notificationPolicyStore.setChannel(category, channel, enabled);
  }
</script>

<section class="settings-section">
  <h3 class="section-title mb-3">{$_("settings.notifications.title")}</h3>

  <p class="text-[11px] mb-2 text-[var(--text-secondary)]">
    {$_("settings.notifications.intro")}
  </p>

  <p
    class="text-[11px] mb-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3 text-[var(--text-secondary)]"
  >
    {$_("settings.notifications.connectionNote")}
  </p>

  {#if permissionNote}
    <p class="text-[11px] mb-3 font-semibold text-[var(--warning-color)]">{permissionNote}</p>
  {/if}

  {#if notificationPolicyStore.persistFailed}
    <p class="text-[11px] mb-3 font-semibold text-[var(--danger-color)]">
      {$_("settings.notifications.persistFailed")}
    </p>
  {/if}

  <ul class="space-y-2">
    {#each rows as row (row.category)}
      <li class="rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
        <span class="block text-sm font-semibold text-[var(--text-primary)]">{row.label}</span>
        <div class="mt-2 flex flex-wrap gap-4">
          {#each row.channels as ch (ch.channel)}
            <div
              class="flex items-center gap-2"
              title={ch.needsSetup ? $_("settings.notifications.channelNeedsSetup") : undefined}
            >
              <label
                class="text-[11px] cursor-pointer {ch.needsSetup
                  ? 'text-[var(--text-tertiary)] italic'
                  : 'text-[var(--text-secondary)]'}"
                for="notify-{row.category}-{ch.channel}"
              >
                {ch.label}
              </label>
              <Toggle
                id="notify-{row.category}-{ch.channel}"
                checked={ch.enabled}
                disabled={ch.blocked}
                onchange={(e) =>
                  toggle(row.category, ch.channel, (e.currentTarget as HTMLInputElement).checked)}
              />
            </div>
          {/each}
        </div>
      </li>
    {/each}
  </ul>


  <div class="mt-3 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
    <span class="block text-sm font-semibold text-[var(--text-primary)]">
      {$_("settings.notifications.soundTitle")}
    </span>
    <p class="mt-1 text-[11px] text-[var(--text-secondary)]">
      {$_("settings.notifications.soundIntro")}
    </p>

    <!--
      The availability line is the acceptance criterion made visible: while the
      browser has not yet allowed audio, this says so instead of letting the
      toggles above read as an armed channel.
    -->
    <p
      class="mt-2 text-[11px] font-semibold {soundAvailability === 'ready'
        ? 'text-[var(--text-secondary)]'
        : 'text-[var(--warning-color)]'}"
      data-testid="sound-availability"
      data-availability={soundAvailability}
    >
      {soundNote}
    </p>

    {#if notificationSoundStore.persistFailed}
      <p class="mt-2 text-[11px] font-semibold text-[var(--danger-color)]">
        {$_("settings.notifications.persistFailed")}
      </p>
    {/if}

    <div class="mt-3 flex flex-wrap items-center gap-4">
      <div class="flex items-center gap-2">
        <label class="text-[11px] text-[var(--text-secondary)]" for="notify-sound-volume">
          {$_("settings.notifications.soundVolume")}
        </label>
        <input
          id="notify-sound-volume"
          type="range"
          min={MIN_SOUND_VOLUME}
          max={MAX_SOUND_VOLUME}
          step="0.05"
          value={notificationSoundStore.volume}
          disabled={notificationSoundStore.muted}
          oninput={(e) =>
            notificationSoundStore.setVolume(Number((e.currentTarget as HTMLInputElement).value))}
        />
        <span class="w-8 text-right text-[11px] text-[var(--text-secondary)]">
          {Math.round(notificationSoundStore.volume * 100)}%
        </span>
      </div>

      <div class="flex items-center gap-2">
        <label class="text-[11px] text-[var(--text-secondary)] cursor-pointer" for="notify-sound-mute">
          {$_("settings.notifications.soundMute")}
        </label>
        <Toggle
          id="notify-sound-mute"
          checked={notificationSoundStore.muted}
          onchange={(e) =>
            notificationSoundStore.setMuted((e.currentTarget as HTMLInputElement).checked)}
        />
      </div>

      <button
        type="button"
        class="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors disabled:opacity-50"
        disabled={soundAvailability === "unsupported"}
        onclick={previewTone}
      >
        {$_("settings.notifications.soundPreview")}
      </button>
    </div>
  </div>
  <div class="mt-3">
    <button
      type="button"
      class="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors"
      onclick={() => {
        notificationPolicyStore.reset();
        // "Restore defaults" has to mean all of them; leaving the volume behind
        // would make the button a partial truth.
        notificationSoundStore.reset();
      }}
    >
      {$_("settings.notifications.reset")}
    </button>
  </div>
</section>
