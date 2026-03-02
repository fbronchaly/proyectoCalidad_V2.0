/**
 * normalizar-datos-mongo.js
 * Script para normalizar campos en las colecciones de MongoDB
 * Asegura que todos los documentos tengan los mismos nombres de campos
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DBNAME || 'DatosCalidad';

// Mapeo de campos a normalizar
const NORMALIZACIONES = {
  frail: [
    { desde: 'registro_general', hacia: 'NREGGEN' },
    { desde: 'puntuacion', hacia: 'puntuacion_total' },
    { desde: 'form_id', hacia: 'FORM_ID', mayusculas: true }
  ],
  mna: [
    { desde: 'CENTRO', hacia: 'centro', minusculas: true },
    { desde: 'FECHA', hacia: 'fecha', minusculas: true },
    { desde: 'PUNTUACION_TOTAL', hacia: 'puntuacion_total', minusculas: true },
    { desde: 'FECHA_NACIMIENTO', hacia: 'fecha_nacimiento', minusculas: true },
    { desde: 'SEXO', hacia: 'sexo', minusculas: true },
    { desde: 'PREGUNTAS', hacia: 'preguntas', minusculas: true },
    { desde: 'RESULTADO', hacia: 'resultado', minusculas: true }
  ],
  barthel: [
    { desde: 'NREEGEN', hacia: 'NREGGEN' }
  ],
  lawton: [
    { desde: 'NREEGEN', hacia: 'NREGGEN' }
  ]
};

async function normalizarDatosMongo() {
  console.log('🔧 ═══════════════════════════════════════════════════════════');
  console.log('🔧 NORMALIZACIÓN DE DATOS EN MONGODB');
  console.log('🔧 ═══════════════════════════════════════════════════════════\n');

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Conexión a MongoDB establecida');
    console.log(`📊 Base de datos: ${DB_NAME}\n`);

    const db = client.db(DB_NAME);

    let totalActualizados = 0;

    for (const [coleccion, reglas] of Object.entries(NORMALIZACIONES)) {
      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│  Normalizando: ${coleccion.padEnd(43)}│`);
      console.log(`└─────────────────────────────────────────────────────────┘`);

      const collection = db.collection(coleccion);
      const count = await collection.countDocuments();

      if (count === 0) {
        console.log('⚠️  Colección vacía - saltando');
        continue;
      }

      console.log(`📄 Total de documentos: ${count}`);
      console.log(`🔄 Reglas a aplicar: ${reglas.length}\n`);

      let actualizados = 0;

      for (const regla of reglas) {
        const { desde, hacia } = regla;

        // Contar cuántos documentos tienen el campo origen
        const conCampoOrigen = await collection.countDocuments({
          [desde]: { $exists: true }
        });

        if (conCampoOrigen === 0) {
          console.log(`   ⊘ ${desde} → ${hacia}: Sin cambios (campo no existe)`);
          continue;
        }

        console.log(`   🔄 ${desde} → ${hacia}: ${conCampoOrigen} documentos...`);

        // Renombrar campo
        const resultado = await collection.updateMany(
          { [desde]: { $exists: true } },
          { $rename: { [desde]: hacia } }
        );

        actualizados += resultado.modifiedCount;
        console.log(`   ✅ ${resultado.modifiedCount} documentos actualizados`);
      }

      console.log(`\n📊 Resumen colección '${coleccion}': ${actualizados} campos renombrados`);
      totalActualizados += actualizados;
    }

    // Normalizar valores null en campo 'centro'
    console.log(`\n┌─────────────────────────────────────────────────────────┐`);
    console.log(`│  Corrigiendo valores null en campo 'centro'             │`);
    console.log(`└─────────────────────────────────────────────────────────┘`);

    for (const coleccion of Object.keys(NORMALIZACIONES)) {
      const collection = db.collection(coleccion);
      
      // Buscar documentos con centro null pero con CENTRO definido
      const conCentroNull = await collection.find({
        $or: [
          { centro: null },
          { centro: { $exists: false } }
        ],
        CENTRO: { $exists: true }
      }).toArray();

      if (conCentroNull.length > 0) {
        console.log(`\n   ${coleccion}: ${conCentroNull.length} documentos con centro null`);
        
        for (const doc of conCentroNull) {
          await collection.updateOne(
            { _id: doc._id },
            { $set: { centro: doc.CENTRO } }
          );
        }
        console.log(`   ✅ Corregidos`);
      }
    }

    // Resumen final
    console.log('\n\n📋 ═══════════════════════════════════════════════════════════');
    console.log('📋 RESUMEN DE NORMALIZACIÓN');
    console.log('📋 ═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Total de campos renombrados: ${totalActualizados}`);
    console.log(`✅ Colecciones procesadas: ${Object.keys(NORMALIZACIONES).length}`);

    console.log('\n🎯 Estado:');
    console.log('   🟢 NORMALIZACIÓN COMPLETADA');
    console.log('   ✓ Campos estandarizados');
    console.log('   ✓ Valores null corregidos');
    console.log('   ✓ Datos listos para motor de indicadores');

    console.log('\n📚 Próximos pasos:');
    console.log('   1. Ejecutar: node verificar-estructura-mongo.js');
    console.log('   2. Confirmar que todos los campos críticos están presentes');

    console.log('\n═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ ERROR durante normalización:', error);
    console.error('   Stack:', error.stack);
  } finally {
    await client.close();
    console.log('🔌 Conexión cerrada');
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  normalizarDatosMongo()
    .then(() => {
      console.log('\n✅ Normalización completada');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error fatal:', err);
      process.exit(1);
    });
}

module.exports = { normalizarDatosMongo };
