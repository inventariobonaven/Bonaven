// src/pages/Usuarios.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../api/client";

/* ===== helpers de rol ===== */
const toUIRole  = (r) => String(r || "").toUpperCase() === "ADMIN" ? "Admin" : "Producción";
const toApiRole = (r) => String(r || "").toLowerCase().startsWith("admin") ? "ADMIN" : "PRODUCCION";

/* ===== UI Helpers (igual que otros módulos) ===== */
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

/* ===== Form ===== */
const emptyForm = {
  nombre: "",
  usuario: "",
  rol: "Producción",
  estado: true,
  password: "",
};

function UsuarioForm({ initial = emptyForm, onSubmit, submitting, isEdit }) {
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial), [initial]);

  const canSubmit = useMemo(() => {
    const okNombre = form?.nombre?.trim()?.length > 1;
    const okUsuario = form?.usuario?.trim()?.length > 2;
    const okRol = ["Admin", "Producción"].includes(form?.rol);
    const okPass = isEdit ? true : String(form.password || "").trim().length >= 6;
    return okNombre && okUsuario && okRol && okPass;
  }, [form, isEdit]);

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
  }

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    const payload = { ...form };
    if (isEdit && (!payload.password || payload.password.trim() === "")) {
      delete payload.password; // no cambiar contraseña
    }
    onSubmit(payload);
  }

  return (
    <form onSubmit={submit}>
      <div className="form-grid">
        <div>
          <label>Nombre</label>
          <input name="nombre" placeholder="Ej. Juan Pérez" value={form.nombre} onChange={handleChange} required />
        </div>
        <div>
          <label>Usuario</label>
          <input name="usuario" placeholder="Ej. jperez" value={form.usuario} onChange={handleChange} required />
        </div>
        <div>
          <label>Rol</label>
          <select name="rol" value={form.rol} onChange={handleChange} required>
            <option value="Admin">Admin</option>
            <option value="Producción">Producción</option>
          </select>
        </div>
        <div>
          <label>{isEdit ? "Contraseña (opcional)" : "Contraseña"}</label>
          <input
            type="password"
            name="password"
            placeholder={isEdit ? "Dejar en blanco para no cambiar" : "Mínimo 6 caracteres"}
            value={form.password || ""}
            onChange={handleChange}
            {...(isEdit ? {} : { required: true, minLength: 6 })}
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

/* ===== Página ===== */
export default function Usuarios() {
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

  const [filters, setFilters] = useState({ q: "", estado: "all", rol: "all" });

  /* API */
  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/usuarios");
      const normalized = (Array.isArray(data) ? data : []).map(u => ({ ...u, rol: toUIRole(u.rol) }));
      setItems(normalized);
    } catch (err) {
      console.error("[Usuarios] listar error", err);
      setToast({ type: "error", message: err?.response?.data?.message || "Error cargando usuarios" });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function createItem(payload) {
    setSubmitting(true);
    try {
      const body = {
        nombre: String(payload.nombre || "").trim(),
        usuario: String(payload.usuario || "").trim(),
        rol: toApiRole(payload.rol),           // -> "ADMIN" | "PRODUCCION"
        estado: !!payload.estado,
        contrasena: String(payload.password || "").trim(), // 👈 clave que espera la API
      };
      await api.post("/usuarios", body);
      setToast({ type: "success", message: "Usuario creado" });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      console.error("[Usuarios] create", err?.response?.status, err?.response?.data);
      setToast({ type: "error", message: err?.response?.data?.message || "Error creando usuario" });
    } finally {
      setSubmitting(false);
    }
  }

  async function updateItem(id, payload) {
    setSubmitting(true);
    try {
      const body = {
        nombre: String(payload.nombre || "").trim(),
        usuario: String(payload.usuario || "").trim(),
        rol: toApiRole(payload.rol),
        estado: !!payload.estado,
      };
      if (payload.password && String(payload.password).trim() !== "") {
        body.contrasena = String(payload.password).trim(); // 👈 solo si se cambia
      }
      await api.put(`/usuarios/${id}`, body);
      setToast({ type: "success", message: "Cambios guardados" });
      setModalOpen(false);
      setEditing(null);
      await load();
    } catch (err) {
      console.error("[Usuarios] update", err?.response?.status, err?.response?.data);
      setToast({ type: "error", message: err?.response?.data?.message || "Error actualizando usuario" });
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleEstado(id, estadoActual) {
    try {
      await api.patch(`/usuarios/${id}/estado`, { estado: !estadoActual });
      setToast({ type: "success", message: !estadoActual ? "Usuario activado" : "Usuario desactivado" });
      await load();
    } catch (err) {
      setToast({ type: "error", message: "Error al cambiar estado" });
    } finally {
      setConfirmToggleOpen(false);
      setToToggle(null);
    }
  }

  async function removeItem(id) {
    try {
      await api.delete(`/usuarios/${id}`);
      setToast({ type: "success", message: "Usuario eliminado" });
      await load();
    } catch (err) {
      setToast({ type: "error", message: err?.response?.data?.message || "No se pudo eliminar" });
    } finally {
      setConfirmDeleteOpen(false);
      setToDelete(null);
    }
  }

  /* Filtro en memoria (trabaja con roles ya normalizados a UI) */
  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const estado = filters.estado;
    const rol = filters.rol; // "all" | "Admin" | "Producción"

    return items.filter((u) => {
      const matchText =
        !q ||
        u.nombre?.toLowerCase()?.includes(q) ||
        u.usuario?.toLowerCase()?.includes(q) ||
        u.rol?.toLowerCase()?.includes(q);

      const matchEstado =
        estado === "all" ||
        (estado === "active" && u.estado) ||
        (estado === "inactive" && !u.estado);

      const matchRol = rol === "all" || u.rol === rol;

      return matchText && matchEstado && matchRol;
    });
  }, [items, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) =>
      String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" })
    );
  }, [filtered]);

  /* UI */
  const header = (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h2 style={{ margin: 0 }}>Usuarios</h2>
        <div className="muted">Administra cuentas y permisos</div>
      </div>
      <button
        className="btn-primary"
        onClick={() => {
          setEditing(null);
          setModalOpen(true);
        }}
        style={{ width: "auto" }}
      >
        + Nuevo usuario
      </button>
    </div>
  );

  return (
    <div className="page">
      <div className="card">
        {header}

        {/* Filtros */}
        <div className="filters" style={{ marginTop: 12, gridTemplateColumns: "1fr 0.6fr 0.6fr" }}>
          <input
            placeholder="Buscar por nombre, usuario o rol…"
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
          <select
            value={filters.rol}
            onChange={(e) => setFilters((f) => ({ ...f, rol: e.target.value }))}
          >
            <option value="all">Todos los roles</option>
            <option value="Admin">Admin</option>
            <option value="Producción">Producción</option>
          </select>
        </div>

        {/* Tabla */}
        <div style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>ID</th>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
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

              {!loading && sorted.map((u) => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td>{u.nombre}</td>
                  <td>{u.usuario}</td>
                  <td>{u.rol}</td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        background: u.estado ? "#f6ffed" : "#fff2f0",
                        border: "1px solid",
                        borderColor: u.estado ? "#b7eb8f" : "#ffccc7",
                        color: u.estado ? "#237804" : "#a8071a",
                      }}
                    >
                      {u.estado ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        className="btn-outline"
                        onClick={() => {
                          setEditing({
                            id: u.id,
                            nombre: u.nombre,
                            usuario: u.usuario,
                            rol: u.rol, // UI
                            estado: !!u.estado,
                            password: "",
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
                          setToToggle({ id: u.id, estado: u.estado, nombre: u.nombre });
                          setConfirmToggleOpen(true);
                        }}
                        style={{ width: "auto" }}
                      >
                        {u.estado ? "Desactivar" : "Activar"}
                      </button>

                      <button
                        className="btn-danger-outline"
                        onClick={() => {
                          setToDelete(u);
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
        title={editing ? "Editar usuario" : "Nuevo usuario"}
        onClose={() => { if (!submitting) { setModalOpen(false); setEditing(null); } }}
      >
        <UsuarioForm
          initial={editing || emptyForm}
          isEdit={!!editing}
          submitting={submitting}
          onSubmit={(payload) => editing ? updateItem(editing.id, payload) : createItem(payload)}
        />
      </Modal>

      {/* Confirmaciones */}
      <Confirm
        open={confirmDeleteOpen}
        title="Eliminar usuario"
        message={toDelete ? `¿Seguro que deseas eliminar a "${toDelete.nombre}"? Esta acción no se puede deshacer.` : ""}
        onCancel={() => { setConfirmDeleteOpen(false); setToDelete(null); }}
        onConfirm={() => removeItem(toDelete.id)}
      />
      <Confirm
        open={confirmToggleOpen}
        title={toToggle?.estado ? "Desactivar usuario" : "Activar usuario"}
        message={toToggle ? `¿Deseas ${toToggle.estado ? "desactivar" : "activar"} a "${toToggle.nombre}"?` : ""}
        onCancel={() => { setConfirmToggleOpen(false); setToToggle(null); }}
        onConfirm={() => toggleEstado(toToggle.id, toToggle.estado)}
      />

      <Toast type={toast.type} message={toast.message} onClose={() => setToast({ ...toast, message: "" })} />
    </div>
  );
}



