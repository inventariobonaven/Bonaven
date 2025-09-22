import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);
const LS_AUTH = 'auth';
const LS_TOKEN = 'token';

function readAuth() {
  try {
    return JSON.parse(localStorage.getItem(LS_AUTH) || 'null');
  } catch {
    return null;
  }
}
function writeAuth(obj) {
  localStorage.setItem(LS_AUTH, JSON.stringify(obj));
  if (obj?.token) localStorage.setItem(LS_TOKEN, obj.token);
}
function clearAuth() {
  try {
    localStorage.removeItem(LS_AUTH);
    localStorage.removeItem(LS_TOKEN);
  } catch {}
}

export function AuthProvider({ children }) {
  // { token, user, permissions }
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);

  // Arranque: rehidratar y verificar con /auth/me
  useEffect(() => {
    let mounted = true;
    (async () => {
      const saved = readAuth();
      if (!saved?.token) {
        if (mounted) setLoading(false);
        return;
      }
      // pinta optimista
      if (mounted)
        setAuth({
          token: saved.token,
          user: saved.user,
          permissions: saved.permissions || [],
        });

      try {
        // ⬇️ Muy importante: NO redirigir en 401 aquí; lo manejamos nosotros
        const { data } = await api.get('/auth/me', { __skip401Redirect: true });
        const next = {
          token: saved.token,
          user: data?.user || saved.user || null,
          permissions: Array.isArray(data?.permissions)
            ? data.permissions
            : saved.permissions || [],
        };
        if (mounted) setAuth(next);
        writeAuth(next);
      } catch {
        // token inválido/expirado
        clearAuth();
        if (mounted) setAuth(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Acciones
  async function login(usuario, contrasena) {
    const { data } = await api.post('/auth/login', { usuario, contrasena });
    const next = {
      token: data?.token || '',
      user: data?.user || null,
      permissions: Array.isArray(data?.permissions) ? data.permissions : [],
    };
    writeAuth(next);
    setAuth(next);
    return next.user;
  }

  function logout() {
    clearAuth();
    setAuth(null);
    if (typeof window !== 'undefined') window.location.replace('/login');
  }

  // Helpers
  const role = String(auth?.user?.rol || '').toUpperCase(); // 'ADMIN' | 'PRODUCCION' | ''
  const isAdmin = role === 'ADMIN';
  const permissions = Array.isArray(auth?.permissions) ? auth.permissions : [];
  const has = (...keys) => keys.every((k) => permissions.includes(k));
  const user = auth?.user || null;
  const token = auth?.token || null;

  const value = useMemo(
    () => ({ auth, user, token, role, isAdmin, permissions, has, login, logout, loading }),
    [auth, user, token, role, isAdmin, permissions, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
