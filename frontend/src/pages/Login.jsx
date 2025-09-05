// src/pages/Login.jsx
import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function Login() {
  const { login } = useAuth();
  const [usuario, setUsuario] = useState("admin");
  const [contrasena, setContrasena] = useState("Admin123");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const expired = searchParams.get("expired") === "1";

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(usuario.trim(), contrasena);
      navigate("/");
    } catch (err) {
      console.error("[Login] error", err);
      setError(err?.response?.data?.message || "Error al iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <h2>Iniciar sesión</h2>
        <p className="muted">Usa tu cuenta para acceder al sistema.</p>

        {expired && (
          <div className="alert" style={{ marginTop: 8 }}>
            Tu sesión expiró. Inicia sesión nuevamente.
          </div>
        )}
        {error && (
          <div className="alert" style={{ marginTop: 8 }}>
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} style={{ marginTop: 10 }}>
          <label>Usuario</label>
          <input
            autoFocus
            autoComplete="username"
            placeholder="Ej. admin"
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />

          <label style={{ marginTop: 12 }}>Contraseña</label>
          <div className="input-with-action">
            <input
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
            />
            <button
              type="button"
              className="btn-outline sm"
              onClick={() => setShowPwd((v) => !v)}
              aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPwd ? "Ocultar" : "Mostrar"}
            </button>
          </div>

          <button
            className="btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: "100%", marginTop: 14 }}
          >
            {loading ? "Ingresando…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}



