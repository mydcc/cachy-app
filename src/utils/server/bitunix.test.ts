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

import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { generateBitunixSignature } from "./bitunix";

/*
 * FEAT-0321 — characterisation of the Bitunix signers.
 *
 * CodeQL `js/insufficient-password-hash` fires on all sha256 operations
 * involving apiKey/apiSecret here. It is a false positive for the same
 * reasons as in src/utils/server/bitunix.ts:
 *
 *   - Nothing is stored. These are per-request signatures, not passwords
 *     at rest, so the threat the query models — an offline brute-force
 *     attack against a stolen hash database — has no target. The digest
 *     lives for the length of one HTTP request.
 *   - The algorithm is Bitunix's, not ours. `docs/bitunix-api/01_sign.md`
 *     specifies `digest = SHA256(nonce + timestamp + api-key + queryParams
 *     + body)` then `sign = SHA256(digest + secretKey)`, and the exchange
 *     verifies exactly that. bcrypt, scrypt, PBKDF2 or Argon2 here would
 *     make every signed request fail authentication.
 *
 * The construction is worth naming honestly: `H(digest || secret)` is a
 * secret-suffix MAC rather than HMAC, which is weaker in principle because
 * a collision in the underlying hash is a MAC forgery. Against SHA-256 that
 * is not a practical attack today, and it is not Cachy's to change.
 *
 * FEAT-0321 — characterisation of the five Bitunix signers.
 *
 * Until this item, the signing algorithm existed three times: as
 * `generateBitunixSignature` here, and hand-rolled inline in the balance and
 * positions paths of `src/utils/server/venues/bitunix.ts`. The two inline
 * copies are gone; the functions below are those copies, transcribed verbatim
 * except that the nonce and timestamp they used to generate internally are now
 * arguments, so all three can be driven with the same input.
 *
 * They stay here on purpose. They are the record of what bytes a live Bitunix
 * account accepted from the balance and positions paths before the merge, and
 * a change to `generateBitunixSignature` that would have broken either path now
 * fails here instead of failing as an authentication error against real money.
 */

/**
 * The balance path's signer, as it stood in `fetchBitunixBalance` before
 * FEAT-0321. Body was hard-coded empty (the request is a GET).
 */
function signAsBalancePathDid(
  apiKey: string,
  apiSecret: string,
  params: Record<string, string>,
  nonce: string,
  timestamp: string,
): { signature: string; queryString: string } {
  const queryParamsStr = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");

  const body = "";
  const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;
  // codeql[js/insufficient-password-hash]
  const digest = createHash("sha256").update(digestInput).digest("hex");

  const signInput = digest + apiSecret;
  // codeql[js/insufficient-password-hash]
  const signature = createHash("sha256").update(signInput).digest("hex");

  const queryString = new URLSearchParams(params).toString();

  return { signature, queryString };
}

/**
 * The positions path's signer, as it stood in `fetchBitunixPositions` before
 * FEAT-0321. Same shape as the balance copy; it was called with no params.
 */
function signAsPositionsPathDid(
  apiKey: string,
  apiSecret: string,
  params: Record<string, string>,
  nonce: string,
  timestamp: string,
): { signature: string; queryString: string } {
  const queryParamsStr = Object.keys(params)
    .sort()
    .map((key) => key + params[key])
    .join("");

  const body = "";
  const digestInput = nonce + timestamp + apiKey + queryParamsStr + body;
  // codeql[js/insufficient-password-hash]
  const digest = createHash("sha256").update(digestInput).digest("hex");

  const signInput = digest + apiSecret;
  // codeql[js/insufficient-password-hash]
  const signature = createHash("sha256").update(signInput).digest("hex");

  const queryString = new URLSearchParams(params).toString();

  return { signature, queryString };
}

const API_KEY = "bx_test_apikey_0123456789";
const API_SECRET = "bx_test_apisecret_9876543210";

describe("FEAT-0321: the three Bitunix signers agree", () => {
  it("produces one signature for the params the balance path sends", () => {
    // `fetchBitunixBalance` signs GET /api/v1/futures/account?marginCoin=USDT.
    const params = { marginCoin: "USDT" };

    const survivor = generateBitunixSignature(API_KEY, API_SECRET, params, "");
    const legacy = signAsBalancePathDid(
      API_KEY,
      API_SECRET,
      params,
      survivor.nonce,
      survivor.timestamp,
    );

    expect(survivor.signature).toBe(legacy.signature);
    // The URL the request goes to is unchanged as well.
    expect(survivor.queryString).toBe(legacy.queryString);
    expect(survivor.queryString).toBe("marginCoin=USDT");
    expect(survivor.bodyStr).toBe("");
  });

  it("produces one signature for the empty params the positions path sends", () => {
    // `fetchBitunixPositions` signs GET
    // /api/v1/futures/position/get_pending_positions with no query at all.
    const params = {};

    const survivor = generateBitunixSignature(API_KEY, API_SECRET, params, "");
    const legacy = signAsPositionsPathDid(
      API_KEY,
      API_SECRET,
      params,
      survivor.nonce,
      survivor.timestamp,
    );

    expect(survivor.signature).toBe(legacy.signature);
    expect(survivor.queryString).toBe(legacy.queryString);
    // Empty, so the positions path appends no "?" to the URL.
    expect(survivor.queryString).toBe("");
    expect(survivor.bodyStr).toBe("");
  });

  it("agrees with both copies across params neither path happened to send", () => {
    // The two call sites passed one param and none, which is exactly the range
    // in which a drift would have stayed invisible. Drive the wider case too.
    const params = {
      symbol: "BTCUSDT",
      limit: "50",
      marginCoin: "USDT",
      startTime: "1700000000000",
    };

    const survivor = generateBitunixSignature(API_KEY, API_SECRET, params, "");
    const asBalance = signAsBalancePathDid(
      API_KEY,
      API_SECRET,
      params,
      survivor.nonce,
      survivor.timestamp,
    );
    const asPositions = signAsPositionsPathDid(
      API_KEY,
      API_SECRET,
      params,
      survivor.nonce,
      survivor.timestamp,
    );

    expect(survivor.signature).toBe(asBalance.signature);
    expect(survivor.signature).toBe(asPositions.signature);
  });

  /*
   * The one place the three were not identical. Both inline copies built the
   * URL's query string with `new URLSearchParams(params)`, which preserves
   * insertion order; `generateBitunixSignature` sorts the entries first. That
   * never showed up on the wire, because the balance path passed a single
   * param and the positions path passed none — and it never could have changed
   * a signature either, since the digest is built from a separately sorted
   * `key + value` concatenation, not from this string. It is recorded rather
   * than fixed: sorted is the surviving behaviour.
   */
  it("differs from the copies only in URL param order, never in the signature", () => {
    const params = { symbol: "BTCUSDT", limit: "50" };

    const survivor = generateBitunixSignature(API_KEY, API_SECRET, params, "");
    const legacy = signAsBalancePathDid(
      API_KEY,
      API_SECRET,
      params,
      survivor.nonce,
      survivor.timestamp,
    );

    expect(survivor.signature).toBe(legacy.signature);
    expect(survivor.queryString).toBe("limit=50&symbol=BTCUSDT");
    expect(legacy.queryString).toBe("symbol=BTCUSDT&limit=50");
  });

  it("draws a fresh nonce and timestamp per call, as all three did", () => {
    const first = generateBitunixSignature(API_KEY, API_SECRET, {}, "");
    const second = generateBitunixSignature(API_KEY, API_SECRET, {}, "");

    // 16 random bytes, hex-encoded — the length both inline copies produced.
    expect(first.nonce).toMatch(/^[0-9a-f]{32}$/);
    expect(second.nonce).not.toBe(first.nonce);
    expect(Number(first.timestamp)).toBeGreaterThan(0);
    expect(first.signature).not.toBe(second.signature);
  });

  it("matches a fixed vector computed straight from the documented algorithm", () => {
    // docs/bitunix-api/01_sign.md:
    //   digest = SHA256(nonce + timestamp + api-key + queryParams + body)
    //   sign   = SHA256(digest + secretKey)
    const nonce = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const timestamp = "1724673600000";

    // codeql[js/insufficient-password-hash]
    const digest = createHash("sha256")
      .update(`${nonce}${timestamp}${API_KEY}marginCoinUSDT`)
      .digest("hex");
    // codeql[js/insufficient-password-hash]
    const expected = createHash("sha256")
      .update(digest + API_SECRET)
      .digest("hex");

    const actual = signAsBalancePathDid(
      API_KEY,
      API_SECRET,
      { marginCoin: "USDT" },
      nonce,
      timestamp,
    );

    expect(actual.signature).toBe(expected);
  });
});
