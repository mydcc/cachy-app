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

/**
 * BUG-0448 — a replay may only decide the alerts it was justified for, so the
 * service has to be able to take an alert out of the engine for the length of a
 * replay and put back exactly what it took. That needs the service to know what
 * the engine holds, including the `active` flag the core flips when it fires.
 */
describe('AlertEngine Service — what the engine holds, and withholding it', () => {
    class HoldingWasm {
        alerts: Array<{ id: string; symbol: string; condition: Record<string, string>; active: boolean }> = [];
        fireOnEvaluate: string[] = [];
        failNextAdd = false;

        set_alerts(alertsJson: string) { this.alerts = JSON.parse(alertsJson); }
        add_alert(alertJson: string) {
            if (this.failNextAdd) {
                this.failNextAdd = false;
                throw new Error('wasm rejected the alert');
            }
            const alert = JSON.parse(alertJson);
            this.alerts = [...this.alerts.filter((a) => a.id !== alert.id), alert];
        }
        remove_alert(id: string) { this.alerts = this.alerts.filter((a) => a.id !== id); }
        evaluate(symbol: string, price: string, timestamp: number) {
            return this.fireOnEvaluate.map((alert_id) => ({ alert_id, symbol, timestamp, price }));
        }
        free() {}
    }

    const ALERT_A = { id: 'a', symbol: 'BTCUSDT', condition: { price_reached: '50000.0' }, active: true };
    const ALERT_B = { id: 'b', symbol: 'BTCUSDT', condition: { price_cross_up: '70000.0' }, active: true };
    const ALERT_C = { id: 'c', symbol: 'ETHUSDT', condition: { price_reached: '3000.0' }, active: true };

    async function freshEngine() {
        vi.resetModules();
        const mod = await import('./alertEngine');
        const instance = new HoldingWasm();
        await mod.alertEngine.ensureLoaded(
            (async () => ({
                default: async () => {},
                AlertEngineWasm: class { constructor() { return instance; } },
            })) as never,
        );
        return { engine: mod.alertEngine, instance };
    }

    it('reports the alerts it holds for one symbol, across set, add and remove', async () => {
        const { engine } = await freshEngine();

        engine.setAlerts([ALERT_A, ALERT_C]);
        engine.addAlert(ALERT_B);
        engine.removeAlert(ALERT_A.id);

        expect(engine.heldAlertsFor('BTCUSDT').map((a) => a.id)).toEqual(['b']);
        expect(engine.heldAlertsFor('ETHUSDT').map((a) => a.id)).toEqual(['c']);
    });

    it('does not count an alert the engine refused to add', async () => {
        const { engine, instance } = await freshEngine();

        instance.failNextAdd = true;
        engine.addAlert(ALERT_B);

        expect(engine.heldAlertsFor('BTCUSDT')).toEqual([]);
    });

    it('marks an alert the core just fired as inactive, as the core itself does', async () => {
        const { engine, instance } = await freshEngine();
        engine.setAlerts([ALERT_A]);

        instance.fireOnEvaluate = ['a'];
        engine.evaluate('BTCUSDT', '50000.0', 1);

        expect(engine.heldAlertsFor('BTCUSDT')[0]?.active).toBe(false);
    });

    it('takes a withheld alert out of the engine for the run and puts it back afterwards', async () => {
        const { engine, instance } = await freshEngine();
        engine.setAlerts([ALERT_A, ALERT_B]);

        let heldDuringRun: string[] = [];
        engine.withAlertsWithheld([ALERT_B.id], () => {
            heldDuringRun = instance.alerts.map((a) => a.id);
        });

        expect(heldDuringRun).toEqual(['a']);
        expect(instance.alerts.map((a) => a.id).sort()).toEqual(['a', 'b']);
        expect(instance.alerts.find((a) => a.id === 'b')?.active).toBe(true);
    });

    it('never puts back an alert the engine did not hold, so a covered alert cannot be armed twice', async () => {
        const { engine, instance } = await freshEngine();
        engine.setAlerts([ALERT_A]);

        engine.withAlertsWithheld([ALERT_B.id], () => {});

        expect(instance.alerts.map((a) => a.id)).toEqual(['a']);
    });

    it('puts a withheld alert back even when the run throws', async () => {
        const { engine, instance } = await freshEngine();
        engine.setAlerts([ALERT_A, ALERT_B]);

        expect(() =>
            engine.withAlertsWithheld([ALERT_B.id], () => {
                throw new Error('replay blew up');
            }),
        ).toThrow('replay blew up');

        expect(instance.alerts.map((a) => a.id).sort()).toEqual(['a', 'b']);
    });
});
