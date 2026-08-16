import "./storagePolyfill.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import DraftPrepApp from "./App.jsx";
import Landing from "./pages/Landing.jsx";
import GameDay from "./pages/GameDay.jsx";
import HistoryLayout from "./pages/history/Layout.jsx";
import SeasonPage from "./pages/history/SeasonPage.jsx";
import StatsPage from "./pages/history/StatsPage.jsx";
import H2HPage from "./pages/history/H2HPage.jsx";
import ChampsPage from "./pages/history/ChampsPage.jsx";
import TeamsPage from "./pages/history/TeamsPage.jsx";
import AnalyticsPage from "./pages/history/AnalyticsPage.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/draft" element={<DraftPrepApp />} />
        <Route path="/gameday" element={<GameDay />} />
        {/* Only Koi has an ESPN league id on file so far — /league-koi is
            literal, not a :leagueId param, until Final/Jordan get one too. */}
        <Route path="/league-koi" element={<HistoryLayout />}>
          <Route index element={<Navigate to="season" replace />} />
          <Route path="season" element={<SeasonPage />} />
          <Route path="stats" element={<StatsPage />} />
          <Route path="h2h" element={<H2HPage />} />
          <Route path="champs" element={<ChampsPage />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
