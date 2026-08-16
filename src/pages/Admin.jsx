import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { pageShell, panelStyle, btnStyle, inp, lbl } from "../theme.jsx";
import { useAuth } from "../AuthContext.jsx";

const ROLE_LABEL = { admin: "Admin — full access", restricted: "Restricted — Game Day + League History only" };

function NewUserForm({ onCreate }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("restricted");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      await onCreate({ username, password, role });
      setUsername(""); setPassword(""); setRole("restricted");
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} style={{ display:"flex", gap:10, alignItems:"flex-end", flexWrap:"wrap" }}>
      <label style={lbl()}>
        Username
        <input value={username} onChange={e=>setUsername(e.target.value)} autoCapitalize="none" style={inp(160)} />
      </label>
      <label style={lbl()}>
        Password
        <input type="text" value={password} onChange={e=>setPassword(e.target.value)} style={inp(160)} placeholder="min. 4 characters" />
      </label>
      <label style={lbl()}>
        Access
        <select value={role} onChange={e=>setRole(e.target.value)} style={inp(220)}>
          <option value="restricted">{ROLE_LABEL.restricted}</option>
          <option value="admin">{ROLE_LABEL.admin}</option>
        </select>
      </label>
      <button type="submit" disabled={busy || !username || !password} style={btnStyle("#2a2a18","#c9a227")}>
        Add account
      </button>
      {error && <div style={{ fontSize:12, color:"#e08a8a", width:"100%" }}>{error}</div>}
    </form>
  );
}

function UserRow({ u, isSelf, onSetRole, onResetPassword, onDelete }) {
  const [newPassword, setNewPassword] = useState("");
  return (
    <tr>
      <td style={{ padding:"8px 6px", borderBottom:"1px solid #1e2018" }}>
        {u.username}{isSelf && <span style={{ opacity:0.5, fontSize:11 }}> (you)</span>}
      </td>
      <td style={{ padding:"8px 6px", borderBottom:"1px solid #1e2018" }}>
        <select value={u.role} onChange={e=>onSetRole(u.id, e.target.value)} disabled={isSelf} style={inp(220)}>
          <option value="restricted">{ROLE_LABEL.restricted}</option>
          <option value="admin">{ROLE_LABEL.admin}</option>
        </select>
      </td>
      <td style={{ padding:"8px 6px", borderBottom:"1px solid #1e2018" }}>
        <div style={{ display:"flex", gap:6 }}>
          <input type="text" value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="new password" style={inp(130)} />
          <button onClick={()=>{ if (newPassword) { onResetPassword(u.id, newPassword); setNewPassword(""); } }}
            disabled={!newPassword} style={btnStyle()}>Reset</button>
        </div>
      </td>
      <td style={{ padding:"8px 6px", borderBottom:"1px solid #1e2018", textAlign:"right" }}>
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

  const createUser = async ({ username, password, role }) => {
    const res = await fetch("/api/auth/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, role }),
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
            Admin accounts see everything, including the draft board. Restricted accounts only ever see Game Day and League History — enforced on the server, not just hidden in the UI.
          </div>

          {loaded && (
            <div style={{ overflowX:"auto", marginBottom:16 }}>
              <table style={{ width:"100%", fontSize:12.5 }}>
                <thead>
                  <tr style={{ opacity:0.65, textAlign:"left" }}>
                    <th style={{ padding:"6px" }}>Username</th>
                    <th style={{ padding:"6px" }}>Access</th>
                    <th style={{ padding:"6px" }}>Reset password</th>
                    <th style={{ padding:"6px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <UserRow key={u.id} u={u} isSelf={u.id === user?.id}
                      onSetRole={setRole} onResetPassword={resetPassword} onDelete={deleteUser} />
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
