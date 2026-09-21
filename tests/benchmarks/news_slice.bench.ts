// @vitest-environment happy-dom
import { bench, describe } from 'vitest';
import { mount, unmount } from 'svelte';
import NewsSentimentPanel from '../../src/components/shared/NewsSentimentPanel.svelte';
import { newsStore } from '../../src/stores/news.svelte';
import { settingsState } from '../../src/stores/settings.svelte';
import { afterEach, beforeEach, vi } from 'vitest';

// Mock dependencies
vi.mock('../../src/stores/ui.svelte', () => ({
    uiState: { toggleSettingsModal: vi.fn() }
}));

vi.mock('../../src/locales/i18n', () => ({
    _: {
        subscribe: (cb: (k: string) => string) => { cb((k: string) => k); return () => {}; }
    },
    t: (key: string) => key
}));

vi.mock('../../src/services/frameSupportService', () => ({
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

describe('NewsSentimentPanel render benchmark', () => {
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
             regime: "bull"
        };
        newsStore.isLoading = false;

        target = document.createElement('div');
        document.body.appendChild(target);
    });

    afterEach(() => {
        document.body.removeChild(target);
    });

    bench('render panel', () => {
        const component = mount(NewsSentimentPanel, {
            target,
            props: { variant: 'main' }
        });
        unmount(component);
    });
});
