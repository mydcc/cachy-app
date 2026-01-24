<!--
  Copyright (C) 2026 MYDCT
-->

<script lang="ts">
    import {
        settingsState,
        type MarketMode,
    } from "../../../stores/settings.svelte";
    import { icons } from "../../../lib/constants";
    import { fade } from "svelte/transition";

    const modes: {
        id: MarketMode;
        title: string;
        desc: string;
        icon: string;
        benefits: string[];
    }[] = [
        {
            id: "performance",
            title: "Performance",
            desc: "Max. Geschwindigkeit, min. Hintergrundlast.",
            icon: "⚡",
            benefits: [
                "Keine Hintergrund-Analyse",
                "News nur auf Klick (On-Demand)",
                "Ideal für ältere Geräte / Akku",
            ],
        },
        {
            id: "balanced",
            title: "Balanced",
            desc: "Der smarte Kompromiss (Empfohlen).",
            icon: "⚖️",
            benefits: [
                "Analyse nur für Top 4 Favoriten",
                "Intervall: 5 Minuten",
                "News deaktiviert im Hintergrund",
            ],
        },
        {
            id: "pro",
            title: "Pro Trader",
            desc: "Alles im Blick, volle Leistung.",
            icon: "🚀",
            benefits: [
                "Volle Analyse aller Favoriten",
                "Echtzeit (60s Intervall)",
                "Aggressiver News-Scan",
            ],
        },
        {
            id: "custom",
            title: "Benutzerdefiniert",
            desc: "Volle Kontrolle über alle Schalter.",
            icon: "⚙️",
            benefits: ["Du entscheidest."],
        },
    ];

    function setMode(mode: MarketMode) {
        settingsState.marketMode = mode;
    }
</script>

<div class="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Presets Grid -->
    <div class="grid grid-cols-2 gap-3">
        {#each modes as mode}
            <button
                class="relative flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 text-center hover:shadow-md h-28
        {settingsState.marketMode === mode.id
                    ? 'border-[var(--accent-color)] bg-[var(--bg-secondary)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-tertiary)] hover:border-[var(--text-secondary)] opacity-80 hover:opacity-100'}"
                onclick={() => setMode(mode.id)}
            >
                <div class="text-3xl mb-2">{mode.icon}</div>
                <h3 class="font-bold text-sm leading-tight">{mode.title}</h3>
                {#if settingsState.marketMode === mode.id}
                    <div
                        class="absolute top-2 right-2 text-[var(--accent-color)] scale-75"
                    >
                        {@html icons.check}
                    </div>
                {/if}
            </button>
        {/each}
    </div>

    <!-- AI Warning -->
    {#if settingsState.marketMode === "performance" || settingsState.marketMode === "balanced"}
        <div
            transition:fade={{ duration: 200 }}
            class="bg-[var(--bg-tertiary)] border border-[var(--warning-color)]/30 rounded-lg p-3 flex gap-3"
        >
            <div class="text-xl">🤖</div>
            <div>
                <h4 class="text-sm font-bold text-[var(--warning-color)] mb-1">
                    KI Hinweis
                </h4>
                <p class="text-xs text-[var(--text-secondary)] leading-relaxed">
                    Aktiver Modus reduziert Hintergrund-Updates. Der AI-Chat
                    erhält dadurch potenziell ältere Marktdaten.
                </p>
            </div>
        </div>
    {/if}

    <!-- Detailed Settings (Always Visible) -->
    <div class="space-y-4 pt-4 border-t border-[var(--border-color)]">
        <div class="flex items-center justify-between">
            <h3 class="font-bold text-lg">Detaillierte Konfiguration</h3>
            {#if settingsState.marketMode !== "custom"}
                <span
                    class="text-[10px] px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-color)]"
                >
                    Nur im "Benutzerdefiniert" Modus änderbar
                </span>
            {/if}
        </div>

        <!-- Setting 1: Scan Interval -->
        <div
            class="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg {settingsState.marketMode !==
            'custom'
                ? 'opacity-60 grayscale'
                : ''}"
        >
            <div>
                <div class="font-medium text-sm">Markt-Scan Frequenz</div>
                <div class="text-[10px] text-[var(--text-secondary)]">
                    Häufiger = Aktuellere Daten. Selten = Spart CPU/Akku. (300s
                    = 5min)
                </div>
            </div>
            <div class="flex items-center gap-2">
                <input
                    type="number"
                    disabled={settingsState.marketMode !== "custom"}
                    class="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs w-16 text-center disabled:cursor-not-allowed"
                    bind:value={settingsState.marketAnalysisInterval}
                    min="30"
                    max="3600"
                />
                <span class="text-xs text-[var(--text-secondary)]">Sek.</span>
            </div>
        </div>

        <!-- Setting 2: Full Scan -->
        <div
            class="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg {settingsState.marketMode !==
            'custom'
                ? 'opacity-60 grayscale'
                : ''}"
        >
            <div>
                <div class="font-medium text-sm">Alle Favoriten scannen</div>
                <div class="text-[10px] text-[var(--text-secondary)]">
                    AN: Scannt alle Coins der Watchlist (Teuer). AUS: Nur Top 4.
                </div>
            </div>
            <input
                type="checkbox"
                disabled={settingsState.marketMode !== "custom"}
                class="toggle-checkbox disabled:cursor-not-allowed"
                bind:checked={settingsState.analyzeAllFavorites}
            />
        </div>

        <!-- Setting 3: News Scraper -->
        <div
            class="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg {settingsState.marketMode !==
            'custom'
                ? 'opacity-60 grayscale'
                : ''}"
        >
            <div>
                <div class="font-medium text-sm">
                    Auto-Download Nachrichten-Inhalte
                </div>
                <div class="text-[10px] text-[var(--text-secondary)]">
                    Lädt vollständige Artikel im Hintergrund. Kostet viel
                    Bandbreite & CPU.
                </div>
            </div>
            <input
                type="checkbox"
                disabled={settingsState.marketMode !== "custom"}
                bind:checked={settingsState.enableNewsScraper}
                class="toggle-checkbox disabled:cursor-not-allowed"
            />
        </div>

        <!-- Setting 4: News Analysis -->
        <div
            class="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg {settingsState.marketMode !==
            'custom'
                ? 'opacity-60 grayscale'
                : ''}"
        >
            <div>
                <div class="font-medium text-sm">News Sentiment Analyse</div>
                <div class="text-[10px] text-[var(--text-secondary)]">
                    Sammeln & Bewerten von News für den KI-Kontext.
                </div>
            </div>
            <input
                type="checkbox"
                disabled={settingsState.marketMode !== "custom"}
                bind:checked={settingsState.enableNewsAnalysis}
                class="toggle-checkbox disabled:cursor-not-allowed"
            />
        </div>
    </div>
</div>
