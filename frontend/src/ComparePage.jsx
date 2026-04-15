/**
 * ComparePage.jsx
 * ----------------
 * Side-by-side comparison of two tickers.
 * Calls /api/predict/ twice — no new backend needed.
 *
 * Layout:
 *   - Two search inputs (left ticker, right ticker)
 *   - Winner banner: which stock has stronger signal
 *   - Side-by-side stat cards (price, verdict, confidence, backtest)
 *   - Overlaid chart: both price lines on same Y axis
 *   - Indicator comparison table (RSI, phase, confidence)
 */

import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { SP500_TICKERS } from "./sp500tickers";

const API = "https://techtrend-ai-react-web-app-final-project.onrender.com";

// ── Colors for left vs right ticker ─────────────────────────────────────────
const SIDE = {
  left:  { primary: "#3b82f6", gradient: "#3b82f620", label: "A" },
  right: { primary: "#a855f7", gradient: "#a855f720", label: "B" },
};

const VERDICT_COLOR = {
  BUY:     "#10b981",
  SELL:    "#f43f5e",
  HOLD:    "#f59e0b",
  NO_EDGE: "#64748b",
};

const VERDICT_BADGE = {
  BUY:     "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  SELL:    "bg-rose-500/10    border-rose-500/30    text-rose-400",
  HOLD:    "bg-amber-500/10   border-amber-500/30   text-amber-400",
  NO_EDGE: "bg-slate-700/30   border-slate-600/30   text-slate-400",
};

// ── Parse predict result string ──────────────────────────────────────────────
function parseResult(raw) {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split("|");
  if (parts[0] !== "RESULT") return null;
  const times  = parts[6]?.split(",") ?? [];
  const prices = parts[7]?.split(",") ?? [];
  const smas   = parts[8]?.split(",") ?? [];
  return {
    ticker:     parts[1],
    price:      parseFloat(parts[2]),
    verdict:    parts[3],
    confidence: parts[4],
    cv:         parts[5],
    rsi:        parseFloat(parts[9]),
    history: prices.map((v, i) => ({
      label: times[i] ?? "",
      price: parseFloat(v),
      sma:   parseFloat(smas[i]),
    })),
  };
}

// ── Autocomplete input ───────────────────────────────────────────────────────
function TickerInput({ value, onChange, onSelect, placeholder, accentColor, label }) {
  const [suggestions, setSuggestions] = useState([]);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (!ref.current?.contains(e.target)) setSuggestions([]); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleChange = (val) => {
    const upper = val.toUpperCase();
    onChange(upper);
    if (upper.length === 0) { setSuggestions([]); return; }
    setSuggestions(
      SP500_TICKERS
        .filter(t => t.symbol.startsWith(upper) || t.name.toUpperCase().includes(upper))
        .slice(0, 6)
    );
  };

  return (
    <div className="relative flex-1" ref={ref}>
      {/* Label pill */}
      <div
        className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full
                   flex items-center justify-center text-xs font-black text-white z-10"
        style={{ backgroundColor: accentColor }}
      >
        {label}
      </div>

      <input
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { setSuggestions([]); onSelect(value); }
          if (e.key === "Escape") setSuggestions([]);
        }}
        placeholder={placeholder}
        className="w-full bg-slate-800 border border-slate-700 text-white rounded-2xl
                   pl-12 pr-5 py-4 outline-none focus:ring-2 transition-all
                   text-base font-mono"
        style={{ focusRingColor: accentColor }}
      />

      {suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border
                        border-slate-700 rounded-2xl overflow-hidden shadow-2xl z-50">
          {suggestions.map((s) => (
            <button
              key={s.symbol}
              onMouseDown={() => { onChange(s.symbol); setSuggestions([]); onSelect(s.symbol); }}
              className="w-full flex items-center gap-4 px-5 py-3 hover:bg-slate-700
                         transition-colors text-left"
            >
              <span className="font-mono font-bold text-white text-sm w-14 shrink-0">{s.symbol}</span>
              <span className="text-slate-400 text-sm truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Stat card (one side) ─────────────────────────────────────────────────────
function StatCard({ label, leftVal, rightVal, leftColor, rightColor, mono }) {
  return (
    <div className="bg-slate-800/40 rounded-2xl border border-slate-700/40 p-4">
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-3">{label}</p>
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xl font-bold ${mono ? "font-mono" : ""}`} style={{ color: leftColor }}>
          {leftVal ?? "—"}
        </p>
        <span className="text-slate-700 text-xs font-bold">vs</span>
        <p className={`text-xl font-bold text-right ${mono ? "font-mono" : ""}`} style={{ color: rightColor }}>
          {rightVal ?? "—"}
        </p>
      </div>
    </div>
  );
}

// ── Winner banner ────────────────────────────────────────────────────────────
function WinnerBanner({ left, right }) {
  if (!left || !right) return null;

  // Score: BUY=2, HOLD=1, NO_EDGE=0, SELL=-1
  const score = { BUY: 2, HOLD: 1, NO_EDGE: 0, SELL: -1 };
  const lScore = (score[left.verdict] ?? 0) + parseFloat(left.cv) / 100;
  const rScore = (score[right.verdict] ?? 0) + parseFloat(right.cv) / 100;

  const tied   = Math.abs(lScore - rScore) < 0.01;
  const winner = tied ? null : lScore > rScore ? left : right;
  const wColor = tied ? "#64748b" : winner === left ? SIDE.left.primary : SIDE.right.primary;

  return (
    <div
      className="rounded-2xl border px-6 py-4 flex items-center justify-between flex-wrap gap-3"
      style={{ backgroundColor: `${wColor}12`, borderColor: `${wColor}40` }}
    >
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">
          Stronger Signal
        </p>
        <p className="text-2xl font-black" style={{ color: wColor }}>
          {tied ? "TIED — No clear edge" : `${winner.ticker} leads`}
        </p>
      </div>
      {!tied && (
        <div className="text-right">
          <p className="text-slate-400 text-sm">
            {winner.verdict} · {winner.confidence} confidence
          </p>
          <p className="text-slate-600 text-xs">Backtest: {winner.cv}</p>
        </div>
      )}
    </div>
  );
}

// ── Overlaid chart ───────────────────────────────────────────────────────────
// Merges two 20-bar histories by index (same time window from same fetch)
function buildOverlayData(left, right) {
  const len = Math.max(left?.history?.length ?? 0, right?.history?.length ?? 0);
  return Array.from({ length: len }, (_, i) => ({
    i,
    label:  left?.history?.[i]?.label ?? right?.history?.[i]?.label ?? `${i}`,
    leftPrice:  left?.history?.[i]?.price,
    rightPrice: right?.history?.[i]?.price,
  }));
}

function OverlayTooltip({ active, payload, leftTicker, rightTicker }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div className="bg-slate-900 border border-slate-700 px-4 py-3 rounded-xl shadow-2xl">
      <p className="text-slate-400 text-[10px] font-bold uppercase mb-2">{d?.label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="text-sm font-bold" style={{ color: p.stroke }}>
          {p.dataKey === "leftPrice" ? leftTicker : rightTicker}: ${p.value?.toFixed(2)}
        </p>
      ))}
    </div>
  );
}

// ── Indicator row for comparison table ──────────────────────────────────────
function CompareRow({ label, leftVal, rightVal, higherIsBetter, format }) {
  const l = parseFloat(leftVal);
  const r = parseFloat(rightVal);
  const valid = !isNaN(l) && !isNaN(r);
  const leftWins  = valid && (higherIsBetter ? l > r : l < r);
  const rightWins = valid && (higherIsBetter ? r > l : l > r);

  const fmt = format ?? ((v) => v);

  return (
    <div className="grid grid-cols-3 items-center py-3 border-b border-slate-800 last:border-0">
      <p className={`text-sm font-bold ${leftWins ? "text-white" : "text-slate-400"}`}>
        {leftWins && <span className="text-emerald-400 mr-1">▲</span>}
        {fmt(leftVal)}
      </p>
      <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">
        {label}
      </p>
      <p className={`text-sm font-bold text-right ${rightWins ? "text-white" : "text-slate-400"}`}>
        {fmt(rightVal)}
        {rightWins && <span className="text-emerald-400 ml-1">▲</span>}
      </p>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function ComparePage() {
  const [leftTicker,  setLeftTicker]  = useState("");
  const [rightTicker, setRightTicker] = useState("");
  const [leftData,    setLeftData]    = useState(null);
  const [rightData,   setRightData]   = useState(null);
  const [leftLoading,  setLeftLoading]  = useState(false);
  const [rightLoading, setRightLoading] = useState(false);
  const [leftError,    setLeftError]    = useState(null);
  const [rightError,   setRightError]   = useState(null);

  const fetchSide = async (ticker, setSide, setLoading, setError) => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setSide(null);
    try {
      const res     = await axios.get(`${API}/api/predict/${ticker}`);
      const rawData = res.data.raw || res.data;
      const parsed  = parseResult(typeof rawData === "string" ? rawData : null);
      if (!parsed) throw new Error("No result from server");
      setSide(parsed);
    } catch (err) {
      setError(err.message || "Failed to fetch");
    } finally {
      setLoading(false);
    }
  };

  const runCompare = () => {
    if (leftTicker)  fetchSide(leftTicker,  setLeftData,  setLeftLoading,  setLeftError);
    if (rightTicker) fetchSide(rightTicker, setRightData, setRightLoading, setRightError);
  };

  const overlayData = buildOverlayData(leftData, rightData);
  const bothLoaded  = leftData && rightData;
  const anyLoading  = leftLoading || rightLoading;

  // ── Quick-compare presets ────────────────────────────────────────────────
  const PRESETS = [
    ["AAPL", "MSFT"],
    ["NVDA", "AMD"],
    ["TSLA", "F"],
    ["JPM",  "BAC"],
    ["AMZN", "WMT"],
  ];

  const applyPreset = ([l, r]) => {
    setLeftTicker(l);
    setRightTicker(r);
    fetchSide(l, setLeftData,  setLeftLoading,  setLeftError);
    fetchSide(r, setRightData, setRightLoading, setRightError);
  };

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-3xl font-extrabold text-white tracking-tight">Compare</h2>
          <p className="text-slate-500 text-sm mt-1">
            Run two predictions side by side and see which stock has stronger momentum
          </p>
        </div>

        {/* Quick presets */}
        <div className="flex gap-2 flex-wrap mb-5">
          <span className="text-slate-600 text-xs font-bold self-center">Quick:</span>
          {PRESETS.map(([l, r]) => (
            <button
              key={`${l}-${r}`}
              onClick={() => applyPreset([l, r])}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs
                         font-bold px-3 py-1.5 rounded-full border border-slate-700
                         transition-all"
            >
              {l} vs {r}
            </button>
          ))}
        </div>

        {/* Inputs */}
        <div className="flex flex-col md:flex-row gap-3 mb-6 items-center">
          <TickerInput
            value={leftTicker}
            onChange={setLeftTicker}
            onSelect={(t) => fetchSide(t, setLeftData, setLeftLoading, setLeftError)}
            placeholder="First ticker (e.g. AAPL)"
            accentColor={SIDE.left.primary}
            label="A"
          />
          <span className="text-slate-600 font-black text-lg shrink-0">vs</span>
          <TickerInput
            value={rightTicker}
            onChange={setRightTicker}
            onSelect={(t) => fetchSide(t, setRightData, setRightLoading, setRightError)}
            placeholder="Second ticker (e.g. MSFT)"
            accentColor={SIDE.right.primary}
            label="B"
          />
          <button
            onClick={runCompare}
            disabled={anyLoading || (!leftTicker && !rightTicker)}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white
                       font-bold px-8 py-4 rounded-2xl transition-all whitespace-nowrap
                       shadow-lg shadow-blue-900/30"
          >
            {anyLoading ? "Loading…" : "Compare"}
          </button>
        </div>

        {/* Per-side errors */}
        {(leftError || rightError) && (
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className={leftError ? "bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl px-4 py-3 text-xs font-mono" : ""}>
              {leftError && `⚠ ${leftTicker}: ${leftError}`}
            </div>
            <div className={rightError ? "bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-xl px-4 py-3 text-xs font-mono" : ""}>
              {rightError && `⚠ ${rightTicker}: ${rightError}`}
            </div>
          </div>
        )}

        {/* Loading state */}
        {anyLoading && (
          <div className="flex items-center justify-center py-16 gap-3">
            <div className="w-5 h-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <p className="text-slate-400 text-sm">
              {leftLoading && rightLoading ? "Fetching both predictions…" :
               leftLoading ? `Analysing ${leftTicker}…` : `Analysing ${rightTicker}…`}
            </p>
          </div>
        )}

        {/* Results */}
        {!anyLoading && (leftData || rightData) && (
          <div className="space-y-6">

            {/* Winner banner */}
            {bothLoaded && <WinnerBanner left={leftData} right={rightData} />}

            {/* Ticker headers */}
            <div className="grid grid-cols-2 gap-4">
              {[{ data: leftData, side: "left" }, { data: rightData, side: "right" }].map(({ data: d, side }) => (
                <div key={side} className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center
                               text-xs font-black text-white shrink-0"
                    style={{ backgroundColor: SIDE[side].primary }}
                  >
                    {SIDE[side].label}
                  </div>
                  <div>
                    <p className="text-white font-mono font-extrabold text-lg">
                      {d?.ticker ?? (side === "left" ? leftTicker : rightTicker)}
                    </p>
                    {d && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border
                                        ${VERDICT_BADGE[d.verdict] ?? VERDICT_BADGE.HOLD}`}>
                        {d.verdict.replace("_", " ")}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Stat cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <StatCard
                label="Current Price"
                leftVal={leftData  ? `$${leftData.price.toFixed(2)}`  : null}
                rightVal={rightData ? `$${rightData.price.toFixed(2)}` : null}
                leftColor={SIDE.left.primary}
                rightColor={SIDE.right.primary}
                mono
              />
              <StatCard
                label="AI Confidence"
                leftVal={leftData?.confidence}
                rightVal={rightData?.confidence}
                leftColor={leftData  ? VERDICT_COLOR[leftData.verdict]  ?? "#fff" : "#fff"}
                rightColor={rightData ? VERDICT_COLOR[rightData.verdict] ?? "#fff" : "#fff"}
              />
              <StatCard
                label="Backtest Accuracy"
                leftVal={leftData?.cv}
                rightVal={rightData?.cv}
                leftColor={SIDE.left.primary}
                rightColor={SIDE.right.primary}
              />
              <StatCard
                label="RSI"
                leftVal={leftData  ? leftData.rsi.toFixed(1)  : null}
                rightVal={rightData ? rightData.rsi.toFixed(1) : null}
                leftColor={leftData  ? (leftData.rsi  > 70 ? "#f43f5e" : leftData.rsi  < 30 ? "#10b981" : "#94a3b8") : "#fff"}
                rightColor={rightData ? (rightData.rsi > 70 ? "#f43f5e" : rightData.rsi < 30 ? "#10b981" : "#94a3b8") : "#fff"}
              />
            </div>

            {/* Overlay chart */}
            {bothLoaded && overlayData.length > 0 && (
              <div className="bg-slate-950/60 rounded-3xl border border-slate-800 p-5 md:p-6">
                <div className="mb-4">
                  <h3 className="text-white font-bold">Price Overlay</h3>
                  <p className="text-slate-500 text-xs mt-0.5">
                    Both stocks on the same time window — last 20 hourly bars
                  </p>
                </div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={overlayData} margin={{ left: 10, right: 10, top: 5, bottom: 20 }}>
                      <defs>
                        <linearGradient id="gradLeft" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={SIDE.left.primary}  stopOpacity={0.15} />
                          <stop offset="95%" stopColor={SIDE.left.primary}  stopOpacity={0}    />
                        </linearGradient>
                        <linearGradient id="gradRight" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor={SIDE.right.primary} stopOpacity={0.15} />
                          <stop offset="95%" stopColor={SIDE.right.primary} stopOpacity={0}    />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
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
                        tick={{ fill: "#475569", fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${v}`}
                        width={65}
                      />
                      <Tooltip
                        content={
                          <OverlayTooltip
                            leftTicker={leftData.ticker}
                            rightTicker={rightData.ticker}
                          />
                        }
                      />
                      <Area type="monotone" dataKey="leftPrice"  stroke="none" fill="url(#gradLeft)"  isAnimationActive={false} />
                      <Area type="monotone" dataKey="rightPrice" stroke="none" fill="url(#gradRight)" isAnimationActive={false} />
                      <Line type="monotone" dataKey="leftPrice"  stroke={SIDE.left.primary}  strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                      <Line type="monotone" dataKey="rightPrice" stroke={SIDE.right.primary} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Chart legend */}
                <div className="flex justify-center gap-6 mt-3">
                  {[{ data: leftData, side: "left" }, { data: rightData, side: "right" }].map(({ data: d, side }) => (
                    <div key={side} className="flex items-center gap-2">
                      <div className="w-3 h-0.5 rounded" style={{ backgroundColor: SIDE[side].primary }} />
                      <span className="text-slate-400 text-xs font-mono font-bold">{d.ticker}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Head-to-head indicator table */}
            {bothLoaded && (
              <div className="bg-slate-800/30 rounded-2xl border border-slate-700/40 p-5">
                <h3 className="text-white font-bold text-sm mb-1">Head to Head</h3>
                <p className="text-slate-500 text-xs mb-4">
                  Green arrow marks the stronger value for each indicator
                </p>

                {/* Column headers */}
                <div className="grid grid-cols-3 pb-2 border-b border-slate-700 mb-1">
                  <p className="text-xs font-black" style={{ color: SIDE.left.primary }}>
                    {leftData.ticker}
                  </p>
                  <p className="text-[10px] text-slate-600 text-center uppercase tracking-widest">Metric</p>
                  <p className="text-xs font-black text-right" style={{ color: SIDE.right.primary }}>
                    {rightData.ticker}
                  </p>
                </div>

                <CompareRow
                  label="RSI"
                  leftVal={leftData.rsi.toFixed(1)}
                  rightVal={rightData.rsi.toFixed(1)}
                  // For RSI, closer to 50 is more "neutral/healthy"
                  // We flag overbought/oversold in the color, not a simple higher=better
                  higherIsBetter={false}
                  format={(v) => v}
                />
                <CompareRow
                  label="Confidence"
                  leftVal={parseFloat(leftData.confidence)}
                  rightVal={parseFloat(rightData.confidence)}
                  higherIsBetter
                  format={(v) => `${v}%`}
                />
                <CompareRow
                  label="Backtest Acc."
                  leftVal={parseFloat(leftData.cv)}
                  rightVal={parseFloat(rightData.cv)}
                  higherIsBetter
                  format={(v) => `${v}%`}
                />
                <CompareRow
                  label="Price"
                  leftVal={leftData.price.toFixed(2)}
                  rightVal={rightData.price.toFixed(2)}
                  higherIsBetter
                  format={(v) => `$${v}`}
                />

                {/* Verdict row — manual, not numeric */}
                <div className="grid grid-cols-3 items-center py-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border inline-block
                                    ${VERDICT_BADGE[leftData.verdict] ?? VERDICT_BADGE.HOLD}`}>
                    {leftData.verdict.replace("_", " ")}
                  </span>
                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">
                    Verdict
                  </p>
                  <div className="flex justify-end">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border
                                      ${VERDICT_BADGE[rightData.verdict] ?? VERDICT_BADGE.HOLD}`}>
                      {rightData.verdict.replace("_", " ")}
                    </span>
                  </div>
                </div>

              </div>
            )}

            {/* Disclaimer */}
            <p className="text-slate-700 text-[11px] text-center">
              For educational purposes only. Not financial advice.
              Both predictions use the same model run at the same moment.
            </p>

          </div>
        )}

        {/* Empty prompt */}
        {!anyLoading && !leftData && !rightData && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-slate-600 text-4xl mb-4 font-black">A vs B</p>
            <p className="text-slate-500 text-sm max-w-xs">
              Enter two tickers above or pick a quick preset to run a side-by-side comparison.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
