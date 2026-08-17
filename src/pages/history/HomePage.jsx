import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { panelStyle, btnStyle, inp, ta } from "../../theme.jsx";
import { useAuth } from "../../AuthContext.jsx";
import { groupByDivision, ownerSlug } from "./compute.js";
import TeamAvatar from "./Avatar.jsx";

/** Accepts a plain watch URL, a youtu.be short link, or an already-embed
 *  URL and returns an embeddable https://www.youtube.com/embed/ID —  or
 *  null if the video id can't be found, so the caller can skip rendering
 *  a broken iframe instead of guessing. */
function toEmbedUrl(url) {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{6,})/,
    /youtu\.be\/([\w-]{6,})/,
    /youtube\.com\/embed\/([\w-]{6,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return `https://www.youtube.com/embed/${m[1]}`;
  }
  return null;
}

function timeAgo(iso) {
  // SQLite's datetime('now') is UTC without a "Z" suffix — Date needs the
  // suffix or it's parsed as local time, which quietly skews "time ago" by
  // a timezone offset.
  const then = new Date(iso.includes("Z") ? iso : iso.replace(" ", "T") + "Z");
  const diffSec = Math.max(0, (Date.now() - then.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

function VideoEditor({ youtubeUrl, onSave }) {
  const [draft, setDraft] = useState(youtubeUrl || "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(youtubeUrl || ""); }, [youtubeUrl]);
  return (
    <div style={{ display:"flex", gap:8, marginBottom:12 }}>
      <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Paste a YouTube link…" style={{...inp("100%"), flex:1}} />
      <button disabled={saving} onClick={async ()=>{ setSaving(true); await onSave(draft.trim()); setSaving(false); }} style={btnStyle("#2a2a18","#c9a227")}>
        Save
      </button>
    </div>
  );
}

function DivisionStandings({ divisions, currentLogos }) {
  return (
    <div style={{ display:"flex", gap:14, flexWrap:"wrap" }}>
      {divisions.map(d => (
        <div key={d.name} style={{ flex:"1 1 260px", minWidth:230, border:"1px solid #2a2c20", borderRadius:10, overflow:"hidden" }}>
          <div style={{ background:"#20211a", padding:"8px 12px", fontSize:12, fontWeight:700, color:"#c9a227" }}>{d.name}</div>
          <div style={{ padding:"6px 0" }}>
            {d.rows.map((r, i) => (
              <Link key={r.ownerGuid || r.teamName} to={r.ownerGuid ? `/league-koi/teams/${ownerSlug(r.ownerGuid)}` : "#"}
                style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 12px", textDecoration:"none", color:"inherit" }}>
                <span style={{ width:16, fontSize:11, opacity:0.5 }}>{i + 1}</span>
                <TeamAvatar name={r.teamName} seed={r.ownerGuid || r.teamName} size={22} imageUrl={currentLogos.get(r.ownerGuid)} />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12.5, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{r.ownerName || r.teamName}</div>
                </div>
                <div style={{ fontSize:12, opacity:0.75 }}>{r.wins}-{r.losses}{r.ties ? `-${r.ties}` : ""}</div>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChatBox({ chat, onPost, onDelete }) {
  const [message, setMessage] = useState("");
  const [posting, setPosting] = useState(false);

  const submit = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setPosting(true);
    await onPost(trimmed);
    setMessage("");
    setPosting(false);
  };

  return (
    <div>
      <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:360, overflowY:"auto", marginBottom:12, paddingRight:4 }}>
        {chat.length === 0 && <div style={{ fontSize:12.5, opacity:0.55 }}>No notes yet — be the first.</div>}
        {chat.map(m => (
          <div key={m.id} style={{ background:"#181910", border:"1px solid #2a2c20", borderRadius:8, padding:"8px 12px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:8 }}>
              <span style={{ fontSize:12, fontWeight:700, color:"#f0d97a" }}>{m.author}</span>
              <span style={{ fontSize:10.5, opacity:0.5 }}>{timeAgo(m.created_at)}</span>
            </div>
            <div style={{ fontSize:13, marginTop:3, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{m.message}</div>
            <button onClick={()=>onDelete(m.id)} style={{ background:"none", border:"none", color:"#9c998e", fontSize:10.5, cursor:"pointer", padding:0, marginTop:4 }}>
              Delete
            </button>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Add a note or thought…"
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          style={{ ...ta(), minHeight:44, resize:"vertical", flex:1 }} />
        <button onClick={submit} disabled={posting || !message.trim()} style={btnStyle("#2a2a18","#c9a227")}>Post</button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { league, seasonRecords, seasons, currentLogos } = useOutletContext();
  const { user } = useAuth();
  const [settings, setSettings] = useState({ youtubeUrl: null });
  const [chat, setChat] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/history/${league}/home`).then(r => r.json()).then(d => {
      setSettings(d.settings || { youtubeUrl: null });
      setChat(d.chat || []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [league]);
  useEffect(load, [load]);

  const saveVideo = async (youtubeUrl) => {
    const res = await fetch(`/api/history/${league}/home/settings`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ youtubeUrl }),
    });
    if (res.ok) setSettings(await res.json());
  };

  const postMessage = async (message) => {
    const res = await fetch(`/api/history/${league}/home/chat`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }),
    });
    if (res.ok) { const m = await res.json(); setChat(c => [...c, m]); }
  };

  const deleteMessage = async (id) => {
    setChat(c => c.filter(m => m.id !== id)); // optimistic
    await fetch(`/api/history/${league}/home/chat/${id}`, { method: "DELETE" });
  };

  const mostRecentSeason = seasons[0];
  const divisions = useMemo(() => {
    const rows = seasonRecords[mostRecentSeason] || [];
    return rows.length ? groupByDivision(rows) : [];
  }, [seasonRecords, mostRecentSeason]);

  const embedUrl = toEmbedUrl(settings.youtubeUrl);

  return (
    <>
      <div style={{ background:"#3a1f1f", border:"1px solid #c0453f", borderRadius:8, padding:"8px 14px", fontSize:12, marginBottom:16, color:"#e08a8a" }}>
        🚧 Admin-only preview — this page isn't finished yet, so it's hidden from everyone else for now.
      </div>

      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          League Social
        </div>
        <VideoEditor youtubeUrl={settings.youtubeUrl} onSave={saveVideo} />
        {embedUrl ? (
          <div style={{ position:"relative", paddingBottom:"56.25%", height:0, borderRadius:8, overflow:"hidden" }}>
            <iframe src={embedUrl} title="League video" frameBorder="0" allowFullScreen
              style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%" }} />
          </div>
        ) : (
          <div style={{ fontSize:12.5, opacity:0.55 }}>
            {settings.youtubeUrl ? "Couldn't read a video id from that link." : "No video set yet."}
          </div>
        )}
      </div>

      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          Current Standings {mostRecentSeason ? `— ${mostRecentSeason}` : ""}
        </div>
        {loaded && divisions.length > 0 ? <DivisionStandings divisions={divisions} currentLogos={currentLogos} /> : (
          <div style={{ fontSize:12.5, opacity:0.55 }}>No standings yet.</div>
        )}
      </div>

      <div style={panelStyle()}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
          League Chat
        </div>
        {loaded && <ChatBox chat={chat} onPost={postMessage} onDelete={deleteMessage} />}
      </div>
    </>
  );
}
