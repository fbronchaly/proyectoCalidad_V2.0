const fs = require('fs');
const path = require('path');

const DOCS_DIR = path.resolve(__dirname, '../documentacion');
const OUTPUT_DIR = path.join(DOCS_DIR, 'compactados');

// Criterios de búsqueda (Case Insensitive se aplicará en la lógica)
const CRITERIOS = {
    EPO: {
        keywordsDesc: ['EPO', 'ERITROPOYETINA'],
        keywordsPres: ['EPO', 'ERITROPOYETINA', 'ARANESP', 'MIRCERA', 'BINOCRIT', 'EPREX', 'NESP']
    },
    VITAMINA_D: {
        keywordsDesc: ['CALCITRIOL', 'PARICALCITOL'],
        keywordsPres: ['CALCITRIOL', 'PARICALCITOL', 'ZEMPLAR', 'ROCALTROL', 'ETALPHA']
    },
    CALCIMIMETICOS: {
        keywordsDesc: ['CALCIMIM', 'CINACALCET', 'PARSA'],
        keywordsPres: ['MIMPARA', 'CINACALCET', 'PARSABIV', 'ETELCALCETIDA', 'PARSA']
    },
    CAPTORES_CALCICOS: {
        keywordsDesc: ['CALCICO', 'CÁLCICO', 'APORTES CA', 'QUELANTES DEL FOSFORO CALCICOS', 'QUELANTES CÁLCICOS'],
        keywordsPres: ['CARBONATO CALCICO', 'ACETATO CALCICO', 'CALCIO', 'CAOSINA', 'ROYEN', 'MASTICAL', 'OSVAREN', 'NATECAL', 'CITRATO CALCICO']
    },
    CAPTORES_NO_CALCICOS: {
        keywordsDesc: ['SEVELAMER', 'RENVELA', 'RENAGEL', 'FOSRENOL', 'LANTANO', 'VELPHORO', 'SUCHROFERRICO', 'SUCROFERRICO', 'CITRATO FERRICO', 'BIXALOMER'],
        keywordsPres: ['SEVELAMER', 'RENVELA', 'FOSRENOL']
    },
    HIERRO_IV: {
        keywordsDesc: [
            'HIERRO IV', 'HIERRO I.V.', 'HIERRO PARENTERAL', 'INTRAVENOSO', 
            'VENOFER', 'FERINJECT', 'FERRLECIT', 'MONOVER', 'DIAFER', 'COSMOFER',
            'HIERRO SACAROSA', 'HIERRO CARBOXIMALTOSA', 'HIERRO DEXTRANO', 'ISOMALTOSIDO', 'HIERRO SUCROSA'
        ],
        keywordsPres: ['VENOFER', 'FERINJECT', 'MONOVER', 'DIAFER']
    },
    HIERRO_ORAL: {
        keywordsDesc: [
            'HIERRO ORAL', 'FEROGRADUMET', 'FISIOGEN', 'MALTOFER', 'TARDYFERON', 
            'FERROCUR', 'PODERFER', 'SULFATO FERROSO', 'GLUCONATO FERROSO', 'FERROSO', 'FERRIMANITOL',
            'PROFER', 'KILOR', 'FERPLEX'
        ],
        keywordsPres: ['FEROGRADUMET', 'TARDYFERON', 'FISIOGEN']
    }
};

function procesarCentro(archivo) {
    const rutaCompleta = path.join(DOCS_DIR, archivo);
    let contenido;
    try {
        contenido = fs.readFileSync(rutaCompleta, 'utf8');
        // Limpieza básica por si hay comentarios tipo JSONC o BOM
        contenido = contenido.replace(/^\uFEFF/, ''); 
    } catch (err) {
        console.error(`Error leyendo ${archivo}:`, err);
        return;
    }

    let data;
    try {
        // Intentar parseo tolerante a comentarios si existen (aunque JSON standard no los admite)
        // Eliminamos comentarios de línea //
        const jsonString = contenido.replace(/\/\/.*$/gm, '');
        data = JSON.parse(jsonString);
    } catch(err) {
         console.error(`Error parseando JSON de ${archivo}:`, err);
         return;
    }

    // Normalizar estructura base. A veces viene { "results": [ { "rows": [...] } ] }
    let filas = [];
    if (data.results && Array.isArray(data.results) && data.results[0] && data.results[0].rows) {
        filas = data.results[0].rows;
    } else if (data.rows) {
        filas = data.rows;
    } else if (Array.isArray(data)){
        filas = data;
    } else {
        console.warn(`Estructura desconocida en ${archivo}`);
        return;
    }

    const nombreCentro = path.basename(archivo, '.json');

    // Agrupar por CODGRUPO
    const filasFiltradas = [];

    // Paso 1: Clasificar cada fila independientemente
    filas.forEach(row => {
        const codGrupo = row.CODGRUPO;
        const desc = (row.DESCGRUPO || row.DESCRIPCION || "").toUpperCase();
        const pres = (row.NOM_REGISTRADO || "").toUpperCase();

        if (!codGrupo) return;

        // Reset matches for this row
        const matches = {
            EPO: false,
            VITAMINA_D: false,
            CALCIMIMETICOS: false,
            CAPTORES_CALCICOS: false,
            CAPTORES_NO_CALCICOS: false,
            HIERRO_IV: false,
            HIERRO_ORAL: false
        };

        // Check EPO
        if (CRITERIOS.EPO.keywordsDesc.some(k => desc.includes(k)) || 
            CRITERIOS.EPO.keywordsPres.some(k => pres.includes(k))) {
            matches.EPO = true;
        }

        // Check Vitamina D
        if (CRITERIOS.VITAMINA_D.keywordsDesc.some(k => desc.includes(k)) || 
            CRITERIOS.VITAMINA_D.keywordsPres.some(k => pres.includes(k))) {
            matches.VITAMINA_D = true;
        }

        // Check Calcimimeticos
        if (CRITERIOS.CALCIMIMETICOS.keywordsDesc.some(k => desc.includes(k)) || 
            CRITERIOS.CALCIMIMETICOS.keywordsPres.some(k => pres.includes(k))) {
            matches.CALCIMIMETICOS = true;
        }

        // --- INICIO NUEVA LÓGICA CAPTORES ---
        // Clasificación inteligente para evitar falsos positivos
        const esGrupoQuelante = desc.includes('QUELANTE') || desc.includes('FOSFORO') || desc.includes('FSFORO') || desc.includes('CAPTOR');
        
        // 1. Check Captores Cálcicos
        // Condición: Que coincida con keywords cálcicos Y NO sea explícitamente "NO CALCICO"
        if (!desc.includes('NO CALCICO') && !desc.includes('NO CÁLCICO')) {
             if (CRITERIOS.CAPTORES_CALCICOS.keywordsDesc.some(k => desc.includes(k)) || 
                 CRITERIOS.CAPTORES_CALCICOS.keywordsPres.some(k => pres.includes(k))) {
                matches.CAPTORES_CALCICOS = true;
            }
        }

        // 2. Check Captores No Cálcicos
        if (CRITERIOS.CAPTORES_NO_CALCICOS.keywordsDesc.some(k => desc.includes(k)) || 
            CRITERIOS.CAPTORES_NO_CALCICOS.keywordsPres.some(k => pres.includes(k))) {
            matches.CAPTORES_NO_CALCICOS = true;
        }

        // Check HIERRO IV
        // Prioridad: Si dice explícitamente ORAL, no es IV.
        if (!desc.includes('ORAL') && !desc.includes('COMPRIMIDO') && !pres.includes('ORAL')) {
            if (CRITERIOS.HIERRO_IV.keywordsDesc.some(k => desc.includes(k)) || 
                CRITERIOS.HIERRO_IV.keywordsPres.some(k => pres.includes(k))) {
                matches.HIERRO_IV = true;
            }
        }

        // Check HIERRO ORAL
        // Exclusión fuerte de Calcio para evitar "Gluconato Calcico" si se busca "Gluconato" o "Ferroso" mal puesto
        if (!desc.includes('CALCICO') && !desc.includes('CÁLCICO') && !pres.includes('CALCI')) {
            if (CRITERIOS.HIERRO_ORAL.keywordsDesc.some(k => desc.includes(k)) || 
                CRITERIOS.HIERRO_ORAL.keywordsPres.some(k => pres.includes(k))) {
                // Si ya detectamos que es IV, no es Oral (asumiendo exclusividad para simplificar, aunque un paciente podria tener ambos, aqui clasificamos el fármaco)
                if (!matches.HIERRO_IV) {
                    matches.HIERRO_ORAL = true;
                }
            }
        }
        
        // Refuerzo: Si es grupo genérico "QUELANTES DEL FOSFORO" sin apellido, intentamos clasificar por nombre comercial si no cayó en ninguno
        if (esGrupoQuelante && !matches.CAPTORES_CALCICOS && !matches.CAPTORES_NO_CALCICOS) {
             // Re-check prescriptivos cálcicos
             if (CRITERIOS.CAPTORES_CALCICOS.keywordsPres.some(k => pres.includes(k))) matches.CAPTORES_CALCICOS = true;
             // Re-check prescriptivos no cálcicos
             if (CRITERIOS.CAPTORES_NO_CALCICOS.keywordsPres.some(k => pres.includes(k))) matches.CAPTORES_NO_CALCICOS = true;
        }
        // --- FIN NUEVA LÓGICA CAPTORES ---

        // --- FILTROS DE EXCLUSIÓN PREVIOS ---
        // Evitar falsos positivos comunes
        if (desc.includes('CALCICO') && desc.includes('GLUCONATO') && !desc.includes('FERROSO')) {
            // Es Gluconato Calcico, NO es hierro
        } else {
             // Logic HIERRO IV
            if (CRITERIOS.HIERRO_IV.keywordsDesc.some(k => desc.includes(k)) || 
                CRITERIOS.HIERRO_IV.keywordsPres.some(k => pres.includes(k))) {
                matches.HIERRO_IV = true;
            }

            // Logic HIERRO ORAL
            // Solo si no es IV, buscamos oral. O permitimos ambos si hay productos raros, pero mejor priorizar.
            if (!matches.HIERRO_IV) {
                if (CRITERIOS.HIERRO_ORAL.keywordsDesc.some(k => desc.includes(k)) || 
                    CRITERIOS.HIERRO_ORAL.keywordsPres.some(k => pres.includes(k))) {
                    matches.HIERRO_ORAL = true;
                }
            }
        }

        // Si machea algo, guardamos la fila con sus categorias
        if (matches.EPO || matches.VITAMINA_D || matches.CALCIMIMETICOS || matches.CAPTORES_CALCICOS || matches.CAPTORES_NO_CALCICOS || matches.HIERRO_IV || matches.HIERRO_ORAL) {
            filasFiltradas.push({
                row: row,
                categories: matches
            });
        }
    });

    const resultado = {
        CENTRO: nombreCentro,
        EPO: [],
        VITAMINA_D: [],
        CALCIMIMETICOS: [],
        CAPTORES_CALCICOS: [],
        CAPTORES_NO_CALCICOS: [],
        HIERRO_IV: [],
        HIERRO_ORAL: []
    };

    // Helper para agrupar
    const processCategory = (categoryName) => {
        const map = new Map();
        
        filasFiltradas.forEach(item => {
            if (item.categories[categoryName]) {
                const cg = item.row.CODGRUPO;
                if (!map.has(cg)) {
                    map.set(cg, {
                        CODGRUPO: cg,
                        DESCRIPCION: item.row.DESCGRUPO || item.row.DESCRIPCION || "",
                        PRESENTACIONES: new Set(),
                        CODIGOS_PRES: new Set()
                    });
                }
                if (item.row.NOM_REGISTRADO) {
                    map.get(cg).PRESENTACIONES.add(item.row.NOM_REGISTRADO);
                }
                if (item.row.CODPRES) {
                    map.get(cg).CODIGOS_PRES.add(item.row.CODPRES);
                }
            }
        });

        // Convertir mapa a array
        const sortedGroups = Array.from(map.values()).map(g => ({
            CODGRUPO: g.CODGRUPO,
            DESCRIPCION: g.DESCRIPCION,
            PRESENTACIONES: Array.from(g.PRESENTACIONES).sort(),
            CODIGOS: Array.from(g.CODIGOS_PRES).sort()
        })).sort((a,b) => a.CODGRUPO - b.CODGRUPO);

        resultado[categoryName] = sortedGroups;
    };

    processCategory('EPO');
    processCategory('VITAMINA_D');
    processCategory('CALCIMIMETICOS');
    processCategory('CAPTORES_CALCICOS');
    processCategory('CAPTORES_NO_CALCICOS');
    processCategory('HIERRO_IV');
    processCategory('HIERRO_ORAL');

    // Escribir archivo resultado
    const outPath = path.join(OUTPUT_DIR, `${nombreCentro}_compacted.json`);
    fs.writeFileSync(outPath, JSON.stringify(resultado, null, 2), 'utf8');
    console.log(`Generado: ${outPath}`);
}

// Ejecución principal
if (!fs.existsSync(OUTPUT_DIR)){
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

fs.readdirSync(DOCS_DIR).forEach(archivo => {
    if (archivo.match(/^DB\d+\.json$/i)) { // Solo DB1.json, DB10.json, etc.
        procesarCentro(archivo);
    }
});
