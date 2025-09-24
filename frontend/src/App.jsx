import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';
import api, { getToken, clearAuth } from './api/client';

import Login from './pages/Login';
import Home from './pages/Home';
import MateriasPrimas from './pages/MateriasPrimas';
import Lotes from './pages/Lotes';
import Proveedores from './pages/Proveedores';
import Usuarios from './pages/Usuarios';
import Produccion from './pages/Produccion';
import Recetas from './pages/Recetas';
import MovimientosMP from './pages/MovimientosMP';
import Producciones from './pages/Producciones';
import SalidasPT from './pages/SalidasPT';
import CategoriasReceta from './pages/CategoriasReceta';
import Empaques from './pages/Empaques';
import ProductosPT from './pages/ProductosPT';
import StockPT from './pages/StockPT';
import MovimientosPT from './pages/MovimientosPT';
import Layout from './components/Layout';
import Congelados from './pages/Congelados';
import Cultivos from './pages/Cultivos';
import { useEffect, useState } from 'react';

/* -----------------------------------------------------------
   Bootstrap de sesión: si AuthContext no tiene user pero hay
   token en localStorage, validamos/renovamos con /auth/me.
   Si AuthContext expone setUser, lo usamos (si no, igual sirve).
----------------------------------------------------------- */
function useSessionBootstrap() {
  const ctx = useAuth?.() || {};
  const { user, loading, setUser } = ctx;

  const [state, setState] = useState({
    loading: true,
    ok: false,
    me: user || null,
  });

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Si el AuthProvider ya tiene user, ok
      if (user) {
        if (!cancelled) setState({ loading: false, ok: true, me: user });
        return;
      }
      // Si no hay token, no hay sesión
      const token = getToken();
      if (!token) {
        if (!cancelled) setState({ loading: false, ok: false, me: null });
        return;
      }
      // Validar/recuperar usuario
      try {
        const { data } = await api.get('/auth/me');
        if (setUser) {
          try {
            setUser(data);
          } catch {}
        }
        if (!cancelled) setState({ loading: false, ok: true, me: data });
        // Guarda en ventana para RequireRole si hiciera falta
        if (typeof window !== 'undefined') window.__me = data;
      } catch {
        clearAuth();
        if (!cancelled) setState({ loading: false, ok: false, me: null });
      }
    }

    // Si el AuthProvider aún está cargando, esperamos a que termine.
    if (loading) {
      setState((s) => ({ ...s, loading: true }));
      const id = setTimeout(run, 0);
      return () => {
        clearTimeout(id);
        cancelled = true;
      };
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  return state; // { loading, ok, me }
}

/* ---------- Guards ---------- */
function PrivateRoute({ children }) {
  const boot = useSessionBootstrap();
  if (boot.loading) return <div style={{ padding: 24 }}>Cargando…</div>;
  if (boot.ok) return children;
  return <Navigate to="/login" replace />;
}

/** Si hay roles requeridos, valida contra el usuario “bootstrapped”.
 *  Si AuthContext todavía no tiene user pero /auth/me sí, igual permite.
 */
function RequireRole({ role, roles, children }) {
  const boot = useSessionBootstrap();
  if (boot.loading) return <div style={{ padding: 24 }}>Cargando…</div>;

  const have = String(boot.me?.rol || '').toUpperCase();
  const list = roles
    ? roles.map((r) => String(r).toUpperCase())
    : role
      ? [String(role).toUpperCase()]
      : [];

  if (list.length && !list.includes(have)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

/* ---------- App ---------- */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Home />} />

            {/* Solo ADMIN */}
            <Route
              path="materias-primas"
              element={
                <RequireRole role="ADMIN">
                  <MateriasPrimas />
                </RequireRole>
              }
            />
            <Route
              path="recetas"
              element={
                <RequireRole role="ADMIN">
                  <Recetas />
                </RequireRole>
              }
            />
            <Route
              path="salidas-pt"
              element={
                <RequireRole roles={['ADMIN', 'PRODUCCION']}>
                  <SalidasPT />
                </RequireRole>
              }
            />
            <Route
              path="categorias-receta"
              element={
                <RequireRole role="ADMIN">
                  <CategoriasReceta />
                </RequireRole>
              }
            />
            <Route
              path="lotes"
              element={
                <RequireRole role="ADMIN">
                  <Lotes />
                </RequireRole>
              }
            />
            <Route
              path="proveedores"
              element={
                <RequireRole role="ADMIN">
                  <Proveedores />
                </RequireRole>
              }
            />
            <Route
              path="usuarios"
              element={
                <RequireRole role="ADMIN">
                  <Usuarios />
                </RequireRole>
              }
            />
            <Route
              path="movimientos"
              element={
                <RequireRole role="ADMIN">
                  <MovimientosMP />
                </RequireRole>
              }
            />

            {/* PT */}
            <Route
              path="empaques"
              element={
                <RequireRole role="ADMIN">
                  <Empaques />
                </RequireRole>
              }
            />
            <Route
              path="productos-pt"
              element={
                <RequireRole role="ADMIN">
                  <ProductosPT />
                </RequireRole>
              }
            />
            <Route
              path="stock-pt"
              element={
                <RequireRole roles={['ADMIN', 'PRODUCCION']}>
                  <StockPT />
                </RequireRole>
              }
            />
            <Route
              path="movimientos-pt"
              element={
                <RequireRole role="ADMIN">
                  <MovimientosPT />
                </RequireRole>
              }
            />

            {/* EXISTENTE: Flujo de congelados */}
            <Route
              path="congelados"
              element={
                <RequireRole roles={['ADMIN', 'PRODUCCION']}>
                  <Congelados />
                </RequireRole>
              }
            />

            {/* NUEVO: Cultivos (masa madre) */}
            <Route
              path="cultivos"
              element={
                <RequireRole roles={['ADMIN', 'PRODUCCION']}>
                  <Cultivos />
                </RequireRole>
              }
            />

            {/* Producción: ADMIN y PRODUCCION */}
            <Route
              path="produccion"
              element={
                <RequireRole roles={['ADMIN', 'PRODUCCION']}>
                  <Produccion />
                </RequireRole>
              }
            />
            <Route
              path="producciones"
              element={
                <RequireRole role="ADMIN">
                  <Producciones />
                </RequireRole>
              }
            />

            {/* Redirecciones de rutas antiguas */}
            <Route path="ingreso-pt" element={<Navigate to="/stock-pt" replace />} />
            <Route path="lotes-pt" element={<Navigate to="/stock-pt" replace />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
