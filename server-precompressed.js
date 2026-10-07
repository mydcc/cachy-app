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
import fs from 'node:fs';
import path from 'node:path';
import Negotiator from 'negotiator';
import mime from 'mime-types';

/**
 * Suffixes SvelteKit's adapter-node writes next to every precompressed asset
 * (`precompress: true` in adapter-node/index.js). Kept as data so the index
 * builder and the request-time lookup cannot drift apart.
 * @type {readonly ['br', 'gzip'][]}
 */
const VARIANTS = /** @type {const} */ ([
  ['br', '.br'],
  ['gzip', '.gz'],
]);

/**
 * Map of request path -> the variants that exist on disk for it, e.g.
 * "/_app/immutable/entry/start.abc.js" -> { br: ".br", gzip: ".gz" }. Both
 * encodings are recorded because which one is usable depends on the client:
 * an index holding only the first-seen variant would make a brotli-only
 * client get a Content-Encoding: br header pointing at a .br file that was
 * never written.
 * @typedef {Map<string, Record<string, string>>} PrecompressedIndex
 */

/**
 * Recursively collect precompressed variants under `dir`.
 *
 * Indexing once at startup keeps the per-request cost to a single Map lookup
 * and avoids fs.existsSync() on every request. Keys are absolute-free,
 * root-relative, always slash-separated paths beginning with "/" so they can
 * be compared against req.path directly.
 *
 * Symlinked directories are not followed: Dirent.isDirectory() is false for
 * symlinks, so a link cycle cannot trap the walk. Recursion depth is bounded
 * by the build output's own nesting, which adapter-node controls.
 * @param {string} dir absolute path to scan
 * @param {string} [prefix] root-relative path prefix, used by the recursion
 * @param {PrecompressedIndex} [into] accumulator, for the recursive calls
 * @returns {PrecompressedIndex}
 */
export function buildPrecompressedIndex(dir, prefix = '', into = new Map()) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    // A missing or unreadable directory yields an empty index. Callers report
    // the degraded state at startup; serving uncompressed stays correct.
    return into;
  }
  for (const entry of entries) {
    const childPrefix = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      buildPrecompressedIndex(path.join(dir, entry.name), childPrefix, into);
      continue;
    }
    if (!entry.isFile()) continue;
    const variant = VARIANTS.find(([, suffix]) => entry.name.endsWith(suffix));
    if (!variant) continue;
    const [encoding, suffix] = variant;
    // "/x/y.js.br" is indexed under the original "/x/y.js", so the request-time
    // lookup never has to strip a suffix itself.
    const original = childPrefix.slice(0, -suffix.length);
    const variants = into.get(original) ?? {};
    variants[encoding] = suffix;
    into.set(original, variants);
  }
  return into;
}

/**
 * Decide which precompressed variant to serve for a request, if any.
 *
 * Uses negotiator so the full Accept-Encoding grammar is honoured: q-values,
 * `*`, and crucially q=0, which means "explicitly not acceptable". A substring
 * test like `acceptEncoding.includes("br")` matches "br;q=0" and would send a
 * body the client just refused to accept.
 *
 * The second argument to `encoding()` is an *options object* since
 * negotiator 1.0, not a plain preference array. Passing the array still
 * "works" — an Array has no `.preferred`, so the preference silently becomes
 * undefined — but then q-value ties are resolved by spec specificity instead
 * of by our own variant order, and Chrome's `gzip, deflate, br` would get gzip.
 * Hence `{ preferred: variants }`.
 *
 * The preference is `Object.keys(available)`, i.e. the order the variants were
 * first seen in `buildPrecompressedIndex`, which is `readdir` order and
 * therefore not guaranteed. On ext4 that yields `.br` before `.gz`, so brotli
 * wins ties; that is the behaviour this has always had, and the upgrade keeps
 * it rather than introducing a new one. Making it explicit from VARIANTS would
 * be a separate change, not part of a dependency bump.
 * @param {string} indexKey request path, e.g. "/_app/immutable/x.js"
 * @param {PrecompressedIndex} index
 * @param {import('negotiator').IncomingMessageWithHeaders} req
 * @returns {{ suffix: string, encoding: string } | null}
 */
export function selectVariant(indexKey, index, req) {
  const available = index.get(indexKey);
  if (available === undefined) return null;

  const variants = Object.keys(available);
  const chosen = new Negotiator(req).encoding(variants, { preferred: variants });
  if (chosen === false || !Object.hasOwn(available, chosen)) return null;

  return { suffix: available[chosen], encoding: chosen };
}

/**
 * Resolve the Content-Type for a precompressed asset from its uncompressed
 * name, so the client sees the real type rather than one derived from ".br"
 * (mime-types has no mapping for .br and would fall back to octet-stream,
 * which nosniff then refuses to render).
 * @param {string} indexKey original, uncompressed request path
 * @returns {string | null}
 */
export function contentTypeFor(indexKey) {
  return mime.contentType(path.extname(indexKey)) || null;
}

/**
 * Express middleware that routes requests for a precompressed asset to the
 * on-disk variant file, leaving req.url's query string intact.
 *
 * Why this is not express.static({ compress: true }): the `send` version in
 * this tree (1.2.1) has no `compress` option at all, so the documented
 * one-liner silently serves nothing compressed. Verified against this tree.
 * @param {PrecompressedIndex} index
 * @returns {import('express').RequestHandler}
 */
export function precompressedAssets(index) {
  return function precompressedAssetsMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();

    // req.path excludes the query string; req.url includes it. Rewriting
    // req.url by appending the suffix would turn "/x.js?v=1" into
    // "/x.js?v=1.br" — a file that does not exist, so express.static falls
    // through to the SvelteKit handler, while the Content-Encoding: br set
    // below still describes the response. The client then tries to brotli-
    // decode an uncompressed body and drops the asset. Rewrite the path and
    // re-attach the original query string instead.
    const queryIndex = req.url.indexOf('?');
    const search = queryIndex === -1 ? '' : req.url.slice(queryIndex);

    const variant = selectVariant(req.path, index, req);
    if (!variant) return next();

    const contentType = contentTypeFor(req.path);
    res.setHeader('Content-Encoding', variant.encoding);
    res.setHeader('Vary', 'Accept-Encoding');
    if (contentType) res.setHeader('Content-Type', contentType);

    req.url = `${req.path}${variant.suffix}${search}`;
    next();
  };
}