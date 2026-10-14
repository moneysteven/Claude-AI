import tempfile
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

from alerts import backtest, live, notify
from alerts.data import _drop_open_candle
from alerts.indicators import rsi
from alerts.strategy import Signal, add_indicators, latest_signal, signal_at


def make_candles(closes, start="2026-01-01", freq="h", spread=0.002):
    closes = np.asarray(closes, dtype=float)
    opens = np.concatenate([[closes[0]], closes[:-1]])
    idx = pd.date_range(start, periods=len(closes), freq=freq, tz="UTC")
    return pd.DataFrame({
        "open": opens,
        "high": np.maximum(opens, closes) * (1 + spread),
        "low": np.minimum(opens, closes) * (1 - spread),
        "close": closes,
        "volume": 1.0,
    }, index=idx)


def trend_resume():
    """Long uptrend, a pullback, then a rally that resumes the trend (with noise)."""
    rng = np.random.default_rng(0)
    closes = np.concatenate([np.linspace(100, 200, 300), np.linspace(200, 185, 40), np.linspace(185, 220, 120)])
    return make_candles(closes * (1 + rng.normal(0, 0.004, len(closes))))


def random_walk(n=3000, seed=1):
    rng = np.random.default_rng(seed)
    return make_candles(100 * np.exp(np.cumsum(rng.normal(0.0002, 0.01, n))))


class IndicatorTests(unittest.TestCase):
    def test_rsi_bounds_and_extremes(self):
        up = pd.Series(np.arange(1, 100, dtype=float))
        self.assertAlmostEqual(rsi(up).iloc[-1], 100.0)
        r = rsi(random_walk()["close"]).dropna()
        self.assertTrue(((r >= 0) & (r <= 100)).all())

    def test_crossovers_detected(self):
        ind = add_indicators(random_walk(), None)
        fast_above = ind["ema_fast"] > ind["ema_slow"]
        for ts in ind.index[ind["cross_up"]][:5]:
            i = ind.index.get_loc(ts)
            self.assertTrue(fast_above.iloc[i] and not fast_above.iloc[i - 1])


class StrategyTests(unittest.TestCase):
    def test_buy_after_uptrend_resumes(self):
        ind = add_indicators(trend_resume(), None)
        sigs = [s for s in (signal_at(ind, i, "X") for i in range(len(ind))) if s]
        self.assertTrue(sigs, "expected at least one signal")
        self.assertTrue(all(s.side == "BUY" for s in sigs))
        s = sigs[0]
        self.assertLess(s.stop, s.entry)
        self.assertAlmostEqual((s.target - s.entry) / (s.entry - s.stop), 2.0)

    def test_no_signal_during_warmup(self):
        self.assertIsNone(latest_signal(random_walk(150), "X"))


class BacktestTests(unittest.TestCase):
    def test_resolve_win_loss_and_both(self):
        sig = Signal("X", "BUY", pd.Timestamp("2026-01-01", tz="UTC"), 100, 95, 110, 55, "")
        idx = pd.date_range("2026-01-01 01:00", periods=1, freq="h", tz="UTC")
        win = pd.DataFrame({"high": [111], "low": [99]}, index=idx)
        loss = pd.DataFrame({"high": [101], "low": [94]}, index=idx)
        both = pd.DataFrame({"high": [111], "low": [94]}, index=idx)
        self.assertEqual(backtest.resolve(sig, win)[0], "WIN")
        self.assertEqual(backtest.resolve(sig, loss)[0], "LOSS")
        self.assertEqual(backtest.resolve(sig, both)[0], "LOSS")  # pessimistic
        short = Signal("X", "SELL", sig.time, 100, 105, 90, 45, "")
        self.assertEqual(backtest.resolve(short, pd.DataFrame({"high": [101], "low": [89]}, index=idx))[0], "WIN")

    def test_run_and_summary(self):
        trades = backtest.run(random_walk(5000), "X", cost_pct=0)
        closed = [t for t in trades if t.outcome != "OPEN"]
        self.assertGreater(len(closed), 5)
        for t in closed:
            self.assertAlmostEqual(t.r, 2.0 if t.outcome == "WIN" else -1.0)
            self.assertGreater(t.exit_time, t.signal.time)
        for a, b in zip(closed, closed[1:]):
            self.assertGreater(b.signal.time, a.exit_time)  # no overlapping trades
        stats = backtest.summarize(trades)
        self.assertEqual(stats["wins"] + stats["losses"], stats["trades"])
        self.assertIn("Win rate", backtest.format_report("X", stats))


class LiveTests(unittest.TestCase):
    def test_alerts_once_then_tracks_outcome(self):
        full = trend_resume()
        ind = add_indicators(full, None)
        first = int(np.flatnonzero(ind["cross_up"] & ind["ready"])[0])
        cfg = {"timeframe_minutes": 60, "timeframe_label": "1h", "account_size": 1000, "risk_pct": 1}
        market = {"name": "X", "source": "test", "symbol": "X"}
        view = {"df": full.iloc[: first + 1]}
        fetch = lambda *a: view["df"]
        state = {"last_signal_time": {}, "open": []}
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "log.csv"
            sent = live.check_market(market, cfg, state, log, fetch)
            self.assertEqual(len(sent), 1)
            self.assertIn("BUY signal", sent[0])
            self.assertEqual(live.check_market(market, cfg, state, log, fetch), [])  # no duplicate
            view["df"] = full  # the rally continues and hits the target
            sent = live.check_market(market, cfg, state, log, fetch)
            self.assertTrue(any("TAKE-PROFIT" in m for m in sent))
            self.assertIn("WIN", log.read_text())

    def test_drop_open_candle(self):
        df = make_candles([1, 2, 3], start="2026-01-01 00:00")
        now = pd.Timestamp("2026-01-01 02:30", tz="UTC")  # the 02:00 candle is still forming
        self.assertEqual(len(_drop_open_candle(df, 60, now)), 2)

    def test_position_size_risks_the_right_amount(self):
        sig = Signal("X", "BUY", pd.Timestamp("2026-01-01", tz="UTC"), 100, 95, 110, 55, "")
        units = notify.position_size(sig, 1000, 1)
        self.assertAlmostEqual(units * 5, 10)


if __name__ == "__main__":
    unittest.main()
