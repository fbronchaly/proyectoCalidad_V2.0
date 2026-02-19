const fs = require('fs');
const path = require('path');

const catalogosMedicamentosCAPTORES = require('../../documentacion/CatalogosMedicamentos_QUELANTES_FOSFORO_por_centro.json');
const catalogosTratamientosCAPTORES = require('../../documentacion/CatalogosTratamientos_CAPTORES_FOSFORO_por_centro.json');
const catalogosMedicamentosCALCIVITD = require('../../documentacion/CatalogosMedicamentos.index.json');

// Rutas a archivos de configuración
const RUTA_ACCESOS_VASCULARES = path.resolve(__dirname, '../../documentacion/accesos_vasculares.json');
const RUTA_COMPACTADOS = path.resolve(__dirname, '../../documentacion/compactados'); // Nueva ruta
const groupedTests = require('../../comorbilidad/transformed_grouped_tests.json'); 
const basesDeDatosMap = require('../../documentacion/basesDeDatosJSON.json');
const codigosHD = require('../../documentacion/codigosHD.json');


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
 * Devuelve el entry del centro en codigosHD.json según config.database
 * (compara por ruta completa o por basename del .gdb)
 */
function obtenerEntryCodigosHDPorBase(config) {
  const dbPath = String(config?.database || '').trim().toLowerCase();
  const dbBase = path.basename(dbPath);

  const arr = Array.isArray(codigosHD) ? codigosHD : [];

  return arr.find(e => {
    const eDb = String(e?.database || '').trim().toLowerCase();
    const eBase = path.basename(eDb);
    return eDb === dbPath || eBase === dbBase;
  });
}
/**
 * Devuelve lista de CODIGO (sin comillas) para las DESCRIPCION indicadas.
 * Ej: ['HD OL'] o ['HD','HD OL','HD EXTENDIDA']
 */
function obtenerCodigosHDPorBaseYDescripciones(config, descripciones) {
  const entry = obtenerEntryCodigosHDPorBase(config);

  const wanted = new Set(
    (Array.isArray(descripciones) ? descripciones : [descripciones])
      .map(d => String(d).trim().toUpperCase())
      .filter(Boolean)
  );

  const lista = (entry?.resultado || [])
    .filter(x => {
      const desc = String(x?.DESCRIPCION || '').trim().toUpperCase();
      return wanted.has(desc) && x?.CODIGO != null;
    })
    .map(x => String(x.CODIGO).trim())
    .filter(Boolean);

  // únicos
  return [...new Set(lista)];
}

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
 * HELPER GENÉRICO PARA LEER DE COMPACTADOS
 */
function obtenerCodigosDeCompactado(nombreCentro, categorias) {
  // Limpieza del nombre base (ej: NF6_DB1.gdb -> DB1)
  let baseData = path.basename(String(nombreCentro));          
  baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, '').replace(/\.json$/i, ''); 

  // INTENTO DE RESOLUCIÓN A DB CODE (ej: Teixedal -> DB16)
  let targetName = baseData;
  const entry = Object.entries(basesDeDatosMap).find(([cod, nombre]) => 
      String(nombre).trim().toLowerCase() === String(baseData).trim().toLowerCase()
  );
  if (entry) {
      targetName = entry[0];
  }

  // Priorizamos buscar por el código DB (DB16_compacted.json)
  let nombreFichero = `${targetName}_compacted.json`;
  let rutaCompleta = path.join(RUTA_COMPACTADOS, nombreFichero);
  
  // Si no existe, hacemos fallback al nombre original (Teixedal_compacted.json)
  if (!fs.existsSync(rutaCompleta) && targetName !== baseData) {
      nombreFichero = `${baseData}_compacted.json`;
      rutaCompleta = path.join(RUTA_COMPACTADOS, nombreFichero);
  }

  let codigos = [];

  if (fs.existsSync(rutaCompleta)) {
    try {
        const contenido = fs.readFileSync(rutaCompleta, 'utf8');
        const data = JSON.parse(contenido);
        // categorias puede ser string 'EPO' o array ['VITAMINA_D', 'CALCIMIMETICOS']
        const cats = Array.isArray(categorias) ? categorias : [categorias];
        
        cats.forEach(cat => {
            if (data[cat] && Array.isArray(data[cat])) {
                 data[cat].forEach(grupo => {
                     if (grupo.CODIGOS && Array.isArray(grupo.CODIGOS)) {
                         codigos = codigos.concat(grupo.CODIGOS);
                     }
                     // AÑADIR TAMBIÉN PRESENTACIONES PARA MAYOR ROBUSTEZ (por si el campo TRATAMIENTO usa nombre comercial)
                     if (grupo.PRESENTACIONES && Array.isArray(grupo.PRESENTACIONES)) {
                         codigos = codigos.concat(grupo.PRESENTACIONES);
                     }
                 });
            }
        });
    } catch (err) {
        console.error(`Error leyendo compactado ${baseData} para ${categorias}:`, err);
    }
  } else {
    // Si no existe compactado, quizás queramos fallar silenciosamente o loguear warning solo una vez.
    // console.warn(`Compactado no encontrado: ${rutaCompleta}`);
  }
  return [...new Set(codigos)];
}

/**
 * Obtiene códigos de Captores clasificados (Cálcicos vs No Cálcicos)
 * @param {string} nombreCentro 
 * @param {string} tipo Filtro: 'CALCICOS', 'NO_CALCICOS', 'TODOS'
 */
function obtenerCodigosCaptoresClasificados(nombreCentro, tipo = 'TODOS') {
  if (tipo === 'CALCICOS') {
    return obtenerCodigosDeCompactado(nombreCentro, 'CAPTORES_CALCICOS');
  } else if (tipo === 'NO_CALCICOS') {
    return obtenerCodigosDeCompactado(nombreCentro, 'CAPTORES_NO_CALCICOS'); 
  } else {
    // TODOS
    return obtenerCodigosDeCompactado(nombreCentro, ['CAPTORES_CALCICOS', 'CAPTORES_NO_CALCICOS']);
  }
}

/**
 * Lógica corregida para leer la estructura real de los JSONs (Objetos, no Arrays)
 * Mantenemos la original por compatibilidad, pero internamente ahora llama a la clasificada con 'TODOS'
 */
function obtenerCodigosCaptoresPorCentro(nombreCentro) {
  return obtenerCodigosCaptoresClasificados(nombreCentro, 'TODOS');
}

/**
 * Lógica para obtener códigos de Vitamina D y Calcimiméticos (USANDO COMPACTADOS)
 */
function obtenerCodigosVitDCalcimimPorCentro(nombreCentro) {
  return obtenerCodigosDeCompactado(nombreCentro, ['VITAMINA_D', 'CALCIMIMETICOS']);
}

/**
 * Lógica para obtener códigos de SÓLO Vitamina D (USANDO COMPACTADOS)
 */
function obtenerCodigosVitaminaDPorCentro(nombreCentro) {
  return obtenerCodigosDeCompactado(nombreCentro, 'VITAMINA_D');
}

/**
 * Lógica para obtener códigos de SÓLO Calcimiméticos (USANDO COMPACTADOS)
 */
function obtenerCodigosCalcimimeticosPorCentro(nombreCentro) {
  return obtenerCodigosDeCompactado(nombreCentro, 'CALCIMIMETICOS');
}

/**
 * Lógica para obtener códigos de Eritropoyetina (EPO) (USANDO COMPACTADOS)
 */
function obtenerCodigosEpoPorCentro(nombreCentro) {
  return obtenerCodigosDeCompactado(nombreCentro, 'EPO');
}

/**
 * Lógica para obtener códigos de HIERRO (USANDO COMPACTADOS)
 */
function obtenerCodigosHierroPorCentro(nombreCentro) {
  return obtenerCodigosDeCompactado(nombreCentro, 'HIERRO_IV'); // Redirigir HIERRO genérico a HIERRO_IV por seguridad
}

/**
 * Lógica para obtener códigos de HIERRO IV (USANDO COMPACTADOS)
 */
function obtenerCodigosHierroIVPorCentro(nombreCentro) {
  return obtenerCodigosDeCompactado(nombreCentro, 'HIERRO_IV');
}

/**
 * Lógica para obtener códigos de HIERRO ORAL (USANDO COMPACTADOS)
 */
function obtenerCodigosHierroOralPorCentro(nombreCentro) {
  return obtenerCodigosDeCompactado(nombreCentro, 'HIERRO_ORAL');
}



/**
 * Busca el entry en codigosHD.json que corresponde a la BD actual (config.database),
 * comparando por ruta completa o por basename del .gdb
 */
function obtenerEntryCodigosHDPorBase(config) {
  const dbPath = String(config?.database || '').trim().toLowerCase();
  const dbBase = path.basename(dbPath);

  const arr = Array.isArray(codigosHD) ? codigosHD : [];

  return arr.find(e => {
    const eDb = String(e?.database || '').trim().toLowerCase();
    const eBase = path.basename(eDb);
    return eDb === dbPath || eBase === dbBase;
  });
}

/**
 * Devuelve lista única de CODIGO (numéricos en texto, sin comillas) filtrando por DESCRIPCION
 * Ej: ['HD OL'] o ['HD','HD OL','HD EXTENDIDA']
 */
function obtenerCodigosHDPorBaseYDescripciones(config, descripciones) {
  const entry = obtenerEntryCodigosHDPorBase(config);

  const wanted = new Set(
    (Array.isArray(descripciones) ? descripciones : [descripciones])
      .map(d => String(d).trim().toUpperCase())
      .filter(Boolean)
  );

  const lista = (entry?.resultado || [])
    .filter(x => {
      const desc = String(x?.DESCRIPCION || '').trim().toUpperCase();
      return wanted.has(desc) && x?.CODIGO != null;
    })
    .map(x => String(x.CODIGO).trim())
    .filter(Boolean);

  return [...new Set(lista)];
}


function aplicarCodigosCaptoresPorBase(query, config) {
  // Soporte para etiqueta antigua (:CODIGOS_CAPTORES) y nueva (<LISTA_CAPTORES_FOSFORO>)
  if (!query || (!query.includes(':CODIGOS_CAPTORES') && !query.includes('<LISTA_CAPTORES_FOSFORO>'))) return query;

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
  
  const listaSQL = codigosNorm.map(c => `'${c}'`).join(',');
  const replacement = listaSQL || "''";

   if (!listaSQL) {
    console.warn(`⚠️ CAPTORES VACÍO para ${baseData}.`);
  }
  
  let result = query.replace(/:CODIGOS_CAPTORES/g, replacement);
  result = result.replace(/<LISTA_CAPTORES_FOSFORO>/g, replacement);
  return result;
}

function aplicarCodigosCaptoresCalcicosPorBase(query, config) {
  if (!query || !query.includes('<LISTA_CAPTORES_CALCICOS>')) return query;

  let baseData = config.nombre || config.database || '';
  baseData = path.basename(String(baseData));          
  baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); 

  const codigosRaw = obtenerCodigosCaptoresClasificados(baseData, 'CALCICOS');

  const codigosNorm = [...new Set(codigosRaw.map(c => String(c).trim().toUpperCase()).filter(Boolean))];
  const listaSQL = codigosNorm.map(c => `'${c}'`).join(',');

  if (!listaSQL) console.warn(`⚠️ CAPTORES CÁLCICOS VACÍO para ${baseData}.`);

  return query.replace(/<LISTA_CAPTORES_CALCICOS>/g, listaSQL || "''");
}

function aplicarCodigosCaptoresNoCalcicosPorBase(query, config) {
  if (!query || !query.includes('<LISTA_CAPTORES_NO_CALCICOS>')) return query;

  let baseData = config.nombre || config.database || '';
  baseData = path.basename(String(baseData));          
  baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); 

  const codigosRaw = obtenerCodigosCaptoresClasificados(baseData, 'NO_CALCICOS');

  const codigosNorm = [...new Set(codigosRaw.map(c => String(c).trim().toUpperCase()).filter(Boolean))];
  const listaSQL = codigosNorm.map(c => `'${c}'`).join(',');

  if (!listaSQL) console.warn(`⚠️ CAPTORES NO CÁLCICOS VACÍO para ${baseData}.`);

  return query.replace(/<LISTA_CAPTORES_NO_CALCICOS>/g, listaSQL || "''");
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

function aplicarCodigosVitaminaDPorBase(query, config) {
  if (!query || !query.includes(':CODIGOS_VITAMINA_D')) return query;

  let baseData = config.nombre || config.database || '';
  baseData = path.basename(String(baseData));          
  baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); 

  const codigosRaw = obtenerCodigosVitaminaDPorCentro(baseData);

  // NORMALIZACIÓN
  const codigosNorm = [...new Set(
    codigosRaw
      .map(c => String(c).trim().toUpperCase())
      .filter(Boolean)
  )];
  
  const listaSQL = codigosNorm.map(c => `'${c}'`).join(',');
  
  if (!listaSQL) {
    console.warn(`⚠️ VITAMINA D VACÍO para ${baseData}.`);
  }
  
  return query.replace(/:CODIGOS_VITAMINA_D/g, listaSQL || "''");
}

function aplicarCodigosCalcimimeticosPorBase(query, config) {
  if (!query || !query.includes(':CODIGOS_CALCIMIMETICOS')) return query;

  let baseData = config.nombre || config.database || '';
  baseData = path.basename(String(baseData));          
  baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); 

  const codigosRaw = obtenerCodigosCalcimimeticosPorCentro(baseData);

  // NORMALIZACIÓN
  const codigosNorm = [...new Set(
    codigosRaw
      .map(c => String(c).trim().toUpperCase())
      .filter(Boolean)
  )];
  
  const listaSQL = codigosNorm.map(c => `'${c}'`).join(',');
  
  if (!listaSQL) {
    console.warn(`⚠️ CALCIMIMETICOS VACÍO para ${baseData}.`);
  }
  
  return query.replace(/:CODIGOS_CALCIMIMETICOS/g, listaSQL || "''");
}

function aplicarCodigosEpoPorCentro(query, config) {
  if (!query || !query.includes(':CODIGOS_EPO')) return query;

  let baseData = config.nombre || config.database || '';
  baseData = path.basename(String(baseData));          
  baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); 

  const codigosRaw = obtenerCodigosEpoPorCentro(baseData);

  // Normalización
  const codigosNorm = [...new Set(
    codigosRaw
      .map(c => String(c).trim().toUpperCase())
      .filter(Boolean)
  )];
  
  const listaSQL = codigosNorm.map(c => `'${c}'`).join(',');
  
  if (!listaSQL) {
    console.warn(`⚠️ CÓDIGOS EPO VACÍO para ${baseData}.`);
  }
  
  return query.replace(/:CODIGOS_EPO/g, listaSQL || "''");
}


function aplicarCodigosHierroIVPorBase(query, config) {
  if (!query || !query.includes('<LISTA_HIERRO_IV>')) return query;

  let baseData = config.nombre || config.database || '';
  baseData = path.basename(String(baseData));          
  baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); 

  const codigosRaw = obtenerCodigosHierroIVPorCentro(baseData);

  // Normalización
  const codigosNorm = [...new Set(
    codigosRaw
      .map(c => String(c).trim().toUpperCase())
      .filter(Boolean)
  )];
  
  const listaSQL = codigosNorm.map(c => `'${c}'`).join(',');
  
  if (!listaSQL) {
    console.warn(`⚠️ CÓDIGOS HIERRO IV VACÍO para ${baseData}.`);
  }
  
  return query.replace(/<LISTA_HIERRO_IV>/g, listaSQL || "''");
}

function aplicarCodigosHierroOralPorBase(query, config) {
  if (!query || !query.includes('<LISTA_HIERRO_ORAL>')) return query;

  let baseData = config.nombre || config.database || '';
  baseData = path.basename(String(baseData));          
  baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); 

  const codigosRaw = obtenerCodigosHierroOralPorCentro(baseData);

  // Normalización
  const codigosNorm = [...new Set(
    codigosRaw
      .map(c => String(c).trim().toUpperCase())
      .filter(Boolean)
  )];
  
  const listaSQL = codigosNorm.map(c => `'${c}'`).join(',');
  
  if (!listaSQL) {
    console.warn(`⚠️ CÓDIGOS HIERRO ORAL VACÍO para ${baseData}.`);
  }
  
  return query.replace(/<LISTA_HIERRO_ORAL>/g, listaSQL || "''");
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
        .filter(a => a && a.ES_CATETER === 2 && !String(a.TIPOACCESO).toUpperCase().includes('PROTESIS') && a.CODIGO != null)
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

  // Prótesis: ES_CATETER 2 o 3, pero especificando que es prótesis
  // A veces ES_CATETER=3 es prótesis directo, pero filtramos por nombre por seguridad
  const codigos = accesos
      .filter(a => a && a.CODIGO != null && (
          String(a.TIPOACCESO).toUpperCase().includes('PROTESIS') || 
          String(a.TIPOACCESO).toUpperCase().includes('PTFE') ||
          String(a.TIPOACCESO).toUpperCase().includes('GRAFT')
      ))
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
      .filter(a => a && a.ES_CATETER === 1 && a.CODIGO != null)
      .map(a => a.CODIGO);

  return query.replace(/<CODIGOS_CATETER>/gi, codigos.length ? codigos.join(',') : '-99999');
}

function aplicarCodTestPorBase(query, config) {
  let queryModificada = query;
  // Busca patrones <CODTEST_NOMBRE_TEST>
  const regex = /<CODTEST_([A-Z0-9_]+)>/gi;
  let match;
  
  // Extraer nombre limpio de la base
  let baseName = config.nombre || config.database || '';
  baseName = path.basename(String(baseName));          
  baseName = baseName.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); 

  // Como exec es stateful con /g, iteramos
  // Para evitar bucles infinitos si reemplazamos algo que vuelve a matchear (poco probable aquí),
  // recolectamos los matches primero.
  const matches = [];
  while ((match = regex.exec(query)) !== null) {
      matches.push({ full: match[0], key: match[1] });
  }

  for (const m of matches) {
      const testKey = m.key;
      const mapaTest = groupedTests[testKey];
      if (mapaTest && mapaTest[baseName]) {
          // Reemplazar todas las ocurrencias
          queryModificada = queryModificada.split(m.full).join(String(mapaTest[baseName]));
      } else {
         // Si no encuentro mapeo, dejo un valor imposible o NULL según convenga, o el tag original.
         // Dejar el tag suele romper el SQL. Ponemos -99999.
         // queryModificada = queryModificada.split(m.full).join('-99999');
      }
  }
  return queryModificada;
}

function aplicarCodigosCateterTunelizadoPorBase(query, config) {
  const PLACEHOLDER = '<CODIGOS_CATETER_TUNELIZADO>';
  if (!query || !query.includes(PLACEHOLDER)) return query;

  const mapa = getMapaAccesosVasculares();
  const db = String(config?.database || '').trim().toLowerCase();
  const fileKey = path.basename(db);
  const fileNoExtKey = fileKey.replace(/\.gdb$/i, '');
  const accesos = mapa[db] || mapa[fileKey] || mapa[fileNoExtKey] || [];

  const codigos = accesos
    .filter(a => {
      if (!a || a.CODIGO == null || typeof a.TIPOACCESO !== 'string') return false;
      const tipo = a.TIPOACCESO.toUpperCase();
      // CORRECCIÓN: Aceptamos TUNELIZADO o PERMANENTE como válidos
      return tipo.includes('CATETER') && (tipo.includes('TUNELIZADO') || tipo.includes('PERMANENTE'));
    })
    .map(a => a.CODIGO);

  const valorFinal = codigos.length ? codigos.join(',') : '-99999';

  // LOGS DE DEPURACIÓN SOLICITADOS
  console.log(`[PROCESADOR] Placeholder detectado: ${PLACEHOLDER}`);
  console.log(`[PROCESADOR] Centro: ${fileNoExtKey}`);
  console.log(`[PROCESADOR] Códigos encontrados: ${codigos.length > 0 ? codigos.join(', ') : 'NO DEFINIDO (0 encontrados)'}`);
  console.log(`[PROCESADOR] Valor final aplicado: ${valorFinal}`);

  if (codigos.length === 0) {
    console.error(`[ERROR CONFIG] El placeholder ${PLACEHOLDER} no resolvió códigos para centro '${fileNoExtKey}'. Se aplicará centinela ${valorFinal}. Revisar accesos_vasculares.json`);
  }

  return query.replace(/<CODIGOS_CATETER_TUNELIZADO>/gi, valorFinal);
}

/**
 * Reemplaza un placeholder por los códigos obtenidos por DESCRIPCION
 */
function reemplazarPlaceholderCodigosHD(query, placeholderRegex, codigos, etiquetaLog, config) {
  if (!query || !placeholderRegex.test(query)) return query;

  const replacement = codigos.length ? codigos.join(',') : '-99999';

  if (!codigos.length) {
    console.warn(`⚠️ ${etiquetaLog} vacío para ${config?.database || config?.nombre || '??'} -> usando ${replacement}`);
  }

  return query.replace(placeholderRegex, replacement);
}

/** <CODIGOS_HD_CONV> -> DESCRIPCION 'HD' */
function aplicarCodigosHDCONVPorBase(query, config) {
  const codigos = obtenerCodigosHDPorBaseYDescripciones(config, ['HD']);
  return reemplazarPlaceholderCodigosHD(
    query,
    /<CODIGOS_HD_CONV>/gi,
    codigos,
    '<CODIGOS_HD_CONV>',
    config
  );
}

/** <CODIGOS_HD_OL> -> DESCRIPCION 'HD OL' */
function aplicarCodigosHDOLPorBase(query, config) {
  const codigos = obtenerCodigosHDPorBaseYDescripciones(config, ['HD OL']);
  return reemplazarPlaceholderCodigosHD(
    query,
    /<CODIGOS_HD_OL>/gi,
    codigos,
    '<CODIGOS_HD_OL>',
    config
  );
}

/** <CODIGOS_HD_EXT> -> DESCRIPCION 'HD EXTENDIDA' */
function aplicarCodigosHDEXTPorBase(query, config) {
  const codigos = obtenerCodigosHDPorBaseYDescripciones(config, ['HD EXTENDIDA']);
  return reemplazarPlaceholderCodigosHD(
    query,
    /<CODIGOS_HD_EXT>/gi,
    codigos,
    '<CODIGOS_HD_EXT>',
    config
  );
}

/** <CODIGOS_HD_DOM> -> DESCRIPCION 'HD DOM' */
function aplicarCodigosHDDOMPorBase(query, config) {
  const codigos = obtenerCodigosHDPorBaseYDescripciones(config, ['HD DOM']);
  return reemplazarPlaceholderCodigosHD(
    query,
    /<CODIGOS_HD_DOM>/gi,
    codigos,
    '<CODIGOS_HD_DOM>',
    config
  );
}

/** <CODIGOS_HD_UCI> -> DESCRIPCION 'HD UCI' */
function aplicarCodigosHDUCIPorBase(query, config) {
  const codigos = obtenerCodigosHDPorBaseYDescripciones(config, ['HD UCI']);
  return reemplazarPlaceholderCodigosHD(
    query,
    /<CODIGOS_HD_UCI>/gi,
    codigos,
    '<CODIGOS_HD_UCI>',
    config
  );
}

/** <CODIGOS_HD_PERIT> -> DESCRIPCION 'PERIT' */
function aplicarCodigosHDPERITPorBase(query, config) {
  const codigos = obtenerCodigosHDPorBaseYDescripciones(config, ['PERIT']);
  return reemplazarPlaceholderCodigosHD(
    query,
    /<CODIGOS_HD_PERIT>/gi,
    codigos,
    '<CODIGOS_HD_PERIT>',
    config
  );
}

/**
 * <CODIGOS_HD_TOTAL> -> unión de HD + HD OL + HD EXTENDIDA
 * (lo que estabas usando como "total HD crónicos" de modalidades habituales)
 */
function aplicarCodigosHDTOTALPorBase(query, config) {
  const codigos = obtenerCodigosHDPorBaseYDescripciones(config, ['HD', 'HD OL', 'HD EXTENDIDA']);
  return reemplazarPlaceholderCodigosHD(
    query,
    /<CODIGOS_HD_TOTAL>/gi,
    codigos,
    '<CODIGOS_HD_TOTAL>',
    config
  );
}

  

/**
 * Función principal que orquesta todos los reemplazos
 */
function procesarQuery(queryOriginal, config) {
  let query = queryOriginal;
  
  query = aplicarCodigosCaptoresPorBase(query, config); // Generales
  query = aplicarCodigosCaptoresCalcicosPorBase(query, config); // Específicos Cálcicos
  query = aplicarCodigosCaptoresNoCalcicosPorBase(query, config); // Específicos No Cálcicos
  query = aplicarCodigosVitDCalcimimPorBase(query, config); // Vitamina D y Calcimiméticos
  query = aplicarCodigosVitaminaDPorBase(query, config); // SÓLO Vitamina D
  query = aplicarCodigosCalcimimeticosPorBase(query, config); // SÓLO Calcimiméticos
  query = aplicarCodigosEpoPorCentro(query, config); // Códigos de Eritropoyetina (EPO)
  query = aplicarCodigosHierroIVPorBase(query, config); // Códigos de Hierro IV
  query = aplicarCodigosHierroOralPorBase(query, config); // Códigos de Hierro Oral
  query = aplicarCodTestPorBase(query, config);
  query = aplicarCodigosCateterTunelizadoPorBase(query, config); 
  query = aplicarCodigosCateterPorBase(query, config);
  query = aplicarCodigosFavProtesisPorBase(query, config);
  query = aplicarCodigosFavAutologaPorBase(query, config);
  query = aplicarCodigosProtesisPorBase(query, config);
  // Códigos de modalidades HD (TIPOHEMO) por centro
  query = aplicarCodigosHDCONVPorBase(query, config);
  query = aplicarCodigosHDOLPorBase(query, config);
  query = aplicarCodigosHDEXTPorBase(query, config);
  query = aplicarCodigosHDDOMPorBase(query, config);
  query = aplicarCodigosHDUCIPorBase(query, config);
  query = aplicarCodigosHDPERITPorBase(query, config);
  query = aplicarCodigosHDTOTALPorBase(query, config);
 
  
  return query;
}

module.exports = { procesarQuery };
