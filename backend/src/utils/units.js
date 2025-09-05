// src/utils/units.js

/**
 * Utilidades de unidades (peso/volumen/unidades).
 * Diseñado para:
 *  - Mantener cada materia prima en SU unidad base (la que tenga en DB)
 *  - Convertir entradas (kg->g, l->ml, etc.) a la unidad base antes de guardar
 *  - Validar compatibilidad de categorías (no mezclar ml con g, etc.)
 *
 * Categorías:
 *  - WEIGHT  -> base: g
 *  - VOLUME  -> base: ml
 *  - COUNT   -> base: ud
 */

const TRIM = (s) => String(s || '').trim().toLowerCase();

/** Mapa de alias -> unidad canónica */
const ALIASES = {
  // peso
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g',
  kg: 'kg', kgs: 'kg', kilogramo: 'kg', kilogramos: 'kg',
  mg: 'mg', mgs: 'mg', miligramo: 'mg', miligramos: 'mg',

  // volumen
  ml: 'ml', 'mL': 'ml', cc: 'ml', cm3: 'ml', 'cm^3': 'ml',
  l: 'l', lt: 'l', litro: 'l', litros: 'l',

  // unidades
  ud: 'ud', uds: 'ud', unidad: 'ud', unidades: 'ud',
  pz: 'ud', pza: 'ud', pzas: 'ud', pieza: 'ud', piezas: 'ud',
  pcs: 'ud', pc: 'ud',
};

/**
 * Definición de unidades canónicas con:
 *  - cat: categoría
 *  - base: unidad base de la categoría
 *  - toBase: factor multiplicativo para convertir a base
 */
const UNIT_DEFS = {
  // Peso (base: g)
  g:  { cat: 'WEIGHT', base: 'g',  toBase: 1 },
  kg: { cat: 'WEIGHT', base: 'g',  toBase: 1000 },
  mg: { cat: 'WEIGHT', base: 'g',  toBase: 0.001 },

  // Volumen (base: ml)
  ml: { cat: 'VOLUME', base: 'ml', toBase: 1 },
  l:  { cat: 'VOLUME', base: 'ml', toBase: 1000 },

  // Conteo (base: ud)
  ud: { cat: 'COUNT',  base: 'ud', toBase: 1 },
};

/** Normaliza un string de unidad a su código canónico (g, kg, mg, ml, l, ud) o null si desconocida */
function normalizeUnit(unit) {
  if (!unit) return null;
  const k = TRIM(unit);
  // intenta match directo
  if (UNIT_DEFS[k]) return k;
  // intenta por alias
  return ALIASES[k] || null;
}

/** Retorna la categoría de una unidad ('WEIGHT' | 'VOLUME' | 'COUNT') o null */
function getCategory(unit) {
  const u = normalizeUnit(unit);
  return u ? UNIT_DEFS[u].cat : null;
}

/** Retorna la unidad base para la unidad dada ('g' | 'ml' | 'ud') o null */
function getBaseUnit(unit) {
  const u = normalizeUnit(unit);
  return u ? UNIT_DEFS[u].base : null;
}

/** ¿Pertenecen a la misma categoría? */
function areCompatible(u1, u2) {
  const c1 = getCategory(u1);
  const c2 = getCategory(u2);
  return !!c1 && c1 === c2;
}

/**
 * Convierte una cantidad entre dos unidades compatibles.
 * Devuelve un número JS. Lanza error si no son compatibles/desconocidas.
 */
function convert(qty, fromUnit, toUnit) {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (!from || !to) {
    throw new Error(`Unidad desconocida (from: ${fromUnit}, to: ${toUnit})`);
  }
  const defFrom = UNIT_DEFS[from];
  const defTo = UNIT_DEFS[to];
  if (defFrom.cat !== defTo.cat) {
    throw new Error(`Unidades incompatibles (${fromUnit} → ${toUnit})`);
  }
  // pasa a base y luego a destino
  const qtyInBase = Number(qty) * defFrom.toBase;
  const qtyTo = qtyInBase / defTo.toBase;
  return Number.isFinite(qtyTo) ? qtyTo : 0;
}

/** Convierte cantidad a la unidad base de su categoría (g/ml/ud) según la propia unidad dada */
function toBase(qty, unit) {
  const u = normalizeUnit(unit);
  if (!u) throw new Error(`Unidad desconocida: ${unit}`);
  const base = UNIT_DEFS[u].base;
  return convert(qty, u, base);
}

/** Convierte desde la unidad base de una categoría a otra unidad de la MISMA categoría */
function fromBase(qtyBase, targetUnit) {
  const tu = normalizeUnit(targetUnit);
  if (!tu) throw new Error(`Unidad objetivo desconocida: ${targetUnit}`);
  const base = UNIT_DEFS[tu].base;
  return convert(qtyBase, base, tu);
}

/**
 * Convierte una cantidad ingresada en 'inputUnit' a la UNIDAD BASE de la materia prima,
 * donde mpUnit es la unidad configurada para la MP (p.ej. "gr", "g", "kg", "ml", "ud"...).
 *
 * Si inputUnit no viene, se asume que ya viene en unidad de la MP (mpUnit).
 * Lanza error 400-friendly si las categorías no coinciden.
 */
function coerceToMpBase(qty, inputUnit, mpUnit) {
  const mpNorm = normalizeUnit(mpUnit);
  if (!mpNorm) {
    throw new Error(`Unidad de la materia prima no reconocida: ${mpUnit}`);
  }
  const mpBase = UNIT_DEFS[mpNorm].base;

  // si no especifican unidad de entrada, asumimos que viene en la unidad de la MP
  const inNorm = inputUnit ? normalizeUnit(inputUnit) : mpNorm;
  if (!inNorm) {
    throw new Error(`Unidad de entrada no reconocida: ${inputUnit}`);
  }

  if (!areCompatible(inNorm, mpNorm)) {
    throw new Error(
      `Unidad incompatible: la MP usa "${mpUnit}" (${getCategory(mpUnit)}), pero el lote/ajuste viene en "${inputUnit}" (${getCategory(inputUnit)}).`
    );
  }

  // convertir a la base de la MP
  const asBase = convert(qty, inNorm, mpBase);
  return { qtyBase: asBase, mpBase, inNorm, mpNorm };
}

module.exports = {
  normalizeUnit,
  getCategory,
  getBaseUnit,
  areCompatible,
  convert,
  toBase,
  fromBase,
  coerceToMpBase,
};


