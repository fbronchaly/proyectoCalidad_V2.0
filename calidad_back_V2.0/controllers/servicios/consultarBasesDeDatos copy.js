// controllers/flux/consultarBasesDeDatos.js

const Firebird = require('node-firebird');

/**
 * Ejecuta la query contra la GDB indicada en config.database.
 * Si falla (attach o query), emite un evento parcial de error por eventBus
 * y rechaza la promesa. No recibe eventBus como parámetro, usa el importado.
 *
 * @param {{ host, port, database, user, password }} config 
 * @param {string} query 
 * @param {number} [timeoutMs=60000] 
 * @returns {Promise<any[]>} Resultado de la consulta
 * 
 * 
 * 
 * 
 */

function emitirError(mensaje) {
  
  if (typeof process !== 'undefined' && typeof process.send === 'function') {
        // Enviamos como 'error' para que index.js lo detecte
        process.send({ progreso: 0, mensaje });
     
}
}


function consultarBasesDeDatos(config, query, timeoutMs = 60000) {
  const marcaInicio = new Date();

  // Extraer tabla (solo para log)
  const regex = /FROM\s+([^\s]+)/i;
  const match = query.match(regex);
  const tabla = match ? match[1] : '';
  console.log(tabla);

  console.log(`[${marcaInicio.toISOString()}] [ENTRADA FUNCION] Recibida solicitud de consulta para: ${config.database}`);

  return new Promise((resolve, reject) => {
    console.log(`[${new Date().toISOString()}] [INICIO] Intentando conectar con: ${config.database}`);

    Firebird.attach(config, (err, db) => {
      console.log(`[${new Date().toISOString()}] [CALLBACK ATTACH] Entró en el callback de conexión: ${config.database}`);

      if (err) {
        const textoError = `BACKUP EN PROCESO: ${config.database}`;
        console.error(` ❌ ${textoError}`);

        emitirError(textoError);
        // Emitir un error parcial al SSE
       /*
        eventBus.emit('progreso', {
          porcentaje: 0,
          mensaje: `❌ ERROR en ${config.database}: ${err.message}`
        });*/
        return reject(new Error(textoError));
      }

      let terminado = false;
      const timeoutId = setTimeout(() => {
        if (!terminado) {
          terminado = true;
          const textoError = `Timeout alcanzado en ${config.database}`;
          console.error(`[${new Date().toISOString()}] ⏰ ${textoError}`);
          db.detach();
          /*
          eventBus.emit('progreso', {
            porcentaje: 0,
            mensaje: `❌ ERROR en ${config.database}: Timeout alcanzado`
          });*/
          return reject(new Error(textoError));
        }
      }, timeoutMs);

      db.query(query, (errQuery, result) => {
        if (terminado) return;
        terminado = true;
        clearTimeout(timeoutId);
        db.detach();

        if (errQuery) {
          const textoError = `Error en la consulta a ${config.database}: ${errQuery.message}`;
          console.error(`[${new Date().toISOString()}] ❌ ${textoError}`);
          // Removido eventBus.emit ya que eventBus no está importado
          emitirError(`❌ ERROR en ${config.database}: ${errQuery.message}`);
          return reject(new Error(textoError));
        }

        console.log(`[${new Date().toISOString()}] ✅ Consulta completada con éxito en ${config.database}`);
        return resolve(result);
      });
    });
  });
}

module.exports = consultarBasesDeDatos;