// @vitest-environment happy-dom
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

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  cryptoService,
  DEVICE_KEY_OPEN_TIMEOUT_MS,
  INDEXEDDB_BLOCKED_ERROR_NAME,
} from "./cryptoService";

vi.mock("$app/environment", () => ({
  browser: true,
}));

/** The slice of IDBOpenDBRequest the secure-DB wrappers touch. */
interface StubOpenRequest {
  result?: IDBDatabase;
  error?: DOMException | null;
  onupgradeneeded?: (() => void) | null;
  onsuccess?: (() => void) | null;
  onerror?: (() => void) | null;
  onblocked?: (() => void) | null;
}

function stubOpen() {
  const open = vi.fn();
  vi.stubGlobal("indexedDB", { open });
  return open;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CryptoService — blocked IndexedDB open (BUG-0521)", () => {
  it(
    "rejects with a distinguishable error when the open stays blocked",
    { timeout: 10000 },
    async () => {
      vi.useFakeTimers();
      const open = stubOpen();
      let request: StubOpenRequest = {};
      open.mockImplementation(() => {
        request = {};
        // Fires only `onblocked`, as a concurrent factory-reset
        // deleteDatabase() does — never `onsuccess` nor `onerror`.
        setTimeout(() => request.onblocked?.(), 0);
        return request;
      });

      const pending = cryptoService.getOrGenerateDeviceKey(undefined, false);
      const settled = pending.then(
        () => true,
        () => true,
      );
      void settled;

      await vi.advanceTimersByTimeAsync(0);
      expect(typeof request.onblocked).toBe("function");

      let done = false;
      void pending.then(
        () => {
          done = true;
        },
        () => {
          done = true;
        },
      );
      await vi.advanceTimersByTimeAsync(DEVICE_KEY_OPEN_TIMEOUT_MS - 1);
      expect(done).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).rejects.toMatchObject({
        name: INDEXEDDB_BLOCKED_ERROR_NAME,
      });
    },
  );

  it("rejects when the request fires no event at all (general backstop)", async () => {
    vi.useFakeTimers();
    const open = stubOpen();
    open.mockImplementation(() => ({}) satisfies Partial<StubOpenRequest>);

    const pending = cryptoService.getOrGenerateDeviceKey(undefined, false);
    const assertion = expect(pending).rejects.toMatchObject({
      name: INDEXEDDB_BLOCKED_ERROR_NAME,
    });
    await vi.advanceTimersByTimeAsync(DEVICE_KEY_OPEN_TIMEOUT_MS);
    await assertion;
  });

  it(
    "resolves the normal path without waiting for the timeout",
    { timeout: 3000 },
    async () => {
      const open = stubOpen();
      const transactions: {
        oncomplete?: (() => void) | null;
        onabort?: (() => void) | null;
        onerror?: (() => void) | null;
      }[] = [];
      const closes: unknown[] = [];
      interface StubTxRequest {
        result?: unknown;
        error?: unknown;
        onsuccess?: (() => void) | null;
        onerror?: (() => void) | null;
      }
      const fireLater = (request: StubTxRequest, value: unknown) => {
        setTimeout(() => {
          request.result = value;
          request.onsuccess?.();
        }, 0);
      };
      const fakeDb = {
        transaction: () => {
          const tx: {
            oncomplete?: (() => void) | null;
            onabort?: (() => void) | null;
            onerror?: (() => void) | null;
            objectStore: () => unknown;
          } = {
            objectStore: () => ({
              get: () => {
                const getReq: StubTxRequest = {};
                fireLater(getReq, null);
                return getReq;
              },
              put: () => {
                const putReq: StubTxRequest = {};
                fireLater(putReq, undefined);
                return putReq;
              },
            }),
          };
          transactions.push(tx);
          return tx;
        },
        close: () => {
          closes.push(true);
        },
      };
      open.mockImplementation(() => {
        const request: StubOpenRequest = {};
        setTimeout(() => {
          request.result = fakeDb as unknown as IDBDatabase;
          request.onsuccess?.();
        }, 0);
        return request;
      });

      const key = await cryptoService.getOrGenerateDeviceKey(undefined, false);
      expect(key).toBeDefined();
      expect(open).toHaveBeenCalledTimes(2);

      // BUG-0288 still holds: releasing the connection via the transaction
      // completion handlers reaches db.close().
      for (const tx of transactions) tx.oncomplete?.();
      expect(closes.length).toBeGreaterThan(0);
    },
  );
});
