// controllers/flux/guardarResultadosLocal.js
const { MongoClient } = require('mongodb');
const crypto = require('crypto');

let clienteMongo;

/**
 * Devuelve la base de datos conectada (reutiliza la conexión).
 */
async function getDb() {
  // Leemos las variables de entorno AQUÍ, justo antes de usarla, para asegurar que ya estén cargadas
  const MONGODB_URI = 'mongodb://127.0.0.1:27017';
  const DB_NAME = process.env.MONGODB_DBNAME || 'DatosCalidad';

  if (!clienteMongo) {
    console.log(`🔌 Conectando a MongoDB... (URI definida: ${!!process.env.MONGODB_URI})`);

    // ⏱️ Evitar “cuelgues” por selección de servidor/DNS (Atlas SRV) en redes inestables
    const clientOptions = {
      serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 8000),
      connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 8000),
      socketTimeoutMS: Number(process.env.MONGODB_SOCKET_TIMEOUT_MS || 20000)
    };

    const maxRetries = Number(process.env.MONGODB_CONNECT_RETRIES || 2);
    let lastErr;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`🔁 Reintentando conexión a MongoDB (intento ${attempt}/${maxRetries})...`);
          await new Promise(r => setTimeout(r, 500 * attempt));
        }

        clienteMongo = new MongoClient(MONGODB_URI, clientOptions);
        await clienteMongo.connect();

        console.log(`✅ Conectado a MongoDB en ${MONGODB_URI.replace(/:([^:@]+)@/, ':****@')}, db=${DB_NAME}`);
        lastErr = undefined;
        break;
      } catch (err) {
        lastErr = err;
        try {
          await clienteMongo?.close();
        } catch {
          // ignore
        }
        clienteMongo = null;
      }
    }

    if (lastErr) {
      console.error('⛔ No se pudo conectar a MongoDB tras reintentos:', lastErr?.message || lastErr);
      throw lastErr;
    }
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
          // Persistir unidad si viene informada (schema permite string o null)
          unidad: (ind.unidad ?? r.unidad ?? null) == null ? null : String(ind.unidad ?? r.unidad),
          numero_pacientes: Number(r.numeroDePacientes ?? r.numero_pacientes ?? 0)
        },
        metadata_calculo: {
          // Convertimos explícitamente a String o undefined para evitar errores de tipo BSON
          categoria: ind.categoria ? String(ind.categoria) : undefined,
          consulta_sql: ind.consulta_sql ? String(ind.consulta_sql) : undefined,
          // CORRECCIÓN: Manejar correctamente el objeto intervalo para que no sea "[object Object]"
          intervalo: (() => {
            if (!ind.intervalo) return undefined;
            if (typeof ind.intervalo === 'object') {
              const { fechaInicio, fechaFin } = ind.intervalo;
              // Si tiene propiedades de fecha, formateamos
              if (fechaInicio || fechaFin) {
                return `${fechaInicio || '?'} - ${fechaFin || '?'}`;
              }
              // Si es otro tipo de objeto, lo serializamos para no perder info
              try {
                return JSON.stringify(ind.intervalo);
              } catch (e) {
                return String(ind.intervalo);
              }
            }
            return String(ind.intervalo);
          })(),
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
    try {
      await colEjecuciones.insertOne(documentoEjecucion);
    } catch (err) {
      console.error('❌ Error al insertar ejecución vacía:', err.message);
    }
    return { id_transaccion: idTransaccion, insertedCount: 0 };
  }
  
  console.log(`📦 Preparados ${documentosResultados.length} documentos para insertar en 'resultados'.`);

  // 3. Insertar en MongoDB (Transaccionalidad simulada por orden)
  // Primero insertamos la cabecera
  try {
    await colEjecuciones.insertOne(documentoEjecucion);
    console.log(`💾 Guardada ejecución ${idTransaccion} en colección 'ejecuciones'.`);
  } catch (err) {
    console.error('❌ Error CRÍTICO al insertar ejecución (cabecera):', err.message);
    // Si falla la cabecera, ¿deberíamos detenernos? 
    // Probablemente sí, para mantener consistencia, pero el usuario dice que se guardan resultados y no ejecuciones.
    // Vamos a dejar que continúe pero logueando fuerte.
    if (err.writeErrors && err.writeErrors.length > 0) {
       console.error('🔍 Detalle error validación ejecución:', JSON.stringify(err.writeErrors[0].err, null, 2));
    }
  }

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
