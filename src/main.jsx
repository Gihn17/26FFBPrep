import "./storagePolyfill.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./AuthContext.jsx";
import RequireAuth from "./RequireAuth.jsx";
import DraftPrepApp from "./App.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import GameDay from "./pages/GameDay.jsx";
import HistoryLayout from "./pages/history/Layout.jsx";
import HomePage from "./pages/history/HomePage.jsx";
import SeasonPage from "./pages/history/SeasonPage.jsx";
import StatsPage from "./pages/history/StatsPage.jsx";
import H2HPage from "./pages/history/H2HPage.jsx";
import ChampsPage from "./pages/history/ChampsPage.jsx";
import TeamsPage from "./pages/history/TeamsPage.jsx";
import TeamDetailPage from "./pages/history/TeamDetailPage.jsx";

// Home is now the real landing page for a league's History — everyone who
// reaches this route at all (permission is per-LEAGUE, checked once via
// RequireAuth's historyLeague prop on the /league-koi route below, not
// per-sub-page) lands there by default, same as anyone else.
function HistoryIndexRedirect() {
  return <Navigate to="home" replace />;
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
            <Route path="home" element={<HomePage />} />
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
