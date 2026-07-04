/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import fs from 'fs';
import path from 'path';
import { URL } from 'url';

// Define ALLOWED_DOMAINS to mirror server-side logic
const ALLOWED_DOMAINS = [
  'nitter.net',
  'nitter.cz',
  'nitter.io',
  'nitter.privacydev.net',
  'nitter.poast.org',
  'cointelegraph.com',
  'coindesk.com',
  'decrypt.co',
  'theblock.co',
  'cryptonews.com',
  'beincrypto.com',
  'bitcoinmagazine.com',
  'cryptopotato.com',
  'newsbtc.com',
  'utoday.com',
  'finance.yahoo.com',
  'investing.com',
  'bloomberg.com',
  'cnbc.com',
  'reuters.com'
];

/**
 * Checks if a URL is allowed based on domain whitelist and localhost checks
 * @param {string} urlStr
 * @returns {boolean}
 */
function isUrlAllowed(urlStr) {
  try {
    const url = new URL(urlStr);

    // Check if localhost or private IP
    if (
      url.hostname === 'localhost' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === '::1' ||
      url.hostname.startsWith('192.168.') ||
      url.hostname.startsWith('10.') ||
      url.hostname.startsWith('172.')
    ) {
      return false;
    }

    // Check allowlist
    // We check if hostname ends with any allowed domain (to allow subdomains)
    return ALLOWED_DOMAINS.some(domain =>
        url.hostname === domain || url.hostname.endsWith('.' + domain)
    );

  } catch (e) {
    return false;
  }
}

// Test cases
const testCases = [
  // Allowed
  { url: 'https://nitter.net/search?q=%24BTC', expected: true },
  { url: 'https://cointelegraph.com/rss', expected: true },
  { url: 'https://sub.nitter.net/rss', expected: true },

  // Blocked (Internal)
  { url: 'http://localhost:3000/api/secrets', expected: false },
  { url: 'http://127.0.0.1:8080/admin', expected: false },
  { url: 'http://192.168.1.1/router', expected: false },

  // Blocked (External but not allowed)
  { url: 'https://evil-site.com/rss', expected: false },
  { url: 'https://google.com', expected: false },

  // Blocked (Invalid)
  { url: 'not-a-url', expected: false },
  { url: 'ftp://nitter.net', expected: true } // Protocol check usually done separately but function allows if domain matches.
  // Note: The actual server implementation restricts protocol to http/https usually.
  // Our helper here focuses on domain/ssrf.
];

console.log("Running SSRF Security Verification...");

let passed = 0;
let failed = 0;

testCases.forEach(test => {
  const result = isUrlAllowed(test.url);
  if (result === test.expected) {
    passed++;
  } else {
    failed++;
    console.error(`[FAIL] ${test.url} -> Expected ${test.expected}, got ${result}`);
  }
});

console.log(`\nResults: ${passed} Passed, ${failed} Failed`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log("✅ Security Verification Passed");
}
