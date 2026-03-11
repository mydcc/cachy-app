const fs = require('fs');
let content = fs.readFileSync('src/hooks.server.test.ts', 'utf8');

const svelteKitMock = `
// Mock SvelteKit sequence hook directly to avoid 'get_request_store' internal errors
// when testing outside the actual SvelteKit application context.
vi.mock('@sveltejs/kit/hooks', () => ({
  sequence: (...handlers) => {
    return async ({ event, resolve }) => {
      let currentIndex = 0;

      const next = async (currentEvent, currentOptions) => {
        if (currentIndex >= handlers.length) {
          return resolve(currentEvent, currentOptions);
        }

        const handler = handlers[currentIndex++];
        return handler({
          event: currentEvent,
          resolve: async (e, opts) => next(e || currentEvent, opts || currentOptions)
        });
      };

      return next(event);
    };
  }
}));
`;

content = content.replace("vi.mock('$app/environment', () => ({", svelteKitMock + "\nvi.mock('$app/environment', () => ({");

fs.writeFileSync('src/hooks.server.test.ts', content);
