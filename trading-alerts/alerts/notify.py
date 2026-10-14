"""Send alerts to the console plus Telegram and/or Discord if configured.

Credentials come from environment variables (or trading-alerts/.env):
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   — Telegram bot
  DISCORD_WEBHOOK_URL                    — Discord channel webhook
"""

import os

import requests


def _fmt(price):
    return f"{price:,.2f}"


def position_size(signal, account_size, risk_pct):
    """Units to buy/sell so that hitting the stop loses exactly risk_pct of the account."""
    risk_per_unit = abs(signal.entry - signal.stop)
    return (account_size * risk_pct / 100) / risk_per_unit if risk_per_unit else 0.0


def signal_message(signal, timeframe, account_size=None, risk_pct=None):
    icon = "🟢" if signal.side == "BUY" else "🔴"
    risk = abs(signal.entry - signal.stop)
    reward = abs(signal.target - signal.entry)
    lines = [
        f"{icon} {signal.side} signal: {signal.market} @ {_fmt(signal.entry)}",
        f"Timeframe: {timeframe} · candle closed {signal.time:%Y-%m-%d %H:%M} UTC",
        f"Why: {signal.reason}",
        f"Stop-loss:   {_fmt(signal.stop)}",
        f"Take-profit: {_fmt(signal.target)}",
        f"Risk/reward: 1:{reward / risk:.1f}",
    ]
    if account_size and risk_pct:
        units = position_size(signal, account_size, risk_pct)
        lines.append(
            f"Size: {units:.4f} units (≈ ${units * signal.entry:,.0f}) "
            f"to risk {risk_pct:g}% (${account_size * risk_pct / 100:,.0f}) of ${account_size:,.0f}"
        )
    lines.append("⚠️ A signal, not a guarantee. Check the chart and always use the stop.")
    return "\n".join(lines)


def outcome_message(signal, outcome, price):
    icon = "✅" if outcome == "WIN" else "❌"
    what = "TAKE-PROFIT hit" if outcome == "WIN" else "STOP-LOSS hit"
    return (
        f"{icon} {what}: {signal.market} {signal.side} from {_fmt(signal.entry)} "
        f"(signal {signal.time:%Y-%m-%d %H:%M} UTC) closed at {_fmt(price)}"
    )


def send(text):
    print(text, flush=True)
    print("-" * 60, flush=True)
    token, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if token and chat:
        try:
            requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat, "text": text}, timeout=10,
            ).raise_for_status()
        except requests.RequestException as e:
            print(f"[telegram] failed to send: {e}", flush=True)
    webhook = os.environ.get("DISCORD_WEBHOOK_URL")
    if webhook:
        try:
            requests.post(webhook, json={"content": text}, timeout=10).raise_for_status()
        except requests.RequestException as e:
            print(f"[discord] failed to send: {e}", flush=True)
