// src/api/cultivos.js
import api from './client';

// Lista los "cultivos" (MP con tipo=CULTIVO) – tu backend ya lo expone en /cultivos
export function listarCultivos(params = {}) {
  return api.get('/cultivos', { params });
}

// Alimentación de un cultivo (descuenta harina por FIFO)
export function alimentarCultivo(id, payload) {
  return api.post(`/cultivos/${id}/feed`, payload);
}
