import { useEffect, useMemo, useState } from "react";
import api from "../api/client";

/* ========== UI Helpers (igual que MateriasPrimas) ========== */
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

/* ========== Formularios ========== */
const emptyEmpaque = { nombre: "", unidad_medida: "ud", estado: true };

function EmpaqueForm({ initial = emptyEmpaque, onSubmit, submitting }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const canSubmit = useMemo(() => {
    return form?.nombre?.trim()?.length > 1 && (form.unidad_medida || "ud");
  }, [form]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      nombre: form.nombre.trim(),
      unidad_medida: form.unidad_medida || "ud",
      estado: !!form.estado,
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label>Nombre</label>
          <input
            name="nombre"
            placeholder="Ej. Bolsa mediana"
            value={form.nombre}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Unidad</label>
          <select name="unidad_medida" value={form.unidad_medida} onChange={handleChange}>
            <option value="ud">Unidades (ud)</option>
            <option value="paquete">Paquete</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "end" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
            <input type="checkbox" name="estado" checked={!!form.estado} onChange={handleChange} />
            Activo
          </label>
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

const emptyLote = {
  materia_prima_id: "",
  codigo: "",
  cantidad: "",
  fecha_ingreso: new Date().toISOString().slice(0, 10),
  fecha_vencimiento: "",
  estado: "DISPONIBLE",
};

function LoteEmpaqueForm({ initial = emptyLote, empaques = [], onSubmit, submitting }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const canSubmit = useMemo(() => {
    return (
      String(form.materia_prima_id || "").length > 0 &&
      form.codigo?.trim()?.length > 0 &&
      Number(form.cantidad || 0) > 0 &&
      form.fecha_ingreso
    );
  }, [form]);

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      materia_prima_id: Number(form.materia_prima_id),
      codigo: form.codigo.trim(),
      cantidad: String(form.cantidad),
      fecha_ingreso: form.fecha_ingreso,
      fecha_vencimiento: form.fecha_vencimiento || null,
      estado: form.estado || "DISPONIBLE",
    });
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label>Empaque</label>
          <select
            name="materia_prima_id"
            value={form.materia_prima_id}
            onChange={handleChange}
            required
          >
            <option value="">— Seleccione —</option>
            {empaques.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label>Código</label>
          <input name="codigo" value={form.codigo} onChange={handleChange} required />
        </div>

        <div>
          <label>Cantidad (ud)</label>
          <input name="cantidad" value={form.cantidad} onChange={handleChange} required />
        </div>

        <div>
          <label>Fecha ingreso</label>
          <input type="date" name="fecha_ingreso" value={form.fecha_ingreso} onChange={handleChange} required />
        </div>

        <div>
          <label>Fecha vencimiento (opcional)</label>
          <input type="date" name="fecha_vencimiento" value={form.fecha_vencimiento || ""} onChange={handleChange} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn-primary" disabled={!canSubmit || submitting}>
          {submitting ? "Guardando..." : "Guardar lote"}
        </button>
      </div>
    </form>
  );
}

/* ========== Página ========== */
export default function Empaques() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState({ type: "success", message: "" });

  // Modales
  const [modalEmpOpen, setModalEmpOpen] = useState(false);
  const [modalLoteOpen, setModalLoteOpen] = useState(false);

  const [editingEmp, setEditingEmp] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Confirmar eliminar/toggle
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [toToggle, setToToggle] = useState(null);

  // Filtros
  const [filters, setFilters] = useState({ q: "", estado: "all" });

  // Detalle seleccionado (lotes/movs)
  const [sel, setSel] = useState(null);
  const [lotes, setLotes] = useState([]);
  const [movs, setMovs] = useState([]);

  /* ---- API ---- */
  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/empaques");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setToast({ type: "error", message: "No se pudieron cargar los empaques" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function createEmpaque(payload) {
    setSubmitting(true);
    try {
      await api.post("/empaques", { ...payload, estado: payload.estado ?? true });
      setToast({ type: "success", message: "Empaque creado" });
      setModalEmpOpen(false);
      setEditingEmp(null);
      await load();
    } catch (e) {
      setToast({ type: "error", message: e?.response?.data?.message || "Error al crear" });
    } finally { setSubmitting(false); }
  }

  async function updateEmpaque(id, payload) {
    setSubmitting(true);
    try {
      await api.put(`/empaques/${id}`, payload);
      setToast({ type: "success", message: "Cambios guardados" });
      setModalEmpOpen(false);
      setEditingEmp(null);
      await load();
    } catch (e) {
      setToast({ type: "error", message: e?.response?.data?.message || "Error al actualizar" });
    } finally { setSubmitting(false); }
  }

  async function toggleEstado(id, estadoActual) {
    try {
      await api.put(`/empaques/${id}`, { estado: !estadoActual });
      setToast({ type: "success", message: !estadoActual ? "Activado" : "Desactivado" });
      await load();
    } catch {
      setToast({ type: "error", message: "Error al cambiar estado" });
    } finally {
      setConfirmToggleOpen(false);
      setToToggle(null);
    }
  }

  async function removeEmpaque(id) {
    try {
      await api.delete(`/empaques/${id}`);
      setToast({ type: "success", message: "Eliminado" });
      await load();
    } catch (e) {
      setToast({ type: "error", message: e?.response?.data?.message || "No se pudo eliminar" });
    } finally {
      setConfirmDeleteOpen(false);
      setToDelete(null);
    }
  }

  async function loadLotes(id) {
    try {
      const { data } = await api.get(`/empaques/${id}/lotes`);
      setLotes(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }

  async function loadMovs(id) {
    try {
      const { data } = await api.get(`/empaques/${id}/movimientos`);
      setMovs(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  }

  async function createLote(payload) {
    setSubmitting(true);
    try {
      await api.post("/empaques/lotes", payload);
      setToast({ type: "success", message: "Lote creado" });
      setModalLoteOpen(false);
      // actualizar tabla + detalle si corresponde
      await load();
      const id = payload.materia_prima_id;
      setSel(id);
      await Promise.all([loadLotes(id), loadMovs(id)]);
    } catch (e) {
      setToast({ type: "error", message: e?.response?.data?.message || "Error al crear lote" });
    } finally { setSubmitting(false); }
  }

  /* ---- Filtro en memoria ---- */
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const estado = filters.estado;
    return items.filter((it) => {
      const matchText = !q || it.nombre?.toLowerCase().includes(q);
      const matchEstado =
        estado === "all" ||
        (estado === "active" && it.estado) ||
        (estado === "inactive" && !it.estado);
      return matchText && matchEstado;
    });
  }, [items, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" })
    );
  }, [filtered]);

  /* ---- UI ---- */
  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h2 style={{ margin: 0 }}>Empaques</h2>
        <div className="muted">Gestiona empaques usados para producto terminado</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          className="btn-outline"
          onClick={() => setModalLoteOpen(true)}
          style={{ width: "auto" }}
        >
          + Nuevo lote
        </button>
        <button
          className="btn-primary"
          onClick={() => { setEditingEmp(null); setModalEmpOpen(true); }}
          style={{ width: "auto" }}
        >
          + Nuevo empaque
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="card">
        {header}

        {/* Filtros */}
        <div className="filters" style={{ marginTop: 12 }}>
          <input
            placeholder="Buscar por nombre…"
            value={filters.q}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
          />
          <select
            value={filters.estado}
            onChange={(e) => setFilters((f) => ({ ...f, estado: e.target.value }))}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="inactive">Inactivos</option>
          </select>
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Nombre</th>
                <th>Unidad</th>
                <th>Stock total</th>
                <th>Estado</th>
                <th style={{ width: 280 }}>Acciones</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ padding: 14 }}>Cargando…</td>
                </tr>
              )}

              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 14, textAlign: "center" }}>Sin resultados</td>
                </tr>
              )}

              {!loading && sorted.map((it) => (
                <tr key={it.id}>
                  <td>{it.id}</td>
                  <td>{it.nombre}</td>
                  <td>{it.unidad_medida}</td>
                  <td>{it.stock_total ?? 0}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: it.estado ? "#f6ffed" : "#fff2f0",
                        border: "1px solid",
                        borderColor: it.estado ? "#b7eb8f" : "#ffccc7",
                        color: it.estado ? "#237804" : "#a8071a",
                      }}
                    >
                      {it.estado ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn-outline"
                        onClick={() => { setSel(it.id); loadLotes(it.id); loadMovs(it.id); }}
                        style={{ width: "auto" }}
                      >
                        👁️ Ver
                      </button>

                      <button
                        className="btn-outline"
                        onClick={() => { setEditingEmp({ ...it }); setModalEmpOpen(true); }}
                        style={{ width: "auto" }}
                      >
                        ✏️ Editar
                      </button>

                      <button
                        className="btn-outline"
                        onClick={() => { setToToggle({ id: it.id, estado: it.estado, nombre: it.nombre }); setConfirmToggleOpen(true); }}
                        style={{ width: "auto" }}
                      >
                        {it.estado ? "Desactivar" : "Activar"}
                      </button>

                      <button
                        className="btn-danger-outline"
                        onClick={() => { setToDelete(it); setConfirmDeleteOpen(true); }}
                        style={{ width: "auto" }}
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

        {/* Detalle seleccionado */}
        {sel && (
          <div className="grid-2" style={{ marginTop: 12, gap: 12 }}>
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Lotes (Empaque #{sel})</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Cantidad</th>
                    <th>Ingreso</th>
                    <th>Vence</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l) => (
                    <tr key={l.id}>
                      <td>{l.codigo}</td>
                      <td>{l.cantidad}</td>
                      <td>{l.fecha_ingreso?.slice(0, 10)}</td>
                      <td>{l.fecha_vencimiento?.slice(0, 10) || "-"}</td>
                      <td>{l.estado}</td>
                    </tr>
                  ))}
                  {!lotes.length && (
                    <tr><td colSpan={5} style={{ padding: 12, textAlign: "center" }}>Sin lotes</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>Movimientos (Empaque #{sel})</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Cantidad</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {movs.map((m) => (
                    <tr key={m.id}>
                      <td>{m.fecha?.slice(0, 10)}</td>
                      <td>{m.tipo}</td>
                      <td>{m.cantidad}</td>
                      <td>{m.motivo || "-"}</td>
                    </tr>
                  ))}
                  {!movs.length && (
                    <tr><td colSpan={4} style={{ padding: 12, textAlign: "center" }}>Sin movimientos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal empaque */}
      <Modal
        open={modalEmpOpen}
        title={editingEmp ? "Editar empaque" : "Nuevo empaque"}
        onClose={() => { if (!submitting) { setModalEmpOpen(false); setEditingEmp(null); } }}
      >
        <EmpaqueForm
          initial={editingEmp || emptyEmpaque}
          submitting={submitting}
          onSubmit={(payload) =>
            editingEmp ? updateEmpaque(editingEmp.id, payload) : createEmpaque(payload)
          }
        />
      </Modal>

      {/* Modal nuevo lote */}
      <Modal
        open={modalLoteOpen}
        title="Nuevo lote de empaque"
        onClose={() => { if (!submitting) setModalLoteOpen(false); }}
      >
        <LoteEmpaqueForm
          initial={{ ...emptyLote, materia_prima_id: sel || "" }}
          empaques={items}
          submitting={submitting}
          onSubmit={(payload) => createLote(payload)}
        />
      </Modal>

      {/* Confirmaciones */}
      <Confirm
        open={confirmDeleteOpen}
        title="Eliminar empaque"
        message={toDelete ? `¿Seguro que deseas eliminar "${toDelete.nombre}"?` : ""}
        onCancel={() => { setConfirmDeleteOpen(false); setToDelete(null); }}
        onConfirm={() => removeEmpaque(toDelete.id)}
      />

      <Confirm
        open={confirmToggleOpen}
        title={toToggle?.estado ? "Desactivar empaque" : "Activar empaque"}
        message={toToggle ? `¿Deseas ${toToggle.estado ? "desactivar" : "activar"} "${toToggle.nombre}"?` : ""}
        onCancel={() => { setConfirmToggleOpen(false); setToToggle(null); }}
        onConfirm={() => toggleEstado(toToggle.id, toToggle.estado)}
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



