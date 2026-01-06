const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');

// Carga .env por defecto, o .env.sandbox si NODE_ENV=sandbox, o el que pases por ENV_FILE
const envFile =
  process.env.ENV_FILE || (process.env.NODE_ENV === 'sandbox' ? '.env.sandbox' : '.env');

dotenv.config({ path: path.resolve(__dirname, envFile) });

const app = express();

/* ---------------- CORS ---------------- */
const DEFAULT_ORIGINS = ['http://localhost:5173'];
const ENV_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// Render / Vercel hints
const RENDER_URL = (process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
const VERCEL_URL = (process.env.VERCEL_URL || '').replace(/\/+$/, ''); // e.g. myapp.vercel.app
if (VERCEL_URL && !ENV_ORIGINS.includes(`https://${VERCEL_URL}`)) {
  ENV_ORIGINS.push(`https://${VERCEL_URL}`);
}
if (RENDER_URL && !ENV_ORIGINS.includes(RENDER_URL)) {
  ENV_ORIGINS.push(RENDER_URL);
}

const ORIGINS = ENV_ORIGINS.length ? ENV_ORIGINS : DEFAULT_ORIGINS;

// Patrones permitidos además de la lista explícita
const ORIGIN_PATTERNS = [
  /localhost:\d+$/i,
  /^https?:\/\/([a-z0-9-]+\.)*vercel\.app$/i,
  /^https?:\/\/([a-z0-9-]+\.)*onrender\.com$/i,
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // same-host / curl sin Origin
  if (ORIGINS.includes(origin)) return true;
  return ORIGIN_PATTERNS.some((rx) => rx.test(origin));
}

const corsOptions = {
  origin(origin, cb) {
    return isAllowedOrigin(origin)
      ? cb(null, true)
      : cb(new Error(`CORS: Origin ${origin} no permitido`));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// CORS global + preflight
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/* ----------- Middlewares ------------ */
app.set('trust proxy', true); // Render/Vercel
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

/* --------------- Rutas --------------- */
const proveedoresRoutes = require('./src/routes/proveedores.routes');
const authRoutes = require('./src/routes/auth.routes');
const usuariosRoutes = require('./src/routes/usuarios.routes');
const materiasPrimasRoutes = require('./src/routes/materiasPrimas.routes');
const lotesMateriaPrimaRoutes = require('./src/routes/lotesMateriaPrima.routes');
const movimientosMpRoutes = require('./src/routes/movimientosMateriaPrima.routes');
const recetasRoutes = require('./src/routes/recetas.routes');
const recetaProductoMapRoutes = require('./src/routes/recetaProductoMap.routes');
const productosRoutes = require('./src/routes/productos.routes');
const produccionRoutes = require('./src/routes/produccion.routes');
const categoriasRecetaRoutes = require('./src/routes/categoriasReceta.routes');
const empaquesRoutes = require('./src/routes/empaques.routes');
const notificacionesRoutes = require('./src/routes/notificaciones.routes');
const { api: ptApiRoutes, alias: ptAliasRoutes } = require('./src/routes/pt.routes');
const cultivosRoutes = require('./src/routes/cultivos.routes');

// Integraciones externas
const integracionesRoutes = require('./src/routes/integraciones.routes');

/* ====== Montaje ====== */
app.use('/api/stock-pt', ptAliasRoutes);
app.use('/stock-pt', ptAliasRoutes);
app.use('/api/pt', ptApiRoutes);

app.use('/api/empaques', empaquesRoutes);
app.use('/api/produccion', produccionRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/recetas', recetasRoutes);
app.use('/api/recetas', recetaProductoMapRoutes);
app.use('/api/categorias-receta', categoriasRecetaRoutes);
app.use('/api/cultivos', cultivosRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/materias-primas', materiasPrimasRoutes);
app.use('/api/lotes-materia-prima', lotesMateriaPrimaRoutes);
app.use('/api/movimientos-mp', movimientosMpRoutes);

app.use('/api/notificaciones', notificacionesRoutes);

//  Integración facturación
app.use('/api/integraciones', integracionesRoutes);

/* ------ Health/diag ------ */
app.get('/api/__ping', (_req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || null,
    commit: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || null,
    origins: ORIGINS,
  });
});
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/', (_req, res) => res.send('API funcionando 🚀'));

/* ------ 404 y manejador de errores --- */
app.use((req, res, _next) => {
  res.status(404).json({ message: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err?.message || err);
  const status = /CORS: Origin/.test(err?.message) ? 403 : 500;
  res.status(status).json({ message: err?.message || 'Error interno del servidor' });
});

/* --------------- Server -------------- */
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  console.log(`CORS orígenes permitidos (EXP): ${ORIGINS.join(', ') || '(default localhost)'}`);
});
