// src/components/Layout.jsx
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import NotificationBell from './NotificationBell';
import NotificationToaster from './NotificationToaster';
import './Layout.css';

/* ====== Menú por rol ====== */
const NAV_ADMIN = [
  { to: '/', label: 'Inicio', icon: '🏠', exact: true },
  { to: '/proveedores', label: 'Proveedores', icon: '🧾' },
  { to: '/materias-primas', label: 'Materias primas', icon: '📦' },
  { to: '/lotes', label: 'Ingreso Lotes MP', icon: '🧮' },
  { to: '/movimientos', label: 'Movimientos MP', icon: '🔀' },
  { to: '/categorias-receta', label: 'Categorías Receta', icon: '🏷️' },
  { to: '/empaques', label: 'Empaques', icon: '📦' },
  { to: '/productos-pt', label: 'Productos Terminados', icon: '🧁' },
  { to: '/salidas-pt', label: 'Salidas PT', icon: '📤' },
  { to: '/stock-pt', label: 'Stock de PT (lotes)', icon: '📊' },
  { to: '/movimientos-pt', label: 'Movimientos PT', icon: '↔️' },
  { to: '/produccion', label: 'Producción', icon: '⚙️' },
  { to: '/producciones', label: 'Historial Producciones', icon: '📈' },
  { to: '/recetas', label: 'Recetas', icon: '📜' },
  { to: '/congelados', label: 'Congelados', icon: '🧊' },
  { to: '/cultivos', label: 'Masa madre', icon: '🧫' },
  { to: '/usuarios', label: 'Usuarios', icon: '👥' },
];

const NAV_PROD = [
  { to: '/', label: 'Inicio', icon: '🏠', exact: true },
  { to: '/produccion', label: 'Producción', icon: '⚙️' },
  { to: '/cultivos', label: 'Masa Madre', icon: '🧫' },
];

/* Título según ruta (prefiere coincidencia más larga) */
function titleFromPath(pathname, nav) {
  if (pathname === '/') return 'Inicio';
  const hit = [...nav]
    .sort((a, b) => (b.to?.length || 0) - (a.to?.length || 0))
    .find((n) => n.to !== '/' && pathname.startsWith(n.to));
  return hit ? hit.label : 'Panel';
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const role = String(user?.rol || '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  const NAV = isAdmin ? NAV_ADMIN : NAV_PROD;

  // Si PRODUCCIÓN navega a una ruta fuera de su menú, regresa al Inicio
  useEffect(() => {
    if (!isAdmin) {
      const allowed = NAV_PROD.map((n) => n.to);
      const ok = allowed.some((p) => pathname === p || (p !== '/' && pathname.startsWith(p)));
      if (!ok) navigate('/', { replace: true });
    }
  }, [isAdmin, pathname, navigate]);

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <h3 className="brand">Inventario y Producción</h3>

        <nav>
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              <span className="icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="userbox">
          <small>
            {user?.nombre || user?.usuario} <strong>({role || 'SIN ROL'})</strong>
          </small>
          <button className="btn-outline" onClick={logout}>
            Salir
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        <header className="topbar">
          <div className="page-title">{titleFromPath(pathname, NAV)}</div>

          <div className="right-tools">
            {/* Campana de notificaciones: solo renderiza algo si el rol es ADMIN */}
            <NotificationBell />

            <span className="badge">{role || 'SIN ROL'}</span>
            <span className="muted">{user?.usuario}</span>
            <button className="btn-outline" onClick={logout}>
              Salir
            </button>
          </div>
        </header>

        <main className="content">
          <Outlet />
        </main>

        {/* Toaster flotante para notificaciones pendientes */}
        <NotificationToaster />
      </div>
    </div>
  );
}
