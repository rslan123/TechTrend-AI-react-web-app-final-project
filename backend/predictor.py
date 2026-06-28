"""
Stock Price Direction Predictor
================================
Base: Version 3 — Multi-Horizon
פרויקט גמר Data
The model retrains once per day per ticker+horizon (cached to disk).

Supported horizons:
  1h   → next hour        (1h bars,  60d history)
  1d   → next day         (1d bars,  1y  history)
  1wk  → next week        (1wk bars, 5y  history)
  1mo  → next month       (1mo bars, 10y history)
  6mo  → next 6 months    (1mo bars, 10y history, shift=6)
  1y   → next year        (1mo bars, 10y history, shift=12)

API usage:
  python predictor.py AAPL 1h manual
  python predictor.py AAPL 1d manual
  python predictor.py TSLA 1wk auto
"""

import sys
import os
import csv
import time
import joblib
import warnings
import numpy as np
import pandas as pd
import xgboost as xgb
import yfinance as yf

from datetime import date, datetime
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import accuracy_score

warnings.filterwarnings("ignore")


# ─────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────

MIN_ACCURACY   = 0.53
BUY_THRESHOLD  = 0.60
SELL_THRESHOLD = 0.40
MODEL_DIR      = "models"
DATA_DIR       = "data_cache"
LOG_FILE       = "prediction_log.csv"

# Each horizon defines:
#   interval → yfinance bar size
#   period   → how much history to fetch
#   shift    → how many bars ahead to predict (1 bar = 1 interval)
#   min_rows → minimum rows needed after feature calculation
HORIZONS = {
    "1h":  {"interval": "1h",  "period": "60d",  "shift": 1,  "min_rows": 100},
    "1d":  {"interval": "1d",  "period": "1y",   "shift": 1,  "min_rows": 60},
    "1wk": {"interval": "1wk", "period": "5y",   "shift": 1,  "min_rows": 60},
    "1mo": {"interval": "1mo", "period": "10y",  "shift": 1,  "min_rows": 40},
    "6mo": {"interval": "1mo", "period": "10y",  "shift": 6,  "min_rows": 40},
    "1y":  {"interval": "1mo", "period": "10y",  "shift": 12, "min_rows": 40},
}

DEFAULT_HORIZON = "1h"


# ─────────────────────────────────────────────
# DATA FETCHING WITH CACHE + RETRY
# ─────────────────────────────────────────────

def fetch_cached(ticker: str, period: str, interval: str,
                 retries: int = 3, wait: int = 5) -> pd.DataFrame:
    """
    Fetch OHLCV data for a ticker.
    - Caches to disk once per day — avoids Yahoo Finance rate limits.
    - Retries up to 3 times with a 5-second wait if rate limited.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    cache_path = os.path.join(DATA_DIR,
                              f"{ticker}_{date.today()}_{interval}_{period}.pkl")

    # Return cached data if already fetched today
    if os.path.exists(cache_path):
        return joblib.load(cache_path)

    # Fetch from Yahoo Finance with retry
    for attempt in range(retries):
        try:
            data = yf.download(ticker, period=period,
                               interval=interval, progress=False)
            if isinstance(data.columns, pd.MultiIndex):
                data.columns = data.columns.get_level_values(0)
            if not data.empty:
                joblib.dump(data, cache_path)
                return data
        except Exception:
            pass
        if attempt < retries - 1:
            time.sleep(wait)

    return pd.DataFrame()


# ─────────────────────────────────────────────
# FEATURE ENGINEERING
# ─────────────────────────────────────────────

def calculate_features(df: pd.DataFrame, include_hour: bool = True) -> pd.DataFrame:
    """
    Calculate technical features from OHLCV data.
    include_hour=False for daily/weekly/monthly bars
    where hour of day has no meaning.
    """
    df = df.copy()

    # Trend
    df['SMA_20']       = df['Close'].rolling(window=20).mean()
    df['Price_vs_SMA'] = (df['Close'] - df['SMA_20']) / df['SMA_20']

    # Momentum
    delta = df['Close'].diff()
    gain  = delta.where(delta > 0, 0).rolling(window=14).mean()
    loss  = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    df['RSI']   = 100 - (100 / (1 + gain / loss))
    df['ROC_5'] = df['Close'].pct_change(5)

    # Volatility
    df['ATR']         = (df['High'] - df['Low']).rolling(14).mean()
    rolling_std       = df['Close'].rolling(20).std()
    df['BB_position'] = (df['Close'] - df['SMA_20']) / (2 * rolling_std + 1e-9)

    # Volume
    df['Volume_Ratio'] = df['Volume'] / (df['Volume'].rolling(20).mean() + 1e-9)

    # Time of day — only meaningful for intraday (hourly) bars
    if include_hour:
        df['Hour'] = df.index.hour

    df.dropna(inplace=True)
    return df


def get_feature_cols(include_hour: bool = True) -> list:
    base = ['SMA_20', 'Price_vs_SMA', 'RSI', 'ROC_5',
            'ATR', 'BB_position', 'Volume_Ratio']
    if include_hour:
        base.append('Hour')
    return base


# ─────────────────────────────────────────────
# MODEL VALIDATION
# ─────────────────────────────────────────────

def cross_validate(X: pd.DataFrame, y: pd.Series, n_splits: int = 5) -> float:
    tscv   = TimeSeriesSplit(n_splits=n_splits)
    scores = []
    for train_idx, test_idx in tscv.split(X):
        m = xgb.XGBClassifier(
            n_estimators=50, max_depth=3,
            learning_rate=0.1, eval_metric='logloss', verbosity=0
        )
        m.fit(X.iloc[train_idx], y.iloc[train_idx])
        scores.append(accuracy_score(y.iloc[test_idx], m.predict(X.iloc[test_idx])))
    return float(np.mean(scores))


# ─────────────────────────────────────────────
# MODEL CACHING
# ─────────────────────────────────────────────

def get_model_path(ticker: str, horizon: str) -> str:
    os.makedirs(MODEL_DIR, exist_ok=True)
    return os.path.join(MODEL_DIR, f"{ticker}_{horizon}_{date.today()}.pkl")

def load_or_train_model(ticker: str, horizon: str,
                        X: pd.DataFrame, y: pd.Series):
    path = get_model_path(ticker, horizon)
    if os.path.exists(path):
        return joblib.load(path), False
    m = xgb.XGBClassifier(
        n_estimators=50, max_depth=3,
        learning_rate=0.1, eval_metric='logloss', verbosity=0
    )
    m.fit(X.iloc[:-1], y.iloc[:-1])
    joblib.dump(m, path)
    return m, True


# ─────────────────────────────────────────────
# PREDICTION LOGGING
# ─────────────────────────────────────────────

def log_prediction(ticker, horizon, price, verdict,
                   confidence, cv_accuracy, source="manual"):
    file_exists = os.path.exists(LOG_FILE)
    with open(LOG_FILE, "a", newline="") as f:
        w = csv.writer(f)
        if not file_exists:
            w.writerow(["timestamp", "ticker", "horizon", "price",
                        "verdict", "confidence_pct", "cv_accuracy_pct", "source"])
        w.writerow([
            datetime.now().strftime("%Y-%m-%d %H:%M"),
            ticker, horizon, f"{price:.2f}", verdict,
            f"{confidence:.1f}", f"{cv_accuracy * 100:.1f}", source
        ])


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def run_prediction(ticker: str, horizon: str = DEFAULT_HORIZON,
                   source: str = "manual"):
    try:
        # 0. Validate horizon
        if horizon not in HORIZONS:
            print(f"ERROR|Invalid horizon '{horizon}'. "
                  f"Choose from: {', '.join(HORIZONS.keys())}")
            return

        cfg          = HORIZONS[horizon]
        interval     = cfg["interval"]
        period       = cfg["period"]
        shift        = cfg["shift"]
        min_rows     = cfg["min_rows"]
        include_hour = (interval == "1h")   # Hour feature only for intraday

        # 1. Fetch (cached + retry)
        data = fetch_cached(ticker, period, interval)
        if data.empty:
            print("ERROR|Invalid ticker or no data returned")
            return

        # 2. Features
        df = calculate_features(data, include_hour=include_hour)
        if len(df) < min_rows:
            print(f"ERROR|Not enough data "
                  f"(need at least {min_rows} rows after dropna, got {len(df)})")
            return

        # 3. X and y
        feature_cols = get_feature_cols(include_hour=include_hour)
        X = df[feature_cols]
        y = (df['Close'].shift(-shift) > df['Close']).astype(int)

        # 4. Validate
        cv_accuracy = cross_validate(X.iloc[:-shift], y.iloc[:-shift])

        # 5. Build chart data
        history = df.tail(20)
        times  = ",".join([t.strftime('%b %d %H:%M') for t in history.index])
        prices = ",".join([f"{v:.2f}" for v in history['Close'].values.flatten()])
        smas   = ",".join([f"{v:.2f}" for v in history['SMA_20'].values.flatten()])

        price   = float(df['Close'].iloc[-1])
        rsi_val = float(df['RSI'].iloc[-1])

        # 6. Confidence gate
        if cv_accuracy < MIN_ACCURACY:
            log_prediction(ticker, horizon, price, "NO_EDGE",
                           0.0, cv_accuracy, source)
            print(f"RESULT|{ticker}|{price:.2f}|NO_EDGE|N/A"
                  f"|{cv_accuracy * 100:.1f}%|{times}|{prices}|{smas}"
                  f"|{rsi_val:.1f}|{horizon}")
            return

        # 7. Train / load model
        model, _ = load_or_train_model(ticker, horizon, X, y)

        # 8. Predict
        proba = float(model.predict_proba(X.tail(1))[0][1])

        if proba > BUY_THRESHOLD:    verdict = "BUY"
        elif proba < SELL_THRESHOLD: verdict = "SELL"
        else:                        verdict = "HOLD"

        confidence = round(proba * 100, 1)

        # 9. Log + output
        # Final pipe format — 11 fields:
        # RESULT | TICKER | PRICE | VERDICT | CONF% | CV_ACC% | TIMES | PRICES | SMAS | RSI | HORIZON
        #   [0]     [1]     [2]      [3]      [4]      [5]      [6]     [7]     [8]   [9]    [10]
        log_prediction(ticker, horizon, price, verdict,
                       confidence, cv_accuracy, source)
        print(f"RESULT|{ticker}|{price:.2f}|{verdict}|{confidence}%"
              f"|{cv_accuracy * 100:.1f}%|{times}|{prices}|{smas}"
              f"|{rsi_val:.1f}|{horizon}")

    except Exception as e:
        print(f"ERROR|{str(e)}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        ticker_arg  = sys.argv[1].upper().strip()
        horizon_arg = sys.argv[2].strip() if len(sys.argv) > 2 else DEFAULT_HORIZON
        source_arg  = sys.argv[3].strip() if len(sys.argv) > 3 else "manual"
        run_prediction(ticker_arg, horizon_arg, source_arg)
    else:
        print("Usage: python predictor.py TICKER [horizon] [source]")
        print("Example: python predictor.py AAPL 1h manual")
        print("Example: python predictor.py TSLA 1d auto")
        print(f"Horizons: {', '.join(HORIZONS.keys())}")
