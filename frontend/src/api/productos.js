// src/api/productos.js
import client from './client';

// Listar productos (filtros opcionales: q?, estado?)
export const listarProductos = (params = {}) =>
  client.get('/productos', { params });

// Crear producto terminado
export const crearProducto = (payload) =>
  client.post('/productos', payload);

// Actualizar producto terminado
export const actualizarProducto = (id, payload) =>
  client.put(`/productos/${id}`, payload);

// Cambiar estado (activar/desactivar)
export const toggleEstadoProducto = (id, estado) =>
  client.patch(`/productos/${id}/estado`, { estado });

// (opcional) traer empaques para el select
export const listarEmpaques = (params = {}) =>
  client.get('/empaques', { params });


