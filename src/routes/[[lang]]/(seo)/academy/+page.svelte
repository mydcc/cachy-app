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

<!--
  Public SEO route for the Trading Academy. Renders the same AcademyContent
  as the AcademyWindow so tab state, favorites and accessibility stay in one
  place — only the page frame (full-height layout + document title) is local.
-->

<script lang="ts">
   import { page } from '$app/stores';
   import AcademyContent from "../../../../components/shared/AcademyContent.svelte";
   import de from '../../../../locales/locales/de.json';
   import en from '../../../../locales/locales/en.json';

   let lang = $derived($page.params.lang || 'en');
   let dict = $derived(lang === 'de' ? de : en);
   let title = $derived(dict.academy?.title || "Trading Academy");
</script>

<svelte:head>
  <title>{title} - Cachy</title>
</svelte:head>

<div class="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-[var(--bg-primary)]">
   <!-- AcademyContent carries its own @container root + padding. -->
   <AcademyContent />
</div>
