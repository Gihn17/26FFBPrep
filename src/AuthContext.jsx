import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

// Site-wide login state — fetched once from /api/auth/me (reads the
// session cookie server-side) and shared via context so every page/route
// guard reads the same value instead of each re-fetching it. The API is
// the real security boundary (every protected endpoint checks the cookie
// itself); this context just drives what the UI shows/redirects to, so a
// restricted user never even sees a "Draft Prep" link to begin with.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still loading, null = logged out
  const [error, setError] = useState(null);

  const refresh = useCallback(() => {
    return fetch("/api/auth/me")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setUser(d.user))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (username, password) => {
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || "login failed"); return false; }
    setUser(data.user);
    return true;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading: user === undefined, error, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
