// src/auth/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // auth = { token, user, permissions }
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restaurar sesión una sola vez
  useEffect(() => {
    try {
      const raw = localStorage.getItem('auth');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.token && parsed.user) {
          setAuth({
            token: parsed.token,
            user: parsed.user,
            permissions: Array.isArray(parsed.permissions) ? parsed.permissions : [],
          });
        } else {
          // Limpia formatos viejos o corruptos
          localStorage.removeItem('auth');
          localStorage.removeItem('token');
        }
      }
    } catch {
      localStorage.removeItem('auth');
      localStorage.removeItem('token');
    } finally {
      setLoading(false);
    }
  }, []);

  // ------ acciones ------
  async function login(usuario, contrasena) {
    // Usa SIEMPRE la instancia api (ya tiene baseURL y headers)
    const { data } = await api.post('/auth/login', { usuario, contrasena });

    const next = {
      token: data?.token || '',
      user: data?.user || null,
      permissions: Array.isArray(data?.permissions) ? data.permissions : [],
    };

    // Persistir
    localStorage.setItem('auth', JSON.stringify(next));
    if (next.token) localStorage.setItem('token', next.token);

    setAuth(next);
    return next.user;
  }

  function logout() {
    // Limpia storage primero
    try {
      localStorage.removeItem('auth');
      localStorage.removeItem('token');
    } finally {
      setAuth(null);
      // Redirecciona fuera de zonas protegidas
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      }
    }
  }

  // ------ helpers de rol/permisos ------
  const role = String(auth?.user?.rol || '').toUpperCase(); // 'ADMIN' | 'PRODUCCION' | ''
  const isAdmin = role === 'ADMIN';
  const permissions = Array.isArray(auth?.permissions) ? auth.permissions : [];
  const has = (...keys) => keys.every((k) => permissions.includes(k));
  const user = auth?.user || null;
  const token = auth?.token || null;

  const value = useMemo(
    () => ({ auth, user, token, permissions, isAdmin, has, login, logout, loading }),
    [auth, user, token, permissions, isAdmin, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
