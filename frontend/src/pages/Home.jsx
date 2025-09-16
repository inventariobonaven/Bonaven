// src/pages/Home.jsx
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import api from '../api/client';

/* Helpers */
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const isExpired = (d) => (d ? startOfDay(d) < startOfDay(new Date()) : false);
const expiringSoon = (d, days = 15) => {
  if (!d) return false;
  const f = startOfDay(d),
    t = startOfDay(new Date());
  const diff = (f - t) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
};
const isAdminRole = (r) => String(r || '').toUpperCase() === 'ADMIN';

export default function Home() {
  const { user } = useAuth();
  const isAdmin = isAdminRole(user?.rol);

  // Estados solo usados por Admin
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [materias, setMaterias] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [usuarios, setUsuarios] = useState([]);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const [M, L, P, U] = await Promise.all([
        api.get('/materias-primas'),
        api.get('/lotes-materia-prima'),
        api.get('/proveedores'),
        api.get('/usuarios'),
      ]);
      setMaterias(Array.isArray(M.data) ? M.data : []);
      setLotes(Array.isArray(L.data) ? L.data : []);
      setProveedores(Array.isArray(P.data) ? P.data : []);
      setUsuarios(Array.isArray(U.data) ? U.data : []);
    } catch (e) {
      setErr(e?.response?.data?.message || 'No se pudo cargar el resumen');
    } finally {
      setLoading(false);
    }
  }

  // Solo Admin carga datos
  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  /* KPIs (solo Admin) */
  const kpis = useMemo(() => {
    const mpTotal = materias.length;
    const mpActivas = materias.filter((m) => m.estado).length;
    const lotesActivos = lotes.filter((l) => l.estado && !isExpired(l.fecha_vencimiento)).length;
    const lotesVencidos = lotes.filter((l) => isExpired(l.fecha_vencimiento)).length;
    const lotesPronto = lotes.filter((l) => expiringSoon(l.fecha_vencimiento, 15)).length;
    const provActivos = proveedores.filter((p) => p.estado).length;
    const usersAdmin = usuarios.filter((u) => isAdminRole(u.rol)).length;
    const usersProd = usuarios.filter((u) => !isAdminRole(u.rol)).length;
    return {
      mpTotal,
      mpActivas,
      lotesActivos,
      lotesVencidos,
      lotesPronto,
      provActivos,
      usersAdmin,
      usersProd,
    };
  }, [materias, lotes, proveedores, usuarios]);

  const proximosVencimientos = useMemo(() => {
    return [...lotes]
      .filter((l) => expiringSoon(l.fecha_vencimiento, 15))
      .sort(
        (a, b) =>
          new Date(a.fecha_vencimiento || '9999-12-31') -
          new Date(b.fecha_vencimiento || '9999-12-31'),
      )
      .slice(0, 6);
  }, [lotes]);

  return (
    <div className="page">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Bienvenido al Sistema de Inventario & Producción</h2>

        {/* Vista Producción (sin datos sensibles) */}
        {!isAdmin && (
          <>
            <p className="muted" style={{ marginTop: -6 }}>
              Aquí puedes trabajar con materias primas, lotes por proveedor (FIFO) y apoyar la
              producción según las recetas definidas.
            </p>

            <div className="card" style={{ marginTop: 12 }}>
              <h3 style={{ marginTop: 0 }}>¿Qué puedes hacer aquí?</h3>
              <ul style={{ marginTop: 6 }}>
                <li>
                  Registrar produccion dependiendo la <strong>Masa</strong>.
                </li>
                <li>
                  Registra cantidad usada en la alimentacion de la <strong>Masa Madre</strong>
                </li>
              </ul>
              <p className="muted" style={{ marginTop: 6 }}>
                Nota: el acceso a configuraciones y reportes detallados está reservado para el rol
                Admin.
              </p>
            </div>
          </>
        )}

        {/* Vista Admin (dashboard completo) */}
        {isAdmin && (
          <>
            <p className="muted" style={{ marginTop: -6 }}>
              Controla materias primas, lotes por proveedor con lógica FIFO, producción con recetas
              y stock de producto terminado. También encontrarás trazabilidad y auditoría (solo
              Admin).
            </p>

            {err && (
              <div className="alert" style={{ marginTop: 10 }}>
                {err}
              </div>
            )}

            <div className="row" style={{ marginTop: 14 }}>
              <div className="card">
                <div className="muted">Materias primas</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{kpis.mpTotal}</div>
                <div className="muted">Activas: {kpis.mpActivas}</div>
              </div>

              <div className="card">
                <div className="muted">Lotes</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{kpis.lotesActivos}</div>
                <div className="muted">
                  Vencidos: {kpis.lotesVencidos} · Por vencer (15d): {kpis.lotesPronto}
                </div>
              </div>

              <div className="card">
                <div className="muted">Proveedores activos</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{kpis.provActivos}</div>
              </div>

              <div className="card">
                <div className="muted">Usuarios</div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>{usuarios.length}</div>
                <div className="muted">
                  Admin: {kpis.usersAdmin} · Producción: {kpis.usersProd}
                </div>
              </div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>¿Qué puedes hacer aquí?</h3>
              <ul style={{ marginTop: 6 }}>
                <li>
                  Definir y mantener <strong>materias primas</strong> (unidad, tipo y estado).
                </li>
                <li>
                  Registrar <strong>lotes por proveedor</strong>, con fecha de ingreso y
                  vencimiento.
                </li>
                <li>
                  Monitorear <strong>vencimientos</strong> y <strong>stock</strong>
                </li>
                <li>
                  Gestionar <strong>usuarios</strong> y <strong>roles</strong> (Admin / Producción).
                </li>
                <li>Auditar cambios críticos (ediciones y eliminaciones, reservado para Admin).</li>
              </ul>
              <p className="muted" style={{ marginTop: 6 }}>
                Nota: puedes acceder a cada módulo desde el menú lateral izquierdo.
              </p>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <h3 style={{ marginTop: 0 }}>Lotes que vencen pronto (≤ 15 días)</h3>
              {loading ? (
                <div style={{ padding: 10 }}>Cargando…</div>
              ) : proximosVencimientos.length === 0 ? (
                <div className="muted">No hay lotes próximos a vencer.</div>
              ) : (
                <table className="table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 80 }}>ID</th>
                      <th>Materia</th>
                      <th>Proveedor</th>
                      <th>Vence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proximosVencimientos.map((l) => (
                      <tr key={l.id}>
                        <td>{l.id}</td>
                        <td>{l.materias_primas?.nombre || '-'}</td>
                        <td>{l.proveedores?.nombre || '-'}</td>
                        <td>
                          {l.fecha_vencimiento
                            ? new Date(l.fecha_vencimiento).toLocaleDateString()
                            : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
