// src/middlewares/apiKey.js
module.exports = function requireApiKey(req, res, next) {
  // 👇 Lee la key que SÍ tienes en .env
  const expectedKey = (process.env.INTEGRATION_API_KEY || process.env.API_KEY_PT || '').trim();

  if (!expectedKey) {
    return res.status(500).json({
      message: 'API Key no configurada en el servidor',
    });
  }

  const providedKey = String(req.headers['x-api-key'] || '').trim();

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({
      message: 'API Key inválida o ausente',
    });
  }

  next();
};
