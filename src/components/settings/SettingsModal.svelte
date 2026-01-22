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
  import { untrack } from "svelte";
  import ModalFrame from "../shared/ModalFrame.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { indicatorState } from "../../stores/indicator.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { modalState } from "../../stores/modal.svelte";
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
  import ProfileTab from "./tabs/ProfileTab.svelte";
  import WorkspaceTab from "./tabs/WorkspaceTab.svelte";

  const appVersion = import.meta.env.VITE_APP_VERSION || "0.0.0";
  import AnalysisTab from "./tabs/AnalysisTab.svelte";
  import AiAssistantTab from "./tabs/AiAssistantTab.svelte";
  import IntegrationsTab from "./tabs/IntegrationsTab.svelte";
  import MaintenanceTab from "./tabs/MaintenanceTab.svelte";

  // Tab State
  type TabType =
    | "profile"
    | "workspace"
    | "analysis"
    | "ai_assistant"
    | "integrations"
    | "maintenance";

  // Use the store as the unique source of truth for the active tab
  // This prevents unintended resets when the store updates for other reasons
  const activeTab = $derived((uiState.settingsTab as TabType) || "profile");

  function selectTab(tab: TabType) {
    uiState.settingsTab = tab;
  }

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
    uiState.toggleSettingsModal(false);
  }

  // System Tab Functions
  async function handleBackup() {
    const useEncryption = await modalState.show(
      $_("settings.tabs.maintenance") || "Maintenance",
      $_("app.backupEncryptQuestion") ||
        "Do you want to encrypt this backup with a password?",
      "confirm",
    );
    let password = "";

    if (useEncryption) {
      const result = await modalState.show(
        $_("settings.tabs.maintenance") || "Maintenance",
        $_("app.backupPasswordPrompt") || "Enter a password for encryption:",
        "prompt",
      );
      password = typeof result === "string" ? result : "";

      if (!password) {
        uiState.showError(
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
      const confirmed = await modalState.show(
        $_("settings.tabs.maintenance") || "Maintenance",
        $_("app.restoreConfirmMessage"),
        "confirm",
      );

      if (confirmed) {
        let result = await restoreFromBackup(content);

        // Handle encrypted backup that needs a password
        if (result.needsPassword) {
          const pwResult = await modalState.show(
            $_("settings.tabs.maintenance") || "Maintenance",
            $_("app.backupPasswordEntryPrompt") ||
              "This backup is encrypted. Please enter the password:",
            "prompt",
          );
          const password = typeof pwResult === "string" ? pwResult : "";

          if (password) {
            result = await restoreFromBackup(content, password);
          } else {
            input.value = "";
            return;
          }
        }

        if (result.success) {
          await modalState.show(
            $_("settings.tabs.maintenance") || "Maintenance",
            result.message,
            "alert",
          );
          window.location.reload();
        } else {
          // Translate common error keys if they are returned as keys
          const message = result.message.startsWith("app.")
            ? $_(result.message)
            : result.message;
          uiState.showError(message);
        }
      }
      // Reset input
      input.value = "";
    };

    reader.onerror = () => {
      uiState.showError($_("app.fileReadError"));
      input.value = "";
    };

    reader.readAsText(file);
  }

  async function handleReset() {
    const confirmed = await modalState.show(
      $_("settings.tabs.maintenance") || "Maintenance",
      $_("settings.resetConfirm"),
      "confirm",
    );
    if (confirmed) {
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

  const tabs = [
    {
      id: "profile",
      icon: `<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>`,
      label: $_("settings.tabs.profile") || "Profile & Design",
    },
    {
      id: "workspace",
      icon: `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M3 9h6"/><path d="M3 15h6"/>`,
      label: $_("settings.tabs.workspace") || "Workspace & Sidebar",
    },
    {
      id: "analysis",
      icon: `<path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/>`,
      label: $_("settings.tabs.analysis") || "Analysis Logic",
    },
    {
      id: "ai_assistant",
      icon: `<path d="M12 2v8"/><path d="m4.93 4.93 5.66 5.66"/><path d="M2 12h8"/><path d="m4.93 19.07 5.66-5.66"/><path d="M12 22v-8"/><path d="m19.07 19.07-5.66-5.66"/><path d="M22 12h-8"/><path d="m19.07 4.93-5.66 5.66"/>`,
      label: $_("settings.tabs.ai_assistant") || "AI Assistant",
    },
    {
      id: "integrations",
      icon: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
      label: $_("settings.tabs.integrations") || "Integrations",
    },
    {
      id: "maintenance",
      icon: `<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>`,
      label: $_("settings.tabs.maintenance") || "Data & Maintenance",
    },
  ];

  let isMobile = $state(false);

  // Filter tabs: no longer hiding 'profile' on mobile, user wants sub-tab hidden instead
  let visibleTabs = $derived(tabs);

  $effect(() => {
    const checkMobile = () => {
      if (typeof window !== "undefined") {
        isMobile = window.innerWidth <= 768; // Standard mobile breakpoint
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  });
</script>

<ModalFrame
  isOpen={uiState.showSettingsModal}
  title={$_("settings.title") || "Settings"}
  onclose={close}
  extraClasses="modal-size-instructions flex flex-col overflow-hidden"
  bodyClass="!overflow-hidden"
  alignment="center"
>
  <!-- Main Content Container (Split View) -->
  <div
    class="flex flex-col md:flex-row flex-1 min-h-0 overflow-hidden bg-[var(--bg-primary)]"
  >
    <!-- Sidebar Navigation -->
    <div
      class="flex md:flex-col overflow-x-auto md:overflow-y-auto md:w-64 border-b md:border-b-0 md:border-r border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)] py-2"
      role="tablist"
    >
      {#each visibleTabs as tab}
        <button
          class="flex items-center gap-3 px-6 py-3.5 text-sm font-semibold transition-all text-left focus:outline-none whitespace-nowrap group
                 {activeTab === tab.id
            ? 'bg-[var(--bg-tertiary)] text-[var(--accent-color)] border-l-2 border-[var(--accent-color)] shadow-inner'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]/50 border-l-2 border-transparent'}"
          onclick={() => selectTab(tab.id as TabType)}
          role="tab"
          aria-selected={activeTab === tab.id}
        >
          <div
            class="tab-icon transition-transform group-hover:scale-110 {activeTab ===
            tab.id
              ? 'text-[var(--accent-color)]'
              : 'text-[var(--text-secondary)]'}"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              {@html tab.icon}
            </svg>
          </div>
          {tab.label}
        </button>
      {/each}
    </div>

    <!-- Tab Content Area -->
    <div class="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
      {#if activeTab === "profile"}
        <ProfileTab {themes} />
      {:else if activeTab === "workspace"}
        <WorkspaceTab />
      {:else if activeTab === "analysis"}
        <AnalysisTab {availableTimeframes} />
      {:else if activeTab === "ai_assistant"}
        <AiAssistantTab />
      {:else if activeTab === "integrations"}
        <IntegrationsTab />
      {:else if activeTab === "maintenance"}
        <MaintenanceTab
          onBackup={handleBackup}
          onRestore={handleRestore}
          onReset={handleReset}
        />
      {/if}
    </div>
  </div>

  <!-- Footer Actions -->
  <div
    class="flex justify-between items-center p-4 border-t border-[var(--border-color)] shrink-0 bg-[var(--bg-secondary)]"
  >
    <div
      class="flex items-center gap-2 text-[10px] text-[var(--text-secondary)] font-bold opacity-50 uppercase tracking-widest pl-2"
    >
      <div
        class="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] animate-pulse"
      ></div>
      CachyApp v{appVersion} // Professional Workspace
    </div>
    <button
      class="px-8 py-2.5 text-xs font-black uppercase tracking-widest bg-[var(--accent-color)] text-[var(--btn-accent-text)] rounded-lg hover:brightness-110 transition-all shadow-lg active:scale-95"
      onclick={close}
    >
      {$_("common.close") || "Close"}
    </button>
  </div>
</ModalFrame>

<style>
  .tab-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
  }

  .custom-scrollbar::-webkit-scrollbar {
    width: 4px;
  }
  .custom-scrollbar::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 10px;
  }

  :global(.setting-card:hover) {
    border-color: var(--accent-color) !important;
    background: var(--bg-tertiary) !important;
  }
</style>
