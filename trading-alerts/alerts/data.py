"""Price data: fetch OHLC candles from free public APIs or a CSV file.

Every loader returns a DataFrame indexed by UTC timestamp with columns
open, high, low, close, volume. Only *closed* candles are returned — the
candle still forming right now is dropped so signals never repaint.
"""

import pandas as pd
import requests

KRAKEN_URL = "https://api.kraken.com/0/public/OHLC"
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
KRAKEN_INTERVALS = {1, 5, 15, 30, 60, 240, 1440, 10080, 21600}
YAHOO_INTERVALS = {1: "1m", 5: "5m", 15: "15m", 30: "30m", 60: "1h", 1440: "1d"}
COLUMNS = ["open", "high", "low", "close", "volume"]


def _drop_open_candle(df, interval_min, now=None):
    now = now if now is not None else pd.Timestamp.now(tz="UTC")
    closed = df.index + pd.Timedelta(minutes=interval_min) <= now
    return df[closed]


def fetch_kraken(pair, interval_min):
    """Kraken public OHLC (no API key). Returns up to the last 720 candles."""
    if interval_min not in KRAKEN_INTERVALS:
        raise ValueError(f"Kraken supports intervals {sorted(KRAKEN_INTERVALS)} (minutes)")
    resp = requests.get(KRAKEN_URL, params={"pair": pair, "interval": interval_min}, timeout=15)
    resp.raise_for_status()
    body = resp.json()
    if body.get("error"):
        raise RuntimeError(f"Kraken error for {pair}: {body['error']}")
    key = next(k for k in body["result"] if k != "last")
    rows = body["result"][key]
    df = pd.DataFrame(rows, columns=["time", "open", "high", "low", "close", "vwap", "volume", "count"])
    df.index = pd.to_datetime(df["time"].astype(int), unit="s", utc=True)
    df = df[COLUMNS].astype(float)
    return _drop_open_candle(df, interval_min)


def fetch_yahoo(symbol, interval_min, period="730d"):
    """Yahoo Finance chart API (no API key). Longer history, good for backtests.

    Intraday limits: 1h data goes back ~730 days, 15m/30m ~60 days.
    """
    if interval_min not in YAHOO_INTERVALS:
        raise ValueError(f"Yahoo supports intervals {sorted(YAHOO_INTERVALS)} (minutes)")
    resp = requests.get(
        YAHOO_URL.format(symbol=symbol),
        params={"interval": YAHOO_INTERVALS[interval_min], "range": period},
        headers={"User-Agent": "Mozilla/5.0"},
        timeout=20,
    )
    resp.raise_for_status()
    result = resp.json()["chart"]["result"][0]
    quote = result["indicators"]["quote"][0]
    df = pd.DataFrame({c: quote[c] for c in COLUMNS})
    df.index = pd.to_datetime(result["timestamp"], unit="s", utc=True)
    df = df.dropna().astype(float)
    return _drop_open_candle(df, interval_min)


def load_csv(path):
    """CSV with a time column (any parseable date) plus open/high/low/close[/volume]."""
    df = pd.read_csv(path)
    df.columns = [c.strip().lower() for c in df.columns]
    time_col = next(c for c in df.columns if c in ("time", "timestamp", "date", "datetime"))
    df.index = pd.to_datetime(df[time_col], utc=True)
    if "volume" not in df.columns:
        df["volume"] = 0.0
    return df[COLUMNS].astype(float).sort_index()


def fetch(source, symbol, interval_min, period=None):
    if source == "kraken":
        return fetch_kraken(symbol, interval_min)
    if source == "yahoo":
        return fetch_yahoo(symbol, interval_min, period or "730d")
    if source == "csv":
        return load_csv(symbol)
    raise ValueError(f"Unknown data source: {source}")
