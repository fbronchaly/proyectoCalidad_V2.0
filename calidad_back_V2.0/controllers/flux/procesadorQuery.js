const fs = require('fs');
const path = require('path');

const catalogosMedicamentosCAPTORES = require('../../documentacion/CatalogosMedicamentos_QUELANTES_FOSFORO_por_centro.json');
const catalogosTratamientosCAPTORES = require('../../documentacion/CatalogosTratamientos_CAPTORES_FOSFORO_por_centro.json');
const catalogosMedicamentosCALCIVITD = require('../../documentacion/CatalogosMedicamentos.index.json');
const catalogosTratamientosCALCIVITD = require('../../documentacion/CatalogosTratamientos_CAPTORES_FOSFORO_por_centro.json');

// Rutas a archivos de configuración
const RUTA_ACCESOS_VASCULARES = path.resolve(__dirname, '../../documentacion/accesos_vasculares.json');
const groupedTests = require('../../comorbilidad/transformed_grouped_tests.json'); 

// Cache en memoria
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
 * Lógica corregida para leer la estructura real de los JSONs (Objetos, no Arrays)
 */
function obtenerCodigosCaptoresPorCentro(nombreCentro) {
  const centroBuscado = nombreCentro.toLowerCase(); // ej: 'losolmos'

  // Helper para buscar el nodo del centro en un objeto mapa {ruta: data}
  // Normaliza las rutas "/NFS/.../NF6_LosOlmos.gdb" a "losolmos" para comparar"
  const encontrarNodoCentro = (mapaCentros) => {
    if (!mapaCentros) return null;
    const key = Object.keys(mapaCentros).find(k => {
      // Ignoramos claves que no sean rutas (ej: "version", "source_file")
      if (!k.includes('/')) return false; 
      
      const nombreKey = path.basename(k)
        .replace(/^NF6_/i, '')
        .replace(/\.gdb$/i, '')
        .toLowerCase();
      
      return nombreKey === centroBuscado;
    });
    return key ? mapaCentros[key] : null;
  };

  const codigos = [];

  // Función interna para extraer códigos de un nodo 'byTipo' buscando palabras clave
  const extraerDeByTipo = (byTipoObj) => {
    if (!byTipoObj) return;
    const claves = Object.keys(byTipoObj);
    
    // Palabras clave para identificar captores de fósforo en los nombres de categoría (ej: "QUELANTES DEL FSFORO")
    const keywords = ['FOSFORO', 'FSFORO', 'PHOS', 'CAPTOR', 'QUELANTE'];
    
    const clavesInteres = claves.filter(k => {
        const upper = k.toUpperCase();
        return keywords.some(w => upper.includes(w));
    });

    clavesInteres.forEach(k => {
        const entry = byTipoObj[k];
        if (entry && Array.isArray(entry.codes)) {
            codigos.push(...entry.codes);
        }
    });
  };

  // 1. Medicamentos: Estructura { centros: { "/ruta": ... } }
  const mapMed = catalogosMedicamentosCAPTORES.centros || {};
  const nodoMed = encontrarNodoCentro(mapMed);
  if (nodoMed && nodoMed.byTipo) {
      extraerDeByTipo(nodoMed.byTipo);
  }

  // 2. Tratamientos: Estructura { "/ruta": ... } (Directo en raíz)
  const nodoTrat = encontrarNodoCentro(catalogosTratamientosCAPTORES);
  if (nodoTrat && nodoTrat.byTipo) {
      extraerDeByTipo(nodoTrat.byTipo);
  }

  return [...new Set(codigos)];
}

/**
 * Lógica para obtener códigos de Vitamina D y Calcimiméticos
 */
function obtenerCodigosVitDCalcimimPorCentro(nombreCentro) {
  const centroBuscado = nombreCentro.toLowerCase(); 

  const encontrarNodoCentro = (mapaCentros) => {
    if (!mapaCentros) return null;
    const key = Object.keys(mapaCentros).find(k => {
      if (!k.includes('/')) return false; 
      const nombreKey = path.basename(k)
        .replace(/^NF6_/i, '')
        .replace(/\.gdb$/i, '')
        .toLowerCase();
      return nombreKey === centroBuscado;
    });
    return key ? mapaCentros[key] : null;
  };

  const codigos = [];

  const extraerDeByTipo = (byTipoObj) => {
    if (!byTipoObj) return;
    const claves = Object.keys(byTipoObj);
    
    // Palabras clave para Vitamina D (oral/IV) y Calcimiméticos
    // Incluyo marcas comunes por si acaso aparecen como categoría
    const keywords = ['VITAMINA D', 'CALCIMIM', 'CALCITRIOL', 'CINACALCET', 'PARICALCITOL', 'ETELCALCETIDA', 'ZEMPLAR', 'MIMPARA', 'PARSABIV', 'ROCALTROL'];
    
    const clavesInteres = claves.filter(k => {
        const upper = k.toUpperCase();
        return keywords.some(w => upper.includes(w));
    });

    clavesInteres.forEach(k => {
        const entry = byTipoObj[k];
        if (entry && Array.isArray(entry.codes)) {
            codigos.push(...entry.codes);
        }
    });
  };

  // 1. Medicamentos
  const mapMed = catalogosMedicamentosCALCIVITD.centros || {};
  const nodoMed = encontrarNodoCentro(mapMed);
  if (nodoMed && nodoMed.byTipo) {
      extraerDeByTipo(nodoMed.byTipo);
  }

  // 2. Tratamientos
  const nodoTrat = encontrarNodoCentro(catalogosTratamientosCALCIVITD);
  if (nodoTrat && nodoTrat.byTipo) {
      extraerDeByTipo(nodoTrat.byTipo);
  }

  return [...new Set(codigos)];
}

function aplicarCodigosCaptoresPorBase(query, config) {
  if (!query || !query.includes(':CODIGOS_CAPTORES')) return query;

  // Extraer nombre limpio del centro a partir de config
  let baseData = config.nombre || config.database || '';
  baseData = path.basename(String(baseData));          
  baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); 

  const codigosRaw = obtenerCodigosCaptoresPorCentro(baseData);

  // 🔧 NORMALIZACIÓN DEFINITIVA DE CÓDIGOS
  const codigosNorm = [...new Set(
    codigosRaw
      .map(c => String(c).trim().toUpperCase())
      .filter(Boolean)
  )];
  
  // (opcional pero muy útil para confirmar)
  console.log('🧩 CAPTORES NORMALIZADOS:', codigosNorm);
  
  const listaSQL = codigosNorm.map(c => `'${c}'`).join(',');


   // OJO: si está vacío, ahora lo dejamos visible (para que lo detectes rápido)
   if (!listaSQL) {
    console.warn(`⚠️ CAPTORES VACÍO para ${baseData}. Revisa la clave del centro en los JSON de catálogos.`);
  }
  
  return query.replace(/:CODIGOS_CAPTORES/g, listaSQL || "''");
}

function aplicarCodigosVitDCalcimimPorBase(query, config) {
  if (!query || !query.includes(':CODIGOS_VITD_CALCIMIM')) return query;

  // Extraer nombre limpio del centro a partir de config
  let baseData = config.nombre || config.database || '';
  baseData = path.basename(String(baseData));          
  baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); 

  const codigosRaw = obtenerCodigosVitDCalcimimPorCentro(baseData);

  // NORMALIZACIÓN
  const codigosNorm = [...new Set(
    codigosRaw
      .map(c => String(c).trim().toUpperCase())
      .filter(Boolean)
  )];
  
  const listaSQL = codigosNorm.map(c => `'${c}'`).join(',');
  
   if (!listaSQL) {
    console.warn(`⚠️ VITD/CALCIMIM VACÍO para ${baseData}.`);
  }
  
  return query.replace(/:CODIGOS_VITD_CALCIMIM/g, listaSQL || "''");
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
  
  query = aplicarCodigosCaptoresPorBase(query, config); // Nueva integración
  query = aplicarCodigosVitDCalcimimPorBase(query, config); // Vitamina D y Calcimiméticos
  query = aplicarCodTestPorBase(query, config);
  query = aplicarCodigosCateterTunelizadoPorBase(query, config); 
  query = aplicarCodigosCateterPorBase(query, config);
  query = aplicarCodigosFavProtesisPorBase(query, config);
  query = aplicarCodigosFavAutologaPorBase(query, config);
  query = aplicarCodigosProtesisPorBase(query, config);
  
  return query;
}

module.exports = { procesarQuery };
