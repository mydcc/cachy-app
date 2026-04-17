/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { describe, it, expect } from 'vitest';
import { extractApiCredentials } from './requestUtils';

describe('extractApiCredentials', () => {
    it('should return undefined when no credentials are provided', () => {
        const request = new Request('http://localhost');
        const result = extractApiCredentials(request);

        expect(result).toEqual({
            apiKey: undefined,
            apiSecret: undefined,
            passphrase: undefined
        });
    });

    it('should extract credentials from headers', () => {
        const headers = new Headers();
        headers.set('x-api-key', 'header-key');
        headers.set('x-api-secret', 'header-secret');
        headers.set('x-api-passphrase', 'header-passphrase');

        const request = new Request('http://localhost', { headers });
        const result = extractApiCredentials(request);

        expect(result).toEqual({
            apiKey: 'header-key',
            apiSecret: 'header-secret',
            passphrase: 'header-passphrase'
        });
    });

    it('should extract credentials from body if headers are missing', () => {
        const request = new Request('http://localhost');
        const body = {
            apiKey: 'body-key',
            apiSecret: 'body-secret',
            passphrase: 'body-passphrase'
        };
        const result = extractApiCredentials(request, body);

        expect(result).toEqual({
            apiKey: 'body-key',
            apiSecret: 'body-secret',
            passphrase: 'body-passphrase'
        });
    });

    it('should prefer headers over body when both are provided', () => {
        const headers = new Headers();
        headers.set('x-api-key', 'header-key');
        headers.set('x-api-passphrase', 'header-passphrase');
        // apiSecret is missing from headers

        const request = new Request('http://localhost', { headers });
        const body = {
            apiKey: 'body-key', // Should be ignored in favor of header
            apiSecret: 'body-secret', // Should be used since header is missing
            passphrase: 'body-passphrase' // Should be ignored in favor of header
        };
        const result = extractApiCredentials(request, body);

        expect(result).toEqual({
            apiKey: 'header-key',
            apiSecret: 'body-secret',
            passphrase: 'header-passphrase'
        });
    });

    it('should safely handle non-object body types', () => {
        const request = new Request('http://localhost');

        expect(extractApiCredentials(request, null)).toEqual({
            apiKey: undefined,
            apiSecret: undefined,
            passphrase: undefined
        });

        expect(extractApiCredentials(request, "just a string")).toEqual({
            apiKey: undefined,
            apiSecret: undefined,
            passphrase: undefined
        });

        expect(extractApiCredentials(request, 123)).toEqual({
            apiKey: undefined,
            apiSecret: undefined,
            passphrase: undefined
        });
    });

    it('should safely handle array body type', () => {
        const request = new Request('http://localhost');

        expect(extractApiCredentials(request, ['a', 'b'])).toEqual({
            apiKey: undefined,
            apiSecret: undefined,
            passphrase: undefined
        });
    });

    it('should fall back to body when header is empty string', () => {
        const headers = new Headers();
        headers.set('x-api-key', '');
        headers.set('x-api-secret', '');
        headers.set('x-api-passphrase', '');

        const request = new Request('http://localhost', { headers });
        const body = {
            apiKey: 'body-key',
            apiSecret: 'body-secret',
            passphrase: 'body-passphrase'
        };
        const result = extractApiCredentials(request, body);

        expect(result).toEqual({
            apiKey: 'body-key',
            apiSecret: 'body-secret',
            passphrase: 'body-passphrase'
        });
    });

    it('should convert body properties to strings', () => {
        const request = new Request('http://localhost');
        const body = {
            apiKey: 12345,
            apiSecret: true,
            passphrase: { nested: 'value' }
        };
        const result = extractApiCredentials(request, body);

        expect(result).toEqual({
            apiKey: '12345',
            apiSecret: 'true',
            passphrase: '[object Object]'
        });
    });
});
