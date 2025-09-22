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

  // Arranque: rehidratar y verificar con /auth/me (sin botar por 503/Network Error)
  useEffect(() => {
    let mounted = true;

    (async () => {
      const saved = readAuth();
      if (!saved?.token) {
        if (mounted) setLoading(false);
        return;
      }

      // pinta lo guardado de inmediato
      if (mounted) {
        setAuth({
          token: saved.token,
          user: saved.user,
          permissions: Array.isArray(saved.permissions) ? saved.permissions : [],
        });
      }

      // intenta validar
      try {
        await warmUp(); // despierta Render
        let data = null;

        // 2 reintentos suaves solo por 503/Network Error
        for (let i = 0; i < 2 && !data; i++) {
          try {
            const res = await api.get('/auth/me');
            data = res.data;
          } catch (e) {
            const status = e?.response?.status;
            const net = e?.message === 'Network Error';
            if (status === 401) throw e; // 401 sí invalida
            if (!(status === 503 || net)) throw e; // otros errores, propaga
            // backoff corto y reintenta
            await new Promise((r) => setTimeout(r, 500 * (i + 1)));
          }
        }

        if (data) {
          const next = {
            token: saved.token,
            user: data?.user || saved.user || null,
            permissions: Array.isArray(data?.permissions)
              ? data.permissions
              : saved.permissions || [],
          };
          if (mounted) setAuth(next);
          writeAuth(next);
        }
      } catch (e) {
        // Solo limpiar si es 401 (token inválido/expirado)
        const status = e?.response?.status;
        if (status === 401) {
          clearAuth();
          if (mounted) setAuth(null);
        }
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

    // reintentos sólo para 503/Network Error
    let data = null;
    for (let i = 0; i < 3 && !data; i++) {
      try {
        const res = await loginFormUrlencoded({ usuario, contrasena });
        data = res.data;
      } catch (e) {
        const status = e?.response?.status;
        const isTransient = status === 503 || e?.message === 'Network Error';
        if (!isTransient) throw e;
        await new Promise((r) => setTimeout(r, 800 * (i + 1)));
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
