// indicadorResultado.controller.js
const { ObjectId } = require('mongodb');

/**
 * Inserta una ejecución y sus resultados (Opción A: Relacional).
 * Espera un body con estructura: { ejecucion: {...}, resultados: [...] }
 * O adapta el payload antiguo si es necesario.
 */
async function upsertIndicadorResultado(req, res) {
  const db = req.app.locals.db;
  const colEjecuciones = db.collection('ejecuciones');
  const colResultados = db.collection('resultados');
  
  const doc = req.body;

  // Nota: Este endpoint asume que recibe los datos ya separados o 
  // que adaptamos la lógica. Para mantener compatibilidad con el flujo
  // anterior, si recibimos un objeto monolítico, lo separamos aquí.
  
  try {
    // 1. Extraer datos de la ejecución
    const ejecucion = {
      id_transaccion: doc.id_transaccion,
      periodo_aplicado: {
        desde: new Date(doc.periodo_aplicado.desde),
        hasta: new Date(doc.periodo_aplicado.hasta)
      },
      version: doc.version,
      estado_global: doc.estado_calculo || 'ok',
      creado_en: new Date()
    };

    // 2. Extraer resultados
    const resultados = (doc.resultados || []).map(r => ({
      id_transaccion: doc.id_transaccion,
      id_resultado: r.id_resultado || new ObjectId().toString(),
      base: r.base,
      indice: r.indice,
      payload: r.payload,
      metadata_calculo: r.metadata_calculo,
      creado_en: new Date()
    }));

    // 3. Guardar Ejecución (upsert por id_transaccion)
    await colEjecuciones.updateOne(
      { id_transaccion: ejecucion.id_transaccion },
      { $set: ejecucion },
      { upsert: true }
    );

    // 4. Guardar Resultados
    // Borramos previos de esa transacción para evitar duplicados en re-runs
    await colResultados.deleteMany({ id_transaccion: ejecucion.id_transaccion });
    
    if (resultados.length > 0) {
      await colResultados.insertMany(resultados);
    }

    res.status(200).json({
      ok: true,
      message: 'Datos guardados correctamente (Modelo Relacional)',
      id_transaccion: ejecucion.id_transaccion
    });

  } catch (err) {
    console.error('Error upsertIndicadorResultado:', err);
    res.status(500).json({
      ok: false,
      error: err.message
    });
  }
}

/**
 * Obtener resultados por id_code + periodo
 * Realiza un JOIN ($lookup) entre 'resultados' y 'ejecuciones'
 */
async function getResultadosByIndice(req, res) {
  const db = req.app.locals.db;
  const colResultados = db.collection('resultados');

  const { id_code } = req.params;
  const { desde, hasta } = req.query;

  try {
    const pipeline = [
      // 1. Filtrar por indicador
      { $match: { "indice.id_code": id_code } },
      
      // 2. Unir con la ejecución para obtener las fechas
      {
        $lookup: {
          from: "ejecuciones",
          localField: "id_transaccion",
          foreignField: "id_transaccion",
          as: "ejecucion_info"
        }
      },
      { $unwind: "$ejecucion_info" }
    ];

    // 3. Filtrar por fechas si vienen en la query
    if (desde || hasta) {
      const matchFecha = {};
      if (desde) matchFecha["ejecucion_info.periodo_aplicado.desde"] = { $gte: new Date(desde) };
      if (hasta) matchFecha["ejecucion_info.periodo_aplicado.hasta"] = { $lte: new Date(hasta) };
      
      pipeline.push({ $match: matchFecha });
    }

    // 4. Proyección final (opcional, para limpiar la salida)
    pipeline.push({
      $project: {
        _id: 0,
        id_resultado: 1,
        base: 1,
        indice: 1,
        payload: 1,
        metadata_calculo: 1,
        periodo: "$ejecucion_info.periodo_aplicado",
        version: "$ejecucion_info.version"
      }
    });

    const docs = await colResultados.aggregate(pipeline).toArray();
    res.json({ ok: true, data: docs });

  } catch (err) {
    console.error('Error getResultadosByIndice:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = {
  upsertIndicadorResultado,
  getResultadosByIndice
};
