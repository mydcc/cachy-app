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

/**
 * FEAT-0253 — learn the account's real fee rates from what the broker actually
 * charged it.
 *
 * `/api/sync` proxies Bitunix's `get_history_trades`, whose records carry the
 * `fee` charged and the `roleType` it was charged as. That endpoint already
 * existed but had no caller; this is it. Nothing here is a new integration —
 * it is a computation over data the account can already reach.
 *
 * Local-First: the API keys travel as the credential of a user-initiated
 * exchange request through the app's own proxy, which is the documented
 * Class A exception. The fills themselves are never stored — only the two
 * derived rates, and only in transient store fields.
 */

import { settingsState } from "../stores/settings.svelte";
import { keysForActiveAccount } from "../stores/settings/accounts";
import { tradeState } from "../stores/trade.svelte";
import { appFetch } from "../lib/appAuth";
import {
  deriveFeeRatesFromFills,
  type DerivedFeeRates,
  type RawFill,
} from "../lib/fees/deriveFeeRates";

/**
 * How many recent fills to read. Enough for the median to mean something
 * across a mixed set of maker and taker fills without asking the venue for a
 * history the user is not looking at; the endpoint caps at 100 anyway.
 */
const FILL_SAMPLE_LIMIT = 100;

/**
 * The only venue whose fills this derives from today. Recorded on the store
 * alongside the rates so the UI can tell whether they describe the exchange
 * currently selected — see `remoteFeeExchange`.
 */
const DERIVED_FROM_EXCHANGE = "bitunix";

/**
 * How long to wait for the fills. The journal sync holds its lock across this
 * call, so an unbounded request on a bad connection would leave the whole sync
 * — not just the fee rates — stuck behind it.
 */
const FILL_REQUEST_TIMEOUT_MS = 10_000;

/** Wipe the derived rates so nothing stale can be labelled "from broker". */
function clearDerivedRates(): void {
  tradeState.remoteMakerFee = undefined;
  tradeState.remoteTakerFee = undefined;
  tradeState.remoteFeeSamples = {};
  tradeState.remoteFeeExchange = undefined;
}

function applyDerivedRates(rates: DerivedFeeRates): void {
  // Assigned individually rather than wholesale: a role with no fills must
  // stay `undefined`, never fall back to zero (FEAT-0253 hazard 1).
  tradeState.remoteMakerFee = rates.maker?.rate;
  tradeState.remoteTakerFee = rates.taker?.rate;
  tradeState.remoteFeeSamples = {
    maker: rates.maker?.sampleCount,
    taker: rates.taker?.sampleCount,
  };
  tradeState.remoteFeeExchange = DERIVED_FROM_EXCHANGE;
}

/**
 * Re-derive `remoteMakerFee` / `remoteTakerFee` from the account's own fills.
 *
 * Returns the derived rates, or `null` when no rate could be established —
 * no keys, an unreachable venue, or an account with no usable fills yet. A
 * `null` is not an error the user needs to see: it simply means the displayed
 * rate keeps its "assumed" or "manual" provenance instead of gaining "from
 * broker". Failing loudly here would turn a fresh account into an error state.
 */
export async function refreshDerivedFeeRates(): Promise<DerivedFeeRates | null> {
  /*
   * The *active* account, not merely one on this venue (FEAT-0026).
   *
   * `syncService` fetches the journal for the active account, so deriving from
   * any other one would learn a second account's rates and present them as
   * this account's — a rate its broker never charged it, wearing a "from
   * broker" badge. Since two accounts on the same venue can sit at different
   * VIP tiers, that is not a hypothetical difference.
   */
  const keys = keysForActiveAccount(
    settingsState.accounts,
    settingsState.activeAccountId,
    DERIVED_FROM_EXCHANGE,
  );
  if (!keys.key || !keys.secret) {
    clearDerivedRates();
    return null;
  }

  try {
    const response = await appFetch("/api/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": keys.key,
        "X-Api-Secret": keys.secret,
      },
      body: JSON.stringify({ limit: FILL_SAMPLE_LIMIT }),
      signal: AbortSignal.timeout(FILL_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const payload = await response.json();
    if (payload?.error || !Array.isArray(payload?.data)) return null;

    const rates = deriveFeeRatesFromFills(payload.data as RawFill[]);
    if (!rates.maker && !rates.taker) {
      // Fills arrived but none were usable — that is still "no broker rate",
      // so a previous derivation must not survive as if it were current.
      clearDerivedRates();
      return null;
    }

    applyDerivedRates(rates);
    return rates;
  } catch {
    // A network failure leaves whatever was last derived in place: it was true
    // when it was read, and replacing it with nothing would downgrade a real
    // rate to an assumption over a dropped connection.
    return null;
  }
}
