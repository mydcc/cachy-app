<!--
  Copyright (C) 2026 MYDCT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
-->

<script lang="ts">
    import type { WindowBase } from "../WindowBase.svelte";
    import { settingsState } from "../../../stores/settings.svelte";
    import { _ } from "../../../locales/i18n";
    import { appFetch } from "../../../lib/appAuth";

    interface Props {
        window: WindowBase & {
            url: string;
            description?: string;
            source?: string;
            published_at?: string;
        };
        sandbox?: string;
        allow?: string;
    }

    let {
        window: win,
        sandbox,
        allow = "accelerometer; autoplay; camera; clipboard-write; encrypted-media; fullscreen; geolocation; gyroscope; microphone; picture-in-picture; web-share; xr-spatial-tracking"
    }: Props = $props();

    import { frameSupportService } from "../../../services/frameSupportService";

    let isReaderMode = $derived(
        settingsState.newsOpenBehavior === "reader" ||
        (settingsState.newsOpenBehavior === "smart" && frameSupportService.isDomainFrameBlocked(win.url))
    );

    const clientArticleCache = new Map<string, string[]>();

    let fullParagraphs = $state<string[]>([]);
    let isFetchingFullArticle = $state(false);

    $effect(() => {
        if (isReaderMode && win.url) {
            let active = true;

            if (clientArticleCache.has(win.url)) {
                fullParagraphs = clientArticleCache.get(win.url) || [];
                isFetchingFullArticle = false;
                return;
            }

            isFetchingFullArticle = true;
            fullParagraphs = [];

            appFetch("/api/external/article-content", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: win.url }),
            })
                .then(async (res) => {
                    if (!res.ok) return { paragraphs: [] };
                    return res.json();
                })
                .then((data) => {
                    if (active) {
                        const pars = (data && Array.isArray(data.paragraphs)) ? data.paragraphs : [];
                        clientArticleCache.set(win.url, pars);
                        fullParagraphs = pars;
                    }
                })
                .catch(() => {
                    if (active) {
                        clientArticleCache.set(win.url, []);
                    }
                })
                .finally(() => {
                    if (active) isFetchingFullArticle = false;
                });

            return () => {
                active = false;
            };
        }
    });

    function openInNewTab() {
        if (win.url) {
            window.open(win.url, "_blank", "noopener,noreferrer");
        }
    }

    function formatDate(dateStr?: string) {
        if (!dateStr) return "";
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            });
        } catch {
            return dateStr;
        }
    }
    function cleanSnippet(text?: string): string {
        if (!text) return "";
        return text
            .replace(/<style[\s\S]*?<\/style>/gi, "")
            .replace(/<script[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]*>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, " ")
            .trim();
    }
</script>

<div class="iframe-view-container relative w-full h-full bg-[var(--bg-primary)] overflow-hidden">
    {#if isReaderMode}
        <div class="reader-mode-container h-full w-full overflow-y-auto p-5 md:p-6 flex flex-col justify-between bg-[var(--bg-primary)] custom-scrollbar">
            <div class="flex flex-col gap-3">
                <!-- Meta Header -->
                <div class="flex items-center justify-between gap-2 border-b border-[var(--border-color)] pb-3">
                    <div class="flex items-center gap-2 flex-wrap">
                        {#if win.source}
                            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--accent-color)]">
                                {win.source}
                            </span>
                        {/if}
                        {#if win.published_at}
                            <span class="text-xs text-[var(--text-tertiary)]">
                                {formatDate(win.published_at)}
                            </span>
                        {/if}
                    </div>

                    <!-- Direct Open Icon with Tooltip -->
                    <button
                        type="button"
                        onclick={openInNewTab}
                        title={$_("dashboard.openInNewTab")}
                        class="p-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer flex items-center justify-center"
                        aria-label={$_("dashboard.openInNewTab")}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                    </button>
                </div>

                <!-- Headline -->
                <h1 class="text-base md:text-lg font-bold text-[var(--text-primary)] leading-snug">
                    {win.title}
                </h1>

                <!-- Content snippet / Full Article paragraphs -->
                {#if fullParagraphs.length > 0}
                    <div class="flex flex-col gap-3 mt-1">
                        {#each fullParagraphs as p}
                            <p class="text-xs md:text-sm text-[var(--text-secondary)] leading-relaxed">
                                {p}
                            </p>
                        {/each}
                    </div>
                {:else if isFetchingFullArticle}
                    <div class="flex items-center gap-2 py-3 text-xs text-[var(--text-tertiary)]">
                        <div class="animate-spin w-3.5 h-3.5 border-2 border-[var(--accent-color)] border-t-transparent rounded-full"></div>
                        <span>Lade Artikel...</span>
                    </div>
                {:else}
                    <div class="flex flex-col gap-3.5 mt-1">
                        {#if win.description}
                            <div class="p-3.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] text-xs md:text-sm text-[var(--text-primary)] leading-relaxed">
                                <span class="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider block mb-1">Zusammenfassung:</span>
                                {cleanSnippet(win.description)}
                            </div>
                        {/if}

                        <div class="p-3.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-color)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            <div class="flex flex-col gap-0.5">
                                <span class="text-xs font-medium text-[var(--text-primary)]">
                                    Vollständiger Artikel auf {win.source || 'Website'}
                                </span>
                                <span class="text-[11px] text-[var(--text-tertiary)]">
                                    Dieser Anbieter schützt Volltexte vor direktem In-App-Laden.
                                </span>
                            </div>
                            <button
                                type="button"
                                onclick={openInNewTab}
                                class="px-3 py-1.5 rounded-lg bg-[var(--accent-color)] text-black font-medium text-xs hover:opacity-90 transition-opacity flex items-center gap-1.5 shrink-0 cursor-pointer"
                            >
                                <span>Artikel öffnen</span>
                                <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                            </button>
                        </div>
                    </div>
                {/if}
            </div>

            <!-- Footer Quick Action -->
            <div class="flex items-center justify-end pt-4 mt-6 border-t border-[var(--border-color)]">
                <button
                    type="button"
                    onclick={openInNewTab}
                    title={$_("dashboard.openInNewTab")}
                    class="p-2 rounded-lg bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] text-[var(--text-primary)] hover:text-[var(--accent-color)] transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-medium"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>{win.source || $_("dashboard.openInNewTab")}</span>
                </button>
            </div>
        </div>
    {:else if sandbox}
        <iframe
            src={win.url}
            title={win.title}
            {allow}
            {sandbox}
            class="w-full h-full border-0 block"
        ></iframe>
    {:else}
        <iframe
            src={win.url}
            title={win.title}
            {allow}
            class="w-full h-full border-0 block"
        ></iframe>
    {/if}
</div>

<style>
    .iframe-view-container {
        width: 100%;
        height: 100%;
        overflow: hidden;
    }
    iframe {
        width: 100%;
        height: 100%;
        border: none;
        display: block;
    }
    .custom-scrollbar::-webkit-scrollbar {
        width: 4px;
    }
    .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: 4px;
    }
</style>
