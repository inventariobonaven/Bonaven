import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

const LS_AUTH = 'auth';
const LS_TOKEN = 'token';

function readAuth() {
  try {
    const raw = localStorage.getItem(LS_AUTH);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistAuth(next) {
  try {
    localStorage.setItem(LS_AUTH, JSON.stringify(next));
    if (next?.token) localStorage.setItem(LS_TOKEN, next.token);
  } catch {}
}

function clearAuth() {
  try {
    localStorage.removeItem(LS_AUTH);
    localStorage.removeItem(LS_TOKEN);
  } catch {}
}

export function AuthProvider({ children }) {
  // auth = { token, user, permissions }
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);

  /* ---------- bootstrap: restaurar y validar con /auth/me ---------- */
  useEffect(() => {
    (async () => {
      try {
        const saved = readAuth();
        if (!saved?.token) {
          clearAuth();
          setAuth(null);
          return;
        }
        // set optimista para que la app pinte algo mientras chequea
        setAuth({
          token: saved.token,
          user: saved.user || null,
          permissions: Array.isArray(saved.permissions) ? saved.permissions : [],
        });

        // sincroniza con backend (rol/permissions definitivos)
        const { data } = await api.get('/auth/me');
        const next = {
          token: saved.token,
          user: data?.user || saved.user || null,
          permissions: Array.isArray(data?.permissions) ? data.permissions : [],
        };
        persistAuth(next);
        setAuth(next);
      } catch {
        // si falla (401, red), deja limpio
        clearAuth();
        setAuth(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---------- acciones ---------- */
  async function login(usuario, contrasena) {
    // 1) pedir token
    const { data } = await api.post('/auth/login', { usuario, contrasena });
    const token = (data?.token || '').trim();

    // 2) con el token, pedir /auth/me (fuente real de role/perms)
    const me = await api.get('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const next = {
      token,
      user: me?.data?.user || data?.user || null,
      permissions: Array.isArray(me?.data?.permissions)
        ? me.data.permissions
        : Array.isArray(data?.permissions)
          ? data.permissions
          : [],
    };

    persistAuth(next);
    setAuth(next);
    return next.user;
  }

  function logout() {
    try {
      clearAuth();
    } finally {
      setAuth(null);
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      }
    }
  }

  /* ---------- helpers de rol/permisos ---------- */
  const role = String(auth?.user?.rol || '').toUpperCase(); // 'ADMIN' | 'PRODUCCION' | ''
  const roleNorm = String(auth?.user?.rolNorm || role || '').toUpperCase();
  const isAdmin = roleNorm === 'ADMIN';
  const permissions = Array.isArray(auth?.permissions) ? auth.permissions : [];

  const hasAll = (...keys) => keys.every((k) => permissions.includes(k));
  const hasAny = (...keys) => keys.some((k) => permissions.includes(k));

  const value = useMemo(
    () => ({
      auth,
      user: auth?.user || null,
      token: auth?.token || null,
      permissions,
      role,
      roleNorm,
      isAdmin,
      hasAll,
      hasAny,
      login,
      logout,
      loading,
    }),
    [auth, permissions, role, roleNorm, isAdmin, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
