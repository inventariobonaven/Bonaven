import api from './client'; // tu axios instance

// Si api.baseURL termina en /api, usa rutas sin /api aquí:
export function fetchNotificaciones({
  unreadOnly = true,
  tipo = 'OBS_PRODUCCION',
  limit = 20,
} = {}) {
  const params = new URLSearchParams();
  params.set('unreadOnly', String(unreadOnly));
  if (tipo) params.set('tipo', tipo);
  params.set('limit', String(limit));
  return api.get(`/notificaciones?${params.toString()}`);
}
export function markNotificacionRead(id) {
  return api.patch(`/notificaciones/${id}/read`);
}
export function markAllNotificacionesRead() {
  return api.post(`/notificaciones/mark-all-read`);
}

// Si tu api.baseURL NO incluye /api, cambia las líneas anteriores a:
// return api.get(`/api/notificaciones?...`)
// return api.patch(`/api/notificaciones/${id}/read`)
// return api.post(`/api/notificaciones/mark-all-read`)
