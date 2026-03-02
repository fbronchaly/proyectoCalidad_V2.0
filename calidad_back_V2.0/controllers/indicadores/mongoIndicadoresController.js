const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

// Variable global para reutilizar la conexión
let mongoClient = null;

/**
 * Convertir fecha de DD-MM-YYYY a YYYY-MM-DD
 */
function convertirFechaParaMongo(fechaDDMMYYYY) {
  if (!fechaDDMMYYYY) return fechaDDMMYYYY;
  
  // Si ya está en formato YYYY-MM-DD, devolverla tal cual
  if (fechaDDMMYYYY.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return fechaDDMMYYYY;
  }
  
  // Convertir DD-MM-YYYY a YYYY-MM-DD
  const [dia, mes, año] = fechaDDMMYYYY.split('-');
  return `${año}-${mes}-${dia}`;
}

/**
 * Obtener conexión a MongoDB (singleton)
 */
async function getMongoConnection() {
  if (!mongoClient) {
    mongoClient = new MongoClient(process.env.MONGODB_URI);
    await mongoClient.connect();
    console.log('✅ Conectado a MongoDB para indicadores');
  }
  return mongoClient;
}

/**
 * Cargar el mapeo de centros Firebird <-> MongoDB
 */
function cargarMapeoCentros() {
  const filePath = path.join(__dirname, '../../documentacion/mapeo_centros.json');
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error cargando mapeo de centros:', error);
    return { mapeo: {}, mapeo_inverso: {} };
  }
}

/**
 * Convertir ID de base de datos (DB1) a nombre MongoDB (SANTA ENGRACIA)
 */
function dbIdToMongoCentro(dbId) {
  const mapeo = cargarMapeoCentros();
  return mapeo.mapeo[dbId] || dbId;
}

/**
 * Cargar indicadores MongoDB desde el archivo JSON
 */
function cargarIndicadoresMongoDB() {
  const filePath = path.join(__dirname, '../../documentacion/indicadoresMongoDB.json');
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error cargando indicadores MongoDB:', error);
    return [];
  }
}

/**
 * Reemplazar placeholders en el pipeline de MongoDB
 * Convierte las fechas a objetos Date reales para que $gte/$lte funcione correctamente
 */
function reemplazarPlaceholders(pipeline, centro, fechaIni, fechaFin) {
  // 1. Reemplazar :CENTRO (string simple)
  let pipelineStr = JSON.stringify(pipeline).replace(/:CENTRO/g, centro);

  // 2. Reemplazar los bloques { "$toDate": ":FECHAINI" } / { "$toDate": ":FECHAFIN" }
  //    por un marcador temporal único que JSON.parse no toque
  const MARCA_INI = '__FECHA_INI__';
  const MARCA_FIN = '__FECHA_FIN__';

  pipelineStr = pipelineStr
    .replace(/\{"\$toDate":":FECHAINI"\}/g, `"${MARCA_INI}"`)
    .replace(/\{"\$toDate":":FECHAFIN"\}/g, `"${MARCA_FIN}"`)
    // compatibilidad con placeholders de cadena simple que aún queden
    .replace(/":FECHAINI"/g, `"${MARCA_INI}"`)
    .replace(/":FECHAFIN"/g, `"${MARCA_FIN}"`);

  // 3. Parsear a objeto JS
  let pipelineObj = JSON.parse(pipelineStr);

  // 4. Construir objetos Date reales para las fechas
  const dateIni = new Date(fechaIni + 'T00:00:00.000Z');
  const dateFin = new Date(fechaFin + 'T23:59:59.999Z');

  // 5. Recorrer recursivamente y sustituir las marcas por Date reales
  function sustituirFechas(obj) {
    if (Array.isArray(obj)) return obj.map(sustituirFechas);
    if (obj === MARCA_INI) return dateIni;
    if (obj === MARCA_FIN) return dateFin;
    if (obj !== null && typeof obj === 'object') {
      const r = {};
      for (const k of Object.keys(obj)) r[k] = sustituirFechas(obj[k]);
      return r;
    }
    return obj;
  }

  return sustituirFechas(pipelineObj);
}

/**
 * GET /api/indicadores/mongodb
 * Obtener lista de indicadores MongoDB disponibles
 */
async function getIndicadoresMongoDB(req, res) {
  try {
    const indicadores = cargarIndicadoresMongoDB();
    res.json(indicadores);
  } catch (error) {
    console.error('Error obteniendo indicadores MongoDB:', error);
    res.status(500).json({ 
      error: 'Error obteniendo indicadores MongoDB',
      message: error.message 
    });
  }
}

/**
 * POST /api/indicadores/mongodb/execute
 * Ejecutar múltiples consultas MongoDB para MÚLTIPLES centros
 * MEJORADO: Ahora acepta dbIds y ejecuta consultas para TODOS los centros
 */
async function executeMongoQueries(req, res) {
  const { centro, dbIds, fechaIni, fechaFin, indicadores } = req.body;

  // Determinar lista de centros a consultar
  let centros = [];
  
  if (centro) {
    // Si se especifica un centro directamente
    centros = [centro];
  } else if (dbIds && Array.isArray(dbIds) && dbIds.length > 0) {
    // Convertir TODOS los dbIds a nombres de centros MongoDB
    centros = dbIds.map(dbId => {
      const nombreCentro = dbIdToMongoCentro(dbId);
      console.log(`🔄 Convertido ${dbId} -> ${nombreCentro}`);
      return nombreCentro;
    });
  }

  if (centros.length === 0 || !fechaIni || !fechaFin || !indicadores || !Array.isArray(indicadores)) {
    return res.status(400).json({ 
      error: 'Faltan parámetros requeridos',
      required: ['centro o dbIds', 'fechaIni', 'fechaFin', 'indicadores'] 
    });
  }

  try {
    // CONVERTIR FECHAS: DD-MM-YYYY (frontend) -> YYYY-MM-DD (MongoDB)
    const fechaIniMongo = convertirFechaParaMongo(fechaIni);
    const fechaFinMongo = convertirFechaParaMongo(fechaFin);
    
    console.log(`📅 Fechas convertidas: ${fechaIni} -> ${fechaIniMongo}, ${fechaFin} -> ${fechaFinMongo}`);

    const todosIndicadores = cargarIndicadoresMongoDB();
    const indicadoresAEjecutar = todosIndicadores.filter(ind => 
      indicadores.includes(ind.id_code)
    );

    if (indicadoresAEjecutar.length === 0) {
      return res.status(404).json({ 
        error: 'No se encontraron indicadores válidos' 
      });
    }

    const mongoClient = await getMongoConnection();
    const db = mongoClient.db('DatosCalidad');
    const resultados = [];

    console.log(`📊 Ejecutando ${indicadoresAEjecutar.length} consultas MongoDB para ${centros.length} centro(s): ${centros.join(', ')}`);

    // ITERAR SOBRE TODOS LOS CENTROS
    for (const centroActual of centros) {
      console.log(`\n🏥 === Procesando centro: ${centroActual} ===`);

      for (const indicador of indicadoresAEjecutar) {
        try {
          const pipeline = reemplazarPlaceholders(
            indicador.template.pipeline,
            centroActual,
            fechaIniMongo,  // Usar fechas convertidas
            fechaFinMongo   // Usar fechas convertidas
          );

          console.log(`🔍 Ejecutando indicador ${indicador.id_code} para ${centroActual}...`);
          
          const collection = db.collection(indicador.template.collection || 'test_responses');
          const result = await collection.aggregate(pipeline).toArray();

          if (result.length > 0) {
            resultados.push({
              id_code: indicador.id_code,
              categoria: indicador.categoria,
              indicador: indicador.indicador,
              centro: centroActual,
              ...result[0]
            });
            console.log(`✅ ${indicador.id_code} [${centroActual}]: ${result[0].resultado}`);
          } else {
            resultados.push({
              id_code: indicador.id_code,
              categoria: indicador.categoria,
              indicador: indicador.indicador,
              centro: centroActual,
              resultado: 0,
              numero_pacientes: 0,
              numerador: 0
            });
            console.log(`⚠️ ${indicador.id_code} [${centroActual}]: Sin datos`);
          }
        } catch (error) {
          console.error(`❌ Error en indicador ${indicador.id_code} para ${centroActual}:`, error);
          resultados.push({
            id_code: indicador.id_code,
            categoria: indicador.categoria,
            indicador: indicador.indicador,
            centro: centroActual,
            error: error.message,
            resultado: null,
            numero_pacientes: 0
          });
        }
      }
    }

    console.log(`\n✅ Total resultados generados: ${resultados.length}`);
    res.json(resultados);
  } catch (error) {
    console.error('Error ejecutando consultas MongoDB:', error);
    res.status(500).json({ 
      error: 'Error ejecutando consultas MongoDB',
      message: error.message 
    });
  }
}

/**
 * POST /api/indicadores/mongodb/execute-single
 * Ejecutar una sola consulta MongoDB
 */
async function executeMongoQuerySingle(req, res) {
  const { centro, fechaIni, fechaFin, indicadorId } = req.body;

  if (!centro || !fechaIni || !fechaFin || !indicadorId) {
    return res.status(400).json({ 
      error: 'Faltan parámetros requeridos',
      required: ['centro', 'fechaIni', 'fechaFin', 'indicadorId'] 
    });
  }

  try {
    const todosIndicadores = cargarIndicadoresMongoDB();
    const indicador = todosIndicadores.find(ind => ind.id_code === indicadorId);

    if (!indicador) {
      return res.status(404).json({ 
        error: 'Indicador no encontrado',
        id_code: indicadorId 
      });
    }

    const mongoClient = await getMongoConnection();
    const db = mongoClient.db('appTestCormo');

    const pipeline = reemplazarPlaceholders(
      indicador.template.pipeline,
      centro,
      fechaIni,
      fechaFin
    );

    console.log(`🔍 Ejecutando indicador ${indicador.id_code} para ${centro}...`);
    
    const collection = db.collection(indicador.template.collection || 'test_responses');
    const result = await collection.aggregate(pipeline).toArray();

    if (result.length > 0) {
      res.json({
        id_code: indicador.id_code,
        ...result[0]
      });
    } else {
      res.json({
        id_code: indicador.id_code,
        resultado: 0,
        numero_pacientes: 0,
        numerador: 0
      });
    }
  } catch (error) {
    console.error('Error ejecutando consulta MongoDB:', error);
    res.status(500).json({ 
      error: 'Error ejecutando consulta MongoDB',
      message: error.message 
    });
  }
}

/**
 * GET /api/mongodb/centros
 * Obtener lista de centros disponibles en MongoDB
 */
async function getCentrosDisponibles(req, res) {
  try {
    const mongoClient = await getMongoConnection();
    const db = mongoClient.db('appTestCormo');
    
    const centros = await db.collection('test_responses')
      .distinct('centro', { _isTest: { $ne: true } });
    
    res.json(centros.sort());
  } catch (error) {
    console.error('Error obteniendo centros:', error);
    res.status(500).json({ 
      error: 'Error obteniendo centros',
      message: error.message 
    });
  }
}

/**
 * GET /api/mongodb/centro/:centro/check
 * Verificar si un centro tiene datos en MongoDB
 */
async function checkCentroData(req, res) {
  const { centro } = req.params;

  try {
    const mongoClient = await getMongoConnection();
    const db = mongoClient.db('appTestCormo');
    
    const count = await db.collection('test_responses')
      .countDocuments({ 
        centro: centro,
        _isTest: { $ne: true } 
      });
    
    res.json({
      hasData: count > 0,
      testCount: count
    });
  } catch (error) {
    console.error('Error verificando datos del centro:', error);
    res.status(500).json({ 
      error: 'Error verificando datos',
      message: error.message 
    });
  }
}

/**
 * GET /api/mongodb/diagnostico
 * Diagnóstico de datos MongoDB para debugging
 */
async function diagnosticoMongoDB(req, res) {
  try {
    const mongoClient = await getMongoConnection();
    const db = mongoClient.db('DatosCalidad');
    const collection = db.collection('test_responses');

    // 1. Contadores básicos
    const totalDocs = await collection.countDocuments();
    const totalDocsNoTest = await collection.countDocuments({ _isTest: { $ne: true } });
    
    // 2. Centros y form_ids disponibles (usando la ruta correcta metadata.centro y metadata.form_id)
    const centros = await collection.distinct('metadata.centro', { _isTest: { $ne: true } });
    const formIds = await collection.distinct('metadata.form_id', { _isTest: { $ne: true } });
    
    // 3. EJEMPLOS REALES DE DOCUMENTOS (5 documentos completos de diferentes formularios)
    const ejemplosCompletos = await collection.find({ 
      _isTest: { $ne: true }
    })
      .limit(10)
      .toArray();

    // 4. Distribución por centro y form_id
    const docsPorCentro = await collection.aggregate([
      { $match: { _isTest: { $ne: true } } },
      { $group: { _id: '$metadata.centro', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    const docsPorFormId = await collection.aggregate([
      { $match: { _isTest: { $ne: true } } },
      { $group: { _id: '$metadata.form_id', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    // 5. Ejemplos de fechas con diferentes centros
    const ejemplosFechas = await collection.find({ _isTest: { $ne: true } })
      .project({ 'metadata.fecha_insercion': 1, 'metadata.centro': 1, 'metadata.form_id': 1, puntuacion: 1, _id: 0 })
      .limit(20)
      .toArray();

    // 6. Verificar si hay documentos de SANTA MARIA con indice_barthel
    const ejemploSantaMaria = await collection.find({
      'metadata.centro': 'SANTA MARIA',
      'metadata.form_id': 'indice_barthel',
      _isTest: { $ne: true }
    }).limit(3).toArray();

    res.json({
      resumen: {
        total_documentos: totalDocs,
        documentos_no_test: totalDocsNoTest,
        centros_unicos: centros.length,
        form_ids_unicos: formIds.length
      },
      centros_disponibles: centros.sort(),
      form_ids_disponibles: formIds.sort(),
      distribucion_por_centro: docsPorCentro,
      distribucion_por_form_id: docsPorFormId,
      ejemplos_documentos_completos: ejemplosCompletos,
      ejemplos_fechas_y_centros: ejemplosFechas,
      prueba_santa_maria_barthel: {
        encontrados: ejemploSantaMaria.length,
        ejemplos: ejemploSantaMaria
      },
      mapeo_centros: cargarMapeoCentros().mapeo
    });
  } catch (error) {
    console.error('Error en diagnóstico MongoDB:', error);
    res.status(500).json({ 
      error: 'Error en diagnóstico MongoDB',
      message: error.message,
      stack: error.stack
    });
  }
}

module.exports = {
  getIndicadoresMongoDB,
  executeMongoQueries,
  executeMongoQuerySingle,
  getCentrosDisponibles,
  checkCentroData,
  diagnosticoMongoDB,
  dbIdToMongoCentro,
  reemplazarPlaceholders  // exportar para testing
};
