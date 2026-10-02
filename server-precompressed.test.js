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
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import zlib from 'node:zlib';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import {
  buildPrecompressedIndex,
  contentTypeFor,
  precompressedAssets,
  selectVariant,
} from './server-precompressed.js';

/** @type {string} */
let root;
/** @type {import('express').Express} */
let app;
/** @type {import('node:http').Server} */
let server;
/** @type {string} */
let baseUrl;

const JS_BODY = 'export const answer = 42;\n'.repeat(64);
const CSS_BODY = '.card { color: red; }\n'.repeat(64);
// Long enough that brotli actually wins: on a 4-byte input the compressed
// form is larger than the original, and "the body is smaller" stops holding.
const TINY_BODY = 'const tiny = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";\n'.repeat(8);

/**
 * Materialize a fixture that mirrors what adapter-node's precompress step
 * writes: the original asset plus a .br and a .gz sibling.
 */
function writeAsset(relPath, body, { brotli = true, gzip = true } = {}) {
  const file = path.join(root, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  if (brotli) fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(Buffer.from(body)));
  if (gzip) fs.writeFileSync(`${file}.gz`, zlib.gzipSync(Buffer.from(body)));
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'precomp-'));
  writeAsset('/_app/immutable/entry/app.js', JS_BODY);
  writeAsset('/_app/immutable/assets/app.css', CSS_BODY);
  // Only gzip available: a client that accepts only br must not be served it.
  writeAsset('/only-gzip.js', JS_BODY, { brotli: false });
  // A sibling that is genuinely smaller than its original, so the response can
  // only be correct if the variant file is what actually got streamed.
  writeAsset('/_app/immutable/entry/tiny.js', TINY_BODY, { brotli: true, gzip: true });

  const index = buildPrecompressedIndex(root);

  app = express();
  app.use(precompressedAssets(index));
  app.use(express.static(root, { index: false }));
  // Anything express.static did not resolve must reach this fallback, so a
  // mis-rewritten URL shows up as a distinct 404 instead of a silent success.
  app.use((req, res) => {
    res.status(404).type('text/plain').send(`UNRESOLVED:${req.url}`);
  });

  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (server) {
    server.close();
    await once(server, 'close');
  }
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * Issue a request over raw node:http and return the bytes exactly as they
 * arrive on the wire.
 *
 * Deliberately not fetch(): undici transparently decompresses br/gzip bodies
 * and hides Content-Encoding, so the one thing this suite exists to assert —
 * that the advertised encoding matches the body actually sent — becomes
 * impossible to observe. The original defect shipped a header that lied about
 * its own body; a transparent client would have reported success.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string> }} [options]
 */
function request(url, { method = 'GET', headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      `${baseUrl}${url}`,
      { method, headers },
      (res) => {
        /** @type {Buffer[]} */
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: /** @type {Record<string, string>} */ (res.headers),
            body: Buffer.concat(chunks),
          }),
        );
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/**
 * @param {string} url
 * @param {Record<string, string>} [headers]
 */
async function get(url, headers = {}) {
  const { status, headers: responseHeaders, body } = await request(url, { headers });
  return {
    response: {
      status,
      headers: { get: (name) => responseHeaders[name.toLowerCase()] ?? null },
    },
    body,
  };
}

/**
 * Assert the body really is encoded with `encoding`, and that decoding it
 * yields exactly the fixture bytes. A Content-Encoding header alone proves
 * nothing — the original defect sent a header that lied about its own body.
 * @param {Buffer} body
 * @param {'br' | 'gzip'} encoding
 * @param {string} expected
 */
function assertDecodesTo(body, encoding, expected) {
  const decoded =
    encoding === 'br'
      ? zlib.brotliDecompressSync(body)
      : zlib.gunzipSync(body);
  expect(decoded.toString()).toBe(expected);
  expect(body.length).toBeLessThan(expected.length);
}

describe('buildPrecompressedIndex', () => {
  it('indexes a variant file under its uncompressed request path', () => {
    const index = buildPrecompressedIndex(root);
    expect(index.get('/_app/immutable/entry/app.js')).toEqual({ br: '.br', gzip: '.gz' });
    expect(index.get('/_app/immutable/assets/app.css')).toEqual({ br: '.br', gzip: '.gz' });
  });

  it('indexes gzip-only assets as well', () => {
    const index = buildPrecompressedIndex(root);
    expect(index.get('/only-gzip.js')).toEqual({ gzip: '.gz' });
  });

  it('does not index assets that have no variant', () => {
    const index = buildPrecompressedIndex(root);
    expect(index.has('/no-variant.js')).toBe(false);
  });

  it('returns an empty index for a missing directory instead of throwing', () => {
    expect(buildPrecompressedIndex(path.join(root, 'does-not-exist')).size).toBe(0);
  });
});

describe('selectVariant', () => {
  // Built per test, not once at collection time: a describe body runs before
  // beforeAll, so the fixture directory would not exist yet.
  const index = () => buildPrecompressedIndex(root);

  /** @param {Record<string, string>} headers */
  const req = (headers) => /** @type {any} */ ({ headers, method: 'GET' });

  it('prefers brotli when the client accepts it', () => {
    expect(selectVariant('/_app/immutable/entry/app.js', index(), req({ 'accept-encoding': 'gzip, deflate, br' })))
      .toEqual({ suffix: '.br', encoding: 'br' });
  });

  it('falls back to gzip when brotli is absent from the header', () => {
    expect(selectVariant('/_app/immutable/entry/app.js', index(), req({ 'accept-encoding': 'gzip, deflate' })))
      .toEqual({ suffix: '.gz', encoding: 'gzip' });
  });

  // The regression that shipped in #3799: acceptEncoding.includes('br')
  // matches "br;q=0", so a client explicitly refusing brotli received it.
  it('refuses brotli when the client sets q=0', () => {
    const result = selectVariant('/_app/immutable/entry/app.js', index(), req({ 'accept-encoding': 'br;q=0, gzip;q=0' }));
    expect(result).toBeNull();
  });

  it('returns null when the client sends no Accept-Encoding', () => {
    expect(selectVariant('/_app/immutable/entry/app.js', index(), req({}))).toBeNull();
  });

  it('returns null for a path that is not in the index', () => {
    expect(selectVariant('/nope.js', index(), req({ 'accept-encoding': 'br' }))).toBeNull();
  });

  it('honours the wildcard encoding', () => {
    expect(selectVariant('/_app/immutable/entry/app.js', index(), req({ 'accept-encoding': '*' })))
      .not.toBeNull();
  });
});

describe('contentTypeFor', () => {
  it('reports the type of the uncompressed asset, not of .br', () => {
    // mime-types has no .br mapping and would fall back to octet-stream, which
    // X-Content-Type-Options: nosniff then refuses to render.
    expect(contentTypeFor('/_app/immutable/entry/app.js')).toBe('text/javascript; charset=utf-8');
    expect(contentTypeFor('/_app/immutable/assets/app.css')).toBe('text/css; charset=utf-8');
  });

  it('covers the asset types adapter-node precompresses', () => {
    expect(contentTypeFor('/a.wasm')).toBe('application/wasm');
    expect(contentTypeFor('/a.woff2')).toBe('font/woff2');
    expect(contentTypeFor('/a.svg')).toBe('image/svg+xml');
  });
});

describe('precompressedAssets middleware', () => {
  it('serves the brotli variant to a brotli-capable client', async () => {
    const { response, body } = await get('/_app/immutable/entry/app.js', {
      'accept-encoding': 'br, gzip',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBe('br');
    expect(response.headers.get('vary')).toBe('Accept-Encoding');
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    assertDecodesTo(body, 'br', JS_BODY);
  });

  it('serves the gzip variant to a gzip-only client', async () => {
    const { response, body } = await get('/_app/immutable/entry/app.js', {
      'accept-encoding': 'gzip',
    });
    expect(response.headers.get('content-encoding')).toBe('gzip');
    assertDecodesTo(body, 'gzip', JS_BODY);
  });

  // The original blocker: req.url was rewritten by appending the suffix, which
  // turned "/app.js?v=hash" into "/app.js?v=hash.br". express.static found no
  // such file, the response fell through to the SvelteKit handler, and the
  // client received an uncompressed body under a Content-Encoding: br header.
  it('preserves the query string so cache-busted requests still resolve', async () => {
    const { response, body } = await get('/_app/immutable/entry/app.js?v=deadbeef', {
      'accept-encoding': 'br',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-encoding')).toBe('br');
    expect(body.toString()).not.toContain('UNRESOLVED');
    assertDecodesTo(body, 'br', JS_BODY);
  });

  it('preserves multiple query parameters', async () => {
    const { response, body } = await get('/_app/immutable/entry/app.js?a=1&b=2', {
      'accept-encoding': 'br',
    });
    expect(response.status).toBe(200);
    assertDecodesTo(body, 'br', JS_BODY);
  });

  it('leaves the response untouched when the client refuses every encoding', async () => {
    const { response, body } = await get('/_app/immutable/entry/app.js', {
      'accept-encoding': 'br;q=0, gzip;q=0',
    });
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(body.toString()).toBe(JS_BODY);
  });

  it('does not advertise brotli on an asset that only has a gzip variant', async () => {
    const { response, body } = await get('/only-gzip.js', { 'accept-encoding': 'br' });
    expect(response.headers.get('content-encoding')).toBeNull();
    expect(body.toString()).toBe(JS_BODY);
  });

  it('serves the gzip variant for an asset without a brotli sibling', async () => {
    const { response, body } = await get('/only-gzip.js', { 'accept-encoding': 'gzip' });
    expect(response.headers.get('content-encoding')).toBe('gzip');
    assertDecodesTo(body, 'gzip', JS_BODY);
  });

  it('ignores requests for non-GET/HEAD methods', async () => {
    const { headers } = await request('/_app/immutable/entry/app.js', {
      method: 'POST',
      headers: { 'accept-encoding': 'br' },
    });
    expect(headers['content-encoding']).toBeUndefined();
  });

  it('answers HEAD with the variant headers and no body', async () => {
    const { status, headers, body } = await request('/_app/immutable/entry/app.js', {
      method: 'HEAD',
      headers: { 'accept-encoding': 'br' },
    });
    expect(status).toBe(200);
    expect(headers['content-encoding']).toBe('br');
    expect(body.byteLength).toBe(0);
  });

  it('reports Content-Length of the variant, not of the original', async () => {
    const { headers, body } = await request('/_app/immutable/entry/tiny.js', {
      headers: { 'accept-encoding': 'br' },
    });
    expect(Number(headers['content-length'])).toBe(body.length);
    expect(body.length).toBeLessThan(TINY_BODY.length);
  });

  it('does not let a path-traversal attempt resolve outside the root', async () => {
    const { response } = await get('/../../../../etc/passwd', { 'accept-encoding': 'br' });
    expect(response.status).toBe(404);
  });
});