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

import { settingsState } from "../stores/settings.svelte";

type TrackingEventData = Record<
  string,
  string | number | boolean | null | undefined
>;

type ContextProvider = () => TrackingEventData;

const contextProviders: ContextProvider[] = [];

/**
 * First-party, self-hosted Matomo Tag Manager container (see
 * `src/lib/assets/content/privacy.en.md`). BUG-0286: the container is NOT
 * loaded unconditionally anymore — only `initTracking()` may inject it, and
 * only after the user opted in via Settings > System > Privacy. No cookie
 * banner is shown because nothing tracks before that explicit opt-in.
 */
const MATOMO_CONTAINER_URL = "https://s.cachy.app/js/container_h6eaMUR9.js";

let containerRequested = false;

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.includes("192.168.")
  );
}

/**
 * Whether behavioural telemetry may leave the device right now. Read live on
 * every push so an opt-out takes effect immediately, even if the container
 * was already loaded earlier in the session.
 */
export function isTelemetryEnabled(): boolean {
  return (
    typeof window !== "undefined" &&
    !isLocalHostname(window.location.hostname) &&
    settingsState.enableTelemetry === true
  );
}

/**
 * Injects the Matomo Tag Manager container — but ONLY when the user has
 * explicitly opted in (`settingsState.enableTelemetry`). Idempotent: safe to
 * call at startup and again whenever the consent toggle changes.
 *
 * With telemetry off this is a no-op: no script element is created and no
 * request to `s.cachy.app` is made.
 */
export function initTracking(): void {
  if (typeof window === "undefined") return;

  if (!isTelemetryEnabled()) return;
  if (containerRequested) return;
  containerRequested = true;

  var _mtm = (window._mtm = window._mtm || []);
  _mtm.push({ "mtm.startTime": new Date().getTime(), event: "mtm.Start" });
  var d = document,
    g = d.createElement("script");
  g.async = true;
  g.src = MATOMO_CONTAINER_URL;
  // Insert before the first script when one exists (mirrors the Matomo
  // snippet); otherwise append to <head> so the loader never depends on
  // document shape.
  var s = d.getElementsByTagName("script")[0];
  if (s && s.parentNode) {
    s.parentNode.insertBefore(g, s);
  } else {
    d.head.appendChild(g);
  }
}

/**
 * Reacts to a consent-toggle change. Opting in loads the container; opting
 * out drops our reference to the data layer so no further event is pushed.
 * A page reload fully unloads Matomo itself.
 */
export function applyTelemetryConsent(enabled: boolean): void {
  if (typeof window === "undefined") return;
  if (enabled) {
    initTracking();
  } else {
    // Drop the data-layer reference so pushToDataLayer's container guard
    // also catches any late callers.
    (window as { _mtm?: unknown[] })._mtm = undefined;
    containerRequested = false;
  }
}

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
function pushToDataLayer(data: TrackingEventData) {
  // Check if window exists (SSR guard), if _mtm is available, and if the
  // user still consents to telemetry (BUG-0286).
  if (typeof window === "undefined" || !window._mtm || !isTelemetryEnabled()) {
    // Matomo Tag Manager is not available or consent is missing, do nothing.
    // This can happen if it's blocked, not yet loaded, or opted out.
    // Only log in dev mode to reduce noise
    if (import.meta.env.DEV) {
      console.warn("Matomo not available or telemetry disabled. Skipping event:", data);
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
  const eventData: TrackingEventData = {
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
  context?: TrackingEventData,
) {
  const eventData: TrackingEventData = {
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

/**
 * Tracks a page view event explicitly for Matomo.
 * Ensures the 'mtm.PageView' event is sent with the correct structure.
 *
 * @param url The current page URL
 * @param title The page title (optional)
 */
export function trackPageView(url: string, title?: string) {
  // SSR guard, container guard and consent gate (BUG-0286)
  if (typeof window === "undefined" || !window._mtm || !isTelemetryEnabled()) {
    return;
  }

  window._mtm.push({
    event: 'mtm.PageView',
    pageUrl: url,
    pageTitle: title,
    mtm: { startTime: new Date().getTime() }
  });
}
