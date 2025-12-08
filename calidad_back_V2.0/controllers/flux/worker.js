// controllers/flux/worker.js
const comienzoFlujo = require('./comienzoFlujo');
const { guardarResultadosLocal } = require('./guardarResultadosLocal'); // 👈 NUEVO
const { guardarResultadosExcel } = require('./guardarResultadosExcel'); // 👈 NUEVO EXCEL

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
      try {
        console.log('💾 Iniciando guardado de respaldo en Excel...');
       await guardarResultadosExcel(fechaInicio, fechaFin, resultados);
      } catch (excelErr) {
        console.error('⚠️ Error al guardar Excel de respaldo:', excelErr.message);
        // No detenemos el flujo si falla el excel, solo logueamos
      }

      // 💾 COMENTADO TEMPORALMENTE: guardar en Mongo hasta que desarrollemos esta parte
      /*
      try {
        const resumenGuardado = await guardarResultadosLocal(
          fechaInicio,
          fechaFin,
          baseDatos,
          indices,
          resultados
        );
        console.log('💾 Resultados guardados en DB local:', resumenGuardado);
      } catch (err) {
        console.error('⛔ Error al guardar en DB local (Mongo):', err.message);
      }
      */
      console.log('💾 Guardado en MongoDB temporalmente desactivado durante desarrollo');

      // 🔁 Lo de siempre: devolver resultados al proceso padre
      if (typeof process.send === 'function') {
        console.log('📤 Enviando resultados finales al proceso padre...');
        process.send({
          terminado: true,
          resultados
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
