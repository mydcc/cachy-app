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

# --- Configuration ---
TRAINED_MODEL_DIR = "trained_models"
os.makedirs(TRAINED_MODEL_DIR, exist_ok=True)
MODEL_NAME = "ppo_cachy_agent"
TIMESTEPS = 10000  # Low for demo purposes, increase for real training (e.g. 1M)

def main():
    print("🚀 Starting Cachy Brain Training Pipeline...")

    # 1. Download Data (Using Yahoo Finance for Demo - BTC-USD)
    print("📥 Downloading Data for BTC-USD...")
    # FinRL YahooDownloader expects a list of tickers
    # We use a shorter timeframe for the demo
    df = YahooDownloader(
        start_date="2023-01-01",
        end_date="2023-12-31",
        ticker_list=["BTC-USD"]
    ).fetch_data()

    print(f"✅ Data downloaded. Shape: {df.shape}")

    # 2. Preprocess Data
    print("⚙️ Preprocessing Data & Adding Indicators...")
    fe = FeatureEngineer(
        use_technical_indicator=True,
        tech_indicator_list=INDICATORS,
        use_vix=False, # VIX usually not available for Crypto via standard yahoo calls easily
        use_turbulence=True,
        user_defined_feature=False
    )

    processed = fe.preprocess_data(df)

    # Cleaning
    list_ticker = processed["tic"].unique().tolist()
    list_date = list(pd.date_range(processed['date'].min(),processed['date'].max()).astype(str))
    processed = processed.sort_values(['date','tic']).reset_index(drop=True)

    # 3. Define Environment
    print("🌍 Setting up Trading Environment...")
    stock_dimension = len(processed.tic.unique())
    state_space = 1 + 2*stock_dimension + len(INDICATORS)*stock_dimension
    print(f"   Stock Dimension: {stock_dimension}, State Space: {state_space}")

    buy_cost_list = sell_cost_list = [0.001] * stock_dimension # 0.1% fees
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
