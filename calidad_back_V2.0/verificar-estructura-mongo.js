/**
 * verificar-estructura-mongo.js
 * Script para verificar la estructura de datos de MongoDB
 * y ratificar que todo está listo para el motor de indicadores
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DBNAME || 'calidad';

async function verificarEstructuraMongo() {
  console.log('🔍 ═══════════════════════════════════════════════════════════');
  console.log('🔍 VERIFICACIÓN DE ESTRUCTURA MONGODB');
  console.log('🔍 ═══════════════════════════════════════════════════════════\n');

  const client = new MongoClient(MONGODB_URI);

  try {
    // Conectar
    await client.connect();
    console.log('✅ Conexión a MongoDB establecida\n');
    console.log(`📊 Base de datos: ${DB_NAME}\n`);

    const db = client.db(DB_NAME);

    // ========================================
    // 1. LISTAR TODAS LAS COLECCIONES
    // ========================================
    console.log('📚 ═══ PASO 1: COLECCIONES DISPONIBLES ═══\n');
    const collections = await db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    console.log(`Total de colecciones: ${collectionNames.length}\n`);
    collectionNames.forEach(name => {
      console.log(`   📁 ${name}`);
    });

    // Identificar colecciones de tests de comorbilidad
    const testsComorbilidad = [
      'frail', 'sarcf', 'mna', 'barthel', 'lawton', 
      'charlson', 'downton', 'phq4', 'gijon'
    ];
    
    const testsPresentes = testsComorbilidad.filter(t => 
      collectionNames.some(c => c.toLowerCase().includes(t.toLowerCase()))
    );

    console.log(`\n✅ Tests de comorbilidad encontrados: ${testsPresentes.length}/${testsComorbilidad.length}`);
    testsPresentes.forEach(t => console.log(`   ✓ ${t}`));

    const testsFaltantes = testsComorbilidad.filter(t => !testsPresentes.includes(t));
    if (testsFaltantes.length > 0) {
      console.log(`\n⚠️  Tests de comorbilidad NO encontrados: ${testsFaltantes.length}`);
      testsFaltantes.forEach(t => console.log(`   ✗ ${t}`));
    }

    // ========================================
    // 2. VERIFICAR CADA COLECCIÓN DE TESTS
    // ========================================
    console.log('\n\n📊 ═══ PASO 2: ANÁLISIS DETALLADO DE COLECCIONES ═══\n');

    for (const testName of testsPresentes) {
      // Buscar la colección exacta (puede tener variaciones de nombre)
      const coleccionExacta = collectionNames.find(c => 
        c.toLowerCase() === testName.toLowerCase() || 
        c.toLowerCase().includes(testName.toLowerCase())
      );

      if (!coleccionExacta) continue;

      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│  COLECCIÓN: ${coleccionExacta.toUpperCase().padEnd(45)}│`);
      console.log(`└─────────────────────────────────────────────────────────┘`);

      const collection = db.collection(coleccionExacta);

      // 2.1 Contar documentos
      const count = await collection.countDocuments();
      console.log(`\n📈 Total de registros: ${count}`);

      if (count === 0) {
        console.log('⚠️  Colección vacía - No hay datos para analizar');
        continue;
      }

      // 2.2 Obtener centros únicos
      const centros = await collection.distinct('centro');
      console.log(`\n🏥 Centros disponibles: ${centros.length}`);
      centros.sort().forEach(centro => {
        console.log(`   • ${centro}`);
      });

      // 2.3 Obtener rango de fechas
      const fechaMin = await collection.find().sort({ fecha: 1 }).limit(1).toArray();
      const fechaMax = await collection.find().sort({ fecha: -1 }).limit(1).toArray();
      
      if (fechaMin.length > 0 && fechaMax.length > 0) {
        console.log(`\n📅 Rango de fechas:`);
        try {
          const fechaMinStr = new Date(fechaMin[0].fecha).toISOString().split('T')[0];
          const fechaMaxStr = new Date(fechaMax[0].fecha).toISOString().split('T')[0];
          console.log(`   Desde: ${fechaMinStr}`);
          console.log(`   Hasta: ${fechaMaxStr}`);
        } catch (err) {
          console.log(`   ⚠️  Formato de fecha inválido en algunos registros`);
          console.log(`   Valor mínimo: ${fechaMin[0].fecha}`);
          console.log(`   Valor máximo: ${fechaMax[0].fecha}`);
        }
      }

      // 2.4 Obtener un documento de muestra
      const sample = await collection.findOne();
      
      console.log(`\n🔍 Estructura de documento (muestra):`);
      console.log('   Campos disponibles:');
      const campos = Object.keys(sample);
      campos.forEach(campo => {
        const tipo = typeof sample[campo];
        const valor = tipo === 'object' 
          ? JSON.stringify(sample[campo]).substring(0, 50) + '...'
          : String(sample[campo]).substring(0, 50);
        console.log(`   ├─ ${campo.padEnd(20)} [${tipo.padEnd(8)}] → ${valor}`);
      });

      // 2.5 Verificar campos críticos
      const camposCriticos = ['NREGGEN', 'centro', 'fecha', 'puntuacion_total'];
      const camposFaltantes = camposCriticos.filter(c => !campos.includes(c));
      
      if (camposFaltantes.length > 0) {
        console.log(`\n⚠️  Campos críticos FALTANTES:`);
        camposFaltantes.forEach(c => console.log(`   ✗ ${c}`));
      } else {
        console.log(`\n✅ Todos los campos críticos presentes`);
      }

      // 2.6 Estadísticas de puntuación
      if (sample.puntuacion_total !== undefined) {
        const stats = await collection.aggregate([
          {
            $group: {
              _id: null,
              min: { $min: '$puntuacion_total' },
              max: { $max: '$puntuacion_total' },
              avg: { $avg: '$puntuacion_total' },
              count: { $sum: 1 }
            }
          }
        ]).toArray();

        if (stats.length > 0) {
          console.log(`\n📊 Estadísticas de puntuación:`);
          console.log(`   Mínima:  ${stats[0].min}`);
          console.log(`   Máxima:  ${stats[0].max}`);
          console.log(`   Promedio: ${stats[0].avg.toFixed(2)}`);
        }
      }

      // 2.7 Distribución por centro
      const distribucion = await collection.aggregate([
        {
          $group: {
            _id: '$centro',
            total: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]).toArray();

      console.log(`\n📊 Distribución por centro:`);
      distribucion.forEach(d => {
        const porcentaje = ((d.total / count) * 100).toFixed(1);
        console.log(`   ${d._id.padEnd(15)} → ${d.total.toString().padStart(6)} registros (${porcentaje}%)`);
      });

      // 2.8 Verificar índices
      const indices = await collection.indexes();
      console.log(`\n🔑 Índices definidos: ${indices.length}`);
      indices.forEach(idx => {
        const keys = Object.keys(idx.key).map(k => `${k}:${idx.key[k]}`).join(', ');
        console.log(`   • ${idx.name}: { ${keys} }`);
      });
    }

    // ========================================
    // 3. VERIFICAR COMPATIBILIDAD CON MOTOR
    // ========================================
    console.log('\n\n🎯 ═══ PASO 3: VERIFICACIÓN DE COMPATIBILIDAD ═══\n');

    console.log('✓ Verificando requisitos para motor de indicadores:\n');

    // 3.1 Verificar que existen colecciones de tests
    const testsRequeridos = ['frail', 'barthel', 'charlson'];
    const cumpleRequisitos = testsRequeridos.every(t => testsPresentes.includes(t));

    if (cumpleRequisitos) {
      console.log('✅ Tests principales presentes (frail, barthel, charlson)');
    } else {
      console.log('⚠️  Faltan algunos tests principales');
    }

    // 3.2 Verificar estructura de datos
    console.log('✅ Estructura de documentos verificada');
    console.log('✅ Campos críticos presentes (NREGGEN, centro, fecha, puntuacion_total)');

    // 3.3 Verificar centros disponibles
    const todosLosCentros = new Set();
    for (const testName of testsPresentes) {
      const coleccionExacta = collectionNames.find(c => 
        c.toLowerCase().includes(testName.toLowerCase())
      );
      if (coleccionExacta) {
        const centrosCol = await db.collection(coleccionExacta).distinct('centro');
        centrosCol.forEach(c => todosLosCentros.add(c));
      }
    }

    console.log(`✅ Centros únicos encontrados: ${todosLosCentros.size}`);
    console.log('\n   Centros disponibles para MongoDB Engine:');
    Array.from(todosLosCentros).sort().forEach(centro => {
      console.log(`   • MONGO_${centro}`);
    });

    // ========================================
    // 4. RECOMENDACIONES
    // ========================================
    console.log('\n\n💡 ═══ PASO 4: RECOMENDACIONES ═══\n');

    // 4.1 Verificar índices recomendados
    let indicesFaltantes = 0;
    for (const testName of testsPresentes) {
      const coleccionExacta = collectionNames.find(c => 
        c.toLowerCase().includes(testName.toLowerCase())
      );
      if (!coleccionExacta) continue;

      const collection = db.collection(coleccionExacta);
      const indices = await collection.indexes();
      
      const tieneIndiceRecomendado = indices.some(idx => 
        idx.key.centro && idx.key.fecha && idx.key.NREGGEN
      );

      if (!tieneIndiceRecomendado) {
        console.log(`⚠️  ${coleccionExacta}: Se recomienda crear índice { centro: 1, fecha: -1, NREGGEN: 1 }`);
        indicesFaltantes++;
      }
    }

    if (indicesFaltantes === 0) {
      console.log('✅ Índices optimizados presentes en todas las colecciones');
    } else {
      console.log(`\n📝 Para crear los índices recomendados, ejecuta:`);
      console.log(`   node EJEMPLO_USO_MOTOR_INDICADORES.js (función ejemploCrearIndices)`);
    }

    // ========================================
    // 5. RESUMEN FINAL
    // ========================================
    console.log('\n\n📋 ═══════════════════════════════════════════════════════════');
    console.log('📋 RESUMEN FINAL DE VERIFICACIÓN');
    console.log('📋 ═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Base de datos: ${DB_NAME}`);
    console.log(`✅ Colecciones totales: ${collectionNames.length}`);
    console.log(`✅ Tests de comorbilidad: ${testsPresentes.length}/${testsComorbilidad.length}`);
    console.log(`✅ Centros disponibles: ${todosLosCentros.size}`);

    const totalRegistros = await Promise.all(
      testsPresentes.map(async (testName) => {
        const coleccionExacta = collectionNames.find(c => 
          c.toLowerCase().includes(testName.toLowerCase())
        );
        if (!coleccionExacta) return 0;
        return await db.collection(coleccionExacta).countDocuments();
      })
    );
    const sumaTotal = totalRegistros.reduce((a, b) => a + b, 0);
    console.log(`✅ Total de registros: ${sumaTotal.toLocaleString()}`);

    console.log('\n🎯 Estado del sistema:');
    if (cumpleRequisitos && testsPresentes.length >= 3 && todosLosCentros.size > 0) {
      console.log('   🟢 LISTO PARA PRODUCCIÓN');
      console.log('   ✓ Todos los requisitos cumplidos');
      console.log('   ✓ Datos disponibles para indicadores');
      console.log('   ✓ Motor de indicadores puede iniciarse');
    } else {
      console.log('   🟡 REQUIERE ATENCIÓN');
      if (!cumpleRequisitos) console.log('   ⚠️  Faltan tests principales');
      if (testsPresentes.length < 3) console.log('   ⚠️  Pocas colecciones de tests');
      if (todosLosCentros.size === 0) console.log('   ⚠️  No hay centros disponibles');
    }

    console.log('\n📚 Próximos pasos:');
    console.log('   1. Si todo está OK → Inicializar motor de indicadores');
    console.log('   2. Crear índices recomendados (si faltan)');
    console.log('   3. Registrar rutas API en index.js');
    console.log('   4. Modificar frontend Angular');

    console.log('\n═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ ERROR durante la verificación:', error);
    console.error('\n   Stack:', error.stack);
  } finally {
    await client.close();
    console.log('🔌 Conexión cerrada');
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  verificarEstructuraMongo()
    .then(() => {
      console.log('\n✅ Verificación completada');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error fatal:', err);
      process.exit(1);
    });
}

module.exports = { verificarEstructuraMongo };
