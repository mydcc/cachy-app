import { describe, it, expect, vi } from 'vitest';
import { alertEngine } from './alertEngine';

vi.mock('../logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
    warn: vi.fn()
  }
}));

describe('AlertEngine Service', () => {
    it('initializes and handles evaluation gracefully if wasm not loaded', () => {
        expect(() => alertEngine.evaluate("BTCUSDT", "60000.0", 1)).not.toThrow();
    });
});

/**
 * FEAT-0387 turns setAlerts() into a periodic call — every candle close, plus
 * the coverage re-sync timer, recomputes coverage and pushes the result — so
 * an unchanged set is pushed over and over. Skipping those is only safe while
 * the remembered payload is dropped by everything else that moves the engine's
 * alert set; a stale one would leave the engine holding alerts nobody asked it
 * to hold, or none at all. Each test below is one of those paths.
 */
describe('AlertEngine Service — redundant pushes are skipped, but only those', () => {
    class CountingWasm {
        setAlertsCalls: string[] = [];
        addAlertCalls: string[] = [];
        removeAlertCalls: string[] = [];
        failNextSet = false;

        set_alerts(alertsJson: string) {
            if (this.failNextSet) {
                this.failNextSet = false;
                throw new Error('wasm rejected the alert set');
            }
            this.setAlertsCalls.push(alertsJson);
        }
        add_alert(alertJson: string) { this.addAlertCalls.push(alertJson); }
        remove_alert(id: string) { this.removeAlertCalls.push(id); }
        evaluate() { return []; }
        free() {}
    }

    const ALERT_A = { id: 'a', symbol: 'BTCUSDT', condition: { price_reached: '50000.0' }, active: true };
    const ALERT_B = { id: 'b', symbol: 'ETHUSDT', condition: { price_reached: '3000.0' }, active: true };

    /**
     * A service with its own instance. The module singleton is shared with the
     * test above, and the whole point here is call *counts* on one engine.
     */
    async function freshEngine() {
        vi.resetModules();
        const mod = await import('./alertEngine');
        const instance = new CountingWasm();
        await mod.alertEngine.ensureLoaded(
            (async () => ({
                default: async () => {},
                AlertEngineWasm: class { constructor() { return instance; } },
            })) as never,
        );
        return { engine: mod.alertEngine, instance };
    }

    it('pushes the first alert set', async () => {
        const { engine, instance } = await freshEngine();

        engine.setAlerts([ALERT_A]);

        expect(instance.setAlertsCalls).toHaveLength(1);
    });

    it('does not push a set identical to the one the engine already holds', async () => {
        const { engine, instance } = await freshEngine();

        engine.setAlerts([ALERT_A]);
        engine.setAlerts([ALERT_A]);
        engine.setAlerts([ALERT_A]);

        // The saving this whole mechanism exists for: a candle close that
        // changed no coverage costs nothing.
        expect(instance.setAlertsCalls).toHaveLength(1);
    });

    it('pushes again as soon as the set actually differs', async () => {
        const { engine, instance } = await freshEngine();

        engine.setAlerts([ALERT_A]);
        engine.setAlerts([ALERT_A, ALERT_B]);

        expect(instance.setAlertsCalls).toHaveLength(2);
    });

    it('pushes again after addAlert moved the engine off that set', async () => {
        const { engine, instance } = await freshEngine();

        engine.setAlerts([ALERT_A]);
        engine.addAlert(ALERT_B);
        // Same argument as the first call, but the engine now holds A+B, so
        // skipping here would leave B armed behind the store's back.
        engine.setAlerts([ALERT_A]);

        expect(instance.setAlertsCalls).toHaveLength(2);
    });

    it('pushes again after removeAlert moved the engine off that set', async () => {
        const { engine, instance } = await freshEngine();

        engine.setAlerts([ALERT_A, ALERT_B]);
        engine.removeAlert(ALERT_B.id);
        // Skipping here would leave the engine without B while the store
        // believes it is armed — a silent gap (BUG-0382) through a cache.
        engine.setAlerts([ALERT_A, ALERT_B]);

        expect(instance.setAlertsCalls).toHaveLength(2);
    });

    it('does not remember a payload the engine rejected', async () => {
        const { engine, instance } = await freshEngine();

        instance.failNextSet = true;
        engine.setAlerts([ALERT_A]);
        expect(instance.setAlertsCalls).toHaveLength(0);

        // After a throw the engine's set is unknown; the retry has to send.
        engine.setAlerts([ALERT_A]);
        expect(instance.setAlertsCalls).toHaveLength(1);
    });
});
