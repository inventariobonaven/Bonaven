import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchNotificaciones, markNotificacionRead } from '../api/notificaciones';
import { useAuth } from '../auth/AuthContext';

export default function NotificationToaster() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const isAdmin = String(user?.rol).toUpperCase() === 'ADMIN';

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const { data } = await fetchNotificaciones({ unreadOnly: true, limit: 10 });
        setToasts(data || []);
      } catch (err) {
        console.error('[Toaster] fetch error', err);
      }
    })();
  }, [isAdmin]);

  if (!isAdmin) return null;

  // X: solo cierra visualmente el toast (NO marca leída)
  const onDismiss = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    // No tocamos backend y NO disparamos refresh
  };

  // Botón "Marcar leída": sí actualiza backend y quita el toast
  const onMarkRead = async (id) => {
    try {
      await markNotificacionRead(id);
    } catch {}
    setToasts((prev) => prev.filter((t) => t.id !== id));
    window.dispatchEvent(new CustomEvent('noti:refresh'));
  };

  const goToList = () => navigate('/producciones');

  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((n) => (
        <div key={n.id} className="toast">
          <button
            className="toast-x"
            aria-label="Cerrar"
            title="Cerrar"
            onClick={() => onDismiss(n.id)}
          >
            ×
          </button>

          <div className="toast-time">{new Date(n.created_at).toLocaleString()}</div>
          <div className="toast-title">
            <span aria-hidden="true">🛎️</span> Observación en producción
          </div>

          <div className="toast-sub">
            <strong>#{n.payload?.produccionId}</strong>
            {n.payload?.receta ? ` — ${n.payload.receta}` : ''}
          </div>

          <div className="toast-text">{n.payload?.observacion || n.mensaje}</div>

          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <button className="toast-link" onClick={goToList} title="Ir al historial">
              Ver historial
            </button>
            <button
              className="toast-link"
              onClick={() => onMarkRead(n.id)}
              title="Marcar como leída"
            >
              Marcar leída
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
