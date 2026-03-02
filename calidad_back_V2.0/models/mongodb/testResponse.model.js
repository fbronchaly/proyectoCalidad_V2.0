const { ObjectId } = require('mongodb');

/**
 * Formatea una fecha a DD-MM-YYYY (formato de datosHistoricos)
 */
function formatDateDDMMYYYY(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return `${dd}-${mm}-${yyyy}`;
}

/**
 * Acepta fechas en:
 * - DD-MM-YYYY (históricos)
 * - YYYY-MM-DD (ISO-date)
 * - Date / timestamp
 * Devuelve siempre DD-MM-YYYY o null.
 */
function normalizeToHistoricalDateString(value) {
  if (value === undefined || value === null || value === '') return null;

  if (typeof value === 'string') {
    const s = value.trim();

    // Ya viene como DD-MM-YYYY
    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s;

    // ISO YYYY-MM-DD
    const mIso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (mIso) {
      const [, yyyy, mm, dd] = mIso;
      return `${dd}-${mm}-${yyyy}`;
    }

    // Intenta parse genérico
    return formatDateDDMMYYYY(s);
  }

  return formatDateDDMMYYYY(value);
}

/**
 * Esquema unificado para todas las respuestas de tests
 * Basado en el análisis de datos históricos reales
 */
class TestResponse {
  constructor(data) {
    this._id = data._id || new ObjectId();
    this.metadata = {
      form_id: data.metadata?.form_id || '',
      NREGGEN: data.metadata?.NREGGEN || '',
      sexo: data.metadata?.sexo || null,
      fecha_nacimiento: normalizeToHistoricalDateString(data.metadata?.fecha_nacimiento),
      centro: data.metadata?.centro || '',
      fecha_insercion: normalizeToHistoricalDateString(data.metadata?.fecha_insercion) || formatDateDDMMYYYY(new Date())
    };
    this.preguntas = data.preguntas || {};
    this.puntuacion = data.puntuacion !== undefined ? data.puntuacion : null;
    this.interpretacion = data.interpretacion || '';
    this.created_at = data.created_at || new Date();
    this.updated_at = data.updated_at || new Date();
  }

  /**
   * Valida que los datos mínimos requeridos estén presentes
   */
  validate() {
    const errors = [];

    if (!this.metadata.form_id) {
      errors.push('form_id es requerido');
    }

    if (!this.metadata.NREGGEN) {
      errors.push('NREGGEN es requerido');
    }

    if (!this.preguntas || Object.keys(this.preguntas).length === 0) {
      errors.push('preguntas es requerido y debe contener al menos una pregunta');
    }

    if (!this.interpretacion) {
      errors.push('interpretacion es requerida');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Convierte la instancia a un objeto plano para insertar en MongoDB
   */
  toDocument() {
    return {
      _id: this._id,
      metadata: this.metadata,
      preguntas: this.preguntas,
      puntuacion: this.puntuacion,
      interpretacion: this.interpretacion,
      created_at: this.created_at,
      updated_at: this.updated_at
    };
  }

  /**
   * Crea una instancia desde un documento de MongoDB
   */
  static fromDocument(doc) {
    if (!doc) return null;
    return new TestResponse(doc);
  }
}

/**
 * Repositorio para operaciones CRUD con MongoDB nativo
 */
class TestResponseRepository {
  constructor(db) {
    this.db = db;
    // Colección canónica usada por la app (/api/tests)
    this.collectionName = 'test_responses';
  }

  /**
   * Obtiene la colección de MongoDB
   */
  getCollection() {
    return this.db.collection(this.collectionName);
  }

  /**
   * Crea índices necesarios para la colección
   */
  async createIndexes() {
    const collection = this.getCollection();
    
    await collection.createIndexes([
      { key: { 'metadata.form_id': 1 } },
      { key: { 'metadata.NREGGEN': 1 } },
      { key: { 'metadata.centro': 1 } },
      { key: { 'metadata.fecha_insercion': -1 } },
      { key: { 'created_at': -1 } },
      { 
        key: { 
          'metadata.form_id': 1, 
          'metadata.NREGGEN': 1, 
          'metadata.fecha_insercion': -1 
        }
      }
    ]);
  }

  /**
   * Inserta una nueva respuesta de test
   */
  async create(testResponse) {
    const validation = testResponse.validate();
    if (!validation.isValid) {
      throw new Error(`Validación fallida: ${validation.errors.join(', ')}`);
    }

    const collection = this.getCollection();
    const document = testResponse.toDocument();
    const result = await collection.insertOne(document);
    
    return {
      ...document,
      _id: result.insertedId
    };
  }

  /**
   * Inserta múltiples respuestas (útil para migración de datos históricos)
   */
  async createMany(testResponses) {
    const collection = this.getCollection();
    const documents = testResponses.map(tr => tr.toDocument());
    const result = await collection.insertMany(documents);
    
    return {
      insertedCount: result.insertedCount,
      insertedIds: result.insertedIds
    };
  }

  /**
   * Busca una respuesta por ID
   */
  async findById(id) {
    const collection = this.getCollection();
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const doc = await collection.findOne({ _id: objectId });
    return TestResponse.fromDocument(doc);
  }

  /**
   * Busca respuestas por filtros
   */
  async find(filter = {}, options = {}) {
    const collection = this.getCollection();
    const {
      limit = 100,
      skip = 0,
      sort = { 'metadata.fecha_insercion': -1 }
    } = options;

    const cursor = collection
      .find(filter)
      .limit(limit)
      .skip(skip)
      .sort(sort);

    const docs = await cursor.toArray();
    return docs.map(doc => TestResponse.fromDocument(doc));
  }

  /**
   * Busca respuestas por form_id
   */
  async findByFormId(formId, options = {}) {
    return this.find({ 'metadata.form_id': formId }, options);
  }

  /**
   * Busca respuestas por NREGGEN (id del paciente)
   */
  async findByPatient(nreggen, options = {}) {
    return this.find({ 'metadata.NREGGEN': nreggen }, options);
  }

  /**
   * Busca respuestas por centro
   */
  async findByCenter(centro, options = {}) {
    return this.find({ 'metadata.centro': centro }, options);
  }

  /**
   * Busca respuestas por paciente y tipo de test
   */
  async findByPatientAndForm(nreggen, formId, options = {}) {
    return this.find({
      'metadata.NREGGEN': nreggen,
      'metadata.form_id': formId
    }, options);
  }

  /**
   * Cuenta documentos por filtro
   */
  async count(filter = {}) {
    const collection = this.getCollection();
    return collection.countDocuments(filter);
  }

  /**
   * Actualiza una respuesta
   */
  async update(id, updateData) {
    const collection = this.getCollection();
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    
    const update = {
      $set: {
        ...updateData,
        updated_at: new Date()
      }
    };

    const result = await collection.findOneAndUpdate(
      { _id: objectId },
      update,
      { returnDocument: 'after' }
    );

    return TestResponse.fromDocument(result.value);
  }

  /**
   * Elimina una respuesta
   */
  async delete(id) {
    const collection = this.getCollection();
    const objectId = typeof id === 'string' ? new ObjectId(id) : id;
    const result = await collection.deleteOne({ _id: objectId });
    return result.deletedCount > 0;
  }

  /**
   * Obtiene estadísticas por tipo de test
   */
  async getStatsByFormId(formId) {
    const collection = this.getCollection();
    
    const stats = await collection.aggregate([
      { $match: { 'metadata.form_id': formId } },
      {
        $group: {
          _id: '$interpretacion',
          count: { $sum: 1 },
          avgPuntuacion: { $avg: '$puntuacion' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();

    return stats;
  }

  /**
   * Obtiene el historial de un paciente para un test específico
   */
  async getPatientHistory(nreggen, formId) {
    return this.find(
      {
        'metadata.NREGGEN': nreggen,
        'metadata.form_id': formId
      },
      {
        sort: { 'metadata.fecha_insercion': 1 },
        limit: 1000
      }
    );
  }

  /**
   * Busca la última respuesta de un paciente para un test
   */
  async getLatestResponse(nreggen, formId) {
    const collection = this.getCollection();
    
    const doc = await collection.findOne(
      {
        'metadata.NREGGEN': nreggen,
        'metadata.form_id': formId
      },
      {
        sort: { 'metadata.fecha_insercion': -1 }
      }
    );

    return TestResponse.fromDocument(doc);
  }
}

module.exports = {
  TestResponse,
  TestResponseRepository
};
