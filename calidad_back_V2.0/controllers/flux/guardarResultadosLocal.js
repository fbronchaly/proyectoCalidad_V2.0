// controllers/flux/guardarResultadosLocal.js
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// 👉 Ajusta estos valores si usas otras variables de entorno
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DBNAME || 'calidad';

let clienteMongo;

/**
 * Devuelve la base de datos conectada (reutiliza la conexión).
 */
async function getDb() {
  if (!clienteMongo) {
    clienteMongo = new MongoClient(MONGODB_URI);
    await clienteMongo.connect();
    console.log(`✅ Conectado a MongoDB en ${MONGODB_URI}, db=${DB_NAME}`);
  }
  return clienteMongo.db(DB_NAME);
}

/**
 * Normaliza fechas tipo DD-MM-YYYY o YYYY-MM-DD a YYYY-MM-DD.
 */
function toISODateStr(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();

  // DD-MM-YYYY
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  // Ya en formato YYYY-MM-DD (o similar)
  return s.slice(0, 10);
}

/**
 * Guarda en Mongo los resultados devueltos por comienzoFlujo
 * usando el modelo RELACIONAL (Opción A).
 *
 * @param {string} fechaInicio
 * @param {string} fechaFin
 * @param {Array<string>} baseDatos
 * @param {Array<string>} indices
 * @param {Array<object>} salida  // lo que devuelve comienzoFlujo
 */
async function guardarResultadosLocal(fechaInicio, fechaFin, baseDatos, indices, salida) {
  const db = await getDb();
  const colEjecuciones = db.collection('ejecuciones');
  const colResultados = db.collection('resultados');

  const desdeStr = toISODateStr(fechaInicio);
  const hastaStr = toISODateStr(fechaFin);

  const periodoDesde = desdeStr ? new Date(`${desdeStr}T00:00:00Z`) : new Date();
  const periodoHasta = hastaStr ? new Date(`${hastaStr}T00:00:00Z`) : new Date();

  // Un id_transaccion común para todos los indicadores de esta ejecución
  const idTransaccion = crypto.randomUUID();
  const ahora = new Date();

  if (!Array.isArray(salida) || salida.length === 0) {
    console.log('⚠️ guardarResultadosLocal: salida vacía, no hay indicadores que guardar.');
    return { id_transaccion: idTransaccion, insertedCount: 0 };
  }

  // 1. Preparar array de Resultados (Detalle)
  const documentosResultados = [];
  let hayErrores = false;

  console.log(`🔍 guardarResultadosLocal: Procesando ${salida.length} indicadores de entrada.`);

  salida.forEach((ind, idx) => {
    const resultadosPorBase = ind.resultados || [];
    console.log(`   - Indicador [${idx}] ${ind.id_code || 'SIN_ID'}: ${resultadosPorBase.length} resultados encontrados.`);
    
    // Si no hay resultados para este indicador, podríamos guardar un registro de error o simplemente omitirlo.
    // Aquí asumimos que si hay error en el cálculo, vendrá en 'resultadosPorBase' con alguna flag.

    resultadosPorBase.forEach((r) => {
      if (r.error) hayErrores = true;

      // Construcción defensiva del documento para cumplir con el esquema estricto
      const docResultado = {
        id_transaccion: idTransaccion,
        id_resultado: `${ind.id_code || 'SIN_CODIGO'}-${r.baseData || 'SIN_BASE'}-${hastaStr || ''}-${crypto.randomUUID().slice(0,8)}`, // ID único lógico
        base: {
          code: String(r.baseData || 'SIN_BASE'),
          nombre: String(r.baseData || 'SIN_BASE') // Podrías buscar el nombre real si lo tienes disponible
        },
        indice: {
          id_code: String(ind.id_code || 'SIN_CODIGO'),
          label: String(ind.indicador || 'SIN_NOMBRE')
        },
        payload: {
          valor: (typeof r.resultado === 'number' && !isNaN(r.resultado)) ? r.resultado : Number(r.resultado || 0),
          numero_pacientes: Number(r.numeroDePacientes ?? r.numero_pacientes ?? 0)
        },
        metadata_calculo: {
          // Convertimos explícitamente a String o undefined para evitar errores de tipo BSON
          categoria: ind.categoria ? String(ind.categoria) : undefined,
          consulta_sql: ind.consulta_sql ? String(ind.consulta_sql) : undefined,
          intervalo: ind.intervalo ? String(ind.intervalo) : undefined,
          error: r.error ? String(r.error) : undefined
        },
        creado_en: ahora
      };

      documentosResultados.push(docResultado);
    });
  });

  // 2. Preparar documento de Ejecución (Cabecera)
  const documentoEjecucion = {
    id_transaccion: idTransaccion,
    periodo_aplicado: {
      desde: periodoDesde,
      hasta: periodoHasta
    },
    version: '1.0.0',
    estado_global: hayErrores ? 'parcial' : 'ok',
    resumen: {
      total_indicadores: salida.length,
      total_centros: baseDatos ? baseDatos.length : 0
    },
    creado_en: ahora
  };

  if (documentosResultados.length === 0) {
    console.log('⚠️ guardarResultadosLocal: no se generaron resultados detallados (array vacío).');
    // Aún así guardamos la ejecución para que conste que se corrió
    await colEjecuciones.insertOne(documentoEjecucion);
    return { id_transaccion: idTransaccion, insertedCount: 0 };
  }
  
  console.log(`📦 Preparados ${documentosResultados.length} documentos para insertar en 'resultados'.`);

  // 3. Insertar en MongoDB (Transaccionalidad simulada por orden)
  // Primero insertamos la cabecera
  await colEjecuciones.insertOne(documentoEjecucion);
  console.log(`💾 Guardada ejecución ${idTransaccion} en colección 'ejecuciones'.`);

  // Luego insertamos los detalles
  try {
    const result = await colResultados.insertMany(documentosResultados, { ordered: false });
    console.log(`💾 Guardados ${result.insertedCount} resultados en colección 'resultados'.`);
    
    return {
      id_transaccion: idTransaccion,
      insertedCount: result.insertedCount
    };
  } catch (err) {
    console.error('❌ Error al insertar resultados en MongoDB:', err.message);
    if (err.writeErrors && err.writeErrors.length > 0) {
      console.error('🔍 Detalle del primer error de validación:', JSON.stringify(err.writeErrors[0].err, null, 2));
      console.error('📄 Documento que falló:', JSON.stringify(documentosResultados[err.writeErrors[0].index], null, 2));
    }
    // Retornamos lo que se haya podido guardar (si ordered: false permitió parciales)
    return {
      id_transaccion: idTransaccion,
      insertedCount: err.result ? err.result.nInserted : 0,
      error: err.message
    };
  }
}

module.exports = {
  guardarResultadosLocal
};
