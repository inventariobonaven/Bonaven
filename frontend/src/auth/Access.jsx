import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// Bloquea si no hay token; espera a que termine el loading
export function RequireAuth({ children }) {
  const { loading, token } = useAuth();
  if (loading) return null;
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

// Bloquea si el rol no coincide; también espera loading
export function RequireRole({ role = 'ADMIN', children }) {
  const { loading, role: userRole } = useAuth();
  if (loading) return null;
  if (String(userRole).toUpperCase() !== String(role).toUpperCase()) {
    return <Navigate to="/" replace />;
  }
  return children;
}
