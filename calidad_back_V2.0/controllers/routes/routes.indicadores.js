/**
 * routes.indicadores.js
 * Rutas API para el motor de indicadores híbrido
 */

const express = require('express');
const router = express.Router();
const indicadorController = require('../controllers/indicadores/indicador.controller');
const fuenteController = require('../controllers/fuentes/fuente.controller');

// ========================================
// RUTAS DE FUENTES DE DATOS
// ========================================

/**
 * GET /api/fuentes
 * Obtener todas las fuentes disponibles (Firebird + MongoDB)
 */
router.get('/fuentes', fuenteController.obtenerFuentes);

/**
 * GET /api/fuentes/:tipo
 * Obtener fuentes por tipo (firebird o mongo)
 */
router.get('/fuentes/:tipo', fuenteController.obtenerFuentesPorTipo);

/**
 * GET /api/fuentes/detalle/:code
 * Obtener detalle de una fuente específica
 */
router.get('/fuentes/detalle/:code', fuenteController.obtenerDetalleFuente);

// ========================================
// RUTAS DE INDICADORES
// ========================================

/**
 * POST /api/indicadores/ejecutar
 * Ejecutar indicadores sobre múltiples fuentes
 */
router.post('/indicadores/ejecutar', indicadorController.ejecutarIndicadores);

/**
 * GET /api/indicadores/catalogo/:tipo
 * Obtener catálogo de indicadores (firebird, mongo o all)
 */
router.get('/indicadores/catalogo/:tipo', indicadorController.obtenerCatalogo);

/**
 * POST /api/indicadores/validar-compatibilidad
 * Validar compatibilidad entre fuentes para comparación
 */
router.post('/indicadores/validar-compatibilidad', indicadorController.validarCompatibilidad);

module.exports = router;
