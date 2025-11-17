// comienzoFlujo.js
const fs = require('fs/promises');
const path = require('path');
const consultaGenerica = require('./consultaGenerica'); // mantiene tu firma existente

// Ruta actualizada al JSON de índices (ahora dentro del backend)
const RUTA_INDICES = path.resolve(__dirname, '../../documentacion/indicesJSON.json');

/**
 * Carga el catálogo de índices y crea un mapa por id_code.
 */
async function cargarCatalogoIndices() {
  console.log('🔍 Intentando leer archivo desde:', RUTA_INDICES);
  
  try {
    // Leer el archivo usando fs/promises (asíncrono)
    let raw = await fs.readFile(RUTA_INDICES, 'utf8');
    console.log('📄 Tamaño del archivo leído:', raw.length, 'caracteres');
    console.log('🔤 Primeros 100 caracteres:', raw.substring(0, 100));
    
    // Limpiar BOM y caracteres invisibles al inicio
    raw = raw.replace(/^\uFEFF/, ''); // Eliminar BOM UTF-8
    raw = raw.trim(); // Eliminar espacios en blanco al inicio y final
    
    // Verificar que empiece con '[' (array JSON)
    if (!raw.startsWith('[')) {
      console.log('🔍 El archivo no empieza con [, buscando el inicio del array...');
      const startIndex = raw.indexOf('[');
      if (startIndex > 0) {
        raw = raw.substring(startIndex);
        console.log('✂️ Contenido recortado desde posición:', startIndex);
      }
    }
    
    console.log('🧹 Después de limpieza - Primeros 50 caracteres:', raw.substring(0, 50));
    
    if (raw.length === 0) {
      throw new Error('El archivo JSON está vacío después de la limpieza');
    }
    
    // Intentar parsear
    const lista = JSON.parse(raw);
    console.log('✅ JSON parseado correctamente. Elementos encontrados:', lista.length);
    
    const mapa = new Map();
    for (const it of lista) {
      if (it && it.id_code) mapa.set(it.id_code.trim(), it);
    }
    console.log('🗺️ Mapa creado con', mapa.size, 'elementos');
    
    return { lista, mapa };
  } catch (error) {
    console.error('❌ Error detallado en cargarCatalogoIndices:', error);
    console.error('❌ Ruta que se intentó leer:', RUTA_INDICES);
    throw error;
  }
}

/**
 * @param {string} fechaInicio - fecha inicio (DD-MM-YYYY o YYYY-MM-DD)
 * @param {string} fechaFin    - fecha fin    (DD-MM-YYYY o YYYY-MM-DD)
 * @param {Array<string>} baseDatos - array de bases seleccionadas
 * @param {Array<string>} indices   - array de id_code a consultar secuencialmente
 * @param {Function} onProgress     - callback de progreso opcional
 * @returns {Promise<Array>}        - resultados por índice, listos para MongoDB
 */
const comienzoFlujo = async (fechaInicio, fechaFin, baseDatos, indices, onProgress) => {
  // Log de entrada
  console.log('✅ comienzoFlujo: datos recibidos ->', {
    fechaInicio, fechaFin, baseDatos, indices
  });

  // Helper progreso
  const totalPasos = (Array.isArray(indices) ? indices.length : 0) + 2;
  let paso = 0;
  const avanza = (mensaje) => {
    paso++;
    const porcentaje = Math.round((paso / totalPasos) * 100);
    const progreso = { paso, mensaje, porcentaje };
    console.log('→', progreso);
    if (onProgress) onProgress(progreso);
  };

  try {
    if (!fechaInicio || !fechaFin) {
      throw new Error('Debes proporcionar fechaInicio y fechaFin');
    }
    if (!Array.isArray(baseDatos) || baseDatos.length === 0) {
      throw new Error('Debes proporcionar un array de bases en baseDatos');
    }
    if (!Array.isArray(indices) || indices.length === 0) {
      throw new Error('Debes proporcionar un array de índices (id_code)');
    }

    // 1) Cargar catálogo de índices
    avanza('Cargando catálogo de índices…');
    const { mapa } = await cargarCatalogoIndices(); // busca id_code -> {categoria, indicador, template} :contentReference[oaicite:1]{index=1}

    // 2) Ejecutar cada índice de forma SECuencial (await en bucle)
    const intervalo = [fechaInicio, fechaFin]; // el formateo a ISO lo hace consultaGenerica :contentReference[oaicite:2]{index=2}
    const salida = [];

    for (const id of indices) {
      avanza(`Procesando índice ${id}…`);

      const def = mapa.get(String(id).trim());
      if (!def) {
        // índice desconocido: guarda error con estructura consistente
        salida.push({
          id_code: id,
          error: `Índice no encontrado en indicesJSON.json`,
          resultados: [],
          totales: { resultado: 0, numero_pacientes: 0 }
        });
        continue;
      }

      // 2.1) Obtener plantilla SQL del índice
      const { categoria, indicador, template } = def;

      // 2.2) Llamar SECuencialmente a consultaGenerica
      //     - consultaGenerica ya normaliza fechas y ejecuta por cada base
      //     - devuelve array por base con { baseData, resultado, numeroDePacientes, [error] } :contentReference[oaicite:3]{index=3}
      const porBase = await consultaGenerica(intervalo, baseDatos, def.template);

      // 2.3) Resumen de totales (suma de todas las bases)
      const totales = porBase.reduce(
        (acc, r) => {
          acc.resultado += Number(r.resultado || 0);
          acc.numero_pacientes += Number(r.numeroDePacientes || r.numero_pacientes || 0);
          return acc;
        },
        { resultado: 0, numero_pacientes: 0 }
      );

      // 2.4) Estructura final (lista para insertar en MongoDB)
      salida.push({
        id_code: id,
        categoria,
        indicador,
        intervalo: { fechaInicio, fechaFin }, // tal cual lo recibimos (ISO lo gestiona la capa de consulta)
        consulta_sql: template,               // conserva la plantilla usada
        bases_datos: porBase.map(r => r.baseData), // Lista de nombres de bases procesadas
        resultados: porBase,                  // detalle por base con baseData incluido
        totales                               // agregado
      });
    }

    avanza('Proceso completado.');
    console.log(`🎯 Proceso completado exitosamente. ${salida.length} indicadores procesados.`);
    // Logging detallado solo en desarrollo
    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Resumen de resultados:', salida.map(s => ({
        id: s.id_code,
        categoria: s.categoria,
        resultado: s.totales?.resultado || 0,
        pacientes: s.totales?.numero_pacientes || 0
      })));
    }
    return salida;
  } catch (err) {
    console.error('⛔ Error en comienzoFlujo:', err);
    if (onProgress) onProgress({ error: true, mensaje: err.message || 'Error desconocido' });
    throw err;
  }
};

module.exports = comienzoFlujo;
