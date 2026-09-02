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
  import {
    NOTIFICATION_CATEGORIES,
    NOTIFICATION_CHANNELS,
    type NotificationCategory,
    type NotificationChannel,
  } from "../../lib/notificationPolicy";

  let permission = $state(notificationService.permission());

  const rows = $derived(
    NOTIFICATION_CATEGORIES.map((category: NotificationCategory) => ({
      category,
      label: $_(`settings.notifications.categories.${category}`),
      channels: NOTIFICATION_CHANNELS.map((channel: NotificationChannel) => ({
        channel,
        label:
          channel === "in-app"
            ? $_("settings.notifications.channelInApp")
            : $_("settings.notifications.channelBrowser"),
        enabled: notificationPolicyStore.wants(category, channel),
        /*
         * A browser toggle stays operable while permission is merely
         * undecided — switching it on is what triggers the ask. It is only
         * disabled once the browser has actually refused or cannot be asked,
         * because then the switch could not do anything.
         */
        blocked:
          channel === "browser" && (permission === "denied" || permission === "unsupported"),
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
            <div class="flex items-center gap-2">
              <label
                class="text-[11px] text-[var(--text-secondary)] cursor-pointer"
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

  <div class="mt-3">
    <button
      type="button"
      class="px-4 py-2 text-xs font-bold rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] text-[var(--text-primary)] hover:border-[var(--accent-color)] transition-colors"
      onclick={() => notificationPolicyStore.reset()}
    >
      {$_("settings.notifications.reset")}
    </button>
  </div>
</section>
