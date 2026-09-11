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
 *
 * Account fetch deduplication — BUG-0423.
 *
 * `PositionsSidebar` mounts twice (desktop + mobile; the CSS-hidden one is
 * still mounted and still fetches), and each instance reads on mount *and*
 * on a credentials change. The ordering half of this is solved by
 * `accountReadOrder` (a stale response can no longer corrupt the store);
 * this is the remaining traffic half: identical requests going out twice.
 *
 * The fix is single-flight per trigger: concurrent reads issued for the
 * same reason share one network round trip. The first caller (the owner)
 * runs the fetch; joiners await the same promise and write nothing — the
 * ordering ticket stays solely with the owner, so BUG-0412's sequencing
 * between *different* triggers is untouched.
 *
 * Keyed by trigger, not just by account: mount, keys-change and sync reads
 * may legitimately carry different credentials or session moments, so only
 * the same trigger coalesces. The session sequence is folded in, so a read
 * issued after an account switch never joins a flight from the account
 * being left.
 */

import { accountEpoch } from "./accountEpoch.svelte";

/** Where an account read was triggered — the coalescing key's trigger half. */
export type AccountFetchTrigger = "mount" | "keys" | "sync";

const inflight = new Map<string, Promise<void>>();

export function accountFetchKey(
  trigger: AccountFetchTrigger,
  provider: string,
  accountId: string,
): string {
  return `${accountEpoch.seq}:${provider}:${accountId}:${trigger}`;
}

/**
 * Run `fn` unless an identical read is already in flight, in which case
 * await that one instead of issuing a second request.
 *
 * Only the owner executes `fn` (and takes the `accountReadOrder` ticket
 * inside it); joiners return after the shared promise settles without
 * writing anything themselves.
 */
export async function runAccountFetchOnce(key: string, fn: () => Promise<void>): Promise<void> {
  const existing = inflight.get(key);
  if (existing) {
    await existing;
    return;
  }
  const flight = (async () => {
    try {
      await fn();
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, flight);
  await flight;
}

/** Test-only: drop all joined state between tests. */
export function resetAccountFetchSingleflightForTest(): void {
  inflight.clear();
}
