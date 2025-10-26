require('dotenv').config();

// Configuración global de usuario y contraseña
const user = process.env.DB_USER;
const password = process.env.DB_PASSWORD;
const host = process.env.HOST;

// IMPORTANTE: Asegúrate de que el comentario sobre 'latin1' en node-firebird
// sea una instrucción para la instalación/configuración de dependencias.

// Mapeo directo de los códigos (DBx) a sus variables de entorno
const databaseConfigMap = {
  DB1: process.env.DB1_DATABASE,
  DB2: process.env.DB2_DATABASE,
  DB3: process.env.DB3_DATABASE,
  DB4: process.env.DB4_DATABASE,
  DB5: process.env.DB5_DATABASE,
  DB6: process.env.DB6_DATABASE,
  DB8: process.env.DB8_DATABASE,
  DB9: process.env.DB9_DATABASE,
  DB10: process.env.DB10_DATABASE,
  DB11: process.env.DB11_DATABASE,
  DB13: process.env.DB13_DATABASE,
  DB14: process.env.DB14_DATABASE,
  DB15: process.env.DB15_DATABASE,
  DB16: process.env.DB16_DATABASE,
  DB17: process.env.DB17_DATABASE,
  DB18: process.env.DB18_DATABASE,
  // Asegúrate de incluir cualquier otra DB que puedas necesitar (ej. DB7, DB12)
};

/**
 * Genera la configuración de conexión para un conjunto de bases de datos
 * basado en sus códigos (ej. ['DB1', 'DB4']).
 *
 * @param {string[]} baseDatos - Array de códigos de bases de datos (ej. ['DB1', 'DB4']).
 * @returns {object[]} Array de objetos de configuración de conexión de Firebird.
 */
async function findBase(baseDatos) {
  // 1. Filtrar los códigos de DB válidos y obtener sus paths/nombres
  const selectedDatabases = baseDatos
    .map(code => databaseConfigMap[code])
    .filter(path => path); // Elimina valores 'undefined' si el código no existe o el env está vacío

  // 2. Generar la configuración completa para las bases de datos seleccionadas
  const conjuntoBases = selectedDatabases.map((database) => ({
    host: host,
    port: 3050,
    database: database,
    user: user,
    password: password,
    lowercase_keys: false,
    role: null,
    pageSize: 4096,
    retryConnectionInterval: 1000,
    blobAsText: false,
    charset: 'UTF-8'
  }));

  return conjuntoBases;
}

module.exports = findBase;