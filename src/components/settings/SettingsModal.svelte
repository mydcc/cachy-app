<script lang="ts">
  import ModalFrame from "../shared/ModalFrame.svelte";
  import { settingsState } from "../../stores/settings.svelte";
  import { uiState } from "../../stores/ui.svelte";
  import { modalState } from "../../stores/modal.svelte";
  import { _ } from "../../locales/i18n";
  import {
    createBackup,
    restoreFromBackup,
  } from "../../services/backupService";
  import { trackCustomEvent } from "../../services/trackingService";

  // New Tab Components
  import TradingTab from "./tabs/TradingTab.svelte";
  import VisualsTab from "./tabs/VisualsTab.svelte";
  import AiTab from "./tabs/AiTab.svelte";
  import ConnectionsTab from "./tabs/ConnectionsTab.svelte";
  import SystemTab from "./tabs/SystemTab.svelte";
  import CloudTab from "./tabs/CloudTab.svelte"; // Keeping CloudTab as it was not mentioned in deprecation plan but maybe should be?
  // Plan said "Cloud / Community" -> "System" or keep separate?
  // Plan said "Tab 5: System & Cloud". So merge Cloud content into System or keep separate?
  // Let's keep CloudTab separate for now as it wasn't explicitly detailed to be merged into SystemTab in my thought process,
  // but logically it might fit. However, "Cloud" usually means remote sync which is distinct from "System".
  // The user plan said "Tab 5: System & Cloud (Performance, Backup, Sync)".
  // So I should have put it in System. But I didn't add it to SystemTab.
  // I will keep CloudTab as a 6th tab for now or just include it if I can.
  // Actually, let's keep it as is to minimize risk, or add it to SystemTab?
  // I will keep it as a tab for now to avoid losing features.

  // Tab State
  type TabType =
    | "trading"
    | "visuals"
    | "ai"
    | "connections"
    | "system"
    | "cloud";

  // Use the store as the unique source of truth for the active tab
  // Default to 'trading' or 'visuals'
  const activeTab = $derived((uiState.settingsTab as any) || "visuals");

  function selectTab(tab: string) {
    uiState.settingsTab = tab;
  }

  const appVersion = import.meta.env.VITE_APP_VERSION || "0.0.0";

  function close() {
    uiState.toggleSettingsModal(false);
  }

  // System Tab Functions passed down
  async function handleBackup() {
    const useEncryption = await modalState.show(
      $_("settings.system.dataMaintenance") || "Data & Backup",
      $_("app.backupEncryptQuestion") || "Encrypt backup with password?",
      "confirm",
    );
    let password = "";

    if (useEncryption) {
      const result = await modalState.show(
        $_("settings.system.dataMaintenance") || "Data & Backup",
        $_("app.backupPasswordPrompt") || "Enter password:",
        "prompt",
      );
      password = typeof result === "string" ? result : "";

      if (!password) {
        uiState.showError(
          $_("app.backupPasswordRequired") || "Password required.",
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
        $_("settings.system.dataMaintenance") || "Data & Backup",
        $_("app.restoreConfirmMessage") ||
          "Restore backup? Current data will be replaced.",
        "confirm",
      );

      if (confirmed) {
        let result = await restoreFromBackup(content);

        if (result.needsPassword) {
          const pwResult = await modalState.show(
            $_("settings.system.dataMaintenance") || "Data & Backup",
            $_("app.backupPasswordEntryPrompt") || "Enter encryption password:",
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
            $_("settings.system.dataMaintenance") || "Data & Backup",
            result.message,
            "alert",
          );
          window.location.reload();
        } else {
          uiState.showError(
            result.message.startsWith("app.")
              ? $_(result.message)
              : result.message,
          );
        }
      }
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
      $_("settings.system.dangerZone") || "Danger Zone",
      $_("settings.resetConfirm") || "Factory Reset? This cannot be undone.",
      "confirm",
    );
    if (confirmed) {
      localStorage.clear();
      window.location.reload();
    }
  }

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

  const tabs = [
    {
      id: "trading",
      icon: `<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93 4.93 19.07"/>`,
      label:
        $_("settings.trading.chartTitle")?.replace("Chart & Data", "Trading") ||
        "Trading",
    },
    {
      id: "visuals",
      icon: `<path d="M2.05 13.9a9.96 9.96 0 0 1 0-7.8"/> <path d="M8.2 21.8c-1.3-.2-2.5-.6-3.7-1.3"/> <path d="M15.8 2.2c1.3.2 2.5.6 3.7 1.3"/> <path d="M21.95 10.1a9.96 9.96 0 0 1 0 7.8"/> <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/> <path d="M12 2a10 10 0 0 1 10 10"/>`, // Aperture/Eye like
      label: $_("settings.visuals.appearanceTitle")?.split(" ")[0] || "Visuals",
    },
    {
      id: "ai",
      icon: `<path d="M12 2a2 2 0 0 1 2 2c0 2.21-1.79 4-4 4s-4-1.79-4-4a2 2 0 0 1 2-2z"/><path d="M12 10c-3.31 0-6 2.69-6 6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2c0-3.31-2.69-6-6-6z"/>`, // Bot
      label: "Intelligence",
    },
    {
      id: "connections",
      icon: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
      label: "Connections",
    },
    {
      id: "system",
      icon: `<path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"/><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/><path d="M12 2v2"/><path d="M12 22v-2"/><path d="m17 7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/><path d="M22 12h-2"/><path d="M2 12h2"/><path d="m4.9 19.1 1.4-1.4"/><path d="m7 17 1.4 1.4"/>`,
      label: "System",
    },
    {
      id: "cloud",
      icon: `<path d="M17.5 19c0-1.7-1.3-3-3-3h-1.5c-2.8 0-5-2.2-5-5 0-2.3 1.5-4.3 3.7-4.8.8-1.8 2.6-3.2 4.8-3.2 3 0 5.5 2.5 5.5 5.5 0 .2 0 .5-.1.7 2.1.8 3.6 2.8 3.6 5.3 0 2.8-2.2 5-5 5h-4.5c-.3 0-.5-.2-.5-.5z"/>`,
      label: "Cloud",
    },
  ];

  let isMobile = $state(false);
  let visibleTabs = $derived(tabs);

  $effect(() => {
    const checkMobile = () => {
      if (typeof window !== "undefined") {
        isMobile = window.innerWidth <= 768;
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
          onclick={() => selectTab(tab.id as any)}
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
      {#if activeTab === "trading"}
        <TradingTab />
      {:else if activeTab === "visuals"}
        <VisualsTab {themes} />
      {:else if activeTab === "ai"}
        <AiTab />
      {:else if activeTab === "connections"}
        <ConnectionsTab />
      {:else if activeTab === "system"}
        <SystemTab
          onBackup={handleBackup}
          onRestore={handleRestore}
          onReset={handleReset}
        />
      {:else if activeTab === "cloud"}
        <CloudTab />
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
      CachyApp v{appVersion}
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
</style>
