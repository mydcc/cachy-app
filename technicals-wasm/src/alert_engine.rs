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

use serde::{Deserialize, Serialize};
use rust_decimal::Decimal;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AlertCondition {
    PriceCrossUp(Decimal),
    PriceCrossDown(Decimal),
    PriceReached(Decimal),
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AlertDefinition {
    pub id: String,
    pub symbol: String,
    pub condition: AlertCondition,
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct AlertEvent {
    pub alert_id: String,
    pub symbol: String,
    pub timestamp: i64,
    pub price: Decimal,
}

pub struct AlertEngine {
    pub alerts: Vec<AlertDefinition>,
    last_prices: std::collections::HashMap<String, Decimal>,
}

impl AlertEngine {
    pub fn new() -> Self {
        Self {
            alerts: Vec::new(),
            last_prices: std::collections::HashMap::new(),
        }
    }

    pub fn set_alerts(&mut self, alerts: Vec<AlertDefinition>) {
        self.alerts = alerts;
    }

    pub fn add_alert(&mut self, alert: AlertDefinition) {
        if let Some(existing) = self.alerts.iter_mut().find(|a| a.id == alert.id) {
            *existing = alert;
        } else {
            self.alerts.push(alert);
        }
    }

    pub fn remove_alert(&mut self, id: &str) {
        self.alerts.retain(|a| a.id != id);
    }

    pub fn evaluate(&mut self, symbol: &str, current_price: Decimal, timestamp: i64) -> Vec<AlertEvent> {
        let mut events = Vec::new();
        let last_price_opt = self.last_prices.get(symbol).copied();

        for alert in self.alerts.iter_mut().filter(|a| a.active && a.symbol == symbol) {
            let mut triggered = false;

            match alert.condition {
                AlertCondition::PriceReached(target) => {
                    if let Some(last_price) = last_price_opt {
                        if (last_price < target && current_price >= target) ||
                           (last_price > target && current_price <= target) {
                            triggered = true;
                        }
                    } else {
                        if current_price == target {
                            triggered = true;
                        }
                    }
                },
                AlertCondition::PriceCrossUp(target) => {
                    if let Some(last_price) = last_price_opt {
                        if last_price < target && current_price >= target {
                            triggered = true;
                        }
                    }
                },
                AlertCondition::PriceCrossDown(target) => {
                    if let Some(last_price) = last_price_opt {
                        if last_price > target && current_price <= target {
                            triggered = true;
                        }
                    }
                },
            }

            if triggered {
                events.push(AlertEvent {
                    alert_id: alert.id.clone(),
                    symbol: symbol.to_string(),
                    timestamp,
                    price: current_price,
                });
                alert.active = false; // Hysteresis: only fires once
            }
        }

        self.last_prices.insert(symbol.to_string(), current_price);
        events
    }
}
