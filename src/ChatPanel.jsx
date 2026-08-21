import React, { useState, useRef, useEffect } from "react";
import { panelStyle, btnStyle, inp } from "./theme.jsx";

// Real-time chat with the Koi assistant (server/chat.js) — shared between
// the GM Tab and the Draft Prep board (Koi only), since both talk to the
// exact same /api/gm/chat endpoint and tool set. Stateless server-side:
// this component holds the full Anthropic-format message history and
// resends it each turn, same as any standard multi-turn chat integration.
//
// Two parallel message lists on purpose: `apiHistory` is the raw
// Anthropic message array (includes tool_use/tool_result blocks, needed
// to keep context across turns) sent back to the server every turn;
// `displayMessages` is what's actually rendered (just user/assistant
// text) — a chat bubble showing a raw JSON tool_result block would be
// noise, not content.
export default function ChatPanel({ title = "Koi Assistant" }) {
  const [open, setOpen] = useState(false);
  const [apiHistory, setApiHistory] = useState([]);
  const [displayMessages, setDisplayMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [displayMessages, sending]);

  const send = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError(null);
    setDisplayMessages(m => [...m, { role: "user", text }]);
    setSending(true);

    const nextHistory = [...apiHistory, { role: "user", content: text }];
    fetch("/api/gm/chat", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: nextHistory }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        setApiHistory(data.messages);
        setDisplayMessages(m => [...m, { role: "assistant", text: data.reply }]);
      })
      .catch(e => setError(e.message))
      .finally(() => setSending(false));
  };

  const clear = () => {
    setApiHistory([]);
    setDisplayMessages([]);
    setError(null);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={btnStyle()}>💬 {title}</button>
    );
  }

  return (
    <div style={{ ...panelStyle(), width: 360, display: "flex", flexDirection: "column", maxHeight: 520 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>💬 {title}</div>
        <div style={{ display: "flex", gap: 6 }}>
          {displayMessages.length > 0 && (
            <button onClick={clear} style={{ ...btnStyle(), fontSize: 11, padding: "3px 8px" }}>Clear</button>
          )}
          <button onClick={() => setOpen(false)} style={{ ...btnStyle(), fontSize: 11, padding: "3px 8px" }}>Close</button>
        </div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", minHeight: 160, marginBottom: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {displayMessages.length === 0 && (
          <div style={{ fontSize: 12, opacity: 0.55 }}>
            Ask about keepers, player value, trades, waiver targets, or draft-day pacing — this is Koi only.
          </div>
        )}
        {displayMessages.map((m, i) => (
          <div key={i} style={{
            alignSelf: m.role === "user" ? "flex-end" : "flex-start",
            maxWidth: "88%",
            background: m.role === "user" ? "#2a2a18" : "#20211a",
            border: "1px solid #2a2c20",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
          }}>
            {m.text}
          </div>
        ))}
        {sending && <div style={{ fontSize: 12, opacity: 0.6, alignSelf: "flex-start" }}>Thinking…</div>}
        {error && <div style={{ fontSize: 12, color: "#e08a8a" }}>{error}</div>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          style={{ ...inp(), flex: 1 }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Ask the Koi assistant…"
          disabled={sending}
        />
        <button onClick={send} disabled={sending || !input.trim()} style={btnStyle("#20211a", "#c9a227")}>Send</button>
      </div>
    </div>
  );
}
