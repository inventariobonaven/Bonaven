// src/api/client.js
import axios from 'axios';

/** Normaliza la URL del backend y garantiza el sufijo /api */
function buildApiBase(raw) {
  const root = (raw || 'http://localhost:3001').replace(/\/+$/, ''); // sin slash final
  return /\/api$/i.test(root) ? root : `${root}/api`;
}

export const API_BASE = buildApiBase(import.meta.env.VITE_API_URL);

/** Instancia axios */
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

// Debug útil: ver a dónde está apuntando el frontend ya compilado
if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
  console.log('[api] baseURL =', API_BASE);
}

/* ====== Helpers de auth (localStorage) ====== */
const LS_AUTH = 'auth';
const LS_TOKEN = 'token';

function getAuth() {
  try {
    return JSON.parse(localStorage.getItem(LS_AUTH) || 'null');
  } catch {
    return null;
  }
}
function clearAuth() {
  try {
    localStorage.removeItem(LS_AUTH);
    localStorage.removeItem(LS_TOKEN);
  } catch {}
}

/* ====== Interceptores ====== */
api.interceptors.request.use((config) => {
  const path = String(config.url || '');
  const isAuthEndpoint = path.startsWith('/auth') || path.includes('/auth/');
  if (!isAuthEndpoint) {
    const auth = getAuth();
    const token = auth?.token || localStorage.getItem(LS_TOKEN);
    if (token) config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
  }
  return config;
});

let redirecting = false;
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const onLogin = typeof window !== 'undefined' && window.location.pathname === '/login';
    if ((status === 401 || status === 403 || status === 419) && !onLogin) {
      if (!redirecting) {
        redirecting = true;
        clearAuth();
        const u = new URL('/login', window.location.origin);
        u.searchParams.set('expired', '1');
        window.location.replace(u.toString());
      }
    }
    return Promise.reject(error);
  },
);

export default api;
