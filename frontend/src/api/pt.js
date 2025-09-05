// src/api/pt.js
import client from './client';

/* ---------- PT (lotes, movimientos, ventas) ---------- */

// Listar lotes PT (filtros: producto_id?, etapa? CONGELADO|EMPAQUE|HORNEO, q?)
export const listarLotesPT = (params = {}) =>
  client.get('/pt/lotes', { params });

// Atajo para Congelados (etapa=CONGELADO + q opcional)
export const fetchCongelados = ({ q } = {}) =>
  listarLotesPT({ etapa: 'CONGELADO', q });

// Ingreso manual de PT (etapa EMPAQUE; descuenta bolsas si aplica)
export const ingresarPT = (payload) =>
  client.post('/pt/ingresos', payload);

// Salida PT (vende solo etapas vendibles)
export const salidaPT = (payload) =>
  client.post('/pt/salidas', payload);

// Mover etapa: CONGELADO -> EMPAQUE | HORNEO
// Soporta: moverEtapa(loteId, payload)  o  moverEtapa({ lote_id, ... })
export const moverEtapa = (arg1, arg2) => {
  if (typeof arg1 === 'object' && arg1) {
    const { lote_id, ...rest } = arg1;
    if (!lote_id) throw new Error('lote_id es requerido');
    return client.patch(`/pt/lotes/${lote_id}/etapa`, rest);
  }
  const loteId = arg1;
  const payload = arg2 || {};
  return client.patch(`/pt/lotes/${loteId}/etapa`, payload);
};

// Movimientos PT
export const listarMovimientosPT = (params = {}) =>
  client.get('/pt/movimientos', { params });

/* ---------- Producción (cálculo + registro) ---------- */

export const calcularProduccion = (payload) =>
  client.post('/produccion/calcular', payload);

export const registrarProduccion = (payload) =>
  client.post('/produccion', payload);

export const listarProducciones = (params = {}) =>
  client.get('/produccion', { params });

export const detalleProduccion = (id) =>
  client.get(`/produccion/${id}`);

export const insumosProduccion = (id) =>
  client.get(`/produccion/${id}/insumos`);

/* ---------- Receta ↔ Producto (map de rendimientos/vencimientos) ---------- */

export const listarMapPorReceta = (recetaId) =>
  client.get(`/recetas/${recetaId}/productos-map`);

export const crearMap = (recetaId, payload) =>
  client.post(`/recetas/${recetaId}/productos-map`, payload);
// payload: { producto_id, unidades_por_batch, vida_util_dias, vencimiento_base }

export const actualizarMap = (mapId, payload) =>
  client.put(`/recetas/productos-map/${mapId}`, payload);

export const eliminarMap = (mapId) =>
  client.delete(`/recetas/productos-map/${mapId}`);



