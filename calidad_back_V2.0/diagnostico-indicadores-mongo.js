/**
 * diagnostico-indicadores-mongo.js
 *
 * Script de diagnóstico para identificar por qué los indicadores MongoDB
 * devuelven resultado 0. Investiga 4 capas:
 *
 *  1. Datos en test_responses (form_ids reales, centros reales, fechas reales)
 *  2. Bug { "$date": "..." } — objeto plano vs Date real en el pipeline
 *  3. Pipeline sin filtro de fechas — ¿hay datos para ese centro y form_id?
 *  4. Pipeline completo con fechas correctas — resultado esperado
 *
 * Uso:
 *   node diagnostico-indicadores-mongo.js
 *   node diagnostico-indicadores-mongo.js --centro "LAS ENCINAS" --desde 01-01-2024 --hasta 31-12-2025
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { MongoClient } = require('mongodb');

const MONGODB_URI  = process.env.MONGODB_URI  || 'mongodb://127.0.0.1:27017';
const DB_NAME      = process.env.MONGODB_DBNAME || 'DatosCalidad';
const COLLECTION   = 'test_responses';

// Parámetros por línea de comandos o valores por defecto amplios
const args = process.argv.slice(2);
const getArg = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const CENTRO_FILTRO = getArg('--centro') || null;   // null = mostrar todos
const DESDE_STR     = getArg('--desde')  || '01-01-2020';
const HASTA_STR     = getArg('--hasta')  || '31-12-2026';

// Parsea DD-MM-YYYY → Date
function parseDDMMYYYY(str) {
  const [dd, mm, yyyy] = str.split('-').map(Number);
  return new Date(yyyy, mm - 1, dd);
}

const FECHA_INICIO = parseDDMMYYYY(DESDE_STR);
const FECHA_FIN    = parseDDMMYYYY(HASTA_STR);
FECHA_FIN.setHours(23, 59, 59, 999);

// Form IDs esperados según CONSULTAS_INDICADORES_COMORBILIDAD.md
const FORM_IDS_ESPERADOS = {
  'frail':                    { umbral: '>= 3',  campo: 'puntuacion' },
  'indice_barthel':           { umbral: '<= 75', campo: 'puntuacion' },
  'charlson_comorbidity_index':{ umbral: 'avg',  campo: 'puntuacion' },
  'mna_sf':                   { umbral: '<= 11', campo: 'puntuacion' },
  'lawton_brody':             { umbral: '< 8',   campo: 'puntuacion' },
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function sep(char = '═', n = 65) { return char.repeat(n); }
function titulo(txt) { console.log(`\n${sep()}\n  ${txt}\n${sep()}`); }
function ok(txt)   { console.log(`  ✅  ${txt}`); }
function warn(txt) { console.log(`  ⚠️   ${txt}`); }
function err(txt)  { console.log(`  ❌  ${txt}`); }
function info(txt) { console.log(`  ℹ️   ${txt}`); }

// ─────────────────────────────────────────────────────────────────────────────
// PASO 1 — Estado general de test_responses
// ─────────────────────────────────────────────────────────────────────────────
async function paso1_estadoGeneral(col) {
  titulo('PASO 1 · Estado general de test_responses');

  const total = await col.countDocuments();
  info(`Total documentos en colección: ${total}`);
  if (total === 0) { err('La colección está VACÍA — no hay datos que procesar.'); return false; }

  // form_ids reales
  const formIds = await col.distinct('metadata.form_id');
  info(`form_ids distintos encontrados (${formIds.length}):`);
  formIds.sort().forEach(f => {
    const esperado = Object.keys(FORM_IDS_ESPERADOS).includes(f);
    console.log(`       ${esperado ? '✅' : '⚠️ '} "${f}"${esperado ? '' : '  ← NO está en indicadores_mongo.json'}`);
  });

  // Detectar form_ids esperados ausentes
  for (const fid of Object.keys(FORM_IDS_ESPERADOS)) {
    if (!formIds.includes(fid)) {
      err(`form_id esperado NO existe en BD: "${fid}"`);
    }
  }

  // Centros reales
  const centros = await col.distinct('metadata.centro');
  info(`Centros distintos (${centros.length}):`);
  centros.sort().forEach(c => console.log(`       • "${c}"`));

  // Rango de fechas en metadata.fecha_insercion
  const muestras = await col.find(
    { 'metadata.fecha_insercion': { $exists: true, $ne: null } },
    { projection: { 'metadata.fecha_insercion': 1 } }
  ).sort({ 'metadata.fecha_insercion': 1 }).limit(1).toArray();

  const muestrasMax = await col.find(
    { 'metadata.fecha_insercion': { $exists: true, $ne: null } },
    { projection: { 'metadata.fecha_insercion': 1 } }
  ).sort({ 'metadata.fecha_insercion': -1 }).limit(1).toArray();

  if (muestras.length) {
    info(`Fecha más antigua en BD: "${muestras[0].metadata.fecha_insercion}"`);
    info(`Fecha más reciente en BD: "${muestrasMax[0].metadata.fecha_insercion}"`);
    info(`Rango solicitado:         "${DESDE_STR}" → "${HASTA_STR}"`);
  } else {
    warn('No se encontró ningún documento con metadata.fecha_insercion');
  }

  // Muestra de un documento real
  const muestra = await col.findOne({});
  if (muestra) {
    info('Muestra de documento (campos de nivel raíz):');
    Object.keys(muestra).forEach(k => console.log(`       • ${k}: ${JSON.stringify(muestra[k])?.substring(0, 80)}`));
  }

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 2 — Diagnóstico del bug { "$date": "..." }
// ─────────────────────────────────────────────────────────────────────────────
async function paso2_bugDate(col) {
  titulo('PASO 2 · Bug { "$date": "..." } en _prepararPipeline');

  // Simular lo que hace _prepararPipeline actual
  const templateStr = JSON.stringify({
    "$match": {
      "fechaDate": {
        "$gte": { "$date": "{{fechaInicio}}T00:00:00.000Z" },
        "$lte": { "$date": "{{fechaFin}}T23:59:59.999Z" }
      }
    }
  });

  const isoInicio = '2024-01-01';
  const isoFin    = '2025-12-31';
  const reemplazado = templateStr
    .replace(/\{\{fechaInicio\}\}/g, isoInicio)
    .replace(/\{\{fechaFin\}\}/g, isoFin);

  const parsed = JSON.parse(reemplazado);
  const gteVal = parsed.$match.fechaDate.$gte;

  info(`Valor de $gte tras JSON.parse: ${JSON.stringify(gteVal)}`);
  info(`Tipo JS: ${typeof gteVal}  |  ¿es Date?: ${gteVal instanceof Date}`);

  if (!(gteVal instanceof Date) && typeof gteVal === 'object' && gteVal.$date) {
    err('BUG CONFIRMADO: { "$date": "..." } es un objeto plano, NO un Date de JavaScript.');
    err('MongoDB driver no interpreta $date en aggregation pipeline → $match de fechas no filtra nada.');
    warn('Solución: el pipeline debe usar objetos Date reales, no { "$date": "..." }.');
  } else if (gteVal instanceof Date) {
    ok('Las fechas se pasan correctamente como objetos Date.');
  } else {
    warn(`Valor inesperado para $gte: ${JSON.stringify(gteVal)}`);
  }

  // Prueba con Date real — cuántos documentos tiene fecha_insercion con $dateFromString válido
  info('Probando $dateFromString sobre una muestra de 5 documentos...');
  try {
    const test = await col.aggregate([
      { $limit: 5 },
      { $addFields: {
          fechaDate: { $dateFromString: { dateString: '$metadata.fecha_insercion', format: '%d-%m-%Y' } }
      }},
      { $project: { 'metadata.fecha_insercion': 1, fechaDate: 1 } }
    ]).toArray();

    if (test.length === 0) {
      warn('No hay documentos para probar $dateFromString');
    } else {
      ok('$dateFromString funciona correctamente:');
      test.forEach(d => {
        console.log(`       "${d.metadata?.fecha_insercion}" → ${d.fechaDate}`);
      });
    }
  } catch (e) {
    err(`$dateFromString falló: ${e.message}`);
    warn('Posible causa: algún documento tiene fecha_insercion en formato distinto a DD-MM-YYYY o null.');

    // Buscar documentos con fecha_insercion problemática
    const problemas = await col.find({
      $or: [
        { 'metadata.fecha_insercion': null },
        { 'metadata.fecha_insercion': { $exists: false } },
        { 'metadata.fecha_insercion': { $not: /^\d{2}-\d{2}-\d{4}$/ } }
      ]
    }, { projection: { 'metadata.fecha_insercion': 1, 'metadata.form_id': 1 } }).limit(10).toArray();

    if (problemas.length > 0) {
      warn(`Documentos con fecha_insercion inválida (mostrando hasta 10):`);
      problemas.forEach(d => {
        console.log(`       _id: ${d._id}  form_id: ${d.metadata?.form_id}  fecha: "${d.metadata?.fecha_insercion}"`);
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 3 — Pipeline SIN filtro de fechas (¿hay datos por centro y form_id?)
// ─────────────────────────────────────────────────────────────────────────────
async function paso3_sinFechas(col) {
  titulo('PASO 3 · Pipeline SIN filtro de fechas (¿existen datos por form_id + centro?)');

  const centros = CENTRO_FILTRO ? [CENTRO_FILTRO] : await col.distinct('metadata.centro');

  for (const [formId] of Object.entries(FORM_IDS_ESPERADOS)) {
    for (const centro of centros.slice(0, 3)) { // máx 3 centros para no saturar
      const count = await col.countDocuments({
        'metadata.form_id': formId,
        'metadata.centro': centro
      });
      const icono = count > 0 ? '✅' : '❌';
      console.log(`  ${icono}  form_id="${formId}"  centro="${centro}"  → ${count} docs`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 4 — Pipeline CON fechas correctas (Date real de JS)
// ─────────────────────────────────────────────────────────────────────────────
async function paso4_conFechasCorrectas(col) {
  titulo('PASO 4 · Pipeline completo con Date reales de JS');

  const centros = CENTRO_FILTRO ? [CENTRO_FILTRO] : (await col.distinct('metadata.centro')).slice(0, 2);
  const formIds = Object.keys(FORM_IDS_ESPERADOS);

  for (const centro of centros) {
    for (const formId of formIds) {
      try {
        const resultado = await col.aggregate([
          { $match: { 'metadata.form_id': formId, 'metadata.centro': centro } },
          { $addFields: {
              fechaDate: { $dateFromString: { dateString: '$metadata.fecha_insercion', format: '%d-%m-%Y', onError: null, onNull: null } }
          }},
          { $match: { fechaDate: { $gte: FECHA_INICIO, $lte: FECHA_FIN } } },
          { $group: { _id: '$metadata.NREGGEN', ultimo: { $last: '$$ROOT' } } },
          { $count: 'total' }
        ]).toArray();

        const total = resultado[0]?.total ?? 0;
        const icono = total > 0 ? '✅' : '❌';
        console.log(`  ${icono}  form_id="${formId}"  centro="${centro}"  periodo=${DESDE_STR}→${HASTA_STR}  pacientes únicos: ${total}`);

      } catch(e) {
        err(`form_id="${formId}" centro="${centro}" → ERROR: ${e.message}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PASO 5 — Simular indicador FRAIL completo con Date reales
// ─────────────────────────────────────────────────────────────────────────────
async function paso5_indicadorFrailCompleto(col) {
  titulo('PASO 5 · Simulación indicador FRAIL completo (con Date reales)');

  const centros = CENTRO_FILTRO ? [CENTRO_FILTRO] : (await col.distinct('metadata.centro')).slice(0, 2);

  for (const centro of centros) {
    info(`Centro: "${centro}"  |  Periodo: ${DESDE_STR} → ${HASTA_STR}`);
    try {
      const res = await col.aggregate([
        { $match: { 'metadata.form_id': 'frail', 'metadata.centro': centro } },
        { $addFields: {
            fechaDate: { $dateFromString: { dateString: '$metadata.fecha_insercion', format: '%d-%m-%Y', onError: null, onNull: null } }
        }},
        { $match: { fechaDate: { $gte: FECHA_INICIO, $lte: FECHA_FIN } } },
        { $sort: { 'metadata.NREGGEN': 1, fechaDate: -1 } },
        { $group: { _id: '$metadata.NREGGEN', ultimoTest: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$ultimoTest' } },
        { $facet: {
            total:         [{ $count: 'count' }],
            conFragilidad: [{ $match: { puntuacion: { $gte: 3 } } }, { $count: 'count' }]
        }},
        { $project: {
            numero_pacientes: { $arrayElemAt: ['$total.count', 0] },
            numerador:        { $arrayElemAt: ['$conFragilidad.count', 0] },
            resultado: { $cond: {
              if:   { $gt: [{ $arrayElemAt: ['$total.count', 0] }, 0] },
              then: { $multiply: [{ $divide: [{ $arrayElemAt: ['$conFragilidad.count', 0] }, { $arrayElemAt: ['$total.count', 0] }] }, 100] },
              else: 0
            }}
        }}
      ]).toArray();

      if (res.length > 0 && res[0].numero_pacientes > 0) {
        ok(`Resultado: ${res[0].resultado?.toFixed(2)}%  |  Pacientes: ${res[0].numero_pacientes}  |  Con fragilidad: ${res[0].numerador}`);
      } else {
        warn(`Sin resultados. Pipeline devolvió: ${JSON.stringify(res[0] ?? {})}`);
      }
    } catch(e) {
      err(`Error en pipeline FRAIL: ${e.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(sep());
  console.log('  DIAGNÓSTICO INDICADORES MONGODB');
  console.log(`  URI:    ${MONGODB_URI}`);
  console.log(`  DB:     ${DB_NAME}`);
  console.log(`  Centro: ${CENTRO_FILTRO ?? '(todos)'}`);
  console.log(`  Desde:  ${DESDE_STR}  Hasta: ${HASTA_STR}`);
  console.log(sep());

  const client = new MongoClient(MONGODB_URI);
  try {
    await client.connect();
    ok('Conexión a MongoDB establecida');
    const db  = client.db(DB_NAME);
    const col = db.collection(COLLECTION);

    const hayDatos = await paso1_estadoGeneral(col);
    await paso2_bugDate(col);
    if (hayDatos) {
      await paso3_sinFechas(col);
      await paso4_conFechasCorrectas(col);
      await paso5_indicadorFrailCompleto(col);
    }

    titulo('RESUMEN');
    info('Si el PASO 2 confirmó el bug de { "$date": "..." }, ejecuta:');
    console.log('\n     node aplicar-fix-mongoengine.js\n');
    info('Si el PASO 3 muestra 0 docs para todos los form_id, los datos no están en test_responses.');
    info('Si el PASO 4 muestra pacientes > 0, el fix es solo en MongoEngine._prepararPipeline.');

  } catch(e) {
    err(`Error fatal: ${e.message}`);
    console.error(e.stack);
  } finally {
    await client.close();
    console.log('\n  Conexión cerrada.\n');
  }
}

main().catch(console.error);
