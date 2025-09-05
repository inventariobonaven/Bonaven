import api from "./client";

export const listarCultivos = (params = {}) =>
  api.get("/cultivos", { params });

export const alimentarCultivo = (id, payload) =>
  api.post(`/cultivos/${id}/feed`, payload);

export const ajustarCultivo = (id, payload) =>
  api.post(`/cultivos/${id}/ajuste`, payload);



