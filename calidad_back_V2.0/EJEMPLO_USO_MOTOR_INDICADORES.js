/**
 * EJEMPLO DE USO DEL MOTOR DE INDICADORES HÍBRIDO
 * 
 * Este archivo muestra cómo utilizar el sistema de indicadores
 * tanto con Firebird como con MongoDB
 */

const IndicadorEngineFactory = require('./controllers/indicadores/indicadorEngine.factory');
const indicadorService = require('./controllers/indicadores/indicador.service');

// ========================================
// EJEMPLO 1: Ejecutar indicador Firebird
// ========================================
async function ejemploFirebird() {
  console.log('=== EJEMPLO 1: Firebird ===\n');

  const indicador = {
    id_code: 'COMORB_FRAIL_PREV',
    categoria: 'Comorbilidad - Fragilidad',
    indicador: '% pacientes prevalentes con fragilidad',
    unidad: '%',
    engine: 'firebird',
    template: `
      WITH PacientesPrevalentes AS (
        SELECT DISTINCT p.NREGGEN 
        FROM PACIENTES p 
        WHERE p.MODAL_TRAT = 'H' 
          AND s.FECHA BETWEEN :FECHAINI AND :FECHAFIN
      )
      SELECT 
        COUNT(DISTINCT CASE WHEN fp.PUNTOS_TOT >= 3 THEN fp.NREGGEN END) * 100.0 / 
        NULLIF(COUNT(DISTINCT pp.NREGGEN), 0) AS resultado,
        COUNT(DISTINCT pp.NREGGEN) AS numero_pacientes
      FROM PacientesPrevalentes pp
    `
  };

  const fuente = {
    code: 'DB1',
    config: {
      host: 'localhost',
      port: 3050,
      database: '/path/to/database.fdb',
      user: 'SYSDBA',
      password: 'masterkey'
    }
  };

  const engine = IndicadorEngineFactory.crearEngine('firebird', fuente.config);
  
  const resultado = await engine.ejecutarIndicador(indicador, {
    fechaInicio: '2026-01-01',
    fechaFin: '2026-01-31',
    code: 'DB1'
  });

  console.log('Resultado:', resultado);
  await engine.cerrar();
}

// ========================================
// EJEMPLO 2: Ejecutar indicador MongoDB
// ========================================
async function ejemploMongoDB(mongoDb) {
  console.log('\n=== EJEMPLO 2: MongoDB ===\n');

  const indicador = {
    id_code: 'COMORB_FRAIL_PREV_MONGO',
    categoria: 'Comorbilidad - Fragilidad',
    indicador: '% pacientes prevalentes con fragilidad',
    unidad: '%',
    engine: 'mongo',
    collection: 'frail',
    aggregation: [
      {
        $match: {
          centro: '{{centro}}',
          fecha: {
            $gte: '{{fechaInicio}}',
            $lte: '{{fechaFin}}'
          }
        }
      },
      {
        $group: {
          _id: '$NREGGEN',
          ultimoTest: { $first: '$$ROOT' }
        }
      },
      {
        $facet: {
          total: [{ $count: 'count' }],
          conFragilidad: [
            { $match: { puntuacion_total: { $gte: 3 } } },
            { $count: 'count' }
          ]
        }
      },
      {
        $project: {
          numero_pacientes: { $arrayElemAt: ['$total.count', 0] },
          numerador: { $arrayElemAt: ['$conFragilidad.count', 0] },
          resultado: {
            $multiply: [
              {
                $divide: [
                  { $arrayElemAt: ['$conFragilidad.count', 0] },
                  { $arrayElemAt: ['$total.count', 0] }
                ]
              },
              100
            ]
          }
        }
      }
    ]
  };

  const fuente = {
    code: 'MONGO_CENTRO_01',
    centro: 'CENTRO_01',
    config: {
      db: mongoDb,
      centro: 'CENTRO_01'
    }
  };

  const engine = IndicadorEngineFactory.crearEngine('mongo', fuente.config);
  
  const resultado = await engine.ejecutarIndicador(indicador, {
    fechaInicio: '2026-01-01',
    fechaFin: '2026-01-31',
    code: 'MONGO_CENTRO_01',
    centro: 'CENTRO_01'
  });

  console.log('Resultado:', resultado);
  await engine.cerrar();
}

// ========================================
// EJEMPLO 3: Usar el servicio completo
// ========================================
async function ejemploServicioCompleto() {
  console.log('\n=== EJEMPLO 3: Servicio Completo ===\n');

  // Cargar catálogos
  await indicadorService.cargarIndicadores();

  // Ejecutar múltiples indicadores en múltiples fuentes
  const resultados = await indicadorService.ejecutarIndicadoresMasivo({
    indicadores: ['COMORB_FRAIL_PREV_MONGO', 'COMORB_BARTHEL_PREV_MONGO'],
    fuentes: [
      {
        code: 'MONGO_CENTRO_01',
        centro: 'CENTRO_01',
        config: {
          db: global.mongoDb, // Asumiendo conexión global
          centro: 'CENTRO_01'
        }
      },
      {
        code: 'MONGO_CENTRO_02',
        centro: 'CENTRO_02',
        config: {
          db: global.mongoDb,
          centro: 'CENTRO_02'
        }
      }
    ],
    fechaInicio: '2026-01-01',
    fechaFin: '2026-01-31'
  });

  console.log('Resultados totales:', resultados.length);
  resultados.forEach(r => {
    console.log(`\n${r.code}:`);
    console.log(`  Resultado: ${r.resultado}${r.metadata.unidad}`);
    console.log(`  Pacientes: ${r.numero_pacientes}`);
  });
}

// ========================================
// EJEMPLO 4: Detectar tipo de fuente
// ========================================
function ejemploDeteccionTipo() {
  console.log('\n=== EJEMPLO 4: Detección de Tipo ===\n');

  const ejemplos = [
    'DB1',
    'DB15',
    'MONGO_CENTRO_01',
    'CENTRO_MADRID',
    'MONGO_TEST'
  ];

  ejemplos.forEach(code => {
    const { tipo, esCentroMongo } = IndicadorEngineFactory.detectarTipoFuente(code);
    console.log(`${code} → Tipo: ${tipo}, Es Mongo: ${esCentroMongo}`);
  });
}

// ========================================
// EJEMPLO 5: Validar compatibilidad
// ========================================
async function ejemploValidacionCompatibilidad() {
  console.log('\n=== EJEMPLO 5: Validación de Compatibilidad ===\n');

  const casosTest = [
    // Caso 1: Solo Firebird
    {
      nombre: 'Solo Firebird',
      fuentes: [
        { code: 'DB1' },
        { code: 'DB2' }
      ]
    },
    // Caso 2: Solo MongoDB
    {
      nombre: 'Solo MongoDB',
      fuentes: [
        { code: 'MONGO_CENTRO_01' },
        { code: 'MONGO_CENTRO_02' }
      ]
    },
    // Caso 3: Mixto (con advertencia)
    {
      nombre: 'Mixto (Firebird + MongoDB)',
      fuentes: [
        { code: 'DB1' },
        { code: 'MONGO_CENTRO_01' }
      ]
    }
  ];

  casosTest.forEach(caso => {
    const validacion = indicadorService.validarComparacion(caso.fuentes);
    console.log(`\n${caso.nombre}:`);
    console.log(`  Válido: ${validacion.valida}`);
    if (validacion.advertencia) {
      console.log(`  ⚠️  ${validacion.advertencia}`);
    }
  });
}

// ========================================
// EJEMPLO 6: Crear índices MongoDB
// ========================================
async function ejemploCrearIndices(mongoDb) {
  console.log('\n=== EJEMPLO 6: Crear Índices MongoDB ===\n');

  const colecciones = ['frail', 'barthel', 'charlson', 'mna', 'lawton'];

  for (const coleccion of colecciones) {
    try {
      await mongoDb.collection(coleccion).createIndex({
        centro: 1,
        fecha: -1,
        NREGGEN: 1
      });
      console.log(`✅ Índice creado en ${coleccion}`);
    } catch (error) {
      console.error(`❌ Error en ${coleccion}:`, error.message);
    }
  }
}

// ========================================
// EXPORTAR EJEMPLOS
// ========================================
module.exports = {
  ejemploFirebird,
  ejemploMongoDB,
  ejemploServicioCompleto,
  ejemploDeteccionTipo,
  ejemploValidacionCompatibilidad,
  ejemploCrearIndices
};

// ========================================
// EJECUTAR SI SE LLAMA DIRECTAMENTE
// ========================================
if (require.main === module) {
  console.log('🚀 Ejecutando ejemplos del motor de indicadores...\n');
  
  // Descomentar para probar cada ejemplo:
  // ejemploDeteccionTipo();
  // await ejemploFirebird();
  // await ejemploMongoDB(mongoDb);
  // await ejemploServicioCompleto();
  // await ejemploValidacionCompatibilidad();
  // await ejemploCrearIndices(mongoDb);
}
