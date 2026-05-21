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

import { describe, it, expect } from 'vitest';
import {
  NewsApiArticleSchema,
  NewsApiResponseSchema,
  CryptoPanicPostSchema,
  CryptoPanicResponseSchema
} from './newsSchemas';

describe('NewsApiArticleSchema', () => {
  it('should parse a valid complete article', () => {
    const validData = {
      source: { id: 'bbc-news', name: 'BBC News' },
      author: 'John Doe',
      title: 'Breaking News',
      description: 'A breaking news story',
      url: 'https://example.com/story',
      urlToImage: 'https://example.com/image.jpg',
      publishedAt: '2023-01-01T12:00:00Z',
      content: 'Full story content here.'
    };

    const result = NewsApiArticleSchema.safeParse(validData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validData);
    }
  });

  it('should parse a valid minimal object with missing optional fields', () => {
    const minimalData = {};
    const result = NewsApiArticleSchema.safeParse(minimalData);
    expect(result.success).toBe(true);
  });

  it('should parse objects with null values for nullable fields', () => {
    const dataWithNulls = {
      source: { id: null, name: 'Unknown' },
      author: null,
      description: null,
      urlToImage: null,
      content: null
    };
    const result = NewsApiArticleSchema.safeParse(dataWithNulls);
    expect(result.success).toBe(true);
  });

  it('should allow extra properties due to passthrough', () => {
    const dataWithExtras = {
      title: 'Title',
      extraField: 'Should be allowed',
      anotherExtra: 123
    };
    const result = NewsApiArticleSchema.safeParse(dataWithExtras);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveProperty('extraField');
      expect(result.data).toHaveProperty('anotherExtra');
    }
  });

  it('should fail parsing if fields have incorrect types', () => {
    const invalidData = {
      title: 12345, // Should be a string
      author: { name: 'Invalid' } // Should be a string or null
    };
    const result = NewsApiArticleSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

describe('NewsApiResponseSchema', () => {
  it('should parse a valid complete response', () => {
    const validData = {
      status: 'ok',
      totalResults: 100,
      articles: [
        { title: 'Article 1', author: 'Author 1' }
      ]
    };
    const result = NewsApiResponseSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should parse a failed response', () => {
    const errorData = {
      status: 'error',
      code: 'rateLimited',
      message: 'You have made too many requests.'
    };
    const result = NewsApiResponseSchema.safeParse(errorData);
    expect(result.success).toBe(true);
  });

  it('should fail if status is missing or not a string', () => {
    const invalidData = {
      totalResults: 10
    };
    const result = NewsApiResponseSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});

describe('CryptoPanicPostSchema', () => {
  it('should parse a valid complete post', () => {
    const validData = {
      kind: 'news',
      domain: 'example.com',
      source: { title: 'Example News', region: 'en', domain: 'example.com', path: null },
      title: 'Crypto goes up',
      published_at: '2023-01-01T12:00:00Z',
      slug: 'crypto-goes-up',
      id: 12345,
      url: 'https://cryptopanic.com/news/12345',
      created_at: '2023-01-01T12:00:00Z',
      votes: {
        negative: 1,
        positive: 10,
        important: 5,
        liked: 8,
        disliked: 2,
        lol: 0,
        toxic: 0,
        saved: 3,
        comments: 4
      }
    };
    const result = CryptoPanicPostSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should parse minimal post', () => {
    const result = CryptoPanicPostSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

describe('CryptoPanicResponseSchema', () => {
  it('should parse a valid response', () => {
    const validData = {
      count: 50,
      next: 'https://api.cryptopanic.com/v1/posts/?page=2',
      previous: null,
      results: [
        { title: 'Post 1' },
        { title: 'Post 2' }
      ]
    };
    const result = CryptoPanicResponseSchema.safeParse(validData);
    expect(result.success).toBe(true);
  });

  it('should fail if results is not an array of valid posts', () => {
    const invalidData = {
      results: [
        'Just a string, not a post object'
      ]
    };
    const result = CryptoPanicResponseSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
  });
});
