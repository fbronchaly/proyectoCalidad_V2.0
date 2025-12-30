// controllers/flux/worker.js
const comienzoFlujo = require('./comienzoFlujo');
const { guardarResultadosLocal } = require('./guardarResultadosLocal'); // 👈 NUEVO
const { guardarResultadosExcel } = require('./guardarResultadosExcel'); // 👈 NUEVO EXCEL
const path = require('path'); // Asegurar que path está disponible si no lo estaba

// Asegurar carga de variables de entorno en el worker
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// Solo ejecutar si este archivo es el script principal (fork o node worker.js),
// NO cuando se hace require() desde otro módulo.
if (require.main === module) {
  // Leemos los argumentos que nos pasó index.js o la línea de comandos
  const args = process.argv;
  const fechaInicio = args[2];
  const fechaFin    = args[3];
  const baseDatos   = JSON.parse(args[4] || '[]');
  const indices     = JSON.parse(args[5] || '[]');

  (async () => {
    try {
      const resultados = await comienzoFlujo(
        fechaInicio,
        fechaFin,
        baseDatos,
        indices,
        (dato) => {
          if (typeof process.send === 'function') {
            process.send({
              progreso: dato.porcentaje,
              mensaje: dato.mensaje,
              indice: dato.indice
            });
          }
        }
      );

      // 💾 Guardar en Excel de respaldo
      let excelFilename = null;
      try {
        console.log('💾 Iniciando guardado de respaldo en Excel...');
        const resultExcel = await guardarResultadosExcel(fechaInicio, fechaFin, resultados);
        if (resultExcel.success) {
            // Extraemos solo el nombre del archivo para enviarlo al frontend
            excelFilename = path.basename(resultExcel.path);
        }
      } catch (excelErr) {
        console.error('⚠️ Error al guardar Excel de respaldo:', excelErr.message);
        // No detenemos el flujo si falla el excel, solo logueamos
      }

      // 💾 Guardar en Mongo
      try {
        console.log('💾 Intentando guardar en MongoDB...');
        console.log(`   - URI: ${process.env.MONGODB_URI ? 'Definida' : 'NO DEFINIDA'}`);
        console.log(`   - DB Name: ${process.env.MONGODB_DBNAME || 'calidad'}`);
        console.log(`   - Cantidad de indicadores a guardar: ${resultados ? resultados.length : 0}`);

        const resumenGuardado = await guardarResultadosLocal(
          fechaInicio,
          fechaFin,
          baseDatos,
          indices,
          resultados
        );
        console.log('✅ Resultados guardados en DB local:', JSON.stringify(resumenGuardado, null, 2));
      } catch (err) {
        console.error('⛔ CRÍTICO: Error al guardar en DB local (Mongo):', err);
      }

      // 🔁 Lo de siempre: devolver resultados al proceso padre
      if (typeof process.send === 'function') {
        console.log('📤 Enviando resultados finales al proceso padre...');
        process.send({
          terminado: true,
          resultados,
          excelFilename // Enviamos el nombre del archivo
        });
        console.log('✅ Mensaje de finalización enviado correctamente');
        
        setTimeout(() => {
          console.log('🏁 Worker terminando después de enviar resultados');
          process.exit(0);
        }, 1000);
      } else {
        console.log('⚠️ process.send no disponible - no se puede comunicar con el padre');
        process.exit(0);
      }
    } catch (err) {
      if (typeof process.send === 'function') {
        process.send({ error: err.message || err.toString() });
      }
      process.exit(1);
    }
  })();
}

// (Opcional) si algún día quieres usar comienzoFlujo directamente al hacer require:
module.exports = comienzoFlujo;
