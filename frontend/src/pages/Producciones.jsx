// src/pages/Producciones.jsx
import { useEffect, useRef, useState } from "react";
import api from "../api/client";

/* ===== UI ===== */
function Toast({ type = "success", message, onClose }) {
  if (!message) return null;
  return (
    <div
      className="card"
      style={{
        position: "fixed",
        right: 16,
        bottom: 16,
        zIndex: 10000,
        borderColor: type === "error" ? "#ffccc7" : "var(--border)",
        background: type === "error" ? "#fff2f0" : "#f6ffed",
      }}
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

const fmtDec = (x) => {
  const n = typeof x === "string" ? parseFloat(x) : Number(x);
  if (Number.isNaN(n)) return "0";
  return (Math.round(n * 1000) / 1000).toString();
};

function toSmall(qty, baseUnit) {
  const n = Number(qty) || 0;
  const u = String(baseUnit || "").toLowerCase();
  if (u === "kg") return { value: n * 1000, unit: "g" };
  if (u === "l") return { value: n * 1000, unit: "ml" };
  if (u === "g") return { value: n, unit: "g" };
  if (u === "ml") return { value: n, unit: "ml" };
  return { value: n, unit: "ud" };
}

/* ===== Popover (fixed) ===== */
function Popover({ open, anchorRef, children, onClose }) {
  const popRef = useRef(null);

  useEffect(() => {
    function onDoc(e) {
      if (!open) return;
      if (anchorRef?.current?.contains(e.target)) return;
      if (popRef?.current?.contains(e.target)) return;
      onClose?.();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const rect = anchorRef?.current?.getBoundingClientRect?.();
  const top = (rect?.bottom ?? 0) + 6; // fixed => coords relativos al viewport
  const left = rect?.left ?? 0;

  return (
    <div
      ref={popRef}
      className="card"
      style={{
        position: "fixed",
        top,
        left : 1230 ,
        zIndex: 9999,
        minWidth: 320,
        maxWidth: 520,
        maxHeight: "60vh",
        overflow: "auto",
        boxShadow: "0 6px 24px rgba(0,0,0,0.12)",
      }}
    >
      {children}
    </div>
  );
}

function InsumosContent({ data, loading }) {
  if (loading) return <div className="muted" style={{ padding: 8 }}>Cargando…</div>;
  if (!data || data.length === 0) {
    return <div className="muted" style={{ padding: 8 }}>No hay insumos consumidos</div>;
  }

  return (
    <div style={{ padding: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Materias primas usadas</div>
      <div style={{ display: "grid", gap: 8 }}>
        {data.map((mp) => {
          const small = toSmall(mp.total, mp.unidad_base);
          return (
            <div key={mp.materia_prima_id} className="card" style={{ padding: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div>
                  <strong>{mp.nombre}</strong>
                  <div className="muted">Unidad base: {mp.unidad_base}</div>
                </div>
                <div><strong>{fmtDec(small.value)} {small.unit}</strong></div>
              </div>

              {Array.isArray(mp.detalle) && mp.detalle.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="muted" style={{ marginBottom: 4 }}>Lotes:</div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>Lote</th>
                        <th>Vence</th>
                        <th style={{ textAlign: "right" }}>Usado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mp.detalle.map((d, i) => {
                        const s = toSmall(d.cantidad, mp.unidad_base);
                        return (
                          <tr key={`${mp.materia_prima_id}-${d.lote_id}-${i}`}>
                            <td>#{d.lote_codigo ? d.lote_codigo : `#${d.lote_id}`}</td>
                            <td>{d.fecha_vencimiento ? new Date(d.fecha_vencimiento).toLocaleDateString() : "-"}</td>
                            <td style={{ textAlign: "right" }}>{fmtDec(s.value)} {s.unit}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ===== Página ===== */
export default function Producciones() {
  // filtros
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [recetaId, setRecetaId] = useState("");
  const [q, setQ] = useState("");

  // datos
  const [recetas, setRecetas] = useState([]);
  const [loadingRecetas, setLoadingRecetas] = useState(true);

  // listado
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState({ type: "success", message: "" });

  // popover/caché
  const [openPopId, setOpenPopId] = useState(null);
  const [insumosCache, setInsumosCache] = useState(new Map());
  const [loadingInsumosId, setLoadingInsumosId] = useState(null);
  const anchorRefs = useRef({}); // { [prodId]: { current: HTMLElement } }

  async function loadRecetas() {
    setLoadingRecetas(true);
    try {
      const params = new URLSearchParams();
      params.set("estado", "true");
      const { data } = await api.get(`/recetas?${params.toString()}`);
      setRecetas(Array.isArray(data) ? data : []);
    } catch {
      setRecetas([]);
      setToast({ type: "error", message: "No se pudieron cargar recetas" });
    } finally {
      setLoadingRecetas(false);
    }
  }

  async function loadProducciones(customPage = 1) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (recetaId) params.set("receta_id", String(recetaId));
      if (q.trim()) params.set("q", q.trim());
      params.set("page", String(customPage));
      params.set("pageSize", String(pageSize));

      const { data } = await api.get(`/produccion?${params.toString()}`);
      const rows = Array.isArray(data?.items) ? data.items : [];
      setItems(rows);
      setTotal(Number(data?.total || rows.length || 0));
      setPage(Number(data?.page || customPage));
      setPageSize(Number(data?.pageSize || pageSize));
      setOpenPopId(null);
    } catch (e) {
      setItems([]);
      setTotal(0);
      setToast({ type: "error", message: e?.response?.data?.message || "Error cargando producciones" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecetas();
    loadProducciones(1);
  }, []);

  function resetFilters() {
    setDesde("");
    setHasta("");
    setRecetaId("");
    setQ("");
    setOpenPopId(null);
    loadProducciones(1);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function toggleInsumos(prodId) {
    const nextOpen = openPopId === prodId ? null : prodId;
    setOpenPopId(nextOpen);
    if (!nextOpen) return;

    if (!insumosCache.has(prodId)) {
      try {
        setLoadingInsumosId(prodId);
        const { data } = await api.get(`/produccion/${prodId}/insumos`);
        // acepta {items: [...]} o [...]
        const asArray = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
        setInsumosCache((m) => {
          const copy = new Map(m);
          copy.set(prodId, asArray);
          return copy;
        });
      } catch (e) {
        setToast({
          type: "error",
          message: e?.response?.data?.message || "No se pudieron cargar los insumos",
        });
      } finally {
        setLoadingInsumosId(null);
      }
    }
  }

  return (
    <div className="page">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Historial de producción</h2>
        <div className="muted" style={{ marginBottom: 12 }}>
          Filtra por fecha, receta o texto (en observación/nombre de receta). Haz click en “Insumos” para ver lo consumido.
        </div>

        {/* Filtros */}
        <div
          className="filters"
          style={{
            marginTop: 12,
            display: "grid",
            gap: 8,
            gridTemplateColumns: "160px 160px 1fr 1fr auto",
          }}
        >
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} title="Desde" />
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} title="Hasta" />
          <select value={recetaId} onChange={(e) => setRecetaId(e.target.value)} disabled={loadingRecetas}>
            <option value="">{loadingRecetas ? "Cargando..." : "Todas las recetas"}</option>
            {recetas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
                {r.categoria ? ` · ${r.categoria.nombre}` : ""}
              </option>
            ))}
          </select>
          <input placeholder="Buscar (observación / receta)" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-outline"
              style={{ width: "auto" }}
              onClick={() => loadProducciones(1)}
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
                <th style={{ width: 120 }}>Fecha</th>
                <th>Receta</th>
                <th style={{ width: 120, textAlign: "right" }}>Masas</th>
                <th>Salida esperada</th>
                <th style={{ width: 170 }}>Horario</th>
                <th style={{ width: 110, textAlign: "right" }}>Duración</th>
                <th>Observación</th>
                <th style={{ width: 120 }}>Insumos</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} style={{ padding: 14 }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 14, textAlign: "center" }}>
                    Sin resultados
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((p) => {
                  const rec = p.recetas;
                  const pres = rec?.presentaciones;
                  const rpb = Number(rec?.rendimiento_por_batch || 1);
                  const salida = rpb * Number(p.cantidad_producida || 0);

                  const fechaStr = p.fecha ? new Date(p.fecha).toLocaleDateString() : "-";
                  const hi = p.hora_inicio ? new Date(p.hora_inicio).toLocaleTimeString() : null;
                  const hf = p.hora_fin ? new Date(p.hora_fin).toLocaleTimeString() : null;

                  if (!anchorRefs.current[p.id]) anchorRefs.current[p.id] = { current: null };

                  const isOpen = openPopId === p.id;
                  const loadingThis = loadingInsumosId === p.id;
                  const insumos = insumosCache.get(p.id);

                  return (
                    <tr key={p.id}>
                      <td>{fechaStr}</td>
                      <td>
                        <div style={{ display: "flex", flexDirection: "column" }}>
                          <strong>{rec?.nombre || `Receta #${p.receta_id}`}</strong>
                          {pres ? (
                            <span className="muted">
                              {pres.nombre} · {fmtDec(pres.cantidad)} {pres.unidad_medida}
                            </span>
                          ) : (
                            <span className="muted">Sin presentación</span>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: "right" }}>{fmtDec(p.cantidad_producida)}</td>
                      <td>
                        {fmtDec(salida)}{" "}
                        {pres ? `${pres.nombre} (${fmtDec(pres.cantidad)} ${pres.unidad_medida})` : "unidades"}
                      </td>
                      <td>{hi && hf ? `${hi} – ${hf}` : "—"}</td>
                      <td style={{ textAlign: "right" }}>
                        {p.duracion_minutos ? `${p.duracion_minutos} min` : "—"}
                      </td>
                      <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.observacion || "—"}
                      </td>
                      <td>
                        <button
                          className="btn-outline"
                          style={{ width: "auto" }}
                          ref={(el) => (anchorRefs.current[p.id].current = el)}
                          onClick={() => toggleInsumos(p.id)}
                          title="Ver insumos usados"
                        >
                          🧪 Insumos
                        </button>

                        <Popover
                          open={isOpen}
                          anchorRef={anchorRefs.current[p.id]}
                          onClose={() => setOpenPopId(null)}
                        >
                          <InsumosContent data={insumos} loading={loadingThis && !insumos} />
                        </Popover>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>

          {/* Paginado */}
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
              {total} registro{total === 1 ? "" : "s"} · Página {page} / {totalPages}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn-outline"
                style={{ width: "auto" }}
                disabled={loading || page <= 1}
                onClick={() => loadProducciones(page - 1)}
              >
                ◀ Anterior
              </button>
              <button
                className="btn-outline"
                style={{ width: "auto" }}
                disabled={loading || page >= totalPages}
                onClick={() => loadProducciones(page + 1)}
              >
                Siguiente ▶
              </button>
            </div>
          </div>
        </div>
      </div>

      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ ...toast, message: "" })} />
    </div>
  );
}



