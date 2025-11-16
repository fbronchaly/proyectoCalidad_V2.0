const fs = require('fs');
const path = require('path');
const consultarBasesDeDatos = require('../servicios/consultarBasesDeDatos');
const { obtenerMetadatos } = require('../servicios/obtenerMetadatos');

// Ruta al JSON con los códigos de TIPOHEMO por centro
const RUTA_CODIGOS_HD = path.resolve(__dirname, '../../../documentacion/codigosHD.json');

// Mapa en memoria: database (ruta) -> objeto de codigosHD.json
let mapaCodigosHdPorDatabase = null;

// Mapa global entre el valor "lógico" de TIPOHEMO usado en indicesJSON
// y la descripción que aparece en codigosHD.json
// 1 -> HD convencional, 2 -> HDF on line, 3 -> HD expandida
const MAPA_TIPOHEMO_GLOBAL = {
  1: 'HD',             // Hemodiálisis convencional
  2: 'HD OL',          // HDF on-line
  3: 'HD EXTENDIDA',   // HD expandida

  // Reservados para futuros indicadores:
  4: 'HD DOM',         // Hemodiálisis domiciliaria
  5: 'PERIT',          // Diálisis peritoneal
  6: 'HD UCI',         // Hemodiálisis en UCI
};

/**
 * Carga codigosHD.json una sola vez y construye un mapa por ruta de base de datos.
 */
function getMapaCodigosHd() {
  if (mapaCodigosHdPorDatabase !== null) return mapaCodigosHdPorDatabase;

  try {
    let raw = fs.readFileSync(RUTA_CODIGOS_HD, 'utf8');
    raw = raw.replace(/^\uFEFF/, '').trim(); // limpiar BOM y espacios
    const json = JSON.parse(raw);

    mapaCodigosHdPorDatabase = {};
    for (const entry of json) {
      if (entry && entry.database) {
        mapaCodigosHdPorDatabase[entry.database.toLowerCase()] = entry;
      }
    }

    console.log('📚 codigosHD.json cargado. Bases configuradas:', Object.keys(mapaCodigosHdPorDatabase));
  } catch (err) {
    console.error('⛔ No se ha podido cargar codigosHD.json:', err.message);
    mapaCodigosHdPorDatabase = {};
  }

  return mapaCodigosHdPorDatabase;
}

/**
 * Aplica, para una base concreta, la traducción de TIPOHEMO lógico (1,2,3…)
 * a los códigos reales definidos en codigosHD.json.
 *
 * Si la consulta no contiene s.TIPOHEMO = N, devuelve la query sin tocar.
 */
function aplicarTipoHemoPorBase(query, config) {
  if (!query) return query;

  const regex = /s\.TIPOHEMO\s*=\s*(\d+)/gi;
  const coincidencias = [];
  let match;

  while ((match = regex.exec(query)) !== null) {
    const num = parseInt(match[1], 10);
    if (!Number.isNaN(num)) coincidencias.push(num);
  }

  if (!coincidencias.length) {
    // Esta consulta no filtra por TIPOHEMO
    return query;
  }

  const mapa = getMapaCodigosHd();
  const claveDb = (config.database || '').toLowerCase();
  const infoDb = mapa[claveDb];

  if (!infoDb || !Array.isArray(infoDb.resultado)) {
    console.warn(`⚠️ No hay configuración de TIPOHEMO en codigosHD.json para ${config.database}`);
    return query;
  }

  let queryModificada = query;

  // Para cada valor lógico de TIPOHEMO que aparece en la plantilla
  for (const num of [...new Set(coincidencias)]) {
    const descripcionLogica = MAPA_TIPOHEMO_GLOBAL[num];
    if (!descripcionLogica) {
      console.warn(`⚠️ Valor lógico de TIPOHEMO ${num} sin mapeo en MAPA_TIPOHEMO_GLOBAL`);
      continue;
    }

    // Buscar en codigosHD todos los CODIGO cuya DESCRIPCION coincide
    const codigosFisicos = infoDb.resultado
      .filter((r) => (r.DESCRIPCION || '').toUpperCase() === descripcionLogica.toUpperCase())
      .map((r) => r.CODIGO)
      .filter((c) => c !== null && c !== undefined);

    if (!codigosFisicos.length) {
      console.warn(`⚠️ En ${config.database} no hay códigos para descripción "${descripcionLogica}" (TIPOHEMO=${num})`);
      continue;
    }

    let reemplazo;
    if (codigosFisicos.length === 1) {
      reemplazo = `s.TIPOHEMO = ${codigosFisicos[0]}`;
    } else {
      reemplazo = `s.TIPOHEMO IN (${codigosFisicos.join(',')})`;
    }

    const patron = new RegExp(`s\\.TIPOHEMO\\s*=\\s*${num}\\b`, 'gi');
    queryModificada = queryModificada.replace(patron, reemplazo);
  }

  console.log(`🔧 Query final para ${config.database}:`, queryModificada);
  return queryModificada;
}

async function consultaGenerica(intervalo, dataBase, consulta) {
  try {
    // Log de entrada
    console.log('✅ consultaGenerica: datos recibidos ->', { intervalo, dataBase, consulta });

    // Obtener conexión y bases de datos
    const { basesDatos } = await obtenerMetadatos(dataBase);

    console.log('En CG baseDatos');
    console.log(basesDatos);

    // Helpers de fecha: normaliza a YYYY-MM-DD
    const toISO = (dateStr) => {
      if (!dateStr) return null;
      // Acepta DD-MM-YYYY o YYYY-MM-DD
      const m = String(dateStr).match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      return String(dateStr).slice(0, 10);
    };

    const [iniRaw, finRaw] = Array.isArray(intervalo) ? intervalo : [intervalo?.[0], intervalo?.[1]];
    const FECHAINI = toISO(iniRaw);
    const FECHAFIN = toISO(finRaw);
    
    // Partimos de la plantilla que viene de indicesJSON.json
    let queryFinalSinTipoHemo = consulta || '';
    
    // Solo si tenemos fechas, hacemos los reemplazos
    if (FECHAINI) {
      queryFinalSinTipoHemo = queryFinalSinTipoHemo
        // Caso: ':FECHAINI'
        .replace(/':FECHAINI'/gi, `'${FECHAINI}'`)
        // Caso: :FECHAINI
        .replace(/:FECHAINI\b/gi, `'${FECHAINI}'`)
      
    }
    
    if (FECHAFIN) {
      queryFinalSinTipoHemo = queryFinalSinTipoHemo
        // Caso: :FECHAINI
        .replace(/:FECHAINI/gi, `'${FECHAFIN}'`)
        // Caso: :FECHAFIN
        .replace(/:FECHAFIN\b/gi, `'${FECHAFIN}'`)
        // Caso: FECHAFIN “a pelo”
      
    }
    
    console.log("🔍 Query ORIGINAL (plantilla):", consulta);
    console.log("📅 Parámetros de fecha:", { FECHAINI, FECHAFIN });
    console.log("🧾 Query con fechas aplicada:", queryFinalSinTipoHemo);
    

 



    // Ejecutar consultas de forma secuencial y consolidar
    const resultadosTotales = [];

    for (const config of basesDatos) {
      try {
        // Para cada base, adaptar los TIPOHEMO según codigosHD.json
   // En el bucle for (const config of basesDatos)
   const queryFinal = aplicarTipoHemoPorBase(queryFinalSinTipoHemo, config);
   console.log("QUERYFINAL " + queryFinal);
   const result = await consultarBasesDeDatos(config, queryFinal);  
        console.log(`🔍 Resultado de ${config.database}:`, JSON.stringify(result, null, 2));
      
        

        if (result && result.length > 0) {
          // Mapear dinámicamente las columnas - buscar diferentes variantes
          const procesados = result.map((row) => {
            // Limpiar el nombre de la base de datos
            let baseData = config.nombre || (config.database ? (config.database.split('/')?.pop() || config.database) : '');

            // Eliminar prefijo "NF6_" y extensión ".gdb"
            baseData = baseData.replace(/^NF6_/, '').replace(/\.gdb$/, '');

            // Buscar el valor principal (resultado/conteo)
            const resultado = Number(
              row.RESULTADO ?? row.resultado ??
              row.TOTAL_SESIONES ?? row.total_sesiones ??
              row.COUNT ?? row.count ??
              Object.values(row)[0] ?? 0
            );

            // Buscar el número de pacientes
            const numeroDePacientes = Number(
              row.NUMERO_PACIENTES ?? row.numero_pacientes ??
              row.PACIENTES ?? row.pacientes ??
              row.NREGGEN ?? row.nreggen ??
              resultado ?? 0  // Si no hay campo específico, usar el mismo valor
            );

            console.log('📊 Mapeando fila:', {
              originalRow: row,
              resultado,
              numeroDePacientes,
              baseData
            });

            return {
              baseData,
              resultado,
              numeroDePacientes,
            };
          });

          resultadosTotales.push(...procesados);
        } else {
          console.log(`⚠️ No hay resultados para ${config.database}`);

          // Limpiar el nombre para el caso sin resultados también
          let baseData = config.nombre || (config.database ? (config.database.split('/')?.pop() || config.database) : '');
          baseData = baseData.replace(/^NF6_/, '').replace(/\.gdb$/, '');

          resultadosTotales.push({
            baseData,
            resultado: 0,
            numeroDePacientes: 0,
          });
        }
      } catch (err) {
        console.error(`Error en la base de datos: ${config.nombre || config.database}`, err.message);

        // Limpiar el nombre para el caso de error también
        let baseData = config.nombre || (config.database ? (config.database.split('/')?.pop() || config.database) : '');
        baseData = baseData.replace(/^NF6_/, '').replace(/\.gdb$/, '');

        // Registrar una fila de error con conteos en 0 para mantener consistencia
        resultadosTotales.push({
          baseData,
          resultado: 0,
          numeroDePacientes: 0,
          error: err.message
        });
      }
    }

    console.log('✅ Resultados finales consolidados:', JSON.stringify(resultadosTotales, null, 2));
    return resultadosTotales;
  } catch (dbError) {
    console.error(`Error en consultaGenerica: ${dbError.message}`);
    return [];
  }
}

module.exports = consultaGenerica;
