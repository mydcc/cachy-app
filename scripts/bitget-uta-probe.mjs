#!/usr/bin/env node
/**
 * Reproduces the live evidence recorded in `docs/bitget-api/14_uta_v3.md`.
 *
 * Reads credentials from an env file OUTSIDE the repository and never prints
 * them, the passphrase, or any signature. Everything it prints is already
 * public: HTTP status, Bitget business code, message, and response field names.
 *
 * Usage:
 *   BITGET_ENV=/path/to/bitget.env node scripts/bitget-uta-probe.mjs
 *
 * The env file needs three variables:
 *   BITGET_AKEY, BITGET_SECRET, BITGET_PASSPHRASE
 *
 * Every request below is read-only. There is no place-order call in this file:
 * the write path is BUG-0597's acceptance test, and it belongs in a test with
 * an account that can actually absorb a position.
 *
 * Findings this reproduces:
 *   1. 40085 — a UTA account is refused by every /api/v2/* path, before the
 *      signature is validated (a wrong secret gets the same 40085).
 *   2. WebSocket login answers {"event":"login","code":0} — a JSON number, so
 *      neither "0" nor "00000" as a string matches.
 *   3. Query ordering: insertion and sorted both succeed, control at 40009.
 *   4. /api/v3/trade/fills returns "list":null where unfilled-orders returns [].
 *   5. /api/v3/position/current-position answers HTTP 200 with an empty body
 *      when the account holds no position.
 */

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const ENV_PATH = process.env.BITGET_ENV ?? "/tmp/opencode/bitget.env";
const REST = "https://api.bitget.com";

let env;
try {
  env = Object.fromEntries(
    // codeql[js/path-injection] ENV_PATH comes from the operator's own shell (BITGET_ENV),
    // never from a request, a file on disk or any network input. This is a local script whose
    // whole purpose is to read a path the operator names; there is no untrusted source to guard.
    readFileSync(ENV_PATH, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("BITGET_"))
      .map((line) => {
        const eq = line.indexOf("=");
        return [line.slice(0, eq), line.slice(eq + 1)];
      }),
  );
} catch {
  console.error(`cannot read credentials from ${ENV_PATH}`);
  console.error("set BITGET_ENV to a file containing BITGET_AKEY, BITGET_SECRET, BITGET_PASSPHRASE");
  process.exit(1);
}
for (const key of ["BITGET_AKEY", "BITGET_SECRET", "BITGET_PASSPHRASE"]) {
  if (!env[key]) {
    console.error(`${key} missing from ${ENV_PATH}`);
    process.exit(1);
  }
}

function signHeaders(method, path, query, secret = env.BITGET_SECRET) {
  const timestamp = Date.now().toString();
  const prehash = query ? `${timestamp}${method}${path}?${query}` : `${timestamp}${method}${path}`;
  return {
    "ACCESS-KEY": env.BITGET_AKEY,
    "ACCESS-SIGN": createHmac("sha256", secret).update(prehash).digest("base64"),
    "ACCESS-TIMESTAMP": timestamp,
    "ACCESS-PASSPHRASE": env.BITGET_PASSPHRASE,
    "Content-Type": "application/json",
  };
}

async function get(label, path, pairs, { sort = false, secret } = {}) {
  const ordered = sort ? [...pairs].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : pairs;
  const query = ordered.map(([k, v]) => `${k}=${v}`).join("&");
  const res = await fetch(`${REST}${path}${query ? `?${query}` : ""}`, {
    headers: signHeaders("GET", path, query, secret),
  });
  const text = await res.text();
  let code = "(no json)";
  let message = "";
  let fields = "";
  try {
    const body = JSON.parse(text);
    code = body.code;
    message = body.msg ?? "";
    const list = body.data && Array.isArray(body.data.list) ? body.data.list : null;
    if (list) fields = Object.keys(list[0] ?? {}).join(" ");
    else if (body.data) fields = `data{${Object.keys(body.data).join(",")}}`;
  } catch {
    /* empty or non-JSON body — the point of finding 5 */
  }
  console.log(`${label.padEnd(34)} http=${res.status} code=${String(code).padEnd(7)} bytes=${text.length}`);
  if (message) console.log(`${" ".repeat(36)}${message.slice(0, 90)}`);
  if (fields) console.log(`${" ".repeat(36)}${fields.slice(0, 150)}`);
  return { code, message, text };
}

function wsLogin(host, timestamp) {
  const sign = createHmac("sha256", env.BITGET_SECRET)
    .update(`${timestamp}GET/user/verify`)
    .digest("base64");
  return JSON.stringify({
    op: "login",
    args: [{ apiKey: env.BITGET_AKEY, passphrase: env.BITGET_PASSPHRASE, timestamp: String(timestamp), sign }],
  });
}

async function wsProbe(host, label, timestamp) {
  return new Promise((resolve) => {
    let done = false;
    const settle = (verdict) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      console.log(`${label.padEnd(34)} ${verdict}`);
      resolve();
    };
    const socket = new WebSocket(host);
    const timer = setTimeout(() => settle("no answer within 12s"), 12000);
    socket.onopen = () => socket.send(wsLogin(host, timestamp));
    socket.onmessage = (event) => settle(`answered ${String(event.data).slice(0, 120)}`);
    socket.onerror = () => settle("socket error");
    socket.onclose = (event) => settle(`closed code=${event.code}`);
  });
}

const FUTURES = [["category", "USDT-FUTURES"]];
const CLASSIC = [
  ["productType", "USDT-FUTURES"],
  ["marginCoin", "USDT"],
];
const ORDERING_PATH = "/api/v3/trade/unfilled-orders";
const ORDERING_PAIRS = [
  ["category", "USDT-FUTURES"],
  ["symbol", "BTCUSDT"],
];

console.log("1. the 40085 gate — REST only, and it fires before the signature check");
await get("classic V2, valid secret", "/api/v2/mix/account/account", CLASSIC);
await get("classic V2, wrong secret", "/api/v2/mix/account/account", CLASSIC, { secret: "0".repeat(64) });

console.log("\n2. WebSocket login — the code is a number, and both timestamp units work");
await wsProbe("wss://ws.bitget.com/v3/ws/private", "v3 private, millis", Date.now());
await wsProbe("wss://ws.bitget.com/v3/ws/private", "v3 private, seconds", Math.floor(Date.now() / 1000));
await wsProbe("wss://ws.bitget.com/v2/ws/private", "v2 private, seconds", Math.floor(Date.now() / 1000));

console.log("\n3. query ordering on V3 — control first, so a 00000 means something");
await get("wrong secret (control)", ORDERING_PATH, ORDERING_PAIRS, { secret: "0".repeat(64) });
await get("insertion order", ORDERING_PATH, ORDERING_PAIRS, { sort: false });
await get("sorted order", ORDERING_PATH, ORDERING_PAIRS, { sort: true });

console.log("\n4. and 5. the UTA read endpoints, and how they answer when empty");
await get("trade/fills", "/api/v3/trade/fills", FUTURES);
await get("trade/unfilled-orders", "/api/v3/trade/unfilled-orders", FUTURES);
await get("position/current-position", "/api/v3/position/current-position", FUTURES);
await get("account/assets", "/api/v3/account/assets", FUTURES);