// indicadorResultado.controller.js
const { ObjectId } = require('mongodb');

/**
 * Colección: indicadores_resultados
 * Recibe un documento (DocumentoIndicador) y lo inserta.
 * Si existe ya una combinación id_transaccion + periodo + version, puedes decidir
 * sobrescribir (upsert) o lanzar error. Aquí hago upsert.
 */
async function upsertIndicadorResultado(req, res) {
  const db = req.app.locals.db; // ya conectado en app.js
  const collection = db.collection('indicadores_resultados');
  const doc = req.body;

  try {
    // normalización básica de fechas
    if (doc.periodo_aplicado?.desde) {
      doc.periodo_aplicado.desde = new Date(doc.periodo_aplicado.desde);
    }
    if (doc.periodo_aplicado?.hasta) {
      doc.periodo_aplicado.hasta = new Date(doc.periodo_aplicado.hasta);
    }
    if (Array.isArray(doc.resultados)) {
      doc.resultados = doc.resultados.map(r => ({
        ...r,
        creado_en: r.creado_en ? new Date(r.creado_en) : new Date()
      }));
    }

    const filtro = {
      id_transaccion: doc.id_transaccion,
      'periodo_aplicado.desde': doc.periodo_aplicado.desde,
      'periodo_aplicado.hasta': doc.periodo_aplicado.hasta,
      version: doc.version
    };

    const opciones = { upsert: true, returnDocument: 'after' };

    const { value } = await collection.findOneAndUpdate(
      filtro,
      { $set: doc },
      opciones
    );

    res.status(200).json({
      ok: true,
      data: value
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
 */
async function getResultadosByIndice(req, res) {
  const db = req.app.locals.db;
  const collection = db.collection('indicadores_resultados');

  const { id_code } = req.params;
  const { desde, hasta } = req.query;

  const filtro = {
    'resultados.indice.id_code': id_code
  };

  if (desde || hasta) {
    filtro['periodo_aplicado.desde'] = desde ? new Date(desde) : { $exists: true };
    filtro['periodo_aplicado.hasta'] = hasta
      ? new Date(hasta)
      : { $exists: true };
  }

  try {
    const docs = await collection.find(filtro).toArray();
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
