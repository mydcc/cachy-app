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

// src/services/trackingService.ts

type ContextProvider = () => Record<
  string,
  string | number | boolean | null | undefined
>;

const contextProviders: ContextProvider[] = [];

/**
 * Registers a function that provides additional context (dimensions)
 * for every tracked event.
 * @param provider Function returning an object of key-value pairs
 */
export function addContextProvider(provider: ContextProvider) {
  contextProviders.push(provider);
}

/**
 * Internal helper to push data to Matomo Tag Manager
 */
function pushToDataLayer(data: Record<string, any>) {
  // Check if window exists (SSR guard) and if _mtm is available
  if (typeof window === "undefined" || !window._mtm) {
    // Matomo Tag Manager is not available, do nothing.
    // This can happen if it's blocked or not yet loaded.
    // Only log in dev mode to reduce noise
    if (import.meta.env.DEV) {
      console.warn("Matomo Tag Manager not available. Skipping event:", data);
    }
    return;
  }

  const eventData = { ...data };

  // Inject Context
  try {
    contextProviders.forEach((provider) => {
      const ctx = provider();
      Object.assign(eventData, ctx);
    });
  } catch (e) {
    console.warn("Error gathering tracking context", e);
  }

  window._mtm.push(eventData);
}

/**
 * Pushes a custom event to the Matomo Tag Manager data layer.
 * This can be used to track events that are not simple clicks,
 * such as successful calculations or API calls.
 *
 * Automatically includes context from registered providers.
 *
 * @param category The category of the event (e.g., 'Calculation').
 * @param action The action of the event (e.g., 'Success').
 * @param name An optional name for the event (e.g., 'With ATR').
 * @param value An optional numeric value for the event.
 */
export function trackCustomEvent(
  category: string,
  action: string,
  name?: string,
  value?: number,
) {
  const eventData: Record<string, any> = {
    event: "customEvent",
    "custom-event-category": category,
    "custom-event-action": action,
  };

  if (name) {
    eventData["custom-event-name"] = name;
  }

  if (value !== undefined) {
    eventData["custom-event-value"] = value;
  }

  pushToDataLayer(eventData);
}

/**
 * Tracks a UI interaction (click, change, etc.) robustly using a stable ID.
 * This maps to the standard 'customEvent' structure for compatibility but
 * adds specific interaction fields.
 *
 * @param id The stable data-track-id of the element
 * @param type The type of interaction (e.g., 'click', 'change')
 * @param context Additional context for this specific interaction
 */
export function trackInteraction(
  id: string,
  type: string = "click",
  context?: Record<string, any>,
) {
  const eventData: Record<string, any> = {
    event: "interaction",
    // Core Identity
    "interaction-id": id,
    "interaction-type": type,
    // Fallback/Compatibility with existing MTM variables
    "custom-event-category": "UI",
    "custom-event-action": type,
    "custom-event-name": id,
  };

  if (context) {
    // Add specific context prefixed to avoid collisions, or nested if MTM supports it.
    // Flatter is usually better for MTM.
    Object.assign(eventData, context);
    // Also store as a JSON string for debugging/complex variable parsing
    eventData["interaction-context"] = JSON.stringify(context);
  }

  pushToDataLayer(eventData);
}
