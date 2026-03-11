const fs = require('fs');

const path = 'src/lib/server/sanitizer.test.ts';
let code = fs.readFileSync(path, 'utf8');

const testToAdd = `
    it('should strip javascript: URIs from href attributes', () => {
      const input = '<a href="javascript:alert(1)">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).not.toContain('javascript:alert');
    });`;

if (!code.includes('should strip javascript: URIs')) {
  code = code.replace(
    /it\('should preserve allowed tags', \(\) => \{/g,
    testToAdd + "\n\n    it('should preserve allowed tags', () => {"
  );
  fs.writeFileSync(path, code);
}
