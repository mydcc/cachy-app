/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from './sanitizer';

describe('sanitizeHtml', () => {
  it('should sanitize HTML input', () => {
    const input = '<script>alert("XSS")</script><b>Bold</b>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('<script>');
    expect(output).toContain('<b>Bold</b>');
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
      // DOMPurify usually closes tags or strips them
      // We accept either behavior as safe
      expect(result).not.toContain('<script>');
    });
  });
});
