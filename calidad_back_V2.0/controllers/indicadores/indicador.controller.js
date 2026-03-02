/**
 * indicador.controller.js
 * API REST para ejecución de indicadores híbridos (Firebird + MongoDB)
 */

const indicadorService = require('./indicador.service');

/**
 * POST /api/indicadores/ejecutar
 * Ejecutar indicadores sobre múltiples fuentes
 */
async function ejecutarIndicadores(req, res) {
  try {
    const { indicadores, fuentes, fechaInicio, fechaFin } = req.body;

    // Validaciones
    if (!indicadores || !Array.isArray(indicadores) || indicadores.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Debe proporcionar al menos un indicador'
      });
    }

    if (!fuentes || !Array.isArray(fuentes) || fuentes.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Debe proporcionar al menos una fuente de datos'
      });
    }

    if (!fechaInicio || !fechaFin) {
      return res.status(400).json({
        ok: false,
        error: 'Las fechas de inicio y fin son obligatorias'
      });
    }

    // Validar compatibilidad de comparación
    const validacion = indicadorService.validarComparacion(fuentes);
    
    // Ejecutar indicadores
    const resultados = await indicadorService.ejecutarIndicadoresMasivo({
      indicadores,
      fuentes,
      fechaInicio,
      fechaFin
    });

    res.status(200).json({
      ok: true,
      resultados,
      advertencia: validacion.advertencia,
      metadata: {
        total_indicadores: indicadores.length,
        total_fuentes: fuentes.length,
        total_resultados: resultados.length,
        periodo: { fechaInicio, fechaFin }
      }
    });

  } catch (error) {
    console.error('Error en ejecutarIndicadores:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

/**
 * GET /api/indicadores/catalogo/:tipo
 * Obtener catálogo de indicadores por tipo
 */
async function obtenerCatalogo(req, res) {
  try {
    const { tipo } = req.params; // 'firebird' | 'mongo' | 'all'

    if (!['firebird', 'mongo', 'all'].includes(tipo)) {
      return res.status(400).json({
        ok: false,
        error: "Tipo debe ser 'firebird', 'mongo' o 'all'"
      });
    }

    let indicadores;
    if (tipo === 'all') {
      indicadores = {
        firebird: indicadorService.obtenerIndicadoresPorTipo('firebird'),
        mongo: indicadorService.obtenerIndicadoresPorTipo('mongo')
      };
    } else {
      indicadores = indicadorService.obtenerIndicadoresPorTipo(tipo);
    }

    res.status(200).json({
      ok: true,
      tipo,
      indicadores
    });

  } catch (error) {
    console.error('Error en obtenerCatalogo:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

/**
 * POST /api/indicadores/validar-compatibilidad
 * Validar si un conjunto de fuentes es compatible para comparación
 */
async function validarCompatibilidad(req, res) {
  try {
    const { fuentes } = req.body;

    if (!fuentes || !Array.isArray(fuentes)) {
      return res.status(400).json({
        ok: false,
        error: 'Debe proporcionar un array de fuentes'
      });
    }

    const validacion = indicadorService.validarComparacion(fuentes);

    res.status(200).json({
      ok: true,
      ...validacion
    });

  } catch (error) {
    console.error('Error en validarCompatibilidad:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
}

module.exports = {
  ejecutarIndicadores,
  obtenerCatalogo,
  validarCompatibilidad
};
