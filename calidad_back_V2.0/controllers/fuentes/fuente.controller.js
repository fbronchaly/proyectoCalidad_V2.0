/**
 * fuente.controller.js
 * API REST para gestión de fuentes de datos
 */

const fuenteService = require('./fuente.service');

/**
 * GET /api/fuentes
 * Obtener todas las fuentes disponibles (Firebird + MongoDB)
 */
async function obtenerFuentes(req, res) {
  try {
    const fuentes = fuenteService.obtenerTodasLasFuentes();

    res.status(200).json({
      ok: true,
      fuentes: {
        firebird: fuentes.firebird.map(f => ({
          code: f.code,
          nombre: f.nombre,
          tipo: f.tipo
        })),
        mongo: fuentes.mongo.map(f => ({
          code: f.code,
          nombre: f.nombre,
          tipo: f.tipo,
          centro: f.centro
        })),
        total: fuentes.todas.length
      }
    });

  } catch (error) {
    console.error('Error en obtenerFuentes:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

/**
 * GET /api/fuentes/:tipo
 * Obtener fuentes por tipo (firebird o mongo)
 */
async function obtenerFuentesPorTipo(req, res) {
  try {
    const { tipo } = req.params;

    if (!['firebird', 'mongo'].includes(tipo)) {
      return res.status(400).json({
        ok: false,
        error: "Tipo debe ser 'firebird' o 'mongo'"
      });
    }

    const fuentes = fuenteService.obtenerFuentesPorTipo(tipo);

    res.status(200).json({
      ok: true,
      tipo,
      fuentes: fuentes.map(f => ({
        code: f.code,
        nombre: f.nombre,
        tipo: f.tipo,
        ...(tipo === 'mongo' && { centro: f.centro })
      }))
    });

  } catch (error) {
    console.error('Error en obtenerFuentesPorTipo:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

/**
 * GET /api/fuentes/detalle/:code
 * Obtener detalle de una fuente específica
 */
async function obtenerDetalleFuente(req, res) {
  try {
    const { code } = req.params;
    const fuente = fuenteService.buscarFuente(code);

    if (!fuente) {
      return res.status(404).json({
        ok: false,
        error: `Fuente ${code} no encontrada`
      });
    }

    res.status(200).json({
      ok: true,
      fuente: {
        code: fuente.code,
        nombre: fuente.nombre,
        tipo: fuente.tipo,
        ...(fuente.tipo === 'mongo' && { centro: fuente.centro })
      }
    });

  } catch (error) {
    console.error('Error en obtenerDetalleFuente:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

module.exports = {
  obtenerFuentes,
  obtenerFuentesPorTipo,
  obtenerDetalleFuente
};
