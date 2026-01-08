// src/auth/AuthContext.jsx
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api, { loginFormUrlencoded, warmUp } from '../api/client';

const AuthContext = createContext(null);
const LS_AUTH = 'auth';
const LS_TOKEN = 'token';

/* ===== storage helpers ===== */
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
  localStorage.removeItem(LS_AUTH);
  localStorage.removeItem(LS_TOKEN);
}

export function AuthProvider({ children }) {
  // { token, user, permissions }
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);

  // Rehidratación segura: si hay token, SIEMPRE validamos con /auth/me.
  useEffect(() => {
    let mounted = true;

    (async () => {
      const saved = readAuth();
      const savedToken = saved?.token || localStorage.getItem(LS_TOKEN) || '';

      if (!savedToken) {
        if (mounted) {
          setAuth(null);
          setLoading(false);
        }
        return;
      }

      try {
        await warmUp(); // opcional (Render)
        // Si /auth/me devuelve 401, nuestro interceptor NO redirige (por la excepción), aquí lo manejamos.
        const res = await api.get('/auth/me');
        const next = {
          token: savedToken,
          user: res?.data?.user || null,
          permissions: Array.isArray(res?.data?.permissions) ? res.data.permissions : [],
        };
        if (mounted) {
          setAuth(next);
          writeAuth(next);
        }
      } catch (e) {
        // Cualquier fallo invalida sesión (401, CORS, Network Error, 5xx).
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

  /* ===== acciones ===== */
  async function login(usuario, contrasena) {
    await warmUp();

    let data = null;
    // reintentos  solo para 503/Network Error
    for (let i = 0; i < 3 && !data; i++) {
      try {
        const res = await loginFormUrlencoded({ usuario, contrasena });
        data = res.data;
      } catch (e) {
        const status = e?.response?.status;
        const isTransient = status === 503 || e?.message === 'Network Error';
        if (!isTransient) throw e;
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
    if (!data) throw new Error('Servidor no disponible. Intenta de nuevo.');

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

  /* ===== helpers ===== */
  const role = String(auth?.user?.rol || '').toUpperCase();
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
