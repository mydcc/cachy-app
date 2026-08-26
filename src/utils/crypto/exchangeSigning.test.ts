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
import {
  signBitunixRequest,
  signBitgetRequest,
  validateBitunixKeys,
  validateBitgetKeys,
} from "./exchangeSigning";
import { generateBitunixSignature } from "../server/bitunix";
import { generateBitgetSignature } from "../server/bitget";

describe("FEAT-0285: WebCrypto Client-Side Exchange Signing Conformance", () => {
  const FIXED_TIMESTAMP = "1724673600000";
  const FIXED_NONCE = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

  describe("Bitunix Signing Parity", () => {
    const apiKey = "bk_test_apikey_12345";
    const apiSecret = "bs_test_apisecret_67890abcdef";

    it("byte-matches server-signed vector on empty GET query", async () => {
      const serverVector = generateBitunixSignature(
        apiKey,
        apiSecret,
        {},
        "",
      );
      // Force server timestamp & nonce to match
      const clientResult = await signBitunixRequest(
        apiKey,
        apiSecret,
        {},
        "",
        { nonce: serverVector.nonce, timestamp: serverVector.timestamp },
      );

      expect(clientResult.signature).toBe(serverVector.signature);
      expect(clientResult.nonce).toBe(serverVector.nonce);
      expect(clientResult.timestamp).toBe(serverVector.timestamp);
      expect(clientResult.queryString).toBe(serverVector.queryString);
      expect(clientResult.bodyStr).toBe(serverVector.bodyStr);
    });

    it("byte-matches server-signed vector with multi-param query (sorting conformance)", async () => {
      const params = {
        symbol: "BTCUSDT",
        limit: "50",
        startTime: "1700000000000",
        endTime: "1700086400000",
        category: "linear",
      };

      const serverVector = generateBitunixSignature(
        apiKey,
        apiSecret,
        params,
        null,
      );

      const clientResult = await signBitunixRequest(
        apiKey,
        apiSecret,
        params,
        null,
        { nonce: serverVector.nonce, timestamp: serverVector.timestamp },
      );

      expect(clientResult.signature).toBe(serverVector.signature);
      expect(clientResult.queryString).toBe(serverVector.queryString);
      expect(clientResult.queryString).toBe(
        "category=linear&endTime=1700086400000&limit=50&startTime=1700000000000&symbol=BTCUSDT",
      );
    });

    it("byte-matches server-signed vector for POST JSON order payload", async () => {
      const payload = {
        symbol: "ETHUSDT",
        qty: "1.25",
        side: "BUY",
        orderType: "LIMIT",
        price: "2650.50",
        tradeType: 1,
      };

      const serverVector = generateBitunixSignature(
        apiKey,
        apiSecret,
        {},
        payload,
      );

      const clientResult = await signBitunixRequest(
        apiKey,
        apiSecret,
        {},
        payload,
        { nonce: serverVector.nonce, timestamp: serverVector.timestamp },
      );

      expect(clientResult.signature).toBe(serverVector.signature);
      expect(clientResult.bodyStr).toBe(serverVector.bodyStr);
      expect(clientResult.signature).toHaveLength(64);
    });

    it("matches fixed canonical vector for regression lock", async () => {
      const clientResult = await signBitunixRequest(
        "test_bitunix_key_001",
        "test_bitunix_secret_002",
        { symbol: "SOLUSDT", limit: "10" },
        { reduceOnly: false },
        { nonce: FIXED_NONCE, timestamp: FIXED_TIMESTAMP },
      );

      const serverVector = generateBitunixSignature(
        "test_bitunix_key_001",
        "test_bitunix_secret_002",
        { symbol: "SOLUSDT", limit: "10" },
        { reduceOnly: false },
      );
      // Calculate server with same nonce & timestamp
      const crypto = await import("crypto");
      const digestInput =
        FIXED_NONCE +
        FIXED_TIMESTAMP +
        "test_bitunix_key_001" +
        "limit10symbolSOLUSDT" +
        JSON.stringify({ reduceOnly: false });
      const digest = crypto.createHash("sha256").update(digestInput).digest("hex");
      const expectedSignature = crypto
        .createHash("sha256")
        .update(digest + "test_bitunix_secret_002")
        .digest("hex");

      expect(clientResult.signature).toBe(expectedSignature);
      expect(clientResult.nonce).toBe(FIXED_NONCE);
      expect(clientResult.timestamp).toBe(FIXED_TIMESTAMP);
    });
  });

  describe("Bitget Signing Parity", () => {
    const apiSecret = "bg_secret_key_abcdef987654321";

    it("byte-matches server-signed vector for GET request with query params", async () => {
      const path = "/api/mix/v1/position/allPosition";
      const params = { productType: "umcbl", marginCoin: "USDT" };

      const serverVector = generateBitgetSignature(
        apiSecret,
        "GET",
        path,
        params,
      );

      const clientResult = await signBitgetRequest(
        apiSecret,
        "GET",
        path,
        params,
        null,
        { timestamp: serverVector.timestamp },
      );

      expect(clientResult.signature).toBe(serverVector.signature);
      expect(clientResult.timestamp).toBe(serverVector.timestamp);
      expect(clientResult.queryString).toBe(serverVector.queryString);
      expect(clientResult.bodyStr).toBe("");
    });

    it("byte-matches server-signed vector for POST request with order payload", async () => {
      const path = "/api/mix/v1/order/placeOrder";
      const body = {
        symbol: "BTCUSDT_UMCBL",
        marginCoin: "USDT",
        size: "0.5",
        side: "open_long",
        orderType: "limit",
        price: "64000.0",
        timeInForceValue: "normal",
      };

      const serverVector = generateBitgetSignature(
        apiSecret,
        "POST",
        path,
        {},
        body,
      );

      const clientResult = await signBitgetRequest(
        apiSecret,
        "POST",
        path,
        {},
        body,
        { timestamp: serverVector.timestamp },
      );

      expect(clientResult.signature).toBe(serverVector.signature);
      expect(clientResult.bodyStr).toBe(serverVector.bodyStr);
      expect(clientResult.signature.length).toBeGreaterThan(20);
    });

    it("matches fixed canonical vector for regression lock", async () => {
      const path = "/api/v5/account/balance";
      const clientResult = await signBitgetRequest(
        "canonical_secret_123",
        "GET",
        path,
        {},
        null,
        { timestamp: FIXED_TIMESTAMP },
      );

      const crypto = await import("crypto");
      const preHash = FIXED_TIMESTAMP + "GET" + path;
      const expectedSignature = crypto
        .createHmac("sha256", "canonical_secret_123")
        .update(preHash)
        .digest("base64");

      expect(clientResult.signature).toBe(expectedSignature);
      expect(clientResult.timestamp).toBe(FIXED_TIMESTAMP);
    });
  });

  describe("Credential Validation Helpers", () => {
    it("validates Bitunix keys correctly", () => {
      expect(validateBitunixKeys("valid_api_key", "valid_api_secret")).toBeNull();
      expect(validateBitunixKeys("abc", "valid_api_secret")).toContain("Invalid API Key");
      expect(validateBitunixKeys("valid_api_key", "123")).toContain("Invalid API Secret");
      expect(validateBitunixKeys(null, "valid_api_secret")).toContain("Invalid API Key");
    });

    it("validates Bitget keys correctly", () => {
      expect(validateBitgetKeys("valid_key", "valid_secret", "pass123")).toBeNull();
      expect(validateBitgetKeys("abc", "valid_secret", "pass123")).toContain("Invalid API Key");
      expect(validateBitgetKeys("valid_key", "123", "pass123")).toContain("Invalid API Secret");
      expect(validateBitgetKeys("valid_key", "valid_secret", "")).toContain("Invalid Passphrase");
      expect(validateBitgetKeys("valid_key", "valid_secret", null)).toContain("Invalid Passphrase");
    });
  });
});
