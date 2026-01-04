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

/* Recupera la sesión al recargar:
   - Si AuthContext ya tiene usuario, habilita navegación.
   - Si existe token en almacenamiento, consulta /auth/me para validar y reconstruir el usuario.
   - Si /auth/me falla, limpia credenciales y fuerza login. */
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
      if (user) {
        if (!cancelled) setState({ loading: false, ok: true, me: user });
        return;
      }

      const token = getToken();
      if (!token) {
        if (!cancelled) setState({ loading: false, ok: false, me: null });
        return;
      }

      try {
        const { data } = await api.get('/auth/me');

        // Mantiene sincronizado el AuthContext si expone setUser
        if (setUser) {
          try {
            setUser(data);
          } catch {}
        }

        if (!cancelled) setState({ loading: false, ok: true, me: data });

        // Apoyo para validaciones fuera de contexto si existieran
        if (typeof window !== 'undefined') window.__me = data;
      } catch {
        // Token inválido/expirado: se elimina para evitar bucles de navegación
        clearAuth();
        if (!cancelled) setState({ loading: false, ok: false, me: null });
      }
    }

    // Si el provider aún está resolviendo estado inicial, se difiere el bootstrap
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

/* Protege rutas autenticadas:
   - Mientras se valida sesión, muestra estado de carga.
   - Si no hay sesión válida, redirige a /login. */
function PrivateRoute({ children }) {
  const boot = useSessionBootstrap();
  if (boot.loading) return <div style={{ padding: 24 }}>Cargando…</div>;
  if (boot.ok) return children;
  return <Navigate to="/login" replace />;
}

/* Protección por rol:
   - Acepta un rol único o un listado de roles permitidos.
   - Si el rol del usuario no coincide, redirige al inicio. */
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Ruta pública */}
          <Route path="/login" element={<Login />} />

          {/* Área privada: Layout + rutas anidadas */}
          <Route
            path="/"
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<Home />} />
            {/* Módulos restringidos a ADMIN */}
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
            {/* Módulos PT */}
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
            {/* Flujos compartidos (ADMIN y PRODUCCION) */}
            <Route
              path="salidas-pt"
              element={
                <RequireRole roles={['ADMIN', 'PRODUCCION']}>
                  <SalidasPT />
                </RequireRole>
              }
            />
            <Route
              path="congelados"
              element={
                <RequireRole roles={['ADMIN', 'PRODUCCION']}>
                  <Congelados />
                </RequireRole>
              }
            />
            <Route
              path="cultivos"
              element={
                <RequireRole roles={['ADMIN', 'PRODUCCION']}>
                  <Cultivos />
                </RequireRole>
              }
            />
            <Route
              path="produccion"
              element={
                <RequireRole roles={['ADMIN', 'PRODUCCION']}>
                  <Produccion />
                </RequireRole>
              }
            />
            {/* Reporte/administración de producciones (solo ADMIN) */}
            <Route
              path="producciones"
              element={
                <RequireRole role="ADMIN">
                  <Producciones />
                </RequireRole>
              }
            />
            /* Redirecciones para compatibilidad con rutas antiguas usadas por usuarios/bookmarks */
            <Route path="ingreso-pt" element={<Navigate to="/stock-pt" replace />} />
            <Route path="lotes-pt" element={<Navigate to="/stock-pt" replace />} />
          </Route>

          {/* Ruta no encontrada: redirige al home (si no hay sesión, PrivateRoute llevará a /login) */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
