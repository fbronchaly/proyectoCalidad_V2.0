/**
 * MongoEngine.js
 * Engine para ejecutar indicadores sobre MongoDB mediante Aggregation Pipeline
 */

const BaseEngine = require('./BaseEngine');

class MongoEngine extends BaseEngine {
  /**
   * @param {Object} config - Configuración del engine MongoDB
   * @param {Object} config.db - Instancia de MongoDB database
   * @param {string} config.centro - Código del centro
   */
  constructor(config) {
    super(config);
    this.db = config.db;
    this.centro = config.centro;

    if (!this.db) {
      throw new Error('MongoEngine requiere una instancia de MongoDB database en config.db');
    }
  }

  /**
   * Validar conexión a MongoDB
   */
  async validarConexion() {
    try {
      await this.db.admin().ping();
      this.log('Conexión a MongoDB validada correctamente', 'info');
      return true;
    } catch (error) {
      this.log(`Error al conectar con MongoDB: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Ejecutar indicador MongoDB mediante Aggregation Pipeline
   * @param {Object} indicador - Definición del indicador con campo 'aggregation'
   * @param {Object} params - { fechaInicio, fechaFin, code, centro }
   */
  async ejecutarIndicador(indicador, params) {
    try {
      // Validar fechas
      const { fechaInicio, fechaFin } = this.validarParametrosFecha(params);

      // Validar que el indicador tenga aggregation pipeline
      if (!indicador.aggregation || indicador.engine !== 'mongo') {
        throw new Error('El indicador no tiene un aggregation pipeline válido o no es de tipo mongo');
      }

      this.log(`Ejecutando indicador ${indicador.id_code} en MongoDB (Centro: ${params.centro || this.centro})`, 'info');

      // Preparar pipeline con parámetros
      const pipeline = this._prepararPipeline(
        indicador.aggregation,
        {
          fechaInicio,
          fechaFin,
          centro: params.centro || this.centro
        }
      );

      // Obtener colección
      const collection = this.db.collection(indicador.collection);

      // Ejecutar aggregation
      const resultados = await collection.aggregate(pipeline).toArray();

      // El resultado debería venir en formato estándar desde la aggregation
      const resultadoRaw = resultados && resultados.length > 0 ? resultados[0] : null;

      // Normalizar resultado
      const resultado = this.normalizarResultado(resultadoRaw, {
        code: params.code || params.centro || indicador.id_code,
        categoria: indicador.categoria,
        indicador: indicador.indicador,
        unidad: indicador.unidad,
        fuente_tipo: 'mongo',
        collection: indicador.collection,
        centro: params.centro || this.centro
      });

      this.log(`Indicador ${indicador.id_code} ejecutado con éxito (${resultado.numero_pacientes} pacientes)`, 'info');
      return resultado;

    } catch (error) {
      return this.manejarError(error, `ejecutarIndicador ${indicador.id_code}`);
    }
  }

  /**
   * Preparar aggregation pipeline con parámetros dinámicos
   * @param {Array} pipelineTemplate - Template del pipeline con placeholders
   * @param {Object} parametros - { fechaInicio, fechaFin, centro }
   * @returns {Array} Pipeline listo para ejecutar
   */
  _prepararPipeline(pipelineTemplate, parametros) {
    let pipelineStr = JSON.stringify(pipelineTemplate);

    const isoInicio = this._formatearFechaISO(parametros.fechaInicio);
    const isoFin    = this._formatearFechaISO(parametros.fechaFin);

    // Los placeholders en el JSON serializado aparecen como "{{placeholder}}"
    // Sustituimos el string completo (con comillas incluidas) por un marcador
    // temporal que _convertirFechasDate convertirá a Date real.
    pipelineStr = pipelineStr.replace(/"{{fechaInicio}}"/g, `{"$date":"${isoInicio}T00:00:00.000Z"}`);
    pipelineStr = pipelineStr.replace(/"{{fechaFin}}"/g,    `{"$date":"${isoFin}T23:59:59.999Z"}`);
    pipelineStr = pipelineStr.replace(/"{{centro}}"/g,      `"${parametros.centro}"`);

    const pipeline = JSON.parse(pipelineStr);
    return this._convertirFechasDate(pipeline);
  }

  /**
   * Recorre recursivamente un objeto/array y convierte cualquier
   * { "$date": "<isoString>" } en un objeto Date real de JavaScript.
   * @param {*} obj
   * @returns {*}
   */
  _convertirFechasDate(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this._convertirFechasDate(item));
    }
    if (obj !== null && typeof obj === 'object') {
      // Nodo { "$date": "..." } → Date real
      const keys = Object.keys(obj);
      if (keys.length === 1 && keys[0] === '$date' && typeof obj.$date === 'string') {
        return new Date(obj.$date);
      }
      const resultado = {};
      for (const key of keys) {
        resultado[key] = this._convertirFechasDate(obj[key]);
      }
      return resultado;
    }
    return obj;
  }

  /**
   * Formatea un Date a YYYY-MM-DD (ISO date, sin hora) para usarlo en { "$date": "..." }
   * @param {Date} fecha
   * @returns {string}
   */
  _formatearFechaISO(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, '0');
    const dd   = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Formatea un objeto Date a string DD-MM-YYYY,
   * compatible con el formato almacenado por testResponse.model.js
   * @param {Date} fecha
   * @returns {string} Fecha en formato DD-MM-YYYY
   */
  _formatearFechaDDMMYYYY(fecha) {
    const d = fecha instanceof Date ? fecha : new Date(fecha);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  }

  /**
   * Obtener lista de centros disponibles en MongoDB
   */
  async obtenerCentrosDisponibles(collectionName = 'test_responses') {
    try {
      const collection = this.db.collection(collectionName);
      const centros = await collection.distinct('metadata.centro');

      this.log(`Centros disponibles en MongoDB: ${centros.join(', ')}`, 'info');
      return centros;
    } catch (error) {
      this.log(`Error al obtener centros: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Obtener form_ids de tests disponibles en test_responses
   */
  async obtenerColeccionesDisponibles() {
    try {
      const collection = this.db.collection('test_responses');
      const formIds = await collection.distinct('metadata.form_id');

      // Filtrar solo tests de comorbilidad conocidos
      const testsComorbilidad = formIds.filter(id =>
        ['frail', 'sarcf', 'mna', 'barthel', 'lawton', 'charlson', 'downton', 'phq4', 'gijon'].includes(
          String(id).toLowerCase()
        )
      );

      this.log(`Tests de comorbilidad disponibles: ${testsComorbilidad.join(', ')}`, 'info');
      return testsComorbilidad;
    } catch (error) {
      this.log(`Error al obtener colecciones: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Cerrar conexiones (cleanup)
   */
  async cerrar() {
    this.log('MongoEngine cerrado (MongoDB permanece conectado)', 'info');
  }
}

module.exports = MongoEngine;
