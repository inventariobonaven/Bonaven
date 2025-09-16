// src/pages/ProductosPT.jsx
import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

/* ========== UI Helpers ========== */
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

/* ===== Helpers ===== */
const toInt = (n) => (Number.isFinite(Number(n)) ? Math.round(Number(n)) : 0);

/** Muestra stock total en paquetes cuando aplica */
function formatStockTotal(prod) {
  const uds = toInt(prod?.stock_total);
  const uxe = toInt(prod?.unidades_por_empaque); // unidades por empaque
  if (uxe > 0) {
    const pkgs = Math.floor(uds / uxe);
    const rest = uds % uxe;
    if (pkgs > 0 && rest > 0) return `${pkgs} PQ + ${rest} ud (${uds} ud)`;
    if (pkgs > 0) return `${pkgs} PQ (${uds} ud)`;
    return `${rest} ud`;
  }
  return `${uds} ud`;
}

/* ========== Form Crear/Editar ========== */
const emptyForm = {
  nombre: '',
  estado: true,
  empaque_mp_id: '',
  bolsas_por_unidad: '1',
  unidades_por_empaque: '',
  descripcion_contenido: '',
  requiere_congelacion_previa: false,
};

function ProductoForm({ initial = emptyForm, empaques = [], onSubmit, submitting }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const canSubmit = useMemo(() => {
    const okNombre = form?.nombre?.trim()?.length > 1;
    const okBolsas = Number(form?.bolsas_por_unidad || '1') > 0;
    return okNombre && okBolsas;
  }, [form]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      nombre: form.nombre.trim(),
      estado: !!form.estado,
      empaque_mp_id: form.empaque_mp_id ? Number(form.empaque_mp_id) : null,
      bolsas_por_unidad: String(form.bolsas_por_unidad || '1'),
      unidades_por_empaque: form.unidades_por_empaque ? Number(form.unidades_por_empaque) : null,
      descripcion_contenido: form.descripcion_contenido?.trim() || null,
      requiere_congelacion_previa: !!form.requiere_congelacion_previa,
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label>Nombre</label>
          <input
            name="nombre"
            placeholder="Ej. Pan de bono de avena"
            value={form.nombre}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Empaque</label>
          <select name="empaque_mp_id" value={form.empaque_mp_id ?? ''} onChange={handleChange}>
            <option value="">— Sin empaque —</option>
            {empaques.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Cantidad de bolsas x producto</label>
          <input
            name="bolsas_por_unidad"
            placeholder="1"
            value={form.bolsas_por_unidad}
            onChange={handleChange}
          />
        </div>

        <div>
          <label>Unidades internas por empaque</label>
          <input
            name="unidades_por_empaque"
            placeholder="ej. 5"
            value={form.unidades_por_empaque ?? ''}
            onChange={handleChange}
          />
        </div>

        <div>
          <label>Descripción de contenido</label>
          <input
            name="descripcion_contenido"
            placeholder="ej. 5 und por bolsa"
            value={form.descripcion_contenido ?? ''}
            onChange={handleChange}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'end' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
            <input
              type="checkbox"
              name="requiere_congelacion_previa"
              checked={!!form.requiere_congelacion_previa}
              onChange={handleChange}
            />
            Requiere congelación previa
          </label>
        </div>

        <div style={{ display: 'flex', alignItems: 'end' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
            <input type="checkbox" name="estado" checked={!!form.estado} onChange={handleChange} />
            Activo
          </label>
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

/* ========== Página ========== */
export default function ProductosPT() {
  const [items, setItems] = useState([]);
  const [empaques, setEmpaques] = useState([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState({ type: 'success', message: '' });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [toToggle, setToToggle] = useState(null);

  const [filters, setFilters] = useState({ q: '', estado: 'all' });

  /* ---- API ---- */
  async function load() {
    setLoading(true);
    try {
      const [{ data: prods }, { data: emps }] = await Promise.all([
        api.get('/productos'),
        api.get('/empaques'),
      ]);
      setItems(Array.isArray(prods) ? prods : []);
      setEmpaques(Array.isArray(emps) ? emps : []);
    } catch (e) {
      console.error(e);
      setToast({ type: 'error', message: 'No se pudieron cargar los productos' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createItem(payload) {
    setSubmitting(true);
    try {
      await api.post('/productos', payload);
      setToast({ type: 'success', message: 'Producto creado' });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setToast({ type: 'error', message: e?.response?.data?.message || 'Error al crear' });
    } finally {
      setSubmitting(false);
    }
  }

  async function updateItem(id, payload) {
    setSubmitting(true);
    try {
      await api.put(`/productos/${id}`, payload);
      setToast({ type: 'success', message: 'Cambios guardados' });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setToast({ type: 'error', message: e?.response?.data?.message || 'Error al actualizar' });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEstado(id, estadoActual) {
    try {
      await api.put(`/productos/${id}`, { estado: !estadoActual });
      setToast({ type: 'success', message: !estadoActual ? 'Activado' : 'Desactivado' });
      await load();
    } catch {
      setToast({ type: 'error', message: 'Error al cambiar estado' });
    } finally {
      setConfirmToggleOpen(false);
      setToToggle(null);
    }
  }

  async function removeItem(id) {
    try {
      await api.delete(`/productos/${id}`);
      setToast({ type: 'success', message: 'Eliminado' });
      await load();
    } catch (e) {
      setToast({ type: 'error', message: e?.response?.data?.message || 'No se pudo eliminar' });
    } finally {
      setConfirmDeleteOpen(false);
      setToDelete(null);
    }
  }

  /* ---- Filtro en memoria ---- */
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const estado = filters.estado;
    return items.filter((it) => {
      const matchText = !q || it.nombre?.toLowerCase().includes(q);
      const matchEstado =
        estado === 'all' ||
        (estado === 'active' && it.estado) ||
        (estado === 'inactive' && !it.estado);
      return matchText && matchEstado;
    });
  }, [items, filters]);

  /* ---- ORDEN: nombre A→Z ---- */
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) =>
      String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' }),
    );
  }, [filtered]);

  /* ---- UI ---- */
  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <h2 style={{ margin: 0 }}>Productos terminados</h2>
        <div className="muted">
          Marca <b>“Requiere congelación previa”</b> si este producto debe empezar en CONGELADO al
          producirse.
        </div>
      </div>
      <button
        className="btn-primary"
        onClick={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        style={{ width: 'auto' }}
      >
        + Nuevo producto
      </button>
    </div>
  );

  return (
    <div className="page">
      <div className="card">
        {header}

        {/* Filtros */}
        <div className="filters" style={{ marginTop: 12 }}>
          <input
            placeholder="Buscar por nombre…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
          <select
            value={filters.estado}
            onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Nombre</th>
                <th>Empaque</th>
                <th>Bolsas/und</th>
                <th>Und/Empaque</th>
                <th>Req. congelación</th>
                <th>Stock total</th>
                <th>Estado</th>
                <th style={{ width: 300 }}>Acciones</th>
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
                sorted.map((it) => (
                  <tr key={it.id}>
                    <td>{it.id}</td>
                    <td>{it.nombre}</td>
                    <td>{it.materias_primas_empaque?.nombre || '-'}</td>
                    <td>{String(it.bolsas_por_unidad ?? '1')}</td>
                    <td>{it.unidades_por_empaque ?? '-'}</td>
                    <td>{it.requiere_congelacion_previa ? 'Sí' : 'No'}</td>
                    <td>{formatStockTotal(it)}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: it.estado ? '#f6ffed' : '#fff2f0',
                          border: '1px solid',
                          borderColor: it.estado ? '#b7eb8f' : '#ffccc7',
                          color: it.estado ? '#237804' : '#a8071a',
                        }}
                      >
                        {it.estado ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn-outline"
                          onClick={() => {
                            setEditing({
                              id: it.id,
                              nombre: it.nombre,
                              estado: !!it.estado,
                              empaque_mp_id: it.empaque_mp_id ?? '',
                              bolsas_por_unidad: String(it.bolsas_por_unidad ?? '1'),
                              unidades_por_empaque: it.unidades_por_empaque ?? '',
                              descripcion_contenido: it.descripcion_contenido ?? '',
                              requiere_congelacion_previa: !!it.requiere_congelacion_previa,
                            });
                            setModalOpen(true);
                          }}
                          style={{ width: 'auto' }}
                        >
                          ✏️ Editar
                        </button>

                        <button
                          className="btn-outline"
                          onClick={() => {
                            setToToggle({ id: it.id, estado: it.estado, nombre: it.nombre });
                            setConfirmToggleOpen(true);
                          }}
                          style={{ width: 'auto' }}
                        >
                          {it.estado ? 'Desactivar' : 'Activar'}
                        </button>

                        <button
                          className="btn-danger-outline"
                          onClick={() => {
                            setToDelete(it);
                            setConfirmDeleteOpen(true);
                          }}
                          style={{ width: 'auto' }}
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

      {/* Modal Crear / Editar */}
      <Modal
        open={modalOpen}
        title={editing ? 'Editar producto' : 'Nuevo producto'}
        onClose={() => {
          if (!submitting) {
            setModalOpen(false);
            setEditing(null);
          }
        }}
      >
        <ProductoForm
          initial={editing || emptyForm}
          empaques={empaques}
          submitting={submitting}
          onSubmit={(payload) => (editing ? updateItem(editing.id, payload) : createItem(payload))}
        />
      </Modal>

      {/* Confirmación de borrado */}
      <Confirm
        open={confirmDeleteOpen}
        title="Eliminar producto"
        message={toDelete ? `¿Seguro que deseas eliminar "${toDelete.nombre}"?` : ''}
        onCancel={() => {
          setConfirmDeleteOpen(false);
          setToDelete(null);
        }}
        onConfirm={() => removeItem(toDelete.id)}
      />

      {/* Confirmación activar/desactivar */}
      <Confirm
        open={confirmToggleOpen}
        title={toToggle?.estado ? 'Desactivar producto' : 'Activar producto'}
        message={
          toToggle
            ? `¿Deseas ${toToggle.estado ? 'desactivar' : 'activar'} "${toToggle.nombre}"?`
            : ''
        }
        onCancel={() => {
          setConfirmToggleOpen(false);
          setToToggle(null);
        }}
        onConfirm={() => toggleEstado(toToggle.id, toToggle.estado)}
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
