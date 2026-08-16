import React from "react";
import { panelStyle, pText } from "../../theme.jsx";

export default function StatsPage() {
  return (
    <div style={panelStyle()}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
        Stats
      </div>
      <p style={pText()}>
        Not built yet. This tab is reserved for weekly scoring trends and other stat breakdowns beyond what's on
        the Season and Teams tabs — nothing here would be fabricated in the meantime.
      </p>
    </div>
  );
}
