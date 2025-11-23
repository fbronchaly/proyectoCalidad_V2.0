// controllers/flux/guardarResultadosLocal.js
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

// 👉 Ajusta estos valores si usas otras variables de entorno
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DBNAME || 'calidad';
const COLLECTION_NAME = 'indicadores_resultados';

let clienteMongo;

/**
 * Devuelve la colección Mongo conectada (reutiliza la conexión).
 */
async function getCollection() {
  if (!clienteMongo) {
    // ❌ SIN useNewUrlParser / useUnifiedTopology (driver moderno)
    clienteMongo = new MongoClient(MONGODB_URI);
    await clienteMongo.connect();
    console.log(`✅ Conectado a MongoDB en ${MONGODB_URI}, db=${DB_NAME}`);
  }

  const db = clienteMongo.db(DB_NAME);
  return db.collection(COLLECTION_NAME);
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
 * usando el modelo nuevo, SIN cambiar lo que ve el frontend.
 *
 * @param {string} fechaInicio
 * @param {string} fechaFin
 * @param {Array<string>} baseDatos
 * @param {Array<string>} indices
 * @param {Array<object>} salida  // lo que devuelve comienzoFlujo
 */
async function guardarResultadosLocal(fechaInicio, fechaFin, baseDatos, indices, salida) {
  const col = await getCollection();

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

  // Transformamos cada elemento de "salida" (cada indicador) al modelo nuevo
  const documentos = salida.map((ind) => {
    const resultadosPorBase = ind.resultados || [];

    // Fuentes de datos únicas a partir de baseData
    const fuentes_datos = Array.from(
      new Set(resultadosPorBase.map((r) => r.baseData || 'SIN_BASE'))
    );

    // Estado de cálculo: ok si ninguna base trae error, parcial si alguna lo trae
    let estado_calculo = 'ok';
    if (resultadosPorBase.some((r) => r.error)) {
      estado_calculo = 'parcial';
    }
    if (resultadosPorBase.length === 0) {
      // Si no hay resultados para ese indicador, puedes marcarlo como parcial o error
      estado_calculo = 'parcial';
    }

    const resultados = resultadosPorBase.map((r) => ({
      id_resultado: `${ind.id_code}-${r.baseData || 'SIN_BASE'}-${hastaStr || ''}`,
      base: {
        code: r.baseData || 'SIN_BASE',
        nombre: r.baseData || 'SIN_BASE'
      },
      indice: {
        id_code: ind.id_code,
        label: ind.indicador
      },
      payload: {
        // valor principal del indicador (puedes adaptar si cambias el nombre)
        valor: Number(r.resultado || 0),
        // número de pacientes (busca en numeroDePacientes o numero_pacientes)
        numero_pacientes: Number(
          r.numeroDePacientes ??
          r.numero_pacientes ??
          0
        )
      },
      metadata_calculo: {
        categoria: ind.categoria,
        consulta_sql: ind.consulta_sql,
        intervalo: ind.intervalo
      },
      creado_en: ahora
    }));

    return {
      id_transaccion: idTransaccion,
      periodo_aplicado: {
        desde: periodoDesde,
        hasta: periodoHasta
      },
      version: '1.0.0',
      fuentes_datos,
      estado_calculo,
      resultados
    };
  });

  if (!documentos.length) {
    console.log('⚠️ guardarResultadosLocal: no hay documentos que insertar.');
    return { id_transaccion: idTransaccion, insertedCount: 0 };
  }
  
  console.log("🧪 Documento que intenta insertar:", JSON.stringify(documentos, null, 2));

  const result = await col.insertMany(documentos);
  console.log(`💾 Guardados ${result.insertedCount} documentos en Mongo (indicadores_resultados).`);

  return {
    id_transaccion: idTransaccion,
    insertedCount: result.insertedCount
  };
}

module.exports = {
  guardarResultadosLocal
};
