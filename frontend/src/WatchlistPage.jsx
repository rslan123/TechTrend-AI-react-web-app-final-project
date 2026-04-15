/**
 * WatchlistPage.jsx
 * ------------------
 * Displays all tickers saved by the user.
 * On load, fetches live price + prediction data for each saved ticker
 * so the user can see current price, direction, and a sparkline —
 * not just a static saved snapshot.
 *
 * Backend endpoints used:
 *   GET    /api/watchlist           → [{id, ticker, price, verdict}, ...]
 *   DELETE /api/watchlist/:ticker   → removes one entry
 *   GET    /api/predict/:ticker     → live prediction (for refresh)
 */

import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
} from "recharts";

const API = "http://localhost:5000";

// ── Verdict config (matches PredictorPage) ───────────────────────────────────
const VERDICT_STYLE = {
  BUY:     { text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30", line: "#10b981" },
  SELL:    { text: "text-rose-400",    bg: "bg-rose-500/10    border-rose-500/30",    line: "#f43f5e" },
  HOLD:    { text: "text-amber-400",   bg: "bg-amber-500/10   border-amber-500/30",   line: "#f59e0b" },
  NO_EDGE: { text: "text-slate-400",   bg: "bg-slate-700/30   border-slate-600/30",   line: "#64748b" },
};

// ── Parse the RESULT pipe string from the predict endpoint ───────────────────
function parsePredictResult(raw) {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split("|");
  if (parts[0] !== "RESULT") return null;

  const prices = parts[7]?.split(",") ?? [];
  const smas   = parts[8]?.split(",") ?? [];

  return {
    ticker:     parts[1],
    price:      parseFloat(parts[2]),
    verdict:    parts[3],
    confidence: parts[4],
    cv:         parts[5],
    rsi:        parseFloat(parts[9]),
    // Sparkline only needs price points — keep it light
    history: prices.map((v, i) => ({
      price: parseFloat(v),
      sma:   parseFloat(smas[i]),
    })),
  };
}

// ── Mini sparkline (no axes, no tooltip clutter) ─────────────────────────────
function Sparkline({ data, color }) {
  if (!data?.length) return (
    <div className="w-full h-full flex items-center justify-center text-slate-700 text-xs">
      No data
    </div>
  );
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <Line
          type="monotone"
          dataKey="price"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ── Price delta badge ────────────────────────────────────────────────────────
// Compares saved price (when user added to watchlist) with current live price
function PriceDelta({ saved, current }) {
  if (!saved || !current) return null;
  const savedF   = parseFloat(saved);
  const diff     = current - savedF;
  const pct      = ((diff / savedF) * 100).toFixed(2);
  const positive = diff >= 0;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
      positive ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
    }`}>
      {positive ? "+" : ""}{pct}%
    </span>
  );
}

// ── Skeleton card shown while loading ────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5 animate-pulse">
      <div className="flex justify-between items-start mb-4">
        <div className="space-y-2">
          <div className="h-5 w-16 bg-slate-700 rounded" />
          <div className="h-3 w-24 bg-slate-700/60 rounded" />
        </div>
        <div className="h-7 w-14 bg-slate-700 rounded-full" />
      </div>
      <div className="h-14 bg-slate-700/40 rounded-xl mb-4" />
      <div className="flex justify-between">
        <div className="h-4 w-20 bg-slate-700/60 rounded" />
        <div className="h-4 w-12 bg-slate-700/60 rounded" />
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export default function WatchlistPage() {
  // saved: raw DB rows [{id, ticker, price, verdict}]
  const [saved, setSaved]       = useState([]);
  // live: map of ticker → parsed prediction result
  const [live, setLive]         = useState({});
  const [loadingDb, setLoadingDb]     = useState(true);
  const [loadingLive, setLoadingLive] = useState({});
  const [deletingTicker, setDeletingTicker] = useState(null);
  const [error, setError]       = useState(null);

  // ── Step 1: Load saved tickers from DB ─────────────────────────────────
  const fetchWatchlist = useCallback(async () => {
    setLoadingDb(true);
    setError(null);
    try {
      const res = await axios.get(`${API}/api/watchlist`);
      setSaved(res.data ?? []);
    } catch {
      setError("Could not load watchlist from server.");
    } finally {
      setLoadingDb(false);
    }
  }, []);

  // ── Step 2: Fetch live prediction for one ticker ────────────────────────
  const fetchLive = useCallback(async (ticker) => {
    setLoadingLive(prev => ({ ...prev, [ticker]: true }));
    try {
      const res = await axios.get(`${API}/api/predict/${ticker}?source=auto`);
;
      const rawData = res.data.raw || res.data;
      const parsed  = parsePredictResult(typeof rawData === "string" ? rawData : null);
      if (parsed) {
        setLive(prev => ({ ...prev, [ticker]: parsed }));
      }
    } catch {
      // Silently fail per ticker — show saved data as fallback
    } finally {
      setLoadingLive(prev => ({ ...prev, [ticker]: false }));
    }
  }, []);

  // ── Step 3: Refresh all live prices ────────────────────────────────────
  const refreshAll = useCallback(async (tickers) => {
    // Stagger requests slightly so we don't hammer the backend
    for (const ticker of tickers) {
      await fetchLive(ticker);
    }
  }, [fetchLive]);

  // ── On mount: load DB, then kick off live fetches ───────────────────────
  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  useEffect(() => {
    if (saved.length > 0) {
      refreshAll(saved.map(s => s.ticker));
    }
  }, [saved, refreshAll]);

  // ── Delete ──────────────────────────────────────────────────────────────
  const handleDelete = async (ticker) => {
    setDeletingTicker(ticker);
    try {
      await axios.delete(`${API}/api/watchlist/${ticker}`);
      setSaved(prev => prev.filter(s => s.ticker !== ticker));
      setLive(prev => { const n = { ...prev }; delete n[ticker]; return n; });
    } catch {
      alert("Failed to remove from watchlist.");
    } finally {
      setDeletingTicker(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const anyLiveLoading = Object.values(loadingLive).some(Boolean);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Watchlist</h2>
            <p className="text-slate-500 text-sm mt-1">
              {saved.length} ticker{saved.length !== 1 ? "s" : ""} saved ·{" "}
              {anyLiveLoading ? (
                <span className="text-blue-400 animate-pulse">Fetching live prices…</span>
              ) : (
                <span className="text-slate-600">Live prices loaded</span>
              )}
            </p>
          </div>

          {/* Refresh button */}
          {saved.length > 0 && (
            <button
              onClick={() => refreshAll(saved.map(s => s.ticker))}
              disabled={anyLiveLoading}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700
                         disabled:opacity-40 text-slate-300 text-sm font-bold
                         px-5 py-2.5 rounded-xl border border-slate-700 transition-all"
            >
              <span className={anyLiveLoading ? "animate-spin inline-block" : ""}>↻</span>
              Refresh Prices
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/40 text-rose-400
                          rounded-2xl px-5 py-4 mb-6 text-sm font-mono">
            ⚠ {error}
          </div>
        )}

        {/* Loading skeletons */}
        {loadingDb && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
          </div>
        )}

        {/* Empty state */}
        {!loadingDb && saved.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="text-5xl mb-4 opacity-30">⭐</div>
            <p className="text-slate-400 font-bold text-lg">Your watchlist is empty</p>
            <p className="text-slate-600 text-sm mt-2 max-w-xs">
              Run a prediction on any stock and hit "Add to Watchlist" to track it here.
            </p>
          </div>
        )}

        {/* Ticker cards grid */}
        {!loadingDb && saved.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {saved.map((row) => {
              const liveData    = live[row.ticker];
              const isRefreshing = loadingLive[row.ticker];
              const isDeleting  = deletingTicker === row.ticker;

              // Use live verdict if available, fall back to saved
              const verdict  = liveData?.verdict ?? row.verdict ?? "HOLD";
              const vstyle   = VERDICT_STYLE[verdict] ?? VERDICT_STYLE.HOLD;
              const livePrice = liveData?.price;

              return (
                <div
                  key={row.ticker}
                  className={`bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5
                              transition-all duration-300
                              ${isDeleting ? "opacity-40 scale-95" : "hover:border-slate-600/60"}`}
                >
                  {/* Top row: ticker + verdict badge + delete */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono font-extrabold text-xl">
                          {row.ticker}
                        </span>
                        {/* Live price delta vs saved price */}
                        {livePrice && <PriceDelta saved={row.price} current={livePrice} />}
                      </div>
                      <p className="text-slate-500 text-xs mt-0.5">
                        Saved at ${parseFloat(row.price).toFixed(2)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Verdict badge */}
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border ${vstyle.bg} ${vstyle.text}`}>
                        {verdict.replace("_", " ")}
                      </span>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(row.ticker)}
                        disabled={isDeleting}
                        className="text-slate-600 hover:text-rose-400 transition-colors
                                   text-lg leading-none disabled:opacity-40 ml-1"
                        title="Remove from watchlist"
                      >
                        ×
                      </button>
                    </div>
                  </div>

                  {/* Sparkline */}
                  <div className="h-16 w-full mb-3 relative">
                    {isRefreshing ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-slate-600 text-xs animate-pulse">Loading chart…</div>
                      </div>
                    ) : (
                      <Sparkline data={liveData?.history} color={vstyle.line} />
                    )}
                  </div>

                  {/* Bottom row: live price + RSI + confidence */}
                  <div className="flex items-center justify-between text-xs border-t border-slate-700/40 pt-3">
                    <div className="flex items-center gap-3">
                      {/* Live price */}
                      <div>
                        <p className="text-slate-500 text-[10px] uppercase tracking-wider">Live Price</p>
                        <p className="text-white font-mono font-bold">
                          {livePrice ? `$${livePrice.toFixed(2)}` : "—"}
                        </p>
                      </div>
                      {/* RSI */}
                      {liveData?.rsi && (
                        <div>
                          <p className="text-slate-500 text-[10px] uppercase tracking-wider">RSI</p>
                          <p className={`font-bold ${
                            liveData.rsi > 70 ? "text-rose-400" :
                            liveData.rsi < 30 ? "text-emerald-400" : "text-slate-300"
                          }`}>
                            {liveData.rsi.toFixed(1)}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Confidence */}
                    {liveData?.confidence && liveData.confidence !== "N/A" && (
                      <div className="text-right">
                        <p className="text-slate-500 text-[10px] uppercase tracking-wider">Confidence</p>
                        <p className="text-blue-400 font-bold">{liveData.confidence}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        {!loadingDb && saved.length > 0 && (
          <p className="text-slate-700 text-[11px] text-center mt-6">
            Live prices are fetched on page load and on refresh.
            Price delta shows change since you added the ticker.
          </p>
        )}

      </div>
    </div>
  );
}
