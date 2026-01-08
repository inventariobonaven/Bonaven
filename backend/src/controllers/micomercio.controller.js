// src/controllers/micomercio.controller.js
const axios = require('axios');

exports.testIngreso = async (_req, res) => {
  try {
    const payload = {
      IdUser: Number(process.env.MICOMERCIO_IDUSER),
      IdProduccion: Date.now(), // único para prueba
      details: [{ IdProducto: '442500', Cantidad: 1, Comentarios: 'test integración' }],
    };

    const response = await axios.post(`${process.env.MICOMERCIO_BASE_URL}/api/ingresos`, payload, {
      headers: {
        [process.env.MICOMERCIO_API_KEY_HEADER || 'x-api-key']: process.env.MICOMERCIO_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    return res.json({ ok: true, micomercio: response.data });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
  }
};
