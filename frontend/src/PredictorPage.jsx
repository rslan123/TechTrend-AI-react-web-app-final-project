/**
 * PredictorPage.jsx
 * -----------------
 * Main AI prediction page. Self-contained except for:
 *   - sp500tickers.js  (ticker list for autocomplete)
 *
 * Chart uses ComposedChart (Area + Line) for the gradient fill under price.
 * Verdict colors the price line: green=BUY, red=SELL, blue=HOLD/NO_EDGE.
 */

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { SP500_TICKERS } from "./sp500tickers";

// ─── Quick-access tickers shown as pills above the search box ───────────────
const TRENDING = ["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "META", "AMZN"];

// ─── Verdict → color map (used for line stroke + badge) ────────────────────
const VERDICT_COLOR = {
  BUY: {
    line: "#10b981",
    badge: "bg-emerald-500/10 border-emerald-500/40 text-emerald-400",
  },
  SELL: {
    line: "#f43f5e",
    badge: "bg-rose-500/10    border-rose-500/40    text-rose-400",
  },
  HOLD: {
    line: "#f59e0b",
    badge: "bg-amber-500/10   border-amber-500/40   text-amber-400",
  },
  NO_EDGE: {
    line: "#3b82f6",
    badge: "bg-slate-700/40   border-slate-600/50   text-slate-400",
  },
};

// ─── RSI bar color ──────────────────────────────────────────────────────────
function rsiColor(rsi) {
  if (rsi > 70) return "bg-rose-500";
  if (rsi < 30) return "bg-emerald-500";
  return "bg-blue-500";
}

// ─── Custom chart tooltip ───────────────────────────────────────────────────
function ChartTooltip({ active, payload, verdictColor }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-slate-900 border border-slate-700 px-4 py-3 rounded-xl shadow-2xl min-w-[140px]">
      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-2">
        {d?.label}
      </p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.stroke || p.color }}>
          {p.dataKey === "price" ? "Price" : "SMA-20"}: ${p.value?.toFixed(2)}
        </p>
      ))}
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function PredictorPage() {
  const [ticker, setTicker] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const suggestRef = useRef(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (
        !suggestRef.current?.contains(e.target) &&
        !inputRef.current?.contains(e.target)
      ) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Autocomplete input handler ──────────────────────────────────────────
  const handleInput = (val) => {
    const upper = val.toUpperCase();
    setTicker(upper);
    if (upper.length === 0) {
      setSuggestions([]);
      return;
    }
    const matches = SP500_TICKERS.filter(
      (t) => t.symbol.startsWith(upper) || t.name.toUpperCase().includes(upper),
    ).slice(0, 7);
    setSuggestions(matches);
  };

  const selectSuggestion = (symbol) => {
    setTicker(symbol);
    setSuggestions([]);
    runPrediction(symbol);
  };

  // ── API call ─────────────────────────────────────────────────────────────
  const runPrediction = async (target) => {
    const t = (target || ticker).trim().toUpperCase();
    if (!t) return;
    setLoading(true);
    setError(null);
    setData(null);
    setSuggestions([]);
    try {
      const res = await axios.get(
        `https://techtrend-ai-react-web-app-final-project.onrender.com/api/predict/${t}`,
      );
      const rawData = res.data.raw || res.data;
      if (!rawData || typeof rawData !== "string")
        throw new Error("Bad response format");

      const parts = rawData.split("|");

      if (parts[0] === "ERROR") {
        setError(parts[1] || "Server error");
        return;
      }

      if (parts[0] === "RESULT") {
        // Index map:
        // [0]RESULT [1]TICKER [2]PRICE [3]VERDICT [4]CONF% [5]CV_ACC%
        // [6]TIMES  [7]PRICES [8]SMAS  [9]RSI
        const times = parts[6].split(",");
        const prices = parts[7].split(",");
        const smas = parts[8].split(",");

        setData({
          ticker: parts[1],
          price: parts[2],
          verdict: parts[3],
          confidence: parts[4],
          cv_accuracy: parts[5],
          rsi: parseFloat(parts[9]),
          history: prices.map((v, i) => ({
            label: times[i] ?? "",
            price: parseFloat(v),
            sma: parseFloat(smas[i]),
          })),
        });
      }
    } catch (err) {
      setError(err.message || "Could not reach server");
    } finally {
      setLoading(false);
    }
  };

  const addToWatchlist = async () => {
    try {
      await axios.post(
        "https://techtrend-ai-react-web-app-final-project.onrender.com/api/watchlist",
        {
          ticker: data.ticker,
          price: data.price,
          verdict: data.verdict,
        },
      );
      alert(`⭐ ${data.ticker} added to watchlist!`);
    } catch {
      alert("Error saving to watchlist.");
    }
  };

  // ── Derived display values ───────────────────────────────────────────────
  const verdict = data?.verdict ?? "HOLD";
  const colors = VERDICT_COLOR[verdict] ?? VERDICT_COLOR.HOLD;
  const lineColor = colors.line;
  const gradientId = `priceGrad-${verdict}`;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">
        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            AI Predictor
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            Hourly direction model · S&P 500 coverage · XGBoost +
            cross-validation
          </p>
        </div>

        {/* Trending pills */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {TRENDING.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTicker(t);
                runPrediction(t);
              }}
              className="bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white
                         text-xs font-bold px-4 py-2 rounded-full border border-slate-700
                         transition-all"
            >
              {t}
            </button>
          ))}
        </div>

        {/* Search input + autocomplete */}
        <div className="relative mb-8">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-2xl
                           px-6 py-4 outline-none focus:ring-2 focus:ring-blue-500
                           transition-all text-lg font-mono"
                placeholder="Search ticker or company (e.g. TSLA, Apple)..."
                value={ticker}
                onChange={(e) => handleInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSuggestions([]);
                    runPrediction();
                  }
                  if (e.key === "Escape") setSuggestions([]);
                }}
              />
              {/* Dropdown */}
              {suggestions.length > 0 && (
                <div
                  ref={suggestRef}
                  className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border
                             border-slate-700 rounded-2xl overflow-hidden shadow-2xl z-50"
                >
                  {suggestions.map((s) => (
                    <button
                      key={s.symbol}
                      onMouseDown={() => selectSuggestion(s.symbol)}
                      className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-700
                                 transition-colors text-left"
                    >
                      <span className="font-mono font-bold text-white text-sm w-14 shrink-0">
                        {s.symbol}
                      </span>
                      <span className="text-slate-400 text-sm truncate">
                        {s.name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => runPrediction()}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white
                         font-bold px-8 py-4 rounded-2xl transition-all shadow-lg
                         shadow-blue-900/30 whitespace-nowrap"
            >
              {loading ? "Analysing…" : "Predict"}
            </button>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div
            className="bg-rose-500/10 border border-rose-500/40 text-rose-400
                          rounded-2xl px-5 py-4 mb-6 text-sm font-mono"
          >
            ⚠ {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-slate-800 rounded-2xl" />
              ))}
            </div>
            <div className="h-80 bg-slate-800 rounded-3xl" />
          </div>
        )}

        {/* Results */}
        {data && !loading && (
          <div className="space-y-6">
            {/* ── Stat cards ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Price */}
              <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                  Current Price
                </p>
                <p className="text-2xl font-mono font-bold text-white">
                  ${data.price}
                </p>
              </div>

              {/* Verdict */}
              <div className={`p-5 rounded-2xl border ${colors.badge}`}>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                  AI Verdict
                </p>
                <p className="text-2xl font-black" style={{ color: lineColor }}>
                  {verdict.replace("_", " ")}
                </p>
                {verdict === "NO_EDGE" && (
                  <p className="text-slate-500 text-[10px] mt-1">
                    Model accuracy below threshold
                  </p>
                )}
              </div>

              {/* AI Confidence */}
              <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                  AI Confidence
                </p>
                <p className="text-2xl font-bold text-blue-400">
                  {data.confidence === "N/A" ? "—" : data.confidence}
                </p>
                <p className="text-slate-600 text-[10px] mt-1">
                  Probability of UP move
                </p>
              </div>

              {/* Backtest Accuracy */}
              <div className="bg-slate-800/40 p-5 rounded-2xl border border-slate-700/50">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                  Backtest Accuracy
                </p>
                <p className="text-2xl font-bold text-indigo-400">
                  {data.cv_accuracy}
                </p>
                <p className="text-slate-600 text-[10px] mt-1">
                  Cross-validated · 5-fold
                </p>
              </div>
            </div>

            {/* ── Chart ──────────────────────────────────────────────── */}
            <div className="bg-slate-950/60 rounded-3xl border border-slate-800 p-5 md:p-6">
              <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
                <div>
                  <h3 className="text-white font-bold text-base">
                    {data.ticker} — Price vs SMA-20
                  </h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Last 20 hourly bars
                  </p>
                </div>
                <div className="flex gap-4 text-[10px] font-bold uppercase tracking-wider">
                  <span
                    className="flex items-center gap-1.5"
                    style={{ color: lineColor }}
                  >
                    <div
                      className="w-3 h-0.5 rounded"
                      style={{ backgroundColor: lineColor }}
                    ></div>
                    Price
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-500">
                    <div className="w-3 h-0.5 bg-amber-500 border-dashed rounded"></div>
                    SMA-20
                  </span>
                </div>
              </div>

              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.history}
                    margin={{ left: 10, right: 10, top: 5, bottom: 20 }}
                  >
                    <defs>
                      <linearGradient
                        id={gradientId}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={lineColor}
                          stopOpacity={0.18}
                        />
                        <stop
                          offset="95%"
                          stopColor={lineColor}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>

                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#1e293b"
                      vertical={false}
                    />

                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#475569", fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval={4}
                      angle={-25}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis
                      domain={["auto", "auto"]}
                      tick={{ fill: "#475569", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                      width={65}
                    />

                    <Tooltip
                      content={<ChartTooltip verdictColor={lineColor} />}
                    />

                    {/* Gradient area fill */}
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="none"
                      fill={`url(#${gradientId})`}
                      isAnimationActive={false}
                    />

                    {/* Price line — colored by verdict */}
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke={lineColor}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                      isAnimationActive={false}
                    />

                    {/* SMA-20 dashed line */}
                    <Line
                      type="monotone"
                      dataKey="sma"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* ── Indicators row ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* RSI */}
              <div className="bg-slate-800/30 p-5 rounded-2xl border border-slate-700/50">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                  RSI · Relative Strength
                </p>
                <div className="flex items-baseline gap-2">
                  <p className="text-2xl font-mono font-bold text-white">
                    {data.rsi.toFixed(1)}
                  </p>
                  <p
                    className={`text-[10px] font-bold ${
                      data.rsi > 70
                        ? "text-rose-400"
                        : data.rsi < 30
                          ? "text-emerald-400"
                          : "text-slate-500"
                    }`}
                  >
                    {data.rsi > 70
                      ? "OVERBOUGHT"
                      : data.rsi < 30
                        ? "OVERSOLD"
                        : "NEUTRAL"}
                  </p>
                </div>
                <div className="w-full bg-slate-900 h-1.5 rounded-full mt-3 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-700 ${rsiColor(data.rsi)}`}
                    style={{ width: `${Math.min(data.rsi, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                  <span>0 Oversold</span>
                  <span>70+ Overbought</span>
                </div>
              </div>

              {/* Market phase */}
              <div className="bg-slate-800/30 p-5 rounded-2xl border border-slate-700/50">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                  Market Phase
                </p>
                {(() => {
                  const lastSma = data.history.at(-1)?.sma;
                  const above = parseFloat(data.price) > lastSma;
                  return (
                    <>
                      <div className="flex items-center gap-2 mt-1">
                        <div
                          className={`w-2.5 h-2.5 rounded-full ${above ? "bg-emerald-400" : "bg-rose-400"}`}
                        />
                        <p className="text-xl font-bold text-white">
                          {above ? "Bullish Trend" : "Bearish Trend"}
                        </p>
                      </div>
                      <p className="text-slate-500 text-xs mt-2">
                        Price is {above ? "above" : "below"} 20-period moving
                        average
                      </p>
                    </>
                  );
                })()}
              </div>

              {/* Signal summary */}
              <div className="bg-slate-800/30 p-5 rounded-2xl border border-slate-700/50">
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                  Signal Summary
                </p>
                <div className="space-y-2 mt-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Ticker</span>
                    <span className="text-white font-mono font-bold">
                      {data.ticker}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Direction</span>
                    <span className="font-bold" style={{ color: lineColor }}>
                      {verdict}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Confidence</span>
                    <span className="text-white">
                      {data.confidence === "N/A" ? "—" : data.confidence}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Backtest acc.</span>
                    <span className="text-white">{data.cv_accuracy}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Disclaimer + watchlist ──────────────────────────────── */}
            <div
              className="flex flex-col sm:flex-row items-center justify-between
                            gap-4 pt-2 border-t border-slate-800"
            >
              <p className="text-slate-600 text-[11px] max-w-md">
                For educational purposes only. Not financial advice. Predictions
                are based on technical indicators and carry no guarantee.
              </p>
              <button
                onClick={addToWatchlist}
                className="bg-slate-800 hover:bg-blue-600 text-white font-bold px-8 py-3
                           rounded-2xl border border-slate-700 transition-all flex items-center
                           gap-2 shadow-lg hover:shadow-blue-900/40 active:scale-95 whitespace-nowrap"
              >
                <span></span> Add to Watchlist
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
