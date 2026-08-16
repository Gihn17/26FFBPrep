import React from "react";
import { panelStyle, pText } from "../../theme.jsx";

export default function AnalyticsPage() {
  return (
    <div style={panelStyle()}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
        Analytics
      </div>
      <p style={pText()}>
        Not built yet. Things like expected record, luck-adjusted rankings, or playoff odds would need real
        opponent-strength modeling this app doesn't have — reserving this tab rather than faking the numbers.
      </p>
    </div>
  );
}
