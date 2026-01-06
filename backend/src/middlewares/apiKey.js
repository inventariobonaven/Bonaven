module.exports = function requireApiKey(req, res, next) {
  const expectedKey = process.env.INTEGRATION_API_KEY;

  if (!expectedKey) {
    return res.status(500).json({ message: 'API Key no configurada en el servidor' });
  }

  const providedKey = req.headers['x-api-key'];

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({ message: 'API Key inválida o ausente' });
  }

  next();
};
