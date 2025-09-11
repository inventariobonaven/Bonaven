import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = new URL('../dist/', import.meta.url).pathname;

try {
  // Asegura dist/ por si acaso
  mkdirSync(dist, { recursive: true });

  const src = new URL('../dist/index.html', import.meta.url).pathname;
  const dst = new URL('../dist/404.html',  import.meta.url).pathname;

  if (existsSync(src)) {
    copyFileSync(src, dst);
    console.log('[postbuild] 404.html generado a partir de index.html');
  } else {
    console.warn('[postbuild] No existe dist/index.html (¿falló el build?)');
  }
} catch (e) {
  console.error('[postbuild] Error generando 404.html:', e?.message || e);
  process.exit(1);
}
