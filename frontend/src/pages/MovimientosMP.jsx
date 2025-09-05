// src/pages/MovimientosMP.jsx
import { useEffect, useMemo, useState } from "react";
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


function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.2)",
        display: "grid",
        placeItems: "center",
        zIndex: 999,
        padding: 12,
      }}
      onClick={onClose}
    >
      <div className="card modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn-outline" onClick={onClose} style={{ width: "auto" }}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}


const fmtDec = (x) => {
  const n = typeof x === "string" ? parseFloat(x) : Number(x);
  if (Number.isNaN(n)) return "0";
  return (Math.round(n * 1000) / 1000).toString();
};


// Normaliza a unidad “chica” para mostrar (g/ml/ud) dado la unidad base de la MP
function normalizeToSmallUnit(qty, baseUnit) {
  const n = Number(qty) || 0;
  const u = String(baseUnit || "").toLowerCase();
  if (u === "kg") return { value: n * 1000, unit: "g" };
  if (u === "l") return { value: n * 1000, unit: "ml" };
  if (u === "g") return { value: n, unit: "g" };
  if (u === "ml") return { value: n, unit: "ml" };
  return { value: n, unit: "ud" };
}


function TipoBadge({ tipo, valueSign }) {
  const danger = tipo === "SALIDA" || valueSign < 0;
  return (
    <span
      className="badge"
      style={{
        background: danger ? "#fff2f0" : "#f6ffed",
        border: "1px solid",
        borderColor: danger ? "#ffccc7" : "#b7eb8f",
        color: danger ? "#a8071a" : "#237804",
      }}
    >
      {tipo}
    </span>
  );
}


/* ====== Página Movimientos ====== */
export default function MovimientosMP() {
  // filtros
  const [filters, setFilters] = useState({
    materia_prima_id: "",
    lote_id: "",
    lote_codigo: "", // 👈 nuevo filtro por código de lote
    tipo: "ALL", // ALL | ENTRADA | SALIDA | AJUSTE
    desde: "",
    hasta: "",
  });


  // data + paginado
  const [movs, setMovs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);


  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ type: "success", message: "" });


  // datos auxiliares
  const [materias, setMaterias] = useState([]);
  const [loadingMp, setLoadingMp] = useState(true);
  const [lotes, setLotes] = useState([]);
  const [loadingLotes, setLoadingLotes] = useState(false);


  // modal de ajuste
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajForm, setAjForm] = useState({
    materia_prima_id: "",
    lote_id: "",
    cantidad: "",
    motivo: "",
  });
  const [ajLoading, setAjLoading] = useState(false);


  /* ------- Cargar materias primas ------- */
  async function loadMaterias() {
    setLoadingMp(true);
    try {
      const { data } = await api.get("/materias-primas?estado=true");
      setMaterias(Array.isArray(data) ? data : []);
    } catch {
      setMaterias([]);
      setToast({ type: "error", message: "No se pudieron cargar materias primas" });
    } finally {
      setLoadingMp(false);
    }
  }


  /* ------- Cargar lotes (según MP) ------- */
  async function loadLotes(mpId) {
    if (!mpId) {
      setLotes([]);
      return;
    }
    setLoadingLotes(true);
    try {
      const { data } = await api.get(`/lotes-materia-prima?materia_prima_id=${mpId}`);
      setLotes(Array.isArray(data) ? data : []);
    } catch {
      setLotes([]);
      setToast({ type: "error", message: "No se pudieron cargar lotes" });
    } finally {
      setLoadingLotes(false);
    }
  }


  /* ------- Cargar movimientos ------- */
  async function loadMovs(customPage = page) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.materia_prima_id)
        params.set("materia_prima_id", String(filters.materia_prima_id));
      if (filters.lote_id) params.set("lote_id", String(filters.lote_id));
      if (filters.lote_codigo) params.set("lote_codigo", String(filters.lote_codigo).trim()); // 👈 nuevo
      if (filters.tipo && filters.tipo !== "ALL") params.set("tipo", filters.tipo);
      if (filters.desde) params.set("desde", filters.desde);
      if (filters.hasta) params.set("hasta", filters.hasta);
      params.set("page", String(customPage || 1));
      params.set("pageSize", String(pageSize));


      const { data } = await api.get(`/movimientos-mp?${params.toString()}`);


      // ⬇️ la API devuelve { total, page, pageSize, items }
      const items = Array.isArray(data?.items) ? data.items : [];
      setMovs(items);
      setTotal(Number(data?.total || items.length || 0));
      setPage(Number(data?.page || customPage || 1));
      setPageSize(Number(data?.pageSize || pageSize));
    } catch (e) {
      setMovs([]);
      setTotal(0);
      setToast({
        type: "error",
        message: e?.response?.data?.message || "Error cargando movimientos",
      });
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    loadMaterias();
    loadMovs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  // al cambiar de MP en filtros, refrescar lotes y limpiar selección de lote
  useEffect(() => {
    loadLotes(filters.materia_prima_id);
    setFilters((f) => ({ ...f, lote_id: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.materia_prima_id]);


  // mapas auxiliares para nombres/ud
  const mpMap = useMemo(() => {
    const m = new Map();
    for (const x of materias) m.set(String(x.id), x);
    return m;
  }, [materias]);


  const loteMap = useMemo(() => {
    const m = new Map();
    for (const x of lotes) m.set(String(x.id), x);
    return m;
  }, [lotes]);


  function resetFilters() {
    setFilters({
      materia_prima_id: "",
      lote_id: "",
      lote_codigo: "",
      tipo: "ALL",
      desde: "",
      hasta: "",
    });
    // recargar página 1
    loadMovs(1);
  }


  /* ------- Nuevo ajuste ------- */
  function openAjuste() {
    setAjForm({
      materia_prima_id: filters.materia_prima_id || "",
      lote_id: "",
      cantidad: "",
      motivo: "",
    });
    if (filters.materia_prima_id) loadLotes(filters.materia_prima_id);
    setAjusteOpen(true);
  }


  function onChangeAj(e) {
    const { name, value } = e.target;
    setAjForm((f) => ({ ...f, [name]: value }));
    if (name === "materia_prima_id") {
      setAjForm((f) => ({ ...f, lote_id: "" }));
      loadLotes(value);
    }
  }


  const canSubmitAj =
    ajForm.materia_prima_id && ajForm.lote_id && ajForm.cantidad && Number(ajForm.cantidad) !== 0;


  async function submitAjuste(e) {
    e.preventDefault();
    if (!canSubmitAj) return;
    setAjLoading(true);
    try {
      await api.post("/movimientos-mp/ajuste", {
        materia_prima_id: Number(ajForm.materia_prima_id),
        lote_id: Number(ajForm.lote_id),
        cantidad: Number(ajForm.cantidad), // puede ser negativa
        motivo: ajForm.motivo || undefined,
      });
      setToast({ type: "success", message: "Ajuste registrado" });
      setAjusteOpen(false);
      await loadMovs(1);
    } catch (e) {
      setToast({
        type: "error",
        message: e?.response?.data?.message || "Error registrando ajuste",
      });
    } finally {
      setAjLoading(false);
    }
  }


  const totalPages = Math.max(1, Math.ceil(total / pageSize));


  /* ------- Render ------- */
  return (
    <div className="page">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Movimientos de Materia Prima</h2>
            <div className="muted">
              Entradas, salidas (FIFO) y ajustes. Filtra por MP, lote, código o rango de fechas.
            </div>
          </div>
          <button className="btn-primary" style={{ width: "auto" }} onClick={openAjuste}>
            + Nuevo ajuste
          </button>
        </div>


        {/* Filtros */}
        <div
          className="filters"
          style={{
            marginTop: 12,
            display: "grid",
            gap: 8,
            gridTemplateColumns: "1fr 1fr 1fr 130px 130px 180px auto",
          }}
        >
          {/* Materia prima */}
          <select
            value={filters.materia_prima_id}
            onChange={(e) => setFilters((f) => ({ ...f, materia_prima_id: e.target.value }))}
            disabled={loadingMp}
            title="Materia prima"
          >
            <option value="">{loadingMp ? "Cargando..." : "Todas las materias primas"}</option>
            {materias.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} ({m.unidad_medida})
              </option>
            ))}
          </select>


          {/* Lote (por id, etiquetado con código) */}
          <select
            value={filters.lote_id}
            onChange={(e) => setFilters((f) => ({ ...f, lote_id: e.target.value }))}
            disabled={loadingLotes || !filters.materia_prima_id}
            title="Lote"
          >
            <option value="">{loadingLotes ? "Cargando..." : "Todos los lotes"}</option>
            {lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo ? `[${l.codigo}]` : `#${l.id}`}
                {l.fecha_vencimiento
                  ? ` · vence ${new Date(l.fecha_vencimiento).toLocaleDateString()}`
                  : ""}{" "}
                {`(#${l.id})`}
              </option>
            ))}
          </select>


          {/* Código de lote (texto libre) */}
          <input
            placeholder="Código de lote (ej. LOTE-2025-01)"
            value={filters.lote_codigo}
            onChange={(e) => setFilters((f) => ({ ...f, lote_codigo: e.target.value }))}
            title="Código de lote"
          />


          {/* Tipo */}
          <select
            value={filters.tipo}
            onChange={(e) => setFilters((f) => ({ ...f, tipo: e.target.value }))}
            title="Tipo"
          >
            <option value="ALL">Todos</option>
            <option value="ENTRADA">ENTRADA</option>
            <option value="SALIDA">SALIDA</option>
            <option value="AJUSTE">AJUSTE</option>
          </select>


          {/* Fechas */}
          <input
            type="date"
            value={filters.desde}
            onChange={(e) => setFilters((f) => ({ ...f, desde: e.target.value }))}
            title="Desde"
          />
          <input
            type="date"
            value={filters.hasta}
            onChange={(e) => setFilters((f) => ({ ...f, hasta: e.target.value }))}
            title="Hasta"
          />


          {/* Botones */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-outline"
              style={{ width: "auto" }}
              onClick={() => loadMovs(1)}
              disabled={loading}
            >
              {loading ? "Buscando…" : "Buscar"}
            </button>
            <button
              className="btn-outline"
              style={{ width: "auto" }}
              onClick={resetFilters}
              disabled={loading}
            >
              Limpiar
            </button>
          </div>
        </div>


        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 160 }}>Fecha</th>
                <th>Materia prima</th>
                <th style={{ width: 160 }}>Lote</th>
                <th style={{ width: 110 }}>Tipo</th>
                <th style={{ textAlign: "right", width: 160 }}>Cantidad</th>
                <th>Motivo</th>
                <th style={{ width: 140 }}>Referencia</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} style={{ padding: 14 }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && movs.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 14, textAlign: "center" }}>
                    Sin resultados
                  </td>
                </tr>
              )}
              {!loading &&
                movs.map((m) => {
                  // Preferimos los datos enriquecidos que ya manda la API (si existen)
                  const mp = m.materia_prima || mpMap.get(String(m.materia_prima_id));
                  const mpName = mp?.nombre || `MP #${m.materia_prima_id}`;
                  const baseUnit = (mp?.unidad_medida || "g").toLowerCase();


                  // SALIDA en BD viene positiva: la mostramos negativa
                  let signed = Number(m.cantidad);
                  if (m.tipo === "SALIDA" && signed > 0) signed = -signed;


                  const small = normalizeToSmallUnit(Math.abs(signed), baseUnit);
                  const shownVal = Math.sign(signed) * small.value;
                  const color = shownVal < 0 ? "#a8071a" : "#237804";


                  const lote = m.lote || { id: m.lote_id, codigo: null };


                  const fechaStr = m.fecha
                    ? (new Date(m.fecha).toString() === "Invalid Date"
                        ? m.fecha
                        : new Date(m.fecha).toLocaleString())
                    : "-";


                  return (
                    <tr key={m.id}>
                      <td>{fechaStr}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <span>{mpName}</span>
                          <span className="muted">({baseUnit})</span>
                        </div>
                      </td>
                      <td>
                        {lote?.codigo ? (
                          <>
                            <strong>[{lote.codigo}]</strong>{" "}
                            <span className="muted">#{lote.id}</span>
                          </>
                        ) : (
                          <>#{lote?.id || m.lote_id}</>
                        )}
                      </td>
                      <td>
                        <TipoBadge tipo={m.tipo} valueSign={Math.sign(shownVal)} />
                      </td>
                      <td style={{ textAlign: "right", color }}>
                        {shownVal < 0 ? "−" : shownVal > 0 ? "+" : ""}
                        {fmtDec(Math.abs(shownVal))} {small.unit}
                      </td>
                      <td>{m.motivo || "—"}</td>
                      <td>{m.ref_tipo ? `${m.ref_tipo}${m.ref_id ? ` #${m.ref_id}` : ""}` : "—"}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>


          {/* Controles de paginado */}
          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <div className="muted">
              {total} movimiento{total === 1 ? "" : "s"} · Página {page} / {totalPages}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-outline"
                style={{ width: "auto" }}
                disabled={loading || page <= 1}
                onClick={() => loadMovs(page - 1)}
              >
                ◀ Anterior
              </button>
              <button
                className="btn-outline"
                style={{ width: "auto" }}
                disabled={loading || page >= totalPages}
                onClick={() => loadMovs(page + 1)}
              >
                Siguiente ▶
              </button>
            </div>
          </div>
        </div>
      </div>


      {/* Modal: Nuevo ajuste */}
      <Modal
        open={ajusteOpen}
        title="Nuevo ajuste de lote"
        onClose={() => {
          if (!ajLoading) setAjusteOpen(false);
        }}
      >
        <form onSubmit={submitAjuste}>
          <div className="form-grid">
            <div>
              <label>Materia prima</label>
              <select
                name="materia_prima_id"
                value={ajForm.materia_prima_id}
                onChange={onChangeAj}
                required
              >
                <option value="">Selecciona…</option>
                {materias.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre} ({m.unidad_medida})
                  </option>
                ))}
              </select>
            </div>


            <div>
              <label>Lote</label>
              <select
                name="lote_id"
                value={ajForm.lote_id}
                onChange={onChangeAj}
                required
                disabled={!ajForm.materia_prima_id || loadingLotes}
              >
                <option value="">{loadingLotes ? "Cargando…" : "Selecciona…"}</option>
                {lotes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.codigo ? `[${l.codigo}]` : `#${l.id}`}
                    {l.fecha_vencimiento
                      ? ` · vence ${new Date(l.fecha_vencimiento).toLocaleDateString()}`
                      : ""}{" "}
                    {`(#${l.id})`}
                  </option>
                ))}
              </select>
            </div>


            <div>
              <label>Cantidad</label>
              <input
                name="cantidad"
                type="number"
                step="0.001"
                placeholder="Ej: 500 (positivo) o -200 (negativo)"
                value={ajForm.cantidad}
                onChange={onChangeAj}
                required
              />
              <div className="muted" style={{ marginTop: 4 }}>
                • Positivo: aumenta el lote (entrada).
                <br />
                • Negativo: disminuye el lote (salida).
              </div>
            </div>


            <div style={{ gridColumn: "1 / -1" }}>
              <label>Motivo (opcional)</label>
              <textarea
                name="motivo"
                rows={3}
                placeholder="Ej: Ajuste por merma / recuento físico"
                value={ajForm.motivo}
                onChange={onChangeAj}
              />
            </div>
          </div>


          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button
              className="btn-outline"
              type="button"
              style={{ width: "auto" }}
              onClick={() => setAjusteOpen(false)}
              disabled={ajLoading}
            >
              Cancelar
            </button>
            <button className="btn-primary" disabled={!canSubmitAj || ajLoading}>
              {ajLoading ? "Guardando…" : "Guardar ajuste"}
            </button>
          </div>
        </form>
      </Modal>


      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: "" })}
      />
    </div>
  );
}





