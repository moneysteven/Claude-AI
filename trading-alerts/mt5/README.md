# SignalPro: MT5 Expert Advisor for BTCUSD + XAUUSD

Runs inside MetaTrader 5. It watches the chart it's attached to and alerts you
(MT5 popup, push to the MT5 phone app, and/or Telegram) only when an
**A+ setup** shows up. On a **demo** account it can also place the trades for
you, so you can see how it does with no money at risk.

> **It cannot guarantee winning trades. Nothing can.** The filters below
> remove many weak signals and make losses smaller, but some trades will still
> lose. Test it in the Strategy Tester and on a demo account before you use
> real money.

## Which signals get through

A signal must pass **every** step:

| Step | Check |
|---|---|
| Trigger | 20 EMA crosses the 50 EMA in the direction of the 200 EMA trend (H1) |
| 1. Quality score | Score of **70+ out of 100** (see below) |
| 2. Higher timeframes | H4 and D1 trends are part of the score; they must mostly agree |
| 3. Bad conditions | Skipped if the market is choppy (ADX < 18), the spread is wide, or high-impact USD news is within 60 min before or 30 min after |
| 4. Proven | Skipped if this side (BUY or SELL) **lost money** on the last ~3000 candles (profit factor < 1.2) |
| 5. Breakeven | At +1R the stop moves to entry (auto) or you get a "MOVE STOP TO …" alert |

**Quality score (0–100):** H4 trend agrees +25 · D1 trend agrees +20 ·
strong trend (ADX 25+) +20 · RSI in the ideal zone +15 · high volume +10 ·
strong candle +10.

Every alert includes the score, the stop-loss, the take-profit, the lot size
for your risk %, the breakeven level, and *why* the signal passed.

## Install (5 minutes)

1. In MT5: **File → Open Data Folder → MQL5 → Experts**. Copy `SignalPro.mq5` there.
2. In MT5's Navigator panel, right-click **Expert Advisors → Refresh**.
   Double-click `SignalPro` in the list to open it in MetaEditor, then press
   **F7 (Compile)**. It should say `0 errors`. If you see errors, copy them
   and send them to me.
3. Open an **XAUUSD H1** chart and drag `SignalPro` onto it. Do the same on a
   **BTCUSD H1** chart. (Your broker may name them `GOLD`, `XAUUSDm`, `BTCUSD.`
   and so on. Any name works.)
4. Click **Algo Trading** in the toolbar so it turns green.

The top-left of the chart shows the status: mode, last check, news, proven stats.

### Alerts on your phone

- **MT5 app push (easiest):** install MetaTrader 5 on your phone →
  Settings → Messages → copy your **MetaQuotes ID**. On your computer:
  **Tools → Options → Notifications** → tick *Enable push notifications*
  and paste the ID.
- **Telegram (optional):** put your bot token and chat id in the EA inputs,
  then add `https://api.telegram.org` under
  **Tools → Options → Expert Advisors → Allow WebRequest for listed URL**.

## Step 1: Strategy Tester (backtest on your broker's prices)

1. **View → Strategy Tester** (Ctrl+R).
2. Expert: `SignalPro` · Symbol: `XAUUSD` · Timeframe: **H1** ·
   Dates: the last 1–2 years · Modelling: **1 minute OHLC** (fast) or
   **Every tick based on real ticks** (most accurate) · Deposit: your
   real account size.
3. Click **Start**. When it finishes, open the **Backtest** tab and look at:
   - **Profit Factor**: above 1.0 made money, 1.5+ is good
   - **Maximal drawdown**: the worst drop you'd have to sit through
   - **Total trades**: under ~30 is too few to trust
4. Repeat for BTCUSD.

In the tester it always simulates trades so you can see results. The news
filter is skipped there, because MT5 has no past news data in the tester.

**Send me the results** (a screenshot of the Backtest tab is fine), and I'll
help you tune the settings. Don't tweak the settings until the backtest looks
perfect: that only fits the past and usually fails with live prices.

## Step 2: Demo account (live prices, fake money)

Open a demo account with your broker (File → Open an Account), attach the EA
with **AutoTrade = true**, and leave MT5 running for a few weeks. It refuses to
auto-trade on a real account unless you also set `AllowRealAccount = true`.

## Settings you might change

| Input | Default | Meaning |
|---|---|---|
| `AutoTrade` | false | Place trades automatically (demo only) |
| `RiskPercent` | 1.0 | % of balance lost if the stop is hit |
| `MinScore` | 70 | Raise it for fewer, stricter signals; lower it for more |
| `AdxMin` | 18 | Below this the market counts as choppy and signals are skipped |
| `NewsMinutesBefore/After` | 60 / 30 | Quiet window around big USD news |
| `ProvenMinPF` | 1.2 | How profitable a setup must have been recently |
| `BreakevenAtR` | 1.0 | When to move the stop to entry (0 = off) |
| `RewardRisk` | 2.0 | Take-profit distance as a multiple of the risk |
