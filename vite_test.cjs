const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const purify = DOMPurify(window);
console.log(purify.sanitize("<b>bold</b><script>alert(1)</script>", { ALLOWED_TAGS: [], KEEP_CONTENT: true }));
