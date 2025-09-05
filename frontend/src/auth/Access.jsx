// src/auth/Access.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

/** Renderiza children si el usuario tiene el permiso; si no, fallback */
export function Can({ perm, children, fallback = null }) {
  const { has } = useAuth();
  return has(perm) ? children : fallback;
}

/** Bloquea rutas para un rol concreto (ADMIN o PRODUCCION) */
export function RequireRole({ role = "ADMIN", children }) {
  const { roleApi, loading } = useAuth();
  if (loading) return null;
  if (String(roleApi).toUpperCase() !== String(role).toUpperCase()) {
    return <Navigate to="/" replace />;
  }
  return children;
}



