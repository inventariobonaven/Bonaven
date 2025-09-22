// src/api/client.js
import axios from 'axios';

/** Normaliza la URL del backend y garantiza el sufijo /api */
function buildApiBase(raw) {
  const root = (raw || 'http://localhost:3001').replace(/\/+$/, ''); // sin slash final
  return /\/api$/i.test(root) ? root : `${root}/api`;
}

// ⚠️ VITE_API_URL debe apuntar al ROOT del backend (SIN /api)
export const API_BASE = buildApiBase(import.meta.env.VITE_API_URL);

/** ===== instancia axios ===== */
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

// Debug: ver a dónde apunta en runtime
if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
  // eslint-disable-next-line no-console
  console.log('[api] baseURL =', API_BASE);
}

/* ===== helpers de auth (localStorage) ===== */
const LS_AUTH = 'auth';
const LS_TOKEN = 'token';

function readAuthObj() {
  try {
    return JSON.parse(localStorage.getItem(LS_AUTH) || 'null');
  } catch {
    return null;
  }
}

// Saca token y lo sanea
function getToken() {
  const a = readAuthObj();
  let t = a?.token || localStorage.getItem(LS_TOKEN) || '';
  if (!t) return '';
  return String(t)
    .replace(/[\r\n]+/g, '')
    .trim();
}

function clearAuth() {
  try {
    localStorage.removeItem(LS_AUTH);
    localStorage.removeItem(LS_TOKEN);
  } catch {}
}

/* ===== interceptores ===== */
/* ===== interceptores ===== */
api.interceptors.request.use((config) => {
  const url = String(config.url || '');
  // ⬇️ Solo el login va SIN token
  const isLogin = url.includes('/auth/login');
  if (!isLogin) {
    const token = getToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

let redirecting = false;
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const cfg = error?.config || {};
    const onLogin = typeof window !== 'undefined' && window.location.pathname === '/login';
    const hadAuth = !!cfg?.headers?.Authorization;

    // ⬇️ Permite saltarse la redirección en llamadas marcadas (ej: /auth/me)
    const skip = !!cfg.__skip401Redirect;

    if (status === 401 && hadAuth && !onLogin && !skip) {
      if (!redirecting) {
        redirecting = true;
        try {
          localStorage.removeItem('auth');
          localStorage.removeItem('token');
        } catch {}
        const u = new URL('/login', window.location.origin);
        u.searchParams.set('expired', '1');
        window.location.replace(u.toString());
      }
      return;
    }
    return Promise.reject(error);
  },
);

export default api;
