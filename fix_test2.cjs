const fs = require('fs');
let content = fs.readFileSync('src/hooks.server.test.ts', 'utf8');

// Replace the request with a full mock of what SvelteKit's sequence needs
const replacement = `    // SvelteKit's sequence hook needs a fully functioning event
    // To mock RequestEvent safely without triggering get_request_store internal errors,
    // we can use a mock approach that completely bypasses the sequence() internal behavior or use
    // vitest to mock the internal behavior if necessary.
    // However, it's easier to just call each handler in the sequence ourselves exactly as
    // the sequence() helper does, or just mock the route.id to avoid issues.

    // Instead of testing handle which is just sequence(a,b,c) from sveltejs/kit,
    // we should test the handlers individually since sequence is already tested by SvelteKit.
    // However, since the task asks for an integration test of the handle sequence:
`;

content = content.replace("const mockRequest = new Request('http://localhost/test-path', {", `
    // Import all the handlers
    const { default: hooks } = await import('./hooks.server');

    const mockRequest = new Request('http://localhost/test-path', {`);

fs.writeFileSync('src/hooks.server.test.ts', content);
