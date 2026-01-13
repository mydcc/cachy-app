<script lang="ts">
  import { _ } from "../../../locales/i18n";
  import type { ApiKeys } from "../../../stores/settingsStore";

  export let apiProvider: "bitunix" | "binance";
  export let bitunixKeys: ApiKeys;
  export let binanceKeys: ApiKeys;
  export let imgbbApiKey: string;
  export let imgbbExpiration: number;
</script>

<div class="flex flex-col gap-4" role="tabpanel" id="tab-api">
  <div
    class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
  >
    <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">
      {$_("settings.imgbbHeader")}
    </h4>
    <div class="flex flex-col gap-1">
      <label for="imgbb-key" class="text-xs">{$_("settings.imgbbApiKey")}</label
      >
      <input
        id="imgbb-key"
        name="imgbbApiKey"
        type="password"
        bind:value={imgbbApiKey}
        class="input-field p-1 px-2 rounded text-sm"
        placeholder="Paste ImgBB Key"
      />
    </div>
    <div class="flex flex-col gap-1">
      <label for="imgbb-exp" class="text-xs"
        >{$_("settings.imgbbExpiration")}</label
      >
      <select
        id="imgbb-exp"
        name="imgbbExpiration"
        bind:value={imgbbExpiration}
        class="input-field p-1 px-2 rounded text-sm bg-[var(--bg-secondary)] border border-[var(--border-color)]"
      >
        <option value={0}>{$_("settings.imgbbPermanent")}</option>
        <option value={600}>{$_("settings.imgbb10m")}</option>
        <option value={3600}>{$_("settings.imgbb1h")}</option>
        <option value={86400}>{$_("settings.imgbb1d")}</option>
        <option value={604800}>{$_("settings.imgbb1w")}</option>
        <option value={2592000}>{$_("settings.imgbb1m")}</option>
      </select>
    </div>
    <p class="text-xs text-[var(--text-secondary)]">
      {$_("settings.imgbbGetKey")}
      <a
        href="https://api.imgbb.com/"
        target="_blank"
        class="text-[var(--accent-color)] hover:underline">api.imgbb.com</a
      >.
    </p>
  </div>
  <div class="flex flex-col gap-1">
    <label for="api-provider" class="text-sm font-medium"
      >{$_("settings.providerLabel")}</label
    >
    <select
      id="api-provider"
      name="apiProvider"
      bind:value={apiProvider}
      class="input-field p-2 rounded border border-[var(--border-color)] bg-[var(--bg-secondary)]"
    >
      <option value="bitunix">Bitunix</option>
      <option value="binance">Binance Futures</option>
    </select>
  </div>
  {#if apiProvider === "bitunix"}
    <div
      class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
    >
      <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">
        Bitunix Credentials
      </h4>
      <div class="flex flex-col gap-1">
        <label for="bx-key" class="text-xs">API Key</label>
        <input
          id="bx-key"
          name="bitunixKey"
          type="password"
          bind:value={bitunixKeys.key}
          class="input-field p-1 px-2 rounded text-sm"
          placeholder="Paste Key"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="bx-secret" class="text-xs">Secret Key</label>
        <input
          id="bx-secret"
          name="bitunixSecret"
          type="password"
          bind:value={bitunixKeys.secret}
          class="input-field p-1 px-2 rounded text-sm"
          placeholder="Paste Secret"
        />
      </div>
    </div>
  {:else}
    <div
      class="p-3 border border-[var(--border-color)] rounded bg-[var(--bg-tertiary)] flex flex-col gap-2"
    >
      <h4 class="text-xs uppercase font-bold text-[var(--text-secondary)]">
        Binance Credentials
      </h4>
      <div class="flex flex-col gap-1">
        <label for="bn-key" class="text-xs">API Key</label>
        <input
          id="bn-key"
          name="binanceKey"
          type="password"
          bind:value={binanceKeys.key}
          class="input-field p-1 px-2 rounded text-sm"
          placeholder="Paste Key"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="bn-secret" class="text-xs">Secret Key</label>
        <input
          id="bn-secret"
          name="binanceSecret"
          type="password"
          bind:value={binanceKeys.secret}
          class="input-field p-1 px-2 rounded text-sm"
          placeholder="Paste Secret"
        />
      </div>
    </div>
  {/if}
  <p class="text-xs text-[var(--text-secondary)] italic">
    {$_("settings.securityNote")}
  </p>
</div>
