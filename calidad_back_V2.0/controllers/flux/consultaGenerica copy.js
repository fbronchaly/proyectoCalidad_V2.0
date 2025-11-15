const consultarBasesDeDatos = require('../servicios/consultarBasesDeDatos');
const { obtenerMetadatos } = require('../servicios/obtenerMetadatos');

async function consultaGenerica(intervalo, dataBase, consulta) {
  try {
    // Log de entrada
    console.log('✅ consultaGenerica: datos recibidos ->', { intervalo, dataBase, consulta });

    // Obtener conexión y bases de datos
    const { basesDatos } = await obtenerMetadatos(dataBase);

   console.log("En CG baseDatos");
   
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

    // Procesar placeholders de la plantilla
    let queryProcesada = consulta;

    // Reemplazar parámetros de fecha - manejar todos los formatos posibles
    const queryFinal = queryProcesada
      .replace(/':FECHAINI'/gi, `'${FECHAINI}'`)      // ':FECHAINI' -> '2025-07-31'
      .replace(/':FECHAFIN'/gi, `'${FECHAFIN}'`)      // ':FECHAFIN' -> '2025-10-02'
      .replace(/:FECHAINI/gi, `'${FECHAINI}'`)        // :FECHAINI -> '2025-07-31'
      .replace(/:FECHAFIN/gi, `'${FECHAFIN}'`)        // :FECHAFIN -> '2025-10-02'
      .replace(/\bFECHAINI\b/gi, `'${FECHAINI}'`)     // FECHAINI -> '2025-07-31'
      .replace(/\bFECHAFIN\b/gi, `'${FECHAFIN}'`);    // FECHAFIN -> '2025-10-02'

    console.log('🔍 Query original:', consulta);
    console.log('🔧 Query procesada:', queryFinal);

    // Ejecutar consultas de forma secuencial y consolidar
    const resultadosTotales = [];

    for (const config of basesDatos) {
      try {
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

            console.log(`📊 Mapeando fila:`, { 
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

    console.log(`✅ Resultados finales consolidados:`, JSON.stringify(resultadosTotales, null, 2));
    return resultadosTotales;
  } catch (dbError) {
    console.error(`Error en consultaGenerica: ${dbError.message}`);
    return [];
  }
}

module.exports = consultaGenerica;
