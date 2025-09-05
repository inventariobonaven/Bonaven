import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth/AuthContext';

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
import SalidasPT from "./pages/SalidasPT";
import CategoriasReceta from "./pages/CategoriasReceta";
import Empaques from './pages/Empaques';
import ProductosPT from './pages/ProductosPT';
import StockPT from './pages/StockPT';
import MovimientosPT from './pages/MovimientosPT';
import Layout from './components/Layout';
import Congelados from './pages/Congelados';
import Cultivos from './pages/Cultivos';

/* ---------- Guards ---------- */
function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 24 }}>Cargando…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ role, roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 24 }}>Cargando…</div>;

  const have = String(user?.rol || '').toUpperCase();
  const list = roles
    ? roles.map(r => String(r).toUpperCase())
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

            {/* 👇 NUEVO: Cultivos (masa madre) */}
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


