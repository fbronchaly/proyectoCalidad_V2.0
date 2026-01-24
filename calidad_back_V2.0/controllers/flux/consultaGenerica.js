const path = require('path');
const consultarBasesDeDatos = require('../servicios/consultarBasesDeDatos');
const { obtenerMetadatos } = require('../servicios/obtenerMetadatos');
const { procesarQuery } = require('./procesadorQuery');

// FUNCIÓN ELIMINADA: obtenerCodigosCaptoresPorCentro se ha movido a procesadorQuery.js

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
    let plantillaQueryConFechas = consulta || '';

    // NO BORRAR¡¡¡¡ Calculamos FECHAINI (7 días antes para indicador fotografía del dia)
    let FECHAINI_CALCULADA = null;
    if (FECHAFIN) {
      const fecha = new Date(FECHAFIN);
      if (!isNaN(fecha.getTime())) {
        fecha.setDate(fecha.getDate() - 7);
        FECHAINI_CALCULADA = fecha.toISOString().split('T')[0];  // 'YYYY-MM-DD'
      }
    }

    // Solo si tenemos fechas, hacemos los reemplazos
    if (FECHAINI) {
      plantillaQueryConFechas = plantillaQueryConFechas
        .replace(/':FECHAINI'/gi, `'${FECHAINI}'`) // ':FECHAINI'
        .replace(/:FECHAINI\b/gi, `CAST('${FECHAINI}' AS DATE)`); // :FECHAINI
    }

    if (FECHAFIN) {
      plantillaQueryConFechas = plantillaQueryConFechas
        .replace(/':FECHAFIN'/gi, `'${FECHAFIN}'`) // ':FECHAFIN'
        .replace(/:FECHAFIN\b/gi, `CAST('${FECHAFIN}' AS DATE)`); // :FECHAFIN
    }

    if (FECHAINI_CALCULADA) {
      plantillaQueryConFechas = plantillaQueryConFechas
        .replace(/':FECHAINI_CALCULADA'/gi, `'${FECHAINI_CALCULADA}'`)   // ':FECHAINI_CALCULADA'
        .replace(/:FECHAINI_CALCULADA\b/gi, `CAST('${FECHAINI_CALCULADA}' AS DATE)`);  // :FECHAINI_CALCULADA
    }

    console.log("🔍 Query ORIGINAL (plantilla):", consulta);
    console.log("📅 Parámetros de fecha:", { FECHAINI, FECHAFIN });
    console.log("🧾 Query con fechas aplicada:", plantillaQueryConFechas);

    // Ejecutar consultas de forma secuencial y consolidar
    const resultadosTotales = [];

    for (const config of basesDatos) {
      // baseData limpio SIEMPRE (incluso si hay error)
      let baseData = config.nombre || config.database || '';
      baseData = path.basename(String(baseData));          // NF6_LosOlmos.gdb
      baseData = baseData.replace(/^NF6_/i, '').replace(/\.gdb$/i, ''); // LosOlmos
    
      try {
        // Copia local de la query para esta iteración para no contaminar la plantilla original
        let queryIteracion = plantillaQueryConFechas;

        // --- ELIMINADO: INYECCIÓN MANUAL DE CODIGOS_CAPTORES ---
        // La lógica se ha movido internamente a procesarQuery()

        // 1) Construir query por base USANDO procesadorQuery
        // Eliminamos la lógica repetitiva local y usamos el nuevo módulo
        const queryFinal = procesarQuery(queryIteracion, config);

        console.log(`🧾 QUERYFINAL [${baseData}] -> ${queryFinal}`);
    
        // 2) Ejecutar
        const result = await consultarBasesDeDatos(config, queryFinal);
        console.log(`🔍 Resultado RAW de ${config.database}:`, JSON.stringify(result, null, 2));
    
        // 3) Normalizar resultado
        // Esperado: 1 fila con columnas: resultado / numero_pacientes
        // Pero por seguridad si vienen varias filas, sumamos.
        let resultadoTotal = 0;
        let numeroPacientesTotal = 0;
    
        if (Array.isArray(result) && result.length > 0) {
          for (const row of result) {
            // Solo aceptamos aliases "resultado" y "numero_pacientes"
            // (si tus plantillas devuelven otros nombres, corrige la plantilla, no el mapper)
            const resultadoFila = Number(row.RESULTADO ?? row.resultado ?? 0);
            const numeroPacientesFila = Number(row.NUMERO_PACIENTES ?? row.numero_pacientes ?? 0);
    
            // Si tu query devuelve porcentaje en "resultado", NO se debe sumar.
            // En tus plantillas estándar devuelve 1 fila; esto es solo fallback.
            resultadoTotal += resultadoFila;
            numeroPacientesTotal += numeroPacientesFila;
    
            console.log('📊 Mapeando fila:', {
              baseData,
              resultadoFila,
              numeroPacientesFila,
              row
            });
          }
    
          // Si normalmente es 1 fila, nos quedamos con esa (y evitamos “suma de porcentajes”)
          if (result.length === 1) {
            resultadosTotales.push({
              baseData,
              resultado: Number(result[0].RESULTADO ?? result[0].resultado ?? 0),
              numeroDePacientes: Number(result[0].NUMERO_PACIENTES ?? result[0].numero_pacientes ?? 0),
            });
          } else {
            // Fallback (solo para conteos, no porcentajes)
            resultadosTotales.push({
              baseData,
              resultado: resultadoTotal,
              numeroDePacientes: numeroPacientesTotal,
            });
          }
        } else {
          console.log(`⚠️ No hay resultados para ${config.database}`);
    
          resultadosTotales.push({
            baseData,
            resultado: 0,
            numeroDePacientes: 0,
          });
        }
      } catch (err) {
        console.error(`⛔ Error en la base de datos: ${config.nombre || config.database}`, err.message);
    
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
