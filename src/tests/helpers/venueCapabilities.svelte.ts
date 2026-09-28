/*
 * A reactive stand-in for a venue's own capability declaration, for tests that
 * have to change venue without remounting.
 *
 * Mocking `activeExchange` with a plain object severs the reactive link: the
 * component's `$derived` would depend on nothing observable and would keep the
 * value it had at mount. That is how a gate written as a snapshot instead of a
 * `$derived` passes every test that sets its flags before mounting.
 *
 * `$state` in a `.svelte.ts` module is the only place a test can hold a
 * genuinely reactive value, so that is where it lives. Reset it in `beforeEach`
 * — the object is module-scoped and therefore shared across files' lifetimes.
 */
export const venueCapabilities = $state({
    addToPosition: false,
    tpSlStandalone: false,
});

export function resetVenueCapabilities(): void {
    venueCapabilities.addToPosition = false;
    venueCapabilities.tpSlStandalone = false;
}
