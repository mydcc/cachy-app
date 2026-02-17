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
  import { loadInstruction } from '../../services/markdownLoader';
  import DOMPurify from 'dompurify';

  interface Props {
    slug?: "dashboard" | "journal" | "changelog" | "guide" | "privacy" | "whitepaper";
    lang?: string;
    content?: string;
  }

  let { slug, lang = 'en', content = '' }: Props = $props();

  let fetchedContent = $state('');
  let loading = $state(false);
  let error = $state('');

  // Sanitize content before rendering
  let displayContent = $derived(DOMPurify.sanitize(content || fetchedContent));

  $effect(() => {
    // Only fetch if content is not provided and we have a slug
    if (!content && !fetchedContent && slug) {
      async function fetch() {
        loading = true;
        error = '';
        try {
          // @ts-ignore - slug checked above
          const result = await loadInstruction(slug, lang);
          fetchedContent = result.html;
        } catch (e) {
          console.error("ContentRenderer fetch error:", e);
          error = 'Failed to load content.';
        } finally {
          loading = false;
        }
      }
      fetch();
    }
  });
</script>

<div class="content-renderer prose dark:prose-invert max-w-none p-4 md:p-8">
  {#if loading}
    <div class="flex justify-center p-8 text-[var(--text-secondary)]">
       <span>Loading...</span>
    </div>
  {:else if error}
    <div class="text-[var(--danger-color)] p-4 border border-[var(--danger-color)] rounded">
      {error}
    </div>
  {:else if displayContent}
    {@html displayContent}
  {:else}
    <!-- Empty state or waiting for props -->
  {/if}
</div>

<style>
  :global(.content-renderer img) {
    border-radius: 0.5rem;
    max-width: 100%;
  }
  :global(.content-renderer a) {
    color: var(--accent-color);
    text-decoration: none;
  }
  :global(.content-renderer a:hover) {
    text-decoration: underline;
  }
  /* Ensure headings have scroll margin for anchor links */
  :global(.content-renderer h1, .content-renderer h2, .content-renderer h3) {
    scroll-margin-top: 5rem;
  }
</style>
