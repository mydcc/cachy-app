// @vitest-environment happy-dom
//
// Render smoke benchmark for NewsSentimentPanel: measures absolute
// mount/unmount cost so perf regressions of the panel show up as timing
// drift. It does NOT compare against the pre-`$derived` template — a bench
// mounts one component version only, so it can never prove the slice hoist
// itself made anything faster.
import { bench, describe } from 'vitest';
import { mount, unmount } from 'svelte';
import NewsSentimentPanel from '../../components/shared/NewsSentimentPanel.svelte';
import { newsStore } from '../../stores/news.svelte';
import { settingsState } from '../../stores/settings.svelte';
import { afterEach, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../stores/ui.svelte', () => ({
    uiState: { toggleSettingsModal: vi.fn() }
}));

vi.mock('../../locales/i18n', () => ({
    _: {
        subscribe: (cb: (t: (k: string) => string) => void) => { cb((k: string) => k); return () => {}; }
    },
    t: (key: string) => key
}));

vi.mock('../../services/frameSupportService', () => ({
    frameSupportService: {
        isDomainFrameBlocked: () => false
    }
}));

// Provide minimal implementations for features Svelte might need in happy-dom
if (typeof window !== 'undefined' && !window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}

describe('NewsSentimentPanel render smoke benchmark', () => {
    // Generate dummy news
    const fakeNews = Array.from({ length: 50 }).map((_, i) => ({
        title: `News article ${i}`,
        url: `https://example.com/${i}`,
        description: `Description ${i}`,
        source: `Source ${i}`,
        published_at: Date.now() - i * 1000
    }));

    let target: HTMLElement;

    beforeEach(() => {
        // Mock state
        settingsState.enableNewsAnalysis = true;
        settingsState.newsOpenBehavior = "window";
        newsStore.news = fakeNews as unknown as typeof newsStore.news;
        newsStore.sentiment = {
             score: 0.5,
             summary: "test",
             regime: "BULLISH",
             keyFactors: []
        };
        newsStore.isLoading = false;

        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        document.body.removeChild(target);
    });

    bench('mount and unmount panel', () => {
        const component = mount(NewsSentimentPanel, {
            target,
            props: { variant: 'main' }
        });
        unmount(component);
    });
});
