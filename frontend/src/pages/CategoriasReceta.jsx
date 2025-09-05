// src/pages/CategoriasReceta.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../api/client";

/* UI helpers */
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

const emptyForm = { nombre: "", estado: true };

function CategoriaForm({ initial = emptyForm, onSubmit, submitting }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const canSubmit = String(form.nombre || "").trim().length >= 2;

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      nombre: String(form.nombre || "").trim(),
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
            placeholder="Ej. Masas dulces"
            value={form.nombre}
            onChange={handleChange}
            required
          />
        </div>
        <div style={{ display: "flex", alignItems: "end" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", margin: 0 }}>
            <input type="checkbox" name="estado" checked={!!form.estado} onChange={handleChange} />
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

export default function CategoriasReceta() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const [toast, setToast] = useState({ type: "success", message: "" });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [toToggle, setToToggle] = useState(null);

  const [filters, setFilters] = useState({ q: "", estado: "all" });

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.estado === "active") params.set("estado", "true");
      else if (filters.estado === "inactive") params.set("estado", "false");
      const { data } = await api.get(`/categorias-receta?${params.toString()}`);
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setToast({ type: "error", message: "No se pudieron cargar categorías" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.estado]);

  async function createItem(payload) {
    setSubmitting(true);
    try {
      await api.post("/categorias-receta", payload);
      setToast({ type: "success", message: "Categoría creada" });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setToast({ type: "error", message: e?.response?.data?.message || "Error al crear" });
    } finally {
      setSubmitting(false);
    }
  }

  async function updateItem(id, payload) {
    setSubmitting(true);
    try {
      await api.put(`/categorias-receta/${id}`, payload);
      setToast({ type: "success", message: "Cambios guardados" });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (e) {
      setToast({ type: "error", message: e?.response?.data?.message || "Error al actualizar" });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEstado(id, estadoActual) {
    try {
      await api.patch(`/categorias-receta/${id}/estado`, { estado: !estadoActual });
      setToast({ type: "success", message: !estadoActual ? "Activada" : "Desactivada" });
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
      await api.delete(`/categorias-receta/${id}?hard=true`);
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

  return (
    <div className="page">
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0 }}>Categorías de Receta</h2>
            <div className="muted">Agrupa recetas por familia/tipo.</div>
          </div>
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setModalOpen(true);
            }}
            style={{ width: "auto" }}
          >
            + Nueva categoría
          </button>
        </div>

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
            <option value="all">Todas</option>
            <option value="active">Activas</option>
            <option value="inactive">Inactivas</option>
          </select>
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Nombre</th>
                <th>Estado</th>
                <th style={{ width: 260 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} style={{ padding: 14 }}>
                    Cargando…
                  </td>
                </tr>
              )}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ padding: 14, textAlign: "center" }}>
                    Sin resultados
                  </td>
                </tr>
              )}
              {!loading &&
                sorted.map((it) => (
                  <tr key={it.id}>
                    <td>{it.id}</td>
                    <td>{it.nombre}</td>
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
                            setEditing({ id: it.id, nombre: it.nombre, estado: !!it.estado });
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

      {/* Modal crear/editar */}
      <Modal
        open={modalOpen}
        title={editing ? "Editar categoría" : "Nueva categoría"}
        onClose={() => {
          if (!submitting) {
            setModalOpen(false);
            setEditing(null);
          }
        }}
      >
        <CategoriaForm
          initial={editing || emptyForm}
          submitting={submitting}
          onSubmit={(payload) => (editing ? updateItem(editing.id, payload) : createItem(payload))}
        />
      </Modal>

      {/* Confirmaciones */}
      <Confirm
        open={confirmDeleteOpen}
        title="Eliminar categoría"
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

      <Confirm
        open={confirmToggleOpen}
        title={toToggle?.estado ? "Desactivar" : "Activar"}
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

      <Toast
        type={toast.type}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: "" })}
      />
    </div>
  );
}



