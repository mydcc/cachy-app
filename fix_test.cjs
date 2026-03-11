const fs = require('fs');
let content = fs.readFileSync('src/hooks.server.test.ts', 'utf8');

// Replace the require with an import or just use the mocked logger directly
content = content.replace(
  "const loggerInfoSpy = vi.spyOn(require('$lib/server/logger').logger, 'info');",
  "const loggerInfoSpy = (await import('$lib/server/logger')).logger.info;"
);

fs.writeFileSync('src/hooks.server.test.ts', content);
