/**
 * AboutPage.jsx
 * --------------
 * Project info, tech stack, honest model limitations,
 */

import React from "react";
import { Link } from "react-router-dom";

// ── Tech stack entry ─────────────────────────────────────────────────────────
function TechRow({ name, role, color }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-800 last:border-0">
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
      <span className="font-mono font-bold text-white text-sm w-32 shrink-0">{name}</span>
      <span className="text-slate-500 text-sm">{role}</span>
    </div>
  );
}

// ── Limitation card ──────────────────────────────────────────────────────────
function Limitation({ title, desc }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl px-4 py-3">
      <p className="text-amber-400 text-xs font-bold mb-1">{title}</p>
      <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-5">
      {/* Identity card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-7 md:p-9 shadow-2xl">
        <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="bg-blue-600 p-2 rounded-xl">
                <span className="text-xl">⚡</span>
              </div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                TechTrend <span className="text-blue-400">AI</span>
              </h1>
            </div>
            <p className="text-slate-500 text-sm">Version 1.0 · 2026</p>
          </div>
          <span
            className="bg-blue-900/30 border border-blue-500/20 text-blue-400
                           text-xs font-bold px-4 py-2 rounded-full"
          >
            Academic Project
          </span>
        </div>

        <p className="text-slate-400 text-sm leading-relaxed mb-4">
          TechTrend AI is a stock momentum prediction tool built as a final
          project for the Mobile App Development course at Ruppin Academic
          Center. It applies machine learning to hourly price data across the
          S&P 500 to generate directional signals — with built-in validation so
          every signal comes with an honest accuracy score rather than blind
          confidence.
        </p>

        <p className="text-slate-500 text-sm leading-relaxed">
          The goal was not to build a profitable trading system — that would
          require years of research and live market testing. The goal was to
          build something technically honest: a system that measures its own
          reliability and refuses to signal when the model has no demonstrable
          edge.
        </p>
      </div>

      {/* Tech stack */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <h2 className="text-white font-bold text-base mb-4">Tech Stack</h2>
        <div>
          <TechRow
            name="React 18"
            role="Frontend UI — component-based SPA with React Router"
            color="#3b82f6"
          />
          <TechRow
            name="Tailwind CSS"
            role="Utility-first styling — all design in-component"
            color="#06b6d4"
          />
          <TechRow
            name="Recharts"
            role="Chart library — LineChart, ComposedChart, Area"
            color="#8b5cf6"
          />
          <TechRow
            name="Node / Express"
            role="Backend API — routes, watchlist, log endpoints"
            color="#10b981"
          />
          <TechRow
            name="SQLite"
            role="Watchlist persistence via better-sqlite3"
            color="#f59e0b"
          />
          <TechRow
            name="Python 3"
            role="ML engine — spawned per request by the Node server"
            color="#facc15"
          />
          <TechRow
            name="XGBoost"
            role="Gradient-boosted classifier for direction prediction"
            color="#f43f5e"
          />
          <TechRow
            name="yfinance"
            role="Market data — 60 days of hourly OHLCV per ticker"
            color="#a3e635"
          />
          <TechRow
            name="scikit-learn"
            role="TimeSeriesSplit cross-validation and accuracy scoring"
            color="#f97316"
          />
        </div>
      </div>

      {/* How it works summary */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <h2 className="text-white font-bold text-base mb-4">
          How a Prediction Works
        </h2>
        <div className="space-y-2">
          {[
            {
              n: "1",
              t: "Data fetch",
              d: "60 days of hourly OHLCV data pulled from Yahoo Finance via yfinance.",
            },
            {
              n: "2",
              t: "Feature engineering",
              d: "8 technical indicators calculated: SMA-20, Price vs SMA, RSI-14, ROC-5, ATR-14, Bollinger Band position, Volume Ratio, Hour of day.",
            },
            {
              n: "3",
              t: "Cross-validation",
              d: "5-fold TimeSeriesSplit validates the model on unseen future data. Mean accuracy is computed.",
            },
            {
              n: "4",
              t: "Confidence gate",
              d: "If mean accuracy < 53%, the system outputs NO_EDGE. No BUY or SELL is issued on a weak model.",
            },
            {
              n: "5",
              t: "Prediction",
              d: "XGBoost outputs a probability of an upward move on the next hourly bar.",
            },
            {
              n: "6",
              t: "Verdict",
              d: "≥ 60% → BUY · ≤ 40% → SELL · between → HOLD. Logged to CSV automatically.",
            },
          ].map((s) => (
            <div key={s.n} className="flex gap-3 items-start">
              <div
                className="w-6 h-6 rounded-full bg-blue-500/10 border border-blue-500/30
                              text-blue-400 text-[10px] font-black flex items-center
                              justify-center shrink-0 mt-0.5"
              >
                {s.n}
              </div>
              <div>
                <span className="text-white text-xs font-bold">{s.t} — </span>
                <span className="text-slate-500 text-xs">{s.d}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Honest limitations */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <h2 className="text-white font-bold text-base mb-1">
          Known Limitations
        </h2>
        <p className="text-slate-500 text-xs mb-4">
          Included here intentionally — understanding what a model can't do is
          as important as understanding what it can.
        </p>
        <div className="space-y-3">
          <Limitation
            title="Technical indicators only"
            desc="The model has no awareness of news, earnings reports, macro events, or sentiment. A company can beat earnings and the model won't know until the price moves."
          />
          <Limitation
            title="Hourly prediction is noisy"
            desc="Short time horizons have low signal-to-noise ratios. A 54% accuracy sounds small but is meaningful statistically — it's still hard to exploit without transaction costs."
          />
          <Limitation
            title="No transaction costs modelled"
            desc="Real trading has spreads, fees, and slippage. A signal that looks profitable on paper can become unprofitable once costs are included."
          />
          <Limitation
            title="Retraining daily, not live"
            desc="The model retrains once per day per ticker. Intraday regime changes (flash crashes, news spikes) are not reflected until the next retrain."
          />
          <Limitation
            title="Past accuracy ≠ future accuracy"
            desc="Cross-validation measures how the model performed on historical data. Markets change. A model that worked last month may not work next month."
          />
        </div>
      </div>

      {/* Developer + CTA */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
        <h2 className="text-white font-bold text-base mb-4">Project Info</h2>
        <div className="space-y-2 text-sm mb-6">
          {[
            { label: "Institution", value: "Ruppin Academic Center" },
            { label: "Course", value: "Mobile App Development" },
            { label: "Year", value: "2026" },
            { label: "Stack", value: "React · Node.js · Python · SQLite" },
            {
              label: "Model",
              value: "XGBoost classifier, 60d hourly data, 8 features",
            },
            {
              label: "Data source",
              value: "Yahoo Finance via yfinance (open source)",
            },
          ].map((r) => (
            <div key={r.label} className="flex gap-3">
              <span className="text-slate-600 w-28 shrink-0">{r.label}</span>
              <span className="text-slate-300">{r.value}</span>
            </div>
          ))}
        </div>

        <div className="flex gap-3 flex-wrap">
          <Link
            to="/predict"
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5
                       rounded-xl transition-all text-sm"
          >
            Try the Predictor
          </Link>
          <Link
            to="/education"
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold px-6 py-2.5
                       rounded-xl border border-slate-700 transition-all text-sm"
          >
            Read Market School
          </Link>
        </div>
      </div>
    </div>
  );
}
