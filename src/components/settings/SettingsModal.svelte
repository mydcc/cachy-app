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
  import ModalFrame from "../shared/ModalFrame.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { indicatorState } from "../../stores/indicator.svelte";
  import { uiStore } from "../../stores/uiStore";
  import { _ } from "../../locales/i18n";
  import {
    createBackup,
    restoreFromBackup,
  } from "../../services/backupService";
  import { trackCustomEvent } from "../../services/trackingService";
  import {
    HOTKEY_ACTIONS,
    MODE1_MAP,
    MODE2_MAP,
    MODE3_MAP,
  } from "../../services/hotkeyService";

  // Tab Components
  import SystemTab from "./tabs/SystemTab.svelte";
  import GeneralTab from "./tabs/GeneralTab.svelte";
  import ApiTab from "./tabs/ApiTab.svelte";
  import AiTab from "./tabs/AiTab.svelte";
  import BehaviorTab from "./tabs/BehaviorTab.svelte";
  import HotkeysTab from "./tabs/HotkeysTab.svelte";
  import SidebarTab from "./tabs/SidebarTab.svelte";
  import IndicatorsTab from "./tabs/IndicatorsTab.svelte";

  // Tab State
  let activeTab:
    | "general"
    | "api"
    | "ai"
    | "behavior"
    | "system"
    | "sidebar"
    | "indicators"
    | "hotkeys" = $state("general");

  // Sync active tab from uiStore if needed, or just let it be independent
  $effect(() => {
    if ($uiStore.showSettingsModal) {
      if ($uiStore.settingsTab) {
        activeTab = $uiStore.settingsTab as any;
      }
    }
  });

  const availableTimeframes = [
    "1m",
    "3m",
    "5m",
    "15m",
    "30m",
    "1h",
    "2h",
    "4h",
    "6h",
    "8h",
    "12h",
    "1d",
    "3d",
    "1w",
    "1M",
  ];

  const themes = [
    { value: "dark", label: "Dark (Default)" },
    { value: "light", label: "Light" },
    { value: "meteorite", label: "Meteorite" },
    { value: "midnight", label: "Midnight" },
    { value: "cobalt2", label: "Cobalt2" },
    { value: "night-owl", label: "Night Owl" },
    { value: "dracula", label: "Dracula" },
    { value: "dracula-soft", label: "Dracula Soft" },
    { value: "monokai", label: "Monokai" },
    { value: "nord", label: "Nord" },
    { value: "solarized-dark", label: "Solarized Dark" },
    { value: "solarized-light", label: "Solarized Light" },
    { value: "gruvbox-dark", label: "Gruvbox Dark" },
    { value: "catppuccin", label: "Catppuccin" },
    { value: "tokyo-night", label: "Tokyo Night" },
    { value: "one-dark-pro", label: "One Dark Pro" },
    { value: "obsidian", label: "Obsidian" },
    { value: "ayu-dark", label: "Ayu Dark" },
    { value: "ayu-light", label: "Ayu Light" },
    { value: "ayu-mirage", label: "Ayu Mirage" },
    { value: "github-dark", label: "GitHub Dark" },
    { value: "github-light", label: "GitHub Light" },
    { value: "steel", label: "Steel" },
    { value: "matrix", label: "Matrix" },
    { value: "everforest-dark", label: "Everforest Dark" },
    { value: "VIP", label: "VIP" },
  ];

  function close() {
    uiStore.toggleSettingsModal(false);
  }

  // System Tab Functions
  async function handleBackup() {
    const useEncryption = confirm(
      $_("app.backupEncryptQuestion") ||
        "Do you want to encrypt this backup with a password?",
    );
    let password = "";

    if (useEncryption) {
      password =
        prompt(
          $_("app.backupPasswordPrompt") || "Enter a password for encryption:",
        ) || "";
      if (!password) {
        alert(
          $_("app.backupPasswordRequired") ||
            "Password is required for encryption.",
        );
        return;
      }
    }

    await createBackup(password);
    trackCustomEvent("System", "Backup", "Created");
  }

  async function handleRestore(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = async (event) => {
      const content = event.target?.result as string;
      if (confirm($_("app.restoreConfirmMessage"))) {
        let result = await restoreFromBackup(content);

        // Handle encrypted backup that needs a password
        if (result.needsPassword) {
          const password = prompt(
            $_("app.backupPasswordEntryPrompt") ||
              "This backup is encrypted. Please enter the password:",
          );
          if (password) {
            result = await restoreFromBackup(content, password);
          } else {
            input.value = "";
            return;
          }
        }

        if (result.success) {
          alert(result.message);
          window.location.reload();
        } else {
          // Translate common error keys if they are returned as keys
          const message = result.message.startsWith("app.")
            ? $_(result.message)
            : result.message;
          alert(message);
        }
      }
      // Reset input
      input.value = "";
    };

    reader.onerror = () => {
      alert($_("app.fileReadError"));
      input.value = "";
    };

    reader.readAsText(file);
  }

  function handleReset() {
    if (confirm($_("settings.resetConfirm"))) {
      localStorage.clear();
      window.location.reload();
    }
  }

  function getHotkeyDescriptions(mode: string) {
    let map: Record<string, string> = {};
    if (mode === "mode1") map = MODE1_MAP;
    else if (mode === "mode2") map = MODE2_MAP;
    else if (mode === "mode3") map = MODE3_MAP;
    else return [];

    return HOTKEY_ACTIONS.map((action) => {
      const key = map[action.id];
      if (!key) return null;
      return { keys: key, action: action.label };
    }).filter((x) => x !== null) as Array<{ keys: string; action: string }>;
  }

  // Reactive descriptions based on selected mode
  let activeDescriptions = $derived(
    getHotkeyDescriptions(settingsState.hotkeyMode),
  );
</script>

<ModalFrame
  isOpen={$uiStore.showSettingsModal}
  title={$_("settings.title") || "Settings"}
  on:close={close}
  extraClasses="!w-[1000px] !max-w-[95vw] !max-h-[90vh] flex flex-col overflow-hidden"
  alignment="top"
>
  <!-- Main Content Container (Split View) -->
  <div class="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden">
    <!-- Sidebar Navigation -->
    <div
      class="flex md:flex-col overflow-x-auto md:overflow-y-auto md:w-56 border-b md:border-b-0 md:border-r border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)]"
      role="tablist"
    >
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'general'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={(e) => {
          e.stopPropagation(); // prevent modal close
          activeTab = "general";
        }}
        role="tab"
        aria-selected={activeTab === "general"}
      >
        {$_("settings.tabs.general")}
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'api'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={(e) => {
          e.stopPropagation();
          activeTab = "api";
        }}
        role="tab"
        aria-selected={activeTab === "api"}
      >
        {$_("settings.tabs.api")}
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'ai'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "ai")}
        role="tab"
        aria-selected={activeTab === "ai"}
      >
        AI Chat
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'behavior'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "behavior")}
        role="tab"
        aria-selected={activeTab === "behavior"}
      >
        {$_("settings.tabs.behavior")}
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'hotkeys'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "hotkeys")}
        role="tab"
        aria-selected={activeTab === "hotkeys"}
      >
        Hotkeys
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'sidebar'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "sidebar")}
        role="tab"
        aria-selected={activeTab === "sidebar"}
      >
        Sidebar
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'indicators'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "indicators")}
        role="tab"
        aria-selected={activeTab === "indicators"}
      >
        Technicals
      </button>
      <button
        class="px-4 py-3 text-sm font-medium transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)] focus:ring-offset-2 focus:ring-offset-[var(--bg-secondary)] whitespace-nowrap {activeTab ===
        'system'
          ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-b-2 md:border-b-0 md:border-l-2 border-[var(--accent-color)]'
          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] border-b-2 md:border-b-0 md:border-l-2 border-transparent'}"
        onclick={() => (activeTab = "system")}
        role="tab"
        aria-selected={activeTab === "system"}
      >
        {$_("settings.tabs.system")}
      </button>
    </div>

    <!-- Tab Content Area -->
    <div
      class="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar bg-[var(--bg-primary)]"
    >
      {#if activeTab === "general"}
        <GeneralTab {themes} />
      {:else if activeTab === "api"}
        <ApiTab />
      {:else if activeTab === "ai"}
        <AiTab />
      {:else if activeTab === "behavior"}
        <BehaviorTab {activeDescriptions} />
      {:else if activeTab === "hotkeys"}
        <HotkeysTab />
      {:else if activeTab === "sidebar"}
        <SidebarTab />
      {:else if activeTab === "indicators"}
        <IndicatorsTab {availableTimeframes} />
      {:else if activeTab === "system"}
        <SystemTab
          onBackup={handleBackup}
          onRestore={handleRestore}
          onReset={handleReset}
        />
      {/if}
    </div>
  </div>

  <!-- Footer Actions -->
  <div
    class="flex justify-end gap-3 pt-4 border-t border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)] px-4 pb-4"
  >
    <button
      class="px-6 py-2 text-sm font-bold bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded hover:opacity-90 transition-opacity"
      onclick={close}
    >
      {$_("common.close") || "Close"}
    </button>
  </div>
</ModalFrame>
