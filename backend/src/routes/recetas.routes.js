// src/routes/recetas.routes.js
const { Router } = require('express');
const ctrl = require('../controllers/recetas.controller');

const router = Router();

// Sanity check opcional en dev
if (process.env.NODE_ENV !== 'production') {
  const must = [
    'listar','detalle','crear','actualizar','eliminar','toggleEstado',
    'listarIngredientes','agregarIngrediente','actualizarIngrediente','eliminarIngrediente'
  ];
  for (const k of must) {
    if (typeof ctrl[k] !== 'function') {
      console.error(`[recetas.routes] Handler faltante o no-función: ${k} ->`, ctrl[k]);
    }
  }
}

// Recetas
router.get('/',           ctrl.listar);          // LIST
router.get('/:id',        ctrl.detalle);         // READ
router.post('/',          ctrl.crear);           // CREATE
router.put('/:id',        ctrl.actualizar);      // UPDATE
router.delete('/:id',     ctrl.eliminar);        // DELETE (soft/hard por query)
router.patch('/:id/estado', ctrl.toggleEstado);  // toggle estado

// Ingredientes (subrecurso)
router.get('/:id/ingredientes',    ctrl.listarIngredientes);
router.post('/:id/ingredientes',   ctrl.agregarIngrediente);
router.put('/ingredientes/:ingId', ctrl.actualizarIngrediente);
router.delete('/ingredientes/:ingId', ctrl.eliminarIngrediente);

module.exports = router;



