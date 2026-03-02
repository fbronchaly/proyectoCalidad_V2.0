#!/bin/bash

# Configuración del servidor
SERVIDOR="193.147.197.113"
USUARIO="friat"
CONTENEDOR_MONGO="mongodb-calidad"

echo "🔍 Conectando al servidor $SERVIDOR..."
echo ""

# Ejecutar consultas remotas (sin -t para evitar pseudo-terminal)
ssh -T $USUARIO@$SERVIDOR << 'ENDSSH'

echo "=== ANÁLISIS DE COLECCIÓN test_responses (appTestCormo) ==="
echo ""

# 1. Centros disponibles
echo "📊 CENTROS EN test_responses:"
docker exec mongodb-calidad mongosh DatosCalidad --quiet --eval "
  const centros = db.test_responses.distinct('centro');
  print('Total: ' + centros.length);
  print('');
  centros.forEach(c => print('  - ' + c));
"

echo ""
echo "📊 TIPOS DE TESTS (form_id):"
docker exec mongodb-calidad mongosh DatosCalidad --quiet --eval "
  const tests = db.test_responses.distinct('form_id');
  tests.forEach(t => print('  - ' + t));
"

echo ""
echo "📊 EJEMPLO DE DOCUMENTO:"
docker exec mongodb-calidad mongosh DatosCalidad --quiet --eval "
  const ejemplo = db.test_responses.findOne();
  printjson(ejemplo);
"

echo ""
echo "📊 CONTEO POR CENTRO:"
docker exec mongodb-calidad mongosh DatosCalidad --quiet --eval "
  db.test_responses.aggregate([
    { \$group: {
        _id: '\$centro',
        total_tests: { \$sum: 1 },
        tipos_test: { \$addToSet: '\$form_id' },
        pacientes: { \$addToSet: '\$NREGGEN' },
        tiene_migrados: {
          \$sum: { \$cond: [{ \$eq: ['\$_migrated', true] }, 1, 0] }
        },
        tiene_nuevos: {
          \$sum: { \$cond: [{ \$eq: ['\$_migrated', false] }, 1, 0] }
        }
      }
    },
    { \$project: {
        centro: '\$_id',
        total_tests: 1,
        tipos_test: 1,
        total_pacientes: { \$size: '\$pacientes' },
        registros_migrados: '\$tiene_migrados',
        registros_nuevos: '\$tiene_nuevos'
      }
    },
    { \$sort: { centro: 1 } }
  ]).forEach(doc => {
    print('Centro: ' + doc.centro);
    print('  Code sugerido: MONGO_' + doc.centro.replace(/ /g, '_').toUpperCase());
    print('  Tests tipos: ' + doc.tipos_test.join(', '));
    print('  Total registros: ' + doc.total_tests);
    print('  Pacientes únicos: ' + doc.total_pacientes);
    print('  Migrados desde Firebird: ' + doc.registros_migrados);
    print('  Nuevos en MongoDB: ' + doc.registros_nuevos);
    print('');
  });
"

echo ""
echo "📊 VERIFICAR CAMPOS Y ESTRUCTURA:"
docker exec mongodb-calidad mongosh DatosCalidad --quiet --eval "
  const sample = db.test_responses.findOne();
  
  if (sample) {
    print('Campos disponibles:');
    Object.keys(sample).forEach(key => {
      const tipo = typeof sample[key];
      const valor = sample[key] instanceof Date ? 'Date' : tipo;
      print('  - ' + key + ': ' + valor);
    });
    
    print('');
    print('✅ Campos necesarios para el sistema:');
    print('  ¿Tiene centro? ' + (sample.centro !== undefined ? '✅ SÍ' : '❌ NO'));
    print('  ¿Tiene form_id? ' + (sample.form_id !== undefined ? '✅ SÍ' : '❌ NO'));
    print('  ¿Tiene NREGGEN? ' + (sample.NREGGEN !== undefined ? '✅ SÍ' : '❌ NO'));
    print('  ¿Tiene fecha? ' + (sample.fecha !== undefined ? '✅ SÍ' : '❌ NO'));
    print('  ¿Tiene puntuacion_total? ' + (sample.puntuacion_total !== undefined ? '✅ SÍ' : '❌ NO'));
    print('  ¿Tiene _migrated? ' + (sample._migrated !== undefined ? '✅ SÍ' : '❌ NO'));
  } else {
    print('⚠️ No hay documentos en test_responses');
  }
"

echo ""
echo "✅ === FIN DEL ANÁLISIS ==="

ENDSSH

echo ""
echo "✅ Análisis completado"