// src/api/client.js
import axios from 'axios';

const root = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
const api = axios.create({
  baseURL: `${root}/api`,
  withCredentials: true,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
});

function getAuth() {
  try {
    return JSON.parse(localStorage.getItem('auth') || 'null');
  } catch {
    return null;
  }
}
function clearAuth() {
  try {
    localStorage.removeItem('auth');
    localStorage.removeItem('token');
  } catch {}
}

api.interceptors.request.use((config) => {
  try {
    const path = (config.url || '').toString();
    const isAuthEndpoint = path.startsWith('/auth') || path.includes('/auth/'); // no Bearer en /auth/*
    if (!isAuthEndpoint) {
      const auth = getAuth();
      const token = auth?.token || localStorage.getItem('token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    clearAuth();
  }
  return config;
});

let redirecting = false;

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const status = error?.response?.status;
    const onLoginScreen = window.location.pathname === '/login';
    if ((status === 401 || status === 403 || status === 419) && !onLoginScreen) {
      if (!redirecting) {
        redirecting = true;
        clearAuth();
        window.location.replace('/login?expired=1');
      }
    }
    return Promise.reject(error);
  },
);

export default api;
