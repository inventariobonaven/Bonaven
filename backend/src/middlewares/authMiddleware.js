// src/middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

module.exports = function (req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ msg: 'No hay token, autorización denegada' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded.user; // payload que guardamos en el login
    next();
  } catch (error) {
    res.status(401).json({ msg: 'Token no válido' });
  }
  function requireRole(...roles) {
  return (req, res, next) => {
    try {
      const rol = String(req.user?.rol || '').toUpperCase(); // ADMIN | PRODUCCION
      if (!roles.map(r => r.toUpperCase()).includes(rol)) {
        return res.status(403).json({ message: 'No tienes permisos para esta acción' });
      }
      next();
    } catch (e) {
      return res.status(401).json({ message: 'No autenticado' });
    }
  };
}


module.exports = { requireRole };

};


