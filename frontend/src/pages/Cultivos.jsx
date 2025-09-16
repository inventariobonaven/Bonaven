import { useEffect, useMemo, useState } from 'react';
import { listarCultivos, alimentarCultivo } from '../api/cultivos';
import api from '../api/client';

/* ---------- UI: toast ---------- */
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

const asNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export default function Cultivos() {
  const [cultivos, setCultivos] = useState([]);
  const [mpList, setMpList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ type: 'success', message: '' });

  const [selId, setSelId] = useState(null);
  const selected = useMemo(() => cultivos.find((c) => c.id === selId) || null, [cultivos, selId]);

  // Alimentación
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [harinaMp, setHarinaMp] = useState('');
  const [harinaQty, setHarinaQty] = useState('');
  const [notas, setNotas] = useState('');
  const [submittingFeed, setSubmittingFeed] = useState(false);

  // Espolvoreo
  const [espFecha, setEspFecha] = useState(new Date().toISOString().slice(0, 10));
  const [espMp, setEspMp] = useState('');
  const [espQty, setEspQty] = useState('');
  const [espNotas, setEspNotas] = useState('');
  const [submittingEsp, setSubmittingEsp] = useState(false);

  async function loadCultivos() {
    setLoading(true);
    try {
      const { data } = await listarCultivos({});
      const out = Array.isArray(data) ? data : [];
      out.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setCultivos(out);
      if (!selId && out.length) setSelId(out[0].id);
    } catch (e) {
      setToast({
        type: 'error',
        message: e?.response?.data?.message || 'No se pudieron cargar cultivos',
      });
    } finally {
      setLoading(false);
    }
  }

  // ⚠️ Volvemos al endpoint global de MPs
  async function loadMPs() {
    try {
      const { data } = await api.get('/materias-primas?estado=true');
      const list = Array.isArray(data) ? data : [];
      list.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      setMpList(list);
    } catch (e) {
      setMpList([]);
      const msg =
        e?.response?.status === 403
          ? 'Sin permiso para listar Materias Primas (habilita PRODUCCION en el backend).'
          : 'No se pudieron cargar las materias primas';
      setToast({ type: 'error', message: msg });
    }
  }

  useEffect(() => {
    loadCultivos();
    loadMPs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canFeed =
    !!selected && String(harinaMp || '') !== '' && asNum(harinaQty) > 0 && !submittingFeed;

  async function submitFeed(e) {
    e.preventDefault();
    if (!canFeed || !selected) return;
    try {
      setSubmittingFeed(true);
      await alimentarCultivo(selected.id, {
        fecha: fecha || null,
        harina_mp_id: Number(harinaMp),
        harina_cantidad: Number(harinaQty),
        notas: (notas || '').trim() || null,
      });
      setToast({ type: 'success', message: 'Alimentación registrada' });
      setHarinaQty('');
      setNotas('');
      await loadCultivos();
    } catch (e2) {
      setToast({
        type: 'error',
        message: e2?.response?.data?.message || 'No se pudo registrar la alimentación',
      });
    } finally {
      setSubmittingFeed(false);
    }
  }

  const canEsp = !!selected && String(espMp || '') !== '' && asNum(espQty) > 0 && !submittingEsp;

  async function submitEspolvoreo(e) {
    e.preventDefault();
    if (!canEsp || !selected) return;
    try {
      setSubmittingEsp(true);
      await api.post(`/cultivos/${selected.id}/espolvoreo`, {
        fecha: espFecha || null,
        mp_id: Number(espMp),
        cantidad: Number(espQty),
        notas: (espNotas || '').trim() || null,
      });
      setToast({ type: 'success', message: 'Espolvoreo registrado' });
      setEspQty('');
      setEspNotas('');
    } catch (e2) {
      setToast({
        type: 'error',
        message: e2?.response?.data?.message || 'No se pudo registrar el espolvoreo',
      });
    } finally {
      setSubmittingEsp(false);
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Masa madre</h2>
        <div className="muted">
          <b>Alimentación</b> (descuenta harina) y <b>Espolvoreo</b> (descuenta harina
          independiente).
        </div>
        {selected && (
          <div className="muted" style={{ marginTop: 6 }}>
            Cultivo seleccionado: <b>{selected.nombre}</b>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {/* Alimentación */}
        <div className="card">
          <div style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Alimentación</h3>
            <div className="muted">
              Descuenta harina. El movimiento queda con motivo “ALIMENTACION MASA MADRE”.
            </div>
          </div>

          <form onSubmit={submitFeed}>
            <div className="form-grid">
              <div>
                <label>Fecha</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>

              <div>
                <label>Harina (MP)</label>
                <select value={harinaMp} onChange={(e) => setHarinaMp(e.target.value)} required>
                  <option value="">— Seleccione —</option>
                  {mpList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Cantidad de harina</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  placeholder="0.000"
                  value={harinaQty}
                  onChange={(e) => setHarinaQty(e.target.value)}
                  required
                />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label>Notas (opcional)</label>
                <input
                  placeholder="Observaciones…"
                  value={notas}
                  onChange={(e) => setNotas(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-primary" disabled={!canFeed || !selected}>
                {submittingFeed ? 'Guardando…' : 'Registrar alimentación'}
              </button>
            </div>
          </form>
        </div>

        {/* Espolvoreo */}
        <div className="card">
          <div style={{ marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Espolvoreo</h3>
            <div className="muted">
              Descuenta harina para espolvorear (no modifica stock del cultivo).
            </div>
          </div>

          <form onSubmit={submitEspolvoreo}>
            <div className="form-grid">
              <div>
                <label>Fecha</label>
                <input type="date" value={espFecha} onChange={(e) => setEspFecha(e.target.value)} />
              </div>

              <div>
                <label>Harina (MP)</label>
                <select value={espMp} onChange={(e) => setEspMp(e.target.value)} required>
                  <option value="">— Seleccione —</option>
                  {mpList.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Cantidad de espolvoreo</label>
                <input
                  type="number"
                  min="0.001"
                  step="0.001"
                  placeholder="0.000"
                  value={espQty}
                  onChange={(e) => setEspQty(e.target.value)}
                  required
                />
              </div>

              <div style={{ gridColumn: '1/-1' }}>
                <label>Notas (opcional)</label>
                <input
                  placeholder="Observaciones…"
                  value={espNotas}
                  onChange={(e) => setEspNotas(e.target.value)}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn-outline" disabled={!canEsp || !selected}>
                {submittingEsp ? 'Guardando…' : 'Registrar espolvoreo'}
              </button>
            </div>
          </form>
        </div>
      </div>

      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: '' })}
      />
    </div>
  );
}
