/**
 * indicador.service.js
 * Servicio de lógica de negocio para ejecución de indicadores
 */

const IndicadorEngineFactory = require('./indicadorEngine.factory');
const fs = require('fs').promises;
const path = require('path');

class IndicadorService {
  constructor() {
    this.indicadoresFirebird = null;
    this.indicadoresMongo = null;
  }

  /**
   * Cargar catálogo de indicadores desde archivos JSON
   */
  async cargarIndicadores() {
    try {
      // Cargar indicadores Firebird (existentes)
      const pathFirebird = path.join(__dirname, '../../models/indicadores/indicadores_firebird.json');
      const dataFirebird = await fs.readFile(pathFirebird, 'utf-8');
      this.indicadoresFirebird = JSON.parse(dataFirebird);

      // Cargar indicadores MongoDB (nuevos)
      const pathMongo = path.join(__dirname, '../../models/indicadores/indicadores_mongo.json');
      const dataMongo = await fs.readFile(pathMongo, 'utf-8');
      this.indicadoresMongo = JSON.parse(dataMongo);

      console.log(`✅ Indicadores cargados: ${this.indicadoresFirebird.length} Firebird, ${this.indicadoresMongo.length} Mongo`);
    } catch (error) {
      console.error('❌ Error cargando indicadores:', error.message);
      throw error;
    }
  }

  /**
   * Obtener indicador por ID
   * @param {string} idCode - ID del indicador
   * @param {string} tipoFuente - 'firebird' | 'mongo'
   */
  buscarIndicador(idCode, tipoFuente) {
    const catalogo = tipoFuente === 'mongo' 
      ? this.indicadoresMongo 
      : this.indicadoresFirebird;

    return catalogo.find(ind => ind.id_code === idCode);
  }

  /**
   * Obtener todos los indicadores de un tipo
   */
  obtenerIndicadoresPorTipo(tipoFuente) {
    return tipoFuente === 'mongo' 
      ? this.indicadoresMongo 
      : this.indicadoresFirebird;
  }

  /**
   * Ejecutar un único indicador
   * @param {Object} params - { indicadorId, fuente, fechaInicio, fechaFin }
   */
  async ejecutarIndicador(params) {
    const { indicadorId, fuente, fechaInicio, fechaFin } = params;

    // Detectar tipo de fuente
    const { tipo: tipoFuente } = IndicadorEngineFactory.detectarTipoFuente(fuente.code);

    // Buscar indicador
    const indicador = this.buscarIndicador(indicadorId, tipoFuente);
    if (!indicador) {
      throw new Error(`Indicador ${indicadorId} no encontrado para fuente tipo ${tipoFuente}`);
    }

    // Validar compatibilidad
    if (!IndicadorEngineFactory.validarCompatibilidad(indicador, tipoFuente)) {
      throw new Error(`Indicador ${indicadorId} no es compatible con fuente tipo ${tipoFuente}`);
    }

    // Crear engine apropiado
    const engine = IndicadorEngineFactory.crearEngine(tipoFuente, fuente.config);

    // Validar conexión
    const conexionValida = await engine.validarConexion();
    if (!conexionValida) {
      throw new Error(`No se pudo conectar a la fuente ${fuente.code}`);
    }

    // Ejecutar indicador
    const resultado = await engine.ejecutarIndicador(indicador, {
      fechaInicio,
      fechaFin,
      code: fuente.code,
      centro: fuente.centro
    });

    // Cerrar conexión
    await engine.cerrar();

    return resultado;
  }

  /**
   * Ejecutar múltiples indicadores sobre múltiples fuentes
   * @param {Object} params - { indicadores: [], fuentes: [], fechaInicio, fechaFin }
   */
  async ejecutarIndicadoresMasivo(params) {
    const { indicadores, fuentes, fechaInicio, fechaFin } = params;
    const resultados = [];

    for (const fuente of fuentes) {
      const { tipo: tipoFuente } = IndicadorEngineFactory.detectarTipoFuente(fuente.code);

      for (const indicadorId of indicadores) {
        try {
          const resultado = await this.ejecutarIndicador({
            indicadorId,
            fuente,
            fechaInicio,
            fechaFin
          });

          resultados.push(resultado);
        } catch (error) {
          console.error(`Error ejecutando ${indicadorId} en ${fuente.code}:`, error.message);
          resultados.push({
            code: fuente.code,
            resultado: null,
            numero_pacientes: 0,
            error: error.message,
            metadata: {
              indicador: indicadorId,
              fuente: fuente.code,
              tipo: tipoFuente
            }
          });
        }
      }
    }

    return resultados;
  }

  /**
   * Validar compatibilidad entre fuentes seleccionadas
   * Evita comparar Firebird vs Mongo si no tiene sentido
   */
  validarComparacion(fuentes) {
    if (fuentes.length < 2) {
      return { valida: true };
    }

    const tipos = fuentes.map(f => IndicadorEngineFactory.detectarTipoFuente(f.code).tipo);
    const tiposUnicos = [...new Set(tipos)];

    // Si hay mezcla de tipos, advertir
    if (tiposUnicos.length > 1) {
      return {
        valida: true,
        advertencia: 'Comparando fuentes de diferentes tipos (Firebird vs MongoDB). Asegúrese de que los indicadores sean comparables.'
      };
    }

    return { valida: true };
  }
}

module.exports = new IndicadorService();
