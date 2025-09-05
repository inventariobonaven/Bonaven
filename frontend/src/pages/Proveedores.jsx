// src/pages/Proveedores.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../api/client";


/* ========== UI Helpers (mismos que en MateriasPrimas) ========== */
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
const emptyForm = { nombre: "", contacto: "", estado: true };


function ProveedorForm({ initial = emptyForm, onSubmit, submitting }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);


  const canSubmit =
    form?.nombre?.trim()?.length > 1 &&
    (form?.contacto === null || form?.contacto !== undefined) &&
    String(form?.contacto).trim().length >= 0;


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
            placeholder="Ej. Proveedor Café S.A.S."
            value={form.nombre}
            onChange={handleChange}
            required
          />
        </div>


        <div>
          <label>Contacto</label>
          <input
            name="contacto"
            placeholder="Ej. 3001234567 / contacto@mail.com"
            value={form.contacto || ""}
            onChange={handleChange}
          />
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


/* ========== Página ========== */
export default function Proveedores() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);


  const [toast, setToast] = useState({ type: "success", message: "" });


  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);


  // Confirmaciones
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [toDelete, setToDelete] = useState(null);


  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false);
  const [toToggle, setToToggle] = useState(null); // { id, estado, nombre }


  // Filtros
  const [filters, setFilters] = useState({ q: "", estado: "all" });


  /* ---- API ---- */
  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/proveedores");
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      setToast({
        type: "error",
        message: err?.response?.data?.message || "Error cargando proveedores",
      });
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
      await api.post("/proveedores", payload);
      setToast({ type: "success", message: "Proveedor creado" });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setToast({
        type: "error",
        message: err?.response?.data?.message || "Error creando proveedor",
      });
    } finally {
      setSubmitting(false);
    }
  }


  async function updateItem(id, payload) {
    setSubmitting(true);
    try {
      await api.put(`/proveedores/${id}`, payload);
      setToast({ type: "success", message: "Cambios guardados" });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      setToast({
        type: "error",
        message: err?.response?.data?.message || "Error actualizando proveedor",
      });
    } finally {
      setSubmitting(false);
    }
  }


  async function toggleEstado(id, estadoActual) {
    try {
      await api.patch(`/proveedores/${id}/estado`, { estado: !estadoActual });
      setToast({
        type: "success",
        message: !estadoActual ? "Proveedor activado" : "Proveedor desactivado",
      });
      await load();
    } catch (err) {
      setToast({
        type: "error",
        message: "Error al cambiar estado",
      });
    } finally {
      setConfirmToggleOpen(false);
      setToToggle(null);
    }
  }


  async function removeItem(id) {
    try {
      await api.delete(`/proveedores/${id}`);
      setToast({ type: "success", message: "Proveedor eliminado" });
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
    const estado = filters.estado; // all | active | inactive
    return items.filter((it) => {
      const matchText =
        !q ||
        it.nombre?.toLowerCase().includes(q) ||
        it.contacto?.toLowerCase?.().includes(q);
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
        <h2 style={{ margin: 0 }}>Proveedores</h2>
        <div className="muted">Gestiona tus proveedores y contactos</div>
      </div>
      <button
        className="btn-primary"
        onClick={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        style={{ width: "auto" }}
      >
        + Nuevo proveedor
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
            placeholder="Buscar por nombre o contacto…"
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
                <th>Contacto</th>
                <th>Estado</th>
                <th style={{ width: 260 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} style={{ padding: 14 }}>
                    Cargando…
                  </td>
                </tr>
              )}


              {!loading && sorted.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: 14, textAlign: "center" }}>
                    Sin resultados
                  </td>
                </tr>
              )}


              {!loading &&
                sorted.map((p) => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td>{p.nombre}</td>
                    <td>{p.contacto || "-"}</td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background: p.estado ? "#f6ffed" : "#fff2f0",
                          border: "1px solid",
                          borderColor: p.estado ? "#b7eb8f" : "#ffccc7",
                          color: p.estado ? "#237804" : "#a8071a",
                        }}
                      >
                        {p.estado ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          className="btn-outline"
                          onClick={() => {
                            setEditing({
                              id: p.id,
                              nombre: p.nombre,
                              contacto: p.contacto || "",
                              estado: !!p.estado,
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
                            setToToggle({ id: p.id, estado: p.estado, nombre: p.nombre });
                            setConfirmToggleOpen(true);
                          }}
                          style={{ width: "auto" }}
                        >
                          {p.estado ? "Desactivar" : "Activar"}
                        </button>


                        <button
                          className="btn-danger-outline"
                          onClick={() => {
                            setToDelete(p);
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
        title={editing ? "Editar proveedor" : "Nuevo proveedor"}
        onClose={() => {
          if (!submitting) {
            setModalOpen(false);
            setEditing(null);
          }
        }}
      >
        <ProveedorForm
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
        title="Eliminar proveedor"
        message={
          toDelete
            ? `¿Seguro que deseas eliminar al proveedor "${toDelete.nombre}"? Esta acción no se puede deshacer.`
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
        title={toToggle?.estado ? "Desactivar proveedor" : "Activar proveedor"}
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





