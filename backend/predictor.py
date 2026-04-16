"""
Stock Price Direction Predictor
================================
Base: Version 2 60d hourly
פרויקט גמר Data
 The model retrains once per day per ticker (cached to disk).
  
"""

import sys
import os
import csv
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

MIN_ACCURACY   = 0.53   # Below this → output NO_EDGE instead of BUY/SELL
BUY_THRESHOLD  = 0.60
SELL_THRESHOLD = 0.40
FETCH_PERIOD   = "60d"
MODEL_DIR      = "models"
LOG_FILE       = "prediction_log.csv"


# ─────────────────────────────────────────────
# FEATURE ENGINEERING
# ─────────────────────────────────────────────

def calculate_features(df: pd.DataFrame) -> pd.DataFrame:
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

    # Time of day
    df['Hour'] = df.index.hour

    df.dropna(inplace=True)
    return df


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

def get_model_path(ticker: str) -> str:
    os.makedirs(MODEL_DIR, exist_ok=True)
    return os.path.join(MODEL_DIR, f"{ticker}_{date.today()}.pkl")

def load_or_train_model(ticker: str, X: pd.DataFrame, y: pd.Series):
    path = get_model_path(ticker)
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

def log_prediction(ticker, price, verdict, confidence, cv_accuracy, source="manual"):
    file_exists = os.path.exists(LOG_FILE)
    with open(LOG_FILE, "a", newline="") as f:
        w = csv.writer(f)
        if not file_exists:
            w.writerow(["timestamp", "ticker", "price",
                        "verdict", "confidence_pct", "cv_accuracy_pct", "source"])
        w.writerow([
            datetime.now().strftime("%Y-%m-%d %H:%M"),
            ticker, f"{price:.2f}", verdict,
            f"{confidence:.1f}", f"{cv_accuracy * 100:.1f}", source
        ])


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

FEATURE_COLS = ['SMA_20', 'Price_vs_SMA', 'RSI', 'ROC_5',
                'ATR', 'BB_position', 'Volume_Ratio', 'Hour']

def run_prediction(ticker: str, source: str = "manual"):
    try:
        # 1. Fetch
        data = yf.download(ticker, period=FETCH_PERIOD, interval="1h", progress=False)
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.get_level_values(0)
        if data.empty:
            print("ERROR|Invalid ticker or no data returned")
            return

        # 2. Features
        df = calculate_features(data)
        if len(df) < 100:
            print("ERROR|Not enough data (need at least 100 rows after dropna)")
            return

        # 3. X and y
        X = df[FEATURE_COLS]
        y = (df['Close'].shift(-1) > df['Close']).astype(int)

        # 4. Validate
        cv_accuracy = cross_validate(X.iloc[:-1], y.iloc[:-1])

        # 5. Build chart data (used by both the NO_EDGE and normal path)
        history = df.tail(20)
        # No comma inside the timestamp — "Oct 24 14:00" not "Oct 24, 14:00"
        # This is critical: commas are used to separate values in the list,
        # so having a comma inside a timestamp would break parsing on the frontend.
        times  = ",".join([t.strftime('%b %d %H:%M') for t in history.index])
        prices = ",".join([f"{v:.2f}" for v in history['Close'].values.flatten()])
        smas   = ",".join([f"{v:.2f}" for v in history['SMA_20'].values.flatten()])

        price   = float(df['Close'].iloc[-1])
        rsi_val = float(df['RSI'].iloc[-1])

        # 6. Confidence gate
        if cv_accuracy < MIN_ACCURACY:
            log_prediction(ticker, price, "NO_EDGE", 0.0, cv_accuracy, source)
            print(f"RESULT|{ticker}|{price:.2f}|NO_EDGE|N/A"
                  f"|{cv_accuracy * 100:.1f}%|{times}|{prices}|{smas}|{rsi_val:.1f}")
            return

        # 7. Train / load model
        model, _ = load_or_train_model(ticker, X, y)

        # 8. Predict
        proba = float(model.predict_proba(X.tail(1))[0][1])

        if proba > BUY_THRESHOLD:    verdict = "BUY"
        elif proba < SELL_THRESHOLD: verdict = "SELL"
        else:                        verdict = "HOLD"

        confidence = round(proba * 100, 1)

        # 9. Log + output
        # Final pipe format — 10 fields, index shown for frontend reference:
        # RESULT | TICKER | PRICE | VERDICT | CONF% | CV_ACC% | TIMES | PRICES | SMAS | RSI
        #   [0]     [1]     [2]      [3]      [4]      [5]      [6]     [7]     [8]   [9]
        log_prediction(ticker, price, verdict, confidence, cv_accuracy, source)
        print(f"RESULT|{ticker}|{price:.2f}|{verdict}|{confidence}%"
              f"|{cv_accuracy * 100:.1f}%|{times}|{prices}|{smas}|{rsi_val:.1f}")

    except Exception as e:
        print(f"ERROR|{str(e)}")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        ticker_arg = sys.argv[1].upper().strip()
        # Second argument is the source ("manual" or "auto"). Default to "manual".
        source_arg = sys.argv[2].strip() if len(sys.argv) > 2 else "manual"
        run_prediction(ticker_arg, source_arg)
    else:
        print("Usage: python predictor.py TICKER [source]")
        print("Example: python predictor.py AAPL manual")
 
