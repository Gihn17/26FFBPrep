import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

// admin and standard both bypass every permission check below — mirrors
// server/auth.js's FULL_ACCESS_ROLES exactly, so the client never hides
// something the server would actually allow (or vice versa).
const FULL_ACCESS_ROLES = ["admin", "standard"];

// Client-side route guard — the real enforcement is server-side (every
// protected API 401s/403s a bad session on its own), this just keeps a
// visitor from ever seeing a page they can't actually get data on.
//   - no props:          any logged-in user
//   - role="admin":      the true admin role only (not standard — used
//                        for account management and the WIP Home page)
//   - permission="X":    admin/standard, or a 'limited' account granted
//                        area X (X is one of server/auth.js's AREAS:
//                        'draft' | 'gameday' | 'history')
//   - historyTab="X":    admin/standard, or a 'limited' account granted
//                        that specific League History sub-page (X is one
//                        of db.js's HISTORY_TABS)
export default function RequireAuth({ role, permission, historyTab, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // brief — avoids a flash redirect before /api/auth/me resolves
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role === "admin" && user.role !== "admin") return <Navigate to="/" replace />;
  const hasFullAccess = FULL_ACCESS_ROLES.includes(user.role);
  if (permission && !hasFullAccess && !user.permissions.includes(permission)) return <Navigate to="/" replace />;
  if (historyTab && !hasFullAccess && !user.historyTabs.includes(historyTab)) return <Navigate to="/league-koi" replace />;
  return children;
}
