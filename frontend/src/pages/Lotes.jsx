import { useEffect, useMemo, useState } from "react";
import api from "../api/client";


/* ========== Helpers ========== */
const toInputDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return (
    String(date.getFullYear()).padStart(4, "0") +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0")
  );
};


const todayISO = () => toInputDate(new Date());


const isExpired = (fecha_vencimiento) => {
  if (!fecha_vencimiento) return false;
  try {
    const f = new Date(fecha_vencimiento);
    const t = new Date();
    f.setHours(0, 0, 0, 0);
    t.setHours(0, 0, 0, 0);
    return f < t;
  } catch {
    return false;
  }
};


// visual chip por estado enum
function EstadoChip({ estado }) {
  const map = {
    DISPONIBLE: { bg: "#f6ffed", border: "#b7eb8f", color: "#237804", label: "Disponible" },
    RESERVADO:  { bg: "#e6f7ff", border: "#91d5ff", color: "#09539e", label: "Reservado" },
    AGOTADO:    { bg: "#fafafa", border: "#d9d9d9", color: "#595959", label: "Agotado" },
    VENCIDO:    { bg: "#fff1f0", border: "#ffa39e", color: "#a8071a", label: "Vencido (flag)" },
    INACTIVO:   { bg: "#fffbe6", border: "#ffe58f", color: "#ad6800", label: "Inactivo" },
  };
  const sty = map[estado] || map.DISPONIBLE;
  return (
    <span className="badge" style={{ background: sty.bg, border: `1px solid ${sty.border}`, color: sty.color }}>
      {sty.label}
    </span>
  );
}


/* ========== UI comunes ========== */
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


function Confirm({ open, title = "Confirmar", message, onCancel, onConfirm }) {
  if (!open) return null;
  return (
    <Modal open={open} title={title} onClose={onCancel}>
      <p style={{ margin: "8px 0 16px" }}>{message}</p>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button className="btn-outline" onClick={onCancel} style={{ width: "auto" }}>
          Cancelar
        </button>
        <button className="btn-primary" onClick={onConfirm} style={{ width: "auto" }}>
          Confirmar
        </button>
      </div>
    </Modal>
  );
}


/* ========== Form Crear/Editar ========== */
const emptyForm = {
  materia_prima_id: "",
  proveedor_id: "",
  codigo: "",                 // <-- NUEVO
  cantidad: "",
  fecha_ingreso: toInputDate(new Date()),
  fecha_vencimiento: "",
  estado: "DISPONIBLE", // enum; antes era boolean
};


function LoteForm({ materias, proveedores, initial = emptyForm, onSubmit, submitting }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);


  const materia = materias.find((m) => String(m.id) === String(form.materia_prima_id));
  const unidad = materia?.unidad_medida || "ud";


  const canSubmit = useMemo(() => {
    const hasMateria = String(form.materia_prima_id || "").trim() !== "";
    const hasCodigo  = String(form.codigo || "").trim() !== "";        // requerido
    const hasCantidad = String(form.cantidad || "").trim() !== "" && Number(form.cantidad) >= 0;
    const fechaOk =
      !!form.fecha_ingreso &&
      (!form.fecha_vencimiento || new Date(form.fecha_vencimiento) >= new Date(form.fecha_ingreso));
    const estadoOk = ["DISPONIBLE", "RESERVADO", "INACTIVO", "AGOTADO", "VENCIDO"].includes(String(form.estado));
    return hasMateria && hasCodigo && hasCantidad && fechaOk && estadoOk;
  }, [form]);


  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }


  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit(form);
  }


  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label>Materia prima</label>
          <select
            name="materia_prima_id"
            value={form.materia_prima_id}
            onChange={handleChange}
            required
          >
            <option value="">Seleccione materia prima</option>
            {materias.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nombre} {m.unidad_medida ? `(${m.unidad_medida})` : ""}
              </option>
            ))}
          </select>
        </div>


        <div>
          <label>Proveedor (opcional)</label>
          <select name="proveedor_id" value={form.proveedor_id} onChange={handleChange}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>


        <div>
          <label>Código de lote</label>
          <input
            name="codigo"
            type="text"
            placeholder="Ej: AZU-2025-0007"
            value={form.codigo}
            onChange={handleChange}
            required
          />
          <div className="muted" style={{ marginTop: 4 }}>
            Ingresen el código que ustedes usan en planta. Debe ser único por materia prima.
          </div>
        </div>


        <div>
          <label>
            Cantidad {unidad && <span className="muted">({unidad})</span>}
          </label>
          <input
            name="cantidad"
            type="number"
            step="0.001"
            min="0"
            placeholder={`Ej. 1000 (${unidad})`}
            value={form.cantidad}
            onChange={handleChange}
            required
          />
        </div>


        <div>
          <label>Fecha de ingreso</label>
          <input
            type="date"
            name="fecha_ingreso"
            value={form.fecha_ingreso || ""}
            onChange={handleChange}
            required
          />
        </div>


        <div>
          <label>Fecha de vencimiento (opcional)</label>
          <input
            type="date"
            name="fecha_vencimiento"
            value={form.fecha_vencimiento || ""}
            onChange={handleChange}
          />
        </div>


        <div>
          <label>Estado inicial</label>
          <select name="estado" value={form.estado} onChange={handleChange}>
            <option value="DISPONIBLE">Disponible</option>
            <option value="RESERVADO">Reservado</option>
            <option value="INACTIVO">Inactivo</option>
            {/* AGOTADO y VENCIDO normalmente los define el sistema, pero permitimos por si es un alta histórica */}
            <option value="AGOTADO">Agotado</option>
            <option value="VENCIDO">Vencido</option>
          </select>
        </div>
      </div>


      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn-primary" disabled={!canSubmit || submitting}>
          {submitting ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </form>
  );
}


/* ========== Página ========== */
export default function Lotes() {
  const [items, setItems] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [proveedores, setProveedores] = useState([]);


  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState({ type: "success", message: "" });


  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);


  // Confirmaciones
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);


  const [confirmEstadoOpen, setConfirmEstadoOpen] = useState(false);
  const [estadoTarget, setEstadoTarget] = useState(null); // { id, next, label }


  // Filtros
  const [filters, setFilters] = useState({ q: "", estado: "all" }); // all|active|inactive|expired


  /* ---- API ---- */
  async function load() {
    setLoading(true);
    try {
      const [L, M, P] = await Promise.all([
        api.get("/lotes-materia-prima"),
        api.get("/materias-primas"),
        api.get("/proveedores"),
      ]);
      setItems(Array.isArray(L.data) ? L.data : []);
      setMaterias(Array.isArray(M.data) ? M.data : []);
      setProveedores(Array.isArray(P.data) ? P.data : []);
    } catch (err) {
      console.error("[Lotes] cargar error", err);
      setToast({ type: "error", message: err?.response?.data?.message || "Error cargando datos" });
    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    load();
  }, []);


  async function createItem(payload) {
    setSubmitting(true);
    try {
      await api.post("/lotes-materia-prima", {
        materia_prima_id: Number(payload.materia_prima_id),
        proveedor_id: payload.proveedor_id ? Number(payload.proveedor_id) : null,
        codigo: String(payload.codigo).trim(),           // <-- NUEVO
        cantidad: String(payload.cantidad),
        fecha_ingreso: payload.fecha_ingreso,
        fecha_vencimiento: payload.fecha_vencimiento || null,
        estado: payload.estado, // enum
      });
      setToast({ type: "success", message: "Lote creado" });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      console.error("[Lotes] crear error", err);
      setToast({ type: "error", message: err?.response?.data?.message || "Error creando lote" });
    } finally {
      setSubmitting(false);
    }
  }


  async function updateItem(id, payload) {
    setSubmitting(true);
    try {
      await api.put(`/lotes-materia-prima/${id}`, {
        materia_prima_id: Number(payload.materia_prima_id),
        proveedor_id: payload.proveedor_id ? Number(payload.proveedor_id) : null,
        codigo: String(payload.codigo).trim(),           // <-- NUEVO
        cantidad: String(payload.cantidad),
        fecha_ingreso: payload.fecha_ingreso,
        fecha_vencimiento: payload.fecha_vencimiento || null,
        estado: payload.estado, // enum
      });
      setToast({ type: "success", message: "Cambios guardados" });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      console.error("[Lotes] update error", err);
      setToast({ type: "error", message: err?.response?.data?.message || "Error actualizando" });
    } finally {
      setSubmitting(false);
    }
  }


  async function setEstado(id, nextEstado) {
    try {
      const current = items.find((x) => x.id === id);
      if (!current) return;
      await api.put(`/lotes-materia-prima/${id}`, {
        materia_prima_id: current.materia_prima_id,
        proveedor_id: current.proveedor_id,
        codigo: String(current.codigo).trim(),           // <-- conservar código
        cantidad: String(current.cantidad),
        fecha_ingreso: toInputDate(current.fecha_ingreso),
        fecha_vencimiento: current.fecha_vencimiento ? toInputDate(current.fecha_vencimiento) : null,
        estado: nextEstado,
      });
      setToast({ type: "success", message: `Estado actualizado a ${nextEstado}` });
      await load();
    } catch (err) {
      setToast({
        type: "error",
        message: err?.response?.data?.message || "No se pudo actualizar el estado",
      });
    } finally {
      setConfirmEstadoOpen(false);
      setEstadoTarget(null);
    }
  }


  async function removeItem(id) {
    try {
      await api.delete(`/lotes-materia-prima/${id}?hard=true`);
      setToast({ type: "success", message: "Lote eliminado" });
      await load();
    } catch (err) {
      setToast({
        type: "error",
        message: err?.response?.data?.message || "No se pudo eliminar",
      });
    } finally {
      setConfirmDeleteOpen(false);
      setToDelete(null);
    }
  }


  /* ---- Filtro en memoria ---- */
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const estado = filters.estado; // all|active|inactive|expired
    return items.filter((l) => {
      const materia = l.materias_primas?.nombre?.toLowerCase?.() || "";
      const proveedor = l.proveedores?.nombre?.toLowerCase?.() || "";
      const codigo = String(l.codigo || "").toLowerCase();     // <-- incluir código
      const matchText =
        !q || materia.includes(q) || proveedor.includes(q) || String(l.id).includes(q) || codigo.includes(q);


      const expired = isExpired(l.fecha_vencimiento);


      const isActiveEnum = l.estado === "DISPONIBLE" || l.estado === "RESERVADO";
      const isInactiveEnum = l.estado === "INACTIVO";


      const matchEstado =
        estado === "all" ||
        (estado === "active" && isActiveEnum && !expired) ||
        (estado === "inactive" && isInactiveEnum) ||
        (estado === "expired" && expired);


      return matchText && matchEstado;
    });
  }, [items, filters]);


  /* ---- Orden: más nuevos primero ---- */
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const A = new Date(a.fecha_ingreso).getTime() || 0;
      const B = new Date(b.fecha_ingreso).getTime() || 0;
      if (B !== A) return B - A;
      // secundario por código asc, luego id desc
      const ca = String(a.codigo || "").localeCompare(String(b.codigo || ""));
      if (ca !== 0) return ca;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });
  }, [filtered]);


  /* ---- UI ---- */
  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h2 style={{ margin: 0 }}>Lotes de materia prima</h2>
        <div className="muted">Gestiona ingresos por lote y su vigencia</div>
      </div>
      <button
        className="btn-primary"
        onClick={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        style={{ width: "auto" }}
      >
        + Nuevo lote
      </button>
    </div>
  );


  return (
    <div className="page">
      <div className="card">
        {header}


        {/* Filtros */}
        <div className="filters" style={{ marginTop: 12 }}>
          <input
            placeholder="Buscar por código, materia, proveedor o ID…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
          <select
            value={filters.estado}
            onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
          >
            <option value="all">Todos</option>
            <option value="active">Activos (no vencidos)</option>
            <option value="inactive">Inactivos</option>
            <option value="expired">Vencidos</option>
          </select>
        </div>


        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>Código</th>            {/* NUEVO */}
                <th style={{ width: 70 }}>ID</th>
                <th>Materia</th>
                <th>Proveedor</th>
                <th>Cantidad</th>
                <th>Ingreso</th>
                <th>Vence</th>
                <th>Estado</th>
                <th style={{ width: 360 }}>Acciones</th>
              </tr>
            </thead>


            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} style={{ padding: 14 }}>
                    Cargando…
                  </td>
                </tr>
              )}


              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 14, textAlign: "center" }}>
                    Sin resultados
                  </td>
                </tr>
              )}


              {!loading &&
                sorted.map((l) => {
                  const unidad = l.materias_primas?.unidad_medida || "ud";
                  const expired = isExpired(l.fecha_vencimiento);
                  const nextEstado = l.estado === "INACTIVO" ? "DISPONIBLE" : "INACTIVO";
                  const nextLabel =
                    l.estado === "INACTIVO" ? "Activar (DISPONIBLE)" : "Marcar INACTIVO";


                  return (
                    <tr key={l.id}>
                      <td>{l.codigo || "—"}</td>
                      <td>#{l.id}</td>
                      <td>{l.materias_primas?.nombre}</td>
                      <td>{l.proveedores?.nombre || "-"}</td>
                      <td>
                        {l.cantidad} {unidad}
                      </td>
                      <td>{new Date(l.fecha_ingreso).toLocaleDateString()}</td>
                      <td>
                        {l.fecha_vencimiento
                          ? new Date(l.fecha_vencimiento).toLocaleDateString()
                          : "-"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          <EstadoChip estado={l.estado} />
                          {expired && (
                            <span
                              className="badge"
                              style={{
                                background: "#fff1f0",
                                border: "1px solid #ffa39e",
                                color: "#a8071a",
                              }}
                            >
                              Vencido
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            className="btn-outline"
                            onClick={() => {
                              setEditing({
                                id: l.id,
                                materia_prima_id: l.materia_prima_id,
                                proveedor_id: l.proveedor_id || "",
                                codigo: l.codigo || "",                     // <-- NUEVO
                                cantidad: String(l.cantidad ?? ""),
                                fecha_ingreso: toInputDate(l.fecha_ingreso),
                                fecha_vencimiento: toInputDate(l.fecha_vencimiento),
                                estado: l.estado, // enum
                              });
                              setModalOpen(true);
                            }}
                            style={{ width: "auto" }}
                          >
                            ✏️ Editar
                          </button>


                          <button
                            className="btn-outline"
                            onClick={() => {
                              const etiqueta =
                                `${l.materias_primas?.nombre || "lote"} (${l.codigo || `#${l.id}`})`;
                              setEstadoTarget({ id: l.id, next: nextEstado, label: etiqueta });
                              setConfirmEstadoOpen(true);
                            }}
                            style={{ width: "auto" }}
                          >
                            {nextLabel}
                          </button>


                          <button
                            className="btn-danger-outline"
                            onClick={() => {
                              setToDelete(l);
                              setConfirmDeleteOpen(true);
                            }}
                            style={{ width: "auto" }}
                          >
                            🗑️ Eliminar
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


      {/* Modal Crear / Editar */}
      <Modal
        open={modalOpen}
        title={editing ? "Editar lote" : "Nuevo lote"}
        onClose={() => {
          if (!submitting) {
            setModalOpen(false);
            setEditing(null);
          }
        }}
      >
        <LoteForm
          materias={materias}
          proveedores={proveedores}
          initial={editing || emptyForm}
          submitting={submitting}
          onSubmit={(payload) =>
            editing ? updateItem(editing.id, payload) : createItem(payload)
          }
        />
      </Modal>


      {/* Confirmación eliminar */}
      <Confirm
        open={confirmDeleteOpen}
        title="Eliminar lote"
        message={
          toDelete
            ? `¿Seguro que deseas eliminar el lote ${toDelete.codigo ? `"${toDelete.codigo}"` : `#${toDelete.id}`} de "${toDelete.materias_primas?.nombre}"? Esta acción no se puede deshacer.`
            : ""
        }
        onCancel={() => {
          setConfirmDeleteOpen(false);
          setToDelete(null);
        }}
        onConfirm={() => removeItem(toDelete.id)}
      />


      {/* Confirmación cambio de estado */}
      <Confirm
        open={confirmEstadoOpen}
        title="Cambiar estado del lote"
        message={
          estadoTarget
            ? `¿Deseas cambiar "${estadoTarget.label}" al estado ${estadoTarget.next}?`
            : ""
        }
        onCancel={() => {
          setConfirmEstadoOpen(false);
          setEstadoTarget(null);
        }}
        onConfirm={() => setEstado(estadoTarget.id, estadoTarget.next)}
      />


      {/* Toast */}
      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: "" })}
      />
    </div>
  );
}





