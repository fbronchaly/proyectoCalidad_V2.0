const consultarBasesDeDatos = require('../servicios/consultarBasesDeDatos');
const { obtenerMetadatos } = require('../servicios/obtenerMetadatos');

async function obtenerTratamientos(pacientesActivos) {
    try {
        // Validar el formato de pacientesActivos
        if (!pacientesActivos || typeof pacientesActivos !== 'object') {
            console.error('Error: pacientesActivos no es un objeto válido.');
            throw new Error('El parámetro pacientesActivos debe ser un objeto con rutas y datos.');
        }

        // Extraer y aplanar los valores de NREGGEN
        const pacientes = Object.values(pacientesActivos)
            .flat()
            .map((paciente) => paciente.NREGGEN);

        // Verificar que el arreglo no esté vacío
        if (pacientes.length === 0) {
            console.warn('Advertencia: pacientesActivos no contiene datos válidos.');
            return [];
        }

        // Crear placeholders para la consulta SQL
        const placeholders = pacientes.map((val) => `'${val}'`).join(',');

        // Obtener conexión y bases de datos
        const  basesDatos  = await obtenerMetadatos();

        // Consulta SQL
        const query = `
        SELECT
            PACIENTES.NREGGEN,
            PACIENTES.FENAC,
            PACIENTES.SEXO,
            TRAT_HEMO.CODPRES,
            TRAT_HEMO.DOSIS,
            TRAT_HEMO.FECHA_INI,
            TRAT_HEMO.D_L,
            TRAT_HEMO.D_M,
            TRAT_HEMO.D_X,
            TRAT_HEMO.D_J,
            TRAT_HEMO.D_V,
            TRAT_HEMO.D_S,
            TRAT_HEMO.D_D,
            TRAT_HEMO.CADA_N_SEMANA,
            TRAT_HEMO.VIA,
            TRAT_HEMO.UNIDADES,
            TRAT_HEMO.NDIAS,
            Z_VIAS_EPO.DESCRIPCION,
            PRESENT.NOM_REGISTRADO
        FROM
            PACIENTES
        LEFT JOIN
            TRAT_HEMO ON PACIENTES.NREGGEN = TRAT_HEMO.NREGGEN
        LEFT JOIN
            Z_VIAS_EPO ON TRAT_HEMO.VIA = Z_VIAS_EPO.CODVIAEPO
        LEFT JOIN
            PRESENT ON TRAT_HEMO.CODPRES = PRESENT.CODPRES
        WHERE
            PACIENTES.NREGGEN IN (${placeholders})
        ORDER BY
            PACIENTES.NREGGEN;
        `;

        // Ejecutar consultas en todas las bases
        const promesas = basesDatos.map((config) =>
            consultarBasesDeDatos(config, query)
                .then((result) => {
                    const formatDate = (date) => {
                        return date ? new Date(date).toISOString().slice(0, 10).split('-').reverse().join('/') : null;
                    };

                    return result.map((tratamiento) => ({
                        NREGGEN: tratamiento.NREGGEN,
                        FENAC: formatDate(tratamiento.FENAC),
                        SEXO: tratamiento.SEXO,
                        CODPRES: tratamiento.CODPRES,
                        DOSIS: tratamiento.DOSIS,
                        FECHAINI: formatDate(tratamiento.FECHA_INI),
                        FECHAFIN: formatDate(tratamiento.FECHAFIN),
                        D_L: tratamiento.D_L,
                        D_M: tratamiento.D_M,
                        D_X: tratamiento.D_X,
                        D_J: tratamiento.D_J,
                        D_V: tratamiento.D_V,
                        D_S: tratamiento.D_S,
                        D_D: tratamiento.D_D,
                        CADA_N_SEMANA: tratamiento.CADA_N_SEMANA,
                        VIA: tratamiento.VIA,
                        UNIDADES: tratamiento.UNIDADES,
                        NDIAS: tratamiento.NDIAS,
                        DESCRIPCION: tratamiento.DESCRIPCION,
                        NOM_REGISTRADO: tratamiento.NOM_REGISTRADO,
                        CENTRO: config.nombre
                    }));
                })
                .catch((err) => {
                    console.error(`Error en la base de datos: ${config.nombre}`, err.message);
                    return [];
                })
        );

        const resultadosTotales = await Promise.all(promesas);

        // Cerrar la conexión SSH
        if (conn && conn.end) {
            conn.end();
            console.log('Conexión SSH cerrada.');
        }

        return resultadosTotales.flat();
    } catch (error) {
        console.error('Error general en la función obtenerTratamientos:', error.message);
        return [];
    }
}

module.exports = obtenerTratamientos;


/*

[
  {
    NREGGEN: '123456',
    FENAC: '01/01/1980',
    SEXO: 'M',
    CODPRES: 'EPO001',
    DOSIS: '50',
    FECHAINI: '01/12/2023',
    FECHAFIN: '31/12/2023',
    D_L: 1,
    D_M: 1,
    D_X: 0,
    D_J: 1,
    D_V: 0,
    D_S: 0,
    D_D: 0,
    CADA_N_SEMANA: 1,
    VIA: 'IV',
    UNIDADES: 2,
    NDIAS: 10,
    DESCRIPCION: 'Intravenosa',
    NOM_REGISTRADO: 'EPOGEN',
    CENTRO: 'Centro Médico 1'
  },
  {
    NREGGEN: '789012',
    FENAC: '15/07/1975',
    SEXO: 'F',
    CODPRES: 'EPO002',
    DOSIS: '100',
    FECHAINI: '05/12/2023',
    FECHAFIN: null,
    D_L: 0,
    D_M: 1,
    D_X: 1,
    D_J: 0,
    D_V: 1,
    D_S: 0,
    D_D: 0,
    CADA_N_SEMANA: 2,
    VIA: 'SUBCUT',
    UNIDADES: 1,
    NDIAS: 7,
    DESCRIPCION: 'Subcutánea',
    NOM_REGISTRADO: 'ARANESP',
    CENTRO: 'Hospital General'
  }
]

*/