// src/pages/MovimientosPT.jsx
import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

/* ===== UI helpers ===== */
function Toast({ type = 'success', message, onClose }) {
  if (!message) return null;
  return (
    <div
      className="card"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 1000,
        borderColor: type === 'error' ? '#ffccc7' : 'var(--border)',
        background: type === 'error' ? '#fff2f0' : '#f6ffed',
      }}
      role="alert"
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

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0,0,0,.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="card"
        style={{
          width: 'min(900px, 98vw)',
          maxHeight: '85vh',
          overflow: 'auto',
          padding: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0 }}>{title}</h3>
            <div className="muted" style={{ marginTop: 4 }}>
              Detalle del envío a MiComercio
            </div>
          </div>
          <button className="btn-outline" onClick={onClose} style={{ width: 'auto' }}>
            Cerrar
          </button>
        </div>

        <div style={{ marginTop: 12 }}>{children}</div>
      </div>
    </div>
  );
}

/* ===== Fechas: estable en UTC (evita corrimientos de día) ===== */
const fmtDate = (x) => {
  if (!x) return '—';
  const s = String(x);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const [, y, mo, d] = m;
    return `${d}/${mo}/${y}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${dd}/${mo}/${y}`;
};

const fmtDateTime = (x) => {
  if (!x) return '—';
  const d = new Date(String(x));
  if (Number.isNaN(d.getTime())) return '—';
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${dd}/${mo}/${y} ${hh}:${mm}:${ss} UTC`;
};

const utcMidnightMs = (v) => {
  if (!v) return 0;
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    return Date.UTC(y, mo, d);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return 0;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/* ===== Orden alfabético ===== */
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const byNombre = (a, b) => collator.compare(String(a?.nombre || ''), String(b?.nombre || ''));

/* ===== Helpers de cantidad (paquetes/unidades) ===== */
const toInt = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0);

function formatCantidad(mov, productos) {
  const prod = productos.find((p) => Number(p.id) === Number(mov.producto_id));
  const uds = toInt(mov.cantidad);
  const uxe = toInt(mov?.unidades_por_empaque ?? prod?.unidades_por_empaque);
  if (uxe > 0) {
    const pk = Math.floor(uds / uxe);
    const rest = uds % uxe;
    if (pk > 0 && rest > 0) return `${pk} PQ + ${rest} ud (${uds} ud)`;
    if (pk > 0) return `${pk} PQ (${uds} ud)`;
    return `${rest} ud`;
  }
  return `${uds} ud`;
}

function prettyJson(value) {
  if (value === null || value === undefined) return '';
  try {
    if (typeof value === 'string') {
      const t = value.trim();
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        return JSON.stringify(JSON.parse(t), null, 2);
      }
      return value;
    }
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function getErrorMessage(err) {
  const msg = err?.response?.data?.message || err?.message || 'Ocurrió un error';
  return String(msg);
}

/* ===== UI: Badge MiComercio + Reintentar ===== */
function MiComercioBadge({ mov, onOpenLog, onRetry, retrying = false }) {
  const st = String(mov?.micomercio_estado || '')
    .trim()
    .toUpperCase(); // ENVIADO | PENDIENTE | ERROR
  if (!st) return <span className="muted">—</span>;

  const outboxId = Number(mov?.micomercio_outbox_id || 0);
  const hasOutboxId = outboxId > 0;

  const canRetry = hasOutboxId && (st === 'ERROR' || st === 'PENDIENTE');

  const badgeStyle =
    st === 'ENVIADO'
      ? { background: '#f6ffed', borderColor: '#b7eb8f', color: '#237804' }
      : st === 'ERROR'
        ? { background: '#fff2f0', borderColor: '#ffccc7', color: '#a8071a' }
        : { background: '#fffbe6', borderColor: '#ffe58f', color: '#ad6800' }; // PENDIENTE u otros

  const title = [
    `Estado: ${st}`,
    hasOutboxId ? `Outbox: #${outboxId}` : null,
    mov?.micomercio_last_status != null ? `HTTP: ${mov.micomercio_last_status}` : null,
    mov?.micomercio_updated_at ? `Actualizado: ${fmtDateTime(mov.micomercio_updated_at)}` : null,
    mov?.micomercio_last_error ? `Error: ${String(mov.micomercio_last_error)}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span
        className="badge"
        style={{
          border: '1px solid',
          padding: '4px 10px',
          borderRadius: 999,
          fontWeight: 600,
          cursor: 'pointer',
          ...badgeStyle,
        }}
        onClick={() => onOpenLog?.(mov)}
        title={title}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpenLog?.(mov);
        }}
      >
        {st}
      </span>

      <button
        className="btn-outline"
        style={{ width: 'auto', padding: '4px 10px' }}
        onClick={() => onOpenLog?.(mov)}
        title="Ver detalle del envío"
        type="button"
      >
        Ver log
      </button>

      {canRetry && (
        <button
          className="btn-outline"
          style={{
            width: 'auto',
            padding: '4px 10px',
            borderColor: '#ffa940',
            color: '#ad6800',
          }}
          onClick={() => onRetry?.(mov)}
          title={`Reintentar envío (outbox #${outboxId})`}
          disabled={retrying}
          type="button"
        >
          {retrying ? 'Reintentando…' : 'Reintentar'}
        </button>
      )}
    </div>
  );
}

/* ===== Página ===== */
export default function MovimientosPT() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [productos, setProductos] = useState([]);
  const [loadingProds, setLoadingProds] = useState(true);

  const [toast, setToast] = useState({ type: 'success', message: '' });

  const [logOpen, setLogOpen] = useState(false);
  const [logMov, setLogMov] = useState(null);

  const [retryingByMovId, setRetryingByMovId] = useState({}); // { [movId]: true }

  const [filters, setFilters] = useState({
    q: '',
    producto_id: '',
    tipo: 'all',
    desde: '',
    hasta: '',
  });

  async function loadProductos() {
    setLoadingProds(true);
    try {
      const { data } = await api.get(`/productos?estado=true`);
      const arr = Array.isArray(data) ? data.slice().sort(byNombre) : [];
      setProductos(arr);
    } catch {
      setProductos([]);
      setToast({ type: 'error', message: 'No se pudieron cargar productos' });
    } finally {
      setLoadingProds(false);
    }
  }

  async function loadMovs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.producto_id) params.set('producto_id', String(filters.producto_id));
      if (filters.tipo !== 'all') params.set('tipo', filters.tipo);
      if (filters.desde) params.set('desde', filters.desde);
      if (filters.hasta) params.set('hasta', filters.hasta);

      const { data } = await api.get(`/pt/movimientos?${params.toString()}`);
      const arr = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setItems(arr);
      setTotal(Number(data?.total ?? arr.length));
    } catch {
      setItems([]);
      setTotal(0);
      setToast({ type: 'error', message: 'No se pudieron cargar movimientos' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProductos();
    loadMovs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMovs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.producto_id, filters.tipo, filters.desde, filters.hasta]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    if (!q) return items;

    return items.filter((m) => {
      const prodName = productos.find((p) => Number(p.id) === Number(m.producto_id))?.nombre || '';
      const miComercioBits = [
        m?.micomercio_estado,
        m?.micomercio_last_error,
        m?.micomercio_last_status,
        m?.micomercio_tipo,
      ]
        .filter((x) => x !== null && x !== undefined && String(x).trim() !== '')
        .join(' ')
        .toLowerCase();

      return (
        prodName.toLowerCase().includes(q) ||
        String(m.lote_codigo || '')
          .toLowerCase()
          .includes(q) ||
        String(m.motivo || '')
          .toLowerCase()
          .includes(q) ||
        miComercioBits.includes(q)
      );
    });
  }, [items, filters.q, productos]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = utcMidnightMs(a.fecha);
      const db = utcMidnightMs(b.fecha);
      if (db !== da) return db - da;
      return (b.id || 0) - (a.id || 0);
    });
  }, [filtered]);

  const prodName = (m) =>
    productos.find((p) => Number(p.id) === Number(m.producto_id))?.nombre || `#${m.producto_id}`;

  const openLog = (mov) => {
    setLogMov(mov);
    setLogOpen(true);
  };

  // ✅ Reintentar por OUTBOX ID (funciona para PRODUCCION_PT y CAMBIO_ETAPA)
  async function retryEnvio(mov) {
    const movId = mov?.id;
    const outboxId = Number(mov?.micomercio_outbox_id);

    if (!movId || !(outboxId > 0)) {
      setToast({ type: 'error', message: 'Este movimiento no tiene outbox para reintentar.' });
      return;
    }

    setRetryingByMovId((s) => ({ ...s, [movId]: true }));
    try {
      await api.post(`/integraciones/outbox/${outboxId}/retry`);
      setToast({ type: 'success', message: `Reintento programado (outbox #${outboxId}).` });

      await loadMovs();
      setTimeout(() => loadMovs(), 2000);
      setTimeout(() => loadMovs(), 6000);
    } catch (e) {
      setToast({ type: 'error', message: getErrorMessage(e) });
    } finally {
      setRetryingByMovId((s) => {
        const n = { ...s };
        delete n[movId];
        return n;
      });
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>Movimientos de Productos Terminados</h2>
            <div className="muted">Entradas, salidas, ajustes + estado de envío a MiComercio</div>
          </div>
          <div className="muted">{total} movimiento(s)</div>
        </div>

        {/* Filtros */}
        <div
          className="filters"
          style={{
            marginTop: 12,
            display: 'grid',
            gap: 8,
            gridTemplateColumns: '1fr 220px 160px 160px 160px',
            alignItems: 'center',
          }}
        >
          <input
            placeholder="Buscar por producto, lote, motivo o estado MiComercio…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />

          <select
            value={filters.producto_id}
            onChange={(e) => setFilters((f) => ({ ...f, producto_id: e.target.value }))}
            disabled={loadingProds}
            title={loadingProds ? 'Cargando productos…' : 'Filtrar por producto'}
          >
            <option value="">Todos los productos</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>

          <select
            value={filters.tipo}
            onChange={(e) => setFilters((f) => ({ ...f, tipo: e.target.value }))}
          >
            <option value="all">Todos</option>
            <option value="ENTRADA">Entradas</option>
            <option value="SALIDA">Salidas</option>
            <option value="AJUSTE">Ajustes</option>
          </select>

          <input
            type="date"
            value={filters.desde}
            onChange={(e) => setFilters((f) => ({ ...f, desde: e.target.value }))}
          />
          <input
            type="date"
            value={filters.hasta}
            onChange={(e) => setFilters((f) => ({ ...f, hasta: e.target.value }))}
          />
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12, overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Lote</th>
                <th>Tipo</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th>Motivo</th>
                <th style={{ width: 140 }}>Ref.</th>
                <th style={{ width: 300 }}>MiComercio</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} style={{ padding: 14 }}>
                    Cargando…
                  </td>
                </tr>
              )}

              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 14, textAlign: 'center' }}>
                    Sin resultados
                  </td>
                </tr>
              )}

              {!loading &&
                sorted.map((m) => (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td>{fmtDate(m.fecha)}</td>
                    <td>{prodName(m)}</td>
                    <td>{m.lote_codigo || (m.lote_id ? `#${m.lote_id}` : '—')}</td>

                    <td>
                      <span
                        className="badge"
                        style={{
                          background:
                            m.tipo === 'ENTRADA'
                              ? '#f6ffed'
                              : m.tipo === 'SALIDA'
                                ? '#fff2f0'
                                : '#f0f5ff',
                          border: '1px solid',
                          borderColor:
                            m.tipo === 'ENTRADA'
                              ? '#b7eb8f'
                              : m.tipo === 'SALIDA'
                                ? '#ffccc7'
                                : '#adc6ff',
                          color:
                            m.tipo === 'ENTRADA'
                              ? '#237804'
                              : m.tipo === 'SALIDA'
                                ? '#a8071a'
                                : '#1d39c4',
                        }}
                      >
                        {m.tipo}
                      </span>
                    </td>

                    <td style={{ textAlign: 'right' }}>{formatCantidad(m, productos)}</td>
                    <td>{m.motivo || '—'}</td>

                    <td
                      className="muted"
                      title={m.ref_id ? `${m.ref_tipo} #${m.ref_id}` : m.ref_tipo || ''}
                    >
                      {m.ref_tipo || '—'}
                      {m.ref_id ? ` #${m.ref_id}` : ''}
                    </td>

                    <td>
                      {m?.micomercio_estado ? (
                        <MiComercioBadge
                          mov={m}
                          onOpenLog={openLog}
                          onRetry={retryEnvio}
                          retrying={Boolean(retryingByMovId[m.id])}
                        />
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal logs */}
      <Modal
        open={logOpen}
        title={`MiComercio • Movimiento #${logMov?.id ?? '—'}`}
        onClose={() => setLogOpen(false)}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10 }}>
            <div className="muted">Estado</div>
            <div style={{ fontWeight: 700 }}>{String(logMov?.micomercio_estado || '—')}</div>

            <div className="muted">HTTP</div>
            <div>
              {logMov?.micomercio_last_status != null ? logMov.micomercio_last_status : '—'}
            </div>

            <div className="muted">Actualizado</div>
            <div>
              {logMov?.micomercio_updated_at ? fmtDateTime(logMov.micomercio_updated_at) : '—'}
            </div>

            <div className="muted">Error</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>
              {logMov?.micomercio_last_error ? String(logMov.micomercio_last_error) : '—'}
            </div>
          </div>

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>
              Respuesta (last_resp)
            </div>
            <pre
              style={{
                margin: 0,
                padding: 12,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: '#fafafa',
                fontSize: 12,
                overflow: 'auto',
                maxHeight: 360,
              }}
            >
              {logMov?.micomercio_last_resp ? prettyJson(logMov.micomercio_last_resp) : '—'}
            </pre>
          </div>
        </div>
      </Modal>

      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast((t) => ({ ...t, message: '' }))}
      />
    </div>
  );
}
