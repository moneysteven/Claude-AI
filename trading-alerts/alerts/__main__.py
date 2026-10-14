"""Command line entry point.

  python -m alerts backtest            # how the strategy did on past data
  python -m alerts live                # watch markets and send alerts
  python -m alerts test-alert          # send a sample alert to check Telegram/Discord
"""

import argparse
import json
import os
from pathlib import Path

import pandas as pd
import requests

from . import backtest, data, live, notify
from .strategy import Signal

ROOT = Path(__file__).resolve().parent.parent


def load_env(path):
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def load_config(path):
    cfg = json.loads(Path(path).read_text())
    tf = cfg["timeframe_minutes"]
    cfg["timeframe_label"] = f"{tf // 60}h" if tf % 60 == 0 else f"{tf}m"
    return cfg


def cmd_backtest(cfg, args):
    for market in cfg["markets"]:
        if args.market and args.market.lower() not in market["name"].lower():
            continue
        hist = market.get("history", market)
        source, symbol = hist["source"], hist["symbol"]
        if args.csv:
            source, symbol = "csv", args.csv
        print(f"\nLoading {market['name']} history ({source}: {symbol}, {cfg['timeframe_label']})...")
        try:
            df = data.fetch(source, symbol, cfg["timeframe_minutes"], args.period)
        except requests.RequestException as e:
            print(f"Could not download data ({e.__class__.__name__}). Check your internet connection.")
            continue
        print(f"{len(df)} candles")
        trades = backtest.run(df, market["name"], cfg.get("strategy"), cfg.get("cost_pct", 0.0005))
        stats = backtest.summarize(trades, cfg.get("risk_pct", 1.0))
        print(backtest.format_report(market["name"], stats))
        if args.show_trades:
            for t in trades:
                s = t.signal
                print(f"  {s.time:%Y-%m-%d %H:%M} {s.side:4} @ {s.entry:,.2f} → {t.outcome:4} {t.r:+.2f}R")
        if args.csv:
            break


def cmd_test_alert(cfg, args):
    sig = Signal("BTC/USD", "BUY", pd.Timestamp.now(tz="UTC").floor("h"), 67420.0, 66100.0, 70060.0, 58.0,
                 "TEST ALERT — this is not a real signal")
    notify.send(notify.signal_message(sig, cfg["timeframe_label"], cfg.get("account_size"), cfg.get("risk_pct")))


def main():
    load_env(ROOT / ".env")
    parser = argparse.ArgumentParser(prog="python -m alerts", description="BTC/USD + Gold buy/sell alerts")
    parser.add_argument("--config", default=str(ROOT / "config.json"))
    sub = parser.add_subparsers(dest="cmd", required=True)
    bt = sub.add_parser("backtest", help="test the strategy on historical data")
    bt.add_argument("--market", help="only this market, e.g. BTC or XAU")
    bt.add_argument("--period", help="Yahoo history range, e.g. 730d, 365d, 5y")
    bt.add_argument("--csv", help="use your own OHLC CSV file instead of downloading")
    bt.add_argument("--show-trades", action="store_true", help="list every trade")
    sub.add_parser("live", help="watch markets and send alerts")
    sub.add_parser("test-alert", help="send a sample alert")
    args = parser.parse_args()
    cfg = load_config(args.config)

    if args.cmd == "backtest":
        cmd_backtest(cfg, args)
    elif args.cmd == "live":
        live.run_forever(cfg, ROOT)
    elif args.cmd == "test-alert":
        cmd_test_alert(cfg, args)


if __name__ == "__main__":
    main()
