import { copyFileSync, existsSync } from 'fs';

const src = 'dist/index.html';
const dst = 'dist/404.html';

if (!existsSync(src)) {
  console.error('[spa-404] No se encontró dist/index.html (¿corriste el build?)');
  process.exit(1);
}

copyFileSync(src, dst);
console.log('[spa-404] 404.html generado a partir de index.html');
