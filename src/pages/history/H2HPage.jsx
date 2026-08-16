import React, { useState, useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import { panelStyle } from "../../theme.jsx";
import H2HPanel from "./H2HPanel.jsx";

export default function H2HPage() {
  const { teamIdx, matchups, ownerOptions } = useOutletContext();
  const [ownerA, setOwnerA] = useState("");
  const [ownerB, setOwnerB] = useState("");

  // Default to the first two owners once loaded, so the page shows
  // something rather than two blank dropdowns.
  useEffect(() => {
    if (ownerOptions.length >= 2 && !ownerA && !ownerB) {
      setOwnerA(ownerOptions[0].guid);
      setOwnerB(ownerOptions[1].guid);
    }
  }, [ownerOptions, ownerA, ownerB]);

  return (
    <div style={panelStyle()}>
      <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
        Head-to-Head
      </div>
      <H2HPanel teamIdx={teamIdx} matchups={matchups} ownerOptions={ownerOptions}
        ownerA={ownerA} ownerB={ownerB} onChangeA={setOwnerA} onChangeB={setOwnerB} />
    </div>
  );
}
