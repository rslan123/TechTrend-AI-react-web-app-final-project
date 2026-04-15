/**
 * EducationPage.jsx  —  "Market School"
 * ---------------------------------------
 * Interactive learn page. Each concept has:
 *   - A plain-English explanation
 *   - A live mini chart showing what it looks like visually
 *   - An interactive slider to explore the concept (where relevant)
 *   - A "how the app uses it" callout
 *
 
 * Self-contained: zero external imports beyond recharts.
 */

import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart,
  Line, Area, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

// ── Demo data generators ────────────────────────────────────────────────────

// Smooth random walk for price-like data
function priceWalk(len = 40, start = 150, volatility = 3) {
  const out = [start];
  for (let i = 1; i < len; i++) {
    const change = (Math.random() - 0.48) * volatility;
    out.push(parseFloat((out[i - 1] + change).toFixed(2)));
  }
  return out;
}

// SMA of an array
function sma(arr, period) {
  return arr.map((_, i) => {
    if (i < period - 1) return null;
    const slice = arr.slice(i - period + 1, i + 1);
    return parseFloat((slice.reduce((a, b) => a + b, 0) / period).toFixed(2));
  });
}

// RSI from price array
function rsi(prices, period = 14) {
  const result = Array(period).fill(null);
  for (let i = period; i < prices.length; i++) {
    const slice = prices.slice(i - period, i + 1);
    let gains = 0, losses = 0;
    for (let j = 1; j < slice.length; j++) {
      const diff = slice[j] - slice[j - 1];
      if (diff > 0) gains += diff; else losses -= diff;
    }
    const avgG = gains / period;
    const avgL = losses / period;
    result.push(avgL === 0 ? 100 : parseFloat((100 - 100 / (1 + avgG / avgL)).toFixed(1)));
  }
  return result;
}

// Bollinger bands
function bollinger(prices, period = 20, mult = 2) {
  return prices.map((_, i) => {
    if (i < period - 1) return { mid: null, upper: null, lower: null };
    const slice = prices.slice(i - period + 1, i + 1);
    const mean  = slice.reduce((a, b) => a + b, 0) / period;
    const std   = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
    return {
      mid:   parseFloat(mean.toFixed(2)),
      upper: parseFloat((mean + mult * std).toFixed(2)),
      lower: parseFloat((mean - mult * std).toFixed(2)),
    };
  });
}

// ATR (simplified: high-low range per bar)
function atrData(len = 40, baseVol = 3) {
  return Array.from({ length: len }, (_, i) => {
    const vol = baseVol + Math.sin(i / 5) * 1.5 + Math.random();
    return parseFloat(vol.toFixed(2));
  });
}

// ── Shared mini tooltip ──────────────────────────────────────────────────────
function MiniTooltip({ active, payload, label, unit = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg shadow-xl text-xs">
      {payload.filter(p => p.value != null).map((p, i) => (
        <p key={i} style={{ color: p.stroke || p.color || "#fff" }} className="font-bold">
          {p.name}: {p.value}{unit}
        </p>
      ))}
    </div>
  );
}

// ── Concept card shell ───────────────────────────────────────────────────────
function ConceptCard({ id, active, onToggle, tag, title, color, children }) {
  const isOpen = active === id;
  return (
    <div
      className={`rounded-2xl border transition-all duration-300 overflow-hidden
                  ${isOpen
                    ? "border-opacity-60 shadow-lg"
                    : "border-slate-700/40 hover:border-slate-600/60"}`}
      style={{ borderColor: isOpen ? `${color}60` : undefined,
               backgroundColor: isOpen ? `${color}08` : "rgb(15 23 42 / 0.4)" }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => onToggle(isOpen ? null : id)}
        className="w-full flex items-center justify-between px-6 py-5 text-left"
      >
        <div className="flex items-center gap-4">
          <span
            className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${color}20`, color }}
          >
            {tag}
          </span>
          <span className="text-white font-bold text-base">{title}</span>
        </div>
        <span
          className={`text-lg transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}
          style={{ color }}
        >
          +
        </span>
      </button>

      {/* Body — slides open */}
      {isOpen && (
        <div className="px-6 pb-6 space-y-5 border-t border-slate-700/30 pt-5">
          {children}
        </div>
      )}
    </div>
  );
}

// ── "How the app uses it" callout ────────────────────────────────────────────
function AppUsage({ children }) {
  return (
    <div className="bg-blue-500/8 border border-blue-500/20 rounded-xl px-4 py-3 flex gap-3">
      <span className="text-blue-400 text-sm shrink-0">⚡</span>
      <p className="text-blue-300/80 text-xs leading-relaxed">{children}</p>
    </div>
  );
}

// ── Plain english block ──────────────────────────────────────────────────────
function Plain({ children }) {
  return <p className="text-slate-400 text-sm leading-relaxed">{children}</p>;
}

// ── Section label ────────────────────────────────────────────────────────────
function ChartLabel({ children }) {
  return <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-2">{children}</p>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONCEPT CONTENT COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. SMA ──────────────────────────────────────────────────────────────────
function SMAContent() {
  const [period, setPeriod] = useState(20);

  const prices = useMemo(() => priceWalk(50, 150, 2.5), []);
  const smaVals = useMemo(() => sma(prices, period), [prices, period]);

  const chartData = prices.map((p, i) => ({
    i, price: p, sma: smaVals[i],
  }));

  return (
    <>
      <Plain>
        A Simple Moving Average smooths out price noise by averaging the last N closing prices.
        When the current price is <em className="text-white">above</em> the SMA, the stock is in an
        uptrend. Below it — downtrend. The longer the period, the smoother (and slower) the line.
      </Plain>

      {/* Interactive period slider */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <ChartLabel>SMA period: {period} bars</ChartLabel>
          <span className="text-slate-500 text-[10px]">Drag to adjust</span>
        </div>
        <input
          type="range" min={5} max={40} value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
          className="w-full accent-amber-400 mb-4"
        />
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis domain={["auto","auto"]} hide />
              <Tooltip content={<MiniTooltip unit="$" />} />
              <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={1.5} dot={false} name="Price" isAnimationActive={false} />
              <Line type="monotone" dataKey="sma"   stroke="#f59e0b" strokeWidth={2}   dot={false} name={`SMA ${period}`} isAnimationActive={false} strokeDasharray="5 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 justify-center text-[10px] font-bold mt-1">
          <span className="flex items-center gap-1 text-blue-400"><div className="w-3 h-0.5 bg-blue-400 rounded" /> Price</span>
          <span className="flex items-center gap-1 text-amber-400"><div className="w-3 h-0.5 bg-amber-400 rounded" /> SMA {period}</span>
        </div>
        <p className="text-slate-600 text-[10px] text-center mt-1">
          Notice how a longer period creates a smoother, slower-reacting line.
        </p>
      </div>

      <AppUsage>
        The app calculates SMA-20 (20 hourly bars ≈ ~1 trading day).
        It uses the price-vs-SMA ratio as one of the 8 features fed into the XGBoost model,
        and displays the SMA line on the prediction chart so you can see the trend visually.
      </AppUsage>
    </>
  );
}

// ── 2. RSI ──────────────────────────────────────────────────────────────────
function RSIContent() {
  // Build a price series that dips into oversold then spikes into overbought
  const prices = useMemo(() => {
    const base = priceWalk(20, 150, 1.5);
    // Force a sharp drop then sharp rise for illustration
    for (let i = 20; i < 30; i++) base.push(base[i-1] - 2.5);
    for (let i = 30; i < 50; i++) base.push(base[i-1] + 3);
    return base;
  }, []);

  const rsiVals = useMemo(() => rsi(prices, 14), [prices]);

  const priceData = prices.map((p, i) => ({ i, price: p }));
  const rsiData   = rsiVals.map((r, i) => ({ i, rsi: r }));

  return (
    <>
      <Plain>
        RSI (Relative Strength Index) measures how fast and how much price has moved recently,
        on a scale of 0–100. Above 70 means the stock has risen too fast and may reverse
        downward (<em className="text-rose-400">overbought</em>). Below 30 means it has fallen
        too fast and may bounce upward (<em className="text-emerald-400">oversold</em>).
        The middle zone (30–70) is considered neutral momentum.
      </Plain>

      <div>
        <ChartLabel>Price movement that drives RSI</ChartLabel>
        <div className="h-28 mb-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={priceData}>
              <YAxis domain={["auto","auto"]} hide />
              <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <ChartLabel>RSI — watch it cross 30 and 70</ChartLabel>
        <div className="h-36">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rsiData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis domain={[0, 100]} ticks={[0,30,50,70,100]} tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<MiniTooltip />} />
              {/* Overbought zone */}
              <Area type="monotone" dataKey="rsi" stroke="none"
                fill="url(#rsiGrad)" isAnimationActive={false} />
              <defs>
                <linearGradient id="rsiGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#f43f5e" stopOpacity={0.15} />
                  <stop offset="30%"  stopColor="#f43f5e" stopOpacity={0.05} />
                  <stop offset="70%"  stopColor="#10b981" stopOpacity={0.05} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <ReferenceLine y={70} stroke="#f43f5e" strokeDasharray="4 3" strokeWidth={1}
                label={{ value: "70 Overbought", position: "right", fill: "#f43f5e", fontSize: 9 }} />
              <ReferenceLine y={30} stroke="#10b981" strokeDasharray="4 3" strokeWidth={1}
                label={{ value: "30 Oversold", position: "right", fill: "#10b981", fontSize: 9 }} />
              <ReferenceLine y={50} stroke="#475569" strokeDasharray="2 4" strokeWidth={1} />
              <Line type="monotone" dataKey="rsi" stroke="#a78bfa" strokeWidth={2} dot={false} name="RSI" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-slate-600 text-[10px] text-center mt-1">
          The sharp drop pushed RSI into oversold territory — the sharp rise pushed it overbought.
        </p>
      </div>

      <AppUsage>
        The app uses RSI-14 (14-period) as a direct model feature. It also displays
        the current RSI on the prediction page with an OVERBOUGHT / OVERSOLD / NEUTRAL label
        and a colored progress bar so you can read it instantly.
      </AppUsage>
    </>
  );
}

// ── 3. ATR ──────────────────────────────────────────────────────────────────
function ATRContent() {
  const rawAtr = useMemo(() => atrData(50, 2), []);
  const atrSmoothed = sma(rawAtr, 14).map((v, i) => ({ i, atr: v, raw: rawAtr[i] }));

  return (
    <>
      <Plain>
        ATR (Average True Range) measures how much a stock typically moves per bar —
        its volatility. A high ATR means large swings (risky, but more opportunity).
        A low ATR means calm, slow-moving price action. ATR doesn't tell you direction —
        only intensity. Think of it as the "energy level" of a stock.
      </Plain>

      <div>
        <ChartLabel>ATR over time — spikes = high volatility periods</ChartLabel>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={atrSmoothed}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis domain={[0, "auto"]} tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip content={<MiniTooltip unit="" />} />
              <defs>
                <linearGradient id="atrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="atr" stroke="#f59e0b" strokeWidth={2}
                fill="url(#atrGrad)" name="ATR-14" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-slate-600 text-[10px] text-center mt-1">
          ATR-14 smooths the raw range — peaks correspond to news events, earnings, market shocks.
        </p>
      </div>

      <AppUsage>
        The app uses ATR-14 as a volatility feature for XGBoost. High-volatility periods tend
        to have different momentum patterns than calm ones — the model can learn this distinction
        and adjust its confidence accordingly.
      </AppUsage>
    </>
  );
}

// ── 4. Bollinger Bands ───────────────────────────────────────────────────────
function BollingerContent() {
  const [mult, setMult] = useState(2);
  const prices = useMemo(() => priceWalk(50, 150, 2), []);
  const bands  = useMemo(() => bollinger(prices, 20, mult), [prices, mult]);

  const chartData = prices.map((p, i) => ({
    i, price: p,
    upper: bands[i].upper,
    lower: bands[i].lower,
    mid:   bands[i].mid,
  }));

  return (
    <>
      <Plain>
        Bollinger Bands draw a channel around price using the moving average ± a multiple
        of standard deviation. When price touches the <em className="text-rose-400">upper band</em>,
        it's statistically extended — likely to pull back. At the{" "}
        <em className="text-emerald-400">lower band</em>, it may bounce. The bands also
        squeeze during low volatility, which often precedes a breakout move.
      </Plain>

      <div>
        <div className="flex justify-between items-center mb-2">
          <ChartLabel>Band width multiplier: {mult}×</ChartLabel>
          <span className="text-slate-500 text-[10px]">Wider = less sensitive</span>
        </div>
        <input
          type="range" min={1} max={3} step={0.5} value={mult}
          onChange={(e) => setMult(Number(e.target.value))}
          className="w-full accent-emerald-400 mb-4"
        />
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis domain={["auto","auto"]} tick={{ fill: "#475569", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v=>`$${v}`} />
              <Tooltip content={<MiniTooltip unit="$" />} />
              <defs>
                <linearGradient id="bbGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#10b981" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              {/* Band fill */}
              <Area type="monotone" dataKey="upper" stroke="#f43f5e40" strokeWidth={1}
                fill="url(#bbGrad)" name="Upper" isAnimationActive={false} />
              <Area type="monotone" dataKey="lower" stroke="#10b98140" strokeWidth={1}
                fill="#0f172a" name="Lower" isAnimationActive={false} />
              {/* Mid line */}
              <Line type="monotone" dataKey="mid"   stroke="#f59e0b" strokeWidth={1.5}
                strokeDasharray="5 4" dot={false} name="SMA-20" isAnimationActive={false} />
              {/* Price */}
              <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={2}
                dot={false} name="Price" isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-slate-600 text-[10px] text-center mt-1">
          Drag the slider — a wider multiplier gives more breathing room before a signal fires.
        </p>
      </div>

      <AppUsage>
        The app computes "BB position" — a number from -1 to +1 showing where price sits
        within the bands. -1 means at the lower band (oversold zone), +1 means at the upper
        band (overbought zone). This is one of the 8 features the XGBoost model uses.
      </AppUsage>
    </>
  );
}

// ── 5. XGBoost / The Model ───────────────────────────────────────────────────
function ModelContent() {
  const features = [
    { name: "SMA-20",       desc: "Is price above or below trend?",         color: "#f59e0b" },
    { name: "Price vs SMA", desc: "How far above/below, normalised",         color: "#f59e0b" },
    { name: "RSI-14",       desc: "Momentum strength 0–100",                 color: "#a78bfa" },
    { name: "ROC-5",        desc: "Rate of change over last 5 bars",         color: "#a78bfa" },
    { name: "ATR-14",       desc: "Current volatility level",                color: "#f59e0b" },
    { name: "BB Position",  desc: "Where price sits in the Bollinger band",  color: "#10b981" },
    { name: "Volume Ratio", desc: "Unusual buying/selling activity",         color: "#3b82f6" },
    { name: "Hour of Day",  desc: "Market open/close behave differently",    color: "#64748b" },
  ];

  return (
    <>
      <Plain>
        XGBoost (Extreme Gradient Boosting) is a machine learning algorithm that builds
        hundreds of small decision trees, each one correcting the errors of the previous one.
        It's widely used in quantitative finance because it handles tabular data well,
        is resistant to overfitting with proper tuning, and trains fast enough to run
        on every prediction request.
      </Plain>

      <Plain>
        The model's task is binary: will the next hourly close be{" "}
        <em className="text-emerald-400">higher</em> or{" "}
        <em className="text-rose-400">lower</em> than the current price?
        It outputs a probability — 0.75 means "75% confident the next bar goes up."
      </Plain>

      {/* Feature input list */}
      <div>
        <ChartLabel>The 8 features fed into the model</ChartLabel>
        <div className="space-y-2">
          {features.map((f, i) => (
            <div key={i} className="flex items-center gap-3 bg-slate-800/40 rounded-xl px-4 py-2.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
              <span className="font-mono text-xs font-bold text-white w-28 shrink-0">{f.name}</span>
              <span className="text-slate-500 text-xs">{f.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Decision flow diagram */}
      <div>
        <ChartLabel>How a prediction is made</ChartLabel>
        <div className="space-y-1">
          {[
            { step: "1", label: "60 days of hourly OHLCV data fetched",      color: "#3b82f6" },
            { step: "2", label: "8 technical features calculated per bar",    color: "#a78bfa" },
            { step: "3", label: "5-fold time-series cross-validation runs",   color: "#f59e0b" },
            { step: "4", label: "If accuracy ≥ 53%, model is trusted",        color: "#10b981" },
            { step: "5", label: "Model predicts probability on latest bar",   color: "#10b981" },
            { step: "6", label: "≥60% → BUY  |  ≤40% → SELL  |  else HOLD", color: "#f59e0b" },
          ].map((s) => (
            <div key={s.step} className="flex items-center gap-3">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center
                           text-[10px] font-black text-white shrink-0"
                style={{ backgroundColor: `${s.color}30`, border: `1px solid ${s.color}60`, color: s.color }}
              >
                {s.step}
              </div>
              <p className="text-slate-400 text-xs">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      <AppUsage>
        The model retrained once per day per ticker and cached to disk. On subsequent
        predictions within the same day, the saved model is loaded — making it faster
        and consistent. Every prediction is also logged to a CSV so accuracy can be
        measured over time against what actually happened.
      </AppUsage>
    </>
  );
}

// ── 6. Cross-Validation ──────────────────────────────────────────────────────
function CVContent() {
  // Illustrate a timeline split into 5 folds
  const folds = [
    { train: "Jan–Feb",    test: "Mar",     acc: 54.2 },
    { train: "Jan–Mar",    test: "Apr",     acc: 56.1 },
    { train: "Jan–Apr",    test: "May",     acc: 52.8 },
    { train: "Jan–May",    test: "Jun",     acc: 55.5 },
    { train: "Jan–Jun",    test: "Jul",     acc: 53.9 },
  ];
  const mean = (folds.reduce((a, b) => a + b.acc, 0) / folds.length).toFixed(1);

  return (
    <>
      <Plain>
        Cross-validation checks whether the model actually works on data it has never seen.
        The key word for time series is <em className="text-white">TimeSeriesSplit</em> —
        you always train on the past and test on the future. Regular random splits are
        cheating: they'd let the model train on March data and test on February data,
        which is impossible in real trading.
      </Plain>

      <div>
        <ChartLabel>5-fold time-series cross-validation — each fold tests further forward</ChartLabel>
        <div className="space-y-2">
          {folds.map((f, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-slate-600 text-[10px] w-4 shrink-0">{i+1}</span>
              <div className="flex-1 h-6 rounded-lg overflow-hidden bg-slate-800 relative flex">
                {/* Train portion */}
                <div
                  className="h-full flex items-center justify-center text-[9px] font-bold text-blue-300"
                  style={{ width: `${(i + 1) * 14 + 20}%`, backgroundColor: "#1d4ed820" }}
                >
                  {f.train}
                </div>
                {/* Test portion */}
                <div
                  className="h-full flex items-center justify-center text-[9px] font-bold text-emerald-300"
                  style={{ width: "16%", backgroundColor: "#065f4620" }}
                >
                  {f.test}
                </div>
              </div>
              <span className={`text-xs font-bold w-12 text-right ${
                f.acc >= 53 ? "text-emerald-400" : "text-rose-400"
              }`}>{f.acc}%</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center mt-3 px-7">
          <div className="flex gap-3 text-[10px]">
            <span className="flex items-center gap-1 text-blue-400"><div className="w-2 h-2 rounded bg-blue-400/30" /> Train</span>
            <span className="flex items-center gap-1 text-emerald-400"><div className="w-2 h-2 rounded bg-emerald-400/30" /> Test</span>
          </div>
          <p className="text-slate-400 text-xs font-bold">
            Mean accuracy: <span className={parseFloat(mean) >= 53 ? "text-emerald-400" : "text-rose-400"}>{mean}%</span>
          </p>
        </div>
        <p className="text-slate-600 text-[10px] text-center mt-2">
          If mean accuracy falls below 53%, the app outputs NO_EDGE instead of BUY/SELL.
        </p>
      </div>

      <AppUsage>
        The "Backtest Accuracy" number shown on every prediction card is exactly this:
        the mean accuracy across 5 time-series folds, calculated fresh each time.
        It tells you whether the model earned its signal on this specific stock today —
        not just in theory.
      </AppUsage>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE
// ═══════════════════════════════════════════════════════════════════════════════

const CONCEPTS = [
  {
    id: "sma",
    tag: "Trend",
    title: "Simple Moving Average (SMA)",
    color: "#f59e0b",
    Content: SMAContent,
  },
  {
    id: "rsi",
    tag: "Momentum",
    title: "Relative Strength Index (RSI)",
    color: "#a78bfa",
    Content: RSIContent,
  },
  {
    id: "atr",
    tag: "Volatility",
    title: "Average True Range (ATR)",
    color: "#f59e0b",
    Content: ATRContent,
  },
  {
    id: "bb",
    tag: "Volatility",
    title: "Bollinger Bands",
    color: "#10b981",
    Content: BollingerContent,
  },
  {
    id: "model",
    tag: "AI",
    title: "XGBoost — The Prediction Model",
    color: "#3b82f6",
    Content: ModelContent,
  },
  {
    id: "cv",
    tag: "Validation",
    title: "Cross-Validation & Backtest Accuracy",
    color: "#10b981",
    Content: CVContent,
  },
];

export default function EducationPage() {
  const [active, setActive] = useState(null);

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">

        {/* Header */}
        <div className="mb-8">
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Market School</h2>
          <p className="text-slate-500 text-sm mt-1 max-w-lg">
            Every indicator and concept used in this app — explained with live interactive charts.
            Click any topic to expand it.
          </p>
        </div>

        {/* Progress hint */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex gap-1">
            {CONCEPTS.map((c) => (
              <div
                key={c.id}
                className="w-1.5 h-1.5 rounded-full transition-all"
                style={{ backgroundColor: active === c.id ? c.color : "#334155" }}
              />
            ))}
          </div>
          <span className="text-slate-600 text-[10px]">
            {active ? `${CONCEPTS.findIndex(c => c.id === active) + 1} of ${CONCEPTS.length}` : `${CONCEPTS.length} topics`}
          </span>
        </div>

        {/* Concept cards */}
        <div className="space-y-3">
          {CONCEPTS.map((c) => (
            <ConceptCard
              key={c.id}
              id={c.id}
              active={active}
              onToggle={setActive}
              tag={c.tag}
              title={c.title}
              color={c.color}
            >
              <c.Content />
            </ConceptCard>
          ))}
        </div>

        {/* Footer */}
        <p className="text-slate-700 text-[11px] text-center mt-8">
          Charts above use generated demo data for illustration only.
          Real predictions use 60 days of live hourly market data.
        </p>
      </div>
    </div>
  );
}
