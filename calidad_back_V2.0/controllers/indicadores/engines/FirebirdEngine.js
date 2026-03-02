/**
 * FirebirdEngine.js
 * Engine para ejecutar indicadores sobre bases de datos Firebird mediante SQL
 */

const BaseEngine = require('./BaseEngine');
const Firebird = require('node-firebird');

class FirebirdEngine extends BaseEngine {
  /**
   * @param {Object} config - Configuración de la conexión Firebird
   * @param {string} config.database - Ruta a la base de datos Firebird
   * @param {string} config.host - Host del servidor Firebird
   * @param {number} config.port - Puerto del servidor Firebird
   * @param {string} config.user - Usuario de la base de datos
   * @param {string} config.password - Contraseña
   */
  constructor(config) {
    super(config);
    this.connectionPool = null;
  }

  /**
   * Validar conexión a Firebird
   */
  async validarConexion() {
    return new Promise((resolve, reject) => {
      Firebird.attach(this.config, (err, db) => {
        if (err) {
          this.log(`Error al conectar con Firebird: ${err.message}`, 'error');
          resolve(false);
        } else {
          db.detach();
          this.log('Conexión a Firebird validada correctamente', 'info');
          resolve(true);
        }
      });
    });
  }

  /**
   * Ejecutar indicador SQL sobre Firebird
   * @param {Object} indicador - Definición del indicador con campo 'template'
   * @param {Object} params - { fechaInicio, fechaFin, code }
   */
  async ejecutarIndicador(indicador, params) {
    try {
      // Validar fechas
      const { fechaInicio, fechaFin } = this.validarParametrosFecha(params);

      // Validar que el indicador tenga template SQL
      if (!indicador.template || indicador.engine !== 'firebird') {
        throw new Error('El indicador no tiene un template SQL válido o no es de tipo firebird');
      }

      this.log(`Ejecutando indicador ${indicador.id_code} en Firebird`, 'info');

      // Reemplazar parámetros en el template SQL
      let sqlQuery = this._prepararConsultaSQL(indicador.template, {
        FECHAINI: this._formatearFechaFirebird(fechaInicio),
        FECHAFIN: this._formatearFechaFirebird(fechaFin)
      });

      // Ejecutar consulta
      const resultadoRaw = await this._ejecutarSQL(sqlQuery);

      // Normalizar resultado
      const resultado = this.normalizarResultado(resultadoRaw, {
        code: params.code || indicador.id_code,
        categoria: indicador.categoria,
        indicador: indicador.indicador,
        unidad: indicador.unidad,
        fuente_tipo: 'firebird',
        database: this.config.database
      });

      this.log(`Indicador ${indicador.id_code} ejecutado con éxito`, 'info');
      return resultado;

    } catch (error) {
      return this.manejarError(error, `ejecutarIndicador ${indicador.id_code}`);
    }
  }

  /**
   * Preparar consulta SQL reemplazando parámetros
   */
  _prepararConsultaSQL(template, parametros) {
    let sql = template;

    // Reemplazar :FECHAINI y :FECHAFIN
    Object.keys(parametros).forEach(key => {
      const regex = new RegExp(`:${key}`, 'g');
      sql = sql.replace(regex, parametros[key]);
    });

    // Reemplazar códigos de test si existen (ej: <CODTEST_FRAIL>)
    // Esto debería venir de una configuración centralizada
    const codigosTest = this._obtenerCodigosTest();
    Object.keys(codigosTest).forEach(key => {
      const regex = new RegExp(`<${key}>`, 'g');
      sql = sql.replace(regex, codigosTest[key]);
    });

    return sql;
  }

  /**
   * Obtener códigos de tests desde configuración
   * TODO: Mover a un archivo de configuración centralizado
   */
  _obtenerCodigosTest() {
    return {
      CODTEST_FRAIL: "'FRAIL'",
      CODTEST_SARCF: "'SARCF'",
      CODTEST_MNA: "'MNA'",
      CODTEST_BARTHEL: "'BARTHEL'",
      CODTEST_LAWTON: "'LAWTON'",
      CODTEST_CHARLSON: "'CHARLSON'",
      CODTEST_DOWNTON: "'DOWNTON'",
      CODTEST_PHQ4: "'PHQ4'",
      CODTEST_GIJON: "'GIJON'"
    };
  }

  /**
   * Formatear fecha para Firebird (formato: 'DD.MM.YYYY')
   */
  _formatearFechaFirebird(fecha) {
    const d = new Date(fecha);
    const dia = String(d.getDate()).padStart(2, '0');
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const anio = d.getFullYear();
    return `'${dia}.${mes}.${anio}'`;
  }

  /**
   * Ejecutar consulta SQL en Firebird
   */
  _ejecutarSQL(sql) {
    return new Promise((resolve, reject) => {
      Firebird.attach(this.config, (err, db) => {
        if (err) {
          return reject(new Error(`Error al conectar: ${err.message}`));
        }

        db.query(sql, (err, result) => {
          db.detach();

          if (err) {
            return reject(new Error(`Error en consulta SQL: ${err.message}`));
          }

          // Firebird devuelve array de resultados, tomamos el primero
          resolve(result && result.length > 0 ? result[0] : null);
        });
      });
    });
  }

  /**
   * Cerrar conexiones (cleanup)
   */
  async cerrar() {
    this.log('FirebirdEngine cerrado', 'info');
  }
}

module.exports = FirebirdEngine;
