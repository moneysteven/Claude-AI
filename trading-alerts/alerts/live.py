"""Live watcher: poll each market, alert on new signals, follow them to their exit."""

import csv
import json
import os
import time
import traceback
from pathlib import Path

import pandas as pd

from . import data, notify
from .backtest import resolve
from .strategy import Signal, latest_signal

LOG_FIELDS = ["market", "side", "time", "entry", "stop", "target", "rsi", "reason",
              "outcome", "exit_time", "exit_price"]


def _load_state(path):
    if path.exists():
        return json.loads(path.read_text())
    return {"last_signal_time": {}, "open": []}


def _save_state(path, state):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2))
    os.replace(tmp, path)


def _signal_from_dict(d):
    return Signal(**{**d, "time": pd.Timestamp(d["time"])})


def _log(path, row):
    new = not path.exists()
    with path.open("a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=LOG_FIELDS)
        if new:
            w.writeheader()
        w.writerow({k: row.get(k, "") for k in LOG_FIELDS})


def check_market(market, cfg, state, log_path, fetch=data.fetch):
    """One polling pass for one market. Returns messages sent (for tests)."""
    name, tf = market["name"], cfg["timeframe_minutes"]
    sent = []
    df = fetch(market["source"], market["symbol"], tf)
    if df.empty:
        return sent

    # 1. Did any open signal hit its stop or target since last time?
    still_open = []
    for d in state["open"]:
        if d["market"] != name:
            still_open.append(d)
            continue
        sig = _signal_from_dict(d)
        res = resolve(sig, df[df.index > sig.time])
        if res is None:
            still_open.append(d)
            continue
        outcome, exit_time, price = res
        msg = notify.outcome_message(sig, outcome, price)
        notify.send(msg)
        sent.append(msg)
        _log(log_path, {**sig.to_dict(), "outcome": outcome, "exit_time": exit_time.isoformat(),
                        "exit_price": price})
    state["open"] = still_open

    # 2. Did the newest closed candle produce a new signal?
    sig = latest_signal(df, name, cfg.get("strategy"))
    if sig and state["last_signal_time"].get(name) != sig.time.isoformat():
        state["last_signal_time"][name] = sig.time.isoformat()
        msg = notify.signal_message(sig, cfg["timeframe_label"], cfg.get("account_size"), cfg.get("risk_pct"))
        notify.send(msg)
        sent.append(msg)
        state["open"].append(sig.to_dict())
        _log(log_path, {**sig.to_dict(), "outcome": "OPEN"})
    return sent


def run_forever(cfg, workdir):
    state_path = Path(workdir) / "state.json"
    log_path = Path(workdir) / "signals_log.csv"
    state = _load_state(state_path)
    names = ", ".join(m["name"] for m in cfg["markets"])
    print(f"Watching {names} on {cfg['timeframe_label']} candles. "
          f"Checking every {cfg['poll_seconds']}s. Ctrl+C to stop.", flush=True)
    while True:
        for market in cfg["markets"]:
            try:
                check_market(market, cfg, state, log_path)
            except Exception:
                print(f"[{market['name']}] error, will retry next poll:", flush=True)
                traceback.print_exc()
        _save_state(state_path, state)
        time.sleep(cfg["poll_seconds"])
