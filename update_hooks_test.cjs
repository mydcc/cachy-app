const fs = require('fs');
const content = fs.readFileSync('src/hooks.server.test.ts', 'utf8');

const importReplacement = `import { headersHandler, handle } from './hooks.server';`;
let newContent = content.replace(`import { headersHandler } from './hooks.server';`, importReplacement);

const newTest = `
describe('handle sequence (Integration)', () => {
  it('should execute loggingHandler, headersHandler, and themeHandler in sequence', async () => {
    // Arrange
    const mockRequest = new Request('http://localhost/test-path', {
      method: 'GET'
    });

    const mockCookies = {
      get: vi.fn().mockImplementation((key) => {
        if (key === 'cachy_theme') return 'light'; // Simulating a light theme
        return null;
      })
    };

    const mockEvent = {
      request: mockRequest,
      url: new URL('http://localhost/test-path'),
      cookies: mockCookies
    } as unknown as RequestEvent;

    // Create a mock response
    const mockResponse = new Response('<html><head></head><body>Hello</body></html>', { status: 200 });

    // Mock the inner resolve function
    // It should receive an options object with transformPageChunk from the themeHandler
    const mockResolve = vi.fn().mockImplementation(async (event, opts) => {
      if (opts && opts.transformPageChunk) {
        // Simulate SvelteKit calling the transformPageChunk function
        const transformedHtml = opts.transformPageChunk({
          html: '<html><head></head><body>Hello</body></html>',
          done: true
        });

        // Return a response with the transformed HTML body for our test assertion
        return new Response(transformedHtml, { status: 200 });
      }
      return mockResponse;
    });

    const loggerInfoSpy = vi.spyOn(require('$lib/server/logger').logger, 'info');

    // Act
    const result = await handle({ event: mockEvent, resolve: mockResolve });

    // Assert
    // 1. Check loggingHandler behavior
    expect(loggerInfoSpy).toHaveBeenCalledWith('[REQ] GET /test-path');
    expect(loggerInfoSpy).toHaveBeenCalledWith(expect.stringMatching(/\\[RES\\] GET \\/test-path -> 200 \\(\\d+ms\\)/));

    // 2. Check headersHandler behavior
    expect(result.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');
    expect(result.headers.get('Cross-Origin-Embedder-Policy')).toBe('credentialless');
    expect(result.headers.get('X-Frame-Options')).toBe('SAMEORIGIN');

    // 3. Check themeHandler behavior (transformPageChunk application)
    const bodyText = await result.text();
    expect(bodyText).toContain('<body class="theme-light">');
  });
});
`;

newContent = newContent + newTest;
fs.writeFileSync('src/hooks.server.test.ts', newContent);
