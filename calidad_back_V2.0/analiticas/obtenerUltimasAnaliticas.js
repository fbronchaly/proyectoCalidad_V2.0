const consultarBasesDeDatos = require('../servicios/consultarBasesDeDatos');
const { obtenerMetadatos } = require('../servicios/obtenerMetadatos');

const parametrosNecesarios =  [
    'PROTETOT', 'TRANSFER', 'UREA', 'IST', 'CaCoA', 'CALCIO', 'HEMOG',
    'HEMAT', 'BICARBON', 'BILIRRUB', 'HIERRO', 'ALBUMINA', 'CLORO', 'GLUCOSA', 'PLAQUETA',
    'FOSFORO', 'FOSFATAS', 'GOT', 'POTASIO', 'GPT', 'CREATINI', 'TRIGLICE', 'AURICO',
    'HCM', 'VCM', 'GAMMAGT', 'MAGNESIO', 'VB12', 'PCR', 'HDL', 'LDH', 'LDL', 'FERRIT',
    'LINFOS', 'BILRTOT', 'BILIDIR', 'NEUTROF', 'LEUCOCIT', 'HEMATIES', 'BASOF',
    'BUN', 'SODIO', 'MONOCIT', 'EOSINOF', 'COLESTER', 'CO2', 'CPK', 'VSG', 'PTH-I', 'TSH', 'HDLCOLES', 'LDLCOLES',
    
    // Agregamos las claves de equivalencias
    'CREA-QUI', 'VIT12', 'B12', 'VIT B12', 'TRIG', 'GGT', 'ALB', 'PLAQ',
    'BASO', 'EOS', 'MONO', 'LINFO', 'SEG', 'SEG_ABS', 'HGB', 'HTO', 'Na',
    'NA', 'K', 'Cl', 'GLU', 'ALP', 'P', 'PTH-i', 'BIC', 'HCO3', 'COL-HDL',
    'COL-LDL', 'CHOL', 'Vit.B 12','A.FOLICO', 'CO2 Tota','BILRTOT','AcFol','25-OH VD','FOLICO', 
    'AFOLICO','VD25','K +','AC FOLIC','vit D',
    'PROT C R','25OHD','Vit D3','VD25','PROT C R','PCR','BIC','LDL','LDL-C','HDL','Ca','25OHD3',
    'ACFOL','VITAD25','A.Folico','Vit.B12', 'Vit. D', 'Folico', 'VITAM.D', 'vitD'
];

const equivalencias = {
    HDLCOLES: 'HDL',       // En Los Olmos, Getafe, etc. se llama "HDLCOLES" => "HDL"
    LDLCOLES: 'LDL',       // Idem para LDL
    'CREA-QUI': 'CREATINI',// Ej. en Getafe
    VIT12: 'VB12',         // Algunos ponen "VIT12" o "VIT B12" => "VB12"
    B12: 'VB12',
    'VIT B12': 'VB12',
     'Vit.B 12':'VB12',
    TRIG: 'TRIGLICE',      // "TRIG" => "TRIGLICE"
    GGT: 'GAMMAGT',        // "GGT" => "GAMMAGT"
    ALB: 'ALBUMINA',       // "ALB" => "ALBUMINA"
    PLAQ: 'PLAQUETA',      // "PLAQ" => "PLAQUETA"
    BASO: 'BASOF',         // "BASO" => "BASOF"
    EOS: 'EOSINOF',
    MONO: 'MONOCIT',
    LINFO: 'LINFOS',
    SEG: 'NEUTROF',        // Algunos usan "SEG" en vez de "NEUTROF"
    SEG_ABS: 'NEUTROF',
    HGB: 'HEMOG',
    HTO: 'HEMAT',
    Na: 'SODIO',
    NA: 'SODIO',
    K: 'POTASIO',
    Cl: 'CLORO',
    GLU: 'GLUCOSA',
    ALP: 'FOSFATAS',
    P: 'FOSFORO',
    'PTH-i': 'PTH-I',
    BIC: 'BICARBON',
    HCO3: 'BICARBON',
    'COL-HDL': 'HDL',
    'COL-LDL': 'LDL',
    CHOL: 'COLESTER',
    'A.FOLICO': 'AFOLICO',
    'A.FÓLICO': 'AFOLICO',
    'CO2 Tota': 'CO2',
    'BILRTOT':'BILIRRUB',
    'AcFol':'AFOLICO',
    '25-OH VD':'VD25',
    'Vit D3':'VD25',
    '25OHD':'VD25',
    'FOLICO':'AFOLICO',
    'AFOLICO':'AFOLICO',
    'AC FOLIC':'AFOLICO',
    'VD25':'VD25',
    'K +': 'POTASIO',
    'vit D':'VD25',
    'PROT C R':'PCR',
    'BIC': 'C02',
    'LDL': 'LDL',
    'LDL-C': 'LDL',
    'HDL': 'HDL',
    'Ca': 'CALCIO',
    '25OHD3': 'VD25',
    'ACFOL': 'AFOLICO',
    'VITAD25': 'VD25',
    'A.Fólico': 'AFOLICO',
    'Vit.B12': 'VB12',
    'Vit. D': 'VD25',
    'Folico': 'AFOLICO',
    'VITAM.D': 'VD25',
    'vitD': 'VD25',
    'BIC INIC': 'CO2'
    
    
    // PCO2: 'CO2',           // En algunos casos, "PCO2" => "CO2"?? LOS OLMOS
};

function formatearFecha(fecha) {
    const date = new Date(fecha);
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0'); // +1 porque los meses comienzan desde 0
    const anio = date.getFullYear();
    return `${dia}-${mes}-${anio}`;
}

function ajustarParametrosSegunEquivalencias(data) {
    return data.map(paciente => {
        const nuevoPaciente = { ...paciente };
        
        for (const [key, value] of Object.entries(equivalencias)) {
            if (nuevoPaciente[key] !== undefined) {
                nuevoPaciente[value] = nuevoPaciente[key];
                delete nuevoPaciente[key];
            }
        }
     
        return nuevoPaciente;
    });
}

async function obtenerAnaliticasAdicionales(pacientesConDatos, config) {
    const fechaActual = new Date();
    const fechaInicio = new Date(fechaActual);
    fechaInicio.setMonth(fechaInicio.getMonth() - 18); // 10 meses hacia atrás

    const placeholders = Object.keys(pacientesConDatos).map((nreggen) => `'${nreggen}'`).join(',');

    const query = `
        SELECT 
            a.NREGGEN, 
            a.NUMANALISIS, 
            a.FECHA, 
            r.CODANAL, 
            r.VALOR
        FROM ANALISIS a
        JOIN RESULANAL r ON a.NUMANALISIS = r.ANALISIS
        WHERE a.NREGGEN IN (${placeholders})
          AND a.FECHA BETWEEN '${fechaInicio.toISOString().split('T')[0]}' AND '${fechaActual.toISOString().split('T')[0]}'
          AND r.CODANAL IN (${parametrosNecesarios.map((p) => `'${p}'`).join(',')})
        ORDER BY a.NREGGEN, a.FECHA DESC;
    `;

    const result = await consultarBasesDeDatos(config, query).catch((err) => {
        console.error(`Error en la base de datos: ${config.database}`, err.message);
        return [];
    });

    result.forEach((row) => {
        const { NREGGEN, FECHA, CODANAL, VALOR } = row;
        const paciente = pacientesConDatos[NREGGEN];

        // Aplicar equivalencias antes de asignar el valor
        const parametroEquivalente = equivalencias[CODANAL] || CODANAL;

        if (paciente && !paciente[parametroEquivalente]) {
            paciente[parametroEquivalente] = VALOR === 0 ? null : VALOR;;
            console.log(`Añadido ${parametroEquivalente} para ${NREGGEN} en ${config.database}`);
        }
    });
}

async function obtenerAnaliticas(pacientesActivos, fechaInicio, fechaFin) {
    try {
        if (!pacientesActivos || typeof pacientesActivos !== 'object') {
            console.error('Error: pacientesActivos no es un objeto válido.');
            throw new Error('El parámetro pacientesActivos debe ser un objeto con rutas y datos.');
        }

        if (!fechaInicio || !fechaFin) {
            throw new Error("Faltan fechaInicio o fechaFin en obtenerAnaliticas.");
        }

        const pacientes = Object.values(pacientesActivos)
            .flat()
            .map((paciente) => paciente.NREGGEN);

        if (pacientes.length === 0) {
            console.warn('Advertencia: pacientesActivos no contiene datos válidos.');
            return [];
        }

        const placeholders = pacientes.map((val) => `'${val}'`).join(',');
        const  {basesDatos} = await obtenerMetadatos();

        const query = `
        SELECT 
            a.NREGGEN, 
            a.NUMANALISIS, 
            a.FECHA, 
            r.CODANAL, 
            r.VALOR
        FROM ANALISIS a
        JOIN RESULANAL r ON a.NUMANALISIS = r.ANALISIS
        WHERE a.NREGGEN IN (${placeholders})
          AND a.FECHA BETWEEN '${fechaInicio}' AND '${fechaFin}'
          AND r.CODANAL IN (${parametrosNecesarios.map((p) => `'${p}'`).join(',')})
          AND a.FECHA = (
              SELECT MIN(a2.FECHA)
              FROM ANALISIS a2
              JOIN RESULANAL r2 ON a2.NUMANALISIS = r2.ANALISIS
              WHERE a2.NREGGEN = a.NREGGEN
                AND a2.FECHA BETWEEN '${fechaInicio}' AND '${fechaFin}'
                AND r2.CODANAL IN (${parametrosNecesarios.map((p) => `'${p}'`).join(',')})
          )
        ORDER BY a.NREGGEN, a.FECHA DESC;
        `;

        // Ejecutar consultas de forma secuencial
        const resultadosTotales = [];
        for (const config of basesDatos) {
            try {
                const result = await consultarBasesDeDatos(config, query);

                const formattedData = {};
                result.forEach((row) => {
                    const { NREGGEN, NUMANALISIS, FECHA, CODANAL, VALOR } = row;

                    // Aplicar equivalencias antes de asignar el valor
                    const parametroEquivalente = equivalencias[CODANAL] || CODANAL;

                    if (!formattedData[NREGGEN]) {
                        formattedData[NREGGEN] = { 
                            NREGGEN, 
                            FECHA_ANAL: formatearFecha(FECHA) // Aplicar formato de fecha
                        };
                    }

                    formattedData[NREGGEN][parametroEquivalente] = VALOR === 0 ? null : VALOR;
                });

                resultadosTotales.push(...Object.values(formattedData));
            } catch (err) {
                console.error(`Error en la base de datos: ${config.nombre}`, err.message);
            }
        }

        // Ajustar los parámetros según las equivalencias
        let resultadosFinales = ajustarParametrosSegunEquivalencias(resultadosTotales);

        // Rellenar parámetros faltantes con analíticas posteriores
        const pacientesConDatos = {};
        resultadosFinales.forEach(paciente => {
            if (!pacientesConDatos[paciente.NREGGEN]) {
                pacientesConDatos[paciente.NREGGEN] = paciente;
            } else {
                for (const param of parametrosNecesarios) {
                    const parametroEquivalente = equivalencias[param] || param;
                    if (!pacientesConDatos[paciente.NREGGEN][parametroEquivalente] && paciente[parametroEquivalente]) {
                        pacientesConDatos[paciente.NREGGEN][parametroEquivalente] = paciente[parametroEquivalente];
                    }
                }
            }
        });

        // Buscar analíticas adicionales para llenar parámetros faltantes
        for (const config of basesDatos) {
            await obtenerAnaliticasAdicionales(pacientesConDatos, config);
        }

        resultadosFinales = Object.values(pacientesConDatos);

        return resultadosFinales;
    } catch (error) {
        console.error('Error al obtener las analíticas:', error.message);
        return [];
    }
}

module.exports = obtenerAnaliticas;