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
