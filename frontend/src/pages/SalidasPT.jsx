// src/pages/SalidasPT.jsx
import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

/* UI helpers reutilizables:
   Centralizan feedback (toast) y contenedor modal para acciones de registro, manteniendo consistencia visual/UX. */
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
      {/* stopPropagation evita cerrar el modal al hacer click dentro del contenido */}
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

/* Helpers de formato/normalización:
   - Evitan NaN y garantizan enteros al mostrar cantidades.
   - Unifican presentación de etapa y cantidades por empaque (paquetes + unidades). */
function toInt(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.round(x) : 0;
}

function etapaLabel(etapa) {
  const e = String(etapa || '').toUpperCase();
  if (e === 'EMPAQUE') return '📦 EMPAQUE';
  if (e === 'HORNEO') return '🔥 HORNEO';
  if (e === 'CONGELADO') return '🧊 CONGELADO';
  return e || '-';
}

function formatCantidadLote(l) {
  const etapa = String(l.etapa || '').toUpperCase();
  const uds = toInt(l.cantidad);
  const uxe = Number(l.productos_terminados?.unidades_por_empaque || 0);

  /* Regla de negocio de visualización:
     Solo en EMPAQUE/HORNEO tiene sentido descomponer en paquetes (si el producto define unidades_por_empaque). */
  if ((etapa === 'EMPAQUE' || etapa === 'HORNEO') && uxe > 0) {
    const pkg = Math.floor(uds / uxe);
    const rest = uds % uxe;
    if (pkg > 0 && rest > 0) return `${pkg} PQ + ${rest} ud (${uds} ud)`;
    if (pkg > 0) return `${pkg} PQ (${uds} ud)`;
    return `${rest} ud`;
  }
  return `${uds} ud`;
}

/* Modelo del formulario:
   - modo FIFO: el backend decide qué lotes descontar en orden FIFO (y opcionalmente prioriza etapa).
   - modo LOTE: el usuario elige el lote exacto (salida manual).
   - venderPor: permite registrar salida por unidades o por paquetes (requiere unidades_por_empaque). */
const emptySalida = {
  producto_id: '',
  modo: 'FIFO', // FIFO | LOTE
  lote_id: '',
  venderPor: 'UNIDADES', // UNIDADES | PAQUETES
  cantidad: '', // unidades
  paquetes: '', // paquetes
  etapa_preferida: '', // "", "EMPAQUE", "HORNEO" (solo para FIFO)
  fecha: new Date().toISOString().slice(0, 10),
  motivo: '',
};

function SalidaPTForm({
  productos,
  lotesDisponibles,
  onChangeProducto,
  initial = emptySalida,
  onSubmit,
  submitting,
}) {
  const [form, setForm] = useState(initial);

  /* Sincroniza el estado local cuando cambian valores iniciales (ej. reabrir modal/limpiar formulario). */
  useEffect(() => setForm(initial), [initial]);

  /* Collator ES:
     Garantiza orden consistente en selects (ignorando acentos/mayúsculas y usando orden natural). */
  const collatorEs = useMemo(
    () => new Intl.Collator('es', { sensitivity: 'base', numeric: true }),
    [],
  );

  /* Producto seleccionado:
     Se usa para leer unidades_por_empaque y validar "vender por paquetes". */
  const prodSel =
    Array.isArray(productos) && productos.find((p) => String(p.id) === String(form.producto_id));
  const unidadesPorEmpaque = Number(prodSel?.unidades_por_empaque || 0);

  const isEnteroPositivo = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

  /* Validación crítica antes de enviar:
     - En modo LOTE exige lote_id.
     - En modo PAQUETES exige unidades_por_empaque configuradas.
     - Evita enviar cantidades vacías/negativas al backend. */
  const canSubmit =
    String(form.producto_id || '') !== '' &&
    String(form.fecha || '') !== '' &&
    (form.modo === 'LOTE'
      ? String(form.lote_id || '') !== '' &&
        ((form.venderPor === 'UNIDADES' && isEnteroPositivo(form.cantidad)) ||
          (form.venderPor === 'PAQUETES' &&
            isEnteroPositivo(form.paquetes) &&
            unidadesPorEmpaque > 0))
      : (form.venderPor === 'UNIDADES' && isEnteroPositivo(form.cantidad)) ||
        (form.venderPor === 'PAQUETES' &&
          isEnteroPositivo(form.paquetes) &&
          unidadesPorEmpaque > 0));

  function handleChange(e) {
    const { name, value } = e.target;

    /* Cambio de producto:
       - Resetea lote seleccionado.
       - Dispara carga de lotes disponibles del producto (solo para modo LOTE). */
    if (name === 'producto_id') {
      setForm((f) => ({ ...f, producto_id: value, lote_id: '' }));
      onChangeProducto(value);
      return;
    }

    /* Cambio de modo:
       - En FIFO no se usa lote_id (se limpia para evitar inconsistencias).
       - En LOTE se mantiene/permite seleccionar lote. */
    if (name === 'modo') {
      setForm((f) => ({ ...f, modo: value, lote_id: value === 'FIFO' ? '' : f.lote_id }));
      return;
    }

    /* Cambio venderPor:
       - Evita que queden ambas entradas diligenciadas (unidades y paquetes) al mismo tiempo. */
    if (name === 'venderPor') {
      setForm((f) =>
        value === 'UNIDADES'
          ? { ...f, venderPor: value, paquetes: '' }
          : { ...f, venderPor: value, cantidad: '' },
      );
      return;
    }

    setForm((f) => ({ ...f, [name]: value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    /* Modo LOTE:
       Se envía lote_id y cantidad en UNIDADES (normalizada).
       Si el usuario vende por paquetes, se convierte a unidades aquí para que el backend procese siempre una sola unidad de medida. */
    if (form.modo === 'LOTE') {
      const cantidadUnidades =
        form.venderPor === 'UNIDADES'
          ? Number(form.cantidad)
          : Number(form.paquetes) * unidadesPorEmpaque;

      if (!(cantidadUnidades > 0)) return;

      onSubmit({
        lote_id: Number(form.lote_id),
        cantidad: String(cantidadUnidades),
        fecha: form.fecha,
        motivo: form.motivo?.trim() || undefined,
      });
      return;
    }

    /* Modo FIFO:
       Se envía producto_id y una de estas dos opciones:
       - cantidad (unidades) o
       - paquetes (para que el backend convierta/considere presentación).
       Además permite etapa_preferida para intentar descontar primero de EMPAQUE u HORNEO si existe stock ahí. */
    const base = {
      producto_id: Number(form.producto_id),
      fecha: form.fecha,
      motivo: form.motivo?.trim() || undefined,
    };

    const payload =
      form.venderPor === 'UNIDADES'
        ? { ...base, cantidad: String(Number(form.cantidad)) }
        : { ...base, paquetes: Number(form.paquetes) };

    if (form.etapa_preferida === 'EMPAQUE' || form.etapa_preferida === 'HORNEO') {
      payload.etapa_preferida = form.etapa_preferida;
    }

    onSubmit(payload);
  }

  /* Opciones ordenadas:
     Mejora UX y consistencia entre pantallas (listas alfabéticas). */
  const prodOpts = useMemo(
    () =>
      [...(Array.isArray(productos) ? productos : [])].sort((a, b) =>
        collatorEs.compare(String(a?.nombre || '').trim(), String(b?.nombre || '').trim()),
      ),
    [productos, collatorEs],
  );

  const lotesOpts = useMemo(
    () =>
      [...(Array.isArray(lotesDisponibles) ? lotesDisponibles : [])].sort((a, b) =>
        collatorEs.compare(String(a?.codigo || ''), String(b?.codigo || '')),
      ),
    [lotesDisponibles, collatorEs],
  );

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
          {form.venderPor === 'PAQUETES' && (
            <div className="muted" style={{ marginTop: 4 }}>
              {unidadesPorEmpaque > 0
                ? `1 paquete = ${unidadesPorEmpaque} uds`
                : 'Este producto no tiene unidades por empaque configuradas'}
            </div>
          )}
        </div>

        <div>
          <label>Modo de salida</label>
          <select name="modo" value={form.modo} onChange={handleChange}>
            <option value="FIFO">FIFO automático</option>
            <option value="LOTE">Seleccionar lote (manual)</option>
          </select>
        </div>

        {form.modo === 'LOTE' && (
          <div>
            <label>Lote disponible</label>
            <select
              name="lote_id"
              value={form.lote_id}
              onChange={handleChange}
              disabled={!form.producto_id}
              required
            >
              <option value="">— Seleccione —</option>
              {lotesOpts.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codigo} · {formatCantidadLote(l)} · {etapaLabel(l.etapa)}
                  {l.fecha_ingreso ? ` (ing: ${String(l.fecha_ingreso).slice(0, 10)})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {form.modo === 'FIFO' && (
          <div>
            <label>Etapa preferida</label>
            <select
              name="etapa_preferida"
              value={form.etapa_preferida}
              onChange={handleChange}
              title="Si hay existencias en esa etapa, se descuenta de ahí primero"
            >
              <option value="">Sin preferencia</option>
              <option value="EMPAQUE">Empaque</option>
              <option value="HORNEO">Horneo</option>
            </select>
          </div>
        )}

        <div>
          <label>Vender por</label>
          <select name="venderPor" value={form.venderPor} onChange={handleChange}>
            <option value="UNIDADES">Unidades</option>
            <option value="PAQUETES">Paquetes</option>
          </select>
        </div>

        {form.venderPor === 'UNIDADES' ? (
          <div>
            <label>Cantidad (unidades)</label>
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
        ) : (
          <div>
            <label>Paquetes</label>
            <input
              name="paquetes"
              type="number"
              min="1"
              step="1"
              value={form.paquetes}
              onChange={handleChange}
              required
            />
            {unidadesPorEmpaque > 0 && form.paquetes ? (
              <div className="muted" style={{ marginTop: 4 }}>
                Se descontarán {Number(form.paquetes) * unidadesPorEmpaque} unidades.
              </div>
            ) : null}
          </div>
        )}

        <div>
          <label>Fecha</label>
          <input type="date" name="fecha" value={form.fecha} onChange={handleChange} required />
        </div>

        <div>
          <label>Motivo (opcional)</label>
          <input
            name="motivo"
            placeholder="Venta, merma, ajuste…"
            value={form.motivo}
            onChange={handleChange}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="btn-primary" disabled={!canSubmit || submitting}>
          {submitting ? 'Guardando…' : 'Registrar salida'}
        </button>
      </div>
    </form>
  );
}

/* Pantalla Salidas PT:
   - Muestra lotes "vendibles" como referencia: solo DISPONIBLE y etapa EMPAQUE/HORNEO.
   - El registro real se hace por POST /pt/salidas (FIFO o por lote).
   - Se recarga tabla y lotes del formulario tras registrar una salida para mantener consistencia de stock. */
export default function SalidasPT() {
  const [productos, setProductos] = useState([]);
  const [loadingProductos, setLoadingProductos] = useState(true);

  const [lotes, setLotes] = useState([]); // lotes visibles en tabla (filtro)
  const [loadingLotes, setLoadingLotes] = useState(true);

  const [lotesDeProducto, setLotesDeProducto] = useState([]); // lotes DISPONIBLES para el form
  const [loadingLotesForm, setLoadingLotesForm] = useState(false);

  const [filters, setFilters] = useState({ q: '', producto_id: '' });

  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState({ type: 'success', message: '' });

  async function loadProductos() {
    setLoadingProductos(true);
    try {
      const { data } = await api.get('/productos?estado=true');
      setProductos(Array.isArray(data) ? data : []);
    } catch {
      setProductos([]);
      setToast({ type: 'error', message: 'No se pudieron cargar productos' });
    } finally {
      setLoadingProductos(false);
    }
  }

  async function loadLotes() {
    setLoadingLotes(true);
    try {
      const params = new URLSearchParams();
      if (filters.q.trim()) params.set('q', filters.q.trim());
      if (filters.producto_id) params.set('producto_id', String(filters.producto_id));
      const { data } = await api.get(`/pt/lotes?${params.toString()}`);
      const arr = Array.isArray(data) ? data : [];

      /* Regla de negocio (vendibles en esta pantalla):
         Solo se listan lotes DISPONIBLE y etapa EMPAQUE/HORNEO (CONGELADO no es vendible aquí). */
      const vendibles = arr.filter(
        (l) =>
          l.estado === 'DISPONIBLE' &&
          (String(l.etapa).toUpperCase() === 'EMPAQUE' ||
            String(l.etapa).toUpperCase() === 'HORNEO'),
      );
      setLotes(vendibles);
    } catch {
      setLotes([]);
      setToast({ type: 'error', message: 'No se pudieron cargar lotes' });
    } finally {
      setLoadingLotes(false);
    }
  }

  /* Carga inicial de catálogos y lotes vendibles. */
  useEffect(() => {
    loadProductos();
    loadLotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Recarga cuando cambia el filtro de producto (server-side). */
  useEffect(() => {
    loadLotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.producto_id]);

  /* Carga de lotes disponibles para el formulario (cuando se selecciona producto):
     Se filtra a vendibles para evitar que el usuario intente sacar de lotes no aptos. */
  async function onChangeProductoForm(prodId) {
    if (!prodId) {
      setLotesDeProducto([]);
      return;
    }
    setLoadingLotesForm(true);
    try {
      const { data } = await api.get(`/pt/lotes?producto_id=${Number(prodId)}`);
      const arr = Array.isArray(data) ? data : [];
      const vendibles = arr.filter(
        (l) =>
          l.estado === 'DISPONIBLE' &&
          (String(l.etapa).toUpperCase() === 'EMPAQUE' ||
            String(l.etapa).toUpperCase() === 'HORNEO'),
      );
      setLotesDeProducto(vendibles);
    } catch {
      setLotesDeProducto([]);
    } finally {
      setLoadingLotesForm(false);
    }
  }

  /* Registro de salida:
     - POST /pt/salidas recibe payload FIFO o por lote.
     - Al finalizar, se recarga la tabla y (si aplica) los lotes del producto del formulario para reflejar el nuevo stock. */
  async function registrarSalida(payload) {
    setSubmitting(true);
    try {
      await api.post('/pt/salidas', payload);
      setToast({ type: 'success', message: 'Salida registrada' });
      setModalOpen(false);
      await Promise.all([
        loadLotes(),
        filters.producto_id ? onChangeProductoForm(filters.producto_id) : Promise.resolve(),
      ]);
    } catch (e) {
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'No se pudo registrar la salida',
      });
    } finally {
      setSubmitting(false);
    }
  }

  /* Filtro en cliente (texto) para la tabla, sobre los lotes vendibles ya cargados. */
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return lotes.filter((l) => {
      const matchText =
        !q ||
        l.codigo?.toLowerCase().includes(q) ||
        l.productos_terminados?.nombre?.toLowerCase?.().includes(q);
      return matchText;
    });
  }, [lotes, filters.q]);

  /* Orden descendente por fecha de ingreso (y por id como tie-break) para mostrar lo más reciente primero. */
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = new Date(a.fecha_ingreso || 0).getTime();
      const db = new Date(b.fecha_ingreso || 0).getTime();
      if (db !== da) return db - da;
      return (b.id || 0) - (a.id || 0);
    });
  }, [filtered]);

  /* Collator y productos ordenados para el select de filtros. */
  const collatorEs = useMemo(
    () => new Intl.Collator('es', { sensitivity: 'base', numeric: true }),
    [],
  );
  const productosOrdenados = useMemo(
    () =>
      [...(productos || [])].sort((a, b) =>
        collatorEs.compare(String(a?.nombre || '').trim(), String(b?.nombre || '').trim()),
      ),
    [productos, collatorEs],
  );

  const header = (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <h2 style={{ margin: 0 }}>Salidas de Producto Terminado</h2>
        <div className="muted">
          Registra salidas por FIFO o por lote (manual). También puedes vender por paquetes.
        </div>
      </div>
      <button
        className="btn-primary"
        onClick={() => {
          setModalOpen(true);
          setLotesDeProducto([]);
        }}
        style={{ width: 'auto' }}
      >
        + Registrar salida
      </button>
    </div>
  );

  return (
    <div className="page">
      <div className="card">
        {header}

        {/* Filtros:
           - q filtra en cliente por código o nombre de producto.
           - producto_id filtra en servidor (recarga loadLotes con query param). */}
        <div
          className="filters"
          style={{ marginTop: 12, display: 'grid', gap: 8, gridTemplateColumns: '1fr 240px' }}
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
        </div>

        {/* Tabla de lotes disponibles (referencia operativa):
           Lista únicamente lotes vendibles (DISPONIBLE + etapa EMPAQUE/HORNEO). */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Producto</th>
                <th>Código lote</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th>Ingreso</th>
                <th>Vence</th>
                <th>Estado</th>
                <th>Etapa</th>
              </tr>
            </thead>
            <tbody>
              {loadingLotes && (
                <tr>
                  <td colSpan={8} style={{ padding: 14 }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loadingLotes && sorted.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 14, textAlign: 'center' }}>
                    Sin resultados
                  </td>
                </tr>
              )}
              {!loadingLotes &&
                sorted.map((l) => (
                  <tr key={l.id}>
                    <td>{l.id}</td>
                    <td>{l.productos_terminados?.nombre || '-'}</td>
                    <td>{l.codigo}</td>
                    <td style={{ textAlign: 'right' }}>{formatCantidadLote(l)}</td>
                    <td>{l.fecha_ingreso?.slice(0, 10)}</td>
                    <td>{l.fecha_vencimiento?.slice(0, 10) || '—'}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: l.estado === 'DISPONIBLE' ? '#f6ffed' : '#fff2f0',
                          border: '1px solid',
                          borderColor: l.estado === 'DISPONIBLE' ? '#b7eb8f' : '#ffccc7',
                          color: l.estado === 'DISPONIBLE' ? '#237804' : '#a8071a',
                        }}
                      >
                        {l.estado}
                      </span>
                    </td>
                    <td>{String(l.etapa || '').toUpperCase()}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal salida:
         El formulario arma el payload (FIFO o LOTE) y este componente lo envía a /pt/salidas. */}
      <Modal
        open={modalOpen}
        title="Registrar salida de PT"
        onClose={() => {
          if (!submitting) setModalOpen(false);
        }}
      >
        <SalidaPTForm
          productos={productosOrdenados}
          lotesDisponibles={lotesDeProducto}
          onChangeProducto={onChangeProductoForm}
          submitting={submitting}
          onSubmit={(payload) => registrarSalida(payload)}
        />
        {(loadingProductos || loadingLotesForm) && (
          <div className="muted" style={{ marginTop: 8 }}>
            {loadingProductos ? 'Cargando productos…' : ''}
            {loadingProductos && loadingLotesForm ? ' · ' : ''}
            {loadingLotesForm ? 'Cargando lotes…' : ''}
          </div>
        )}
      </Modal>

      {/* Toast centralizado para éxito/error en cargas y registro. */}
      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: '' })}
      />
    </div>
  );
}
