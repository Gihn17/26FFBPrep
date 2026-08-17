import "./storagePolyfill.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import RequireAuth from "./RequireAuth.jsx";
import DraftPrepApp from "./App.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import GameDay from "./pages/GameDay.jsx";
import HistoryLayout, { TABS as HISTORY_TABS } from "./pages/history/Layout.jsx";
import HomePage from "./pages/history/HomePage.jsx";
import SeasonPage from "./pages/history/SeasonPage.jsx";
import StatsPage from "./pages/history/StatsPage.jsx";
import H2HPage from "./pages/history/H2HPage.jsx";
import ChampsPage from "./pages/history/ChampsPage.jsx";
import TeamsPage from "./pages/history/TeamsPage.jsx";
import TeamDetailPage from "./pages/history/TeamDetailPage.jsx";

// Home is admin-only (not finished yet) — a true admin lands there by
// default. Everyone else lands on their first accessible History tab: all
// of them for "standard," whichever are actually granted for "limited"
// (never hardcoded to "season" — a limited account without Seasons
// granted would otherwise bounce straight back here in a loop).
function HistoryIndexRedirect() {
  const { user } = useAuth();
  if (user?.role === "admin") return <Navigate to="home" replace />;
  const allowed = user?.role === "standard" ? HISTORY_TABS : HISTORY_TABS.filter(([slug]) => user?.historyTabs.includes(slug));
  if (!allowed.length) return <Navigate to="/" replace />; // nothing granted yet — not a loop, just nowhere to land
  return <Navigate to={allowed[0][0]} replace />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/ffb">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Landing /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth role="admin"><Admin /></RequireAuth>} />
          <Route path="/draft" element={<RequireAuth permission="draft"><DraftPrepApp /></RequireAuth>} />
          <Route path="/gameday" element={<RequireAuth permission="gameday"><GameDay /></RequireAuth>} />
          {/* Only Koi has an ESPN league id on file so far — /league-koi is
              literal, not a :leagueId param, until Final/Jordan get one too. */}
          <Route path="/league-koi" element={<RequireAuth permission="history"><HistoryLayout /></RequireAuth>}>
            <Route index element={<HistoryIndexRedirect />} />
            <Route path="home" element={<RequireAuth role="admin"><HomePage /></RequireAuth>} />
            <Route path="season" element={<RequireAuth historyTab="season"><SeasonPage /></RequireAuth>} />
            <Route path="stats" element={<RequireAuth historyTab="stats"><StatsPage /></RequireAuth>} />
            <Route path="h2h" element={<RequireAuth historyTab="h2h"><H2HPage /></RequireAuth>} />
            <Route path="champs" element={<RequireAuth historyTab="champs"><ChampsPage /></RequireAuth>} />
            <Route path="teams" element={<RequireAuth historyTab="teams"><TeamsPage /></RequireAuth>} />
            <Route path="teams/:slug" element={<RequireAuth historyTab="teams"><TeamDetailPage /></RequireAuth>} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
