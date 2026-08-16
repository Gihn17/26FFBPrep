import React, { useState, useEffect } from "react";

// ESPN's team.logo — a hotlinked image URL the manager set themselves
// (imgur/giphy/ESPN's own vector packs/photobucket/etc), not something we
// host. Some are genuinely dead now (tinypic.com shut down entirely in
// 2019 — confirmed several of this league's pre-2018 logos are 404/DNS
// failures) so this ALWAYS needs a fallback, not just a nice-to-have:
// falls back to a stable colored initials circle, same idea as Slack/
// Google's default avatars, the moment the image fails to load.
const PALETTE = ["#c9a227", "#7fd18f", "#4f8fd1", "#e0863f", "#8a63d1", "#d162a4", "#c0453f", "#3f9e5e", "#e0d05a"];

function hashColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initialsOf(name) {
  const words = (name || "?").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export default function TeamAvatar({ name, seed, size = 56, imageUrl }) {
  const [failed, setFailed] = useState(false);
  // A different team's logo can reuse this component instance (e.g. list
  // re-renders) — reset the failure flag when the URL itself changes,
  // otherwise a prior team's dead-link state would wrongly stick.
  useEffect(() => { setFailed(false); }, [imageUrl]);

  const style = {
    width: size, height: size, borderRadius: "50%", flex: `0 0 ${size}px`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: size * 0.36, fontWeight: 800, color: "#12130f", overflow: "hidden",
  };
  if (imageUrl && !failed) {
    return <img src={imageUrl} alt={name} style={{ ...style, objectFit: "cover" }} onError={()=>setFailed(true)} />;
  }
  return <div style={{ ...style, background: hashColor(seed || name || "?") }}>{initialsOf(name)}</div>;
}
