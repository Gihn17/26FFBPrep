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
import HistoryLayout, { TABS as HISTORY_NAV_TABS } from "./pages/history/Layout.jsx";
import HomePage from "./pages/history/HomePage.jsx";
import SeasonPage from "./pages/history/SeasonPage.jsx";
import StatsPage from "./pages/history/StatsPage.jsx";
import H2HPage from "./pages/history/H2HPage.jsx";
import ChampsPage from "./pages/history/ChampsPage.jsx";
import TeamsPage from "./pages/history/TeamsPage.jsx";
import TeamDetailPage from "./pages/history/TeamDetailPage.jsx";

// Home is admin-only (not finished yet) — a true admin lands there by
// default. Everyone else lands on the first nav tab (Seasons): permission
// for League History is per-LEAGUE now (see RequireAuth's historyLeague
// prop on the /league-koi route below), not per-sub-page, so reaching this
// route at all already means every sub-page is visible — no filtering or
// loop risk to worry about here anymore.
function HistoryIndexRedirect() {
  const { user } = useAuth();
  if (user?.role === "admin") return <Navigate to="home" replace />;
  return <Navigate to={HISTORY_NAV_TABS[0][0]} replace />;
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
              literal, not a :leagueId param, until Final/Jordan get one too.
              Permission is per-LEAGUE (historyLeague="koi"), checked once
              here — every sub-route below inherits it automatically, since
              react-router never renders a nested route unless the parent
              route's own element renders through to its <Outlet/>. There's
              no finer permission underneath, so the sub-routes don't need
              (and no longer have) their own RequireAuth. */}
          <Route path="/league-koi" element={<RequireAuth permission="history" historyLeague="koi"><HistoryLayout /></RequireAuth>}>
            <Route index element={<HistoryIndexRedirect />} />
            <Route path="home" element={<RequireAuth role="admin"><HomePage /></RequireAuth>} />
            <Route path="season" element={<SeasonPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="h2h" element={<H2HPage />} />
            <Route path="champs" element={<ChampsPage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="teams/:slug" element={<TeamDetailPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
