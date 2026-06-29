/**
 * PredictorPage.jsx  — TechTrendAI
 * ----------------------------------
 * Multi-horizon AI prediction page.
 * Depends on:  sp500tickers.js  (same import as before, unchanged)
 *
 * API format (12 pipe-delimited fields):
 * RESULT | TICKER | PRICE | VERDICT | CONF% | CV_ACC% |
 * TIMES  | PRICES | SMAS  | RSI     | HORIZON | LABEL
 *  [0]     [1]     [2]     [3]       [4]      [5]
 *  [6]     [7]     [8]     [9]       [10]     [11]
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
  ReferenceLine,
} from "recharts";
import { SP500_TICKERS } from "./sp500tickers";

// ─── Constants ───────────────────────────────────────────────────────────────

const API_BASE = "https://stockpredict-api-rslan.azurewebsites.net";

const TRENDING = ["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "META", "AMZN"];

// Horizon options — keys must match predictor.py HORIZONS dict
const HORIZONS = [
  { key: "1h", label: "1 Hour", desc: "Next hourly bar" },
  { key: "1d", label: "1 Day", desc: "Next trading day" },
  { key: "1wk", label: "1 Week", desc: "Next 5 trading days" },
  { key: "1mo", label: "1 Month", desc: "Next ~21 days" },
  { key: "6mo", label: "6 Months", desc: "Next ~26 weeks" },
  { key: "1y", label: "1 Year", desc: "Next ~52 weeks" },
];

const VERDICT_STYLE = {
  BUY: {
    line: "#10b981",
    glow: "#10b98133",
    badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    pill: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    label: "BUY",
  },
  SELL: {
    line: "#f43f5e",
    glow: "#f43f5e33",
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    pill: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    label: "SELL",
  },
  HOLD: {
    line: "#f59e0b",
    glow: "#f59e0b33",
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    pill: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    label: "HOLD",
  },
  NO_EDGE: {
    line: "#64748b",
    glow: "#64748b22",
    badge: "border-slate-600/50 bg-slate-700/30 text-slate-400",
    pill: "bg-slate-700/40 text-slate-400 border-slate-600/30",
    label: "NO EDGE",
  },
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div
      className="bg-slate-900 border border-slate-700/80 px-3 py-2.5
                    rounded-xl shadow-2xl text-xs min-w-[148px]"
    >
      <p className="text-slate-500 font-bold uppercase tracking-wider mb-2 text-[10px]">
        {d?.label}
      </p>
      {payload.map((p, i) => (
        <div key={i} className="flex justify-between gap-4 leading-5">
          <span className="text-slate-500">
            {p.dataKey === "price" ? "Price" : "SMA-20"}
          </span>
          <span
            style={{ color: p.stroke || p.color }}
            className="font-mono font-bold"
          >
            ${Number(p.value).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div
      className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5
                    flex flex-col gap-1"
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <p
        className="text-2xl font-bold font-mono leading-tight"
        style={accent ? { color: accent } : { color: "#fff" }}
      >
        {value}
      </p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  );
}

// Skeleton card used during loading
function SkeletonCard() {
  return (
    <div
      className="bg-slate-800/40 border border-slate-700/30 rounded-2xl
                    h-24 animate-pulse"
    />
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function PredictorPage() {
  const [ticker, setTicker] = useState("");
  const [horizon, setHorizon] = useState("1h");
  const [suggestions, setSuggestions] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [watchlisted, setWatchlisted] = useState(false);

  const inputRef = useRef(null);
  const suggestRef = useRef(null);
  const abortRef = useRef(null); // AbortController for in-flight request
  const debounceRef = useRef(null); // debounce timer for horizon clicks

  // Close autocomplete on outside click
  useEffect(() => {
    const close = (e) => {
      if (
        !suggestRef.current?.contains(e.target) &&
        !inputRef.current?.contains(e.target)
      )
        setSuggestions([]);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  // Reset watchlisted badge when ticker changes
  useEffect(() => {
    setWatchlisted(false);
  }, [ticker]);

  // ── Autocomplete ──────────────────────────────────────────────────────────
  const handleInput = (val) => {
    const upper = val.toUpperCase();
    setTicker(upper);
    setData(null);
    setError(null);
    if (!upper) {
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
    runPrediction(symbol, horizon);
  };

  // ── API call — with abort controller to cancel stale requests ───────────
  const runPrediction = async (targetTicker, targetHorizon) => {
    const t = (targetTicker ?? ticker).trim().toUpperCase();
    const h = targetHorizon ?? horizon;
    if (!t) return;

    // Cancel any in-flight request immediately
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setData(null);
    setSuggestions([]);

    try {
      const res = await axios.get(`${API_BASE}/api/predict/${t}/${h}`, {
        signal: controller.signal,
      });
      const raw = res.data?.raw ?? res.data;

      if (!raw || typeof raw !== "string")
        throw new Error("Unexpected response format");

      const parts = raw.split("|");

      if (parts[0] === "ERROR") {
        setError(parts[1] || "Server error");
        return;
      }

      if (parts[0] !== "RESULT") {
        setError("Unrecognised response from server");
        return;
      }

      // Parse pipe fields
      // [0]RESULT [1]TICKER [2]PRICE [3]VERDICT [4]CONF% [5]CV_ACC%
      // [6]TIMES  [7]PRICES [8]SMAS  [9]RSI     [10]HORIZON [11]LABEL
      const times = (parts[6] ?? "").split(",");
      const prices = (parts[7] ?? "").split(",");
      const smas = (parts[8] ?? "").split(",");

      setData({
        ticker: parts[1] ?? t,
        price: parts[2] ?? "—",
        verdict: parts[3] ?? "HOLD",
        confidence: parts[4] ?? "N/A",
        cv_accuracy: parts[5] ?? "—",
        rsi: parseFloat(parts[9] ?? 50),
        horizon: parts[10] ?? h,
        horizonLabel:
          parts[11] ?? HORIZONS.find((x) => x.key === h)?.label ?? h,
        history: prices
          .map((v, i) => ({
            label: times[i] ?? "",
            price: parseFloat(v),
            sma: parseFloat(smas[i] ?? 0),
          }))
          .filter((d) => !isNaN(d.price)),
      });
    } catch (err) {
      // Ignore cancellation — a newer request already took over
      if (
        axios.isCancel(err) ||
        err?.name === "CanceledError" ||
        err?.code === "ERR_CANCELED"
      ) {
        return;
      }
      setError(
        err.response?.status === 400
          ? `Invalid horizon. Valid options: ${HORIZONS.map((h) => h.key).join(", ")}`
          : (err.message ?? "Could not reach server"),
      );
    } finally {
      // Only clear loading if this request wasn't cancelled
      if (abortRef.current === controller) {
        setLoading(false);
      }
    }
  };

  // Horizon change — debounced 300ms so rapid clicks only fire once
  const handleHorizonChange = (key) => {
    setHorizon(key);
    if (!ticker && !data?.ticker) return;

    // Clear any pending debounce timer
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      runPrediction(data?.ticker ?? ticker, key);
    }, 300);
  };

  // ── Watchlist ─────────────────────────────────────────────────────────────
  const addToWatchlist = async () => {
    if (!data) return;
    try {
      await axios.post(`${API_BASE}/api/watchlist`, {
        ticker: data.ticker,
        price: data.price,
        verdict: data.verdict,
      });
      setWatchlisted(true);
    } catch {
      alert("Could not save to watchlist. Please try again.");
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  const verdict = data?.verdict ?? "HOLD";
  const vs = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.HOLD;
  const gradId = `grad-${verdict}`;
  const priceFloat = parseFloat(data?.price ?? 0);
  const lastSma = data?.history?.at(-1)?.sma ?? 0;
  const bullish = priceFloat > lastSma;

  const horizonInfo = HORIZONS.find(
    (h) => h.key === (data?.horizon ?? horizon),
  );

  // Dynamic X-axis interval — always show ~8 labels regardless of bar count
  const xInterval = data?.history?.length
    ? Math.max(0, Math.floor(data.history.length / 8) - 1)
    : 4;

  // Y-axis domain with slight padding so lines don't touch the edges
  const allPrices = data?.history?.map((d) => d.price) ?? [];
  const allSmas = data?.history?.map((d) => d.sma).filter(Boolean) ?? [];
  const allY = [...allPrices, ...allSmas];
  const yMin = allY.length ? Math.min(...allY) * 0.998 : "auto";
  const yMax = allY.length ? Math.max(...allY) * 1.002 : "auto";

  // ── RSI helpers ───────────────────────────────────────────────────────────
  const rsi = data?.rsi ?? 50;
  const rsiLabel = rsi > 70 ? "OVERBOUGHT" : rsi < 30 ? "OVERSOLD" : "NEUTRAL";
  const rsiColor = rsi > 70 ? "#f43f5e" : rsi < 30 ? "#10b981" : "#3b82f6";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
      <div
        className="bg-slate-900 border border-slate-800 rounded-3xl
                      p-6 md:p-8 shadow-2xl space-y-6"
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight">
            AI Predictor
          </h2>
          <p className="text-slate-500 text-sm mt-1">
            XGBoost · TimeSeriesSplit CV · NO_EDGE confidence gate · S&P 500
          </p>
        </div>

        {/* ── Trending pills ──────────────────────────────────────────── */}
        <div className="flex gap-2 flex-wrap">
          {TRENDING.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTicker(t);
                runPrediction(t, horizon);
              }}
              className={`text-xs font-bold px-4 py-2 rounded-full border transition-all
                ${
                  data?.ticker === t
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-blue-600/20 hover:border-blue-500/50 hover:text-white"
                }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ── Search + horizon ────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* Search row */}
          <div className="relative flex gap-3">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-slate-800 border border-slate-700 text-white
                           rounded-2xl px-5 py-4 outline-none focus:ring-2
                           focus:ring-blue-500/60 text-base font-mono transition-all
                           placeholder:text-slate-600"
                placeholder="Ticker or company name (e.g. AAPL, Apple)…"
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
              {/* Autocomplete dropdown */}
              {suggestions.length > 0 && (
                <div
                  ref={suggestRef}
                  className="absolute top-full left-0 right-0 mt-2 bg-slate-800
                             border border-slate-700 rounded-2xl overflow-hidden
                             shadow-2xl z-50"
                >
                  {suggestions.map((s) => (
                    <button
                      key={s.symbol}
                      onMouseDown={() => selectSuggestion(s.symbol)}
                      className="w-full flex items-center gap-4 px-5 py-3
                                 hover:bg-slate-700/80 transition-colors text-left"
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
              disabled={loading || !ticker}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                         disabled:cursor-not-allowed text-white font-bold px-8
                         py-4 rounded-2xl transition-all shadow-lg
                         shadow-blue-900/30 whitespace-nowrap active:scale-95"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg
                    className="animate-spin w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8z"
                    />
                  </svg>
                  Analysing
                </span>
              ) : (
                "Predict"
              )}
            </button>
          </div>

          {/* Horizon selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-600 text-xs font-bold uppercase tracking-wider shrink-0">
              Horizon
            </span>
            {HORIZONS.map((h) => (
              <button
                key={h.key}
                onClick={() => handleHorizonChange(h.key)}
                disabled={loading}
                title={h.desc}
                className={`text-xs font-bold px-4 py-1.5 rounded-full border
                            transition-all disabled:cursor-wait
                  ${
                    horizon === h.key && loading
                      ? "bg-blue-700 border-blue-600 text-white opacity-70"
                      : horizon === h.key
                        ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/30"
                        : "bg-slate-800/60 border-slate-700 text-slate-400 hover:border-blue-500/50 hover:text-slate-200 disabled:opacity-40"
                  }`}
              >
                {h.label}
                {horizon === h.key && loading && (
                  <span
                    className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full
                                   bg-blue-300 animate-pulse align-middle"
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Error banner ─────────────────────────────────────────────── */}
        {error && (
          <div
            className="bg-rose-500/10 border border-rose-500/30 text-rose-400
                          rounded-2xl px-5 py-4 text-sm font-mono flex items-start gap-3"
          >
            <span className="text-rose-500 mt-0.5 shrink-0">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Loading skeleton ─────────────────────────────────────────── */}
        {loading && (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
            <div className="h-80 bg-slate-800/40 rounded-3xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          </div>
        )}

        {/* ── Results ──────────────────────────────────────────────────── */}
        {data && !loading && (
          <div className="space-y-5">
            {/* Horizon context banner */}
            <div
              className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/50
                            border border-slate-700/40 rounded-xl"
            >
              <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <p className="text-slate-400 text-xs">
                Predicting direction for{" "}
                <span className="text-white font-bold">{data.ticker}</span> over
                the{" "}
                <span className="text-white font-bold">
                  {data.horizonLabel}
                </span>{" "}
                — using {horizonInfo?.desc ?? data.horizon} as the target window
              </p>
            </div>

            {/* ── Stat cards ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Price */}
              <StatCard label="Current Price" value={`$${data.price}`} />

              {/* Verdict */}
              <div
                className={`border rounded-2xl p-5 flex flex-col gap-1 ${vs.badge}`}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  AI Verdict · {data.horizonLabel}
                </p>
                <p
                  className="text-2xl font-black leading-tight"
                  style={{ color: vs.line }}
                >
                  {vs.label}
                </p>
                {verdict === "NO_EDGE" && (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    CV accuracy below 53% gate
                  </p>
                )}
              </div>

              {/* Confidence */}
              <StatCard
                label="AI Confidence"
                value={data.confidence === "N/A" ? "—" : data.confidence}
                sub="Probability of upward move"
                accent="#3b82f6"
              />

              {/* CV Accuracy */}
              <StatCard
                label="CV Accuracy · 5-fold"
                value={data.cv_accuracy}
                sub="TimeSeriesSplit out-of-sample"
                accent="#818cf8"
              />
            </div>

            {/* ── Price chart ──────────────────────────────────────────── */}
            <div className="bg-slate-950/50 border border-slate-800 rounded-3xl p-5 md:p-6">
              <div className="flex justify-between items-start mb-5 flex-wrap gap-3">
                <div>
                  <h3 className="text-white font-bold">
                    {data.ticker} — Price vs SMA-20
                  </h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Last {data.history.length} bars · {data.horizonLabel}{" "}
                    horizon · verdict:{" "}
                    <span style={{ color: vs.line }} className="font-bold">
                      {vs.label}
                    </span>
                  </p>
                </div>
                <div className="flex gap-4 items-center">
                  <span
                    className="flex items-center gap-1.5 text-[10px] font-bold
                                   uppercase tracking-wider"
                    style={{ color: vs.line }}
                  >
                    <span
                      className="w-6 h-0.5 rounded inline-block"
                      style={{ backgroundColor: vs.line }}
                    />
                    Price
                  </span>
                  <span
                    className="flex items-center gap-1.5 text-[10px] font-bold
                                   uppercase tracking-wider text-amber-500"
                  >
                    <span
                      className="w-6 h-0.5 bg-amber-500 inline-block
                                     border-dashed rounded"
                    />
                    SMA-20
                  </span>
                </div>
              </div>

              <div className="h-[380px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.history}
                    margin={{ left: 10, right: 10, top: 5, bottom: 28 }}
                  >
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor={vs.line}
                          stopOpacity={0.2}
                        />
                        <stop
                          offset="95%"
                          stopColor={vs.line}
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
                      interval={xInterval}
                      angle={-30}
                      textAnchor="end"
                      height={44}
                    />
                    <YAxis
                      domain={[yMin, yMax]}
                      tick={{ fill: "#475569", fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `$${v}`}
                      width={65}
                    />
                    <Tooltip content={<ChartTooltip />} />

                    {/* SMA reference line at current SMA level */}
                    <ReferenceLine
                      y={lastSma}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeOpacity={0.3}
                    />

                    {/* Gradient fill */}
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="none"
                      fill={`url(#${gradId})`}
                      isAnimationActive={false}
                    />

                    {/* Price line */}
                    <Line
                      type="monotone"
                      dataKey="price"
                      stroke={vs.line}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 5, fill: vs.line, strokeWidth: 0 }}
                      isAnimationActive={false}
                    />

                    {/* SMA-20 */}
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

            {/* ── Indicator cards ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* RSI */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-5">
                <p
                  className="text-[10px] font-bold uppercase tracking-widest
                               text-slate-500 mb-2"
                >
                  RSI · Relative Strength
                </p>
                <div className="flex items-baseline gap-2 mb-3">
                  <span className="text-2xl font-mono font-bold text-white">
                    {rsi.toFixed(1)}
                  </span>
                  <span
                    className="text-[10px] font-bold"
                    style={{ color: rsiColor }}
                  >
                    {rsiLabel}
                  </span>
                </div>
                {/* RSI bar */}
                <div className="relative w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(rsi, 100)}%`,
                      backgroundColor: rsiColor,
                    }}
                  />
                  {/* Threshold markers */}
                  <div
                    className="absolute top-0 h-full w-px bg-rose-500/40"
                    style={{ left: "70%" }}
                  />
                  <div
                    className="absolute top-0 h-full w-px bg-emerald-500/40"
                    style={{ left: "30%" }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600 mt-1.5">
                  <span>0 — Oversold</span>
                  <span>70+ — Overbought</span>
                </div>
              </div>

              {/* Market phase */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-5">
                <p
                  className="text-[10px] font-bold uppercase tracking-widest
                               text-slate-500 mb-2"
                >
                  Market Phase
                </p>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: bullish ? "#10b981" : "#f43f5e" }}
                  />
                  <p className="text-xl font-bold text-white">
                    {bullish ? "Bullish" : "Bearish"}
                  </p>
                </div>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Price is {bullish ? "above" : "below"} the 20-bar moving
                  average — indicating a {bullish ? "rising" : "declining"}{" "}
                  short-term trend.
                </p>
              </div>

              {/* Signal summary */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-5">
                <p
                  className="text-[10px] font-bold uppercase tracking-widest
                               text-slate-500 mb-3"
                >
                  Signal Summary
                </p>
                <div className="space-y-2">
                  {[
                    ["Ticker", data.ticker, "font-mono font-bold text-white"],
                    ["Horizon", data.horizonLabel, "text-blue-400 font-bold"],
                    ["Direction", vs.label, "font-bold"],
                    [
                      "Confidence",
                      data.confidence === "N/A" ? "—" : data.confidence,
                      "text-white",
                    ],
                    ["CV Accuracy", data.cv_accuracy, "text-indigo-400"],
                  ].map(([k, v, cls]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-slate-500">{k}</span>
                      <span
                        className={cls}
                        style={
                          k === "Direction" ? { color: vs.line } : undefined
                        }
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── What this means explainer ─────────────────────────── */}
            {verdict !== "NO_EDGE" && (
              <div
                className="rounded-2xl border px-5 py-4 text-sm leading-relaxed"
                style={{
                  borderColor: vs.line + "40",
                  backgroundColor: vs.line + "0d",
                  color: "#94a3b8",
                }}
              >
                <span className="font-bold" style={{ color: vs.line }}>
                  {vs.label} signal
                </span>{" "}
                — The model assigns a{" "}
                <span className="text-white font-mono">{data.confidence}</span>{" "}
                probability of an upward move for{" "}
                <span className="text-white font-bold">{data.ticker}</span> over
                the next{" "}
                <span className="text-white font-bold">
                  {data.horizonLabel.toLowerCase()}
                </span>
                . CV accuracy of{" "}
                <span className="text-white font-mono">{data.cv_accuracy}</span>{" "}
                is above the 53% confidence gate — the model has a statistically
                meaningful edge on this ticker for this horizon.
              </div>
            )}

            {verdict === "NO_EDGE" && (
              <div
                className="rounded-2xl border border-slate-700/50 bg-slate-800/20
                              px-5 py-4 text-sm leading-relaxed text-slate-500"
              >
                <span className="font-bold text-slate-300">
                  No edge detected
                </span>{" "}
                — Cross-validated accuracy for{" "}
                <span className="text-slate-300 font-bold">{data.ticker}</span>{" "}
                on the{" "}
                <span className="text-slate-300 font-bold">
                  {data.horizonLabel.toLowerCase()}
                </span>{" "}
                horizon is below 53%, too close to random to act on. Try a
                different horizon — longer timeframes often yield cleaner
                signals for large-cap stocks.
              </div>
            )}

            {/* ── Footer row ───────────────────────────────────────────── */}
            <div
              className="flex flex-col sm:flex-row items-center
                            justify-between gap-4 pt-2 border-t border-slate-800"
            >
              <p className="text-slate-600 text-[11px] max-w-sm leading-relaxed">
                Educational use only. Not financial advice. Signals are based on
                technical indicators and carry no guarantee of future
                performance.
              </p>
              <button
                onClick={addToWatchlist}
                disabled={watchlisted}
                className={`font-bold px-8 py-3 rounded-2xl border transition-all
                            flex items-center gap-2 shadow-lg active:scale-95
                            whitespace-nowrap
                  ${
                    watchlisted
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-400 cursor-default"
                      : "bg-slate-800 hover:bg-blue-600 text-white border-slate-700 hover:border-blue-500 hover:shadow-blue-900/40"
                  }`}
              >
                {watchlisted ? "✓ Saved to Watchlist" : "☆ Add to Watchlist"}
              </button>
            </div>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────────── */}
        {!data && !loading && !error && (
          <div
            className="flex flex-col items-center justify-center py-16 gap-3
                          text-slate-600"
          >
            <svg
              className="w-12 h-12 opacity-30"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1
                   1H5a1 1 0 01-1-1V4z"
              />
            </svg>
            <p className="text-sm font-medium">
              Enter a ticker above to run a prediction
            </p>
            <p className="text-xs text-slate-700">
              Select a time horizon, then hit Predict or press Enter
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
