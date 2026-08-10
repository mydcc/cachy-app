/*
 * Copyright (C) 2026 MYDCT
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Additional indicator settings structures for missing indicators

#[derive(Serialize, Deserialize, Clone, Default)] 
pub struct SmaSettings { pub length: usize }

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct WmaSettings { pub length: usize }

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct VwmaSettings { pub length: usize }

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct HmaSettings { pub length: usize }

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct StochRsiSettings { pub length: usize, pub stoch_length: usize, pub k: usize, pub d: usize }

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AroonSettings { pub length: usize }

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct IchimokuSettings { 
    pub conversion: usize, 
    pub base: usize, 
    pub span_b: usize, 
    pub displacement: usize 
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct KeltnerSettings { pub length: usize, pub multiplier: f64, pub atr_length: usize }

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct DonchianSettings { pub length: usize }

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct ObvSettings {}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct VolumeProfileSettings { pub rows: usize }

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct AdSettings {} // Accumulation/Distribution

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct RocSettings { pub length: usize }

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct TsiSettings { pub long: usize, pub short: usize, pub signal: usize }
