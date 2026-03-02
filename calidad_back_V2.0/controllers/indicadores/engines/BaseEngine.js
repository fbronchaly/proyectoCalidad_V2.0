/**
 * BaseEngine.js
 * Clase abstracta base para todos los engines de ejecución de indicadores
 * Implementa el patrón Strategy
 */

class BaseEngine {
  /**
   * @param {Object} config - Configuración del engine
   */
  constructor(config = {}) {
    if (new.target === BaseEngine) {
      throw new Error('BaseEngine es una clase abstracta y no puede ser instanciada directamente');
    }
    this.config = config;
  }

  /**
   * Método abstracto: debe ser implementado por las clases hijas
   * @param {Object} indicador - Definición del indicador
   * @param {Object} params - Parámetros de ejecución (fechas, filtros, etc.)
   * @returns {Promise<Object>} Resultado normalizado
   */
  async ejecutarIndicador(indicador, params) {
    throw new Error('El método ejecutarIndicador() debe ser implementado por la clase hija');
  }

  /**
   * Método abstracto: validar conexión
   * @returns {Promise<boolean>}
   */
  async validarConexion() {
    throw new Error('El método validarConexion() debe ser implementado por la clase hija');
  }

  /**
   * Método común: normalizar resultado a formato estándar
   * @param {any} resultadoRaw - Resultado crudo del engine
   * @param {Object} metadata - Metadatos adicionales
   * @returns {Object} Resultado normalizado
   */
  normalizarResultado(resultadoRaw, metadata = {}) {
    return {
      code: metadata.code || 'UNKNOWN',
      resultado: this._extraerValorNumerico(resultadoRaw, 'resultado'),
      numero_pacientes: this._extraerValorNumerico(resultadoRaw, 'numero_pacientes'),
      numerador: this._extraerValorNumerico(resultadoRaw, 'numerador', null),
      metadata: {
        engine: this.constructor.name,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  }

  /**
   * Método privado: extraer valor numérico de forma segura
   */
  _extraerValorNumerico(obj, campo, valorPorDefecto = 0) {
    if (!obj) return valorPorDefecto;
    
    const valor = obj[campo];
    
    if (valor === null || valor === undefined) {
      return valorPorDefecto;
    }
    
    const numerico = Number(valor);
    return isNaN(numerico) ? valorPorDefecto : numerico;
  }

  /**
   * Método común: validar parámetros de fecha
   */
  validarParametrosFecha(params) {
    const { fechaInicio, fechaFin } = params;
    
    if (!fechaInicio || !fechaFin) {
      throw new Error('Los parámetros fechaInicio y fechaFin son obligatorios');
    }

    const inicio = new Date(fechaInicio);
    const fin = new Date(fechaFin);

    if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) {
      throw new Error('Las fechas proporcionadas no son válidas');
    }

    if (inicio > fin) {
      throw new Error('La fecha de inicio no puede ser posterior a la fecha de fin');
    }

    return { fechaInicio: inicio, fechaFin: fin };
  }

  /**
   * Método común: logging
   */
  log(mensaje, nivel = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.constructor.name}] [${nivel.toUpperCase()}]`;
    console.log(`${prefix} ${mensaje}`);
  }

  /**
   * Método común: manejo de errores
   */
  manejarError(error, contexto = '') {
    const mensaje = contexto 
      ? `Error en ${contexto}: ${error.message}` 
      : error.message;
    
    this.log(mensaje, 'error');
    
    return {
      error: true,
      mensaje,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }
}

module.exports = BaseEngine;
