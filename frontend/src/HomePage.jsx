/**
 * HomePage.jsx — TechTrendAI
 * ----------------------------
 * No auto-fetching on load — zero yfinance calls from this page.
 * RecentSignals reads from /api/watchlist (DB only, no predictor calls).
 */

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
  TrendingUp,
  GitCompare,
  Star,
  BookOpen,
  Database,
  Cpu,
  BarChart2,
  ShieldCheck,
  Clock,
  Activity,
} from "lucide-react";

const API = "https://stockpredict-api-rslan.azurewebsites.net";

const VERDICT_STYLE = {
  BUY: { bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  SELL: { bg: "bg-rose-500/10    border-rose-500/30    text-rose-400" },
  HOLD: { bg: "bg-amber-500/10   border-amber-500/30   text-amber-400" },
  NO_EDGE: { bg: "bg-slate-700/20   border-slate-600/30   text-slate-500" },
};

// ── Recent signals from watchlist (DB only — no predictor calls) ─────────────
function RecentSignals() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios
      .get(`${API}/api/watchlist`)
      .then((res) => setItems((res.data ?? []).slice(-4).reverse()))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <div
      className="bg-slate-900 border border-slate-800 rounded-3xl
                    p-5 md:p-6 shadow-2xl"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-bold text-base">From Your Watchlist</h3>
        <Link
          to="/watchlist"
          className="text-blue-400 hover:text-blue-300 text-xs font-bold transition-colors"
        >
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading
          ? [...Array(4)].map((_, i) => (
              <div
                key={i}
                className="h-20 bg-slate-800/50 rounded-2xl border
                           border-slate-700/40 animate-pulse"
              />
            ))
          : items.map((item) => {
              const vstyle =
                VERDICT_STYLE[item.verdict] ?? VERDICT_STYLE.NO_EDGE;
              return (
                <Link
                  key={item.ticker}
                  to="/predict"
                  className="bg-slate-800/50 border border-slate-700/40 rounded-2xl
                             px-4 py-3 hover:border-slate-600/60 transition-all group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="font-mono font-black text-white text-sm
                                     group-hover:text-blue-400 transition-colors"
                    >
                      {item.ticker}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full
                                  border ${vstyle.bg}`}
                    >
                      {item.verdict?.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs">
                    Saved at{" "}
                    <span className="text-slate-300 font-mono">
                      ${parseFloat(item.price).toFixed(2)}
                    </span>
                  </p>
                </Link>
              );
            })}
      </div>
    </div>
  );
}

// ── Pipeline step card ────────────────────────────────────────────────────────
function PipelineStep({ icon: Icon, iconColor, step, title, desc, last }) {
  return (
    <div className="flex gap-4">
      {/* Connector */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: iconColor + "1a",
            border: `1px solid ${iconColor}40`,
          }}
        >
          <Icon size={17} color={iconColor} strokeWidth={1.8} />
        </div>
        {!last && (
          <div className="w-px flex-1 bg-slate-700/60 mt-2 mb-0 min-h-[28px]" />
        )}
      </div>

      {/* Content */}
      <div className="pb-6">
        <p
          className="text-[10px] font-bold uppercase tracking-widest mb-0.5"
          style={{ color: iconColor }}
        >
          Step {step}
        </p>
        <p className="text-white font-bold text-sm mb-1">{title}</p>
        <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function Feature({ Icon, iconColor, title, desc, to }) {
  return (
    <Link
      to={to}
      className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5
                 hover:border-slate-600/60 hover:bg-slate-800/60 transition-all group"
    >
      <div className="mb-3">
        <Icon size={20} color={iconColor} strokeWidth={1.8} />
      </div>
      <p className="text-white font-bold text-sm mb-1 group-hover:text-blue-400 transition-colors">
        {title}
      </p>
      <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
    </Link>
  );
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
function StatPill({ value, label }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-slate-500 text-xs mt-0.5">{label}</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <div
        className="bg-slate-900 border border-slate-800 rounded-3xl
                      p-7 md:p-10 shadow-2xl"
      >
        <div
          className="inline-flex items-center gap-2 bg-blue-900/30 border
                        border-blue-500/20 text-blue-400 px-4 py-1.5 rounded-full
                        text-xs font-bold uppercase tracking-widest mb-6"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          XGBoost · TimeSeriesSplit · S&P 500 Coverage
        </div>

        <h1
          className="text-4xl md:text-5xl font-extrabold tracking-tight
                       mb-4 leading-tight"
        >
          <span className="text-white">Market signals,</span>
          <br />
          <span
            className="bg-gradient-to-r from-blue-400 to-violet-400
                           bg-clip-text text-transparent"
          >
            honestly measured.
          </span>
        </h1>

        <p className="text-slate-400 text-base leading-relaxed max-w-xl mb-8">
          TechTrend AI runs a machine learning model on price data for any S&P
          500 stock across six time horizons — from the next hour to the next
          year. Every prediction includes a cross-validated accuracy score so
          you always know whether the signal is reliable or not.
        </p>

        <div className="flex gap-8 mb-8 flex-wrap">
          <StatPill value="500+" label="S&P 500 tickers" />
          <StatPill value="6" label="Time horizons" />
          <StatPill value="8" label="Technical features" />
          <StatPill value="5-fold" label="Cross-validation" />
        </div>

        <div className="flex gap-3 flex-wrap">
          <Link
            to="/predict"
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold
                       px-8 py-3.5 rounded-2xl transition-all shadow-lg
                       shadow-blue-900/30 text-sm active:scale-95"
          >
            Run a Prediction
          </Link>

          {/*
          <Link
            to="/compare"
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold
                       px-8 py-3.5 rounded-2xl border border-slate-700
                       transition-all text-sm"
          >
            Compare Two Stocks
          </Link>
          */}

          <Link
            to="/education"
            className="text-slate-400 hover:text-white font-bold px-6 py-3.5
                       transition-all text-sm flex items-center gap-1"
          >
            How it works →
          </Link>
        </div>
      </div>

      {/* ── How the model works ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pipeline */}
        <div
          className="bg-slate-900 border border-slate-800 rounded-3xl
                        p-6 shadow-2xl"
        >
          <p
            className="text-slate-500 text-[10px] font-bold uppercase
                        tracking-widest mb-5"
          >
            Prediction Pipeline
          </p>

          <PipelineStep
            icon={Database}
            iconColor="#3b82f6"
            step={1}
            title="Data Acquisition"
            desc="60 days of hourly OHLCV data fetched from Yahoo Finance for any high-liquidity S&P 500 stock."
          />
          <PipelineStep
            icon={Activity}
            iconColor="#a855f7"
            step={2}
            title="Feature Engineering"
            desc="Eight technical indicators calculated per bar: SMA-20, RSI, ATR, Bollinger Band position, Rate of Change, Volume Ratio, Price-vs-SMA, and period unit."
          />
          <PipelineStep
            icon={Cpu}
            iconColor="#10b981"
            step={3}
            title="XGBoost Classifier"
            desc="An ensemble of decision trees trained on the feature set, validated with TimeSeriesSplit cross-validation to prevent data leakage."
          />
          <PipelineStep
            icon={ShieldCheck}
            iconColor="#f59e0b"
            step={4}
            title="Confidence Gate"
            desc="If cross-validated accuracy falls below 53%, the system outputs NO_EDGE instead of a signal. The model abstains when it has no meaningful edge."
            last
          />
        </div>

        {/* What each verdict means */}
        <div
          className="bg-slate-900 border border-slate-800 rounded-3xl
                        p-6 shadow-2xl flex flex-col gap-4"
        >
          <p
            className="text-slate-500 text-[10px] font-bold uppercase
                        tracking-widest"
          >
            Signal Reference
          </p>

          {[
            {
              verdict: "BUY",
              color: "#10b981",
              bg: "bg-emerald-500/10 border-emerald-500/30",
              when: "Model probability > 60%",
              means:
                "The model expects price to close higher over the selected horizon.",
            },
            {
              verdict: "SELL",
              color: "#f43f5e",
              bg: "bg-rose-500/10 border-rose-500/30",
              when: "Model probability < 40%",
              means:
                "The model expects price to close lower over the selected horizon.",
            },
            {
              verdict: "HOLD",
              color: "#f59e0b",
              bg: "bg-amber-500/10 border-amber-500/30",
              when: "Model probability 40–60%",
              means:
                "No strong directional bias. The model is uncertain — no action recommended.",
            },
            {
              verdict: "NO EDGE",
              color: "#64748b",
              bg: "bg-slate-700/20 border-slate-600/30",
              when: "CV accuracy < 53%",
              means:
                "The model failed cross-validation. Signal quality is too low to act on.",
            },
          ].map((s) => (
            <div
              key={s.verdict}
              className={`rounded-xl border px-4 py-3 ${s.bg}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-xs font-black tracking-wide"
                  style={{ color: s.color }}
                >
                  {s.verdict}
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {s.when}
                </span>
              </div>
              <p className="text-slate-400 text-xs leading-relaxed">
                {s.means}
              </p>
            </div>
          ))}

          <p
            className="text-slate-700 text-[10px] mt-auto pt-2
                        border-t border-slate-800 leading-relaxed"
          >
            All signals are based on technical indicators only. Past model
            accuracy does not guarantee future results. Not financial advice.
          </p>
        </div>
      </div>

      {/* ── Horizon reference ───────────────────────────────────────────── */}
      <div
        className="bg-slate-900 border border-slate-800 rounded-3xl
                      p-5 md:p-6 shadow-2xl"
      >
        <p
          className="text-slate-500 text-[10px] font-bold uppercase
                      tracking-widest mb-4"
        >
          Supported Time Horizons
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            {
              key: "1H",
              data: "60d hourly",
              shift: "Next bar",
              color: "#3b82f6",
            },
            {
              key: "1D",
              data: "60d hourly",
              shift: "7 bars",
              color: "#6366f1",
            },
            { key: "1W", data: "1y daily", shift: "5 bars", color: "#8b5cf6" },
            { key: "1M", data: "2y daily", shift: "21 bars", color: "#a855f7" },
            {
              key: "6M",
              data: "10y weekly",
              shift: "26 bars",
              color: "#d946ef",
            },
            {
              key: "1Y",
              data: "10y weekly",
              shift: "52 bars",
              color: "#ec4899",
            },
          ].map((h) => (
            <div
              key={h.key}
              className="bg-slate-800/40 border border-slate-700/40
                         rounded-xl px-3 py-3 flex flex-col gap-1.5"
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-sm font-black font-mono"
                  style={{ color: h.color }}
                >
                  {h.key}
                </span>
                <Clock size={11} color="#475569" />
              </div>
              <p className="text-slate-500 text-[10px] leading-relaxed">
                {h.data}
              </p>
              <p className="text-slate-600 text-[10px]">
                Predicts {h.shift} ahead
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Feature cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Feature
          Icon={TrendingUp}
          iconColor="#3b82f6"
          title="AI Predictor"
          desc="Direction signals with confidence scoring across six time horizons."
          to="/predict"
        />

          {/*}
        <Feature
          Icon={GitCompare}
          iconColor="#a855f7"
          title="Compare"
          desc="Side-by-side momentum comparison with overlay chart and head-to-head metrics."
          to="/compare"
        />
          */}

          
        <Feature
          Icon={Star}
          iconColor="#f59e0b"
          title="Watchlist"
          desc="Track saved tickers with live price delta and sparklines."
          to="/watchlist"
        />
        <Feature
          Icon={BookOpen}
          iconColor="#10b981"
          title="Market School"
          desc="Every indicator explained with interactive charts. No jargon."
          to="/education"
        />
      </div>

      {/* ── Recent signals from watchlist ────────────────────────────────── */}
      <RecentSignals />

      {/* ── Footer note ─────────────────────────────────────────────────── */}
      <p className="text-slate-700 text-[11px] text-center pb-2">
        For educational and research purposes only. Not financial advice.
        Predictions are based on technical indicators and carry no guarantee of
        accuracy.
      </p>
    </div>
  );
}
