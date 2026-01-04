import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { fetchMapByReceta, createMap, updateMap, deleteMap } from '../api/recetaProductoMap';

/* Constantes de negocio (UI)
  BASES define desde qué “momento” se calcula el vencimiento del PT:
   - PRODUCCION: desde la fecha de producción (lo más común).
   - EMPAQUE: desde la fecha de empaque (si se empaca después).
   - HORNEO: desde la fecha de horneo (si aplica y difiere).*/
const BASES = ['PRODUCCION', 'EMPAQUE', 'HORNEO'];

export default function RecetaProductosMap({ recetaId }) {
  /* Estados principales
     loading: controla spinners/placeholder en tabla.
     maps: lista de mapeos Receta ↔ Producto (resultado final).
     productos: catálogo de productos activos para el select.
     toast: mensaje de retroalimentación (éxito/error).
     editing: si no es null, estamos editando un mapeo existente (bloquea cambiar producto).
     form: estado del formulario (controlado). */
  const [loading, setLoading] = useState(true);
  const [maps, setMaps] = useState([]);
  const [productos, setProductos] = useState([]);
  const [toast, setToast] = useState({ type: 'success', message: '' });

  const [editing, setEditing] = useState(null); // map row o null
  const [form, setForm] = useState({
    producto_id: '',
    unidades_por_batch: '',
    vida_util_dias: '0',
    vencimiento_base: 'PRODUCCION',
  });

  /* prodOpts:
     Defensivo: garantiza que el render siempre tenga un array. */
  const prodOpts = useMemo(() => (Array.isArray(productos) ? productos : []), [productos]);

  /* Carga inicial / recarga
     loadAll trae:
     1) Mapeos de una receta (fetchMapByReceta)
     2) Productos activos (GET /productos?estado=true) */
  async function loadAll() {
    if (!recetaId) return;
    setLoading(true);
    try {
      const [rows, prods] = await Promise.all([
        fetchMapByReceta(recetaId),
        api.get('/productos?estado=true').then((r) => (Array.isArray(r.data) ? r.data : [])),
      ]);
      setMaps(rows);
      setProductos(prods);
    } catch (e) {
      setToast({ type: 'error', message: e?.response?.data?.message || 'Error cargando mapeos' });
    } finally {
      setLoading(false);
    }
  }

  /* Cuando cambia recetaId:
     - Resetea modo edición
     - Resetea formulario a “nuevo”
     - Recarga tabla + catálogo
     Nota: eslint-disable para evitar dependencia de funciones (patrón común en apps internas). */
  useEffect(() => {
    setEditing(null);
    setForm({
      producto_id: '',
      unidades_por_batch: '',
      vida_util_dias: '0',
      vencimiento_base: 'PRODUCCION',
    });
    loadAll();
    /* eslint-disable-next-line */
  }, [recetaId]);

  /* Acciones de UI
     onEdit: precarga el form con el registro seleccionado.
     - producto_id se bloquea en edición (en UI) para evitar “mover” un mapeo a otro producto.
     onNew: vuelve a modo “crear” y limpia formulario. */
  function onEdit(m) {
    setEditing(m);
    setForm({
      producto_id: m.producto_id,
      unidades_por_batch: String(m.unidades_por_batch),
      vida_util_dias: String(m.vida_util_dias),
      vencimiento_base: String(m.vencimiento_base || 'PRODUCCION'),
    });
  }

  function onNew() {
    setEditing(null);
    setForm({
      producto_id: '',
      unidades_por_batch: '',
      vida_util_dias: '0',
      vencimiento_base: 'PRODUCCION',
    });
  }

  /* Validación clave (negocio)
     Reglas:
     - Debe existir recetaId.
     - producto_id requerido.
     - unidades_por_batch: entero > 0 (cuántas unidades PT salen por batch).
     - vida_util_dias: entero >= 0 (0 significa “sin vencimiento” si tu backend lo interpreta así).
     - vencimiento_base debe estar dentro de BASES.*/
  function canSubmit() {
    const und = Number(form.unidades_por_batch);
    const vida = Number(form.vida_util_dias);
    return (
      recetaId &&
      String(form.producto_id || '') !== '' &&
      Number.isInteger(und) &&
      und > 0 &&
      Number.isInteger(vida) &&
      vida >= 0 &&
      BASES.includes(String(form.vencimiento_base).toUpperCase())
    );
  }

  /* Guardado (crear / editar)
     - Si editing != null => updateMap(editing.id, payload)
       (solo campos editables: unidades, vida, base)
     - Si editing == null => createMap(recetaId, payload)
       (incluye producto_id)
     Luego:
     - recarga todo (para reflejar cambios reales del servidor)
     - vuelve a modo nuevo */
  async function submit(e) {
    e.preventDefault();
    if (!canSubmit()) return;
    try {
      if (editing) {
        await updateMap(editing.id, {
          unidades_por_batch: Number(form.unidades_por_batch),
          vida_util_dias: Number(form.vida_util_dias),
          vencimiento_base: String(form.vencimiento_base).toUpperCase(),
        });
        setToast({ type: 'success', message: 'Mapeo actualizado' });
      } else {
        await createMap(recetaId, {
          producto_id: Number(form.producto_id),
          unidades_por_batch: Number(form.unidades_por_batch),
          vida_util_dias: Number(form.vida_util_dias),
          vencimiento_base: String(form.vencimiento_base).toUpperCase(),
        });
        setToast({ type: 'success', message: 'Mapeo creado' });
      }
      await loadAll();
      onNew();
    } catch (e) {
      setToast({ type: 'error', message: e?.response?.data?.message || 'Error guardando mapeo' });
    }
  }

  /*  Eliminación
     - Confirmación simple con window.confirm
     - deleteMap por id
     - recarga lista para consistencia*/
  async function removeMap(m) {
    if (!window.confirm(`¿Eliminar mapeo a "${m.producto?.nombre || '#' + m.producto_id}"?`))
      return;
    try {
      await deleteMap(m.id);
      setToast({ type: 'success', message: 'Mapeo eliminado' });
      await loadAll();
    } catch (e) {
      setToast({ type: 'error', message: e?.response?.data?.message || 'Error eliminando mapeo' });
    }
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Productos resultantes de la receta</h3>
        {/* Botón contextual:
           - Si estás editando: “Nuevo mapeo” vuelve a modo crear.
           - Si no: “Limpiar” resetea el formulario (onNew hace reset igual). */}
        <button className="btn-outline" onClick={onNew} style={{ width: 'auto' }}>
          {editing ? 'Nuevo mapeo' : 'Limpiar'}
        </button>
      </div>

      {/* Tabla de mapeos existentes
          Muestra lo que la receta produce y cómo se calcula el vencimiento.
          Importante: la tabla es la “fuente visible” para validar configuración rápida. */}
      <div style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th style={{ textAlign: 'right' }}>Unid / batch</th>
              <th>Vence basado en</th>
              <th style={{ textAlign: 'right' }}>Vida (días)</th>
              <th style={{ width: 160 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} style={{ padding: 14 }}>
                  Cargando…
                </td>
              </tr>
            ) : maps.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: 14, textAlign: 'center' }}>
                  Sin mapeos
                </td>
              </tr>
            ) : (
              maps.map((m) => (
                <tr key={m.id}>
                  <td>{m.producto?.nombre || `#${m.producto_id}`}</td>
                  <td style={{ textAlign: 'right' }}>{m.unidades_por_batch}</td>
                  {/* vencimiento_base se muestra tal cual venga del backend.
                    En submit se normaliza a MAYÚSCULAS para consistencia. */}
                  <td>{m.vencimiento_base}</td>
                  <td style={{ textAlign: 'right' }}>{m.vida_util_dias}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {/* Editar: carga el form y bloquea producto_id */}
                      <button
                        className="btn-outline"
                        style={{ width: 'auto' }}
                        onClick={() => onEdit(m)}
                      >
                        ✏️ Editar
                      </button>
                      {/* Eliminar: confirm + delete */}
                      <button
                        className="btn-danger-outline"
                        style={{ width: 'auto' }}
                        onClick={() => removeMap(m)}
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Formulario (crear/editar)
        Es el mismo form para ambos modos:
          - editing null => crea (permite elegir producto)
          - editing != null => edita (producto bloqueado) */}
      <form onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="form-grid">
          <div>
            <label>Producto</label>
            <select
              value={form.producto_id}
              onChange={(e) => setForm((f) => ({ ...f, producto_id: e.target.value }))}
              disabled={!!editing}
              required
            >
              <option value="">— Seleccione —</option>
              {prodOpts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {/* Regla de UX/negocio:
               para evitar inconsistencias, al editar NO se cambia producto (se crea otro mapeo si se requiere). */}
            {editing && (
              <div className="muted" style={{ marginTop: 4 }}>
                No puedes cambiar el producto al editar.
              </div>
            )}
          </div>

          <div>
            <label>Unidades por batch</label>
            <input
              type="number"
              min="1"
              step="1"
              value={form.unidades_por_batch}
              onChange={(e) => setForm((f) => ({ ...f, unidades_por_batch: e.target.value }))}
              required
            />
          </div>

          <div>
            <label>Vencimiento basado en</label>
            <select
              value={form.vencimiento_base}
              onChange={(e) => setForm((f) => ({ ...f, vencimiento_base: e.target.value }))}
            >
              {BASES.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Vida útil (días)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={form.vida_util_dias}
              onChange={(e) => setForm((f) => ({ ...f, vida_util_dias: e.target.value }))}
              required
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          {/* disabled usa canSubmit() para bloquear envíos inválidos */}
          <button className="btn-primary" disabled={!canSubmit()}>
            {editing ? 'Guardar cambios' : 'Agregar mapeo'}
          </button>
        </div>
      </form>

      {/* Toast inline:
         - Minimalista: muestra mensaje y botón cerrar.
         - No es flotante; queda dentro del card para contexto de esta sección. */}
      {toast.message && (
        <div
          className="card"
          style={{
            marginTop: 10,
            background: toast.type === 'error' ? '#fff2f0' : '#f6ffed',
            border: '1px solid',
            borderColor: toast.type === 'error' ? '#ffccc7' : '#b7eb8f',
            color: toast.type === 'error' ? '#a8071a' : '#237804',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span>{toast.message}</span>
            <button
              className="btn-outline"
              onClick={() => setToast({ ...toast, message: '' })}
              style={{ width: 'auto' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
