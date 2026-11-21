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
 * FEAT-0817 — the production transport for an authoring request.
 *
 * Its own file so `requestRuleDraft.ts` stays free of `appFetch` and its
 * store graph, which is what lets the port's tests mock the model instead of
 * the network.
 *
 * Reuses the ADR-0019 send path (FEAT-0678's `streamCompletion`) rather than
 * building a second one: the retry policy, the fail-closed rule for a failed
 * direct connection, and the capped provider-error wording are all properties
 * a second transport would have to re-earn, and the one that matters most
 * here is the fail-closed rule — a direct request that quietly fell back to
 * the relay is exactly what ADR-0030 decision 2 forbids.
 */

import { streamCompletion } from "../completion";
import type { AuthoringTransport } from "./requestRuleDraft";

/**
 * Send one authoring request and return the whole reply.
 *
 * `tools` is deliberately absent. The chat path passes a tool schema so the
 * model can propose a trade action; an authoring request must not be able to
 * reach that surface, and the cheapest way to guarantee it is to hand over no
 * schema at all.
 *
 * No `onDelta` either: the answer is one JSON object that is useless until it
 * is complete, and streaming a half-parsed draft into the panel would show a
 * trader conditions that are not yet the ones they will be offered.
 */
export const authoringTransport: AuthoringTransport = async (
  target,
  messages,
  signal,
) => {
  const result = await streamCompletion(target, { messages, signal });
  return result.content;
};
