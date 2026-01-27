import os
import pandas as pd
import numpy as np
import yfinance as yf
from stable_baselines3 import PPO
from stable_baselines3.common.vec_env import DummyVecEnv
from finrl.meta.preprocessor.yahoodownloader import YahooDownloader
from finrl.meta.preprocessor.preprocessors import FeatureEngineer, data_split
from finrl.meta.env_stock_trading.env_stocktrading import StockTradingEnv
from finrl import config_tickers
from finrl.config import INDICATORS

# Optional: Try to import CCXT (for Binance) if available, handled gracefully if not
try:
    import ccxt
    HAS_CCXT = True
except ImportError:
    HAS_CCXT = False

# --- Configuration ---
TRAINED_MODEL_DIR = "trained_models"
os.makedirs(TRAINED_MODEL_DIR, exist_ok=True)
MODEL_NAME = "ppo_cachy_agent"
TIMESTEPS = 10000

# SETTINGS: Choose Data Source
# Options: "YAHOO" (Default, works always) or "BINANCE" (High quality crypto data, requires ccxt)
DATA_SOURCE = "BINANCE"

def download_data_yahoo(start_date, end_date, ticker_list):
    print(f"📥 Downloading from Yahoo Finance ({ticker_list})...")
    return YahooDownloader(
        start_date=start_date,
        end_date=end_date,
        ticker_list=ticker_list
    ).fetch_data()

def download_data_binance(start_date, end_date, symbol="BTC/USDT", timeframe="1d"):
    """
    Direct download using CCXT (Public API) for high quality crypto data.
    FinRL has wrappers, but direct CCXT is often more reliable for custom pipelines.
    """
    if not HAS_CCXT:
        print("⚠️ CCXT library not found. Falling back to Yahoo Finance.")
        return None

    print(f"📥 Downloading from Binance ({symbol} - {timeframe})...")
    exchange = ccxt.binance()

    # Calculate timestamps
    since = exchange.parse8601(f"{start_date}T00:00:00Z")
    end_ts = exchange.parse8601(f"{end_date}T00:00:00Z")

    all_ohlcv = []

    try:
        while since < end_ts:
            ohlcv = exchange.fetch_ohlcv(symbol, timeframe, since=since, limit=1000)
            if not ohlcv:
                break
            all_ohlcv.extend(ohlcv)
            since = ohlcv[-1][0] + 1  # Next timestamp
            # Rate limit safety
            # time.sleep(exchange.rateLimit / 1000)

        # Convert to DataFrame matching FinRL format
        # FinRL expects: date, open, high, low, close, volume, tic, day
        df = pd.DataFrame(all_ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['date'] = pd.to_datetime(df['timestamp'], unit='ms').dt.strftime('%Y-%m-%d')
        df['tic'] = symbol.replace("/", "-") # Normalize ticker name

        # Filter range
        df = df[(df['date'] >= start_date) & (df['date'] <= end_date)]

        # Drop timestamp, keep date
        df = df[['date', 'open', 'high', 'low', 'close', 'volume', 'tic']]

        print(f"✅ Binance Data fetched: {len(df)} rows.")
        return df

    except Exception as e:
        print(f"❌ Binance Download Error: {e}")
        return None

def main():
    print("🚀 Starting Cachy Brain Training Pipeline...")
    print(f"📊 Configured Data Source: {DATA_SOURCE}")

    # 1. Download Data
    # Defaults
    start_date = "2023-01-01"
    end_date = "2023-12-31"

    df = None

    if DATA_SOURCE == "BINANCE":
        # Try Binance First
        df = download_data_binance(start_date, end_date, symbol="BTC/USDT", timeframe="1d")

    if df is None:
        if DATA_SOURCE == "BINANCE":
            print("⚠️ Fallback to Yahoo Finance...")
        # Yahoo Fallback (or default)
        df = download_data_yahoo(start_date, end_date, ["BTC-USD"])

    if df is None or df.empty:
        print("❌ Critical Error: No data downloaded. Exiting.")
        return

    print(f"✅ Data ready. Shape: {df.shape}")

    # 2. Preprocess Data
    print("⚙️ Preprocessing Data & Adding Indicators...")
    fe = FeatureEngineer(
        use_technical_indicator=True,
        tech_indicator_list=INDICATORS,
        use_vix=False,
        use_turbulence=True,
        user_defined_feature=False
    )

    try:
        processed = fe.preprocess_data(df)
        processed = processed.sort_values(['date','tic']).reset_index(drop=True)
    except Exception as e:
        print(f"❌ Preprocessing failed: {e}")
        return

    # 3. Define Environment
    print("🌍 Setting up Trading Environment...")
    stock_dimension = len(processed.tic.unique())
    state_space = 1 + 2*stock_dimension + len(INDICATORS)*stock_dimension

    # Dynamic fee setting (0.1% is standard for crypto spot)
    buy_cost_list = sell_cost_list = [0.001] * stock_dimension
    num_stock_shares = [0] * stock_dimension

    env_kwargs = {
        "hmax": 100,
        "initial_amount": 1000000,
        "num_stock_shares": num_stock_shares,
        "buy_cost_pct": buy_cost_list,
        "sell_cost_pct": sell_cost_list,
        "state_space": state_space,
        "stock_dim": stock_dimension,
        "tech_indicator_list": INDICATORS,
        "action_space": stock_dimension,
        "reward_scaling": 1e-4
    }

    e_train_gym = StockTradingEnv(df=processed, **env_kwargs)
    env_train, _ = e_train_gym.get_sb_env()

    # 4. Train Agent (PPO)
    print("🧠 Training PPO Agent...")
    agent = PPO("MlpPolicy", env_train, verbose=1, ent_coef=0.01)

    agent.learn(total_timesteps=TIMESTEPS)
    print("✅ Training complete!")

    # 5. Save Model
    save_path = os.path.join(TRAINED_MODEL_DIR, MODEL_NAME)
    agent.save(save_path)
    print(f"💾 Model saved to: {save_path}.zip")

if __name__ == "__main__":
    main()
