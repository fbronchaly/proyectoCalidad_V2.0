// controllers/flux/consultarBasesDeDatos.js

const Firebird = require('node-firebird');

/**
 * Envía mensaje de error al proceso padre (worker -> index.js)
 */
function emitirError(mensaje) {
  if (typeof process !== 'undefined' && typeof process.send === 'function') {
    try {
      process.send({ progreso: 0, mensaje });
    } catch (e) {
      // Si el canal IPC está cerrado, ignoramos el error
      console.error('IPC cerrado al intentar enviar error:', e.message);
    }
  }
}

/**
 * Ejecuta la query contra la GDB indicada en config.database.
 *
 * - Controla timeout tanto en el attach como en la propia consulta.
 * - Siempre hace detach de la conexión si se ha llegado a abrir.
 *
 * @param {{ host, port, database, user, password }} config 
 * @param {string} query 
 * @param {number} [timeoutMs=60000] 
 * @returns {Promise<any[]>}
 */
function consultarBasesDeDatos(config, query, timeoutMs = 60000) {
  const marcaInicio = new Date();

  // Extraer tabla (solo para log)
  const regex = /FROM\s+([^\s]+)/i;
  const match = query.match(regex);
  const tabla = match ? match[1] : '';
  console.log(`📄 Tabla detectada en la query: ${tabla}`);

  console.log(`[${marcaInicio.toISOString()}] [ENTRADA FUNCION] Recibida solicitud de consulta para: ${config.database}`);

  return new Promise((resolve, reject) => {
    let terminado = false;
    let dbRef = null;
    let timeoutAttach = null;
    let timeoutQuery = null;

    const finOK = (resultado) => {
      if (terminado) return;
      terminado = true;

      if (timeoutAttach) clearTimeout(timeoutAttach);
      if (timeoutQuery) clearTimeout(timeoutQuery);

      if (dbRef) {
        try {
          dbRef.detach();
        } catch (e) {
          console.error(`[${new Date().toISOString()}] ⚠️ Error al hacer detach en ${config.database}: ${e.message}`);
        }
      }

      console.log(`[${new Date().toISOString()}] ✅ Consulta completada con éxito en ${config.database}`);
      resolve(resultado);
    };

    const fail = (textoError) => {
      if (terminado) return;
      terminado = true;

      if (timeoutAttach) clearTimeout(timeoutAttach);
      if (timeoutQuery) clearTimeout(timeoutQuery);

      console.error(`[${new Date().toISOString()}] ❌ ${textoError}`);

      if (dbRef) {
        try {
          dbRef.detach();
        } catch (e) {
          console.error(`[${new Date().toISOString()}] ⚠️ Error al hacer detach en ${config.database}: ${e.message}`);
        }
      }

      emitirError(`❌ ERROR en ${config.database}: ${textoError}`);
      reject(new Error(textoError));
    };

    console.log(`[${new Date().toISOString()}] [INICIO] Intentando conectar con: ${config.database}`);

    // ⏰ Timeout de conexión (attach)
    timeoutAttach = setTimeout(() => {
      const msg = `Timeout de conexión (attach) en ${config.database}`;
      fail(msg);
    }, timeoutMs);

    Firebird.attach(config, (err, db) => {
      console.log(`[${new Date().toISOString()}] [CALLBACK ATTACH] Entró en el callback de conexión: ${config.database}`);

      if (terminado) {
        // Ya hemos resuelto/rechazado (por timeout de attach), liberamos si hace falta
        if (db) {
          try { db.detach(); } catch (_) {}
        }
        return;
      }

      clearTimeout(timeoutAttach);

      if (err) {
        // Puedes mantener tu mensaje "BACKUP EN PROCESO" si quieres, pero yo usaría err.message
        const textoError = `Error al conectar con ${config.database}: ${err.message}`;
        return fail(textoError);
      }

      dbRef = db;

      // ⏰ Timeout de la consulta
      timeoutQuery = setTimeout(() => {
        const msg = `Timeout de consulta en ${config.database}`;
        fail(msg);
      }, timeoutMs);

      db.query(query, (errQuery, result) => {
        if (terminado) return; // Ya falló por timeout u otro motivo

        if (errQuery) {
          const textoError = `Error en la consulta a ${config.database}: ${errQuery.message}`;
          return fail(textoError);
        }

        finOK(result);
      });
    });
  });
}

module.exports = consultarBasesDeDatos;
