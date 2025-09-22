// src/api/client.js
import axios from 'axios';

/** Normaliza la URL del backend y garantiza el sufijo /api */
function buildApiBase(raw) {
  const root = (raw || 'http://localhost:3001').replace(/\/+$/, ''); // sin slash final
  return /\/api$/i.test(root) ? root : `${root}/api`;
}

// VITE_API_URL debe apuntar al ROOT del backend (SIN /api)
export const API_BASE = buildApiBase(import.meta.env.VITE_API_URL);
export const ROOT_BASE = API_BASE.replace(/\/api$/i, '');

/** ===== instancia axios ===== */
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

/* Debug: ver a dónde está apuntando el frontend ya compilado */
if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
  // eslint-disable-next-line no-console
  console.log('[api] baseURL =', API_BASE);
}

/* ===== helpers de auth (solo lectura/limpieza local) ===== */
const LS_AUTH = 'auth';
const LS_TOKEN = 'token';

function readAuthObj() {
  try {
    return JSON.parse(localStorage.getItem(LS_AUTH) || 'null');
  } catch {
    return null;
  }
}

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
api.interceptors.request.use((config) => {
  const url = String(config.url || '');
  const isAuthEndpoint = url.startsWith('/auth') || url.includes('/auth/');
  if (!isAuthEndpoint) {
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
    const onLogin = typeof window !== 'undefined' && window.location.pathname === '/login';
    const hadAuth = !!error?.config?.headers?.Authorization; // solo si enviamos token

    // Solo redirige en 401 reales con token (no por 503/Network Error)
    if (status === 401 && hadAuth && !onLogin) {
      if (!redirecting) {
        redirecting = true;
        clearAuth();
        const u = new URL('/login', window.location.origin);
        u.searchParams.set('expired', '1');
        window.location.replace(u.toString());
      }
      return;
    }
    return Promise.reject(error);
  },
);

/* ===== util: warm-up y login sin preflight ===== */

// Despierta la instancia en Render (ignora errores)
export async function warmUp() {
  try {
    await fetch(`${ROOT_BASE}/healthz`, { mode: 'cors', cache: 'no-store' });
  } catch {}
}

// Login como x-www-form-urlencoded para evitar preflight (OPTIONS)
export async function loginFormUrlencoded({ usuario, contrasena }) {
  const body = new URLSearchParams({ usuario, contrasena });
  return api.post('/auth/login', body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    transformRequest: [(d) => d],
  });
}

export default api;
