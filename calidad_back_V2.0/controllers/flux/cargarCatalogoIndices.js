const fs = require('fs/promises');
const path = require('path');

// Ruta al JSON de índices
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

module.exports = cargarCatalogoIndices;
