"""Replay the strategy over historical candles and report how it would have done.

Results are measured in R: 1R = the amount risked on a trade (entry to stop).
A win at 2:1 reward/risk is +2R, a loss is -1R. With "risk 1% per trade",
+10R means roughly +10% on the account.
"""

from dataclasses import dataclass

from .strategy import add_indicators, signal_at


@dataclass
class Trade:
    signal: object
    outcome: str  # "WIN", "LOSS" or "OPEN"
    exit_time: object
    exit_price: float
    r: float


def resolve(signal, later):
    """Walk candles after the signal until the stop or target is touched.

    If one candle touches both, we assume the stop hit first (pessimistic,
    since candle data can't tell us the order). Returns (outcome, time, price)
    or None if neither has been hit yet.
    """
    long = signal.side == "BUY"
    for ts, row in later.iterrows():
        hit_stop = row["low"] <= signal.stop if long else row["high"] >= signal.stop
        hit_target = row["high"] >= signal.target if long else row["low"] <= signal.target
        if hit_stop:
            return "LOSS", ts, signal.stop
        if hit_target:
            return "WIN", ts, signal.target
    return None


def run(df, market, params=None, cost_pct=0.0005):
    """cost_pct: spread + fees per round trip as a fraction of price (0.05% default)."""
    ind = add_indicators(df, params)
    trades = []
    i = 0
    while i < len(ind):
        sig = signal_at(ind, i, market, params)
        if sig is None:
            i += 1
            continue
        risk = abs(sig.entry - sig.stop)
        cost_r = sig.entry * cost_pct / risk
        res = resolve(sig, ind.iloc[i + 1:])
        if res is None:
            trades.append(Trade(sig, "OPEN", None, ind["close"].iloc[-1], 0.0))
            break
        outcome, exit_time, exit_price = res
        gross = (exit_price - sig.entry) / risk if sig.side == "BUY" else (sig.entry - exit_price) / risk
        trades.append(Trade(sig, outcome, exit_time, exit_price, gross - cost_r))
        # One trade at a time per market: skip ahead to the exit candle.
        i = ind.index.get_loc(exit_time) + 1
    return trades


def summarize(trades, risk_pct=1.0):
    closed = [t for t in trades if t.outcome != "OPEN"]
    if not closed:
        return {"trades": 0}
    rs = [t.r for t in closed]
    wins = [r for r in rs if r > 0]
    losses = [r for r in rs if r <= 0]

    equity, peak, max_dd = 0.0, 0.0, 0.0
    streak = worst_streak = 0
    for r in rs:
        equity += r
        peak = max(peak, equity)
        max_dd = max(max_dd, peak - equity)
        streak = streak + 1 if r <= 0 else 0
        worst_streak = max(worst_streak, streak)

    account = 1.0
    for r in rs:
        account *= 1 + r * risk_pct / 100

    return {
        "trades": len(closed),
        "wins": len(wins),
        "losses": len(losses),
        "win_rate": 100 * len(wins) / len(closed),
        "total_r": sum(rs),
        "avg_r": sum(rs) / len(closed),
        "profit_factor": (sum(wins) / -sum(losses)) if losses and sum(losses) < 0 else float("inf"),
        "max_drawdown_r": max_dd,
        "worst_losing_streak": worst_streak,
        "account_return_pct": (account - 1) * 100,
        "risk_pct": risk_pct,
        "first": closed[0].signal.time,
        "last": closed[-1].exit_time,
    }


def format_report(market, stats):
    if stats["trades"] == 0:
        return f"{market}: no completed trades in this period."
    pf = "∞" if stats["profit_factor"] == float("inf") else f"{stats['profit_factor']:.2f}"
    return "\n".join([
        f"=== {market} backtest: {stats['first']:%Y-%m-%d} → {stats['last']:%Y-%m-%d} ===",
        f"Trades:              {stats['trades']}  ({stats['wins']} wins / {stats['losses']} losses)",
        f"Win rate:            {stats['win_rate']:.1f}%",
        f"Total result:        {stats['total_r']:+.1f}R   (avg {stats['avg_r']:+.2f}R per trade)",
        f"Profit factor:       {pf}   (above 1.0 = made money; 1.5+ is good)",
        f"Max drawdown:        {stats['max_drawdown_r']:.1f}R",
        f"Worst losing streak: {stats['worst_losing_streak']} trades in a row",
        f"Account return:      {stats['account_return_pct']:+.1f}%  risking {stats['risk_pct']:g}% per trade",
    ])
