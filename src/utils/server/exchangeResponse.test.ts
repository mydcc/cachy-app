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
import { readExchangeJson } from "./exchangeResponse";

/**
 * Guards the reason this helper exists: exchange order IDs exceed the range
 * JavaScript numbers can represent exactly, and `response.json()` corrupts them
 * silently. A corrupted order ID means a later cancel or modify hits the wrong
 * order, so this is a money-path guarantee, not a formatting preference.
 */
describe("readExchangeJson", () => {
  const ORDER_ID = "1234567890123456789"; // 19 digits, as exchanges issue them

  const responseWith = (body: string) =>
    ({ text: async () => body }) as unknown as Response;

  it("demonstrates the bug this helper avoids", () => {
    // Establishes the premise rather than asserting our own code: plain
    // JSON.parse cannot round-trip a 19-digit integer.
    const parsed = JSON.parse(`{"orderId":${ORDER_ID}}`);
    expect(String(parsed.orderId)).not.toBe(ORDER_ID);
    expect(Number.MAX_SAFE_INTEGER).toBeLessThan(Number(ORDER_ID));
  });

  it("preserves a 19-digit order ID exactly, as a string", async () => {
    const result = await readExchangeJson(
      responseWith(`{"code":0,"data":{"orderId":${ORDER_ID}}}`),
    );

    expect(String(result.data.orderId)).toBe(ORDER_ID);
    expect(typeof result.data.orderId).toBe("string");
  });

  it("preserves long IDs nested in arrays, which is how order lists arrive", async () => {
    const second = "9876543210987654321";
    const result = await readExchangeJson(
      responseWith(
        `{"code":0,"data":[{"orderId":${ORDER_ID}},{"orderId":${second}}]}`,
      ),
    );

    expect(String(result.data[0].orderId)).toBe(ORDER_ID);
    expect(String(result.data[1].orderId)).toBe(second);
  });

  it("preserves high-precision prices", async () => {
    const price = "12345.123456789012345";
    const result = await readExchangeJson(
      responseWith(`{"data":{"price":${price}}}`),
    );

    expect(String(result.data.price)).toBe(price);
  });

  it("leaves short numbers as numbers, so existing arithmetic is unaffected", async () => {
    // Millisecond timestamps are 13 digits and status codes are tiny — both stay
    // below the 15-character threshold and keep their numeric type. This is what
    // makes the change safe for code that does arithmetic on them.
    const result = await readExchangeJson(
      responseWith(`{"code":0,"ts":1700000000000,"qty":1.5}`),
    );

    expect(result.code).toBe(0);
    expect(result.ts).toBe(1700000000000);
    expect(typeof result.ts).toBe("number");
    expect(result.qty).toBe(1.5);
  });

  it("propagates malformed JSON as an error rather than returning junk", async () => {
    await expect(readExchangeJson(responseWith("{not json"))).rejects.toThrow();
  });
});
