
const ALLOWED_DOMAINS = [
  "nitter.net", "nitter.cz", "nitter.it", "nitter.poast.org", "nitter.privacydev.net",
  "cointelegraph.com", "coindesk.com", "decrypt.co", "theblock.co",
  "rss.app", "polymarket.com", "medium.com"
];

function isUrlAllowed(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname.startsWith("192.168.") || u.hostname.startsWith("10.")) {
      return false;
    }
    return ALLOWED_DOMAINS.some(d => u.hostname === d || u.hostname.endsWith("." + d));
  } catch {
    return false;
  }
}

const tests = [
  { url: "https://nitter.net/search?q=bitcoin", expected: true },
  { url: "https://sub.nitter.net/foo", expected: true },
  { url: "http://localhost:3000", expected: false },
  { url: "http://127.0.0.1/admin", expected: false },
  { url: "https://google.com", expected: false },
  { url: "ftp://nitter.net", expected: false },
  { url: "https://evil-nitter.net", expected: false },
  { url: "https://cointelegraph.com/rss", expected: true }
];

let failed = 0;
tests.forEach(t => {
  const result = isUrlAllowed(t.url);
  if (result !== t.expected) {
    console.error(`FAILED: ${t.url} -> Expected ${t.expected}, got ${result}`);
    failed++;
  } else {
    console.log(`PASS: ${t.url}`);
  }
});

if (failed > 0) process.exit(1);
console.log("All security checks passed.");
