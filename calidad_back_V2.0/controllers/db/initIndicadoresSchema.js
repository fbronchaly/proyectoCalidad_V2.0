// initIndicadoresSchema.js
const { MongoClient } = require('mongodb');
const schema = require('../db/indicadorResultado.schema.json');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
const DB_NAME = process.env.MONGODB_DBNAME || 'calidad';
const COLLECTION_NAME = 'indicadores_resultados';

async function main() {

    const client = new MongoClient(MONGODB_URI);


  try {
    await client.connect();
    console.log(`✅ Conectado a MongoDB: ${MONGODB_URI}`);
    const db = client.db(DB_NAME);

    const collections = await db.listCollections({ name: COLLECTION_NAME }).toArray();
    const exists = collections.length > 0;

    if (!exists) {
      console.log(`📂 La colección "${COLLECTION_NAME}" no existe. Creándola con validador...`);
      await db.createCollection(COLLECTION_NAME, {
        validator: { $jsonSchema: schema },
        validationLevel: 'strict',
        validationAction: 'error'
      });
      console.log('✅ Colección creada con validador JSON Schema.');
    } else {
      console.log(`📂 La colección "${COLLECTION_NAME}" ya existe. Aplicando collMod...`);
      await db.command({
        collMod: COLLECTION_NAME,
        validator: { $jsonSchema: schema },
        validationLevel: 'strict',
        validationAction: 'error'
      });
      console.log('✅ Validador JSON Schema aplicado con collMod.');
    }
  } catch (err) {
    console.error('⛔ Error al aplicar el schema:', err);
  } finally {
    await client.close();
  }
}

main();
