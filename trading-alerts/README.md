# Trading Alerts: BTC/USD + Gold (XAU/USD)

Watches Bitcoin and Gold on 1-hour candles and sends a **BUY** or **SELL** alert
to your phone (Telegram) when the strategy rules line up. Each alert includes a
stop-loss, a take-profit, and how much to buy so you only risk 1% of your account.

> **Read this first:** this does not predict the future. It alerts you when a
> set of rules is met. Many signals will lose, and that's normal. The goal
> is for the winners (+2R) to outweigh the losers (−1R) over many trades. **Run
> the backtest first, then paper trade (fake money) for a few weeks before you
> use real money.**

## What an alert looks like

```
🟢 BUY signal: BTC/USD @ 67,420.00
Timeframe: 1h · candle closed 2026-10-14 16:00 UTC
Why: EMA20 crossed above EMA50, price above EMA200 (uptrend), RSI 58
Stop-loss:   66,100.00
Take-profit: 70,060.00
Risk/reward: 1:2.0
Size: 0.0076 units (≈ $511) to risk 1% ($10) of $1,000
⚠️ A signal, not a guarantee. Check the chart and always use the stop.
```

When the price later hits the stop or target, you get a follow-up
(`✅ TAKE-PROFIT hit` / `❌ STOP-LOSS hit`). Every signal and result is saved to
`signals_log.csv`, so you can see how it does in real life.

## The rules

| | BUY | SELL |
|---|---|---|
| Trigger | 20 EMA crosses **above** 50 EMA | 20 EMA crosses **below** 50 EMA |
| Trend filter | price **above** 200 EMA | price **below** 200 EMA |
| Momentum filter | RSI between 50 and 70 | RSI between 30 and 50 |
| Stop-loss | 1.5 × ATR below entry | 1.5 × ATR above entry |
| Take-profit | 2 × the risk above entry | 2 × the risk below entry |

All the numbers can be changed in `config.json` under `"strategy"`.

## Setup (one time)

You need **Python 3.10+** ([python.org](https://www.python.org/downloads/)).
On Windows, tick "Add Python to PATH" during install.

```bash
cd trading-alerts
pip install -r requirements.txt
```

### Phone alerts with Telegram (free)

1. In Telegram, message **@BotFather**, send `/newbot`, and follow the steps.
   It gives you a **token**.
2. Send your new bot any message, such as "hi".
3. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` in a browser.
   Find `"chat":{"id": 123456789` and copy that number.
4. Copy `.env.example` to `.env` and fill in:
   ```
   TELEGRAM_BOT_TOKEN=123456:ABC...
   TELEGRAM_CHAT_ID=123456789
   ```
5. Check that it works: `python -m alerts test-alert`. You should get a message on your phone.

Without Telegram set up, alerts still print in the terminal window.

## Use it

**1. Backtest:** see how the rules did over the last ~2 years:

```bash
python -m alerts backtest                 # both markets
python -m alerts backtest --market BTC --show-trades
python -m alerts backtest --market XAU
```

How to read the results:
- **Profit factor above 1.0** means the rules made money; 1.5+ is good.
  Below 1.0, change the settings before going live.
- **Win rate** around 35–50% is normal for a 2:1 strategy.
- **Worst losing streak** tells you how many losses in a row to be ready for.
- Past results don't guarantee future ones.

**2. Go live:** leave this running:

```bash
python -m alerts live
```

It checks every 60 seconds and alerts once per new signal. Keep the computer
on and awake, or run it on a cheap always-on server or VPS.

## Settings (`config.json`)

| Setting | Meaning |
|---|---|
| `timeframe_minutes` | Candle size. `60` = 1h. Others: 15, 30, 240 (4h), 1440 (daily) |
| `account_size` | Your trading account in USD (used for position size) |
| `risk_pct` | % of the account risked per trade. Keep it at 1–2% |
| `cost_pct` | Spread and fees per trade used in backtests (0.0005 = 0.05%) |

## Data sources

- **Live:** Kraken's free public API, no account needed. Gold uses
  **PAXG/USD**, a token backed 1:1 by physical gold that tracks spot XAU/USD
  very closely. It trades 24/7, so you may get weekend gold alerts while
  forex/CFD gold is closed. Your broker's price will differ slightly.
- **Backtests:** Yahoo Finance (`BTC-USD` and `GC=F` gold futures), because
  it has longer history. You can also pass your own data:
  `python -m alerts backtest --csv mydata.csv` (columns: time, open, high, low, close).

## Run the tests

```bash
python -m unittest discover -s tests
```
