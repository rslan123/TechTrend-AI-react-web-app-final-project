/**
 * App.jsx — TechTrend AI
 * Updated:
 *   - Lucide icons in nav + logo 
 *   - Smooth page transition on route change via CSS key trick
 */

import React from "react";
import { Routes, Route, Link, useLocation } from "react-router-dom";
import {
  Zap, Home, TrendingUp, GitCompare,
  Star, BookOpen, ClipboardList, Info,
} from "lucide-react";

import HomePage          from "./HomePage";
import PredictorPage     from "./PredictorPage";
import WatchlistPage     from "./WatchlistPage";
import ComparePage       from "./ComparePage";
import EducationPage     from "./EducationPage";
import PredictionLogPage from "./PredictionLogPage";
import AboutPage         from "./AboutPage";

// ── Nav link with icon ───────────────────────────────────────────────────────
const NavLink = ({ to, label, icon: Icon, current }) => (
  <Link
    to={to}
    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium
                transition-all whitespace-nowrap ${
      current === to
        ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
        : "hover:bg-slate-800 text-slate-400 hover:text-slate-200"
    }`}
  >
    <Icon size={14} />
    <span className="hidden lg:inline">{label}</span>
  </Link>
);

// ── Animated page wrapper ─────────────────────────────────────────────────────
// Uses a key on the wrapper div — when the key changes (i.e. route changes),
// React unmounts and remounts the div, which re-triggers the CSS animation.
function PageWrapper({ children, locationKey }) {
  return (
    <div
      key={locationKey}
      style={{
        animation: "fadeSlideIn 0.25s ease forwards",
      }}
    >
      {children}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const location = useLocation();

  return (
    <>
      {/* Global keyframe — injected once */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
      `}</style>

      <div className="min-h-screen flex flex-col bg-slate-950 text-slate-50">

        {/* ── Navigation ─────────────────────────────────────────────── */}
        <nav className="border-b border-slate-800 px-4 py-3 flex items-center
                        justify-between bg-slate-900/80 backdrop-blur-md sticky top-0 z-50">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-lg font-extrabold tracking-tight hidden md:block">
              TechTrend<span className="text-blue-400"> AI</span>
            </span>
          </Link>

          {/* Nav links */}
          <div className="flex gap-1 overflow-x-auto
                          [scrollbar-width:none] [-ms-overflow-style:none]">
            <NavLink to="/"          label="Home"       icon={Home}          current={location.pathname} />
            <NavLink to="/predict"   label="Predictor"  icon={TrendingUp}    current={location.pathname} />
            <NavLink to="/compare"   label="Compare"    icon={GitCompare}    current={location.pathname} />
            <NavLink to="/watchlist" label="Watchlist"  icon={Star}          current={location.pathname} />
            <NavLink to="/education" label="Learn"      icon={BookOpen}      current={location.pathname} />
            <NavLink to="/log"       label="Signal Log" icon={ClipboardList} current={location.pathname} />
            <NavLink to="/profile"   label="About"      icon={Info}          current={location.pathname} />
          </div>
        </nav>

        {/* ── Page content with fade+slide transition ─────────────────── */}
        <main className="flex-1 container mx-auto p-4 md:p-6 max-w-7xl">
          <PageWrapper locationKey={location.pathname}>
            <Routes location={location}>
              <Route path="/"          element={<HomePage />}          />
              <Route path="/predict"   element={<PredictorPage />}     />
              <Route path="/compare"   element={<ComparePage />}       />
              <Route path="/watchlist" element={<WatchlistPage />}     />
              <Route path="/education" element={<EducationPage />}     />
              <Route path="/log"       element={<PredictionLogPage />} />
              <Route path="/profile"   element={<AboutPage />}         />
            </Routes>
          </PageWrapper>
        </main>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <footer className="border-t border-slate-800 px-6 py-8
                           text-center text-slate-600 text-sm">
          <div className="flex justify-center gap-6 mb-3 flex-wrap">
            <Link to="/education" className="hover:text-blue-400 transition-colors">Market School</Link>
            <Link to="/log"       className="hover:text-blue-400 transition-colors">Signal Log</Link>
            <Link to="/profile"   className="hover:text-blue-400 transition-colors">About</Link>
          </div>
          <p>Ruppin Academic Center · Mobile App Development · 2026</p>
          <p className="text-slate-700 text-xs mt-1">For educational purposes only. Not financial advice.</p>
        </footer>

      </div>
    </>
  );
}
