const consultarBasesDeDatos = require('../servicios/consultarBasesDeDatos');
const { obtenerMetadatos } = require('../servicios/obtenerMetadatos');

async function tratamientos(pacientesActivos) {
    try {
        console.log('Inicio de la función tratamientos.');

        // Validar el formato de pacientesActivos
        if (!pacientesActivos || typeof pacientesActivos !== 'object') {
            console.error('Error: pacientesActivos no es un objeto válido.');
            throw new Error('El parámetro pacientesActivos debe ser un objeto con rutas y datos.');
        }

        console.log('Extrayendo y aplanando los valores de NREGGEN.');
        const pacientes = Object.values(pacientesActivos)
            .flat()
            .map((paciente) => paciente.NREGGEN);

        if (pacientes.length === 0) {
            console.warn('Advertencia: pacientesActivos no contiene datos válidos.');
            return [];
        }

        const placeholders = pacientes.map((val) => `'${val}'`).join(',');
        console.log(`Placeholders generados: ${placeholders.length} caracteres.`);

        console.time('ObtenerMetadatos');
        const  basesDatos  = await obtenerMetadatos();
        console.timeEnd('ObtenerMetadatos');
        console.log(`Se obtuvieron ${basesDatos.length} configuraciones de bases de datos.`);

        const query = `
        SELECT 
            PACIENTES.NREGGEN, 
            PACIENTES.FENAC, 
            PACIENTES.SEXO,
            TRATAMIENT_ACTUAL.FECHAINI,
            TRATAMIENT_ACTUAL.TRATAMIENTO,
            TRATAMIENT_ACTUAL.PAUTA,
            TRATAMIENT_ACTUAL.FECHAFIN
        FROM 
            PACIENTES
        LEFT JOIN 
            TRATAMIENT_ACTUAL 
        ON 
            PACIENTES.NREGGEN = TRATAMIENT_ACTUAL.NREGGEN
        WHERE 
            PACIENTES.NREGGEN IN (${placeholders})
        ORDER BY 
            PACIENTES.NREGGEN;
        `;
        console.log('Consulta SQL preparada.');

        console.time('EjecutarConsultas');
        const resultadosTotales = [];
        for (const config of basesDatos) {
            try {
                console.log(`Iniciando consulta para la base de datos: ${config.nombre}.`);
                const result = await consultarBasesDeDatos(config, query);

                const formatDate = (date) => {
                    return date ? new Date(date).toISOString().slice(0, 10).split('-').reverse().join('-') : null;
                };

                const procesados = result.map((row) => ({
                    NREGGEN: row.NREGGEN,
                    FENAC: formatDate(row.FENAC),
                    SEXO: row.SEXO,
                    FECHAINI: formatDate(row.FECHAINI),
                    FECHAFIN: formatDate(row.FECHAFIN),
                    TRATAMIENTO: row.TRATAMIENTO,
                    PAUTA: row.PAUTA,
                    CENTRO: config.nombre
                }));

                resultadosTotales.push(...procesados);
                console.log(`Consulta completada para la base de datos: ${config.nombre}. Registros obtenidos: ${result.length}`);
            } catch (err) {
                console.error(`Error en la base de datos: ${config.nombre}`, err.message);
            }
        }
        console.timeEnd('EjecutarConsultas');

        console.log('Finalización de la función tratamientos.');
        return resultadosTotales;
    } catch (error) {
        console.error('Error general en la función tratamientos:', error.message);
        return [];
    }
}

module.exports = tratamientos;


/*
{
    NREGGEN: '123456',
    FENAC: '01-01-1980',
    SEXO: 'M',
    FECHAINI: '15-03-2022',
    FECHAFIN: '15-06-2022',
    TRATAMIENTO: 'Antibióticos',
    PAUTA: '1 comprimido cada 8 horas',
    CENTRO: 'NF6_Lauros.gdb'
}


*/