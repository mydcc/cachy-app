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
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        {#each modes as mode}
            <button
                class="relative flex flex-col items-start p-4 rounded-xl border-2 transition-all duration-200 text-left hover:shadow-lg {settingsState.marketMode ===
                mode.id
                    ? 'border-[var(--accent-color)] bg-[var(--bg-secondary)]'
                    : 'border-[var(--border-color)] bg-[var(--bg-tertiary)] hover:border-[var(--text-secondary)]'}"
                onclick={() => setMode(mode.id)}
            >
                <div class="flex justify-between w-full mb-2">
                    <span class="text-2xl">{mode.icon}</span>
                    {#if settingsState.marketMode === mode.id}
                        <div class="text-[var(--accent-color)]">
                            {@html icons.check}
                        </div>
                    {/if}
                </div>
                <h3 class="font-bold text-lg mb-1">{mode.title}</h3>
                <p class="text-xs text-[var(--text-secondary)] mb-3">
                    {mode.desc}
                </p>
                <ul class="space-y-1 mt-auto">
                    {#each mode.benefits as benefit}
                        <li
                            class="text-[10px] text-[var(--text-secondary)] flex items-center gap-1.5"
                        >
                            <span
                                class="w-1 h-1 rounded-full bg-[var(--accent-color)] opacity-50"
                            ></span>
                            {benefit}
                        </li>
                    {/each}
                </ul>
            </button>
        {/each}
    </div>

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
                    In diesem Modus erhält der AI-Chat weniger aktuelle
                    Hintergrunddaten (News/Technische Analyse). Er ist dadurch
                    speicherschonender, aber potenziell weniger "informiert"
                    über kurzfristige Marktbewegungen.
                </p>
            </div>
        </div>
    {/if}

    {#if settingsState.marketMode === "custom"}
        <div
            transition:fade={{ duration: 200 }}
            class="space-y-4 pt-4 border-t border-[var(--border-color)]"
        >
            <h3 class="font-bold text-lg">Fein-Einstellungen</h3>

            <div
                class="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg"
            >
                <div>
                    <div class="font-medium text-sm">Hintergrund-Analyse</div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
                        Berechnet RSI/Trends im Hintergrund
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <input
                        type="number"
                        class="bg-[var(--bg-primary)] border border-[var(--border-color)] rounded px-2 py-1 text-xs w-16 text-center"
                        bind:value={settingsState.marketAnalysisInterval}
                        min="30"
                        max="3600"
                    />
                    <span class="text-xs text-[var(--text-secondary)]"
                        >Sek.</span
                    >
                </div>
            </div>

            <div
                class="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg"
            >
                <div>
                    <div class="font-medium text-sm">
                        Alle Favoriten analysieren
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
                        Wenn aus, nur Top 4 (spart API Limits)
                    </div>
                </div>
                <input
                    type="checkbox"
                    class="toggle-checkbox"
                    bind:checked={settingsState.analyzeAllFavorites}
                />
            </div>

            <div
                class="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg"
            >
                <div>
                    <div class="font-medium text-sm">
                        News Scanner (Aggressiv)
                    </div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
                        Nicht empfohlen. Kann zu Timeouts führen.
                    </div>
                </div>
                <input
                    type="checkbox"
                    bind:checked={settingsState.enableNewsScraper}
                    class="toggle-checkbox"
                />
            </div>
            <div
                class="flex items-center justify-between p-3 bg-[var(--bg-tertiary)] rounded-lg"
            >
                <div>
                    <div class="font-medium text-sm">News Analyse generell</div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
                        Sammeln von News für Sentiment/KI
                    </div>
                </div>
                <input
                    type="checkbox"
                    bind:checked={settingsState.enableNewsAnalysis}
                    class="toggle-checkbox"
                />
            </div>
        </div>
    {/if}
</div>
