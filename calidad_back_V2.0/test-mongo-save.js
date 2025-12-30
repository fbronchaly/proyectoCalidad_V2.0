const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { guardarResultadosLocal } = require('./controllers/flux/guardarResultadosLocal');

async function test() {
  console.log('🧪 Iniciando prueba de guardado en MongoDB...');
  console.log('   - URI:', process.env.MONGODB_URI ? 'Definida (Oculta)' : 'NO DEFINIDA');
  console.log('   - DB:', process.env.MONGODB_DBNAME || 'calidad');
  
  const fechaInicio = '2025-01-01';
  const fechaFin = '2025-01-31';
  const baseDatos = ['TEST_DB'];
  const indices = ['TEST_IND'];
  const salida = [
    {
      id_code: 'TEST_001',
      indicador: 'Indicador de Prueba',
      categoria: 'TEST',
      consulta_sql: 'SELECT 1',
      intervalo: 'mensual',
      resultados: [
        {
          baseData: 'CENTRO_TEST',
          resultado: 99.9,
          numeroDePacientes: 10,
          error: null
        }
      ]
    }
  ];

  try {
    const resultado = await guardarResultadosLocal(fechaInicio, fechaFin, baseDatos, indices, salida);
    console.log('✅ Resultado de la prueba:', JSON.stringify(resultado, null, 2));
  } catch (error) {
    console.error('❌ Error en la prueba:', error);
  }
  process.exit(0);
}

test();
