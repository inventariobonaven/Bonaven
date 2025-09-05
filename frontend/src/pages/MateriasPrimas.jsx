 import { useEffect, useMemo, useState } from "react";
import api from "../api/client";

/* ========== UI Helpers ========== */
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
        padding: 12, // margen en pantallas pequeñas
      }}
      onClick={onClose}
    >
      <div
        className="card modal-card" // ancho grande + padding (definido en CSS)
        onClick={(e) => e.stopPropagation()}
      >
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
const emptyForm = { nombre: "", tipo: "", unidad_medida: "g", estado: true };

function MateriaPrimaForm({ initial = emptyForm, onSubmit, submitting }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const canSubmit = useMemo(() => {
    return (
      form?.nombre?.trim()?.length > 1 &&
      form?.tipo?.trim()?.length > 1 &&
      ["g", "kg", "ml", "l", "ud"].includes(form?.unidad_medida)
    );
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
          <label>Nombre</label>
          <input
            name="nombre"
            placeholder="Ej. Azúcar"
            value={form.nombre}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Tipo</label>
          <input
            name="tipo"
            placeholder="Ej. Insumo"
            value={form.tipo}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Unidad</label>
          <select name="unidad_medida" value={form.unidad_medida} onChange={handleChange}>
            <option value="g">Gramos (g)</option>
            <option value="ml">Mililitros (ml)</option>
            <option value="ud">Unidades (ud)</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "end" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
            <input
              type="checkbox"
              name="estado"
              checked={!!form.estado}
              onChange={handleChange}
            />
            Activa
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

/* ========== Página ========== */
export default function MateriasPrimas() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState({ type: "success", message: "" });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Confirmar eliminar
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  // Confirmar activar/desactivar
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [toToggle, setToToggle] = useState(null); // { id, estado, nombre }

  // Filtros
  const [filters, setFilters] = useState({ q: "", estado: "all" });

  /* ---- API ---- */
  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/materias-primas");
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setToast({ type: "error", message: "No se pudieron cargar las materias primas" });
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
      await api.post("/materias-primas", payload);
      setToast({ type: "success", message: "Materia prima creada" });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setToast({
        type: "error",
        message: e?.response?.data?.message || "Error al crear",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function updateItem(id, payload) {
    setSubmitting(true);
    try {
      await api.put(`/materias-primas/${id}`, payload);
      setToast({ type: "success", message: "Cambios guardados" });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setToast({
        type: "error",
        message: e?.response?.data?.message || "Error al actualizar",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEstado(id, estadoActual) {
    try {
      await api.patch(`/materias-primas/${id}/estado`, { estado: !estadoActual });
      setToast({
        type: "success",
        message: !estadoActual ? "Activada" : "Desactivada",
      });
      await load();
    } catch {
      setToast({ type: "error", message: "Error al cambiar estado" });
    } finally {
      setConfirmToggleOpen(false);
      setToToggle(null);
    }
  }

  async function removeItem(id) {
    try {
      await api.delete(`/materias-primas/${id}?hard=true`);
      setToast({ type: "success", message: "Eliminada" });
      await load();
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

  /* ---- Filtro en memoria ---- */
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const estado = filters.estado; // all | active | inactive
    return items.filter((it) => {
      const matchText =
        !q ||
        it.nombre?.toLowerCase().includes(q) ||
        it.tipo?.toLowerCase().includes(q);
      const matchEstado =
        estado === "all" ||
        (estado === "active" && it.estado) ||
        (estado === "inactive" && !it.estado);
      return matchText && matchEstado;
    });
  }, [items, filters]);

  /* ---- ORDEN por defecto: nombre (A→Z) ---- */
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" })
    );
  }, [filtered]);

  /* ---- UI ---- */
  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h2 style={{ margin: 0 }}>Materias Primas</h2>
        <div className="muted">Gestiona los insumos base para producción</div>
      </div>
      <button
        className="btn-primary"
        onClick={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        style={{ width: "auto" }}
      >
        + Nueva materia prima
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
            placeholder="Buscar por nombre o tipo…"
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
                <th>Tipo</th>
                <th>Unidad</th>
                <th>Stock total</th>
                <th>Estado</th>
                <th style={{ width: 260 }}>Acciones</th>
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

              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 14, textAlign: "center" }}>
                    Sin resultados
                  </td>
                </tr>
              )}

              {!loading &&
                sorted.map((it) => (
                  <tr key={it.id}>
                    <td>{it.id}</td>
                    <td>{it.nombre}</td>
                    <td>{it.tipo}</td>
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
                          onClick={() => {
                            setEditing({
                              id: it.id,
                              nombre: it.nombre,
                              tipo: it.tipo,
                              unidad_medida: it.unidad_medida,
                              estado: !!it.estado,
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
                            setToToggle({ id: it.id, estado: it.estado, nombre: it.nombre });
                            setConfirmToggleOpen(true);
                          }}
                          style={{ width: "auto" }}
                        >
                          {it.estado ? "Desactivar" : "Activar"}
                        </button>

                        <button
                          className="btn-danger-outline"
                          onClick={() => {
                            setToDelete(it);
                            setConfirmDeleteOpen(true);
                          }}
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
      </div>

      {/* Modal Crear / Editar */}
      <Modal
        open={modalOpen}
        title={editing ? "Editar materia prima" : "Nueva materia prima"}
        onClose={() => {
          if (!submitting) {
            setModalOpen(false);
            setEditing(null);
          }
        }}
      >
        <MateriaPrimaForm
          initial={editing || emptyForm}
          submitting={submitting}
          onSubmit={(payload) =>
            editing ? updateItem(editing.id, payload) : createItem(payload)
          }
        />
      </Modal>

      {/* Confirmación de borrado */}
      <Confirm
        open={confirmDeleteOpen}
        title="Eliminar materia prima"
        message={
          toDelete
            ? `¿Seguro que deseas eliminar "${toDelete.nombre}"? Esta acción no se puede deshacer.`
            : ""
        }
        onCancel={() => {
          setConfirmDeleteOpen(false);
          setToDelete(null);
        }}
        onConfirm={() => removeItem(toDelete.id)}
      />

      {/* Confirmación activar/desactivar */}
      <Confirm
        open={confirmToggleOpen}
        title={toToggle?.estado ? "Desactivar materia prima" : "Activar materia prima"}
        message={
          toToggle
            ? `¿Deseas ${toToggle.estado ? "desactivar" : "activar"} "${toToggle.nombre}"?`
            : ""
        }
        onCancel={() => {
          setConfirmToggleOpen(false);
          setToToggle(null);
        }}
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



