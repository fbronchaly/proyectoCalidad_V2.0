// controllers/flux/worker.js
const comienzoFlujo = require('./comienzoFlujo');

// Leemos los argumentos que nos pasó index.js
const args = process.argv;
const fechaInicio = args[2];
const fechaFin    = args[3];
const baseDatos   = JSON.parse(args[4] || '[]');
const indices     = JSON.parse(args[5] || '[]');

(async () => {
  try {
    // Llamamos a comienzoFlujo con todos los parámetros y un callback para enviar progreso
    const resultados = await comienzoFlujo(fechaInicio, fechaFin, baseDatos, indices, (dato) => {
      process.send({
        progreso: dato.porcentaje,
        mensaje: dato.mensaje
      });
    });

    // Enviar los resultados finales al proceso padre
    process.send({ 
      terminado: true,
      resultados: resultados
    });
    process.exit(0);
  } catch (err) {
    process.send({ error: err.message || err.toString() });
    process.exit(1);
  }
})();
