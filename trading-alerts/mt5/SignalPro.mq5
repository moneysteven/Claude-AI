//+------------------------------------------------------------------+
//|                                                    SignalPro.mq5 |
//|  Buy/sell signal alerts for BTCUSD and XAUUSD (Gold).            |
//|                                                                  |
//|  Signal: EMA20/50 crossover in the direction of the EMA200 trend.|
//|  Only "A+" setups are alerted. Each one must pass:               |
//|   1. Quality score >= MinScore (0-100)                           |
//|   2. Higher-timeframe trend check (H4 + D1)                      |
//|   3. No choppy market (ADX), no wide spread, no big USD news     |
//|   4. "Proven" check: this setup made money on recent history     |
//|  Open trades get a "move stop to breakeven" step at +1R.         |
//|                                                                  |
//|  By default it only ALERTS. AutoTrade places trades on DEMO      |
//|  accounts only. The Strategy Tester always simulates trades.     |
//+------------------------------------------------------------------+
#property copyright "Trading Alerts"
#property version   "1.00"
#property description "A+ buy/sell alerts with quality score, H4/D1 trend, chop, news, proven and breakeven filters."

#include <Trade/Trade.mqh>

input group "Trading & risk"
input bool            AutoTrade         = false;      // Place trades automatically (DEMO account only)
input bool            AllowRealAccount  = false;      // Allow AutoTrade on a REAL account (not recommended)
input double          RiskPercent       = 1.0;        // % of balance risked per trade
input long            MagicNumber       = 260814;     // ID for this EA's trades

input group "Signal rules"
input int             EmaFast           = 20;         // Fast EMA
input int             EmaSlow           = 50;         // Slow EMA
input int             EmaTrend          = 200;        // Trend EMA
input int             RsiPeriod         = 14;         // RSI period
input int             AtrPeriod         = 14;         // ATR period
input double          AtrStopMult       = 1.5;        // Stop-loss = ATR x this
input double          RewardRisk        = 2.0;        // Take-profit = risk x this

input group "Quality filter (A+ setups only)"
input int             MinScore          = 70;         // Minimum quality score (0-100)
input ENUM_TIMEFRAMES HigherTF1         = PERIOD_H4;  // Higher timeframe #1
input ENUM_TIMEFRAMES HigherTF2         = PERIOD_D1;  // Higher timeframe #2
input int             AdxPeriod         = 14;         // ADX period
input double          AdxMin            = 18;         // Skip choppy markets: ADX below this
input double          MaxSpreadAtr      = 0.3;        // Skip if spread > ATR x this (0 = off)

input group "News filter (live only)"
input bool            UseNewsFilter     = true;       // Skip signals near high-impact USD news
input int             NewsMinutesBefore = 60;         // Minutes before news
input int             NewsMinutesAfter  = 30;         // Minutes after news

input group "Proven check"
input bool            UseProvenCheck    = true;       // Only alert setups that made money recently
input int             ProvenLookbackBars= 3000;       // History bars to test (3000 x H1 = ~4 months)
input int             ProvenMinTrades   = 8;          // Trades needed before judging
input double          ProvenMinPF       = 1.2;        // Minimum profit factor to allow alerts

input group "Breakeven"
input double          BreakevenAtR      = 1.0;        // Move stop to entry at +this x risk (0 = off)

input group "Notifications"
input bool            PopupAlerts       = true;       // MT5 popup alert window
input bool            PushNotifications = true;       // Push to MT5 phone app (set MetaQuotes ID)
input string          TelegramToken     = "";         // Telegram bot token (optional)
input string          TelegramChatId    = "";         // Telegram chat id (optional)

//--- signal candidate on one candle
struct Setup
  {
   int      dir;      // 1 = BUY, -1 = SELL
   int      score;
   double   entry;
   double   sl;
   double   tp;
   double   risk;     // price distance entry -> stop
   datetime time;     // candle open time
   string   why;
   string   block;    // non-empty = filtered out, with the reason
  };

//--- results of the proven check for one side
struct Stats
  {
   int      trades;
   int      wins;
   int      losses;
   int      flats;
   double   winR;
   double   lossR;
  };

CTrade   g_trade;
int      hEmaF, hEmaS, hEmaT, hRsi, hAtr, hAdx, hT1E50, hT1E200, hT2E50;
MqlRates g_rates[];
double   g_emaF[], g_emaS[], g_emaT[], g_rsi[], g_atr[], g_adx[];
double   g_t1e50[], g_t1e200[], g_t1c[], g_t2e50[], g_t2c[];
int      g_n = 0, g_t1n = 0, g_t2n = 0;

datetime g_lastBar = 0;
long     g_provenDay = -1;
Stats    g_buy, g_sell;

bool     g_tradingOn = false;
string   g_mode = "";
string   g_status = "Waiting for the next candle to close...";
string   g_news = "clear";

//--- the one signal/trade being followed
bool     g_active = false;
bool     g_traded = false;
bool     g_beDone = false;
ulong    g_ticket = 0;
long     g_posId  = 0;
double   g_riskMoney = 0;
Setup    g_open;

//+------------------------------------------------------------------+
bool IsTester() { return (bool)MQLInfoInteger(MQL_TESTER); }

string TfName(ENUM_TIMEFRAMES tf)
  {
   if(tf == PERIOD_CURRENT)
      tf = (ENUM_TIMEFRAMES)_Period;
   return StringSubstr(EnumToString(tf), 7);
  }

string Px(double p) { return DoubleToString(p, _Digits); }

void ResetStats(Stats &st)
  {
   st.trades = 0; st.wins = 0; st.losses = 0; st.flats = 0;
   st.winR = 0; st.lossR = 0;
  }

double ProfitFactor(const Stats &st)
  {
   if(st.lossR <= 0)
      return st.winR > 0 ? 99.0 : 0.0;
   return st.winR / st.lossR;
  }

string StatsText(string side, const Stats &st)
  {
   return StringFormat("%s PF %.2f (%d trades: %dW/%dL/%dBE)", side, ProfitFactor(st),
                       st.trades, st.wins, st.losses, st.flats);
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   hEmaF   = iMA(_Symbol, _Period, EmaFast, 0, MODE_EMA, PRICE_CLOSE);
   hEmaS   = iMA(_Symbol, _Period, EmaSlow, 0, MODE_EMA, PRICE_CLOSE);
   hEmaT   = iMA(_Symbol, _Period, EmaTrend, 0, MODE_EMA, PRICE_CLOSE);
   hRsi    = iRSI(_Symbol, _Period, RsiPeriod, PRICE_CLOSE);
   hAtr    = iATR(_Symbol, _Period, AtrPeriod);
   hAdx    = iADX(_Symbol, _Period, AdxPeriod);
   hT1E50  = iMA(_Symbol, HigherTF1, 50, 0, MODE_EMA, PRICE_CLOSE);
   hT1E200 = iMA(_Symbol, HigherTF1, 200, 0, MODE_EMA, PRICE_CLOSE);
   hT2E50  = iMA(_Symbol, HigherTF2, 50, 0, MODE_EMA, PRICE_CLOSE);
   if(hEmaF == INVALID_HANDLE || hEmaS == INVALID_HANDLE || hEmaT == INVALID_HANDLE ||
      hRsi == INVALID_HANDLE || hAtr == INVALID_HANDLE || hAdx == INVALID_HANDLE ||
      hT1E50 == INVALID_HANDLE || hT1E200 == INVALID_HANDLE || hT2E50 == INVALID_HANDLE)
     {
      Print("SignalPro: failed to create indicators");
      return INIT_FAILED;
     }

   ArraySetAsSeries(g_rates, true);
   ArraySetAsSeries(g_emaF, true);   ArraySetAsSeries(g_emaS, true);  ArraySetAsSeries(g_emaT, true);
   ArraySetAsSeries(g_rsi, true);    ArraySetAsSeries(g_atr, true);   ArraySetAsSeries(g_adx, true);
   ArraySetAsSeries(g_t1e50, true);  ArraySetAsSeries(g_t1e200, true); ArraySetAsSeries(g_t1c, true);
   ArraySetAsSeries(g_t2e50, true);  ArraySetAsSeries(g_t2c, true);

   ResetStats(g_buy);
   ResetStats(g_sell);

   g_trade.SetExpertMagicNumber(MagicNumber);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_trade.SetDeviationInPoints(50);

   long accMode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   bool demo = (accMode == ACCOUNT_TRADE_MODE_DEMO || accMode == ACCOUNT_TRADE_MODE_CONTEST);
   if(IsTester())
     { g_tradingOn = true;  g_mode = "STRATEGY TESTER (simulated trades)"; }
   else if(AutoTrade && (demo || AllowRealAccount))
     { g_tradingOn = true;  g_mode = demo ? "AUTO-TRADE (demo)" : "AUTO-TRADE (REAL MONEY)"; }
   else if(AutoTrade)
     { g_tradingOn = false; g_mode = "ALERTS ONLY (AutoTrade blocked: real account)"; }
   else
     { g_tradingOn = false; g_mode = "ALERTS ONLY"; }

   AdoptExistingPosition();
   Print("SignalPro started on ", _Symbol, " ", TfName(PERIOD_CURRENT), ". Mode: ", g_mode);
   UpdatePanel();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   IndicatorRelease(hEmaF);  IndicatorRelease(hEmaS);  IndicatorRelease(hEmaT);
   IndicatorRelease(hRsi);   IndicatorRelease(hAtr);   IndicatorRelease(hAdx);
   IndicatorRelease(hT1E50); IndicatorRelease(hT1E200); IndicatorRelease(hT2E50);
   Comment("");
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   ManageOpen();

   datetime bar = iTime(_Symbol, _Period, 0);
   if(bar == 0 || bar == g_lastBar)
      return;

   long day = (long)(bar / 86400);
   if(UseProvenCheck && day != g_provenDay)
     {
      if(RunProvenCheck())
         g_provenDay = day;
     }

   if(!LoadData(300))
      return;                    // data not ready yet: retry on the next tick
   g_lastBar = bar;
   CheckSignal();
   UpdatePanel();
  }

//+------------------------------------------------------------------+
//| Copy the last `count` candles and indicator values (newest = 0). |
//+------------------------------------------------------------------+
bool LoadData(int count)
  {
   int n = CopyRates(_Symbol, _Period, 0, count, g_rates);
   if(n < 260)
      return false;
   if(CopyBuffer(hEmaF, 0, 0, n, g_emaF) != n) return false;
   if(CopyBuffer(hEmaS, 0, 0, n, g_emaS) != n) return false;
   if(CopyBuffer(hEmaT, 0, 0, n, g_emaT) != n) return false;
   if(CopyBuffer(hRsi,  0, 0, n, g_rsi)  != n) return false;
   if(CopyBuffer(hAtr,  0, 0, n, g_atr)  != n) return false;
   if(CopyBuffer(hAdx,  0, 0, n, g_adx)  != n) return false;

   int n1 = (int)((double)n * PeriodSeconds(_Period) / PeriodSeconds(HigherTF1)) + 5;
   int n2 = (int)((double)n * PeriodSeconds(_Period) / PeriodSeconds(HigherTF2)) + 5;
   int a = CopyBuffer(hT1E50, 0, 0, n1, g_t1e50);
   int b = CopyBuffer(hT1E200, 0, 0, n1, g_t1e200);
   int c = CopyClose(_Symbol, HigherTF1, 0, n1, g_t1c);
   int d = CopyBuffer(hT2E50, 0, 0, n2, g_t2e50);
   int e = CopyClose(_Symbol, HigherTF2, 0, n2, g_t2c);
   if(a < 3 || b < 3 || c < 3 || d < 3 || e < 3)
      return false;
   g_t1n = (int)MathMin(a, MathMin(b, c));
   g_t2n = (int)MathMin(d, e);
   g_n = n;
   return true;
  }

//--- index of the last higher-timeframe candle that had CLOSED at `closeTime`
int HtfIndex(ENUM_TIMEFRAMES tf, datetime closeTime, int size)
  {
   int s = iBarShift(_Symbol, tf, closeTime, false);
   if(s < 0)
      return -1;
   s += 1;
   return s < size ? s : -1;
  }

//+------------------------------------------------------------------+
//| Look for a signal on closed candle i. Returns false if there is  |
//| no crossover at all; otherwise fills s (s.block = why skipped).  |
//+------------------------------------------------------------------+
bool Evaluate(int i, Setup &s)
  {
   s.dir = 0; s.score = 0; s.why = ""; s.block = "";
   if(i < 1 || i + 21 >= g_n)
      return false;

   bool crossUp   = g_emaF[i] > g_emaS[i] && g_emaF[i + 1] <= g_emaS[i + 1];
   bool crossDown = g_emaF[i] < g_emaS[i] && g_emaF[i + 1] >= g_emaS[i + 1];
   double close = g_rates[i].close;
   if(crossUp && close > g_emaT[i])
      s.dir = 1;
   else if(crossDown && close < g_emaT[i])
      s.dir = -1;
   else
      return false;

   int dir = s.dir;
   s.time  = g_rates[i].time;
   s.entry = close;
   s.risk  = g_atr[i] * AtrStopMult;
   if(s.risk <= 0)
      return false;
   s.sl = close - dir * s.risk;
   s.tp = close + dir * s.risk * RewardRisk;

   //--- 3. choppy market filter
   if(g_adx[i] < AdxMin)
     {
      s.block = StringFormat("choppy market (ADX %.0f below %.0f)", g_adx[i], AdxMin);
      return true;
     }

   //--- 1 + 2. quality score
   datetime closeTime = g_rates[i].time + PeriodSeconds(_Period);
   string tf1 = TfName(HigherTF1), tf2 = TfName(HigherTF2);

   int k1 = HtfIndex(HigherTF1, closeTime, g_t1n);
   if(k1 >= 0)
     {
      bool priceOk = dir * (g_t1c[k1] - g_t1e200[k1]) > 0;
      bool emaOk   = dir * (g_t1e50[k1] - g_t1e200[k1]) > 0;
      if(priceOk && emaOk) { s.score += 25; s.why += tf1 + " trend agrees (+25), "; }
      else if(priceOk)     { s.score += 12; s.why += tf1 + " trend partly agrees (+12), "; }
      else                 { s.why += tf1 + " trend against (+0), "; }
     }

   int k2 = HtfIndex(HigherTF2, closeTime, g_t2n);
   if(k2 >= 0)
     {
      if(dir * (g_t2c[k2] - g_t2e50[k2]) > 0) { s.score += 20; s.why += tf2 + " trend agrees (+20), "; }
      else                                     { s.why += tf2 + " trend against (+0), "; }
     }

   double adx = g_adx[i];
   if(adx >= 25)      { s.score += 20; s.why += StringFormat("strong trend ADX %.0f (+20), ", adx); }
   else if(adx >= 20) { s.score += 10; s.why += StringFormat("moderate trend ADX %.0f (+10), ", adx); }
   else               { s.why += StringFormat("weak trend ADX %.0f (+0), ", adx); }

   double r = dir > 0 ? g_rsi[i] : 100.0 - g_rsi[i];   // mirror RSI for sells
   if(r >= 55 && r <= 65)      { s.score += 15; s.why += StringFormat("RSI %.0f ideal (+15), ", g_rsi[i]); }
   else if(r >= 50 && r <= 70) { s.score += 8;  s.why += StringFormat("RSI %.0f ok (+8), ", g_rsi[i]); }
   else                        { s.why += StringFormat("RSI %.0f stretched (+0), ", g_rsi[i]); }

   double avgVol = 0;
   for(int k = i + 1; k <= i + 20; k++)
      avgVol += (double)g_rates[k].tick_volume;
   avgVol /= 20.0;
   double vol = (double)g_rates[i].tick_volume;
   if(avgVol > 0 && vol >= 1.2 * avgVol) { s.score += 10; s.why += "high volume (+10), "; }
   else if(avgVol > 0 && vol >= avgVol)  { s.score += 5;  s.why += "above-average volume (+5), "; }
   else                                  { s.why += "low volume (+0), "; }

   double body  = g_rates[i].close - g_rates[i].open;
   double range = g_rates[i].high - g_rates[i].low;
   if(dir * body > 0 && range > 0 && MathAbs(body) >= 0.5 * range) { s.score += 10; s.why += "strong candle (+10)"; }
   else if(dir * body > 0)                                          { s.score += 5;  s.why += "candle agrees (+5)"; }
   else                                                             { s.why += "candle against (+0)"; }

   if(s.score < MinScore)
      s.block = StringFormat("quality score %d below minimum %d", s.score, MinScore);
   return true;
  }

//+------------------------------------------------------------------+
//| Follow a historical signal to its exit. Returns R, exitBar = -1  |
//| if still open. If one candle touches stop and target, assume the |
//| stop came first (pessimistic).                                   |
//+------------------------------------------------------------------+
double SimTrade(const Setup &s, int i, int &exitBar)
  {
   double sl = s.sl;
   bool be = false;
   for(int j = i - 1; j >= 1; j--)
     {
      double hi = g_rates[j].high, lo = g_rates[j].low;
      bool hitSL = s.dir > 0 ? lo <= sl : hi >= sl;
      bool hitTP = s.dir > 0 ? hi >= s.tp : lo <= s.tp;
      if(hitSL) { exitBar = j; return s.dir * (sl - s.entry) / s.risk; }
      if(hitTP) { exitBar = j; return RewardRisk; }
      double best = s.dir > 0 ? hi : lo;
      if(!be && BreakevenAtR > 0 && s.dir * (best - s.entry) >= BreakevenAtR * s.risk)
        { be = true; sl = s.entry; }
     }
   exitBar = -1;
   return 0;
  }

//+------------------------------------------------------------------+
//| 4. Replay recent history: did A+ BUY / SELL setups make money?   |
//+------------------------------------------------------------------+
bool RunProvenCheck()
  {
   if(!LoadData(ProvenLookbackBars + 250))
      return false;
   ResetStats(g_buy);
   ResetStats(g_sell);
   int i = g_n - 22;
   while(i >= 2)
     {
      Setup s;
      if(Evaluate(i, s) && s.block == "")
        {
         int exitBar;
         double r = SimTrade(s, i, exitBar);
         if(exitBar < 0)
            break;
         r -= g_rates[i].spread * _Point / s.risk;    // spread cost
         if(s.dir > 0) AddResult(g_buy, r);
         else          AddResult(g_sell, r);
         i = exitBar - 1;                             // one trade at a time
         continue;
        }
      i--;
     }
   Print("SignalPro proven check (last ", g_n, " bars): ", StatsText("BUY", g_buy), " | ", StatsText("SELL", g_sell));
   return true;
  }

void AddResult(Stats &st, double r)
  {
   st.trades++;
   if(r > 0) st.winR += r;
   else      st.lossR += -r;
   if(r > 0.5)       st.wins++;
   else if(r < -0.5) st.losses++;
   else              st.flats++;
  }

//+------------------------------------------------------------------+
bool NewsBlocked(string &why)
  {
   if(!UseNewsFilter || IsTester())
      return false;                                 // calendar is not available in the tester
   datetime now = TimeTradeServer();
   MqlCalendarValue vals[];
   if(!CalendarValueHistory(vals, now - NewsMinutesAfter * 60, now + NewsMinutesBefore * 60, NULL, "USD"))
      return false;
   for(int k = 0; k < ArraySize(vals); k++)
     {
      MqlCalendarEvent ev;
      if(CalendarEventById(vals[k].event_id, ev) && ev.importance == CALENDAR_IMPORTANCE_HIGH)
        {
         why = "high-impact USD news: " + ev.name + " at " + TimeToString(vals[k].time, TIME_MINUTES);
         return true;
        }
     }
   return false;
  }

//+------------------------------------------------------------------+
void CheckSignal()
  {
   string news;
   g_news = NewsBlocked(news) ? news : "clear";

   Setup s;
   if(!Evaluate(1, s))
     {
      g_status = "Last candle " + TimeToString(g_rates[1].time, TIME_DATE | TIME_MINUTES) + ": no setup";
      return;
     }
   string side = s.dir > 0 ? "BUY" : "SELL";

   if(g_active)
      s.block = "a signal/trade is already open";

   double spread = (double)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) * _Point;
   if(s.block == "" && MaxSpreadAtr > 0 && !IsTester() && spread > MaxSpreadAtr * g_atr[1])
      s.block = "spread too wide (" + Px(spread) + ")";

   if(s.block == "" && UseProvenCheck)
     {
      Stats st;
      if(s.dir > 0) st = g_buy; else st = g_sell;
      if(st.trades >= ProvenMinTrades && ProfitFactor(st) < ProvenMinPF)
         s.block = side + " setups lost money recently: " + StatsText(side, st);
     }

   if(s.block == "" && g_news != "clear")
      s.block = g_news;

   datetime closeTime = g_rates[1].time + PeriodSeconds(_Period);
   if(s.block == "" && TimeCurrent() - closeTime > PeriodSeconds(_Period) / 2)
      s.block = "candle closed too long ago (EA just started)";

   if(s.block != "")
     {
      g_status = side + " setup skipped (score " + IntegerToString(s.score) + "): " + s.block;
      Print("SignalPro: ", g_status);
      return;
     }

   Fire(s);
  }

//+------------------------------------------------------------------+
double LotsFor(double riskDist, double &riskMoney)
  {
   riskMoney = AccountInfoDouble(ACCOUNT_BALANCE) * RiskPercent / 100.0;
   double tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(tv <= 0 || ts <= 0 || step <= 0 || riskDist <= 0)
      return 0;
   double lossPerLot = riskDist / ts * tv;
   double lots = MathFloor(riskMoney / lossPerLot / step) * step;
   if(lots < vmin)
     {
      if(vmin * lossPerLot > 2 * riskMoney)
         return 0;                                  // even the smallest lot risks too much
      lots = vmin;
     }
   lots = MathMin(lots, vmax);
   riskMoney = lots * lossPerLot;
   int digits = (int)MathMax(0, MathRound(-MathLog10(step)));
   return NormalizeDouble(lots, digits);
  }

void Fire(Setup &s)
  {
   string side = s.dir > 0 ? "BUY" : "SELL";
   double riskMoney;
   double lots = LotsFor(s.risk, riskMoney);
   string tradeNote = "";

   if(g_tradingOn)
     {
      if(lots <= 0)
        {
         g_status = side + " signal but the account is too small for this stop at " + DoubleToString(RiskPercent, 1) + "% risk";
         Notify(g_status, g_status);
         return;
        }
      double price = s.dir > 0 ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double sl = NormalizeDouble(price - s.dir * s.risk, _Digits);
      double tp = NormalizeDouble(price + s.dir * s.risk * RewardRisk, _Digits);
      bool ok = s.dir > 0 ? g_trade.Buy(lots, _Symbol, price, sl, tp, "SignalPro " + IntegerToString(s.score))
                          : g_trade.Sell(lots, _Symbol, price, sl, tp, "SignalPro " + IntegerToString(s.score));
      uint rc = g_trade.ResultRetcode();
      if(!ok || (rc != TRADE_RETCODE_DONE && rc != TRADE_RETCODE_PLACED))
        {
         g_status = side + " signal: order FAILED (" + g_trade.ResultRetcodeDescription() + ")";
         Notify(g_status, g_status);
         return;
        }
      s.entry = price; s.sl = sl; s.tp = tp;
      if(!FindPosition())
         Print("SignalPro: order sent but position not found yet");
      g_traded = true;
      tradeNote = "TRADE PLACED: " + DoubleToString(lots, 2) + " lots (#" + IntegerToString((long)g_ticket) + ")\n";
     }
   else
      g_traded = false;

   g_open = s;
   g_active = true;
   g_beDone = false;
   g_riskMoney = riskMoney;

   Stats st;
   if(s.dir > 0) st = g_buy; else st = g_sell;
   string proven = st.trades >= ProvenMinTrades ? StatsText(side, st)
                   : StringFormat("not enough history yet (%d trades)", st.trades);

   string msg = StringFormat("%s %s @ %s (%s)\n", side, _Symbol, Px(s.entry), TfName(PERIOD_CURRENT));
   msg += StringFormat("Quality score: %d/100\n", s.score);
   msg += "Stop-loss:   " + Px(s.sl) + "\n";
   msg += "Take-profit: " + Px(s.tp) + "\n";
   msg += StringFormat("Risk/reward: 1:%.1f\n", RewardRisk);
   if(lots > 0)
      msg += StringFormat("Size: %s lots risks $%.2f (%.1f%% of balance)\n", DoubleToString(lots, 2), riskMoney, RiskPercent);
   if(BreakevenAtR > 0)
      msg += "Breakeven: move stop to entry at " + Px(s.entry + s.dir * s.risk * BreakevenAtR) + "\n";
   msg += tradeNote;
   msg += "Why: " + s.why + "\n";
   msg += "Proven: " + proven + "\n";
   msg += "A signal, not a guarantee. Always use the stop.";

   string push = StringFormat("%s %s %s | score %d | SL %s TP %s | %s lots", side, _Symbol, Px(s.entry),
                              s.score, Px(s.sl), Px(s.tp), DoubleToString(lots, 2));
   g_status = side + " SIGNAL at " + Px(s.entry) + " (score " + IntegerToString(s.score) + ")";
   Notify(msg, push);
  }

//+------------------------------------------------------------------+
//| Breakeven step + stop/target outcome, checked on every tick.     |
//+------------------------------------------------------------------+
void ManageOpen()
  {
   if(!g_active)
      return;
   string side = g_open.dir > 0 ? "BUY" : "SELL";
   int dir = g_open.dir;

   if(g_traded)
     {
      if(g_ticket == 0 || !PositionSelectByTicket(g_ticket))
        {
         if(g_ticket == 0 && FindPosition())
            return;
         ReportClosedTrade(side);
         g_active = false;
         return;
        }
      double price = PositionGetDouble(POSITION_PRICE_CURRENT);
      double open  = PositionGetDouble(POSITION_PRICE_OPEN);
      if(!g_beDone && BreakevenAtR > 0 && dir * (price - open) >= BreakevenAtR * g_open.risk)
        {
         g_beDone = true;
         double tp = PositionGetDouble(POSITION_TP);
         if(g_trade.PositionModify(g_ticket, NormalizeDouble(open, _Digits), tp))
            Notify(side + " " + _Symbol + ": up " + DoubleToString(BreakevenAtR, 1) + "R, stop moved to breakeven (" + Px(open) + "). This trade can no longer lose.",
                   side + " " + _Symbol + " stop moved to breakeven " + Px(open));
         else
            Notify(side + " " + _Symbol + ": could not move stop automatically. Move it to " + Px(open) + " manually.",
                   side + " " + _Symbol + " MOVE STOP TO " + Px(open));
        }
      return;
     }

   //--- alerts-only mode: follow the signal with live prices
   double px = dir > 0 ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(px <= 0)
      return;
   if(dir * (px - g_open.sl) <= 0)
     {
      string what = g_beDone ? "closed at BREAKEVEN (0R)" : "STOP-LOSS hit (-1R)";
      Notify(side + " " + _Symbol + " from " + Px(g_open.entry) + ": " + what + " at " + Px(px),
             side + " " + _Symbol + " " + what);
      g_active = false;
     }
   else if(dir * (px - g_open.tp) >= 0)
     {
      string what = StringFormat("TAKE-PROFIT hit (+%.1fR)", RewardRisk);
      Notify(side + " " + _Symbol + " from " + Px(g_open.entry) + ": " + what + " at " + Px(px),
             side + " " + _Symbol + " " + what);
      g_active = false;
     }
   else if(!g_beDone && BreakevenAtR > 0 && dir * (px - g_open.entry) >= BreakevenAtR * g_open.risk)
     {
      g_beDone = true;
      g_open.sl = g_open.entry;
      Notify(side + " " + _Symbol + ": up " + DoubleToString(BreakevenAtR, 1) + "R. MOVE YOUR STOP-LOSS TO " + Px(g_open.entry) + " (breakeven).",
             side + " " + _Symbol + " MOVE STOP TO " + Px(g_open.entry));
     }
   if(!g_active)
      UpdatePanel();
  }

void ReportClosedTrade(string side)
  {
   double profit = 0, exitPrice = 0;
   if(g_posId != 0 && HistorySelectByPosition(g_posId))
     {
      for(int k = 0; k < HistoryDealsTotal(); k++)
        {
         ulong d = HistoryDealGetTicket(k);
         profit += HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_SWAP) +
                   HistoryDealGetDouble(d, DEAL_COMMISSION);
         if(HistoryDealGetInteger(d, DEAL_ENTRY) == DEAL_ENTRY_OUT)
            exitPrice = HistoryDealGetDouble(d, DEAL_PRICE);
        }
     }
   string result = profit > 0 ? "WIN" : (MathAbs(profit) < 0.01 ? "BREAKEVEN" : "LOSS");
   string rText = g_riskMoney > 0 ? StringFormat(" (%+.1fR)", profit / g_riskMoney) : "";
   Notify(StringFormat("%s %s trade closed: %s %+.2f%s at %s", side, _Symbol, result, profit, rText, Px(exitPrice)),
          StringFormat("%s %s closed: %s %+.2f", side, _Symbol, result, profit));
   g_status = "Last trade: " + result;
  }

//--- find this EA's position on this symbol and start following it
bool FindPosition()
  {
   for(int k = PositionsTotal() - 1; k >= 0; k--)
     {
      ulong t = PositionGetTicket(k);
      if(t == 0)
         continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == MagicNumber)
        {
         g_ticket = t;
         g_posId = PositionGetInteger(POSITION_IDENTIFIER);
         return true;
        }
     }
   return false;
  }

//--- after a restart, keep managing a trade this EA opened earlier
void AdoptExistingPosition()
  {
   if(!FindPosition())
      return;
   g_open.dir   = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
   g_open.entry = PositionGetDouble(POSITION_PRICE_OPEN);
   g_open.sl    = PositionGetDouble(POSITION_SL);
   g_open.tp    = PositionGetDouble(POSITION_TP);
   g_open.risk  = MathAbs(g_open.entry - g_open.sl);
   g_open.score = 0;
   g_open.time  = (datetime)PositionGetInteger(POSITION_TIME);
   g_active = true;
   g_traded = true;
   g_beDone = g_open.sl > 0 && g_open.dir * (g_open.sl - g_open.entry) >= 0;
   g_riskMoney = 0;
   if(g_open.risk <= 0)
      g_beDone = true;
   Print("SignalPro: managing existing position #", g_ticket);
  }

//+------------------------------------------------------------------+
string UrlEncode(string text)
  {
   uchar b[];
   int n = StringToCharArray(text, b, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   string out = "";
   for(int k = 0; k < n; k++)
     {
      uchar c = b[k];
      if((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') ||
         c == '-' || c == '_' || c == '.' || c == '~')
         out += CharToString(c);
      else
         out += StringFormat("%%%02X", c);
     }
   return out;
  }

void SendTelegram(string text)
  {
   if(TelegramToken == "" || TelegramChatId == "" || IsTester())
      return;
   string body = "chat_id=" + TelegramChatId + "&text=" + UrlEncode(text);
   char data[];
   int len = StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(data, len - 1);
   char result[];
   string resultHeaders;
   ResetLastError();
   int code = WebRequest("POST", "https://api.telegram.org/bot" + TelegramToken + "/sendMessage",
                         "Content-Type: application/x-www-form-urlencoded\r\n", 5000, data, result, resultHeaders);
   if(code != 200)
      Print("SignalPro: Telegram failed (HTTP ", code, ", error ", GetLastError(),
            "). Add https://api.telegram.org under Tools > Options > Expert Advisors > Allow WebRequest.");
  }

void Notify(string message, string shortMessage)
  {
   Print("SignalPro: ", message);
   if(IsTester())
      return;
   if(PopupAlerts)
      Alert(message);
   if(PushNotifications)
      SendNotification(StringSubstr(shortMessage, 0, 255));
   SendTelegram(message);
  }

//+------------------------------------------------------------------+
void UpdatePanel()
  {
   if(IsTester() && !MQLInfoInteger(MQL_VISUAL_MODE))
      return;
   string txt = "SignalPro | " + _Symbol + " " + TfName(PERIOD_CURRENT) + " | " + g_mode + "\n";
   txt += StringFormat("Min score %d | %s + %s trend | risk %.1f%%\n", MinScore, TfName(HigherTF1), TfName(HigherTF2), RiskPercent);
   txt += "Status: " + g_status + "\n";
   txt += "News: " + g_news + "\n";
   if(UseProvenCheck)
      txt += "Proven: " + StatsText("BUY", g_buy) + " | " + StatsText("SELL", g_sell) + "\n";
   if(g_active)
      txt += StringFormat("Open %s @ %s  SL %s  TP %s%s\n", g_open.dir > 0 ? "BUY" : "SELL", Px(g_open.entry),
                          Px(g_open.sl), Px(g_open.tp), g_beDone ? "  (at breakeven)" : "");
   Comment(txt);
  }
//+------------------------------------------------------------------+
