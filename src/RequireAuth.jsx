import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

// Client-side route guard — the real enforcement is server-side (every
// protected API 401s/403s a bad session on its own), this just keeps a
// visitor from ever seeing a page they can't actually get data on.
//   - no props:        any logged-in user
//   - role="admin":    admin only
//   - permission="X":  admin, or a restricted account granted area X
//                       (X is one of the AREAS in server/auth.js: 'draft'
//                       | 'gameday' | 'history')
export default function RequireAuth({ role, permission, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // brief — avoids a flash redirect before /api/auth/me resolves
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role === "admin" && user.role !== "admin") return <Navigate to="/" replace />;
  if (permission && user.role !== "admin" && !user.permissions.includes(permission)) return <Navigate to="/" replace />;
  return children;
}
