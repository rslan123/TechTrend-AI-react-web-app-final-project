/**
 * HomePage.jsx — updated
 *   - Feature cards now use lucide-react icons
 *   - Vite default CSS note add
 *
 * Everything else (StripCard, RecentSignals, StatPill, layout) is identical.
 */

import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { TrendingUp, GitCompare, Star, BookOpen } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";

const API = "https://techtrend-ai-react-web-app-final-project.onrender.com";

const STRIP_TICKERS = ["SPY", "QQQ", "DIA", "NVDA", "TSLA"];

const VERDICT_STYLE = {
  BUY:     { color: "#10b981", bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" },
  SELL:    { color: "#f43f5e", bg: "bg-rose-500/10    border-rose-500/30    text-rose-400"    },
  HOLD:    { color: "#f59e0b", bg: "bg-amber-500/10   border-amber-500/30   text-amber-400"   },
  NO_EDGE: { color: "#64748b", bg: "bg-slate-700/20   border-slate-600/30   text-slate-500"   },
};

function parseResult(raw) {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split("|");
  if (parts[0] !== "RESULT") return null;
  const prices = parts[7]?.split(",").map(Number) ?? [];
  return {
    ticker:     parts[1],
    price:      parseFloat(parts[2]),
    verdict:    parts[3],
    confidence: parts[4],
    spark: prices.map((p) => ({ p })),
    change: prices.length >= 2
      ? parseFloat(((prices.at(-1) - prices.at(-2)) / prices.at(-2) * 100).toFixed(2))
      : null,
  };
}

function StripCard({ ticker }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API}/api/predict/${ticker}?source=auto`)
      .then((res) => {
        if (cancelled) return;
        const raw = res.data.raw || res.data;
        setData(parseResult(typeof raw === "string" ? raw : null));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ticker]);

  const vstyle   = VERDICT_STYLE[data?.verdict] ?? VERDICT_STYLE.NO_EDGE;
  const positive = (data?.change ?? 0) >= 0;

  return (
    <div className="flex-1 min-w-[160px] bg-slate-800/50 border border-slate-700/40
                    rounded-2xl px-4 py-3 flex flex-col gap-2 hover:border-slate-600/60
                    transition-all">
      <div className="flex items-center justify-between">
        <span className="font-mono font-black text-white text-sm">{ticker}</span>
        {data ? (
          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${vstyle.bg}`}>
            {data.verdict.replace("_", " ")}
          </span>
        ) : (
          <div className="w-10 h-4 bg-slate-700 rounded-full animate-pulse" />
        )}
      </div>

      <div className="h-10 w-full">
        {data?.spark?.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.spark}>
              <Line type="monotone" dataKey="p" stroke={vstyle.color}
                strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full bg-slate-700/30 rounded animate-pulse" />
        )}
      </div>

      <div className="flex items-end justify-between">
        {data ? (
          <>
            <span className="font-mono font-bold text-white text-base">
              ${data.price.toFixed(2)}
            </span>
            {data.change !== null && (
              <span className={`text-[10px] font-bold ${positive ? "text-emerald-400" : "text-rose-400"}`}>
                {positive ? "+" : ""}{data.change}%
              </span>
            )}
          </>
        ) : (
          <>
            <div className="w-16 h-5 bg-slate-700 rounded animate-pulse" />
            <div className="w-8 h-3 bg-slate-700 rounded animate-pulse" />
          </>
        )}
      </div>
    </div>
  );
}

function RecentSignals() {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get(`${API}/api/watchlist`)
      .then((res) => setItems((res.data ?? []).slice(-4).reverse()))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white font-bold text-base">Recent Signals</h3>
        <Link to="/watchlist" className="text-blue-400 hover:text-blue-300 text-xs font-bold transition-colors">
          View all →
        </Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {loading
          ? [...Array(4)].map((_, i) => (
              <div key={i} className="h-20 bg-slate-800/50 rounded-2xl border border-slate-700/40 animate-pulse" />
            ))
          : items.map((item) => {
              const vstyle = VERDICT_STYLE[item.verdict] ?? VERDICT_STYLE.NO_EDGE;
              return (
                <Link key={item.ticker} to="/predict"
                  className="bg-slate-800/50 border border-slate-700/40 rounded-2xl
                             px-4 py-3 hover:border-slate-600/60 transition-all group">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-black text-white text-sm group-hover:text-blue-400 transition-colors">
                      {item.ticker}
                    </span>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${vstyle.bg}`}>
                      {item.verdict?.replace("_", " ")}
                    </span>
                  </div>
                  <p className="text-slate-500 text-xs">
                    Saved at <span className="text-slate-300 font-mono">${parseFloat(item.price).toFixed(2)}</span>
                  </p>
                </Link>
              );
            })
        }
      </div>
    </div>
  );
}

// ── Feature card — now uses a Lucide icon component instead of emoji ──────────
// The icon receives the same color as its accent so it pops against the dark card.
function Feature({ Icon, iconColor, title, desc, to }) {
  return (
    <Link to={to}
      className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5
                 hover:border-slate-600/60 hover:bg-slate-800/60 transition-all group">
      <div className="mb-3">
        <Icon size={22} color={iconColor} strokeWidth={1.8} />
      </div>
      <p className="text-white font-bold text-sm mb-1 group-hover:text-blue-400 transition-colors">
        {title}
      </p>
      <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
    </Link>
  );
}

function StatPill({ value, label }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-black text-white">{value}</p>
      <p className="text-slate-500 text-xs mt-0.5">{label}</p>
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">

      {/* Market Strip */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400 text-xs font-bold uppercase tracking-widest">
              Live Market Pulse
            </span>
          </div>
          <span className="text-slate-600 text-[10px]">Powered by yfinance · 60d hourly</span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {STRIP_TICKERS.map((t) => <StripCard key={t} ticker={t} />)}
        </div>
        <p className="text-slate-700 text-[10px] mt-3">
          Prices and signals load on page open. Click Predict on any ticker for a full analysis.
        </p>
      </div>

      {/* Hero */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-7 md:p-10 shadow-2xl">
        <div className="inline-flex items-center gap-2 bg-blue-900/30 border border-blue-500/20
                        text-blue-400 px-4 py-1.5 rounded-full text-xs font-bold
                        uppercase tracking-widest mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          XGBoost · TimeSeriesSplit · S&P 500 Coverage
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight mb-4 leading-tight">
          <span className="text-white">Market signals,</span>
          <br />
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            honestly measured.
          </span>
        </h1>

        <p className="text-slate-400 text-base leading-relaxed max-w-xl mb-8">
          TechTrend AI runs a machine learning model on hourly price data for any S&P 500 stock.
          Every prediction comes with a backtest accuracy score so you always know
          whether the signal earned its verdict — or not.
        </p>

        <div className="flex gap-8 mb-8 flex-wrap">
          <StatPill value="500+"   label="S&P 500 tickers"  />
          <StatPill value="60d"    label="Hourly data window" />
          <StatPill value="8"      label="Technical features" />
          <StatPill value="5-fold" label="Cross-validation"  />
        </div>

        <div className="flex gap-3 flex-wrap">
          <Link to="/predict"
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3.5
                       rounded-2xl transition-all shadow-lg shadow-blue-900/30 text-sm">
            Run a Prediction
          </Link>
          <Link to="/compare"
            className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-8 py-3.5
                       rounded-2xl border border-slate-700 transition-all text-sm">
            Compare Two Stocks
          </Link>
          <Link to="/education"
            className="text-slate-400 hover:text-white font-bold px-6 py-3.5
                       transition-all text-sm flex items-center gap-1">
            How it works →
          </Link>
        </div>
      </div>

      {/* Feature cards — lucide icons, colored to match the card's purpose */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Feature Icon={TrendingUp} iconColor="#3b82f6" title="AI Predictor"
          desc="Hourly direction signals with confidence scoring on any S&P 500 stock."
          to="/predict" />
        <Feature Icon={GitCompare} iconColor="#a855f7" title="Compare"
          desc="Side-by-side momentum comparison with an overlay chart and head-to-head table."
          to="/compare" />
        <Feature Icon={Star}       iconColor="#f59e0b" title="Watchlist"
          desc="Track saved tickers with live price delta and sparklines since you added them."
          to="/watchlist" />
        <Feature Icon={BookOpen}   iconColor="#10b981" title="Market School"
          desc="Every indicator explained with interactive charts and sliders. No jargon."
          to="/education" />
      </div>

      {/* Recent signals */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 md:p-6 shadow-2xl">
        <RecentSignals />
      </div>

      <p className="text-slate-700 text-[11px] text-center pb-2">
        For educational purposes only. Not financial advice.
        Predictions are based on technical indicators and carry no guarantee of accuracy.
      </p>

    </div>
  );
}
