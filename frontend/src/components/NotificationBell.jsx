import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchNotificaciones,
  markAllNotificacionesRead,
  markNotificacionRead,
} from '../api/notificaciones';
import { useAuth } from '../auth/AuthContext';

export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [count, setCount] = useState(0);
  const [bump, setBump] = useState(false);
  const prevCountRef = useRef(0);
  const bellRef = useRef(null);

  const isAdmin = String(user?.rol).toUpperCase() === 'ADMIN';

  const load = async () => {
    try {
      const { data } = await fetchNotificaciones({ unreadOnly: true, limit: 50 });
      setItems(data || []);
      const newCount = (data || []).length;
      setCount(newCount);
      if (newCount > prevCountRef.current) {
        setBump(true);
        setTimeout(() => setBump(false), 600);
      }
      prevCountRef.current = newCount;
    } catch (e) {
      console.error('[Bell] fetch error', e);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    load();

    // cerrar al click fuera y con ESC
    const onClickOutside = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) setOpen(false);
    };
    const onEsc = (e) => e.key === 'Escape' && setOpen(false);

    window.addEventListener('mousedown', onClickOutside);
    window.addEventListener('keydown', onEsc);

    // refresco y eventos
    const onRefresh = () => load();
    window.addEventListener('noti:refresh', onRefresh);
    const id = setInterval(load, 30000);

    return () => {
      window.removeEventListener('mousedown', onClickOutside);
      window.removeEventListener('keydown', onEsc);
      window.removeEventListener('noti:refresh', onRefresh);
      clearInterval(id);
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const onToggle = () => setOpen((o) => !o);

  const onMarkOne = async (id) => {
    try {
      await markNotificacionRead(id);
    } catch {}
    await load();
  };

  const onMarkAll = async () => {
    try {
      await markAllNotificacionesRead();
    } catch {}
    await load();
  };

  const goToList = () => {
    navigate('/producciones'); // << ir al historial
    setOpen(false);
  };

  return (
    <div className="noti" ref={bellRef}>
      <button
        className={`noti-btn ${bump ? 'noti-bump' : ''}`}
        onClick={onToggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Notificaciones"
        title={count > 0 ? `Tienes ${count} notificación(es)` : 'Sin nuevas notificaciones'}
      >
        <span className="noti-icon" aria-hidden="true">
          🔔
        </span>
        {count > 0 && <span className="noti-badge">{count}</span>}
      </button>

      {open && (
        <div className="noti-dropdown" role="dialog" aria-label="Notificaciones">
          <div className="noti-header">
            <div className="noti-title">
              <span aria-hidden="true">🔔</span> Notificaciones
            </div>
            <div className="noti-actions">
              <button className="link" onClick={load}>
                Actualizar
              </button>
              {count > 0 && (
                <button className="link" onClick={onMarkAll}>
                  Marcar todas
                </button>
              )}
            </div>
          </div>

          <div className="noti-list">
            {items.length === 0 ? (
              <div className="noti-empty">
                <span aria-hidden="true">✅</span>
                <div>Sin nuevas notificaciones</div>
              </div>
            ) : (
              items.map((n) => (
                <div key={n.id} className="noti-item">
                  <div className="noti-time">{new Date(n.created_at).toLocaleString()}</div>
                  <div className="noti-row">
                    <div className="noti-dot" aria-hidden="true">
                      📝
                    </div>
                    <div className="noti-body">
                      <div className="noti-strong">
                        Producción #{n.payload?.produccionId}
                        {n.payload?.receta ? ` — ${n.payload.receta}` : ''}
                      </div>
                      <div className="noti-text">{n.payload?.observacion || n.mensaje}</div>
                      <div className="noti-foot">
                        <button className="link" onClick={goToList}>
                          Ver historial
                        </button>
                        <button className="link" onClick={() => onMarkOne(n.id)}>
                          Marcar leída
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
