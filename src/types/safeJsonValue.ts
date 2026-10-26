/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { z } from "zod";

/**
 * JSON value schema that refuses prototype-pollution-shaped keys (BUG-0725).
 *
 * `JSON.parse` creates `__proto__` as an own property rather than walking the
 * prototype setter, so parsing alone does not pollute anything. The danger is
 * the next step: a spread, a recursive merge or a store assignment can move
 * that property onto a shared object. Rejecting the keys at the transport
 * boundary means no downstream consumer has to remember the rule.
 *
 * `constructor` and `prototype` are rejected for the same reason: the classic
 * payload is a `constructor.prototype` chain rather than a bare `__proto__`.
 *
 * The walk is iterative with an explicit depth cap. A recursive version threw
 * `RangeError` on ~5 000 nested arrays — a 20 KB frame, far below the frame
 * cap — which would make the guard itself the cheapest exception generator.
 *
 * Only plain JSON objects are accepted. `Date`, `Map`, `Blob` and class
 * instances have no enumerable own keys and would otherwise validate as `{}`;
 * a WebSocket payload is parsed JSON, so none of them is legitimate.
 */
export const FORBIDDEN_JSON_KEYS = ["__proto__", "constructor", "prototype"] as const;

const FORBIDDEN = new Set<string>(FORBIDDEN_JSON_KEYS);

/** Nesting beyond this is refused rather than walked (JSON.parse allows more). */
export const MAX_JSON_DEPTH = 64;

export function isSafeJsonValue(value: unknown): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const item = current.value;

    if (item === null) continue;

    switch (typeof item) {
      case "string":
      case "boolean":
        continue;
      case "number":
        if (!Number.isFinite(item)) return false;
        continue;
      case "object":
        break;
      default:
        return false;
    }

    if (current.depth >= MAX_JSON_DEPTH) return false;

    if (Array.isArray(item)) {
      for (const child of item) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
      continue;
    }

    const proto = Object.getPrototypeOf(item);
    if (proto !== Object.prototype && proto !== null) return false;

    for (const key of Object.keys(item as Record<string, unknown>)) {
      if (FORBIDDEN.has(key)) return false;
      stack.push({
        value: (item as Record<string, unknown>)[key],
        depth: current.depth + 1,
      });
    }
  }

  return true;
}

export const SafeJsonValueSchema = z.custom<unknown>(
  (value) => isSafeJsonValue(value),
  { message: "invalid or prototype-pollution-shaped JSON value" },
);
