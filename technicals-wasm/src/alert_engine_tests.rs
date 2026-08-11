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
    use rust_decimal::Decimal;
    use std::str::FromStr;

    #[test]
    fn test_alert_engine_cross_up() {
        let mut engine = AlertEngine::new();
        engine.add_alert(AlertDefinition {
            id: "1".to_string(),
            symbol: "BTCUSDT".to_string(),
            condition: AlertCondition::PriceCrossUp(Decimal::from_str("60000.0").unwrap()),
            active: true,
        });

        // initial state
        let evs = engine.evaluate("BTCUSDT", Decimal::from_str("59000.0").unwrap(), 1);
        assert!(evs.is_empty());

        // trigger
        let evs = engine.evaluate("BTCUSDT", Decimal::from_str("60500.0").unwrap(), 2);
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].alert_id, "1");

        // should not trigger again (hysteresis / fire once)
        let evs = engine.evaluate("BTCUSDT", Decimal::from_str("61000.0").unwrap(), 3);
        assert!(evs.is_empty());
    }

    #[test]
    fn test_alert_engine_cross_down() {
        let mut engine = AlertEngine::new();
        engine.add_alert(AlertDefinition {
            id: "2".to_string(),
            symbol: "BTCUSDT".to_string(),
            condition: AlertCondition::PriceCrossDown(Decimal::from_str("50000.0").unwrap()),
            active: true,
        });

        let _ = engine.evaluate("BTCUSDT", Decimal::from_str("51000.0").unwrap(), 1);

        let evs = engine.evaluate("BTCUSDT", Decimal::from_str("49500.0").unwrap(), 2);
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].alert_id, "2");
    }

    #[test]
    fn test_alert_engine_oscillate() {
        let mut engine = AlertEngine::new();
        engine.add_alert(AlertDefinition {
            id: "1".to_string(),
            symbol: "BTCUSDT".to_string(),
            condition: AlertCondition::PriceReached(Decimal::from_str("60000.0").unwrap()),
            active: true,
        });

        let _ = engine.evaluate("BTCUSDT", Decimal::from_str("59900.0").unwrap(), 1);

        // triggers
        let evs = engine.evaluate("BTCUSDT", Decimal::from_str("60050.0").unwrap(), 2);
        assert_eq!(evs.len(), 1);

        // back down
        let _ = engine.evaluate("BTCUSDT", Decimal::from_str("59950.0").unwrap(), 3);

        // back up, shouldn't trigger because it became inactive
        let evs = engine.evaluate("BTCUSDT", Decimal::from_str("60050.0").unwrap(), 4);
        assert!(evs.is_empty());
    }
}
