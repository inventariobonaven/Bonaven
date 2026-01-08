// src/services/micomercio.services.js

async function postIngreso(payload) {
  const baseUrl = process.env.MICOMERCIO_BASE_URL;
  const apiKey = process.env.MICOMERCIO_API_KEY;
  const apiKeyHeader = process.env.MICOMERCIO_API_KEY_HEADER || 'x-api-key';

  if (!baseUrl) throw new Error('Falta MICOMERCIO_BASE_URL en .env');
  if (!apiKey) throw new Error('Falta MICOMERCIO_API_KEY en .env');

  const url = `${baseUrl.replace(/\/$/, '')}/api/ingresos`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [apiKeyHeader]: apiKey,
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = { message: 'Respuesta no JSON', raw: await res.text().catch(() => '') };
  }

  if (!res.ok) {
    const err = new Error(`MiComercio HTTP ${res.status}`);
    err.status = res.status;
    err.response = data;
    throw err;
  }

  return { status: res.status, data };
}

module.exports = { postIngreso };
