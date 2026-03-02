/**
 * indicadorEngine.factory.js
 * Factory Pattern para crear instancias de engines según el tipo de fuente
 */

const FirebirdEngine = require('./engines/FirebirdEngine');
const MongoEngine = require('./engines/MongoEngine');

class IndicadorEngineFactory {
  /**
   * Crear instancia del engine apropiado según el tipo de fuente
   * @param {string} tipo - 'firebird' | 'mongo'
   * @param {Object} config - Configuración específica del engine
   * @returns {BaseEngine} Instancia del engine
   */
  static crearEngine(tipo, config) {
    switch (tipo.toLowerCase()) {
      case 'firebird':
        return new FirebirdEngine(config);
      
      case 'mongo':
      case 'mongodb':
        return new MongoEngine(config);
      
      default:
        throw new Error(`Tipo de engine no soportado: ${tipo}`);
    }
  }

  /**
   * Detectar el tipo de engine a partir de la definición del indicador
   * @param {Object} indicador - Definición del indicador
   * @returns {string} Tipo de engine ('firebird' | 'mongo')
   */
  static detectarTipoEngine(indicador) {
    // Si tiene campo 'engine' explícito, usarlo
    if (indicador.engine) {
      return indicador.engine.toLowerCase();
    }

    // Si tiene 'template' (SQL), es Firebird
    if (indicador.template) {
      return 'firebird';
    }

    // Si tiene 'aggregation', es MongoDB
    if (indicador.aggregation) {
      return 'mongo';
    }

    throw new Error(`No se pudo detectar el tipo de engine para el indicador ${indicador.id_code}`);
  }

  /**
   * Detectar el tipo de fuente a partir del código de base/centro
   * @param {string} code - Código de la fuente (ej: 'DB1', 'CENTRO_MONGO_01')
   * @returns {Object} { tipo: 'firebird'|'mongo', config: {} }
   */
  static detectarTipoFuente(code) {
    // Si comienza con 'DB' seguido de número, es Firebird
    if (/^DB\d+$/i.test(code)) {
      return {
        tipo: 'firebird',
        esCentroMongo: false
      };
    }

    // Si contiene 'MONGO' o 'CENTRO_', es MongoDB
    if (/MONGO|CENTRO_/i.test(code)) {
      return {
        tipo: 'mongo',
        esCentroMongo: true
      };
    }

    // Por defecto, asumimos Firebird (compatibilidad con sistema actual)
    return {
      tipo: 'firebird',
      esCentroMongo: false
    };
  }

  /**
   * Validar que el indicador sea compatible con el tipo de fuente
   * @param {Object} indicador - Definición del indicador
   * @param {string} tipoFuente - Tipo de fuente ('firebird' | 'mongo')
   * @returns {boolean}
   */
  static validarCompatibilidad(indicador, tipoFuente) {
    const tipoIndicador = this.detectarTipoEngine(indicador);
    return tipoIndicador === tipoFuente.toLowerCase();
  }
}

module.exports = IndicadorEngineFactory;
