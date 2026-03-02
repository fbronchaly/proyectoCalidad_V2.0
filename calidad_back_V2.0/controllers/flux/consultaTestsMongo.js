/**
 * consultaTestsMongo.js
 * Módulo para consultar tests de comorbilidad desde MongoDB (colección tests_records)
 * Se integra con el sistema híbrido Firebird + MongoDB
 */

const { MongoClient } = require('mongodb');

// Cliente MongoDB singleton
let mongoClient = null;

/**
 * Mapeo de códigos de test a form_id de MongoDB
 */
const MAPEO_TESTS_MONGO = {
  'CHARLSON': 'charlson',
  'DOWNTON': 'dowton',
  'SARCF': 'sarcf',
  'FRAIL': 'frail',
  'MNA': 'mna_sf',
  'PHQ4': 'phq4',
  'LAWTON': 'lawton_brody',
  'BARTHEL': 'indice_barthel',
  'GIJON': 'gijon'
};

/**
 * Obtener conexión MongoDB (singleton)
 */
async function obtenerConexionMongoDB() {
  if (!process.env.MONGODB_URI) {
    console.warn('⚠️ MONGODB_URI no configurada - MongoDB no disponible');
    return null;
  }
  
  try {
    if (!mongoClient) {
      mongoClient = new MongoClient(process.env.MONGODB_URI, {
        maxPoolSize: 10,
        minPoolSize: 2,
        serverSelectionTimeoutMS: 5000
      });
      await mongoClient.connect();
      console.log('✅ MongoDB conectado para tests de comorbilidad');
    }
    
    return mongoClient.db(process.env.MONGODB_DBNAME || 'calidad');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    return null;
  }
}

/**
 * Detectar qué tipo de test es desde el placeholder
 * Ejemplos: <CODTEST_FRAIL> → 'FRAIL', <CODTEST_MNA> → 'MNA'
 */
function extraerTipoTestDesdeQuery(query) {
  const match = query.match(/<CODTEST_(\w+)>/);
  return match ? match[1] : null;
}

/**
 * Detectar si un centro tiene datos en MongoDB
 */
async function centroTieneDatosMongo(mongoDb, nombreCentro) {
  if (!mongoDb) return false;
  
  try {
    const collection = mongoDb.collection('tests_records');
    const count = await collection.countDocuments(
      { centro: nombreCentro },
      { limit: 1 }
    );
    
    return count > 0;
  } catch (error) {
    console.error(`Error verificando centro ${nombreCentro} en MongoDB:`, error.message);
    return false;
  }
}

/**
 * Ejecutar consulta de test de comorbilidad en MongoDB
 * @param {Object} mongoDb - Instancia de base de datos MongoDB
 * @param {string} tipoTest - Tipo de test (FRAIL, MNA, etc.)
 * @param {string} centro - Nombre del centro
 * @param {Date} fechaInicio - Fecha inicio del periodo
 * @param {Date} fechaFin - Fecha fin del periodo
 * @param {string} tipoConsulta - Tipo de consulta ('prevalentes', 'incidentes', 'porcentaje', 'count')
 * @returns {Promise<Object>} { resultado, numero_pacientes }
 */
async function consultarTestMongo(mongoDb, tipoTest, centro, fechaInicio, fechaFin, tipoConsulta = 'prevalentes') {
  const formId = MAPEO_TESTS_MONGO[tipoTest];
  
  if (!formId) {
    console.warn(`⚠️ Test ${tipoTest} no mapeado a MongoDB`);
    return { resultado: 0, numero_pacientes: 0 };
  }
  
  try {
    const collection = mongoDb.collection('tests_records');
    
    console.log(`🔍 Consultando MongoDB: ${formId} en ${centro} (${fechaInicio} - ${fechaFin})`);
    
    // Pipeline base: obtener el test más reciente por paciente
    const pipeline = [
      {
        $match: {
          form_id: formId,
          centro: centro,
          fecha: {
            $gte: new Date(fechaInicio),
            $lte: new Date(fechaFin)
          }
        }
      },
      {
        $sort: { NREGGEN: 1, fecha: -1 }
      },
      {
        $group: {
          _id: "$NREGGEN",
          ultimoTest: { $first: "$$ROOT" }
        }
      }
    ];
    
    // Agregar filtro según tipo de consulta
    switch (tipoConsulta) {
      case 'prevalentes_fragil': // % pacientes FRAIL >= 3
        pipeline.push({
          $match: {
            "ultimoTest.puntuacion_total": { $gte: 3 }
          }
        });
        break;
        
      case 'prevalentes_sarcopenia': // % pacientes SARCF > 3
        pipeline.push({
          $match: {
            "ultimoTest.puntuacion_total": { $gt: 3 }
          }
        });
        break;
        
      case 'prevalentes_desnutricion': // % pacientes MNA <= 11
        pipeline.push({
          $match: {
            "ultimoTest.puntuacion_total": { $lte: 11 }
          }
        });
        break;
        
      case 'prevalentes_dependencia': // % pacientes BARTHEL <= 75
        pipeline.push({
          $match: {
            "ultimoTest.puntuacion_total": { $lte: 75 }
          }
        });
        break;
        
      case 'prevalentes_lawton': // % pacientes LAWTON < 8
        pipeline.push({
          $match: {
            "ultimoTest.puntuacion_total": { $lt: 8 }
          }
        });
        break;
        
      case 'prevalentes_charlson_alta': // % pacientes CHARLSON >= 5
        pipeline.push({
          $match: {
            "ultimoTest.puntuacion_total": { $gte: 5 }
          }
        });
        break;
        
      case 'prevalentes_downton': // % pacientes DOWNTON >= 3
        pipeline.push({
          $match: {
            "ultimoTest.puntuacion_total": { $gte: 3 }
          }
        });
        break;
        
      case 'prevalentes_phq4': // % pacientes PHQ4 >= 6
        pipeline.push({
          $match: {
            "ultimoTest.puntuacion_total": { $gte: 6 }
          }
        });
        break;
        
      case 'prevalentes_gijon': // % pacientes GIJON > 10
        pipeline.push({
          $match: {
            "ultimoTest.puntuacion_total": { $gt: 10 }
          }
        });
        break;
        
      case 'charlson_media': // Media de puntuación CHARLSON
        pipeline.push({
          $group: {
            _id: null,
            media: { $avg: "$ultimoTest.puntuacion_total" },
            total: { $sum: 1 }
          }
        });
        break;
        
      case 'con_test': // % pacientes que TIENEN el test realizado
        // No agregar filtro adicional, solo contar
        break;
    }
    
    // Ejecutar pipeline
    const resultados = await collection.aggregate(pipeline).toArray();
    
    if (tipoConsulta === 'charlson_media') {
      // Caso especial: devolver la media
      if (resultados.length > 0) {
        return {
          resultado: Math.round(resultados[0].media * 100) / 100,
          numero_pacientes: resultados[0].total
        };
      }
      return { resultado: 0, numero_pacientes: 0 };
    }
    
    // Para otros casos: contar resultados
    const numerador = resultados.length;
    
    // Para calcular porcentaje, necesitamos el denominador (total de pacientes)
    // Obtener total de pacientes prevalentes en el periodo para este centro
    const totalPacientes = await collection.distinct('NREGGEN', {
      centro: centro,
      fecha: {
        $gte: new Date(fechaInicio),
        $lte: new Date(fechaFin)
      }
    });
    
    const denominador = totalPacientes.length;
    const porcentaje = denominador > 0 ? Math.round((numerador * 100.0 / denominador) * 100) / 100 : 0;
    
    console.log(`✅ MongoDB ${centro}: ${numerador}/${denominador} = ${porcentaje}%`);
    
    return {
      resultado: tipoConsulta.includes('porcentaje') || tipoConsulta.includes('prevalentes') ? porcentaje : numerador,
      numero_pacientes: denominador
    };
    
  } catch (error) {
    console.error(`❌ Error en consulta MongoDB (${tipoTest}/${centro}):`, error.message);
    return { resultado: 0, numero_pacientes: 0 };
  }
}

/**
 * Cerrar conexión MongoDB (cleanup)
 */
async function cerrarConexionMongoDB() {
  if (mongoClient) {
    await mongoClient.close();
    mongoClient = null;
    console.log('✅ Conexión MongoDB cerrada');
  }
}

module.exports = {
  obtenerConexionMongoDB,
  extraerTipoTestDesdeQuery,
  centroTieneDatosMongo,
  consultarTestMongo,
  cerrarConexionMongoDB,
  MAPEO_TESTS_MONGO
};
