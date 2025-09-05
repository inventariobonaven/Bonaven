import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';
import { fetchMapByReceta, createMap, updateMap, deleteMap } from '../api/recetaProductoMap';

const BASES = ['PRODUCCION', 'EMPAQUE', 'HORNEO'];

export default function RecetaProductosMap({ recetaId }) {
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

  const prodOpts = useMemo(() => Array.isArray(productos) ? productos : [], [productos]);

  async function loadAll() {
    if (!recetaId) return;
    setLoading(true);
    try {
      const [rows, prods] = await Promise.all([
        fetchMapByReceta(recetaId),
        api.get('/productos?estado=true').then(r => Array.isArray(r.data) ? r.data : []),
      ]);
      setMaps(rows);
      setProductos(prods);
    } catch (e) {
      setToast({ type: 'error', message: e?.response?.data?.message || 'Error cargando mapeos' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setEditing(null); setForm({
    producto_id: '',
    unidades_por_batch: '',
    vida_util_dias: '0',
    vencimiento_base: 'PRODUCCION',
  }); loadAll(); /* eslint-disable-next-line */ }, [recetaId]);

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

  function canSubmit() {
    const und = Number(form.unidades_por_batch);
    const vida = Number(form.vida_util_dias);
    return (
      recetaId &&
      String(form.producto_id || '') !== '' &&
      Number.isInteger(und) && und > 0 &&
      Number.isInteger(vida) && vida >= 0 &&
      BASES.includes(String(form.vencimiento_base).toUpperCase())
    );
  }

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

  async function removeMap(m) {
    if (!window.confirm(`¿Eliminar mapeo a "${m.producto?.nombre || ('#'+m.producto_id)}"?`)) return;
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
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <h3 style={{ margin: 0 }}>Productos resultantes de la receta</h3>
        <button className="btn-outline" onClick={onNew} style={{ width:'auto' }}>
          {editing ? 'Nuevo mapeo' : 'Limpiar'}
        </button>
      </div>

      {/* Tabla */}
      <div style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Producto</th>
              <th style={{ textAlign:'right' }}>Unid / batch</th>
              <th>Vence basado en</th>
              <th style={{ textAlign:'right' }}>Vida (días)</th>
              <th style={{ width: 160 }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: 14 }}>Cargando…</td></tr>
            ) : maps.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: 14, textAlign:'center' }}>Sin mapeos</td></tr>
            ) : maps.map(m => (
              <tr key={m.id}>
                <td>{m.producto?.nombre || `#${m.producto_id}`}</td>
                <td style={{ textAlign:'right' }}>{m.unidades_por_batch}</td>
                <td>{m.vencimiento_base}</td>
                <td style={{ textAlign:'right' }}>{m.vida_util_dias}</td>
                <td>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button className="btn-outline" style={{ width:'auto' }} onClick={() => onEdit(m)}>✏️ Editar</button>
                    <button className="btn-danger-outline" style={{ width:'auto' }} onClick={() => removeMap(m)}>🗑️ Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Form */}
      <form onSubmit={submit} style={{ marginTop: 12 }}>
        <div className="form-grid">
          <div>
            <label>Producto</label>
            <select
              value={form.producto_id}
              onChange={e => setForm(f => ({ ...f, producto_id: e.target.value }))}
              disabled={!!editing}
              required
            >
              <option value="">— Seleccione —</option>
              {prodOpts.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
            {editing && <div className="muted" style={{ marginTop: 4 }}>No puedes cambiar el producto al editar.</div>}
          </div>

          <div>
            <label>Unidades por batch</label>
            <input
              type="number" min="1" step="1"
              value={form.unidades_por_batch}
              onChange={e => setForm(f => ({ ...f, unidades_por_batch: e.target.value }))}
              required
            />
          </div>

          <div>
            <label>Vencimiento basado en</label>
            <select
              value={form.vencimiento_base}
              onChange={e => setForm(f => ({ ...f, vencimiento_base: e.target.value }))}
            >
              {BASES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label>Vida útil (días)</label>
            <input
              type="number" min="0" step="1"
              value={form.vida_util_dias}
              onChange={e => setForm(f => ({ ...f, vida_util_dias: e.target.value }))}
              required
            />
          </div>
        </div>

        <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
          <button className="btn-primary" disabled={!canSubmit()}>
            {editing ? 'Guardar cambios' : 'Agregar mapeo'}
          </button>
        </div>
      </form>

      {/* Toast inline muy simple */}
      {toast.message && (
        <div className="card" style={{
          marginTop: 10,
          background: toast.type==='error' ? '#fff2f0' : '#f6ffed',
          border: '1px solid',
          borderColor: toast.type==='error' ? '#ffccc7' : '#b7eb8f',
          color: toast.type==='error' ? '#a8071a' : '#237804',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
            <span>{toast.message}</span>
            <button className="btn-outline" onClick={() => setToast({ ...toast, message:'' })} style={{ width:'auto' }}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}



