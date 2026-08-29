import { i18nReady } from "./src/locales/i18n";

// Component tests mount real components that translate via svelte-i18n.
// Gate mounting until the active dictionary is loaded so no test asserts
// against raw $keys while the dynamic locale chunk is in flight.
await i18nReady;
