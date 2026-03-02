/**
 * importar-datos-historicos.js
 * Script para importar datos históricos de tests de comorbilidad a MongoDB
 * IMPORTANTE: Los archivos JSON deben estar en formato unificado (ejecutar unificar-formatos-json.js primero)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { MongoClient } = require('mongodb');
const fs = require('fs').promises;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const DB_NAME = process.env.MONGODB_DBNAME || 'DatosCalidad';

// Mapeo de archivos a colecciones
const MAPEO_COLECCIONES = {
  'frail.json': 'frail',
  'barthel.json': 'barthel',
  'sarcf.json': 'sarcf',
  'mna_sf.json': 'mna',
  'lawton_brody.json': 'lawton',
  'phq4.json': 'phq4',
  'gijon.json': 'gijon',
  'coop_wonca.json': 'charlson'
};

async function importarDatosHistoricos() {
  console.log('📦 ═══════════════════════════════════════════════════════════');
  console.log('📦 IMPORTACIÓN DE DATOS HISTÓRICOS A MONGODB');
  console.log('📦 ═══════════════════════════════════════════════════════════\n');

  const client = new MongoClient(MONGODB_URI);

  try {
    // Conectar
    await client.connect();
    console.log('✅ Conexión a MongoDB establecida');
    console.log(`📊 Base de datos: ${DB_NAME}\n`);

    const db = client.db(DB_NAME);
    const dirDatos = path.join(__dirname, 'documentacion', 'datosHistoricos');

    let totalImportados = 0;
    let totalErrores = 0;

    // Procesar cada archivo
    for (const [archivo, coleccion] of Object.entries(MAPEO_COLECCIONES)) {
      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│  Importando: ${archivo.padEnd(44)}│`);
      console.log(`└─────────────────────────────────────────────────────────┘`);

      const rutaArchivo = path.join(dirDatos, archivo);

      try {
        // Verificar si el archivo existe
        await fs.access(rutaArchivo);

        // Leer archivo JSON
        const contenido = await fs.readFile(rutaArchivo, 'utf-8');
        const datosUnificados = JSON.parse(contenido);

        // Validar formato unificado
        if (!datosUnificados.version || !datosUnificados.records) {
          console.log('⚠️  El archivo no está en formato unificado');
          console.log('   Ejecuta primero: node unificar-formatos-json.js');
          totalErrores++;
          continue;
        }

        const { metadata, records } = datosUnificados;

        if (records.length === 0) {
          console.log('⚠️  Archivo vacío - No hay datos para importar');
          continue;
        }

        // Mostrar metadata
        console.log(`📝 Metadata:`);
        console.log(`   • Descripción: ${metadata.descripcion}`);
        console.log(`   • Registros válidos: ${metadata.total_registros_validos}`);
        console.log(`   • Centros: ${metadata.total_centros}`);
        console.log(`   • Rango fechas: ${metadata.rango_fechas.min?.split('T')[0]} → ${metadata.rango_fechas.max?.split('T')[0]}`);

        // Obtener la colección
        const collection = db.collection(coleccion);

        // Verificar si ya existen datos
        const existentes = await collection.countDocuments();
        
        if (existentes > 0) {
          console.log(`⚠️  La colección ya tiene ${existentes} registros`);
          console.log('   Se borrarán y reemplazarán con los nuevos datos');
          
          await collection.deleteMany({});
          console.log(`🗑️  ${existentes} registros antiguos eliminados`);
        }

        // Insertar datos
        const resultado = await collection.insertMany(records, { ordered: false });
        console.log(`✅ ${resultado.insertedCount} registros importados correctamente`);

        // Crear índices recomendados
        console.log('🔑 Creando índices optimizados...');
        await collection.createIndex({ centro: 1, fecha: -1, NREGGEN: 1 });
        await collection.createIndex({ NREGGEN: 1, fecha: -1 });
        await collection.createIndex({ fecha: -1 });
        console.log('✅ Índices creados');

        // Verificar datos importados
        const stats = await collection.aggregate([
          {
            $group: {
              _id: null,
              centros: { $addToSet: '$centro' },
              totalRegistros: { $sum: 1 },
              fechaMin: { $min: '$fecha' },
              fechaMax: { $max: '$fecha' }
            }
          }
        ]).toArray();

        if (stats.length > 0) {
          const stat = stats[0];
          console.log('\n📊 Verificación:');
          console.log(`   ✓ Total registros en MongoDB: ${stat.totalRegistros}`);
          console.log(`   ✓ Centros detectados: ${stat.centros.length}`);
          console.log(`   ✓ Rango fechas: ${new Date(stat.fechaMin).toISOString().split('T')[0]} → ${new Date(stat.fechaMax).toISOString().split('T')[0]}`);
        }

        totalImportados += records.length;

      } catch (error) {
        console.error(`❌ Error procesando ${archivo}:`, error.message);
        totalErrores++;
      }
    }

    // Resumen final
    console.log('\n\n📋 ═══════════════════════════════════════════════════════════');
    console.log('📋 RESUMEN DE IMPORTACIÓN');
    console.log('📋 ═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Total de registros importados: ${totalImportados.toLocaleString()}`);
    console.log(`❌ Archivos con errores: ${totalErrores}`);

    // Listar todas las colecciones creadas
    const collections = await db.listCollections().toArray();
    const testCollections = collections.filter(c => 
      Object.values(MAPEO_COLECCIONES).includes(c.name)
    );
    
    console.log(`\n📚 Colecciones de tests en MongoDB: ${testCollections.length}/${Object.keys(MAPEO_COLECCIONES).length}`);
    testCollections.forEach(c => {
      console.log(`   ✓ ${c.name}`);
    });

    // Verificar centros disponibles globalmente
    const todosLosCentros = new Set();
    for (const coleccion of Object.values(MAPEO_COLECCIONES)) {
      try {
        const centros = await db.collection(coleccion).distinct('centro');
        centros.forEach(c => todosLosCentros.add(c));
      } catch (err) {
        // Colección no existe
      }
    }

    console.log(`\n🏥 Centros únicos totales: ${todosLosCentros.size}`);
    const centrosArray = Array.from(todosLosCentros).sort().filter(c => c != null);
    
    // Mostrar centros en columnas
    const cols = 3;
    for (let i = 0; i < centrosArray.length; i += cols) {
      const fila = centrosArray.slice(i, i + cols)
        .map(c => (c || '').padEnd(20))
        .join('');
      console.log(`   ${fila}`);
    }

    console.log(`\n💾 Tamaño estimado de la base de datos:`);
    const stats = await db.stats();
    console.log(`   • Tamaño datos: ${(stats.dataSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   • Tamaño índices: ${(stats.indexSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   • Total: ${((stats.dataSize + stats.indexSize) / 1024 / 1024).toFixed(2)} MB`);

    console.log('\n🎯 Estado final:');
    if (totalImportados > 0 && totalErrores === 0) {
      console.log('   🟢 IMPORTACIÓN EXITOSA');
      console.log('   ✓ Todos los datos importados correctamente');
      console.log('   ✓ Índices optimizados creados');
      console.log('   ✓ MongoDB listo para motor de indicadores');
      console.log('   ✓ Sistema listo para producción');
    } else if (totalImportados > 0 && totalErrores > 0) {
      console.log('   🟡 IMPORTACIÓN PARCIAL');
      console.log(`   ⚠️  ${totalErrores} archivos tuvieron errores`);
      console.log('   ℹ️  Verifica los archivos con error y reintenta');
    } else {
      console.log('   🔴 ERROR EN IMPORTACIÓN');
      console.log('   ✗ No se importaron datos');
      console.log('   ℹ️  Verifica que los archivos estén en formato unificado');
    }

    console.log('\n📚 Próximos pasos:');
    console.log('   1. Ejecutar: node verificar-estructura-mongo.js');
    console.log('   2. Inicializar motor de indicadores en index.js');
    console.log('   3. Probar endpoints API:');
    console.log('      - GET /api/fuentes');
    console.log('      - POST /api/indicadores/ejecutar');

    console.log('\n═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ ERROR FATAL durante la importación:', error);
    console.error('   Stack:', error.stack);
    process.exit(1);
  } finally {
    await client.close();
    console.log('🔌 Conexión cerrada');
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  importarDatosHistoricos()
    .then(() => {
      console.log('\n✅ Importación completada');
      process.exit(0);
    })
    .catch(err => {
      console.error('\n❌ Error fatal:', err);
      process.exit(1);
    });
}

module.exports = { importarDatosHistoricos };
