/**
 * fuente.service.js
 * Servicio para gestionar fuentes de datos (Firebird + MongoDB)
 */

const MongoEngine = require('../indicadores/engines/MongoEngine');
const path = require('path');
const fs = require('fs').promises;

class FuenteService {
  constructor() {
    this.fuentesFirebird = [];
    this.centrosMongo = [];
  }

  /**
   * Cargar fuentes Firebird desde databases.json
   */
  async cargarFuentesFirebird() {
    try {
      const pathDatabases = path.join(__dirname, '../servicios/databases.json');
      const data = await fs.readFile(pathDatabases, 'utf-8');
      const databases = JSON.parse(data);

      this.fuentesFirebird = Object.entries(databases).map(([code, config]) => ({
        code,
        nombre: config.nombre || code,
        tipo: 'firebird',
        config: {
          host: config.host || 'localhost',
          port: config.port || 3050,
          database: config.database,
          user: config.user || 'SYSDBA',
          password: config.password || 'masterkey'
        }
      }));

      console.log(`✅ ${this.fuentesFirebird.length} fuentes Firebird cargadas`);
    } catch (error) {
      console.error('❌ Error cargando fuentes Firebird:', error.message);
      this.fuentesFirebird = [];
    }
  }

  /**
   * Cargar centros MongoDB disponibles
   */
  async cargarCentrosMongo(mongoDb) {
    try {
      if (!mongoDb) {
        console.warn('⚠️ MongoDB no está disponible');
        return;
      }

      const mongoEngine = new MongoEngine({ db: mongoDb });
      const centros = await mongoEngine.obtenerCentrosDisponibles('frail');

      this.centrosMongo = centros.map(centro => ({
        code: `MONGO_${centro}`,
        nombre: `Centro ${centro} (MongoDB)`,
        tipo: 'mongo',
        centro,
        config: {
          db: mongoDb,
          centro
        }
      }));

      console.log(`✅ ${this.centrosMongo.length} centros MongoDB cargados`);
    } catch (error) {
      console.error('❌ Error cargando centros MongoDB:', error.message);
      this.centrosMongo = [];
    }
  }

  /**
   * Obtener todas las fuentes disponibles
   */
  obtenerTodasLasFuentes() {
    return {
      firebird: this.fuentesFirebird,
      mongo: this.centrosMongo,
      todas: [...this.fuentesFirebird, ...this.centrosMongo]
    };
  }

  /**
   * Buscar fuente por código
   */
  buscarFuente(code) {
    return [...this.fuentesFirebird, ...this.centrosMongo].find(f => f.code === code);
  }

  /**
   * Obtener fuentes por tipo
   */
  obtenerFuentesPorTipo(tipo) {
    return tipo === 'mongo' ? this.centrosMongo : this.fuentesFirebird;
  }
}

module.exports = new FuenteService();
