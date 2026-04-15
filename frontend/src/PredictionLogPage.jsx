/**
 * PredictionLogPage.jsx — Signal History
 * Updated:
 *   - Clear log button (calls DELETE /api/log)
 *   - Source filter: ALL / manual / auto
 *   - Lucide icons
 *   - Verdict filter, search, sort, pagination all intact
 */

import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { Trash2, Download, RotateCcw, ClipboardList } from "lucide-react";


const API = "http://localhost:5000";

const VERDICT_STYLE = {
  BUY:     "bg-emerald-500/10 border-emerald-500/30 text-emerald-400",
  SELL:    "bg-rose-500/10    border-rose-500/30    text-rose-400",
  HOLD:    "bg-amber-500/10   border-amber-500/30   text-amber-400",
  NO_EDGE: "bg-slate-700/20   border-slate-600/30   text-slate-500",
};

function SortIcon({ col, active, dir }) {
  if (active !== col) return <span className="text-slate-700 ml-1">↕</span>;
  return <span className="text-blue-400 ml-1">{dir === "asc" ? "↑" : "↓"}</span>;
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl px-5 py-4">
      <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">{label}</p>
      <p className="font-black text-2xl" style={{ color: color ?? "#fff" }}>{value}</p>
      {sub && <p className="text-slate-600 text-[10px] mt-0.5">{sub}</p>}
    </div>
  );
}

function exportCSV(rows) {
  const header = "timestamp,ticker,price,verdict,confidence_pct,cv_accuracy_pct,source";
  const body   = rows.map(r =>
    `${r.timestamp},${r.ticker},${r.price},${r.verdict},${r.confidence_pct},${r.cv_accuracy_pct},${r.source ?? "manual"}`
  ).join("\n");
  const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `techtrend_signals_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 15;

export default function PredictionLogPage() {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [verdictFilter, setVerdictFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter]   = useState("ALL");
  const [sortCol, setSortCol]     = useState("timestamp");
  const [sortDir, setSortDir]     = useState("desc");
  const [page, setPage]           = useState(1);
  const [clearing, setClearing]   = useState(false);

  const fetchLog = () => {
    setLoading(true);
    setError(null);
    axios.get(`${API}/api/log`)
      .then((res) => setRows(res.data ?? []))
      .catch(() => setError("Could not load prediction log from server."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchLog(); }, []);

  // ── Clear log ──────────────────────────────────────────────────────────
  const handleClear = async () => {
    if (!window.confirm("Clear the entire signal history? This cannot be undone.")) return;
    setClearing(true);
    try {
      await axios.delete(`${API}/api/log`);
      setRows([]);
    } catch {
      setError("Failed to clear log.");
    } finally {
      setClearing(false);
    }
  };

  // ── Filter + sort ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let out = [...rows];
    if (verdictFilter !== "ALL") out = out.filter(r => r.verdict === verdictFilter);
    if (sourceFilter  !== "ALL") out = out.filter(r => (r.source ?? "manual") === sourceFilter);
    if (search.trim()) {
      const q = search.trim().toUpperCase();
      out = out.filter(r => r.ticker?.toUpperCase().includes(q));
    }
    out.sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 :  1;
      if (av > bv) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
    return out;
  }, [rows, verdictFilter, sourceFilter, search, sortCol, sortDir]);

  useEffect(() => { setPage(1); }, [verdictFilter, sourceFilter, search, sortCol]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows   = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const real   = rows.filter(r => r.verdict !== "NO_EDGE");
    const buyPct = real.length
      ? Math.round(real.filter(r => r.verdict === "BUY").length / real.length * 100) : 0;
    const avgAcc = rows.length
      ? (rows.reduce((a, r) => a + (r.cv_accuracy_pct || 0), 0) / rows.length).toFixed(1) : "—";
    const tickers = new Set(rows.map(r => r.ticker)).size;
    return { total: rows.length, buyPct, avgAcc, tickers };
  }, [rows]);

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  };

  const VERDICT_FILTERS = ["ALL", "BUY", "SELL", "HOLD", "NO_EDGE"];
  const SOURCE_FILTERS  = ["ALL", "manual", "auto"];

  const COLUMNS = [
    { key: "timestamp",       label: "Time"          },
    { key: "ticker",          label: "Ticker"        },
    { key: "price",           label: "Price"         },
    { key: "verdict",         label: "Verdict"       },
    { key: "confidence_pct",  label: "Confidence"    },
    { key: "cv_accuracy_pct", label: "Backtest Acc." },
    { key: "source",          label: "Source"        },
  ];

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
          <div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Signal History</h2>
            <p className="text-slate-500 text-sm mt-1">
              Every prediction logged automatically. Manual = you clicked Predict.
              Auto = triggered by home strip or watchlist refresh.
            </p>
          </div>
          <div className="flex gap-2">
            {/* Refresh */}
            <button
              onClick={fetchLog}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700
                         text-slate-300 text-xs font-bold px-4 py-2.5 rounded-xl
                         border border-slate-700 transition-all"
            >
              <RotateCcw size={13} /> Refresh
            </button>
            {/* Export */}
            {rows.length > 0 && (
              <button
                onClick={() => exportCSV(filtered)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700
                           text-slate-300 text-xs font-bold px-4 py-2.5 rounded-xl
                           border border-slate-700 transition-all"
              >
                <Download size={13} /> Export
              </button>
            )}
            {/* Clear */}
            {rows.length > 0 && (
              <button
                onClick={handleClear}
                disabled={clearing}
                className="flex items-center gap-2 bg-rose-500/10 hover:bg-rose-500/20
                           text-rose-400 text-xs font-bold px-4 py-2.5 rounded-xl
                           border border-rose-500/30 transition-all disabled:opacity-40"
              >
                <Trash2 size={13} /> {clearing ? "Clearing…" : "Clear Log"}
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/40 text-rose-400
                          rounded-2xl px-5 py-4 mb-6 text-sm font-mono">
            {error}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <StatCard label="Total Predictions" value={stats.total}       sub="All time"              color="#3b82f6" />
            <StatCard label="Unique Tickers"    value={stats.tickers}     sub="Stocks analysed"       color="#a78bfa" />
            <StatCard label="BUY Signal Rate"   value={`${stats.buyPct}%`} sub="Of non-NO_EDGE signals" color="#10b981" />
            <StatCard label="Avg Backtest Acc." value={`${stats.avgAcc}%`} sub="Across all runs"
              color={parseFloat(stats.avgAcc) >= 53 ? "#10b981" : "#f43f5e"} />
          </div>
        )}

        {/* Filters */}
        {!loading && rows.length > 0 && (
          <div className="flex flex-col gap-3 mb-5">
            <div className="flex flex-wrap gap-3 items-center">
              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value.toUpperCase())}
                placeholder="Search ticker…"
                className="bg-slate-800 border border-slate-700 text-white rounded-xl
                           px-4 py-2.5 text-sm font-mono outline-none
                           focus:ring-2 focus:ring-blue-500 transition-all w-36"
              />
              {/* Verdict filter */}
              <div className="flex gap-2 flex-wrap">
                {VERDICT_FILTERS.map((v) => (
                  <button key={v} onClick={() => setVerdictFilter(v)}
                    className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
                      verdictFilter === v
                        ? "bg-blue-600 border-blue-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}>
                    {v.replace("_", " ")}
                  </button>
                ))}
              </div>
              {/* Source filter */}
              <div className="flex gap-2 flex-wrap">
                {SOURCE_FILTERS.map((s) => (
                  <button key={s} onClick={() => setSourceFilter(s)}
                    className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all ${
                      sourceFilter === s
                        ? "bg-violet-600 border-violet-500 text-white"
                        : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                    }`}>
                    {s === "ALL" ? "All Sources" : s === "manual" ? "Manual" : "Auto"}
                  </button>
                ))}
              </div>
              <span className="text-slate-600 text-xs ml-auto">
                {filtered.length} result{filtered.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-800/50 rounded-xl animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty states */}
        {!loading && rows.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList size={48} className="text-slate-700 mb-4" />
            <p className="text-slate-400 font-bold">No predictions logged yet</p>
            <p className="text-slate-600 text-sm mt-2 max-w-xs">
              Run a prediction on any stock — it gets logged here automatically.
            </p>
          </div>
        )}

        {!loading && rows.length > 0 && filtered.length === 0 && (
          <div className="text-center py-12">
            <p className="text-slate-500 text-sm">No results match your filters.</p>
          </div>
        )}

        {/* Table */}
        {!loading && pageRows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-slate-700/40">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700/60 bg-slate-800/40">
                  {COLUMNS.map((col) => (
                    <th key={col.key} onClick={() => handleSort(col.key)}
                      className="px-4 py-3 text-left text-[10px] font-bold uppercase
                                 tracking-widest text-slate-500 cursor-pointer
                                 hover:text-slate-300 transition-colors select-none whitespace-nowrap">
                      {col.label}<SortIcon col={col.key} active={sortCol} dir={sortDir} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, i) => (
                  <tr key={i} className="border-b border-slate-800/60 hover:bg-slate-800/30
                                         transition-colors last:border-0">
                    <td className="px-4 py-3 text-slate-500 text-xs font-mono whitespace-nowrap">
                      {row.timestamp}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-black text-white text-sm">{row.ticker}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300 text-sm">
                      ${row.price?.toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border
                                        whitespace-nowrap ${VERDICT_STYLE[row.verdict] ?? VERDICT_STYLE.NO_EDGE}`}>
                        {row.verdict?.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.verdict === "NO_EDGE" || !row.confidence_pct ? (
                        <span className="text-slate-700 text-sm">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(row.confidence_pct, 100)}%` }} />
                          </div>
                          <span className="text-slate-300 text-xs font-mono">
                            {row.confidence_pct?.toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold font-mono ${
                        (row.cv_accuracy_pct ?? 0) >= 53 ? "text-emerald-400" : "text-rose-400"
                      }`}>
                        {row.cv_accuracy_pct?.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        (row.source ?? "manual") === "manual"
                          ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                          : "bg-slate-700/20 border-slate-600/30 text-slate-500"
                      }`}>
                        {row.source ?? "manual"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-800 border
                         border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition-all">
              ← Previous
            </button>
            <span className="text-slate-500 text-xs">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="text-xs font-bold px-4 py-2 rounded-xl bg-slate-800 border
                         border-slate-700 text-slate-400 hover:text-white disabled:opacity-30 transition-all">
              Next →
            </button>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <p className="text-slate-700 text-[11px] text-center mt-5">
            Manual = triggered by clicking Predict. Auto = triggered by home page strip or watchlist refresh.
            Backtest accuracy ≥ 53% is required before a BUY or SELL signal is issued.
          </p>
        )}

      </div>
    </div>
  );
}
