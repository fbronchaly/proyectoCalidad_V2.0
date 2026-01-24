// controllers/flux/worker.js
const comienzoFlujo = require('./comienzoFlujo');
const { guardarResultadosLocal } = require('./guardarResultadosLocal'); // 👈 NUEVO
const { guardarResultadosExcel } = require('./guardarResultadosExcel'); // 👈 NUEVO EXCEL
const path = require('path'); // Asegurar que path está disponible si no lo estaba
const fs = require('fs');
const axios = require('axios'); // Para llamar al microservicio Python

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
      let transaccionId = null;
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
        transaccionId = resumenGuardado.id_transaccion;

      } catch (err) {
        console.error('⛔ CRÍTICO: Error al guardar en DB local (Mongo):', err);
      }

      // 🐍 LLAMADA AL MICROSERVICIO PYTHON (Generación de Informe PDF)
      let pdfFilename = null;
      if (transaccionId) {
        try {
          if (typeof process.send === 'function') {
            process.send({
              progreso: 95,
              mensaje: 'Generando informe analítico PDF con IA...',
              indice: 'PYTHON_MODULE'
            });
          }

          // PRIORIDAD: Nombre del servicio Docker si estamos en producción, sino variable de entorno, sino localhost
          // En Docker (red interna), 'calidad-python' es el host correcto, no localhost.
          const isDocker = process.env.PYTHON_SERVICE_URL && process.env.PYTHON_SERVICE_URL.includes('calidad-python');
          
          let pythonServiceUrl = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';
          
          // Debugging crítico para ver a dónde intenta conectar
          console.log('🐍 --- INTENTO DE CONEXIÓN A PYTHON ---');
          console.log(`   🔸 URL Configurada: ${pythonServiceUrl}`);
          console.log(`   🔸 Transacción ID: ${transaccionId}`);
          
          console.log(`🐍 Enviando POST a: ${pythonServiceUrl}/informe?id_transaccion=${transaccionId}`);
          
          const response = await axios.post(
            `${pythonServiceUrl}/informe?id_transaccion=${transaccionId}`, 
            {}, 
            { 
              responseType: 'stream',
              timeout: 120000 // Aumentamos timeout a 2 minutos para generación de PDF
            }
          );

          // Guardar el PDF recibido
          const outputDir = path.join(__dirname, '../../backups'); 
          if (!fs.existsSync(outputDir)) {
             fs.mkdirSync(outputDir, { recursive: true });
          }

          const pdfName = `Informe_Calidad_${fechaInicio}_${fechaFin}_${transaccionId.slice(0,8)}.pdf`;
          const pdfPath = path.join(outputDir, pdfName);
          
          const writer = fs.createWriteStream(pdfPath);
          response.data.pipe(writer);

          await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
          });

          console.log(`✅ Informe PDF generado y guardado EXITOSAMENTE: ${pdfName}`);
          console.log(`   📂 Ruta: ${pdfPath}`);
          pdfFilename = pdfName;

        } catch (pyErr) {
          console.error('⚠️ ERROR CRÍTICO COMUNICACIÓN PYTHON:', pyErr.message);
          if (pyErr.code === 'ECONNREFUSED') {
              console.error('   ❌ No se pudo conectar al servicio. Verifica que el contenedor "calidad-python" esté corriendo.');
          }
          if (pyErr.response) {
              console.error('   ❌ El servicio respondió con error:', pyErr.response.status, pyErr.response.statusText);
          }
          
          if (typeof process.send === 'function') {
             process.send({
               mensaje: 'Advertencia: El informe PDF no se pudo generar (Error de conexión con IA).'
             });
          }
        }
      }

      // 🔁 Lo de siempre: devolver resultados al proceso padre
      if (typeof process.send === 'function') {
        console.log('📤 Enviando resultados finales al proceso padre...');
        process.send({
          terminado: true,
          resultados,
          excelFilename, // Enviamos el nombre del archivo Excel
          pdfFilename,    // Enviamos el nombre del archivo PDF generado
          transaccionId
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
