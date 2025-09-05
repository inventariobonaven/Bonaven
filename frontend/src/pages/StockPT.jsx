// src/pages/StockPT.jsx
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
          <button className="btn-outline" onClick={onClose} style={{ width: "auto" }}>✕</button>
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

/* ===== Formularios ===== */
const emptyForm = {
  producto_id: "",
  codigo: "",
  cantidad: "",
  fecha_ingreso: new Date().toISOString().slice(0, 10),
  fecha_vencimiento: "",
};

function LotePTForm({ productos, initial = emptyForm, onSubmit, submitting }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const canSubmit =
    String(form.producto_id || "") !== "" &&
    String(form.codigo || "").trim().length >= 1 &&
    Number(form.cantidad) > 0 &&
    !Number.isNaN(Number(form.cantidad)) &&
    String(form.fecha_ingreso || "") !== "";

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      producto_id: Number(form.producto_id),
      codigo: String(form.codigo).trim(),
      cantidad: String(form.cantidad),
      fecha_ingreso: form.fecha_ingreso,
      fecha_vencimiento: form.fecha_vencimiento || null,
    });
  }

  const prodOpts = Array.isArray(productos) ? productos : [];

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label>Producto terminado</label>
          <select name="producto_id" value={form.producto_id} onChange={handleChange} required>
            <option value="">— Seleccione —</option>
            {prodOpts.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Código de lote</label>
          <input name="codigo" value={form.codigo} onChange={handleChange} required />
        </div>

        <div>
          <label>Cantidad (ud)</label>
          <input name="cantidad" type="number" min="0.001" step="0.001" value={form.cantidad} onChange={handleChange} required />
        </div>

        <div>
          <label>Fecha ingreso</label>
          <input type="date" name="fecha_ingreso" value={form.fecha_ingreso} onChange={handleChange} required />
        </div>

        <div>
          <label>Fecha vencimiento (opcional)</label>
          <input type="date" name="fecha_vencimiento" value={form.fecha_vencimiento} onChange={handleChange} />
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

function EditLoteForm({ lote, onSubmit, submitting }) {
  const [form, setForm] = useState({
    codigo: lote?.codigo || "",
    fecha_ingreso: lote?.fecha_ingreso?.slice(0,10) || new Date().toISOString().slice(0,10),
    fecha_vencimiento: lote?.fecha_vencimiento?.slice?.(0,10) || "",
  });
  useEffect(() => {
    setForm({
      codigo: lote?.codigo || "",
      fecha_ingreso: lote?.fecha_ingreso?.slice(0,10) || new Date().toISOString().slice(0,10),
      fecha_vencimiento: lote?.fecha_vencimiento?.slice?.(0,10) || "",
    });
  }, [lote?.id]);

  const canSubmit =
    String(form.codigo || "").trim().length >= 1 &&
    String(form.fecha_ingreso || "") !== "";

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      codigo: String(form.codigo).trim(),
      fecha_ingreso: form.fecha_ingreso,
      fecha_vencimiento: form.fecha_vencimiento || null,
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label>Producto</label>
          <input value={lote?.productos_terminados?.nombre || `#${lote?.producto_id}`} disabled />
        </div>
        <div>
          <label>Código</label>
          <input name="codigo" value={form.codigo} onChange={handleChange} required />
        </div>
        <div>
          <label>Fecha ingreso</label>
          <input type="date" name="fecha_ingreso" value={form.fecha_ingreso} onChange={handleChange} required />
        </div>
        <div>
          <label>Fecha vencimiento</label>
          <input type="date" name="fecha_vencimiento" value={form.fecha_vencimiento} onChange={handleChange} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn-primary" disabled={!canSubmit || submitting}>
          {submitting ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}

/* ===== Página ===== */
export default function StockPT() {
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [productos, setProductos] = useState([]);
  const [loadingProductos, setLoadingProductos] = useState(true);

  const [toast, setToast] = useState({ type: "success", message: "" });

  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  // Edit
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  // filtros
  const [filters, setFilters] = useState({ q: "", estado: "all", producto_id: "", etapa: "all" });

  /* ---- API ---- */
  async function loadLotes() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.q.trim()) params.set("q", filters.q.trim());
      if (filters.producto_id) params.set("producto_id", String(filters.producto_id));
      if (filters.estado !== "all") params.set("estado", filters.estado);
      // (nota) el endpoint /stock-pt/lotes NO filtra por etapa; lo filtramos en cliente
      const { data } = await api.get(`/stock-pt/lotes?${params.toString()}`);
      setLotes(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setToast({ type: "error", message: "No se pudieron cargar los lotes de PT" });
    } finally {
      setLoading(false);
    }
  }

  async function loadProductos() {
    setLoadingProductos(true);
    try {
      const { data } = await api.get(`/productos?estado=true`);
      setProductos(Array.isArray(data) ? data : []);
    } catch {
      setProductos([]);
      setToast({ type: "error", message: "No se pudieron cargar productos" });
    } finally {
      setLoadingProductos(false);
    }
  }

  useEffect(() => {
    loadLotes();
    loadProductos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    loadLotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.estado, filters.producto_id]);

  async function createLote(payload) {
    setSubmitting(true);
    try {
      await api.post(`/stock-pt/ingreso`, payload);
      setToast({ type: "success", message: "Lote registrado" });
      setModalOpen(false);
      await loadLotes();
    } catch (e) {
      setToast({
        type: "error",
        message: e?.response?.data?.message || "Error al registrar lote",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function updateLote(id, payload) {
    setSubmitting(true);
    try {
      await api.put(`/stock-pt/lotes/${id}`, payload);
      setToast({ type: "success", message: "Cambios guardados" });
      setEditOpen(false);
      setEditing(null);
      await loadLotes();
    } catch (e) {
      setToast({
        type: "error",
        message: e?.response?.data?.message || "Error al actualizar",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEstado(id, _activo) {
    try {
      const { data } = await api.patch(`/stock-pt/lotes/${id}/estado`, {}); // toggle simple
      const estado = data?.lote?.estado; // <- backend devuelve { message, lote }
      setToast({
        type: "success",
        message: estado === 'INACTIVO' ? 'Lote inactivado' : 'Lote activado',
      });
      await loadLotes();
    } catch (e) {
      setToast({ type: "error", message: e?.response?.data?.message || "Error cambiando estado" });
    }
  }

  async function deleteLote(id) {
    try {
      await api.delete(`/stock-pt/lotes/${id}`);
      setToast({ type: "success", message: "Lote eliminado" });
      await loadLotes();
    } catch (e) {
      setToast({
        type: "error",
        message: e?.response?.data?.message || "No se pudo eliminar",
      });
    } finally {
      setConfirmDeleteOpen(false);
      setToDelete(null);
    }
  }

  /* ---- Filtro texto + etapa (en cliente) ---- */
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const etapa = String(filters.etapa || "all").toUpperCase();
    return lotes.filter((l) => {
      const matchText =
        !q ||
        l.codigo?.toLowerCase().includes(q) ||
        l.productos_terminados?.nombre?.toLowerCase?.().includes(q);
      const matchEtapa = etapa === "ALL" || String(l.etapa || "").toUpperCase() === etapa;
      return matchText && matchEtapa;
    });
  }, [lotes, filters.q, filters.etapa]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const da = new Date(a.fecha_ingreso || 0).getTime();
      const db = new Date(b.fecha_ingreso || 0).getTime();
      if (db !== da) return db - da;
      return (b.id || 0) - (a.id || 0);
    });
  }, [filtered]);

  /* ---- UI ---- */
  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h2 style={{ margin: 0 }}>Stock PT (lotes)</h2>
        <div className="muted">Gestiona los lotes de productos terminados</div>
      </div>
      <button
        className="btn-primary"
        onClick={() => setModalOpen(true)}
        style={{ width: "auto" }}
      >
        + Registrar lote
      </button>
    </div>
  );

  const estadoBadge = (estado) => {
    const style = {
      DISPONIBLE: { bg: "#f6ffed", border: "#b7eb8f", color: "#237804" },
      AGOTADO: { bg: "#fff2f0", border: "#ffccc7", color: "#a8071a" },
      VENCIDO: { bg: "#fff7e6", border: "#ffd591", color: "#ad4e00" },
      RESERVADO: { bg: "#f0f5ff", border: "#adc6ff", color: "#1d39c4" },
      INACTIVO: { bg: "#fafafa", border: "#d9d9d9", color: "#595959" },
    }[estado] || { bg: "#fafafa", border: "#d9d9d9", color: "#595959" };

    return (
      <span
        className="badge"
        style={{
          background: style.bg,
          border: "1px solid " + style.border,
          color: style.color,
        }}
      >
        {estado}
      </span>
    );
  };

  const etapaBadge = (etapa) => (
    <span className="badge" style={{ background: "#f5f5f5", border: "1px solid #d9d9d9" }}>
      {etapa || "—"}
    </span>
  );

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
            gridTemplateColumns: "1fr 200px 160px 160px",
          }}
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
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select value={filters.estado} onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}>
            <option value="all">Todos los estados</option>
            <option value="DISPONIBLE">Disponibles</option>
            <option value="AGOTADO">Agotados</option>
            <option value="RESERVADO">Reservados</option>
            <option value="VENCIDO">Vencidos</option>
            <option value="INACTIVO">Inactivos</option>
          </select>
          <select value={filters.etapa} onChange={(e) => setFilters((f) => ({ ...f, etapa: e.target.value }))}>
            <option value="all">Todas las etapas</option>
            <option value="CONGELADO">Congelado</option>
            <option value="EMPAQUE">Empaque</option>
            <option value="HORNEO">Horneo</option>
          </select>
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Producto</th>
                <th>Código</th>
                <th style={{ textAlign: "right" }}>Cantidad</th>
                <th>Ingreso</th>
                <th>Vence</th>
                <th>Etapa</th>
                <th>Estado</th>
                <th style={{ width: 340 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} style={{ padding: 14 }}>Cargando…</td></tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 14, textAlign: "center" }}>Sin resultados</td></tr>
              )}
              {!loading && sorted.map((l) => (
                <tr key={l.id}>
                  <td>{l.id}</td>
                  <td>{l.productos_terminados?.nombre || "-"}</td>
                  <td>{l.codigo}</td>
                  <td style={{ textAlign: "right" }}>{l.cantidad}</td>
                  <td>{l.fecha_ingreso?.slice(0, 10)}</td>
                  <td>{l.fecha_vencimiento?.slice(0, 10) || "—"}</td>
                  <td>{etapaBadge(l.etapa)}</td>
                  <td>{estadoBadge(l.estado)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn-outline"
                        onClick={() => { setEditing(l); setEditOpen(true); }}
                        style={{ width: "auto" }}
                      >
                        ✏️ Editar
                      </button>
                      <button
                        className="btn-outline"
                        onClick={() => toggleEstado(l.id, l.estado === 'INACTIVO')}
                        style={{ width: "auto" }}
                      >
                        {l.estado === 'INACTIVO' ? 'Activar' : 'Inactivar'}
                      </button>
                      <button
                        className="btn-danger-outline"
                        onClick={() => { setToDelete(l); setConfirmDeleteOpen(true); }}
                        style={{ width: "auto" }}
                        title="Eliminar lote"
                      >
                        🗑️ Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Crear */}
      <Modal
        open={modalOpen}
        title="Registrar lote de Producto Terminado"
        onClose={() => { if (!submitting) setModalOpen(false); }}
      >
        <LotePTForm
          productos={productos}
          submitting={submitting}
          onSubmit={(payload) => createLote(payload)}
        />
        {loadingProductos && (
          <div className="muted" style={{ marginTop: 8 }}>
            Cargando productos…
          </div>
        )}
      </Modal>

      {/* Modal Editar */}
      <Modal
        open={editOpen}
        title={`Editar lote #${editing?.id || ''}`}
        onClose={() => { if (!submitting) { setEditOpen(false); setEditing(null); } }}
      >
        {editing && (
          <EditLoteForm
            lote={editing}
            submitting={submitting}
            onSubmit={(payload) => updateLote(editing.id, payload)}
          />
        )}
      </Modal>

      {/* Confirmación eliminar */}
      <Confirm
        open={confirmDeleteOpen}
        title="Eliminar lote"
        message={toDelete ? `¿Seguro que deseas eliminar el lote "${toDelete.codigo}"?` : ""}
        onCancel={() => { setConfirmDeleteOpen(false); setToDelete(null); }}
        onConfirm={() => deleteLote(toDelete.id)}
      />

      {/* Toast */}
      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ ...toast, message: "" })} />
    </div>
  );
}



