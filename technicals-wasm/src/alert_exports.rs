use wasm_bindgen::prelude::*;
use crate::alert_engine::{AlertEngine, AlertDefinition};
use rust_decimal::Decimal;
use std::str::FromStr;

#[wasm_bindgen]
pub struct AlertEngineWasm {
    engine: AlertEngine,
}

#[wasm_bindgen]
impl AlertEngineWasm {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            engine: AlertEngine::new(),
        }
    }

    #[wasm_bindgen]
    pub fn set_alerts(&mut self, alerts_json: &str) -> Result<(), JsValue> {
        let alerts: Vec<AlertDefinition> = serde_json::from_str(alerts_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse alerts: {}", e)))?;
        self.engine.set_alerts(alerts);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn add_alert(&mut self, alert_json: &str) -> Result<(), JsValue> {
        let alert: AlertDefinition = serde_json::from_str(alert_json)
            .map_err(|e| JsValue::from_str(&format!("Failed to parse alert: {}", e)))?;
        self.engine.add_alert(alert);
        Ok(())
    }

    #[wasm_bindgen]
    pub fn remove_alert(&mut self, id: &str) {
        self.engine.remove_alert(id);
    }

    #[wasm_bindgen]
    pub fn evaluate(&mut self, symbol: &str, current_price_str: &str, timestamp: f64) -> Result<JsValue, JsValue> {
        let current_price = Decimal::from_str(current_price_str)
            .map_err(|e| JsValue::from_str(&format!("Invalid decimal string: {}", e)))?;

        let events = self.engine.evaluate(symbol, current_price, timestamp as i64);
        let js_events = serde_wasm_bindgen::to_value(&events)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize events: {}", e)))?;
        Ok(js_events)
    }
}
