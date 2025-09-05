import { useEffect, useMemo, useState } from "react";
import api from "../api/client";

/* ===== UI helpers ===== */
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

const fmtDate = (x) => (x ? new Date(x).toLocaleDateString() : "—");

/* ===== Página ===== */
export default function MovimientosPT() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);

  const [loading, setLoading] = useState(true);

  const [productos, setProductos] = useState([]);
  const [loadingProds, setLoadingProds] = useState(true);

  const [toast, setToast] = useState({ type: "success", message: "" });

  // filtros
  const [filters, setFilters] = useState({
    q: "",
    producto_id: "",
    tipo: "all", // all | ENTRADA | SALIDA | AJUSTE
    desde: "",
    hasta: "",
  });

  async function loadProductos() {
    setLoadingProds(true);
    try {
      const { data } = await api.get(`/productos?estado=true`);
      setProductos(Array.isArray(data) ? data : []);
    } catch {
      setProductos([]);
      setToast({ type: "error", message: "No se pudieron cargar productos" });
    } finally {
      setLoadingProds(false);
    }
  }

  async function loadMovs() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.producto_id) params.set("producto_id", String(filters.producto_id));
      if (filters.tipo !== "all") params.set("tipo", filters.tipo);
      // 'desde' y 'hasta' hoy no los procesa el backend de PT, los enviamos igual para futuro
      if (filters.desde) params.set("desde", filters.desde);
      if (filters.hasta) params.set("hasta", filters.hasta);

      const { data } = await api.get(`/pt/movimientos?${params.toString()}`);
      const arr = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setItems(arr);
      setTotal(arr.length);
    } catch {
      setItems([]);
      setToast({ type: "error", message: "No se pudieron cargar movimientos" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProductos();
    loadMovs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadMovs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.producto_id, filters.tipo, filters.desde, filters.hasta]);

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    if (!q) return items;
    return items.filter((m) => {
      const prodName =
        productos.find((p) => Number(p.id) === Number(m.producto_id))?.nombre || "";
      return (
        prodName.toLowerCase().includes(q) ||
        String(m.lote_codigo || "").toLowerCase().includes(q) ||
        String(m.motivo || "").toLowerCase().includes(q)
      );
    });
  }, [items, filters.q, productos]);

  const sorted = useMemo(() => {
    // fecha desc, luego id desc
    return [...filtered].sort((a, b) => {
      const da = new Date(a.fecha || 0).getTime();
      const db = new Date(b.fecha || 0).getTime();
      if (db !== da) return db - da;
      return (b.id || 0) - (a.id || 0);
    });
  }, [filtered]);

  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h2 style={{ margin: 0 }}>Movimientos de Productos Terminados</h2>
        <div className="muted">Entradas, salidas y ajustes</div>
      </div>
      <div className="muted">{total} movimiento(s)</div>
    </div>
  );

  const prodName = (m) =>
    productos.find((p) => Number(p.id) === Number(m.producto_id))?.nombre ||
    `#${m.producto_id}`;

  return (
    <div className="page">
      <div className="card">
        {header}

        {/* Filtros */}
        <div
          className="filters"
          style={{
            marginTop: 12,
            display: "grid",
            gap: 8,
            gridTemplateColumns: "1fr 220px 160px 160px 160px",
          }}
        >
          <input
            placeholder="Buscar por producto, lote o motivo…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
          <select
            value={filters.producto_id}
            onChange={(e) => setFilters((f) => ({ ...f, producto_id: e.target.value }))}
          >
            <option value="">Todos los productos</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select
            value={filters.tipo}
            onChange={(e) => setFilters((f) => ({ ...f, tipo: e.target.value }))}
          >
            <option value="all">Todos</option>
            <option value="ENTRADA">Entradas</option>
            <option value="SALIDA">Salidas</option>
            <option value="AJUSTE">Ajustes</option>
          </select>
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
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Lote</th>
                <th>Tipo</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th>Motivo</th>
                <th style={{ width: 120 }}>Ref.</th>
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

              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 14, textAlign: "center" }}>
                    Sin resultados
                  </td>
                </tr>
              )}

              {!loading &&
                sorted.map((m) => (
                  <tr key={m.id}>
                    <td>{m.id}</td>
                    <td>{fmtDate(m.fecha)}</td>
                    <td>{prodName(m)}</td>
                    <td>{m.lote_codigo || (m.lote_id ? `#${m.lote_id}` : "—")}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background:
                            m.tipo === "ENTRADA"
                              ? "#f6ffed"
                              : m.tipo === "SALIDA"
                              ? "#fff2f0"
                              : "#f0f5ff",
                          border: "1px solid",
                          borderColor:
                            m.tipo === "ENTRADA"
                              ? "#b7eb8f"
                              : m.tipo === "SALIDA"
                              ? "#ffccc7"
                              : "#adc6ff",
                          color:
                            m.tipo === "ENTRADA"
                              ? "#237804"
                              : m.tipo === "SALIDA"
                              ? "#a8071a"
                              : "#1d39c4",
                        }}
                      >
                        {m.tipo}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{m.cantidad}</td>
                    <td>{m.motivo || "—"}</td>
                    <td className="muted" title={m.ref_id ? `${m.ref_tipo} #${m.ref_id}` : m.ref_tipo || ""}>
                      {m.ref_tipo || "—"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
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


