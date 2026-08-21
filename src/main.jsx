import "./storagePolyfill.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
import { AuthProvider } from "./AuthContext.jsx";
import RequireAuth from "./RequireAuth.jsx";
import DraftPrepApp from "./App.jsx";
import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import Admin from "./pages/Admin.jsx";
import GmTab from "./pages/GmTab.jsx";
import GameDay from "./pages/GameDay.jsx";
import HistoryLayout from "./pages/history/Layout.jsx";
import HomePage from "./pages/history/HomePage.jsx";
import SeasonPage from "./pages/history/SeasonPage.jsx";
import StatsPage from "./pages/history/StatsPage.jsx";
import H2HPage from "./pages/history/H2HPage.jsx";
import ChampsPage from "./pages/history/ChampsPage.jsx";
import TeamsPage from "./pages/history/TeamsPage.jsx";
import TeamDetailPage from "./pages/history/TeamDetailPage.jsx";

// Home (League Social — video + chat) is deliberately Koi-only, Will's
// call — it stays admin-curated content for one league, not a feature
// every league automatically gets just by having a History page. Every
// other league lands straight on Season standings instead.
function HistoryIndexRedirect() {
  const { leagueSlug } = useParams();
  return <Navigate to={leagueSlug === "koi" ? "home" : "season"} replace />;
}

// Same Koi-only rule, applied to direct navigation/a stale link to
// .../home itself (not just the index redirect above) — otherwise
// /league/final/home would render a real, if pointless, empty video/chat
// page nobody intended to expose for that league.
function HomeRoute() {
  const { leagueSlug } = useParams();
  if (leagueSlug !== "koi") return <Navigate to="../season" replace />;
  return <HomePage />;
}

// Preserves any existing /league-koi/... bookmarks/links from before
// League History supported more than one league — redirects to the
// equivalent /league/koi/... path rather than just 404ing them.
function LegacyKoiRedirect() {
  const location = useLocation();
  const rest = location.pathname.replace(/^\/league-koi/, "");
  return <Navigate to={`/league/koi${rest}${location.search}`} replace />;
}

// RequireAuth's historyLeague prop needs the real per-request league slug
// (permission is per-LEAGUE — server/db.js's HISTORY_LEAGUES — checked
// once here; every sub-route below inherits it automatically, since
// react-router never renders a nested route unless the parent route's own
// element renders through to its <Outlet/>, so the sub-routes don't need
// their own RequireAuth), which only a component can read via useParams()
// — a plain prop on the route's `element` can't see the matched param.
function HistoryRoute() {
  const { leagueSlug } = useParams();
  return <RequireAuth permission="history" historyLeague={leagueSlug}><HistoryLayout /></RequireAuth>;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter basename="/ffb">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Landing /></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth role="admin"><Admin /></RequireAuth>} />
          <Route path="/gm" element={<RequireAuth role="admin"><GmTab /></RequireAuth>} />
          <Route path="/draft" element={<RequireAuth permission="draft"><DraftPrepApp /></RequireAuth>} />
          <Route path="/gameday" element={<RequireAuth permission="gameday"><GameDay /></RequireAuth>} />
          {/* One route tree per league, parameterized by :leagueSlug (was
              literal /league-koi until Final Fantasy/Sin Bin Dynasty joined
              it — see server/db.js's HISTORY_LEAGUES for the valid slugs). */}
          <Route path="/league/:leagueSlug" element={<HistoryRoute />}>
            <Route index element={<HistoryIndexRedirect />} />
            <Route path="home" element={<HomeRoute />} />
            <Route path="season" element={<SeasonPage />} />
            <Route path="stats" element={<StatsPage />} />
            <Route path="h2h" element={<H2HPage />} />
            <Route path="champs" element={<ChampsPage />} />
            <Route path="teams" element={<TeamsPage />} />
            <Route path="teams/:slug" element={<TeamDetailPage />} />
          </Route>
          {/* Legacy path from before Koi was one of several leagues. */}
          <Route path="/league-koi" element={<LegacyKoiRedirect />} />
          <Route path="/league-koi/*" element={<LegacyKoiRedirect />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
