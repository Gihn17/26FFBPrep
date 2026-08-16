import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { pageShell, panelStyle, btnStyle, inp, lbl } from "../theme.jsx";
import { useAuth } from "../AuthContext.jsx";

export default function Login() {
  const { login, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from || "/";

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const ok = await login(username, password);
    setSubmitting(false);
    if (ok) navigate(from, { replace: true });
  };

  return (
    <div style={{ ...pageShell(), display:"flex", alignItems:"center", justifyContent:"center" }}>
      <form onSubmit={onSubmit} style={{ ...panelStyle(), width:320, marginBottom:0 }}>
        <div style={{ fontSize:11, letterSpacing:3, color:"#c9a227", fontWeight:700, textAlign:"center" }}>Bowen FFB</div>
        <h1 style={{ margin:"4px 0 20px", fontSize:22, fontWeight:800, textAlign:"center" }}>Sign in</h1>

        <label style={{ ...lbl(), marginBottom:12 }}>
          Username
          <input value={username} onChange={e=>setUsername(e.target.value)} autoFocus
            autoCapitalize="none" autoCorrect="off" style={inp("100%")} />
        </label>
        <label style={{ ...lbl(), marginBottom:16 }}>
          Password
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={inp("100%")} />
        </label>

        {error && <div style={{ fontSize:12.5, color:"#e08a8a", marginBottom:12 }}>{error}</div>}

        <button type="submit" disabled={submitting || !username || !password} style={{ ...btnStyle("#2a2a18","#c9a227"), width:"100%" }}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
