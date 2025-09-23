// src/pages/StockPT.jsx
import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

/* ================= UI helpers ================= */
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
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.2)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 999,
        padding: 12,
      }}
      onClick={onClose}
    >
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn-outline" onClick={onClose} style={{ width: 'auto' }}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function Confirm({ open, title = 'Confirmar', message, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p style={{ margin: '8px 0 16px' }}>{message}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn-outline" onClick={onCancel} style={{ width: 'auto' }}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onConfirm} style={{ width: 'auto' }}>
          Confirmar
        </button>
      </div>
    </Modal>
  );
}

/* =============== Helpers de orden y presentaciones =============== */
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const byNombre = (a, b) => collator.compare(String(a?.nombre || ''), String(b?.nombre || ''));

/** Detecta el tamaño de paquete / unidades por empaque en distintas formas posibles */
function extractCantidadPresentacion(obj) {
  if (!obj) return 0;
  const n0 = Number(obj?.unidades_por_empaque);
  if (n0 > 0) return n0;
  const n1 = Number(obj?.presentaciones?.cantidad);
  if (n1 > 0) return n1;
  const n2 = Number(obj?.presentacion_cantidad);
  if (n2 > 0) return n2;
  const n3 = Number(obj?.presentacion?.cantidad);
  if (n3 > 0) return n3;
  return 0;
}

/* ================= Formularios ================= */
const emptyForm = {
  producto_id: '',
  codigo: '',
  cantidad: '',
  fecha_ingreso: new Date().toISOString().slice(0, 10),
  fecha_vencimiento: '',
  etapa_destino: 'EMPAQUE',
};

function LotePTForm({ productos, initial = emptyForm, onSubmit, submitting }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm({ ...emptyForm, ...initial }), [initial]);

  const prodOpts = useMemo(
    () => [...(Array.isArray(productos) ? productos : [])].sort(byNombre),
    [productos],
  );

  const canSubmit =
    String(form.producto_id || '') !== '' &&
    String(form.codigo || '').trim().length >= 1 &&
    Number.isInteger(Number(form.cantidad)) &&
    Number(form.cantidad) > 0 &&
    String(form.fecha_ingreso || '') !== '' &&
    (form.etapa_destino === 'EMPAQUE' || form.etapa_destino === 'HORNEO');

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      producto_id: Number(form.producto_id),
      codigo: String(form.codigo).trim(),
      cantidad: String(Number(form.cantidad)), // entero
      fecha_ingreso: form.fecha_ingreso,
      etapa_destino: form.etapa_destino,
      ...(form.fecha_vencimiento ? { fecha_vencimiento: form.fecha_vencimiento } : {}),
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label>Producto terminado</label>
          <select name="producto_id" value={form.producto_id} onChange={handleChange} required>
            <option value="">— Seleccione —</option>
            {prodOpts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Código de lote</label>
          <input name="codigo" value={form.codigo} onChange={handleChange} required />
        </div>

        <div>
          <label>Cantidad (ud)</label>
          <input
            name="cantidad"
            type="number"
            min="1"
            step="1"
            value={form.cantidad}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Fecha ingreso</label>
          <input
            type="date"
            name="fecha_ingreso"
            value={form.fecha_ingreso}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Fecha vencimiento (opcional)</label>
          <input
            type="date"
            name="fecha_vencimiento"
            value={form.fecha_vencimiento}
            onChange={handleChange}
          />
        </div>

        <div>
          <label>Etapa destino</label>
          <select name="etapa_destino" value={form.etapa_destino} onChange={handleChange} required>
            <option value="EMPAQUE">Empaque (consume bolsas)</option>
            <option value="HORNEO">Horneo (no consume bolsas)</option>
          </select>
          <div className="muted" style={{ marginTop: 4 }}>
            Si eliges <b>Horneo</b> se permite cualquier cantidad y no se descuentan empaques.
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn-primary" disabled={!canSubmit || submitting}>
          {submitting ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}

/* ======= Editar (con ajuste de cantidad, paquetes y ETAPA) ======= */
function EditLoteForm({ lote, unidadesPorEmpaque, onSubmit, submitting }) {
  const udsActuales = Math.round(Number(lote?.cantidad || 0));
  const uxe = Number(unidadesPorEmpaque || 0);

  const [form, setForm] = useState({
    codigo: lote?.codigo || '',
    fecha_ingreso: lote?.fecha_ingreso?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    fecha_vencimiento: lote?.fecha_vencimiento?.slice?.(0, 10) || '',
    venderPor: uxe > 0 ? 'PAQUETES' : 'UNIDADES',
    cantidadPkgs: uxe > 0 ? String(Math.floor(udsActuales / uxe)) : '',
    cantidadUd: uxe > 0 ? String(udsActuales % uxe) : String(udsActuales),
    motivo: '',
    etapa: String(lote?.etapa || 'EMPAQUE'), // 👈 NUEVO
  });

  useEffect(() => {
    const uds = Math.round(Number(lote?.cantidad || 0));
    setForm({
      codigo: lote?.codigo || '',
      fecha_ingreso: lote?.fecha_ingreso?.slice(0, 10) || new Date().toISOString().slice(0, 10),
      fecha_vencimiento: lote?.fecha_vencimiento?.slice?.(0, 10) || '',
      venderPor: uxe > 0 ? 'PAQUETES' : 'UNIDADES',
      cantidadPkgs: uxe > 0 ? String(Math.floor(uds / uxe)) : '',
      cantidadUd: uxe > 0 ? String(uds % uxe) : String(uds),
      motivo: '',
      etapa: String(lote?.etapa || 'EMPAQUE'), // 👈 NUEVO
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lote?.id, uxe]);

  function toIntSafe(n) {
    const x = Number(n);
    return Number.isFinite(x) ? Math.max(0, Math.round(x)) : 0;
  }

  // Unidades objetivo (según venderPor)
  const targetUd =
    form.venderPor === 'PAQUETES'
      ? toIntSafe(form.cantidadPkgs) * uxe + toIntSafe(form.cantidadUd)
      : toIntSafe(form.cantidadUd);

  const delta = targetUd - udsActuales; // +/- para el ajuste

  const canSubmit =
    String(form.codigo || '').trim().length >= 1 &&
    String(form.fecha_ingreso || '') !== '' &&
    targetUd >= 0;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    // Solo enviar lo que cambió
    const updates = {};
    if (String(form.codigo).trim() !== String(lote?.codigo || '')) {
      updates.codigo = String(form.codigo).trim();
    }
    if (form.fecha_ingreso !== (lote?.fecha_ingreso?.slice(0, 10) || '')) {
      updates.fecha_ingreso = form.fecha_ingreso;
    }
    const origVence = lote?.fecha_vencimiento?.slice?.(0, 10) || '';
    if (form.fecha_vencimiento !== origVence) {
      // Si lo vaciaron explícitamente => null. Si no se tocó, no lo mandamos.
      updates.fecha_vencimiento = form.fecha_vencimiento ? form.fecha_vencimiento : null;
    }
    // 👇 NUEVO: cambio de ETAPA
    if (form.etapa !== String(lote?.etapa || '')) {
      updates.etapa = form.etapa;
    }

    onSubmit({
      updates, // { codigo?, fecha_ingreso?, fecha_vencimiento?, etapa? }
      deltaCantidad: delta, // +/- (0 si no cambió)
      motivo: form.motivo?.trim() || undefined,
      targetUd, // unidades finales
    });
  }

  const infoActual =
    uxe > 0
      ? `${Math.floor(udsActuales / uxe)} PQ + ${udsActuales % uxe} ud (${udsActuales} ud)`
      : `${udsActuales} ud`;

  const infoNuevo =
    uxe > 0 && form.venderPor === 'PAQUETES'
      ? `${toIntSafe(form.cantidadPkgs)} PQ + ${toIntSafe(form.cantidadUd)} ud (${targetUd} ud)`
      : `${targetUd} ud`;

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label>Producto</label>
          <input value={lote?.productos_terminados?.nombre || `#${lote?.producto_id}`} disabled />
        </div>

        <div>
          <label>Código</label>
          <input name="codigo" value={form.codigo} onChange={handleChange} required />
        </div>

        <div>
          <label>Fecha ingreso</label>
          <input
            type="date"
            name="fecha_ingreso"
            value={form.fecha_ingreso}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Fecha vencimiento</label>
          <input
            type="date"
            name="fecha_vencimiento"
            value={form.fecha_vencimiento}
            onChange={handleChange}
          />
        </div>

        {/* ---- Etapa ---- */}
        <div>
          <label>Etapa</label>
          <select name="etapa" value={form.etapa} onChange={handleChange}>
            <option value="EMPAQUE">Empaque</option>
            <option value="HORNEO">Horneo</option>
            <option value="CONGELADO">Congelado</option>
          </select>
        </div>

        {/* ---- Ajuste de cantidad ---- */}
        <div>
          <label>Editar cantidad por</label>
          <select name="venderPor" value={form.venderPor} onChange={handleChange}>
            <option value="UNIDADES">Unidades</option>
            {uxe > 0 && <option value="PAQUETES">Paquetes</option>}
          </select>
          <div className="muted" style={{ marginTop: 4 }}>
            Actual: {infoActual}
          </div>
        </div>

        {form.venderPor === 'PAQUETES' && uxe > 0 ? (
          <>
            <div>
              <label>Paquetes</label>
              <input
                name="cantidadPkgs"
                type="number"
                min="0"
                step="1"
                value={form.cantidadPkgs}
                onChange={handleChange}
              />
              <div className="muted" style={{ marginTop: 4 }}>
                1 PQ = {uxe} ud
              </div>
            </div>
            <div>
              <label>Unidades sueltas</label>
              <input
                name="cantidadUd"
                type="number"
                min="0"
                step="1"
                value={form.cantidadUd}
                onChange={handleChange}
              />
            </div>
          </>
        ) : (
          <div>
            <label>Nueva cantidad (ud)</label>
            <input
              name="cantidadUd"
              type="number"
              min="0"
              step="1"
              value={form.cantidadUd}
              onChange={handleChange}
            />
          </div>
        )}

        <div>
          <label>Motivo del ajuste (opcional)</label>
          <input
            name="motivo"
            placeholder="Ajuste manual, inventario, merma…"
            value={form.motivo}
            onChange={handleChange}
          />
          <div className="muted" style={{ marginTop: 4 }}>
            Nuevo: {infoNuevo} · Delta: {delta > 0 ? `+${delta}` : delta} ud
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn-primary" disabled={!canSubmit || submitting}>
          {submitting ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </form>
  );
}

/* ================= Página ================= */
export default function StockPT() {
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [productos, setProductos] = useState([]);
  const [loadingProductos, setLoadingProductos] = useState(true);

  const [toast, setToast] = useState({ type: 'success', message: '' });

  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  // Edit
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // filtros
  const [filters, setFilters] = useState({ q: '', estado: 'all', producto_id: '', etapa: 'all' });

  // mapa producto_id -> unidades_por_empaque
  const [presMap, setPresMap] = useState(new Map());

  /* ---- API ---- */
  async function loadLotes() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.producto_id) params.set('producto_id', String(filters.producto_id));
      if (filters.estado !== 'all') params.set('estado', filters.estado);
      if (filters.etapa !== 'all') params.set('etapa', filters.etapa);

      const { data } = await api.get(`/stock-pt/lotes?${params.toString()}`);
      const rows = Array.isArray(data) ? data : [];
      setLotes(rows);

      // Completar mapa con info llegada por join (si existe)
      setPresMap((prev) => {
        const m = new Map(prev);
        for (const l of rows) {
          const pid = Number(l?.producto_id);
          const n = extractCantidadPresentacion(l?.productos_terminados);
          if (pid && n > 0 && !m.has(pid)) m.set(pid, n);
        }
        return m;
      });
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', message: 'No se pudieron cargar los lotes de PT' });
    } finally {
      setLoading(false);
    }
  }

  async function loadProductos() {
    setLoadingProductos(true);
    try {
      const { data } = await api.get(`/productos?estado=true`);
      const arr = Array.isArray(data) ? data.slice().sort(byNombre) : [];
      setProductos(arr);

      // Semillar mapa desde productos
      const map = new Map();
      for (const p of arr) {
        const n = extractCantidadPresentacion(p);
        if (Number(p.id) && n > 0) map.set(Number(p.id), n);
      }
      setPresMap((prev) => {
        const merged = new Map(prev);
        for (const [k, v] of map.entries()) if (!merged.has(k)) merged.set(k, v);
        return merged;
      });
    } catch {
      setProductos([]);
      setToast({ type: 'error', message: 'No se pudieron cargar productos' });
    } finally {
      setLoadingProductos(false);
    }
  }

  useEffect(() => {
    loadLotes();
    loadProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadLotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.estado, filters.producto_id, filters.etapa]);

  async function createLote(payload) {
    setSubmitting(true);
    try {
      await api.post(`/stock-pt/ingreso`, payload);
      setToast({ type: 'success', message: 'Lote registrado' });
      setModalOpen(false);
      await loadLotes();
    } catch (e) {
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'Error al registrar lote',
      });
    } finally {
      setSubmitting(false);
    }
  }

  // Guarda edición: un solo PUT (meta + ajuste de cantidad)
  async function guardarEdicionLote(lote, { updates, deltaCantidad, motivo, targetUd }) {
    setSubmitting(true);
    try {
      const payload = { ...(updates || {}) };

      // si cambió la cantidad, manda la FINAL + motivo/fecha del ajuste (el backend registra el movimiento)
      if (Number(deltaCantidad) !== 0) {
        payload.cantidad = Number(targetUd);
        if (motivo) payload.motivo_ajuste = motivo;
        payload.fecha_ajuste = new Date().toISOString();
      }

      await api.put(`/stock-pt/lotes/${lote.id}`, payload);

      setToast({ type: 'success', message: 'Lote actualizado' });
      setEditOpen(false);
      setEditing(null);
      await loadLotes();
    } catch (e) {
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'No se pudo guardar la edición',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEstado(id) {
    try {
      const { data } = await api.patch(`/stock-pt/lotes/${id}/estado`, {}); // toggle simple
      const estado = data?.lote?.estado ?? data?.estado;
      setToast({
        type: 'success',
        message: estado === 'INACTIVO' ? 'Lote inactivado' : 'Lote activado',
      });
      await loadLotes();
    } catch (e) {
      setToast({ type: 'error', message: e?.response?.data?.message || 'Error cambiando estado' });
    }
  }

  async function deleteLote(id) {
    try {
      await api.delete(`/stock-pt/lotes/${id}`);
      setToast({ type: 'success', message: 'Lote eliminado' });
      await loadLotes();
    } catch (e) {
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'No se pudo eliminar',
      });
    } finally {
      setConfirmDeleteOpen(false);
      setToDelete(null);
    }
  }

  /* ---- Filtro texto + etapa (en cliente) ---- */
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const etapa = String(filters.etapa || 'all').toUpperCase();
    return lotes.filter((l) => {
      const matchText =
        !q ||
        l.codigo?.toLowerCase().includes(q) ||
        l.productos_terminados?.nombre?.toLowerCase?.().includes(q);
      const matchEtapa = etapa === 'ALL' || String(l.etapa || '').toUpperCase() === etapa;
      return matchText && matchEtapa;
    });
  }, [lotes, filters.q, filters.etapa]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = new Date(a.fecha_ingreso || 0).getTime();
      const db = new Date(b.fecha_ingreso || 0).getTime();
      if (db !== da) return db - da;
      return (b.id || 0) - (a.id || 0);
    });
  }, [filtered]);

  // productos ordenados para selects
  const productosOrdenados = useMemo(() => [...(productos || [])].sort(byNombre), [productos]);

  /* ---- Cantidad render (pkg + ud) ---- */
  function renderCantidad(l) {
    const totalUd = Math.round(Number(l?.cantidad) || 0);
    const etapa = String(l?.etapa || '').toUpperCase();
    const unidadesPorPkg = Number(presMap.get(Number(l?.producto_id))) || 0;

    if ((etapa === 'EMPAQUE' || etapa === 'HORNEO') && unidadesPorPkg > 0) {
      const pkgs = Math.floor(totalUd / unidadesPorPkg);
      const rest = totalUd % unidadesPorPkg;
      const parts = [];
      if (pkgs > 0) parts.push(`${pkgs} PQ`);
      if (rest > 0) parts.push(`${rest} ud`);
      const left = parts.join(' + ') || `${totalUd} ud`;
      return `${left} (${totalUd} ud)`;
    }
    return `${totalUd} ud`;
  }

  /* ---- UI ---- */
  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <h2 style={{ margin: 0 }}>Stock PT (lotes)</h2>
        <div className="muted">Gestiona los lotes de productos terminados</div>
      </div>
      <button className="btn-primary" onClick={() => setModalOpen(true)} style={{ width: 'auto' }}>
        + Registrar lote
      </button>
    </div>
  );

  const estadoBadge = (estado) => {
    const style = {
      DISPONIBLE: { bg: '#f6ffed', border: '#b7eb8f', color: '#237804' },
      AGOTADO: { bg: '#fff2f0', border: '#ffccc7', color: '#a8071a' },
      VENCIDO: { bg: '#fff7e6', border: '#ffd591', color: '#ad4e00' },
      RESERVADO: { bg: '#f0f5ff', border: '#adc6ff', color: '#1d39c4' },
      INACTIVO: { bg: '#fafafa', border: '#d9d9d9', color: '#595959' },
    }[estado] || { bg: '#fafafa', border: '#d9d9d9', color: '#595959' };

    return (
      <span
        className="badge"
        style={{
          background: style.bg,
          border: '1px solid ' + style.border,
          color: style.color,
        }}
      >
        {estado}
      </span>
    );
  };

  const etapaBadge = (etapa) => (
    <span className="badge" style={{ background: '#f5f5f5', border: '1px solid #d9d9d9' }}>
      {etapa || '—'}
    </span>
  );

  return (
    <div className="page">
      <div className="card">
        {header}

        {/* Filtros */}
        <div
          className="filters"
          style={{
            marginTop: 12,
            display: 'grid',
            gap: 8,
            gridTemplateColumns: '1fr 200px 160px 160px',
          }}
        >
          <input
            placeholder="Buscar por código o producto…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
          <select
            value={filters.producto_id}
            onChange={(e) => setFilters((f) => ({ ...f, producto_id: e.target.value }))}
          >
            <option value="">Todos los productos</option>
            {productosOrdenados.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select
            value={filters.estado}
            onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
          >
            <option value="all">Todos los estados</option>
            <option value="DISPONIBLE">Disponibles</option>
            <option value="AGOTADO">Agotados</option>
            <option value="RESERVADO">Reservados</option>
            <option value="VENCIDO">Vencidos</option>
            <option value="INACTIVO">Inactivos</option>
          </select>
          <select
            value={filters.etapa}
            onChange={(e) => setFilters((f) => ({ ...f, etapa: e.target.value }))}
          >
            <option value="all">Todas las etapas</option>
            <option value="CONGELADO">Congelado</option>
            <option value="EMPAQUE">Empaque</option>
            <option value="HORNEO">Horneo</option>
          </select>
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Producto</th>
                <th>Código</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th>Ingreso</th>
                <th>Vence</th>
                <th>Etapa</th>
                <th>Estado</th>
                <th style={{ width: 340 }}>Acciones</th>
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
                sorted.map((l) => (
                  <tr key={l.id}>
                    <td>{l.id}</td>
                    <td>{l.productos_terminados?.nombre || '-'}</td>
                    <td>{l.codigo}</td>
                    <td style={{ textAlign: 'right' }}>{renderCantidad(l)}</td>
                    <td>{l.fecha_ingreso?.slice(0, 10)}</td>
                    <td>{l.fecha_vencimiento?.slice(0, 10) || '—'}</td>
                    <td>{etapaBadge(l.etapa)}</td>
                    <td>{estadoBadge(l.estado)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn-outline"
                          onClick={() => {
                            setEditing(l);
                            setEditOpen(true);
                          }}
                          style={{ width: 'auto' }}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          className="btn-outline"
                          onClick={() => toggleEstado(l.id)}
                          style={{ width: 'auto' }}
                        >
                          {l.estado === 'INACTIVO' ? 'Activar' : 'Inactivar'}
                        </button>
                        <button
                          className="btn-danger-outline"
                          onClick={() => {
                            setToDelete(l);
                            setConfirmDeleteOpen(true);
                          }}
                          style={{ width: 'auto' }}
                          title="Eliminar lote"
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear */}
      <Modal
        open={modalOpen}
        title="Registrar lote de Producto Terminado"
        onClose={() => {
          if (!submitting) setModalOpen(false);
        }}
      >
        <LotePTForm
          productos={productosOrdenados}
          submitting={submitting}
          onSubmit={(payload) => createLote(payload)}
        />
        {loadingProductos && (
          <div className="muted" style={{ marginTop: 8 }}>
            Cargando productos…
          </div>
        )}
      </Modal>

      {/* Modal Editar */}
      <Modal
        open={editOpen}
        title={`Editar lote #${editing?.id || ''}`}
        onClose={() => {
          if (!submitting) {
            setEditOpen(false);
            setEditing(null);
          }
        }}
      >
        {editing && (
          <EditLoteForm
            lote={editing}
            unidadesPorEmpaque={presMap.get(Number(editing?.producto_id)) || 0}
            submitting={submitting}
            onSubmit={(data) => guardarEdicionLote(editing, data)}
          />
        )}
      </Modal>

      {/* Confirmación eliminar */}
      <Confirm
        open={confirmDeleteOpen}
        title="Eliminar lote"
        message={toDelete ? `¿Seguro que deseas eliminar el lote "${toDelete.codigo}"?` : ''}
        onCancel={() => {
          setConfirmDeleteOpen(false);
          setToDelete(null);
        }}
        onConfirm={() => deleteLote(toDelete.id)}
      />

      {/* Toast */}
      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: '' })}
      />
    </div>
  );
}
