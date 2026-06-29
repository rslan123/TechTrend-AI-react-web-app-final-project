"""
Stock Price Direction Predictor
================================
Version 3 — Multi-Horizon + Cache + Retry
פרויקט גמר Data

Supported horizons:
  1h   → next hour        (1h bars,  60d history)
  1d   → next day         (1h bars,  60d history,  shift=7)
  1wk  → next week        (1d bars,  1y  history,  shift=5)
  1mo  → next month       (1d bars,  2y  history,  shift=21)
  6mo  → next 6 months    (1wk bars, 10y history,  shift=26)
  1y   → next year        (1wk bars, 10y history,  shift=52)

API usage:
  python predictor.py AAPL 1h manual
  python predictor.py AAPL 1d auto
  python predictor.py TSLA 1wk manual
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

# Timeframe config — merged from friend's Colab + our backend needs
# interval : yfinance bar size
# period   : how much history to fetch
# shift    : how many bars ahead to predict
# min_rows : minimum rows needed after feature calculation
# label    : human readable label for logging
# x_fmt    : timestamp format for chart axis labels
HORIZONS = {
    "1h":  {
        "interval": "1h",  "period": "60d",  "shift": 1,
        "min_rows": 100,   "label": "Next 1 Hour",
        "x_fmt": "%b %d %H:%M"
    },
    "1d":  {
        "interval": "1h",  "period": "60d",  "shift": 7,
        "min_rows": 100,   "label": "Next Day",
        "x_fmt": "%b %d %H:%M"
    },
    "1wk": {
        "interval": "1d",  "period": "1y",   "shift": 5,
        "min_rows": 60,    "label": "Next Week",
        "x_fmt": "%b %d"
    },
    "1mo": {
        "interval": "1d",  "period": "2y",   "shift": 21,
        "min_rows": 60,    "label": "Next Month",
        "x_fmt": "%b %d"
    },
    "6mo": {
        "interval": "1wk", "period": "10y",  "shift": 26,
        "min_rows": 40,    "label": "Next 6 Months",
        "x_fmt": "%b %Y"
    },
    "1y":  {
        "interval": "1wk", "period": "10y",  "shift": 52,
        "min_rows": 40,    "label": "Next Year",
        "x_fmt": "%b %Y"
    },
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
    cache_path = os.path.join(
        DATA_DIR, f"{ticker}_{date.today()}_{interval}_{period}.pkl"
    )

    # Return cached data if already fetched today
    if os.path.exists(cache_path):
        return joblib.load(cache_path)

    # Fetch from Yahoo Finance with retry
    for attempt in range(retries):
        try:
            data = yf.download(
                ticker, period=period, interval=interval, progress=False
            )
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

def calculate_features(df: pd.DataFrame, interval: str) -> pd.DataFrame:
    """
    Calculate 8 technical features from OHLCV data.
    The time feature adapts to interval:
      - 1h          → hour of day  (0-23)
      - 1d / 1wk    → month        (1-12)
      - 1mo         → year mod 10  (0-9)
    """
    df = df.copy()

    # ── Trend ──────────────────────────────────────────────────────
    df['SMA_20']       = df['Close'].rolling(window=20).mean()
    df['Price_vs_SMA'] = (df['Close'] - df['SMA_20']) / (df['SMA_20'] + 1e-9)

    # ── Momentum ───────────────────────────────────────────────────
    delta = df['Close'].diff()
    gain  = delta.where(delta > 0, 0).rolling(window=14).mean()
    loss  = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    df['RSI']   = 100 - (100 / (1 + gain / (loss + 1e-9)))
    df['ROC_5'] = df['Close'].pct_change(5)

    # ── Volatility ─────────────────────────────────────────────────
    df['ATR']         = (df['High'] - df['Low']).rolling(14).mean()
    rolling_std       = df['Close'].rolling(20).std()
    df['BB_position'] = (df['Close'] - df['SMA_20']) / (2 * rolling_std + 1e-9)

    # ── Volume ─────────────────────────────────────────────────────
    df['Volume_Ratio'] = df['Volume'] / (df['Volume'].rolling(20).mean() + 1e-9)

    # ── Time feature — adapts to interval ──────────────────────────
    if interval == "1h":
        df['Period_Unit'] = df.index.hour          # 0-23
    elif interval in ("1d", "1wk"):
        df['Period_Unit'] = df.index.month         # 1-12
    else:
        df['Period_Unit'] = df.index.year % 10     # last digit of year

    df.dropna(inplace=True)
    return df


FEATURE_COLS = [
    'SMA_20', 'Price_vs_SMA', 'RSI', 'ROC_5',
    'ATR', 'BB_position', 'Volume_Ratio', 'Period_Unit'
]


# ─────────────────────────────────────────────
# MODEL VALIDATION
# ─────────────────────────────────────────────

def cross_validate(X: pd.DataFrame, y: pd.Series,
                   n_splits: int = 5) -> float:
    tscv   = TimeSeriesSplit(n_splits=n_splits)
    scores = []
    for train_idx, test_idx in tscv.split(X):
        if len(y.iloc[train_idx].unique()) < 2:
            continue
        m = xgb.XGBClassifier(
            n_estimators=50, max_depth=3,
            learning_rate=0.1, eval_metric='logloss', verbosity=0
        )
        m.fit(X.iloc[train_idx], y.iloc[train_idx])
        scores.append(
            accuracy_score(y.iloc[test_idx], m.predict(X.iloc[test_idx]))
        )
    return float(np.mean(scores)) if scores else 0.0

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
            w.writerow([
                "timestamp", "ticker", "horizon", "price",
                "verdict", "confidence_pct", "cv_accuracy_pct", "source"
            ])
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
            print(
                f"ERROR|Invalid horizon '{horizon}'. "
                f"Valid options: {', '.join(HORIZONS.keys())}"
            )
            return

        cfg      = HORIZONS[horizon]
        interval = cfg["interval"]
        period   = cfg["period"]
        shift    = cfg["shift"]
        min_rows = cfg["min_rows"]
        label    = cfg["label"]

        # 1. Fetch (cached + retry)
        data = fetch_cached(ticker, period, interval)
        if data.empty:
            print("ERROR|Invalid ticker or no data returned")
            return

        # 2. Features
        df = calculate_features(data, interval)
        if len(df) < min_rows:
            print(
                f"ERROR|Not enough data "
                f"(need {min_rows} rows, got {len(df)})"
            )
            return

        # 3. X and y
        X = df[FEATURE_COLS]
        y = (df['Close'].shift(-shift) > df['Close']).astype(int)

        # Drop last `shift` rows — no future label available for them
        X_model = X.iloc[:-shift]
        y_model = y.iloc[:-shift]

        # 4. Cross-validate
        cv_accuracy = cross_validate(X_model, y_model)

        # 5. Build chart data (last 20 bars for the frontend chart)
        CHART_BARS = {
            "1h":  20,   # last 20 hours
            "1d":  20,   # last 20 hours (same interval)
            "1wk": 30,   # last 30 trading days
            "1mo": 60,   # last 60 trading days (~3 months)
            "6mo": 52,   # last 52 weeks (~1 year)
            "1y":  104,  # last 104 weeks (~2 years)
            }
        
        history = df.tail(CHART_BARS[horizon])
        times  = ",".join([
            t.strftime('%b %d %H:%M') for t in history.index
        ])
        prices = ",".join([
            f"{v:.2f}" for v in history['Close'].values.flatten()
        ])
        smas   = ",".join([
            f"{v:.2f}" for v in history['SMA_20'].values.flatten()
        ])

        price   = float(df['Close'].iloc[-1])
        rsi_val = float(df['RSI'].iloc[-1])

        # NEW LINE I ADDED PERSONLYY - Guard: need both classes present to train
        if len(y_model.unique()) < 2:
            log_prediction(ticker, horizon, price, "NO_EDGE",
                           0.0, 0.0, source)
            print(
                f"RESULT|{ticker}|{price:.2f}|NO_EDGE|N/A"
                f"|0.0%|{times}|{prices}|{smas}"
                f"|{rsi_val:.1f}|{horizon}|{label}"
            )
            return
        
        # 6. Confidence gate
        if cv_accuracy < MIN_ACCURACY:
            log_prediction(ticker, horizon, price, "NO_EDGE",
                           0.0, cv_accuracy, source)
            print(
                f"RESULT|{ticker}|{price:.2f}|NO_EDGE|N/A"
                f"|{cv_accuracy * 100:.1f}%|{times}|{prices}|{smas}"
                f"|{rsi_val:.1f}|{horizon}|{label}"
            )
            return

        # 7. Train / load model
        model, _ = load_or_train_model(ticker, horizon, X_model, y_model)

        # 8. Predict
        proba = float(model.predict_proba(X.tail(1))[0][1])

        if proba > BUY_THRESHOLD:    verdict = "BUY"
        elif proba < SELL_THRESHOLD: verdict = "SELL"
        else:                        verdict = "HOLD"

        confidence = round(proba * 100, 1)

        # 9. Log + output
        # Pipe format — 12 fields:
        # RESULT | TICKER | PRICE | VERDICT | CONF% | CV_ACC% |
        # TIMES  | PRICES | SMAS  | RSI     | HORIZON | LABEL
        #  [0]     [1]      [2]     [3]       [4]      [5]
        #  [6]     [7]      [8]     [9]       [10]     [11]
        log_prediction(ticker, horizon, price, verdict,
                       confidence, cv_accuracy, source)
        print(
            f"RESULT|{ticker}|{price:.2f}|{verdict}|{confidence}%"
            f"|{cv_accuracy * 100:.1f}%|{times}|{prices}|{smas}"
            f"|{rsi_val:.1f}|{horizon}|{label}"
        )

    except Exception as e:
        print(f"ERROR|{str(e)}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        ticker_arg  = sys.argv[1].upper().strip()
        horizon_arg = sys.argv[2].strip() if len(sys.argv) > 2 else DEFAULT_HORIZON
        source_arg  = sys.argv[3].strip() if len(sys.argv) > 3 else "manual"
        run_prediction(ticker_arg, horizon_arg, source_arg)
    else:
        print("Usage  : python predictor.py TICKER [horizon] [source]")
        print("Example: python predictor.py AAPL 1h manual")
        print("Example: python predictor.py TSLA 1wk auto")
        print(f"Horizons: {', '.join(HORIZONS.keys())}")