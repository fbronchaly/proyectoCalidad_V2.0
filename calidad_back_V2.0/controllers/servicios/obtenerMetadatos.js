const findBase = require('./findBase');

async function obtenerMetadatos(baseDatos) {
  try {
    const basesDatos = await findBase(baseDatos);
    return { basesDatos };
  } catch (error) {
    console.error('Error al obtener los metadatos:', error);
    throw error;
  } 
}

async function findBaseOnlyOne(dbName) {
  try {
    const databases = await findBase();
    const selectedDb = databases.find(db => db.database === dbName);

    if (!selectedDb) {
      console.error(`No se encontró una base de datos con el nombre: ${dbName}`);
      return null;
    }

    return { baseDatos: selectedDb };
  } catch (error) {
    console.error(`Error al buscar la base de datos ${dbName}:`, error);
    throw error;
  }
}

module.exports = { obtenerMetadatos, findBaseOnlyOne };
