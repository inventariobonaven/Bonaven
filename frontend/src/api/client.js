import axios from 'axios';

/** Normaliza la URL del backend y garantiza el sufijo /api */
function buildApiBase(raw) {
  const root = (raw || 'http://localhost:3001').replace(/\/+$/, ''); // sin slash final
  return /\/api$/i.test(root) ? root : `${root}/api`;
}

// ⚠️ VITE_API_URL debe apuntar al ROOT del backend (SIN /api). Ej: https://inventario-backend.onrender.com
export const API_BASE = buildApiBase(import.meta.env.VITE_API_URL);

/** ===== instancia axios ===== */
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: false, // no usamos cookies/sesiones
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

/* Debug: ver a dónde está apuntando el frontend ya compilado */
if (typeof window !== 'undefined') {
  window.API_BASE = API_BASE;
  // eslint-disable-next-line no-console
  console.log('[api] baseURL =', API_BASE);
}

/* ===== helpers de auth ===== */
const LS_AUTH = 'auth';
const LS_TOKEN = 'token';

function readAuthObj() {
  try {
    return JSON.parse(localStorage.getItem(LS_AUTH) || 'null');
  } catch {
    return null;
  }
}

// Saca token de auth/token y lo sanea
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

    // Solo 401 → token inválido/expirado: limpiar y redirigir
    if (status === 401 && !onLogin) {
      if (!redirecting) {
        redirecting = true;
        clearAuth();
        const u = new URL('/login', window.location.origin);
        u.searchParams.set('expired', '1');
        window.location.replace(u.toString());
      }
      return; // cortamos la promesa
    }

    // 403/404/etc: que lo maneje cada view
    return Promise.reject(error);
  },
);

export default api;
