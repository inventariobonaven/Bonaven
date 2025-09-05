import { createContext, useContext, useEffect, useState } from 'react';
import axios from 'axios';
import api from '../api/client';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(null); // { token, user, permissions }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const raw = localStorage.getItem('auth');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        setAuth(parsed);

        if (parsed?.token) {
          api.defaults.headers.common.Authorization = `Bearer ${parsed.token}`;
          axios.defaults.headers.common.Authorization = `Bearer ${parsed.token}`;
        }
      } catch {
        localStorage.removeItem('auth');
      }
    }
    setLoading(false);
  }, []);

  const login = async (usuario, contrasena) => {
    const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const res = await axios.post(`${baseURL}/auth/login`, { usuario, contrasena });

    const data = {
      token: res.data.token,
      user: res.data.user,
      permissions: res.data.permissions || [],
    };

    localStorage.setItem('auth', JSON.stringify(data));
    localStorage.setItem('token', res.data.token);

    api.defaults.headers.common.Authorization = `Bearer ${res.data.token}`;
    axios.defaults.headers.common.Authorization = `Bearer ${res.data.token}`;

    setAuth(data);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('auth');
    localStorage.removeItem('token');
    setAuth(null);
    delete api.defaults.headers.common.Authorization;
    delete axios.defaults.headers.common.Authorization;
    window.location.href = '/login';
  };

  // ---------- helpers de rol/permisos ----------
  const role = String(auth?.user?.rol || '').toUpperCase(); // 'ADMIN' | 'PRODUCCION' | ''
  const isAdmin = role === 'ADMIN';

  const perms = Array.isArray(auth?.permissions) ? auth.permissions : [];
  const has = (...keys) => keys.every(k => perms.includes(k));

  return (
    <AuthCtx.Provider
      value={{
        auth,
        user: auth?.user,
        token: auth?.token,
        permissions: perms,
        isAdmin,
        has,
        login,
        logout,
        loading,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}


