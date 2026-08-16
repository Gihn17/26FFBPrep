import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

// Client-side route guard — the real enforcement is server-side (every
// protected API 401s/403s a bad session on its own), this just keeps a
// restricted or logged-out visitor from ever seeing a page they can't
// actually use data on. role="admin" requires the admin role; omitted
// means "any logged-in user" (Game Day, League History).
export default function RequireAuth({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null; // brief — avoids a flash redirect before /api/auth/me resolves
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role === "admin" && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}
