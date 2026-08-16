import React from "react";

// No real team photos/logos on file yet (ESPN's are unreliable for old
// seasons anyway) — a stable colored initials circle per franchise, same
// idea as Slack/Google's fallback avatars. `imageUrl` is accepted now so
// swapping in real photos later (Will mentioned he may provide some) is a
// one-line change here, not a redesign.
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
  const style = {
    width: size, height: size, borderRadius: "50%", flex: `0 0 ${size}px`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: size * 0.36, fontWeight: 800, color: "#12130f", overflow: "hidden",
  };
  if (imageUrl) return <img src={imageUrl} alt={name} style={{ ...style, objectFit: "cover" }} />;
  return <div style={{ ...style, background: hashColor(seed || name || "?") }}>{initialsOf(name)}</div>;
}
