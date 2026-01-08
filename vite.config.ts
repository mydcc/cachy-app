import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		'import.meta.env.VITE_APP_VERSION': JSON.stringify(process.env.npm_package_version)
	},
	optimizeDeps: {
		include: ['intl-messageformat']
	},
	ssr: {
		noExternal: ['intl-messageformat', '@formatjs/icu-messageformat-parser', '@formatjs/icu-skeleton-parser', 'svelte-i18n']
	}
});