import { useEffect, useMemo, useState } from "react";
import { listarCultivos, alimentarCultivo } from "../api/cultivos";
import api from "../api/client";

/* ====== UI helpers ====== */
function Toast({ type = "success", message, onClose }) {
  if (!message) return null;
  return (
    <div
      className="card"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 1000,
        borderColor: type === "error" ? "#ffccc7" : "var(--border)",
        background: type === "error" ? "#fff2f0" : "#f6ffed",
      }}
      role="alert"
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <strong style={{ color: type === "error" ? "#a8071a" : "#237804" }}>
          {type === "error" ? "Error" : "Listo"}
        </strong>
        <span>{message}</span>
        <button className="btn-outline" onClick={onClose} style={{ width: "auto" }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}

/* ====== Utils ====== */
const asNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmtInt = (v) => Math.round(asNum(v)).toString();

/* ====== Página ====== */
export default function Cultivos() {
  const [q, setQ] = useState("");
  const [cultivos, setCultivos] = useState([]);
  const [mpList, setMpList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ type: "success", message: "" });

  // selección
  const [selId, setSelId] = useState(null);
  const selected = useMemo(() => cultivos.find((c) => c.id === selId) || null, [cultivos, selId]);

  // ----- Alimentación (solo harina) -----
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [harinaMp, setHarinaMp] = useState("");
  const [harinaQty, setHarinaQty] = useState("");
  const [notas, setNotas] = useState("");
  const [submittingFeed, setSubmittingFeed] = useState(false);

  // ----- Espolvoreo (proceso independiente) -----
  const [espFecha, setEspFecha] = useState(new Date().toISOString().slice(0, 10));
  const [espMp, setEspMp] = useState("");
  const [espQty, setEspQty] = useState("");
  const [espNotas, setEspNotas] = useState("");
  const [submittingEsp, setSubmittingEsp] = useState(false);

  const total = useMemo(
    () => cultivos.reduce((acc, r) => acc + asNum(r.stock_total), 0),
    [cultivos]
  );

  async function loadCultivos() {
    setLoading(true);
    try {
      const { data } = await listarCultivos({});
      const out = Array.isArray(data) ? data : [];
      out.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
      setCultivos(out);
      if (!selId && out.length) setSelId(out[0].id);
    } catch (e) {
      setToast({
        type: "error",
        message: e?.response?.data?.message || "No se pudieron cargar cultivos",
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadMPs() {
    try {
      const { data } = await api.get("/materias-primas?estado=true");
      const list = Array.isArray(data) ? data : [];
      list.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || ""));
      setMpList(list);
    } catch {
      setMpList([]);
    }
  }

  useEffect(() => {
    loadCultivos();
    loadMPs();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return cultivos;
    return cultivos.filter((r) => (r.nombre || "").toLowerCase().includes(term));
  }, [cultivos, q]);

  /* ====== Submitters ====== */
  const canFeed = !!selected && String(harinaMp || "") !== "" && asNum(harinaQty) > 0 && !submittingFeed;

  async function submitFeed(e) {
    e.preventDefault();
    if (!canFeed || !selected) return;

    try {
      setSubmittingFeed(true);

      const payload = {
        fecha: fecha || null, // el backend pone hora local si viene solo YYYY-MM-DD
        harina_mp_id: Number(harinaMp),
        harina_cantidad: Number(harinaQty).toFixed(3),
        notas: notas?.trim() || null,
      };

      await alimentarCultivo(selected.id, payload);

      setToast({ type: "success", message: "Alimentación registrada" });
      setHarinaQty("");
      setNotas("");
      await loadCultivos();
    } catch (e2) {
      setToast({
        type: "error",
        message: e2?.response?.data?.message || "No se pudo registrar la alimentación",
      });
    } finally {
      setSubmittingFeed(false);
    }
  }

  const canEsp = !!selected && String(espMp || "") !== "" && asNum(espQty) > 0 && !submittingEsp;

  async function submitEspolvoreo(e) {
    e.preventDefault();
    if (!canEsp || !selected) return;

    try {
      setSubmittingEsp(true);

      await api.post(`/cultivos/${selected.id}/espolvoreo`, {
        fecha: espFecha || null, // backend normaliza hora
        mp_id: Number(espMp),
        cantidad: Number(espQty).toFixed(3),
        notas: espNotas?.trim() || null,
      });

      setToast({ type: "success", message: "Espolvoreo registrado" });
      setEspQty("");
      setEspNotas("");
    } catch (e2) {
      setToast({
        type: "error",
        message:
          e2?.response?.data?.message ||
          "No se pudo registrar el espolvoreo",
      });
    } finally {
      setSubmittingEsp(false);
    }
  }

  /* ====== UI ====== */
  return (
    <div className="page">
      {/* Header */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Masa madre</h2>
            <div className="muted">
              <b>Alimentación</b> (descuenta harina) y <b>Espolvoreo</b> (descuenta harina independiente).
            </div>
          </div>
          <div className="muted">Total cultivos: {fmtInt(total)}</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "300px 1fr",
          gap: 12,
          alignItems: "start",
        }}
      >
        {/* Sidebar: selector de cultivo */}
        <div className="card">
          <div style={{ display: "grid", gap: 8 }}>
            <input
              placeholder="Buscar"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div
              style={{
                maxHeight: 420,
                overflow: "auto",
                border: "1px solid var(--border)",
                borderRadius: 8,
              }}
            >
              {loading && (
                <div style={{ padding: 10 }} className="muted">
                  Cargando…
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <div style={{ padding: 10, textAlign: "center" }} className="muted">
                  Sin resultados
                </div>
              )}
              {!loading &&
                filtered.map((c) => {
                  const active = selId === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelId(c.id)}
                      className={active ? "active" : ""}
                      style={{
                        width: "100%",
                        textAlign: "left",
                        padding: "10px 12px",
                        border: "0",
                        borderBottom: "1px solid var(--border)",
                        background: active ? "var(--card)" : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{c.nombre}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Unidad: {c.unidad_medida || "—"} · Stock: <b>{fmtInt(c.stock_total)}</b>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Main: formularios */}
        <div style={{ display: "grid", gap: 12 }}>
          {/* Alimentación */}
          <div className="card">
            <div style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>
                Alimentación 
              </h3>
              <div className="muted">Descuenta harina. El movimiento queda con motivo “ALIMENTACION MASA MADRE”.</div>
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

                <div style={{ gridColumn: "1/-1" }}>
                  <label>Notas (opcional)</label>
                  <input
                    placeholder="Observaciones…"
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn-primary" disabled={!canFeed || !selected}>
                  {submittingFeed ? "Guardando…" : "Registrar alimentación"}
                </button>
              </div>
            </form>
          </div>

          {/* Espolvoreo */}
          <div className="card">
            <div style={{ marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>
                Espolvoreo
              </h3>
              <div className="muted">Descuenta harina para espolvorear (no modifica stock del cultivo).</div>
            </div>

            <form onSubmit={submitEspolvoreo}>
              <div className="form-grid">
                <div>
                  <label>Fecha</label>
                  <input
                    type="date"
                    value={espFecha}
                    onChange={(e) => setEspFecha(e.target.value)}
                  />
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

                <div style={{ gridColumn: "1/-1" }}>
                  <label>Notas (opcional)</label>
                  <input
                    placeholder="Observaciones…"
                    value={espNotas}
                    onChange={(e) => setEspNotas(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn-outline" disabled={!canEsp || !selected}>
                  {submittingEsp ? "Guardando…" : "Registrar espolvoreo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Toast */}
      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: "" })}
      />
    </div>
  );
}



