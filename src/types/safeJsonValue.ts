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
 * Implemented as `z.custom` over the raw input rather than a recursive
 * `z.record`: zod's record parser rebuilds the object and loses an own
 * `__proto__` property before a refinement could see it, which is exactly the
 * key this guard exists for.
 */
export const FORBIDDEN_JSON_KEYS = ["__proto__", "constructor", "prototype"] as const;

const FORBIDDEN = new Set<string>(FORBIDDEN_JSON_KEYS);

/**
 * `true` for a JSON-representable value with no forbidden key at any depth.
 *
 * Only JSON values are accepted: strings, finite numbers, booleans, null,
 * arrays and plain objects. `undefined`, functions and symbols cannot arrive
 * through `JSON.parse`, and accepting them would widen the boundary the
 * schemas are meant to keep.
 */
export function isSafeJsonValue(value: unknown): boolean {
  if (value === null) return true;
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      break;
    default:
      return false;
  }

  if (Array.isArray(value)) {
    return value.every(isSafeJsonValue);
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (FORBIDDEN.has(key)) return false;
    if (!isSafeJsonValue((value as Record<string, unknown>)[key])) return false;
  }
  return true;
}

export const SafeJsonValueSchema = z.custom<unknown>(
  (value) => isSafeJsonValue(value),
  { message: "invalid or prototype-pollution-shaped JSON value" },
);
