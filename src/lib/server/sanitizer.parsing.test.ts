// @vitest-environment node
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

/**
 * Characterisation tests for the HTML pipeline behind the server sanitizer.
 *
 * Why this file exists separately from `sanitizer.test.ts`: that file, despite
 * its name and location, imports `sanitizeHtml` from `src/lib/utils/sanitizer`
 * — the client-side sanitizer — and replaces DOMPurify with a hand-written
 * stub. So the module in this directory had no coverage of its own, and the
 * file name suggested otherwise.
 *
 * These tests run the real DOMPurify on a real jsdom window. That matters
 * because the guarantee they pin does not come from DOMPurify's tag list alone
 * but from how the HTML parser *below* it reinterprets hostile markup. When
 * jsdom ships a new parser, these are the tests that notice.
 */

import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { sanitizeChatInput, sanitizeHtmlToText } from './sanitizer';

/**
 * With no allowed tags, a surviving `<` is either a parser artefact or an
 * unescaped one. Downstream callers treat this output as plain text (RSS
 * descriptions), so any tag opener that slips through is the bug.
 */
function expectNoTagOpeners(text: string): void {
  expect(text).not.toMatch(/<[a-zA-Z/!]/);
}

/** Namespace-confusion payload: the classic mXSS shape, where the parser's
 *  second pass turns inert markup back into live markup. */
const NAMESPACE_CONFUSION =
  '<math><mtext><table><mglyph><style><!--</style>' +
  '<img title="--><img src=x onerror=alert(1)>">';

describe('sanitizeHtmlToText', () => {
  it('returns an empty string for empty input', () => {
    expect(sanitizeHtmlToText('')).toBe('');
  });

  it('keeps the surrounding text and drops script and style content entirely', () => {
    const result = sanitizeHtmlToText(
      'Hello <script>alert(1)</script> world <style>body{color:red}</style>',
    );

    expect(result).toContain('Hello');
    expect(result).toContain('world');
    // Not just the tags: the contents go too, otherwise the payload text would
    // still be rendered somewhere downstream.
    expect(result).not.toContain('alert(1)');
    expect(result).not.toContain('color:red');
  });

  it('produces no markup for a math/mtext namespace-confusion payload', () => {
    const result = sanitizeHtmlToText(NAMESPACE_CONFUSION);

    expectNoTagOpeners(result);
    expect(result).not.toContain('onerror');
  });

  it('drops svg and foreignObject content while keeping surrounding text', () => {
    const result = sanitizeHtmlToText(
      '<svg><foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject></svg>ok',
    );

    expect(result).toContain('ok');
    expectNoTagOpeners(result);
  });

  it('drops noscript and template payloads', () => {
    const noscript = sanitizeHtmlToText(
      '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    );
    const template = sanitizeHtmlToText('<template><img src=x onerror=alert(1)></template>tpl');

    expectNoTagOpeners(noscript);
    expectNoTagOpeners(template);
    expect(template).toContain('tpl');
  });

  it('does not carry a javascript: URL through as text', () => {
    const result = sanitizeHtmlToText('<a href="javascript:alert(1)">click</a>');

    expect(result).toContain('click');
    expect(result).not.toContain('javascript:');
  });

  it('recovers text from malformed markup', () => {
    const result = sanitizeHtmlToText('<div><p>unclosed<b>bold');

    expectNoTagOpeners(result);
    expect(result).toContain('unclosed');
    expect(result).toContain('bold');
  });

  it('trims surrounding whitespace', () => {
    expect(sanitizeHtmlToText('  <p>text</p>  ')).toBe('text');
  });

  it('stays inert when an HTML parser reads the output back', () => {
    // The strongest form of the guarantee: not "no tag openers in the string",
    // but "nothing executable comes back out". If a future parser version
    // reintroduces markup here, the element count moves and this fails.
    const output = sanitizeHtmlToText(NAMESPACE_CONFUSION);
    const { document } = new JSDOM(`<body>${output}</body>`).window;

    expect(document.body.children.length).toBe(0);
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });
});

describe('sanitizeChatInput', () => {
  it('applies the same no-markup guarantee as sanitizeHtmlToText', () => {
    const result = sanitizeChatInput(NAMESPACE_CONFUSION);

    expectNoTagOpeners(result);
    expect(result).not.toContain('onerror');
  });

  it('strips tags but keeps their text content', () => {
    const result = sanitizeChatInput('**bold** <b>text</b>');

    expect(result).toContain('text');
    expectNoTagOpeners(result);
  });
});
