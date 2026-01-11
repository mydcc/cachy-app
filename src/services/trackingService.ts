// src/services/trackingService.ts

/**
 * Pushes a custom event to the Matomo Tag Manager data layer.
 * This can be used to track events that are not simple clicks,
 * such as successful calculations or API calls.
 *
 * @param category The category of the event (e.g., 'Calculation').
 * @param action The action of the event (e.g., 'Success').
 * @param name An optional name for the event (e.g., 'With ATR').
 * @param value An optional numeric value for the event.
 */
export function trackCustomEvent(category: string, action: string, name?: string, value?: number) {
  if (!window._mtm) {
    // Matomo Tag Manager is not available, do nothing.
    // This can happen if it's blocked or not yet loaded.
    console.warn('Matomo Tag Manager not available. Skipping custom event.');
    return;
  }

  const eventData: { [key: string]: string | number } = {
    event: 'customEvent',
    'custom-event-category': category,
    'custom-event-action': action,
  };

  if (name) {
    eventData['custom-event-name'] = name;
  }

  if (value !== undefined) {
    eventData['custom-event-value'] = value;
  }

  window._mtm.push(eventData);
}
