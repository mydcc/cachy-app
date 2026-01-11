import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter(),
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'https://s.cachy.app'],
				'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
				'font-src': ['self', 'data:', 'https://fonts.gstatic.com'],
				'img-src': ['self', 'https:', 'data:', 'blob:'],
				'connect-src': [
					'self',
					'https://s.cachy.app',
					'https://fapi.bitunix.com',
					'https://api.bitunix.com',
					'wss://fapi.bitunix.com',
					'https://api.imgbb.com',
					'https://i.ibb.co', // ImgBB often redirects here
                    'https://fapi.binance.com', // Binance support
                    'wss://fstream.binance.com' // Binance support
				],
				'worker-src': ['self', 'blob:'],
				'frame-src': ['self', 'https://s.cachy.app'] // Matomo iframe (noscript)
			}
		}
	}
};

export default config;
