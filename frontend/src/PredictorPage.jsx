/**
 * PredictorPage.jsx  — TechTrendAI
 * ----------------------------------
 * Multi-horizon AI prediction page.
 * Chart shows historical price bars up to NOW, with a clear NOW marker
 * and a forward-looking prediction annotation.
 *
 * API pipe format (12 fields):
 * RESULT | TICKER | PRICE | VERDICT | CONF% | CV_ACC% |
 * TIMES  | PRICES | SMAS  | RSI     | HORIZON | LABEL
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
  ReferenceArea,
} from "recharts";
import { SP500_TICKERS } from "./sp500tickers";

// ─── Constants ───────────────────────────────────────────────────────────────

const API_BASE = "https://stockpredict-api-rslan.azurewebsites.net";

const TRENDING = ["AAPL", "TSLA", "NVDA", "MSFT", "GOOGL", "META", "AMZN"];

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
    label: "BUY",
    arrow: "↑",
    desc: "Upward move expected",
  },
  SELL: {
    line: "#f43f5e",
    glow: "#f43f5e33",
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-400",
    label: "SELL",
    arrow: "↓",
    desc: "Downward move expected",
  },
  HOLD: {
    line: "#f59e0b",
    glow: "#f59e0b33",
    badge: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    label: "HOLD",
    arrow: "→",
    desc: "No strong directional signal",
  },
  NO_EDGE: {
    line: "#64748b",
    glow: "#64748b22",
    badge: "border-slate-600/50 bg-slate-700/30 text-slate-400",
    label: "NO EDGE",
    arrow: "—",
    desc: "Model accuracy below threshold",
  },
};

// ─── Format a timestamp for the X-axis ──────────────────────────────────────
// Always include year for daily+ horizons; include time for intraday
function formatXLabel(label, horizon) {
  if (!label) return "";
  // label format from backend: "Jun 24 14:30" or "Jun 24 14:00"
  if (horizon === "1h" || horizon === "1d") {
    // Show date + time, no year needed (60d window)
    return label; // e.g. "Jun 24 14:30"
  }
  if (horizon === "1wk" || horizon === "1mo") {
    // Strip the time part, show just "Jun 24"
    return label.split(" ").slice(0, 2).join(" ");
  }
  // 6mo / 1y — strip time, show month + year approximation
  // Backend sends "Jun 24 00:00" for weekly bars
  return label.split(" ").slice(0, 2).join(" ");
}

// ─── Custom chart tooltip ────────────────────────────────────────────────────
function ChartTooltip({ active, payload, horizon }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const isNow = d?.isNow;

  return (
    <div
      className="bg-slate-900 border border-slate-700 px-4 py-3 rounded-xl
                    shadow-2xl text-xs min-w-[160px]"
    >
      <p className="text-slate-400 font-bold uppercase tracking-wider mb-2 text-[10px]">
        {d?.fullLabel ?? d?.label}
        {isNow && <span className="ml-2 text-blue-400 font-bold">← NOW</span>}
      </p>
      {payload.map((p, i) => {
        if (p.dataKey === "nowMarker") return null;
        return (
          <div key={i} className="flex justify-between gap-6 leading-6">
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
        );
      })}
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
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

  useEffect(() => {
    setWatchlisted(false);
  }, [ticker]);

  // ── Autocomplete ─────────────────────────────────────────────────────────
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

  // ── API call ─────────────────────────────────────────────────────────────
  const runPrediction = async (targetTicker, targetHorizon) => {
    const t = (targetTicker ?? ticker).trim().toUpperCase();
    const h = targetHorizon ?? horizon;
    if (!t) return;

    setLoading(true);
    setError(null);
    setData(null);
    setSuggestions([]);

    try {
      const res = await axios.get(`${API_BASE}/api/predict/${t}/${h}`);
      const raw = res.data?.raw ?? res.data;

      if (!raw || typeof raw !== "string")
        throw new Error("Unexpected response format");

      const parts = raw.split("|");

      if (parts[0] === "ERROR") {
        setError(parts[1] || "Server error");
        return;
      }
      if (parts[0] !== "RESULT") {
        setError("Unrecognised server response");
        return;
      }

      const times = (parts[6] ?? "").split(",");
      const prices = (parts[7] ?? "").split(",");
      const smas = (parts[8] ?? "").split(",");

      // Build history array — mark the last bar as NOW
      const history = prices
        .map((v, i) => ({
          label: formatXLabel(times[i] ?? "", h),
          fullLabel: times[i] ?? "", // full timestamp for tooltip
          price: parseFloat(v),
          sma: parseFloat(smas[i] ?? 0),
          isNow: i === prices.length - 1,
          nowMarker: i === prices.length - 1 ? parseFloat(v) : null,
        }))
        .filter((d) => !isNaN(d.price));

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
        history,
      });
    } catch (err) {
      setError(
        err.response?.status === 400
          ? `Invalid horizon. Valid options: ${HORIZONS.map((h) => h.key).join(", ")}`
          : (err.message ?? "Could not reach server"),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleHorizonChange = (key) => {
    setHorizon(key);
    if (ticker) runPrediction(data?.ticker ?? ticker, key);
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
  const rsi = data?.rsi ?? 50;
  const rsiLabel = rsi > 70 ? "OVERBOUGHT" : rsi < 30 ? "OVERSOLD" : "NEUTRAL";
  const rsiColor = rsi > 70 ? "#f43f5e" : rsi < 30 ? "#10b981" : "#3b82f6";
  const horizonInfo = HORIZONS.find(
    (h) => h.key === (data?.horizon ?? horizon),
  );

  // Dynamic X-axis label interval — always show ~8 labels
  const xInterval = data?.history?.length
    ? Math.max(0, Math.floor(data.history.length / 8) - 1)
    : 4;

  // Y-axis domain with a little padding
  const prices = data?.history?.map((d) => d.price) ?? [];
  const smas = data?.history?.map((d) => d.sma).filter(Boolean) ?? [];
  const allY = [...prices, ...smas];
  const yMin = allY.length ? Math.min(...allY) * 0.998 : "auto";
  const yMax = allY.length ? Math.max(...allY) * 1.002 : "auto";

  // Index of NOW bar for reference line
  const nowIndex = data?.history ? data.history.length - 1 : null;

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
            XGBoost classifier · TimeSeriesSplit cross-validation ·
            Confidence-gated signals · S&P 500
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
          <div className="relative flex gap-3">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                className="w-full bg-slate-800 border border-slate-700 text-white
                           rounded-2xl px-5 py-4 outline-none focus:ring-2
                           focus:ring-blue-500/60 text-base font-mono transition-all
                           placeholder:text-slate-600"
                placeholder="Ticker or company (e.g. AAPL, Apple)…"
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

          {/* Horizon buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-slate-600 text-xs font-bold uppercase
                             tracking-wider shrink-0"
            >
              Horizon
            </span>
            {HORIZONS.map((h) => (
              <button
                key={h.key}
                onClick={() => handleHorizonChange(h.key)}
                title={h.desc}
                className={`text-xs font-bold px-4 py-1.5 rounded-full border
                            transition-all
                  ${
                    horizon === h.key
                      ? "bg-blue-600 border-blue-500 text-white shadow-md shadow-blue-900/30"
                      : "bg-slate-800/60 border-slate-700 text-slate-400 hover:border-blue-500/50 hover:text-slate-200"
                  }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────────────── */}
        {error && (
          <div
            className="bg-rose-500/10 border border-rose-500/30 text-rose-400
                          rounded-2xl px-5 py-4 text-sm font-mono flex gap-3"
          >
            <span className="shrink-0">⚠</span>
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
            <div className="h-96 bg-slate-800/40 rounded-3xl" />
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
            {/* Context banner */}
            <div
              className="flex items-center gap-3 px-4 py-2.5 bg-slate-800/50
                            border border-slate-700/40 rounded-xl"
            >
              <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
              <p className="text-slate-400 text-xs">
                Showing price history for{" "}
                <span className="text-white font-bold">{data.ticker}</span> up
                to the current moment. The model's prediction applies to the
                next{" "}
                <span className="text-white font-bold">
                  {data.horizonLabel.toLowerCase()}
                </span>{" "}
                from now — indicated by the{" "}
                <span className="text-blue-400 font-bold">NOW</span> marker on
                the chart.
              </p>
            </div>

            {/* ── Stat cards ───────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Current Price" value={`$${data.price}`} />

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
                  {vs.arrow} {vs.label}
                </p>
                <p
                  className="text-[10px] mt-0.5"
                  style={{ color: vs.line + "aa" }}
                >
                  {vs.desc}
                </p>
              </div>

              <StatCard
                label="Model Confidence"
                value={data.confidence === "N/A" ? "—" : data.confidence}
                sub="Probability of upward move"
                accent="#3b82f6"
              />

              <StatCard
                label="CV Accuracy · 5-fold"
                value={data.cv_accuracy}
                sub="TimeSeriesSplit out-of-sample"
                accent="#818cf8"
              />
            </div>

            {/* ── Chart ───────────────────────────────────────────────── */}
            <div
              className="bg-slate-950/60 border border-slate-800 rounded-3xl
                            p-5 md:p-6"
            >
              {/* Chart header */}
              <div className="flex justify-between items-start mb-2 flex-wrap gap-3">
                <div>
                  <h3 className="text-white font-bold text-base">
                    {data.ticker} — Price History
                  </h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {data.history.length} bars of{" "}
                    {horizonInfo?.desc?.replace("Next ", "") ?? data.horizon}{" "}
                    data leading up to now ·{" "}
                    <span style={{ color: vs.line }} className="font-bold">
                      {vs.arrow} {vs.label}
                    </span>{" "}
                    predicted for the next {data.horizonLabel.toLowerCase()}
                  </p>
                </div>

                {/* Legend */}
                <div className="flex gap-4 items-center flex-wrap">
                  <span
                    className="flex items-center gap-1.5 text-[10px] font-bold
                                   uppercase tracking-wider"
                    style={{ color: vs.line }}
                  >
                    <span
                      className="w-5 h-0.5 rounded inline-block"
                      style={{ backgroundColor: vs.line }}
                    />
                    Price
                  </span>
                  <span
                    className="flex items-center gap-1.5 text-[10px] font-bold
                                   uppercase tracking-wider text-amber-500"
                  >
                    <span className="w-5 h-px bg-amber-500 inline-block opacity-70" />
                    SMA-20
                  </span>
                  <span
                    className="flex items-center gap-1.5 text-[10px] font-bold
                                   uppercase tracking-wider text-blue-400"
                  >
                    <span className="w-px h-3 bg-blue-400 inline-block" />
                    NOW
                  </span>
                </div>
              </div>

              {/* Chart */}
              <div className="h-[380px] w-full mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data.history}
                    margin={{ left: 10, right: 24, top: 10, bottom: 28 }}
                  >
                    <defs>
                      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={vs.line}
                          stopOpacity={0.22}
                        />
                        <stop
                          offset="100%"
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
                      axisLine={{ stroke: "#1e293b" }}
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
                      tickFormatter={(v) => `$${Number(v).toFixed(0)}`}
                      width={68}
                    />

                    <Tooltip
                      content={<ChartTooltip horizon={data.horizon} />}
                      cursor={{
                        stroke: "#334155",
                        strokeWidth: 1,
                        strokeDasharray: "4 2",
                      }}
                    />

                    {/* NOW vertical reference line */}
                    {nowIndex !== null && (
                      <ReferenceLine
                        x={data.history[nowIndex]?.label}
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        label={{
                          value: "NOW →",
                          position: "insideTopLeft",
                          fill: "#3b82f6",
                          fontSize: 10,
                          fontWeight: "bold",
                          dy: -4,
                        }}
                      />
                    )}

                    {/* SMA reference line at current level */}
                    <ReferenceLine
                      y={lastSma}
                      stroke="#f59e0b"
                      strokeOpacity={0.2}
                      strokeDasharray="2 4"
                    />

                    {/* Gradient area fill under price */}
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
                      strokeWidth={2}
                      dot={false}
                      activeDot={{
                        r: 5,
                        fill: vs.line,
                        strokeWidth: 2,
                        stroke: "#0f172a",
                      }}
                      isAnimationActive={false}
                    />

                    {/* SMA-20 dashed */}
                    <Line
                      type="monotone"
                      dataKey="sma"
                      stroke="#f59e0b"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                      dot={false}
                      activeDot={false}
                      isAnimationActive={false}
                    />

                    {/* NOW dot — highlighted point at current bar */}
                    <Line
                      type="monotone"
                      dataKey="nowMarker"
                      stroke="none"
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        if (!payload?.isNow || !cx || !cy) return null;
                        return (
                          <g key="now-dot">
                            {/* Outer glow ring */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={10}
                              fill={vs.line}
                              fillOpacity={0.15}
                            />
                            {/* Middle ring */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={6}
                              fill={vs.line}
                              fillOpacity={0.3}
                            />
                            {/* Inner dot */}
                            <circle
                              cx={cx}
                              cy={cy}
                              r={4}
                              fill={vs.line}
                              stroke="#0f172a"
                              strokeWidth={2}
                            />
                          </g>
                        );
                      }}
                      isAnimationActive={false}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Chart footer — prediction callout */}
              <div
                className="mt-4 flex items-center justify-between flex-wrap gap-3
                              pt-4 border-t border-slate-800"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full animate-pulse"
                    style={{ backgroundColor: vs.line }}
                  />
                  <p className="text-xs text-slate-400">
                    Chart shows data up to{" "}
                    <span className="text-white font-bold">
                      {data.history.at(-1)?.fullLabel ?? "now"}
                    </span>{" "}
                    — the rightmost point is the current price
                  </p>
                </div>
                <div
                  className="text-xs font-bold px-3 py-1.5 rounded-xl border"
                  style={{
                    borderColor: vs.line + "50",
                    backgroundColor: vs.line + "12",
                    color: vs.line,
                  }}
                >
                  {vs.arrow} Predicted next {data.horizonLabel.toLowerCase()}:{" "}
                  {vs.label}
                </div>
              </div>
            </div>

            {/* ── Indicators row ──────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* RSI */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-5">
                <p
                  className="text-[10px] font-bold uppercase tracking-widest
                               text-slate-500 mb-2"
                >
                  RSI · Relative Strength Index
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
                <div className="relative w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(rsi, 100)}%`,
                      backgroundColor: rsiColor,
                    }}
                  />
                  <div
                    className="absolute top-0 h-full w-px bg-rose-500/50"
                    style={{ left: "70%" }}
                  />
                  <div
                    className="absolute top-0 h-full w-px bg-emerald-500/50"
                    style={{ left: "30%" }}
                  />
                </div>
                <div className="flex justify-between text-[9px] text-slate-600 mt-1.5">
                  <span>0 — Oversold</span>
                  <span>70+ — Overbought</span>
                </div>
              </div>

              {/* Trend */}
              <div className="bg-slate-800/30 border border-slate-700/50 rounded-2xl p-5">
                <p
                  className="text-[10px] font-bold uppercase tracking-widest
                               text-slate-500 mb-2"
                >
                  Trend vs SMA-20
                </p>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: bullish ? "#10b981" : "#f43f5e" }}
                  />
                  <p className="text-xl font-bold text-white">
                    {bullish ? "Above trend" : "Below trend"}
                  </p>
                </div>
                <p className="text-slate-500 text-xs leading-relaxed">
                  Price of{" "}
                  <span className="text-white font-mono">${data.price}</span> is{" "}
                  {bullish ? "above" : "below"} the 20-bar moving average of{" "}
                  <span className="text-white font-mono">
                    ${lastSma.toFixed(2)}
                  </span>
                  , indicating a {bullish ? "bullish" : "bearish"} short-term
                  bias.
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
                    ["Direction", `${vs.arrow} ${vs.label}`, "font-bold"],
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

            {/* ── Signal interpretation ────────────────────────────────── */}
            <div
              className="rounded-2xl border px-5 py-4 text-sm leading-relaxed"
              style={{
                borderColor: vs.line + "40",
                backgroundColor: vs.line + "0d",
                color: "#94a3b8",
              }}
            >
              {verdict !== "NO_EDGE" ? (
                <>
                  <span className="font-bold" style={{ color: vs.line }}>
                    {vs.arrow} {vs.label}
                  </span>{" "}
                  — The model assigns a{" "}
                  <span className="text-white font-mono">
                    {data.confidence}
                  </span>{" "}
                  probability of an upward move for{" "}
                  <span className="text-white font-bold">{data.ticker}</span>{" "}
                  over the next{" "}
                  <span className="text-white font-bold">
                    {data.horizonLabel.toLowerCase()}
                  </span>
                  . A cross-validated accuracy of{" "}
                  <span className="text-white font-mono">
                    {data.cv_accuracy}
                  </span>{" "}
                  exceeds the 53% confidence threshold, indicating a
                  statistically meaningful edge for this ticker at this horizon.
                </>
              ) : (
                <>
                  <span className="font-bold text-slate-300">
                    No edge detected
                  </span>{" "}
                  — Cross-validated accuracy for{" "}
                  <span className="text-slate-300 font-bold">
                    {data.ticker}
                  </span>{" "}
                  on the{" "}
                  <span className="text-slate-300 font-bold">
                    {data.horizonLabel.toLowerCase()}
                  </span>{" "}
                  horizon is below the 53% confidence gate. The model cannot
                  distinguish signal from noise at this timeframe. Try a longer
                  horizon — weekly or monthly data tends to carry cleaner trends
                  for large-cap stocks.
                </>
              )}
            </div>

            {/* ── Footer ───────────────────────────────────────────────── */}
            <div
              className="flex flex-col sm:flex-row items-center justify-between
                            gap-4 pt-2 border-t border-slate-800"
            >
              <p className="text-slate-600 text-[11px] max-w-sm leading-relaxed">
                For research and educational use only. Not financial advice.
                Past model performance does not guarantee future results.
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
              className="w-12 h-12 opacity-20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1
                   1 0 01-1 1H5a1 1 0 01-1-1V4z"
              />
            </svg>
            <p className="text-sm font-medium text-slate-500">
              Enter a ticker above to run a prediction
            </p>
            <p className="text-xs text-slate-700">
              Choose a time horizon, then press Predict or hit Enter
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
