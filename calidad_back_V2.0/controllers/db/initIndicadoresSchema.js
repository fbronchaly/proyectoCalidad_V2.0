// initIndicadoresSchema.js
const { MongoClient } = require('mongodb');
const path = require('path');
// Cargar .env explícitamente desde la raíz del backend
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const ejecucionSchema = require('./schemas/ejecucion.schema.json');
const resultadoSchema = require('./schemas/resultado.schema.json');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) throw new Error('MONGODB_URI no definida');

const DB_NAME = process.env.MONGODB_DBNAME || 'calidad';

async function initCollection(db, collectionName, schema) {
  const collections = await db.listCollections({ name: collectionName }).toArray();
  const exists = collections.length > 0;

  if (!exists) {
    console.log(`📂 La colección "${collectionName}" no existe. Creándola con validador...`);
    await db.createCollection(collectionName, {
      validator: { $jsonSchema: schema },
      validationLevel: 'strict',
      validationAction: 'error'
    });
    console.log(`✅ Colección "${collectionName}" creada.`);
  } else {
    console.log(`📂 La colección "${collectionName}" ya existe. Aplicando collMod...`);
    await db.command({
      collMod: collectionName,
      validator: { $jsonSchema: schema },
      validationLevel: 'strict',
      validationAction: 'error'
    });
    console.log(`✅ Validador actualizado para "${collectionName}".`);
  }
}

async function main() {
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log(`✅ Conectado a MongoDB: ${MONGODB_URI}`);
    const db = client.db(DB_NAME);

    // Inicializar colección de Ejecuciones
    await initCollection(db, 'ejecuciones', ejecucionSchema);
    
    // Inicializar colección de Resultados
    await initCollection(db, 'resultados', resultadoSchema);

    // Crear índices recomendados
    console.log('⚙️ Creando índices...');
    
    // Índices para ejecuciones
    await db.collection('ejecuciones').createIndex({ id_transaccion: 1 }, { unique: true });
    await db.collection('ejecuciones').createIndex({ "periodo_aplicado.desde": 1, "periodo_aplicado.hasta": 1 });

    // Índices para resultados
    await db.collection('resultados').createIndex({ id_transaccion: 1 }); // Para buscar todos los resultados de una ejecución
    await db.collection('resultados').createIndex({ "indice.id_code": 1 }); // Para buscar histórico de un indicador
    await db.collection('resultados').createIndex({ "base.code": 1 }); // Para buscar por centro

    console.log('✅ Índices creados correctamente.');

  } catch (err) {
    console.error('⛔ Error al aplicar el schema:', err);
  } finally {
    await client.close();
  }
}

main();
