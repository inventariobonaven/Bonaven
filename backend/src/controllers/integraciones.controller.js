// src/controllers/integraciones.controller.js (o donde lo tengas)
const prisma = require('../database/prismaClient');

/* === helpers decimal milésimas === */
const toM = (v) => Math.round(Number(v) * 1000);
const fromM = (m) => (m / 1000).toFixed(3);

/* === helper fecha local (YYYY-MM-DD no se vuelve UTC) === */
function toDateOrNow(input) {
  if (input === undefined || input === null) return new Date();
  const s = String(input).trim();

  // YYYY-MM-DD -> local 00:00 (NO UTC)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
  }

  const d = new Date(s);
  return isNaN(d) ? new Date() : d;
}

const VENTAS_ETAPAS = ['EMPAQUE', 'HORNEO'];

/**
 * SALIDA PT DESDE FACTURA (soporta items)
 *
 * Body:
 * {
 *   "factura_id": "FAC-003",
 *   "fecha": "2026-01-06",
 *   "items": [
 *     { "producto_id": 2, "paquetes": 4 },
 *     { "producto_id": 5, "cantidad": 10, "unidad": "UNIDAD" },
 *     { "producto_id": 7, "cantidad": 3, "unidad": "PAQUETE" }
 *   ]
 * }
 *
 * Reglas:
 * - Siempre descuenta EN UNIDADES internamente.
 * - Si el producto tiene unidades_por_empaque > 0:
 *    - Si no envían unidad y envían "cantidad", exigimos múltiplo de unidades_por_empaque
 *      para evitar el caso inconsistente de “4” cuando realmente eran “4 paquetes”.
 * - "paquetes" o unidad="PAQUETE" convierten a unidades.
 * - unidad="UNIDAD" deja la cantidad como unidades.
 */
exports.salidaPTDesdeFactura = async (req, res) => {
  try {
    const { factura_id, fecha, items } = req.body;

    if (!factura_id) return res.status(400).json({ message: 'factura_id es obligatorio' });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'items es obligatorio y debe ser un arreglo' });
    }

    // Evitar doble descuento por la misma factura (a nivel factura completa)
    const yaProcesada = await prisma.stock_producto_terminado.findFirst({
      where: {
        tipo: 'SALIDA',
        ref_tipo: 'FACTURA',
        motivo: `FACTURA:${factura_id}`,
      },
      select: { id: true },
    });
    if (yaProcesada) {
      return res.json({
        ok: true,
        message: 'Factura ya procesada anteriormente',
        factura_id,
      });
    }

    const when = toDateOrNow(fecha);

    const result = await prisma.$transaction(async (tx) => {
      const descuentos = [];

      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx] || {};

        // ✅ Aceptar producto_id o micomercio_id
        const productoIdBody = Number(it.producto_id || 0);
        const micomercioIdBody =
          it.micomercio_id !== undefined && it.micomercio_id !== null && it.micomercio_id !== ''
            ? Number(it.micomercio_id)
            : null;

        if (!productoIdBody && !micomercioIdBody) {
          throw new Error(`items[${idx}].producto_id o items[${idx}].micomercio_id es obligatorio`);
        }

        // ✅ Resolver productoId final
        let productoId = productoIdBody;

        if (!productoId && micomercioIdBody) {
          const prod = await tx.productos_terminados.findUnique({
            where: { micomercio_id: micomercioIdBody },
            select: { id: true },
          });
          if (!prod) throw new Error(`No existe producto con micomercio_id=${micomercioIdBody}`);
          productoId = prod.id;
        }

        // ✅ A partir de aquí tu código sigue igual:
        const producto = await tx.productos_terminados.findUnique({
          where: { id: productoId },
          select: { id: true, nombre: true, estado: true, unidades_por_empaque: true },
        });

        if (!producto || producto.estado === false) {
          throw new Error(`Producto ${productoId} no encontrado o inactivo`);
        }

        const uxe = Number(producto.unidades_por_empaque || 0);
        const unidad = String(it.unidad || '')
          .trim()
          .toUpperCase(); // "PAQUETE" | "UNIDAD" | ""

        // ---- Resolver cantidad FINAL en UNIDADES
        let cantidadFinal; // número en unidades
        const paquetes =
          it.paquetes !== undefined && it.paquetes !== null ? Number(it.paquetes) : null;
        const cantidad =
          it.cantidad !== undefined && it.cantidad !== null ? Number(it.cantidad) : null;

        // Validación base: debe venir algo
        if (!(paquetes > 0) && !(cantidad > 0)) {
          throw new Error(`items[${idx}] debe enviar paquetes o cantidad (>0)`);
        }

        // 1) Si mandan paquetes explícito
        if (paquetes > 0) {
          if (!(uxe > 0)) {
            throw new Error(
              `Producto ${productoId} no tiene unidades_por_empaque; no se puede usar "paquetes".`,
            );
          }
          cantidadFinal = paquetes * uxe;
        }
        // 2) Si mandan cantidad + unidad=PAQUETE (cantidad son paquetes)
        else if (cantidad > 0 && unidad === 'PAQUETE') {
          if (!(uxe > 0)) {
            throw new Error(
              `Producto ${productoId} no tiene unidades_por_empaque; no se puede usar unidad="PAQUETE".`,
            );
          }
          cantidadFinal = cantidad * uxe;
        }
        // 3) cantidad como UNIDADES (si unidad="UNIDAD" o vacío)
        else if (cantidad > 0) {
          cantidadFinal = cantidad;

          // Anti-inconsistencia:
          // Si el producto se maneja por paquetes (uxe>0) y NO especificaron unidad="UNIDAD",
          // exigimos múltiplo de uxe para evitar que "4" se interprete como 4 unidades
          // cuando realmente eran 4 paquetes.
          if (uxe > 0 && unidad !== 'UNIDAD') {
            if (cantidadFinal % uxe !== 0) {
              throw new Error(
                `Inconsistencia en items[${idx}] (producto ${productoId}). ` +
                  `Este producto se maneja por paquetes de ${uxe} und. ` +
                  `Envía "paquetes" o unidad:"PAQUETE". ` +
                  `Si realmente son unidades sueltas, envía unidad:"UNIDAD".`,
              );
            }
          }
        }

        // Normaliza a milésimas (Decimal(18,3))
        const qtyM = toM(cantidadFinal);
        if (!(qtyM > 0)) {
          throw new Error(`items[${idx}] cantidad final inválida`);
        }

        // ---- FIFO por lotes vendibles, NO vencidos
        let restanteM = qtyM;

        const lotes = await tx.lotes_producto_terminado.findMany({
          where: {
            producto_id: productoId,
            estado: 'DISPONIBLE',
            etapa: { in: VENTAS_ETAPAS },
            OR: [{ fecha_vencimiento: null }, { fecha_vencimiento: { gte: when } }],
            cantidad: { gt: 0 },
          },
          orderBy: [{ fecha_vencimiento: 'asc' }, { fecha_ingreso: 'asc' }, { id: 'asc' }],
          select: { id: true, cantidad: true, producto_id: true },
        });

        for (const lote of lotes) {
          if (restanteM <= 0) break;

          const disponibleM = toM(lote.cantidad);
          const usarM = Math.min(disponibleM, restanteM);

          if (usarM > 0) {
            // Movimiento SALIDA
            await tx.stock_producto_terminado.create({
              data: {
                producto_id: productoId,
                lote_id: lote.id,
                tipo: 'SALIDA',
                cantidad: fromM(usarM),
                fecha: when,
                ref_tipo: 'FACTURA',
                motivo: `FACTURA:${factura_id}`,
              },
            });

            // Descontar del lote
            const nuevoStockM = disponibleM - usarM;
            await tx.lotes_producto_terminado.update({
              where: { id: lote.id },
              data: {
                cantidad: fromM(nuevoStockM),
                estado: nuevoStockM === 0 ? 'AGOTADO' : 'DISPONIBLE',
              },
            });

            restanteM -= usarM;
          }
        }

        if (restanteM > 0) {
          throw new Error(
            `Stock insuficiente para producto ${productoId}. Faltan ${fromM(restanteM)} unidades.`,
          );
        }

        // Recalcular stock_total vendible del producto
        const sum = await tx.lotes_producto_terminado.aggregate({
          where: {
            producto_id: productoId,
            estado: { in: ['DISPONIBLE', 'RESERVADO'] },
            etapa: { in: VENTAS_ETAPAS },
          },
          _sum: { cantidad: true },
        });

        await tx.productos_terminados.update({
          where: { id: productoId },
          data: { stock_total: sum._sum.cantidad ?? 0 },
        });

        descuentos.push({
          producto_id: productoId,
          cantidad_unidades: fromM(qtyM),
          interpretacion:
            paquetes > 0
              ? `paquetes:${paquetes} -> unidades:${cantidadFinal}`
              : unidad === 'PAQUETE'
                ? `cantidad(paquetes):${cantidad} -> unidades:${cantidadFinal}`
                : `cantidad(unidades):${cantidadFinal}`,
        });
      }

      return descuentos;
    });

    return res.json({
      ok: true,
      message: 'Salida registrada correctamente (FACTURA)',
      factura_id,
      fecha: when.toISOString(),
      items_procesados: result,
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};
