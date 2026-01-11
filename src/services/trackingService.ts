// src/services/trackingService.ts

/**
 * Pushes a custom event to the Matomo tracking queue (standard tracking)
 * or Matomo Tag Manager data layer (if available).
 *
 * @param category The category of the event (e.g., 'Calculation').
 * @param action The action of the event (e.g., 'Success').
 * @param name An optional name for the event (e.g., 'With ATR').
 * @param value An optional numeric value for the event.
 */
export function trackCustomEvent(category: string, action: string, name?: string, value?: number) {
  // Try standard Matomo tracking first (_paq)
  if (window._paq) {
    const eventData: (string | number)[] = ['trackEvent', category, action];
    if (name) eventData.push(name);
    if (value !== undefined) eventData.push(value);

    window._paq.push(eventData);
    return;
  }

  // Fallback to Matomo Tag Manager (_mtm) if available
  if (window._mtm) {
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
    return;
  }

  // Tracking not available
  // Reduced logging level to debug to avoid console spam in dev environments without tracking
  // console.debug('Matomo tracking not available. Skipping custom event.');
}
