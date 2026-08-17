import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { pageShell, panelStyle, btnStyle, inp, lbl } from "../theme.jsx";
import { useAuth } from "../AuthContext.jsx";

const ROLE_LABEL = {
  admin: "Admin — full access + account management",
  standard: "Standard — full access, no account management",
  limited: "Limited — pick exactly what they can see",
};

const AREAS = [
  ["draft", "Draft Prep"],
  ["gameday", "Game Day"],
  ["history", "League History"],
];

// Sub-permissions, only meaningful once their parent area is granted AND
// the account is "limited" (admin/standard both bypass these entirely —
// see server/auth.js's FULL_ACCESS_ROLES).
const DRAFT_TABS = [
  ["koi", "Koi"],
  ["final", "Final Fantasy"],
  ["jordan", "Jordan"],
  ["how", "Calculations"],
];
const HISTORY_TABS = [
  ["season", "Seasons"],
  ["stats", "Stats"],
  ["h2h", "H2H"],
  ["champs", "Champs"],
  ["teams", "Teams"],
];

function RoleSelect({ value, onChange, disabled }) {
  return (
    <select value={value} onChange={e=>onChange(e.target.value)} disabled={disabled} style={inp(230)}>
      <option value="limited">{ROLE_LABEL.limited}</option>
      <option value="standard">{ROLE_LABEL.standard}</option>
      <option value="admin">{ROLE_LABEL.admin}</option>
    </select>
  );
}

function AreaCheckboxes({ permissions, onChange, disabled }) {
  const toggle = (area) => {
    onChange(permissions.includes(area) ? permissions.filter(a => a !== area) : [...permissions, area]);
  };
  return (
    <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
      {AREAS.map(([key, label]) => (
        <label key={key} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12, opacity: disabled ? 0.4 : 1 }}>
          <input type="checkbox" checked={permissions.includes(key)} disabled={disabled} onChange={()=>toggle(key)} />
          {label}
        </label>
      ))}
    </div>
  );
}

// Shared by both sub-tab rows (draft/history) — same shape, different
// option list.
function SubTabCheckboxes({ options, selected, onChange, disabled }) {
  const toggle = (key) => {
    onChange(selected.includes(key) ? selected.filter(t => t !== key) : [...selected, key]);
  };
  return (
    <div style={{ display:"flex", gap:12, flexWrap:"wrap", paddingLeft:18, marginTop:4, borderLeft:"2px solid #2a2c20" }}>
      {options.map(([key, label]) => (
        <label key={key} style={{ display:"flex", alignItems:"center", gap:5, fontSize:11.5, opacity: disabled ? 0.4 : 0.85 }}>
          <input type="checkbox" checked={selected.includes(key)} disabled={disabled} onChange={()=>toggle(key)} />
          {label}
        </label>
      ))}
    </div>
  );
}

function NewUserForm({ onCreate }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("limited");
  const [permissions, setPermissions] = useState([]);
  const [draftTabs, setDraftTabs] = useState([]);
  const [historyTabs, setHistoryTabs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await onCreate({ username, password, role, permissions, draftTabs, historyTabs });
      setUsername(""); setPassword(""); setRole("limited"); setPermissions([]); setDraftTabs([]); setHistoryTabs([]);
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} style={{ display:"flex", flexDirection:"column", gap:10 }}>
      <div style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
        <label style={lbl()}>
          Username
          <input value={username} onChange={e=>setUsername(e.target.value)} autoCapitalize="none" style={inp(160)} />
        </label>
        <label style={lbl()}>
          Password
          <input type="text" value={password} onChange={e=>setPassword(e.target.value)} style={inp(160)} placeholder="min. 4 characters" />
        </label>
        <label style={lbl()}>
          Role
          <RoleSelect value={role} onChange={setRole} />
        </label>
        <button type="submit" disabled={busy || !username || !password} style={btnStyle("#2a2a18","#c9a227")}>
          Add account
        </button>
      </div>
      {role === "limited" && (
        <label style={{ ...lbl(), gap:6 }}>
          Can see
          <AreaCheckboxes permissions={permissions} onChange={setPermissions} />
          {permissions.includes("draft") && (
            <SubTabCheckboxes options={DRAFT_TABS} selected={draftTabs} onChange={setDraftTabs} />
          )}
          {permissions.includes("history") && (
            <SubTabCheckboxes options={HISTORY_TABS} selected={historyTabs} onChange={setHistoryTabs} />
          )}
        </label>
      )}
      {error && <div style={{ fontSize:12, color:"#e08a8a" }}>{error}</div>}
    </form>
  );
}

function UserRow({ u, isSelf, onSetRole, onSetPermissions, onSetDraftTabs, onSetHistoryTabs, onResetPassword, onDelete }) {
  const [newPassword, setNewPassword] = useState("");
  return (
    <tr>
      <td style={{ padding:"8px 6px", borderBottom:"1px solid #1e2018", verticalAlign:"top" }}>
        {u.username}{isSelf && <span style={{ opacity:0.5, fontSize:11 }}> (you)</span>}
      </td>
      <td style={{ padding:"8px 6px", borderBottom:"1px solid #1e2018", verticalAlign:"top" }}>
        <div style={{ marginBottom:6 }}>
          <RoleSelect value={u.role} onChange={(role)=>onSetRole(u.id, role)} disabled={isSelf} />
        </div>
        {u.role === "limited" && (
          <>
            <AreaCheckboxes permissions={u.permissions} onChange={(perms)=>onSetPermissions(u.id, perms)} />
            {u.permissions.includes("draft") && (
              <SubTabCheckboxes options={DRAFT_TABS} selected={u.draftTabs} onChange={(tabs)=>onSetDraftTabs(u.id, tabs)} />
            )}
            {u.permissions.includes("history") && (
              <SubTabCheckboxes options={HISTORY_TABS} selected={u.historyTabs} onChange={(tabs)=>onSetHistoryTabs(u.id, tabs)} />
            )}
          </>
        )}
      </td>
      <td style={{ padding:"8px 6px", borderBottom:"1px solid #1e2018", verticalAlign:"top" }}>
        <div style={{ display:"flex", gap:6 }}>
          <input type="text" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="new password" style={inp(130)} />
          <button onClick={()=>{ if (newPassword) { onResetPassword(u.id, newPassword); setNewPassword(""); } }}
            disabled={!newPassword} style={btnStyle()}>Reset</button>
        </div>
      </td>
      <td style={{ padding:"8px 6px", borderBottom:"1px solid #1e2018", textAlign:"right", verticalAlign:"top" }}>
        <button onClick={()=>onDelete(u.id)} disabled={isSelf} style={btnStyle("#3a1f1f","#c0453f")}>Delete</button>
      </td>
    </tr>
  );
}

export default function Admin() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() => {
    fetch("/api/auth/users").then(r => r.json()).then(rows => { setUsers(rows); setLoaded(true); });
  }, []);
  useEffect(load, [load]);

  const createUser = async ({ username, password, role, permissions, draftTabs, historyTabs }) => {
    const res = await fetch("/api/auth/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role, permissions, draftTabs, historyTabs }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "failed to create account");
    load();
  };

  const setRole = async (id, role) => {
    await fetch(`/api/auth/users/${id}/role`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }),
    });
    load();
  };

  const setPermissions = async (id, permissions) => {
    // Optimistic update — checkbox clicks should feel instant, not wait
    // on a round-trip before the box visibly toggles.
    setUsers(us => us.map(u => u.id === id ? { ...u, permissions } : u));
    await fetch(`/api/auth/users/${id}/permissions`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ permissions }),
    });
  };

  const setDraftTabs = async (id, draftTabs) => {
    setUsers(us => us.map(u => u.id === id ? { ...u, draftTabs } : u));
    await fetch(`/api/auth/users/${id}/draft-tabs`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ draftTabs }),
    });
  };

  const setHistoryTabs = async (id, historyTabs) => {
    setUsers(us => us.map(u => u.id === id ? { ...u, historyTabs } : u));
    await fetch(`/api/auth/users/${id}/history-tabs`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ historyTabs }),
    });
  };

  const resetPassword = async (id, password) => {
    const res = await fetch(`/api/auth/users/${id}/password`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }),
    });
    const data = await res.json();
    setNotice(res.ok ? "Password updated." : (data.error || "Failed to update password."));
    setTimeout(()=>setNotice(null), 3000);
  };

  const deleteUser = async (id) => {
    if (!confirm("Remove this account? They'll be signed out immediately and can't log back in.")) return;
    await fetch(`/api/auth/users/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div style={pageShell()}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", flexWrap:"wrap", gap:12, marginBottom:16 }}>
          <div>
            <Link to="/" style={{ fontSize:11, color:"#9c998e", textDecoration:"none" }}>&larr; Fantasy HQ</Link>
            <h1 style={{ margin:"2px 0 0", fontSize:28, fontWeight:800 }}>⚙️ Admin</h1>
            <div style={{ fontSize:12.5, opacity:0.7, marginTop:2 }}>Signed in as {user?.username}</div>
          </div>
          <button onClick={logout} style={btnStyle()}>Log out</button>
        </div>

        <div style={panelStyle()}>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:0.5, color:"#c9a227", marginBottom:10, textTransform:"uppercase" }}>
            Accounts
          </div>
          <div style={{ fontSize:12, opacity:0.65, marginBottom:14 }}>
            Admin sees everything and can manage other accounts. Standard sees everything but can't manage
            accounts. Limited only ever sees the areas — and, within Draft Prep/League History, the specific
            tabs — checked below for them. All enforced on the server, not just hidden in the UI.
          </div>

          {loaded && (
            <div style={{ overflowX:"auto", marginBottom:16 }}>
              <table style={{ width:"100%", fontSize:12.5 }}>
                <thead>
                  <tr style={{ opacity:0.65, textAlign:"left" }}>
                    <th style={{ padding:"6px" }}>Username</th>
                    <th style={{ padding:"6px" }}>Role &amp; access</th>
                    <th style={{ padding:"6px" }}>Reset password</th>
                    <th style={{ padding:"6px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <UserRow key={u.id} u={u} isSelf={u.id === user?.id}
                      onSetRole={setRole} onSetPermissions={setPermissions}
                      onSetDraftTabs={setDraftTabs} onSetHistoryTabs={setHistoryTabs}
                      onResetPassword={resetPassword} onDelete={deleteUser} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {notice && <div style={{ fontSize:12.5, color:"#7fd18f", marginBottom:12 }}>{notice}</div>}

          <div style={{ borderTop:"1px solid #2a2c20", paddingTop:14 }}>
            <div style={{ fontSize:11, opacity:0.6, marginBottom:8 }}>Add a new account</div>
            <NewUserForm onCreate={createUser} />
          </div>
        </div>
      </div>
    </div>
  );
}
