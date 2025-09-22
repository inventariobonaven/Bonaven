// src/pages/Recetas.jsx
import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { listarMapPorReceta, crearMap, actualizarMap, eliminarMap } from '../api/pt';

/* ===== util: orden alfabético robusto ===== */
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const byNombre = (a, b) => collator.compare(String(a?.nombre || ''), String(b?.nombre || ''));

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

function Confirm({ open, title = 'Confirmar', message, onCancel, onConfirm, extra }) {
  if (!open) return null;
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p style={{ margin: '8px 0 16px' }}>{message}</p>
      {extra}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
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

/* ===== MODAL: Mapeo Receta ↔️ Producto ===== */
function RecetaProductoMapModal({ open, onClose, receta, onChanged }) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loadingProductos, setLoadingProductos] = useState(true);
  const [toast, setToast] = useState({ type: 'success', message: '' });

  const emptyForm = {
    id: null,
    producto_id: '',
    unidades_por_batch: '',
    vida_util_dias: '0',
  };
  const [form, setForm] = useState(emptyForm);
  const isEdit = form.id != null;

  useEffect(() => {
    if (!open || !receta?.id) return;
    setForm(emptyForm);
    loadProductos();
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receta?.id]);

  async function loadProductos() {
    setLoadingProductos(true);
    try {
      const { data } = await api.get(`/productos?estado=true`);
      const arr = Array.isArray(data) ? data.slice().sort(byNombre) : [];
      setProductos(arr); // ORDEN ALFABÉTICO
    } catch {
      setProductos([]);
    } finally {
      setLoadingProductos(false);
    }
  }

  async function loadItems() {
    setLoading(true);
    try {
      const { data } = await listarMapPorReceta(receta.id);
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      setItems([]);
      setToast({ type: 'error', message: e?.response?.data?.message || 'Error cargando mapeos' });
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    String(form.producto_id || '') !== '' &&
    Number.isInteger(Number(form.unidades_por_batch)) &&
    Number(form.unidades_por_batch) > 0 &&
    Number.isInteger(Number(form.vida_util_dias)) &&
    Number(form.vida_util_dias) >= 0;

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      setLoading(true);
      const payload = {
        producto_id: Number(form.producto_id),
        unidades_por_batch: Number(form.unidades_por_batch),
        vida_util_dias: Number(form.vida_util_dias),
      };
      if (isEdit) {
        await actualizarMap(form.id, payload);
        setToast({ type: 'success', message: 'Mapeo actualizado' });
      } else {
        await crearMap(receta.id, payload);
        setToast({ type: 'success', message: 'Mapeo creado' });
      }
      setForm(emptyForm);
      await loadItems();
      onChanged?.();
    } catch (e) {
      setToast({ type: 'error', message: e?.response?.data?.message || 'Error guardando mapeo' });
    } finally {
      setLoading(false);
    }
  }

  function startEdit(row) {
    setForm({
      id: row.id,
      producto_id: row.producto_id,
      unidades_por_batch: row.unidades_por_batch,
      vida_util_dias: row.vida_util_dias,
    });
  }

  function cancelEdit() {
    setForm(emptyForm);
  }

  async function remove(row) {
    if (!window.confirm(`Eliminar mapeo de ${row.producto?.nombre || `#${row.producto_id}`} ?`))
      return;
    try {
      setLoading(true);
      await eliminarMap(row.id);
      setToast({ type: 'success', message: 'Mapeo eliminado' });
      await loadItems();
      onChanged?.();
      if (isEdit && form.id === row.id) setForm(emptyForm);
    } catch (e) {
      setToast({ type: 'error', message: e?.response?.data?.message || 'No se pudo eliminar' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      title={`Mapeos de productos — ${receta?.nombre || `Receta #${receta?.id}`}`}
      onClose={onClose}
    >
      {/* Form */}
      <form onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="form-grid">
          <div>
            <label>Producto terminado</label>
            <select
              name="producto_id"
              value={form.producto_id}
              onChange={handleChange}
              required
              disabled={isEdit}
            >
              <option value="">— Seleccione —</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {loadingProductos && (
              <div className="muted" style={{ marginTop: 4 }}>
                Cargando productos…
              </div>
            )}
          </div>

          <div>
            <label>Unidades por batch</label>
            <input
              name="unidades_por_batch"
              type="number"
              min="1"
              step="1"
              value={form.unidades_por_batch}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label>Vida útil (días)</label>
            <input
              name="vida_util_dias"
              type="number"
              min="0"
              step="1"
              value={form.vida_util_dias}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          {isEdit && (
            <button
              type="button"
              className="btn-outline"
              onClick={cancelEdit}
              style={{ width: 'auto' }}
            >
              Cancelar edición
            </button>
          )}
          <button
            className="btn-primary"
            disabled={!canSubmit || loading}
            style={{ width: 'auto' }}
          >
            {loading ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agregar mapeo'}
          </button>
        </div>
      </form>

      {/* Tabla */}
      <div style={{ marginTop: 16 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 80 }}>ID</th>
              <th>Producto</th>
              <th style={{ textAlign: 'right' }}>Unid / batch</th>
              <th style={{ textAlign: 'right' }}>Vida (días)</th>
              <th style={{ width: 220 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} style={{ padding: 14 }}>
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 14, textAlign: 'center' }}>
                  Sin mapeos
                </td>
              </tr>
            )}
            {!loading &&
              items.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.producto?.nombre || `#${row.producto_id}`}</td>
                  <td style={{ textAlign: 'right' }}>{row.unidades_por_batch}</td>
                  <td style={{ textAlign: 'right' }}>{row.vida_util_dias}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        className="btn-outline"
                        onClick={() => startEdit(row)}
                        style={{ width: 'auto' }}
                      >
                        ✏️ Editar
                      </button>
                      <button
                        className="btn-danger-outline"
                        onClick={() => remove(row)}
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

      {/* Toast del modal */}
      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: '' })}
      />
    </Modal>
  );
}

/* ===== Formularios ===== */
const emptyReceta = {
  nombre: '',
  estado: true,
  rendimiento_por_batch: '1',
  categoria_id: '',
};

function RecetaForm({ initial = emptyReceta, onSubmit, submitting, categorias }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const canSubmit =
    String(form.nombre || '').trim().length >= 2 &&
    (!form.rendimiento_por_batch ||
      (Number(form.rendimiento_por_batch) > 0 &&
        !Number.isNaN(Number(form.rendimiento_por_batch))));

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      nombre: String(form.nombre || '').trim(),
      estado: !!form.estado,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      rendimiento_por_batch:
        form.rendimiento_por_batch !== '' ? String(form.rendimiento_por_batch) : undefined,
    });
  }

  // categorías ordenadas por nombre
  const catOpts = useMemo(
    () => [...(Array.isArray(categorias) ? categorias : [])].sort(byNombre),
    [categorias],
  );

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label>Nombre de receta</label>
          <input
            name="nombre"
            placeholder="Ej. Masa de avena"
            value={form.nombre}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Categoría (opcional)</label>
          <select name="categoria_id" value={form.categoria_id || ''} onChange={handleChange}>
            <option value="">— Sin categoría —</option>
            {catOpts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
          <div className="muted" style={{ marginTop: 4 }}>
            Útil para filtrar recetas por tipo de masa / familia.
          </div>
        </div>

        <div>
          <label>Rendimiento por Masa</label>
          <input
            name="rendimiento_por_batch"
            type="number"
            min="0.001"
            step="0.001"
            value={form.rendimiento_por_batch}
            onChange={handleChange}
          />
          <div className="muted" style={{ marginTop: 4 }}>
            Cantidad de producto esperada por cada unidad de producción.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'end' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0 }}>
            <input type="checkbox" name="estado" checked={!!form.estado} onChange={handleChange} />
            Activa
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

/* ===== Ingredientes ===== */
function IngredientesManager({ receta, open, onClose }) {
  const [materias, setMaterias] = useState([]);
  const [items, setItems] = useState([]); // ingredientes actuales
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ type: 'success', message: '' });

  // form add
  const [mpId, setMpId] = useState('');
  const [cantidad, setCantidad] = useState('');

  // edición inline
  const [editMap, setEditMap] = useState({});

  async function load() {
    if (!receta?.id) return;
    setLoading(true);
    try {
      const [M, I] = await Promise.all([
        // Solo INSUMOS activos
        api.get('/materias-primas?estado=true&tipo=INSUMO'),
        api.get(`/recetas/${receta.id}/ingredientes`),
      ]);

      const arrM = (Array.isArray(M.data) ? M.data : [])
        .filter((m) => String(m.tipo || '').toUpperCase() === 'INSUMO') // defensivo
        .slice()
        .sort(byNombre);

      setMaterias(arrM);
      setItems(Array.isArray(I.data) ? I.data : []);
    } catch {
      setToast({ type: 'error', message: 'No se pudo cargar ingredientes' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      setMpId('');
      setCantidad('');
      setEditMap({});
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, receta?.id]);

  const usedMpIds = new Set(items.map((i) => String(i.materia_prima_id)));

  // opciones visibles: filtrar las ya usadas Y ordenar por nombre
  const opcionesMp = useMemo(() => {
    return materias
      .filter((m) => !usedMpIds.has(String(m.id)))
      .slice()
      .sort(byNombre);
  }, [materias, items]); // depende de materias e items (usedMpIds)

  // Unidad canónica para mostrar/editar (g/ml/ud)
  function canonicalUnitFor(base) {
    const b = String(base || '').toLowerCase();
    if (b === 'g' || b === 'kg') return 'g';
    if (b === 'ml' || b === 'l') return 'ml';
    return 'ud';
  }
  function toDisplay(q) {
    const n = Number(q);
    return Number.isFinite(n) ? n : 0;
  }

  const mpSel = materias.find((m) => String(m.id) === String(mpId));
  const displayUnitNew = canonicalUnitFor(mpSel?.unidad_medida);

  async function addIng() {
    if (!receta?.id || !mpId || !cantidad || Number(cantidad) <= 0) return;
    try {
      await api.post(`/recetas/${receta.id}/ingredientes`, {
        materia_prima_id: Number(mpId),
        cantidad: String(cantidad),
        unidad: displayUnitNew, // "g" | "ml" | "ud"
      });
      setMpId('');
      setCantidad('');
      await load();
      setToast({ type: 'success', message: 'Ingrediente agregado' });
    } catch (e) {
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'Error agregando ingrediente',
      });
    }
  }

  function setEditQty(ingId, val) {
    setEditMap((m) => ({ ...m, [ingId]: { cantidadDisplay: val } }));
  }

  async function saveIng(ing) {
    const unidadCanonica = canonicalUnitFor(ing.materias_primas?.unidad_medida);
    const val = editMap?.[ing.id]?.cantidadDisplay ?? toDisplay(ing.cantidad);
    if (!val || Number(val) <= 0) return;

    try {
      await api.put(`/recetas/ingredientes/${ing.id}`, {
        cantidad: String(val),
        unidad: unidadCanonica,
      });
      setEditMap((m) => {
        const copy = { ...m };
        delete copy[ing.id];
        return copy;
      });
      await load();
      setToast({ type: 'success', message: 'Cantidad actualizada' });
    } catch (e) {
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'Error actualizando ingrediente',
      });
    }
  }

  async function delIng(ingId) {
    try {
      await api.delete(`/recetas/ingredientes/${ingId}`);
      await load();
      setToast({ type: 'success', message: 'Ingrediente eliminado' });
    } catch (e) {
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'No se pudo eliminar',
      });
    }
  }

  return (
    <Modal open={open} title={`Ingredientes de: ${receta?.nombre || ''}`} onClose={onClose}>
      <div className="muted" style={{ marginBottom: 10 }}>
        Ingresa cantidades en <strong>g</strong> (sólidos), <strong>ml</strong> (líquidos) o
        <strong> ud</strong>. Se convierten automáticamente a la unidad base de la MP.
      </div>

      {/* Add row */}
      <div
        className="card"
        style={{ padding: 12, display: 'grid', gap: 8, gridTemplateColumns: '1fr 180px auto' }}
      >
        <select value={mpId} onChange={(e) => setMpId(e.target.value)}>
          <option value="">Materia prima…</option>
          {opcionesMp.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre} ({m.unidad_medida})
            </option>
          ))}
        </select>
        <input
          type="number"
          min="0.001"
          step="0.001"
          placeholder={mpId ? `Cantidad en ${displayUnitNew}` : 'Cantidad'}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          disabled={!mpId}
        />
        <button className="btn-primary" onClick={addIng} style={{ width: 'auto' }} disabled={!mpId}>
          + Agregar
        </button>
      </div>

      {/* Listado */}
      <div style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Materia prima</th>
              <th>Unidad</th>
              <th style={{ textAlign: 'right' }}>Cantidad por 1 unidad</th>
              <th style={{ width: 220 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} style={{ padding: 14 }}>
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: 14, textAlign: 'center' }}>
                  No hay ingredientes aún
                </td>
              </tr>
            )}
            {!loading &&
              items.map((ing) => {
                const unidadBase = ing.materias_primas?.unidad_medida || '';
                const unidadShow = canonicalUnitFor(unidadBase); // g/ml/ud
                const displayVal =
                  editMap?.[ing.id]?.cantidadDisplay ?? String(toDisplay(ing.cantidad));
                return (
                  <tr key={ing.id}>
                    <td>{ing.materias_primas?.nombre || `MP #${ing.materia_prima_id}`}</td>
                    <td>{unidadShow}</td>
                    <td style={{ textAlign: 'right' }}>
                      <input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={displayVal}
                        onChange={(e) => setEditQty(ing.id, e.target.value)}
                        style={{ width: 160, textAlign: 'right' }}
                        title={`Editar en ${unidadShow}`}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn-outline"
                          onClick={() => saveIng(ing)}
                          style={{ width: 'auto' }}
                        >
                          💾 Guardar
                        </button>
                        <button
                          className="btn-danger-outline"
                          onClick={() => delIng(ing.id)}
                          style={{ width: 'auto' }}
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: '' })}
      />
    </Modal>
  );
}

/* ===== Página principal ===== */
export default function Recetas() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [categorias, setCategorias] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);

  const [toast, setToast] = useState({ type: 'success', message: '' });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmHardOpen, setConfirmHardOpen] = useState(false);
  const [toDeleteHard, setToDeleteHard] = useState(null);

  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [toToggle, setToToggle] = useState(null); // { id, estado, nombre }

  const [ingMgrOpen, setIngMgrOpen] = useState(false);
  const [ingReceta, setIngReceta] = useState(null);

  // NUEVO: modal mapeos PT
  const [mapOpen, setMapOpen] = useState(false);
  const [recetaSel, setRecetaSel] = useState(null);

  // filtros
  const [filters, setFilters] = useState({ q: '', estado: 'all', categoria_id: '' });

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.estado === 'active') params.set('estado', 'true');
      else if (filters.estado === 'inactive') params.set('estado', 'false');
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.categoria_id) params.set('categoria_id', String(filters.categoria_id));
      const { data } = await api.get(`/recetas?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setToast({ type: 'error', message: 'Error cargando recetas' });
    } finally {
      setLoading(false);
    }
  }

  async function loadCategorias() {
    setLoadingCats(true);
    try {
      const { data } = await api.get(`/categorias-receta?estado=true`);
      const arr = Array.isArray(data) ? data.slice().sort(byNombre) : []; // ORDEN ALFABÉTICO
      setCategorias(arr);
    } catch {
      setCategorias([]);
      setToast({ type: 'error', message: 'No se pudieron cargar categorías' });
    } finally {
      setLoadingCats(false);
    }
  }

  useEffect(() => {
    load();
    loadCategorias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.estado, filters.categoria_id]);

  async function createItem(payload) {
    setSubmitting(true);
    try {
      await api.post('/recetas', payload);
      setToast({ type: 'success', message: 'Receta creada' });
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
      await api.put(`/recetas/${id}`, payload);
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
      const { data } = await api.patch(`/recetas/${id}/estado`, { estado: !estadoActual });
      setToast({
        type: 'success',
        message: data?.estado ? 'Receta activada' : 'Receta desactivada',
      });
      await load();
    } catch {
      setToast({ type: 'error', message: 'Error al cambiar estado' });
    } finally {
      setConfirmToggleOpen(false);
      setToToggle(null);
    }
  }

  // Hard delete
  async function removeItemHard(id) {
    try {
      await api.delete(`/recetas/${id}?hard=true`);
      setToast({ type: 'success', message: 'Receta eliminada definitivamente' });
      await load();
    } catch (e) {
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'No se pudo eliminar definitivamente',
      });
    } finally {
      setConfirmHardOpen(false);
      setToDeleteHard(null);
    }
  }

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const estado = filters.estado; // all | active | inactive
    const catId = String(filters.categoria_id || '');
    return items.filter((r) => {
      const text =
        !q ||
        r.nombre?.toLowerCase().includes(q) ||
        r.categoria?.nombre?.toLowerCase?.().includes(q);

      const status =
        estado === 'all' ||
        (estado === 'active' && r.estado) ||
        (estado === 'inactive' && !r.estado);

      const catMatch = !catId || String(r.categoria?.id || '') === catId;

      return text && status && catMatch;
    });
  }, [items, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => (b.id || 0) - (a.id || 0));
  }, [filtered]);

  return (
    <div className="page">
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0 }}>Recetas</h2>
            <div className="muted">Administra recetas y sus ingredientes</div>
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            style={{ width: 'auto' }}
          >
            + Nueva receta
          </button>
        </div>

        {/* Filtros */}
        <div
          className="filters"
          style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: '1fr 180px 220px' }}
        >
          <input
            placeholder="Buscar por nombre o categoría…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
          <select
            value={filters.estado}
            onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
          >
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
          <select
            value={filters.categoria_id}
            onChange={(e) => setFilters((f) => ({ ...f, categoria_id: e.target.value }))}
          >
            <option value="">Todas las categorías</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Nombre</th>
                <th>Categoría</th>
                <th>Ingredientes</th>
                <th>Estado</th>
                <th style={{ width: 420 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ padding: 14 }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 14, textAlign: 'center' }}>
                    Sin resultados
                  </td>
                </tr>
              )}
              {!loading &&
                sorted.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.nombre}</td>
                    <td>{r.categoria?.nombre || '—'}</td>
                    <td>
                      {Array.isArray(r.ingredientes_receta) && r.ingredientes_receta.length > 0
                        ? `${r.ingredientes_receta.length} item(s)`
                        : '—'}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: r.estado ? '#f6ffed' : '#fff2f0',
                          border: '1px solid',
                          borderColor: r.estado ? '#b7eb8f' : '#ffccc7',
                          color: r.estado ? '#237804' : '#a8071a',
                        }}
                      >
                        {r.estado ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn-outline"
                          onClick={() => {
                            setIngReceta(r);
                            setIngMgrOpen(true);
                          }}
                          style={{ width: 'auto' }}
                        >
                          🧪 Ingredientes
                        </button>
                        <button
                          className="btn-outline"
                          onClick={() => {
                            setRecetaSel(r);
                            setMapOpen(true);
                          }}
                          style={{ width: 'auto' }}
                          title="Mapear productos y vencimientos"
                        >
                          🧩 Mapeos PT
                        </button>
                        <button
                          className="btn-outline"
                          onClick={() => {
                            setEditing({
                              id: r.id,
                              nombre: r.nombre,
                              estado: !!r.estado,
                              rendimiento_por_batch: r.rendimiento_por_batch ?? '1',
                              categoria_id: r.categoria?.id || '',
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
                            setToToggle({ id: r.id, estado: r.estado, nombre: r.nombre });
                            setConfirmToggleOpen(true);
                          }}
                          style={{ width: 'auto' }}
                        >
                          {r.estado ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          className="btn-danger-outline"
                          onClick={() => {
                            setToDeleteHard(r);
                            setConfirmHardOpen(true);
                          }}
                          style={{ width: 'auto' }}
                          title="Eliminar definitivamente (hard delete)"
                        >
                          🔥 Eliminar definitiva
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear/editar receta */}
      <Modal
        open={modalOpen}
        title={editing ? 'Editar receta' : 'Nueva receta'}
        onClose={() => {
          if (!submitting) {
            setModalOpen(false);
            setEditing(null);
          }
        }}
      >
        <RecetaForm
          initial={editing || emptyReceta}
          submitting={submitting}
          categorias={categorias}
          onSubmit={(payload) => (editing ? updateItem(editing.id, payload) : createItem(payload))}
        />
        {loadingCats && (
          <div className="muted" style={{ marginTop: 8 }}>
            Cargando categorías…
          </div>
        )}
      </Modal>

      {/* Ingredientes Manager */}
      <IngredientesManager
        receta={ingReceta}
        open={ingMgrOpen}
        onClose={() => {
          setIngMgrOpen(false);
          setIngReceta(null);
          load();
        }}
      />

      {/* Modal de mapeos PT */}
      <RecetaProductoMapModal
        open={mapOpen}
        receta={recetaSel}
        onClose={() => setMapOpen(false)}
        onChanged={() => load()} // refresca lista al cambiar mapeos
      />

      {/* Confirmaciones */}
      <Confirm
        open={confirmHardOpen}
        title="Eliminar definitivamente"
        message={
          toDeleteHard
            ? `Esta acción eliminará la receta "${toDeleteHard.nombre}" de forma permanente.`
            : ''
        }
        onCancel={() => {
          setConfirmHardOpen(false);
          setToDeleteHard(null);
        }}
        onConfirm={() => removeItemHard(toDeleteHard.id)}
        extra={
          <div
            className="muted"
            style={{
              background: '#fff2f0',
              border: '1px solid #ffccc7',
              padding: 8,
              borderRadius: 8,
            }}
          >
            Si la receta tiene producciones asociadas, el servidor lo impedirá.
          </div>
        }
      />

      <Confirm
        open={confirmToggleOpen}
        title={toToggle?.estado ? 'Desactivar receta' : 'Activar receta'}
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
