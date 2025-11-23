const consultarBasesDeDatos = require('../servicios/consultarBasesDeDatos');
const { obtenerMetadatos } = require('../servicios/obtenerMetadatos');
const calcularResultados = require('./calcularResultados');
const groupedTests = require('./transformed_grouped_tests.json'); // Cargar JSON actualizado

async function comorbilidad(pacientesActivos, code, fechaInicio, fechaFin) {
  // Validar los parámetros de entrada
  if (!fechaInicio || !fechaFin) {
    console.error('Debe proporcionarse un intervalo de fechas válido.');
    throw new Error('Faltan fechaInicio o fechaFin.');
  }

  try {
    if (!pacientesActivos || typeof pacientesActivos !== 'object') {
      console.error('Error: pacientesActivos no es un objeto válido.');
      throw new Error('El parámetro pacientesActivos debe ser un objeto con rutas y datos.');
    }
    if (!code || typeof code !== 'string') {
      console.error('Error: el parámetro code no es un string válido.');
      throw new Error('El parámetro code debe ser un string válido.');
    }

    let testDescription, fechaK, suma, idTest;
    switch (code) {
      case "CHARLSON":
        testDescription = "CHARLSON";
        fechaK = 'FECHA_CHARS';
        suma = 'SUMA_CHARS';
        idTest = 1;
        break;
      case "DOWNTON":
        testDescription = "DOWNTON";
        fechaK = 'FECHA_DOWNT';
        suma = 'SUMA_DOWNT';
        idTest = 104;
        break;
      case "SARCF":
        testDescription = "SARCF";
        fechaK = 'FECHA_SARCF';
        suma = 'SUMA_SARCF';
        idTest = 120;
        break;
      case "FRAIL":
        testDescription = "FRAIL";
        fechaK = 'FECHA_FRAIL';
        suma = 'SUMA_FRAIL';
        idTest = 116;
        break;
      case "MNA":
        testDescription = "MNA";
        fechaK = 'FECHA_MNA';
        suma = 'SUMA_MNA';
        idTest = 121;
        break;
      case "PHQ4":
        testDescription = "PHQ4";
        fechaK = 'FECHA_PHQ4';
        suma = 'SUMA_PHQ4';
        idTest = 150;
        break;
      case "LAWTON":
        testDescription = "LAWTON";
        fechaK = 'FECHA_LAWT';
        suma = 'SUMA_LAWT';
        idTest = 137;
        break;
      case "BARTHEL":
        testDescription = "BARTHEL";
        fechaK = 'FECHA_BARTHEL';
        suma = 'SUMA_BARTHEL';
        idTest = 4;
        break;
      case "GIJON":
        testDescription = "GIJON";
        fechaK = 'FECHA_GIJON';
        suma = 'SUMA_GIJON';
        idTest = 149;
        break;
      default:
        console.error('Código no reconocido.');
        throw new Error('Código no reconocido.');
    }

    const pacientes = Object.values(pacientesActivos)
      .flat()
      .map(paciente => paciente.NREGGEN);

    if (pacientes.length === 0) {
      console.warn('Advertencia: pacientesActivos no contiene datos válidos.');
      return [];
    }

    const placeholders = pacientes.map(val => `'${val}'`).join(',');
    const  {basesDatos}  = await obtenerMetadatos();

    console.log('EN COMORBILIDAD ' + code);

    const resultadosTotales = [];
    for (const config of basesDatos) {
      const baseName = config.database;
      let dbCodTest = null;


      // Obtener el CODTEST desde transformed_grouped_tests.json
      if (groupedTests[testDescription] && groupedTests[testDescription][baseName]) {
        dbCodTest = groupedTests[testDescription][baseName]; // Extrae el código numérico
        console.log('pp');
        console.log(dbCodTest);
      }

      if (!dbCodTest) {
        console.warn(`No se encontró un código de test para ${testDescription} en la base ${baseName}`);
        continue;
      }
 
      console.log(`Para la base ${baseName} se utilizará CODTEST ${dbCodTest} (test: ${testDescription}).`);
      console.log(`La fechas a buscar son  ${fechaInicio} y  ${fechaFin}`)

      const query = `
        SELECT 
          t.NREGGEN, 
          t.FECHA, 
          t.PUNTOS_TOT, 
          t.CODTEST, 
          r.CODRESPUESTA, 
          r.PUNTOS, 
          resp.ORDEN
        FROM TEST_PAC t
        JOIN (
          SELECT NREGGEN, MAX(FECHA) AS FECHA_MAXIMA
          FROM TEST_PAC
          WHERE CODTEST = ${dbCodTest}
            AND NREGGEN IN (${placeholders})
            AND FECHA BETWEEN '${fechaInicio}' AND '${fechaFin}'
          GROUP BY NREGGEN
        ) max_fechas 
          ON t.NREGGEN = max_fechas.NREGGEN
          AND t.FECHA = max_fechas.FECHA_MAXIMA
        LEFT JOIN RESPUESTA_PAC r ON r.IDTEST = t.IDTEST
        LEFT JOIN RESPUESTA resp ON resp.CODRESPUESTA = r.CODRESPUESTA
        WHERE t.CODTEST = ${dbCodTest}
          AND t.NREGGEN IN (${placeholders})
        ORDER BY t.NREGGEN, t.FECHA;
      `;

      try {
        const result = await consultarBasesDeDatos(config, query);
        const formattedData = {};
        const formatDate = date =>
          date ? new Date(date).toISOString().slice(0, 10).split('-').reverse().join('-') : null;



      

          console.log('LOCALIZADOS QUE CUMPLEN');
          console.log(testDescription);
          console.log(result.length);
          
          
          


        for (const row of result) {
          try {
            // inicializa la ficha del paciente si no existe
            if (!formattedData[row.NREGGEN]) {
              formattedData[row.NREGGEN] = {
                NREGGEN: row.NREGGEN,
                [fechaK]: formatDate(row.FECHA),
                [suma]: row.PUNTOS_TOT,
                CODTEST: row.CODTEST,
              };
            }
      
           
            
          
            // Si no hay ORDEN o PUNTOS, no intentes generar la clave idTest_orden
            if (row.ORDEN == null || row.PUNTOS == null) {
              continue; // seguimos con la siguiente fila sin romper nada
            }

      
          
          let orden = row.ORDEN.toString();
          if (baseName === '/NFS/restores/NF6_HRJC.gdb' && idTest === 104) {
            orden = (row.ORDEN / 10).toString();
          } else if (
            baseName === '/NFS/restores/NF6_InfantaElena.gdb' &&
            [121, 116, 120].includes(idTest)
          ) {
            orden = (row.ORDEN * 10).toString();
          }

          const codeExcel = `${idTest}_${orden}`;
          formattedData[row.NREGGEN][codeExcel] = row.PUNTOS;

        } catch (e) {
          console.error('Fila con error (se ignora, seguimos):', e.message, row);
        }
        };

        resultadosTotales.push(...Object.values(formattedData));


        console.log('RESULTADOS TOTALES');
        console.log(resultadosTotales.length);
        
        

      } catch (err) {
        console.error(`Error en la base de datos: ${baseName}`, err.message);
      }
    }


    const resultadosCalculados = calcularResultados(resultadosTotales);

    return resultadosCalculados;
  } catch (error) {
    console.error('Error general en la función comorbilidad:', error.message);
    return [];
  }
}

module.exports = comorbilidad;
