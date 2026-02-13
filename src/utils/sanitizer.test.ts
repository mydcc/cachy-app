/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeHtml } from './sanitizer';

let browserValue = true;

vi.mock('$app/environment', () => ({
  get browser() {
    return browserValue;
  }
}));

describe('sanitizeHtml', () => {
  beforeEach(() => {
    browserValue = true;
  });

  describe('Sanitization (browser=true)', () => {
    it('should preserve allowed tags', () => {
      const input = '<p><b>Bold</b> <i>Italic</i> <strong>Strong</strong> <em>Emphasis</em></p>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('should preserve allowed links and attributes', () => {
      const input = '<a href="https://example.com" target="_blank" title="Link" class="btn">Link</a>';
      const result = sanitizeHtml(input);
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('target="_blank"');
      expect(result).toContain('title="Link"');
      expect(result).toContain('class="btn"');
    });

    it('should preserve lists and tables', () => {
      const input = '<ul><li>Item</li></ul><table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Cell</td></tr></tbody></table>';
      expect(sanitizeHtml(input)).toBe(input);
    });

    it('should remove forbidden tags', () => {
      const input = '<div>Safe</div><script>alert("xss")</script><iframe></iframe><img src="x" onerror="alert(1)">';
      const result = sanitizeHtml(input);
      expect(result).toContain('<div>Safe</div>');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('<iframe>');
      expect(result).not.toContain('<img'); // img is not in ALLOWED_TAGS
    });

    it('should strip forbidden attributes from allowed tags', () => {
      const input = '<p onclick="alert(1)" onmouseover="run()" data-custom="value">Content</p>';
      const result = sanitizeHtml(input);
      expect(result).toBe('<p>Content</p>');
    });

    it('should allow style attribute but sanitize it', () => {
      const input = '<span style="color: red; background-image: url(javascript:alert(1))">Text</span>';
      const result = sanitizeHtml(input);
      expect(result).toContain('style="color: red;"');
      expect(result).not.toContain('javascript:alert');
    });

    it('should handle nested allowed tags', () => {
      const input = '<div><p><span>Text</span></p></div>';
      expect(sanitizeHtml(input)).toBe(input);
    });
  });

  describe('SSR Safety (browser=false)', () => {
    it('should return input unchanged when browser is false', () => {
      browserValue = false;
      const input = '<script>alert("XSS")</script><img src="x" onerror="alert(1)">';
      expect(sanitizeHtml(input)).toBe(input);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty string', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('should handle plain text', () => {
      expect(sanitizeHtml('Just some text')).toBe('Just some text');
    });

    it('should handle malformed HTML', () => {
      const input = '<div><b>Unclosed tag';
      const result = sanitizeHtml(input);
      expect(result).toContain('<div><b>Unclosed tag</b></div>'); // DOMPurify fixes it
    });
  });
});
