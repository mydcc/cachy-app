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

#[cfg(test)]
mod tests {
    use crate::alert_engine::*;

    #[test]
    fn test_alert_engine_cross_up() {
        let mut engine = AlertEngine::new();
        engine.add_alert(AlertDefinition {
            id: "1".to_string(),
            symbol: "BTCUSDT".to_string(),
            condition: AlertCondition::PriceCrossUp(60000.0),
            active: true,
        });

        // initial state
        let evs = engine.evaluate("BTCUSDT", 59000.0, 1);
        assert!(evs.is_empty());

        // trigger
        let evs = engine.evaluate("BTCUSDT", 60500.0, 2);
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].alert_id, "1");

        // should not trigger again (hysteresis / fire once)
        let evs = engine.evaluate("BTCUSDT", 61000.0, 3);
        assert!(evs.is_empty());
    }

    #[test]
    fn test_alert_engine_cross_down() {
        let mut engine = AlertEngine::new();
        engine.add_alert(AlertDefinition {
            id: "2".to_string(),
            symbol: "BTCUSDT".to_string(),
            condition: AlertCondition::PriceCrossDown(50000.0),
            active: true,
        });

        let _ = engine.evaluate("BTCUSDT", 51000.0, 1);

        let evs = engine.evaluate("BTCUSDT", 49500.0, 2);
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].alert_id, "2");
    }

    #[test]
    fn test_alert_engine_oscillate() {
        let mut engine = AlertEngine::new();
        engine.add_alert(AlertDefinition {
            id: "1".to_string(),
            symbol: "BTCUSDT".to_string(),
            condition: AlertCondition::PriceReached(60000.0),
            active: true,
        });

        let _ = engine.evaluate("BTCUSDT", 59900.0, 1);

        // triggers
        let evs = engine.evaluate("BTCUSDT", 60050.0, 2);
        assert_eq!(evs.len(), 1);

        // back down
        let _ = engine.evaluate("BTCUSDT", 59950.0, 3);

        // back up, shouldn't trigger because it became inactive
        let evs = engine.evaluate("BTCUSDT", 60050.0, 4);
        assert!(evs.is_empty());
    }
}
