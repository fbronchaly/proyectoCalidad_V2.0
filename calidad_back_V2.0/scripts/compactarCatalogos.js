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
        keywordsDesc: ['NO CALCICO', 'NO CÁLCICO', 'ALUMINICO', 'LANTANO', 'SEVELAME', 'QUELANTES NO CALCICOS'],
        keywordsPres: ['RENAGEL', 'RENVELA', 'FOSRENOL', 'VELPHORO', 'SEVELAMER', 'LANTANO', 'ALMAX', 'PEPSAMAR', 'ALUMINIO']
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
            CAPTORES_NO_CALCICOS: false
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
        
        // Refuerzo: Si es grupo genérico "QUELANTES DEL FOSFORO" sin apellido, intentamos clasificar por nombre comercial si no cayó en ninguno
        if (esGrupoQuelante && !matches.CAPTORES_CALCICOS && !matches.CAPTORES_NO_CALCICOS) {
             // Re-check prescriptivos cálcicos
             if (CRITERIOS.CAPTORES_CALCICOS.keywordsPres.some(k => pres.includes(k))) matches.CAPTORES_CALCICOS = true;
             // Re-check prescriptivos no cálcicos
             if (CRITERIOS.CAPTORES_NO_CALCICOS.keywordsPres.some(k => pres.includes(k))) matches.CAPTORES_NO_CALCICOS = true;
        }
        // --- FIN NUEVA LÓGICA CAPTORES ---

        // Si machea algo, guardamos la fila con sus categorias
        if (matches.EPO || matches.VITAMINA_D || matches.CALCIMIMETICOS || matches.CAPTORES_CALCICOS || matches.CAPTORES_NO_CALCICOS) {
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
        CAPTORES_NO_CALCICOS: []
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
