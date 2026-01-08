const fs = require('fs');
const path = require('path');

// Rutas a archivos de configuración
const RUTA_CODIGOS_HD = path.resolve(__dirname, '../../documentacion/codigosHD.json');
const RUTA_ACCESOS_VASCULARES = path.resolve(__dirname, '../../documentacion/accesos_vasculares.json');
const groupedTests = require('../../comorbilidad/transformed_grouped_tests.json'); 

// Cache en memoria
let mapaCodigosHdPorDatabase = null;
let mapaAccesosVascularesPorDatabase = null;

// Mapa global TIPOHEMO (referencia)
const MAPA_TIPOHEMO_GLOBAL = {
  1: 'HD',             
  2: 'HD OL',          
  3: 'HD EXTENDIDA',   
  4: 'HD DOM',
  5: 'PERIT',          
  6: 'HD UCI',         
};

/**
 * Carga accesos_vasculares.json y construye mapa.
 */
function getMapaAccesosVasculares() {
  if (mapaAccesosVascularesPorDatabase !== null) return mapaAccesosVascularesPorDatabase;

  try {
    if (fs.existsSync(RUTA_ACCESOS_VASCULARES)) {
      let raw = fs.readFileSync(RUTA_ACCESOS_VASCULARES, 'utf8');
      raw = raw.replace(/^\uFEFF/, '').trim();
      const json = JSON.parse(raw);

      mapaAccesosVascularesPorDatabase = {};

      if (Array.isArray(json.data)) {
        for (const entry of json.data) {
          if (!entry || !entry.baseData) continue;

          const accesos = Array.isArray(entry.items)
          ? entry.items
          : Array.isArray(entry.accesos)
            ? entry.accesos
            : [];

          const full = String(entry.baseData).trim().toLowerCase();              
          const file = path.basename(full).trim().toLowerCase();                
          const fileNoExt = file.replace(/\.gdb$/i, '').trim().toLowerCase();   

          mapaAccesosVascularesPorDatabase[full] = accesos;
          mapaAccesosVascularesPorDatabase[file] = accesos;
          mapaAccesosVascularesPorDatabase[fileNoExt] = accesos;
        }
      }
    } else {
      mapaAccesosVascularesPorDatabase = {};
    }
  } catch (err) {
    console.error('⛔ Error cargando accesos_vasculares:', err.message);
    mapaAccesosVascularesPorDatabase = {};
  }
  return mapaAccesosVascularesPorDatabase;
}

/**
 * Helpers de reemplazo específicos
 */
function aplicarCodigosFavProtesisPorBase(query, config) {
  if (!query || !query.includes('<CODIGOS_FAV_PROTESIS>')) return query;
  const mapa = getMapaAccesosVasculares();
  const db = String(config?.database || '').trim().toLowerCase();
  const fileKey = path.basename(db);
  const fileNoExtKey = fileKey.replace(/\.gdb$/i, '');
  const accesos = mapa[db] || mapa[fileKey] || mapa[fileNoExtKey] || [];

  const codigos = accesos
      .filter(a => a && (a.ES_CATETER === 2 || a.ES_CATETER === 3) && a.CODIGO != null)
      .map(a => a.CODIGO);

  return query.replace(/<CODIGOS_FAV_PROTESIS>/gi, codigos.length ? codigos.join(',') : '-99999');
}

function aplicarCodigosFavAutologaPorBase(query, config) {
  if (!query || !query.includes('<CODIGOS_FAV_AUTOLOGA>')) return query;
  const mapa = getMapaAccesosVasculares();
  const db = String(config?.database || '').trim().toLowerCase();
  const fileKey = path.basename(db);
  const fileNoExtKey = fileKey.replace(/\.gdb$/i, '');
  const accesos = mapa[db] || mapa[fileKey] || mapa[fileNoExtKey] || [];

  const codigos = accesos
        .filter(a => a && a.ES_CATETER === 2 && a.CODIGO != null)
        .map(a => a.CODIGO);

  return query.replace(/<CODIGOS_FAV_AUTOLOGA>/gi, codigos.length ? codigos.join(',') : '-99999');
}

function aplicarCodigosProtesisPorBase(query, config) {
  if (!query || !query.includes('<CODIGOS_PROTESIS>')) return query;
  const mapa = getMapaAccesosVasculares();
  const db = String(config?.database || '').trim().toLowerCase();
  const fileKey = path.basename(db);
  const fileNoExtKey = fileKey.replace(/\.gdb$/i, '');
  const accesos = mapa[db] || mapa[fileKey] || mapa[fileNoExtKey] || [];

  const codigos = accesos
      .filter(a => a && a.ES_CATETER === 3 && a.CODIGO != null)
      .map(a => a.CODIGO);

  return query.replace(/<CODIGOS_PROTESIS>/gi, codigos.length ? codigos.join(',') : '-99999');
}

function aplicarCodigosCateterPorBase(query, config) {
  if (!query || !query.includes('<CODIGOS_CATETER>')) return query;
  const mapa = getMapaAccesosVasculares();
  const db = String(config?.database || '').trim().toLowerCase();
  const fileKey = path.basename(db);
  const fileNoExtKey = fileKey.replace(/\.gdb$/i, '');
  const accesos = mapa[db] || mapa[fileKey] || mapa[fileNoExtKey] || [];

  const codigos = accesos
      .filter(a => a && a.ES_CATETER === -1 && a.CODIGO != null)
      .map(a => a.CODIGO);

  return query.replace(/<CODIGOS_CATETER>/gi, codigos.length ? codigos.join(',') : '-99999');
}

function aplicarCodTestPorBase(query, config) {
  if (!query) return query;
  const baseName = config.database;
  if (!baseName) return query;

  let queryModificada = query;
  const regex = /<CODTEST_([A-Z0-9_]+)>/gi;
  let match;

  while ((match = regex.exec(query)) !== null) {
    const testKey = match[1];
    const mapaTest = groupedTests[testKey];
    if (mapaTest && mapaTest[baseName]) {
      const placeholder = new RegExp(`<CODTEST_${testKey}>`, 'gi');
      queryModificada = queryModificada.replace(placeholder, String(mapaTest[baseName]));
    }
  }
  return queryModificada;
}

function aplicarCodigosCateterTunelizadoPorBase(query, config) {
    if (!query || !query.includes('<CODIGOS_CATETER_TUNELIZADO>')) return query;
  
    const mapa = getMapaAccesosVasculares();
    const db = String(config?.database || '').trim().toLowerCase();
    const fileKey = path.basename(db);
    const fileNoExtKey = fileKey.replace(/\.gdb$/i, '');
    const accesos = mapa[db] || mapa[fileKey] || mapa[fileNoExtKey] || [];
  
    // Captura:
    // - "CATETER TUNELIZADO"
    // - "CATETER TRANSITORIO TUNELIZADO"
    const codigos = accesos
      .filter(a =>
        a &&
        a.CODIGO != null &&
        typeof a.TIPOACCESO === 'string' &&
        a.TIPOACCESO.includes('CATETER') &&
        a.TIPOACCESO.includes('TUNELIZADO')
      )
      .map(a => a.CODIGO);
  
    return query.replace(/<CODIGOS_CATETER_TUNELIZADO>/gi, codigos.length ? codigos.join(',') : '-99999');
  }
  

/**
 * Función principal que orquesta todos los reemplazos
 */
function procesarQuery(queryOriginal, config) {
  let query = queryOriginal;
  
  query = aplicarCodTestPorBase(query, config);
  query = aplicarCodigosCateterTunelizadoPorBase(query, config); 
  query = aplicarCodigosCateterPorBase(query, config);
  query = aplicarCodigosFavProtesisPorBase(query, config);
  query = aplicarCodigosFavAutologaPorBase(query, config);
  query = aplicarCodigosProtesisPorBase(query, config);
  
  return query;
}

module.exports = { procesarQuery };
