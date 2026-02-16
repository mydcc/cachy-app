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
  import { page } from '$app/stores';
  import CachyIcon from '../../../components/shared/CachyIcon.svelte';
  import { icons } from '../../../lib/constants';

  import de from '../../../locales/locales/de.json';
  import en from '../../../locales/locales/en.json';

  let { children } = $props();

  let lang = $derived($page.params.lang || 'en');
  let dict = $derived(lang === 'de' ? de : en);

  let launchText = $derived(lang === 'de' ? 'App starten' : 'Launch App');
</script>

<div class="min-h-screen flex flex-col bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans">
  <header class="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] sticky top-0 z-50 backdrop-blur-md bg-opacity-80">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <a href={lang === 'de' ? '/de/academy' : '/academy'} class="flex items-center gap-3 hover:opacity-80 transition-opacity">
        <CachyIcon class="h-8 w-8" />
        <span class="text-xl font-bold tracking-tight">Cachy</span>
      </a>

      <div class="flex items-center gap-4">
         <nav class="hidden md:flex gap-6 text-sm font-medium">
            <a href={lang === 'de' ? '/de/academy' : '/academy'} class="hover:text-[var(--accent-color)] transition-colors">{dict.app.academy}</a>
            <a href={lang === 'de' ? '/de/guide' : '/guide'} class="hover:text-[var(--accent-color)] transition-colors">{dict.app.guideButton}</a>
            <a href={lang === 'de' ? '/de/whitepaper' : '/whitepaper'} class="hover:text-[var(--accent-color)] transition-colors">{dict.app.whitepaper}</a>
         </nav>

         <a href="/" class="bg-[var(--accent-color)] text-[var(--btn-accent-text)] px-4 py-2 rounded-lg text-sm font-bold hover:brightness-110 transition-all flex items-center gap-2 shadow-lg">
            <span>{launchText}</span>
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
         </a>
      </div>
    </div>
  </header>

  <main class="flex-grow">
    {@render children()}
  </main>

  <footer class="border-t border-[var(--border-color)] bg-[var(--bg-secondary)] py-8 mt-12">
     <div class="max-w-7xl mx-auto px-4 text-center text-[var(--text-secondary)] text-sm">
        <div class="flex justify-center gap-6 mb-4">
           <a href={lang === 'de' ? '/de/changelog' : '/changelog'} class="hover:text-[var(--text-primary)] transition-colors">{dict.app.changelogTitle}</a>
           <a href={lang === 'de' ? '/de/privacy' : '/privacy'} class="hover:text-[var(--text-primary)] transition-colors">{dict.app.privacyLegal}</a>
           <a href="https://deepwiki.com/mydcc/cachy-app" target="_blank" rel="noopener noreferrer" class="text-[var(--text-secondary)] hover:text-[var(--accent-color)] transition-colors flex items-center gap-1">
              {@html icons.deepwiki}
              Deepwiki
           </a>
        </div>
        <p>{dict.app.copyright}</p>
     </div>
  </footer>
</div>
