import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

/* ===== Helpers UI reusables (simples) ===== */
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

const fmtDec = (x) => {
  const n = typeof x === 'string' ? parseFloat(x) : Number(x);
  if (Number.isNaN(n)) return '0';
  return (Math.round(n * 1000) / 1000).toString();
};

// Normaliza cualquier unidad base a la “chica” para mostrar (g/ml/ud)
function normalizeToSmallUnit(qty, unit) {
  const n = Number(qty) || 0;
  const u = String(unit || '').toLowerCase();
  if (u === 'kg') return { value: n * 1000, unit: 'g' };
  if (u === 'l') return { value: n * 1000, unit: 'ml' };
  if (u === 'g') return { value: n, unit: 'g' };
  if (u === 'ml') return { value: n, unit: 'ml' };
  return { value: n, unit: 'ud' };
}

/* ===== Orden alfabético (insensible a mayúsculas/acentos) ===== */
const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const byNombre = (a, b) => collator.compare(String(a?.nombre || ''), String(b?.nombre || ''));

/* ===== Página ===== */
export default function Produccion() {
  const [categorias, setCategorias] = useState([]);
  const [loadingCats, setLoadingCats] = useState(true);
  const [categoriaId, setCategoriaId] = useState('');

  const [recetas, setRecetas] = useState([]);
  const [loadingRecetas, setLoadingRecetas] = useState(true);

  const [recetaId, setRecetaId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [fecha, setFecha] = useState('');

  // Horas obligatorias (si envías una debes enviar ambas; el backend ya valida)
  const [horaInicio, setHoraInicio] = useState('');
  const [horaFin, setHoraFin] = useState('');

  // Observación
  const [observacion, setObservacion] = useState('');

  // Código de lote manual (opcional)
  const [loteCodigo, setLoteCodigo] = useState('');

  const [calcLoading, setCalcLoading] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);

  const [calc, setCalc] = useState(null); // respuesta de /calcular
  const [lastSig, setLastSig] = useState(''); // firma recetaId|cantidad del último cálculo OK

  const [toast, setToast] = useState({ type: 'success', message: '' });

  /* ---- Cargar categorías ---- */
  async function loadCategorias() {
    setLoadingCats(true);
    try {
      const { data } = await api.get('/categorias-receta?estado=true');
      const arr = Array.isArray(data) ? data.slice().sort(byNombre) : [];
      setCategorias(arr);
    } catch {
      setCategorias([]);
      setToast({ type: 'error', message: 'No se pudieron cargar categorías' });
    } finally {
      setLoadingCats(false);
    }
  }

  /* ---- Cargar recetas activas (opcionalmente filtradas por categoría) ---- */
  async function loadRecetas(catId = '') {
    setLoadingRecetas(true);
    try {
      const params = new URLSearchParams();
      params.set('estado', 'true');
      if (catId) params.set('categoria_id', String(catId));
      const { data } = await api.get(`/recetas?${params.toString()}`);
      const arr = Array.isArray(data) ? data.slice().sort(byNombre) : [];
      setRecetas(arr);
    } catch (e) {
      setRecetas([]);
      setToast({ type: 'error', message: 'No se pudieron cargar recetas' });
    } finally {
      setLoadingRecetas(false);
    }
  }

  useEffect(() => {
    loadCategorias();
    loadRecetas('');
  }, []);

  // cuando cambie la categoría, refrescamos recetas y limpiamos selección
  useEffect(() => {
    setRecetaId('');
    setCalc(null);
    setLastSig('');
    loadRecetas(categoriaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoriaId]);

  const selectedReceta = useMemo(
    () => recetas.find((r) => String(r.id) === String(recetaId)),
    [recetas, recetaId],
  );

  /* ---- Calcular ---- */
  async function doCalcular() {
    if (!recetaId || !cantidad || Number(cantidad) <= 0) {
      setToast({ type: 'error', message: 'Selecciona receta y una cantidad válida' });
      return;
    }
    setCalcLoading(true);
    try {
      const { data } = await api.post('/produccion/calcular', {
        receta_id: Number(recetaId),
        cantidad: Number(cantidad),
      });
      setCalc(data);
      if (data?.ok) setLastSig(`${recetaId}|${cantidad}`);
      else setLastSig('');
    } catch (e) {
      setCalc(null);
      setLastSig('');
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'Error calculando producción',
      });
    } finally {
      setCalcLoading(false);
    }
  }

  const canRegister = calc?.ok === true && lastSig === `${recetaId}|${cantidad}` && !calcLoading;

  /* ---- Registrar ---- */
  async function doRegistrar() {
    if (!canRegister) return;
    setRegisterLoading(true);
    try {
      const payload = {
        receta_id: Number(recetaId),
        cantidad_producida: Number(cantidad),
        fecha: fecha || undefined,
        hora_inicio: horaInicio ? new Date(horaInicio).toISOString() : undefined,
        hora_fin: horaFin ? new Date(horaFin).toISOString() : undefined,
        observacion: observacion?.trim() ? observacion.trim() : undefined,
        lote_codigo: loteCodigo?.trim() ? loteCodigo.trim() : undefined,
      };

      await api.post('/produccion', payload);

      setToast({ type: 'success', message: 'Producción registrada' });
      setCalc(null);
      setLastSig('');
      setObservacion('');
      setLoteCodigo('');
    } catch (e) {
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'Error registrando producción',
      });
    } finally {
      setRegisterLoading(false);
    }
  }

  // ====== DERIVADOS PARA MOSTRAR RENDIMIENTO ESPERADO ======
  const rpb = useMemo(() => {
    const raw = selectedReceta?.rendimiento_por_batch ?? 1;
    const n = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    return Number.isNaN(n) ? 1 : n;
  }, [selectedReceta]);

  const batches = useMemo(() => {
    const n = typeof cantidad === 'string' ? parseFloat(cantidad) : Number(cantidad);
    return Number.isNaN(n) ? 0 : n;
  }, [cantidad]);

  const expectedUnits = useMemo(() => {
    return batches * rpb;
  }, [batches, rpb]);

  /* ---- UI ---- */
  return (
    <div className="page">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Producción</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          Selecciona categoría y receta, calcula los insumos (sin descontar), revisa, y luego
          registra para descontar por FIFO. Puedes indicar hora de inicio / fin. Si el producto
          mapeado requiere congelación previa, el lote entrará en
          <b> CONGELADO</b>; si no, entrará en <b>EMPAQUE</b> y se descontarán bolsas.
        </div>

        <div className="form-grid">
          <div>
            <label>Categoría</label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              disabled={loadingCats}
            >
              <option value="">{loadingCats ? 'Cargando...' : 'Todas las categorías'}</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Receta</label>
            <select
              value={recetaId}
              onChange={(e) => {
                setRecetaId(e.target.value);
                setLastSig(''); // invalida cálculo previo
                setCalc(null);
              }}
              disabled={loadingRecetas}
            >
              <option value="">{loadingRecetas ? 'Cargando...' : 'Seleccione receta'}</option>
              {recetas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                  {r.categoria ? ` · ${r.categoria.nombre}` : ''}
                  {r.presentaciones
                    ? ` · ${r.presentaciones.nombre} ${fmtDec(r.presentaciones.cantidad)} ${r.presentaciones.unidad_medida}`
                    : ''}
                  {r.rendimiento_por_batch
                    ? ` · Rend: ${fmtDec(r.rendimiento_por_batch)}/batch`
                    : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label>Cantidad a producir (Masas)</label>
            <input
              type="number"
              min="0.001"
              step="0.001"
              value={cantidad}
              onChange={(e) => {
                setCantidad(e.target.value);
                setLastSig(''); // invalida cálculo previo
              }}
            />
          </div>

          <div>
            <label>Fecha (opcional)</label>
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </div>

          <div>
            <label>Hora inicio </label>
            <input
              type="datetime-local"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
            />
          </div>

          <div>
            <label>Hora fin </label>
            <input
              type="datetime-local"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
            />
          </div>

          <div>
            <label>Código de lote</label>
            <input
              placeholder="Si lo dejas vacío se usará YYYYMMDD"
              value={loteCodigo}
              onChange={(e) => setLoteCodigo(e.target.value)}
            />
            <div className="muted" style={{ marginTop: 4 }}>
              Se aplica al/los lotes PT generados por esta producción.
            </div>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <label>Observación (opcional)</label>
            <textarea
              rows={6}
              placeholder="Notas, incidencias, ajustes de la producción.."
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'end', gap: 8 }}>
            <button
              className="btn-outline"
              style={{ width: 'auto' }}
              onClick={doCalcular}
              disabled={calcLoading || !recetaId || !cantidad || Number(cantidad) <= 0}
            >
              {calcLoading ? 'Calculando…' : 'Calcular'}
            </button>

            <button
              className="btn-primary"
              style={{ width: 'auto' }}
              onClick={doRegistrar}
              disabled={!canRegister || registerLoading}
              title={
                !calc
                  ? 'Primero realiza el cálculo'
                  : calc?.ok !== true
                    ? 'Hay faltantes, no se puede registrar'
                    : lastSig !== `${recetaId}|${cantidad}`
                      ? 'Receta o cantidad cambiaron, recalcula'
                      : ''
              }
            >
              {registerLoading ? 'Registrando…' : 'Registrar producción'}
            </button>
          </div>
        </div>

        {/* Resultado del cálculo */}
        {calc && (
          <div className="card" style={{ marginTop: 16 }}>
            {/* Estado de suficiencia */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                marginBottom: 8,
                flexWrap: 'wrap',
              }}
            >
              <span
                className="badge"
                style={{
                  background: calc.ok ? '#f6ffed' : '#fff2f0',
                  border: '1px solid',
                  borderColor: calc.ok ? '#b7eb8f' : '#ffccc7',
                  color: calc.ok ? '#237804' : '#a8071a',
                }}
              >
                {calc.ok ? 'Stock suficiente' : 'Faltantes'}
              </span>
              {lastSig !== `${recetaId}|${cantidad}` && (
                <span className="muted">Se modificó receta/cantidad, recalcula para registrar</span>
              )}
            </div>

            {/* Resumen de salida esperada por batch */}
            <div
              className="card"
              style={{
                marginBottom: 12,
                background: '#f6ffed',
                border: '1px solid #b7eb8f',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                <strong>Salida esperada:</strong>
                <span>
                  {fmtDec(batches)} batch(es) × {fmtDec(rpb)} = <b>{fmtDec(expectedUnits)}</b>{' '}
                  {selectedReceta?.presentaciones
                    ? `${selectedReceta.presentaciones.nombre} (${fmtDec(selectedReceta.presentaciones.cantidad)} ${selectedReceta.presentaciones.unidad_medida})`
                    : 'unidades'}
                </span>
              </div>
              {!selectedReceta?.presentacion_id && (
                <div className="muted" style={{ marginTop: 4 }}>
                  Esta receta no tiene una presentación asociada; la salida se muestra en
                  “unidades”.
                </div>
              )}
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th>Materia prima</th>
                  <th style={{ textAlign: 'right' }}>Requerido</th>
                  <th>Unidad</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {calc.detalles?.map((d) => {
                  const mp = (selectedReceta?.ingredientes_receta || []).find(
                    (ing) => String(ing.materia_prima_id) === String(d.materia_prima_id),
                  )?.materias_primas;
                  const nombre = mp?.nombre || `MP #${d.materia_prima_id}`;

                  const req = normalizeToSmallUnit(d.requerido, d.unidad);
                  const falt = normalizeToSmallUnit(d.faltante || 0, d.unidad);

                  return (
                    <tr key={d.materia_prima_id}>
                      <td>{nombre}</td>
                      <td style={{ textAlign: 'right' }}>{fmtDec(req.value)}</td>
                      <td>{req.unit}</td>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: d.suficiente ? '#f6ffed' : '#fff2f0',
                            border: '1px solid',
                            borderColor: d.suficiente ? '#b7eb8f' : '#ffccc7',
                            color: d.suficiente ? '#237804' : '#a8071a',
                          }}
                        >
                          {d.suficiente ? 'OK' : `Falta ${fmtDec(falt.value)} ${req.unit}`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Plan de lotes (sin "Usar") */}
            {calc.detalles?.map((d) => {
              const ing = (selectedReceta?.ingredientes_receta || []).find(
                (x) => String(x.materia_prima_id) === String(d.materia_prima_id),
              );
              const mpNombre = ing?.materias_primas?.nombre || `MP #${d.materia_prima_id}`;
              const reqSmall = normalizeToSmallUnit(d.requerido, d.unidad);

              return (
                <div key={`plan-${d.materia_prima_id}`} style={{ marginTop: 10 }}>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    Lotes a consumir — <b>{mpNombre}</b>{' '}
                    <span className="muted">
                      · requerido: {fmtDec(reqSmall.value)} {reqSmall.unit}
                    </span>
                  </div>

                  {d.lotes?.length ? (
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: 120 }}>Lote</th>
                          <th>Vence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.lotes.map((l) => (
                          <tr key={l.lote_id}>
                            <td>{l.lote_codigo ?? `#${l.lote_id}`}</td>
                            <td>
                              {l.fecha_vencimiento
                                ? new Date(l.fecha_vencimiento).toLocaleDateString()
                                : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="muted">— Sin lotes para esta MP —</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: '' })}
      />
    </div>
  );
}
