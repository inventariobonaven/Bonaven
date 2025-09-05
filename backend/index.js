// index.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const app = express();
dotenv.config();

/* ---------------- CORS ---------------- */
const DEFAULT_ORIGINS = ['http://localhost:5173'];
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const ORIGINS = ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : DEFAULT_ORIGINS;

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ORIGINS.includes(origin) || /localhost:\d+$/i.test(origin)) return cb(null, true);
    return cb(new Error(`CORS: Origin ${origin} no permitido`));
  },
  credentials: true,
};
app.use(cors(corsOptions));

/* ----------- Middlewares ------------ */
app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

/* --------------- Rutas --------------- */
const proveedoresRoutes       = require('./src/routes/proveedores.routes');
const authRoutes              = require('./src/routes/auth.routes');
const usuariosRoutes          = require('./src/routes/usuarios.routes');
const materiasPrimasRoutes    = require('./src/routes/materiasPrimas.routes');
const lotesMateriaPrimaRoutes = require('./src/routes/lotesMateriaPrima.routes');
const movimientosMpRoutes     = require('./src/routes/movimientosMateriaPrima.routes');
const recetasRoutes           = require('./src/routes/recetas.routes');
const recetaProductoMapRoutes = require('./src/routes/recetaProductoMap.routes');
const productosRoutes         = require('./src/routes/productos.routes');
const produccionRoutes        = require('./src/routes/produccion.routes');
const categoriasRecetaRoutes  = require('./src/routes/categoriasReceta.routes');
const empaquesRoutes          = require('./src/routes/empaques.routes');

// pt.routes debe exportar { api, alias }
const { api: ptApiRoutes, alias: ptAliasRoutes } = require('./src/routes/pt.routes');
const cultivosRoutes = require('./src/routes/cultivos.routes');





/* ====== Montaje ====== */
// Alias que espera el frontend (con /api)
app.use('/api/stock-pt', ptAliasRoutes);

// (Opcional) Alias adicional sin /api para herramientas manuales
app.use('/stock-pt', ptAliasRoutes);

// API formal de PT
app.use('/api/pt', ptApiRoutes);

// Empaques / Productos / Recetas / Producción
app.use('/api/empaques',              empaquesRoutes);
app.use('/api/produccion',            produccionRoutes);
app.use('/api/productos',             productosRoutes);
app.use('/api/recetas',               recetasRoutes);
app.use('/api/recetas',               recetaProductoMapRoutes);
app.use('/api/categorias-receta',     categoriasRecetaRoutes);
app.use('/api/cultivos', cultivosRoutes);
// Auth y maestros
app.use('/api/auth',                  authRoutes);
app.use('/api/proveedores',           proveedoresRoutes);
app.use('/api/usuarios',              usuariosRoutes);
app.use('/api/materias-primas',       materiasPrimasRoutes);
app.use('/api/lotes-materia-prima',   lotesMateriaPrimaRoutes);
app.use('/api/movimientos-mp',        movimientosMpRoutes);

// Healthchecks
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => res.send('API funcionando 🚀'));

/* ------ 404 y manejador de errores --- */
app.use((req, res, _next) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err?.message || err);
  res.status(500).json({ message: err?.message || 'Error interno del servidor' });
});

/* --------------- Server -------------- */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`CORS orígenes permitidos: ${ORIGINS.join(', ')}`);
});



