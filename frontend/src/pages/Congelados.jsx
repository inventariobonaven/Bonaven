// src/pages/Congelados.jsx
import { useEffect, useMemo, useState } from "react";
import { fetchCongelados, moverEtapa } from "../api/pt";

/* ====== UI helpers (alineados con el resto) ====== */
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
const asNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fmt0 = (v) => String(Math.round(asNum(v))); // ← enteros
const dstr = (d) => (d ? new Date(d).toLocaleDateString() : "—");

export default function Congelados() {
  const [q, setQ] = useState("");
  const [when, setWhen] = useState(""); // fecha opcional del movimiento
  const [rows, setRows] = useState([]);
  const [qty, setQty] = useState({}); // { [loteId]: cantidad a mover }
  const [loading, setLoading] = useState(false);

  const [toast, setToast] = useState({ type: "success", message: "" });

  const totalCongelado = useMemo(
    () => rows.reduce((acc, r) => acc + asNum(r.cantidad), 0),
    [rows]
  );

  async function load() {
    setLoading(true);
    try {
      const { data } = await fetchCongelados({ q });
      const out = Array.isArray(data) ? data : [];
      out.sort((a, b) => {
        const an = a.productos_terminados?.nombre?.toLowerCase() || "";
        const bn = b.productos_terminados?.nombre?.toLowerCase() || "";
        if (an !== bn) return an < bn ? -1 : 1;
        return String(a.codigo || "").localeCompare(String(b.codigo || ""));
      });
      setRows(out);
    } catch (e) {
      setToast({
        type: "error",
        message: e?.response?.data?.message || "No se pudieron cargar los lotes en congelado",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function setQtyFor(loteId, value, max) {
    // permitir borrar el input
    if (value === "" || value === null) {
      setQty((s) => ({ ...s, [loteId]: "" }));
      return;
    }
    let n = Math.floor(Number(value));
    if (!Number.isFinite(n) || n < 0) n = 0;
    const maxInt = Math.floor(asNum(max));
    if (maxInt >= 0) n = Math.min(n, maxInt);
    setQty((s) => ({ ...s, [loteId]: String(n) })); // mantener como string en el input
  }

  async function doMove(lote, destino) {
    const cant = Math.floor(asNum(qty[lote.id]));
    const max = Math.floor(asNum(lote.cantidad));
    if (!(cant > 0)) {
      setToast({ type: "error", message: "Ingresa una cantidad > 0" });
      return;
    }
    if (cant > max) {
      setToast({ type: "error", message: "La cantidad supera el disponible del lote" });
      return;
    }

    try {
      setLoading(true);
      const payload = {
        nueva_etapa: destino, // "EMPAQUE" | "HORNEO"
        cantidad: cant,       // ← entero
        fecha: when || null,
      };
      const { data } = await moverEtapa(lote.id, payload);

      const partes = [];
      if (data?.empaques_consumidos) partes.push(`Bolsas: ${fmt0(data.empaques_consumidos)}`);
      if (data?.destino?.fecha_vencimiento) partes.push(`Vence: ${dstr(data.destino.fecha_vencimiento)}`);

      setToast({
        type: "success",
        message: `Movido a ${destino}. ${partes.join(" • ")}`,
      });

      setQty((s) => ({ ...s, [lote.id]: "" }));
      await load();
    } catch (e) {
      setToast({
        type: "error",
        message: e?.response?.data?.message || "Error al mover etapa",
      });
    } finally {
      setLoading(false);
    }
  }

  /* ====== UI ====== */
  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h2 style={{ margin: 0 }}>Lotes en CONGELADO</h2>
        <div className="muted">Desde aquí puedes mover parcial o totalmente a EMPAQUE u HORNEO</div>
      </div>
      <div className="muted">Total congelado: {fmt0(totalCongelado)}</div>
    </div>
  );

  return (
    <div className="page">
      <div className="card">
        {header}

        {/* Filtros */}
        <div
          className="filters"
          style={{ marginTop: 12, display: "grid", gap: 8, gridTemplateColumns: "1fr 200px 140px" }}
        >
          <input
            placeholder="Buscar por producto o código…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") load(); }}
          />
          <input
            type="date"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            title="Fecha del movimiento (opcional)"
          />
          <button className="btn-outline" onClick={load} disabled={loading} style={{ width: "auto" }}>
            {loading ? "Cargando…" : "Refrescar"}
          </button>
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Producto</th>
                <th>Código</th>
                <th style={{ textAlign: "right" }}>Cantidad (und)</th>
                <th>F. Ingreso</th>
                <th>F. Vencimiento</th>
                <th style={{ width: 210 }}>Mover</th>
                <th style={{ width: 260 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 14 }}>Cargando…</td></tr>
              )}

              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 14, textAlign: "center" }}>Sin lotes en CONGELADO</td></tr>
              )}

              {!loading && rows.map((r) => {
                const disponible = Math.floor(asNum(r.cantidad));
                const canMove = disponible > 0 && Math.floor(asNum(qty[r.id])) > 0;
                return (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.productos_terminados?.nombre || `#${r.producto_id}`}</td>
                    <td>{r.codigo}</td>
                    <td style={{ textAlign: "right" }}><b>{fmt0(r.cantidad)}</b></td>
                    <td>{dstr(r.fecha_ingreso)}</td>
                    <td>{dstr(r.fecha_vencimiento)}</td>
                    <td>
                      <div style={{ display: "grid", gap: 6 }}>
                        <input
                          name={`qty_${r.id}`}
                          type="number"
                          min="1"
                          step="1"
                          placeholder="0"
                          value={qty[r.id] ?? ""}
                          onChange={(e) => setQtyFor(r.id, e.target.value, r.cantidad)}
                          disabled={disponible <= 0}
                        />
                        <div className="muted">máx: {fmt0(r.cantidad)}</div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          className="btn-primary"
                          onClick={() => doMove(r, "EMPAQUE")}
                          disabled={!canMove || loading}
                          title="Mover a EMPAQUE (descuenta bolsas)"
                          style={{ width: "auto" }}
                        >
                          → Empaque
                        </button>
                        <button
                          className="btn-outline"
                          onClick={() => doMove(r, "HORNEO")}
                          disabled={!canMove || loading}
                          title="Mover a HORNEO"
                          style={{ width: "auto" }}
                        >
                          → Horneo
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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


