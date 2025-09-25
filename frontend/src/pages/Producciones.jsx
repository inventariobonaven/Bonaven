// src/pages/Producciones.jsx
import { useEffect, useState } from 'react';
import api from '../api/client';

/* ===== UI ===== */
function Toast({ type = 'success', message, onClose }) {
  if (!message) return null;
  return (
    <div
      className="card"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 10000,
        borderColor: type === 'error' ? '#ffccc7' : 'var(--border)',
        background: type === 'error' ? '#fff2f0' : '#f6ffed',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <strong style={{ color: type === 'error' ? '#a8071a' : '#237804' }}>
          {type === 'error' ? 'Error' : 'Listo'}
        </strong>
        <span>{message}</span>
        <button className="btn-outline" onClick={onClose} style={{ width: 'auto' }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

const fmtDec = (x) => {
  const n = typeof x === 'string' ? parseFloat(x) : Number(x);
  if (Number.isNaN(n)) return '0';
  return (Math.round(n * 1000) / 1000).toString();
};

function toSmall(qty, baseUnit) {
  const n = Number(qty) || 0;
  const u = String(baseUnit || '').toLowerCase();
  if (u === 'kg') return { value: n * 1000, unit: 'g' };
  if (u === 'l') return { value: n * 1000, unit: 'ml' };
  if (u === 'g') return { value: n, unit: 'g' };
  if (u === 'ml') return { value: n, unit: 'ml' };
  return { value: n, unit: 'ud' };
}

/* ===== Helpers de fecha/hora (evitar “día -1”) ===== */
const DATE_LOCALE = 'es-CO';

function fmtFecha(value) {
  if (!value) return '—';
  const s = String(value);

  // Caso 1: viene como "YYYY-MM-DD"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;

  // Caso 2: ISO con hora (ej. "2025-09-24T00:00:00.000Z")
  const d = new Date(s);
  if (isNaN(d)) return s;
  // Mostrar en UTC para no correrse por zona horaria
  return d.toLocaleDateString(DATE_LOCALE, { timeZone: 'UTC' });
}

function fmtHora(value) {
  if (!value) return null;
  const d = new Date(value);
  if (isNaN(d)) return null;
  return d.toLocaleTimeString(DATE_LOCALE, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/* ===== Modal centrado (overlay) ===== */
function CenterModal({ open, title, onClose, children, width = 720 }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev || '';
    };
  }, [open]);

  useEffect(() => {
    function onKey(e) {
      if (open && e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.35)',
        display: 'grid',
        placeItems: 'center',
        padding: 12,
      }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width: `min(${width}px, 96vw)`,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          background: '#fff',
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn-outline" onClick={onClose} style={{ width: 'auto' }}>
            ✕
          </button>
        </div>
        <div style={{ padding: 12, overflow: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

function InsumosContent({ data, loading }) {
  if (loading)
    return (
      <div className="muted" style={{ padding: 8 }}>
        Cargando…
      </div>
    );
  if (!data || data.length === 0)
    return (
      <div className="muted" style={{ padding: 8 }}>
        No hay insumos consumidos
      </div>
    );

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {data.map((mp) => {
        const small = toSmall(mp.total, mp.unidad_base);
        return (
          <div key={mp.materia_prima_id} className="card" style={{ padding: 8 }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <div>
                <strong>{mp.nombre}</strong>
                <div className="muted">Unidad base: {mp.unidad_base}</div>
              </div>
              <div>
                <strong>
                  {fmtDec(small.value)} {small.unit}
                </strong>
              </div>
            </div>

            {!!(mp.detalle || []).length && (
              <div style={{ marginTop: 8 }}>
                <div className="muted" style={{ marginBottom: 4 }}>
                  Lotes:
                </div>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 100 }}>Lote</th>
                      <th>Vence</th>
                      <th style={{ textAlign: 'right' }}>Usado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mp.detalle.map((d, i) => {
                      const s = toSmall(d.cantidad, mp.unidad_base);
                      return (
                        <tr key={`${mp.materia_prima_id}-${d.lote_id}-${i}`}>
                          <td>
                            {d.lote_codigo
                              ? `#${d.lote_codigo}`
                              : d.lote_id
                                ? `#${d.lote_id}`
                                : '—'}
                          </td>
                          <td>{d.fecha_vencimiento ? fmtFecha(d.fecha_vencimiento) : '—'}</td>
                          <td style={{ textAlign: 'right' }}>
                            {fmtDec(s.value)} {s.unit}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ===== Página ===== */
export default function Producciones() {
  // filtros
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [recetaId, setRecetaId] = useState('');
  const [q, setQ] = useState('');

  // datos
  const [recetas, setRecetas] = useState([]);
  const [loadingRecetas, setLoadingRecetas] = useState(true);

  // listado
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState({ type: 'success', message: '' });

  // Modal de insumos + caché
  const [modalOpen, setModalOpen] = useState(false);
  const [modalFor, setModalFor] = useState(null); // row
  const [insumosCache, setInsumosCache] = useState(new Map());
  const [loadingInsumos, setLoadingInsumos] = useState(false);

  async function loadRecetas() {
    setLoadingRecetas(true);
    try {
      const params = new URLSearchParams();
      params.set('estado', 'true');
      const { data } = await api.get(`/recetas?${params.toString()}`);
      setRecetas(Array.isArray(data) ? data : []);
    } catch {
      setRecetas([]);
      setToast({ type: 'error', message: 'No se pudieron cargar recetas' });
    } finally {
      setLoadingRecetas(false);
    }
  }

  async function loadProducciones(customPage = 1) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.set('desde', desde);
      if (hasta) params.set('hasta', hasta);
      if (recetaId) params.set('receta_id', String(recetaId));
      if (q.trim()) params.set('q', q.trim());
      params.set('page', String(customPage));
      params.set('pageSize', String(pageSize));

      const { data } = await api.get(`/produccion?${params.toString()}`);
      const rows = Array.isArray(data?.items) ? data.items : [];
      setItems(rows);
      setTotal(Number(data?.total || rows.length || 0));
      setPage(Number(data?.page || customPage));
      setPageSize(Number(data?.pageSize || pageSize));
      setModalOpen(false);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'Error cargando producciones',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecetas();
    loadProducciones(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetFilters() {
    setDesde('');
    setHasta('');
    setRecetaId('');
    setQ('');
    setModalOpen(false);
    loadProducciones(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function openInsumos(row) {
    setModalFor(row);
    setModalOpen(true);

    if (!insumosCache.has(row.id)) {
      try {
        setLoadingInsumos(true);
        const { data } = await api.get(`/produccion/${row.id}/insumos`);
        const arr = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
        setInsumosCache((m) => {
          const copy = new Map(m);
          copy.set(row.id, arr);
          return copy;
        });
      } catch (e) {
        setToast({
          type: 'error',
          message: e?.response?.data?.message || 'No se pudieron cargar los insumos',
        });
      } finally {
        setLoadingInsumos(false);
      }
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Historial de producción</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          Filtra por fecha, receta o texto (en observación/nombre de receta). Haz click en “Insumos”
          para ver lo consumido.
        </div>

        {/* Filtros */}
        <div
          className="filters"
          style={{
            marginTop: 12,
            display: 'grid',
            gap: 8,
            gridTemplateColumns: '160px 160px 1fr 1fr auto',
          }}
        >
          <input
            type="date"
            lang="es-CO"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            title="Desde"
          />
          <input
            type="date"
            lang="es-CO"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            title="Hasta"
          />
          <select
            value={recetaId}
            onChange={(e) => setRecetaId(e.target.value)}
            disabled={loadingRecetas}
          >
            <option value="">{loadingRecetas ? 'Cargando...' : 'Todas las recetas'}</option>
            {recetas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
                {r.categoria ? ` · ${r.categoria.nombre}` : ''}
              </option>
            ))}
          </select>
          <input
            placeholder="Buscar (observación / receta)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-outline"
              style={{ width: 'auto' }}
              onClick={() => loadProducciones(1)}
              disabled={loading}
            >
              {loading ? 'Buscando…' : 'Buscar'}
            </button>
            <button
              className="btn-outline"
              style={{ width: 'auto' }}
              onClick={resetFilters}
              disabled={loading}
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Fecha</th>
                <th>Receta</th>
                <th style={{ width: 120, textAlign: 'right' }}>Masas</th>
                <th>Salida esperada</th>
                <th style={{ width: 170 }}>Horario</th>
                <th style={{ width: 110, textAlign: 'right' }}>Duración</th>
                <th>Observación</th>
                <th style={{ width: 120 }}>Insumos</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} style={{ padding: 14 }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 14, textAlign: 'center' }}>
                    Sin resultados
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((p) => {
                  const rec = p.recetas;
                  const pres = rec?.presentaciones;
                  const rpb = Number(rec?.rendimiento_por_batch || 1);
                  const salida = rpb * Number(p.cantidad_producida || 0);

                  const fechaStr = fmtFecha(p.fecha);
                  const hi = fmtHora(p.hora_inicio);
                  const hf = fmtHora(p.hora_fin);

                  return (
                    <tr key={p.id}>
                      <td>{fechaStr}</td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <strong>{rec?.nombre || `Receta #${p.receta_id}`}</strong>
                          {pres ? (
                            <span className="muted">
                              {pres.nombre} · {fmtDec(pres.cantidad)} {pres.unidad_medida}
                            </span>
                          ) : (
                            <span className="muted">Sin presentación</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmtDec(p.cantidad_producida)}</td>
                      <td>
                        {fmtDec(salida)}{' '}
                        {pres
                          ? `${pres.nombre} (${fmtDec(pres.cantidad)} ${pres.unidad_medida})`
                          : 'unidades'}
                      </td>
                      <td>{hi && hf ? `${hi} – ${hf}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {p.duracion_minutos ? `${p.duracion_minutos} min` : '—'}
                      </td>
                      <td
                        style={{
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={p.observacion || ''}
                      >
                        {p.observacion || '—'}
                      </td>
                      <td>
                        <button
                          className="btn-outline"
                          style={{ width: 'auto' }}
                          onClick={() => openInsumos(p)}
                          title="Ver insumos usados"
                        >
                          🧪 Insumos
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>

          {/* Paginado */}
          <div
            style={{
              marginTop: 10,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
              flexWrap: 'wrap',
            }}
          >
            <div className="muted">
              {total} registro{total === 1 ? '' : 's'} · Página {page} /{' '}
              {Math.max(1, Math.ceil(total / pageSize))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn-outline"
                style={{ width: 'auto' }}
                disabled={loading || page <= 1}
                onClick={() => loadProducciones(page - 1)}
              >
                ◀️ Anterior
              </button>
              <button
                className="btn-outline"
                style={{ width: 'auto' }}
                disabled={loading || page >= Math.max(1, Math.ceil(total / pageSize))}
                onClick={() => loadProducciones(page + 1)}
              >
                Siguiente ▶️
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal centrado de Insumos */}
      <CenterModal
        open={modalOpen}
        title={
          modalFor
            ? `Insumos de producción #${modalFor.id} · ${modalFor?.recetas?.nombre || ''}`
            : 'Insumos'
        }
        onClose={() => setModalOpen(false)}
      >
        <InsumosContent
          data={modalFor ? insumosCache.get(modalFor.id) : []}
          loading={loadingInsumos && !(modalFor && insumosCache.has(modalFor.id))}
        />
      </CenterModal>

      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: '' })}
      />
    </div>
  );
}
