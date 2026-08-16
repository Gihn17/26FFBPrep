import "./storagePolyfill.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DraftPrepApp from "./App.jsx";
import Landing from "./pages/Landing.jsx";
import GameDay from "./pages/GameDay.jsx";
import LeagueHistory from "./pages/LeagueHistory.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/draft" element={<DraftPrepApp />} />
        <Route path="/gameday" element={<GameDay />} />
        <Route path="/history" element={<LeagueHistory />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
