/**
 * unificar-formatos-json.js
 * Script para unificar todos los archivos JSON de datos históricos a un formato estándar
 */

const path = require('path');
const fs = require('fs').promises;

// Formato estándar para todos los archivos
const FORMATO_ESTANDAR = {
  version: '1.0',
  fecha_exportacion: new Date().toISOString(),
  formato: 'test_comorbilidad',
  metadata: {
    form_id: '',
    total_registros_validos: 0,
    centros_incluidos: [],
    rango_fechas: {
      min: null,
      max: null
    }
  },
  records: []
};

// Archivos a procesar
const ARCHIVOS = [
  'frail.json',
  'barthel.json',
  'sarcf.json',
  'mna_sf.json',
  'lawton_brody.json',
  'phq4.json',
  'gijon.json',
  'coop_wonca.json'
];

async function unificarFormatos() {
  console.log('🔄 ═══════════════════════════════════════════════════════════');
  console.log('🔄 UNIFICACIÓN DE FORMATOS JSON');
  console.log('🔄 ═══════════════════════════════════════════════════════════\n');

  const dirDatos = path.join(__dirname, 'documentacion', 'datosHistoricos');
  const dirBackup = path.join(dirDatos, 'backup_originales');

  try {
    // Crear directorio de backup si no existe
    try {
      await fs.access(dirBackup);
      console.log('📁 Directorio de backup ya existe\n');
    } catch {
      await fs.mkdir(dirBackup, { recursive: true });
      console.log('📁 Directorio de backup creado\n');
    }

    let procesados = 0;
    let errores = 0;

    for (const archivo of ARCHIVOS) {
      console.log(`\n┌─────────────────────────────────────────────────────────┐`);
      console.log(`│  Procesando: ${archivo.padEnd(44)}│`);
      console.log(`└─────────────────────────────────────────────────────────┘`);

      const rutaOriginal = path.join(dirDatos, archivo);
      const rutaBackup = path.join(dirBackup, archivo);

      try {
        // Leer archivo original
        const contenido = await fs.readFile(rutaOriginal, 'utf-8');
        const datosOriginales = JSON.parse(contenido);

        let records = [];
        let yaUnificado = false;

        // Detectar formato actual
        if (Array.isArray(datosOriginales)) {
          console.log('📄 Formato: Array directo');
          records = datosOriginales;
        } else if (datosOriginales.records && Array.isArray(datosOriginales.records)) {
          if (datosOriginales.version === '1.0') {
            console.log('✅ Ya está en formato unificado - saltando');
            yaUnificado = true;
            procesados++;
            continue;
          }
          console.log('📄 Formato: Objeto con records (antiguo)');
          records = datosOriginales.records;
        } else if (datosOriginales.registros && Array.isArray(datosOriginales.registros)) {
          console.log('📄 Formato: Objeto con registros (variante)');
          records = datosOriginales.registros;
        } else {
          throw new Error('Formato no reconocido');
        }

        if (records.length === 0) {
          console.log('⚠️  Archivo vacío');
          continue;
        }

        console.log(`📊 Registros encontrados: ${records.length}`);

        // Hacer backup del original (solo si no está unificado)
        if (!yaUnificado) {
          await fs.copyFile(rutaOriginal, rutaBackup);
          console.log(`💾 Backup guardado en: backup_originales/${archivo}`);
        }

        // Calcular metadata
        const centros = new Set();
        let fechaMin = null;
        let fechaMax = null;

        records.forEach(record => {
          if (record.centro) {
            centros.add(record.centro);
          }
          if (record.fecha) {
            const fecha = new Date(record.fecha);
            if (!fechaMin || fecha < fechaMin) fechaMin = fecha;
            if (!fechaMax || fecha > fechaMax) fechaMax = fecha;
          }
        });

        // Crear estructura unificada
        const archivoUnificado = {
          version: '1.0',
          fecha_exportacion: new Date().toISOString(),
          formato: 'test_comorbilidad',
          metadata: {
            form_id: archivo.replace('.json', ''),
            descripcion: obtenerDescripcion(archivo),
            total_registros_validos: records.length,
            centros_incluidos: Array.from(centros).sort(),
            total_centros: centros.size,
            rango_fechas: {
              min: fechaMin ? fechaMin.toISOString() : null,
              max: fechaMax ? fechaMax.toISOString() : null
            },
            campos_disponibles: records.length > 0 ? Object.keys(records[0]) : []
          },
          records: records
        };

        // Guardar archivo unificado
        await fs.writeFile(
          rutaOriginal,
          JSON.stringify(archivoUnificado, null, 2),
          'utf-8'
        );

        console.log('✅ Archivo unificado guardado');
        console.log(`\n📊 Metadata generada:`);
        console.log(`   • Centros: ${centros.size}`);
        console.log(`   • Registros: ${records.length}`);
        console.log(`   • Rango fechas: ${fechaMin ? fechaMin.toISOString().split('T')[0] : 'N/A'} → ${fechaMax ? fechaMax.toISOString().split('T')[0] : 'N/A'}`);

        procesados++;

      } catch (error) {
        console.error(`❌ Error: ${error.message}`);
        errores++;
      }
    }

    // Resumen final
    console.log('\n\n📋 ═══════════════════════════════════════════════════════════');
    console.log('📋 RESUMEN DE UNIFICACIÓN');
    console.log('📋 ═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Archivos procesados: ${procesados}/${ARCHIVOS.length}`);
    console.log(`❌ Archivos con errores: ${errores}`);
    console.log(`💾 Backups guardados en: documentacion/datosHistoricos/backup_originales/`);

    console.log('\n🎯 Estado:');
    if (errores === 0) {
      console.log('   🟢 UNIFICACIÓN EXITOSA');
      console.log('   ✓ Todos los archivos ahora tienen formato estándar');
      console.log('   ✓ Metadata completa generada');
      console.log('   ✓ Backups de originales guardados');
    } else {
      console.log('   🟡 UNIFICACIÓN PARCIAL');
      console.log(`   ⚠️  ${errores} archivos tuvieron errores`);
    }

    console.log('\n📚 Próximos pasos:');
    console.log('   1. Verificar archivos unificados');
    console.log('   2. Ejecutar: node importar-datos-historicos.js');
    console.log('   3. Los archivos originales están en backup_originales/');

    console.log('\n═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

/**
 * Obtener descripción según el tipo de test
 */
function obtenerDescripcion(archivo) {
  const descripciones = {
    'frail.json': 'Test de Fragilidad FRAIL',
    'barthel.json': 'Índice de Barthel - Dependencia AVD',
    'sarcf.json': 'Test SARC-F - Sarcopenia',
    'mna_sf.json': 'Mini Nutritional Assessment - Short Form',
    'lawton_brody.json': 'Escala de Lawton y Brody - AIVD',
    'phq4.json': 'Patient Health Questionnaire-4',
    'gijon.json': 'Escala de valoración sociofamiliar de Gijón',
    'coop_wonca.json': 'Índice de Comorbilidad de Charlson (COOP/WONCA)'
  };

  return descripciones[archivo] || 'Test de comorbilidad';
}

// Ejecutar si se llama directamente
if (require.main === module) {
  unificarFormatos()
    .then(() => {
      console.log('✅ Unificación completada');
      process.exit(0);
    })
    .catch(err => {
      console.error('❌ Error fatal:', err);
      process.exit(1);
    });
}

module.exports = { unificarFormatos };
