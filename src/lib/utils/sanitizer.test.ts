// @vitest-environment jsdom
/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/**
 * Tests for the client-side sanitizer.
 *
 * Why the DOM environment and no DOMPurify mock: this file used to live at
 * `src/lib/server/sanitizer.test.ts`, where its name claimed to cover the
 * server sanitizer while its import reached into this module, and it replaced
 * DOMPurify with a hand-written stub. That stub answered from itself — one of
 * its lines was `if (dirty.includes('iframe')) { return '<div>Safe</div>'; }`
 * — so every "removes forbidden tags" assertion described the stub's own
 * behaviour. A passing test that cannot fail is worse than no test, because it
 * is read as a guard.
 *
 * So: real DOMPurify against a real window. Under `@vitest-environment jsdom`
 * a global `window` exists, which is exactly the condition DOMPurify's
 * pre-instantiated browser export needs — no dual-shape factory, no cast, no
 * mock. If the allowlist in `sanitizeHtml` is wrong, these fail.
 *
 * Only `$app/env` is mocked, to drive the `browser` flag that gates the SSR
 * passthrough. That is an environment flag, not the subject under test.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeHtml } from './sanitizer';

let browserValue = true;

vi.mock('$app/env', () => ({
  get browser() {
    return browserValue;
  },
}));

describe('sanitizeHtml', () => {
  beforeEach(() => {
    browserValue = true;
  });

  describe('allowlist', () => {
    it('preserves allowed inline tags', () => {
      const input = '<p><b>Bold</b> <i>Italic</i> <strong>Strong</strong> <em>Emphasis</em></p>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('preserves lists and tables', () => {
      const input = '<ul><li>Item</li></ul><table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('preserves nested allowed tags', () => {
      const input = '<div><p><span>Text</span></p></div>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('keeps the allowed attributes on a link', () => {
      const input = '<a href="https://example.com" target="_blank" title="Link" class="btn">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('title="Link"');
      expect(result).toContain('class="btn"');
    });
  });

  describe('rejection', () => {
    // Real DOMPurify now, not the stub. `img` is absent from ALLOWED_TAGS, so
    // it goes even without an explicit forbid list — which is the point: the
    // allowlist is doing the work.
    it('drops tags that are not on the allowlist', () => {
      const result = sanitizeHtml(
        '<div>Safe</div><script>alert("xss")</script><iframe></iframe><img src="x" onerror="alert(1)">',
      );

      expect(result).toContain('<div>Safe</div>');
      expect(result).not.toContain('<script');
      expect(result).not.toContain('<iframe');
      expect(result).not.toContain('<img');
    });

    // Event handlers and `style` go; `data-*` stays. That is not an oversight
    // in the test — it is what the sanitizer actually does, and the stub that
    // used to cover this case hid the difference by forcing
    // `FORBID_ATTR: ['onclick', 'onmouseover', 'style', 'data-custom']`.
    // Inert for XSS: no browser executes anything from a data attribute, and
    // DOMPurify allows them by default. Tightening that is a policy change,
    // which BUG-0638 puts out of scope.
    //
    // Not inert for everything, though: `GlobalTracker.svelte` listens for
    // clicks document-wide and forwards `data-track-id` plus the JSON in
    // `data-track-context` to the analytics service. Surviving data
    // attributes are therefore an analytics-injection surface, not a
    // script-execution one — filed as BUG-0645, deliberately not fixed here.
    it('strips event handlers and style but keeps inert data attributes', () => {
      const result = sanitizeHtml(
        '<p onclick="alert(1)" onmouseover="run()" style="color:red" data-custom="value">Content</p>',
      );

      expect(result).not.toContain('onclick');
      expect(result).not.toContain('onmouseover');
      expect(result).not.toContain('style=');
      expect(result).toContain('data-custom="value"');
      expect(result).toBe('<p data-custom="value">Content</p>');
    });

    it('strips the style attribute entirely', () => {
      const result = sanitizeHtml('<span style="color: red; background-image: url(javascript:alert(1))">Text</span>');
      expect(result).not.toContain('style=');
      expect(result).not.toContain('javascript:alert');
    });

    // An allowlist that kept javascript: URLs would make every rendered href a
    // script execution. `href` is allowed, so this is the attribute that needs
    // the guard, not the one that can be waved through.
    it('does not keep a javascript: URL on an allowed href', () => {
      const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>');
      expect(result).toContain('click');
      expect(result).not.toContain('javascript:');
    });

    // BUG-0645. GlobalTracker reads these three off any clicked node and
    // forwards the id plus the parsed JSON context to the analytics service,
    // so surviving ones are an injection surface — `track-ignore` the other way
    // round, silencing tracking, and it triggers on an empty value too.
    it('drops the data attributes the analytics tracker reads', () => {
      const result = sanitizeHtml(
        '<p data-track-id="fake.purchase" data-track-context=\'{"orderId":42}\'>Text</p>' +
          '<div data-track-ignore="">hidden</div>',
      );

      expect(result).not.toContain('data-track-id');
      expect(result).not.toContain('data-track-context');
      expect(result).not.toContain('data-track-ignore');
      // The elements and their text stay; only the attributes go.
      expect(result).toContain('Text');
      expect(result).toContain('hidden');
    });

    // The guard is deliberately narrow: blanket-forbidding data-* would be a
    // wider policy change than BUG-0645 needs.
    it('keeps data attributes the tracker does not read', () => {
      expect(sanitizeHtml('<p data-custom="x" data-symbol="BTCUSDT">Text</p>'))
        .toContain('data-custom="x"');
    });

    // Guards the reason the root-cause fix was rejected: switching
    // DialogView to escaped rendering would lose these breaks. See BUG-0645.
    it('keeps the line breaks the order confirmation message relies on', () => {
      expect(sanitizeHtml('BTCUSDT 0.5 Long.<br>TP: 70000<br>Stop: 60000'))
        .toBe('BTCUSDT 0.5 Long.<br>TP: 70000<br>Stop: 60000');
    });
  });

  describe('SSR passthrough', () => {
    it('returns the input unchanged when not in a browser', () => {
      browserValue = false;
      const input = '<script>alert("XSS")</script><img src="x" onerror="alert(1)">';

      // Deliberately asserts the unsafe passthrough. It is the documented
      // behaviour — server-rendered markup is escaped by the framework — and a
      // test that "fixed" it would be asserting the opposite of the contract.
      expect(sanitizeHtml(input)).toBe(input);
    });
  });

  describe('edge cases', () => {
    it('returns an empty string for empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('leaves plain text untouched', () => {
      expect(sanitizeHtml('Just some text')).toBe('Just some text');
    });

    it('closes unclosed tags', () => {
      const result = sanitizeHtml('<div><b>Unclosed tag');
      expect(result).toContain('<div><b>Unclosed tag</b></div>');
    });
  });
});