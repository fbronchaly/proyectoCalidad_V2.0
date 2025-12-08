const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

/**
 * Guarda los resultados del análisis en un archivo Excel en la carpeta de backups.
 * @param {string} fechaInicio 
 * @param {string} fechaFin 
 * @param {Array} resultados - Array de objetos con los resultados procesados
 */
async function guardarResultadosExcel(fechaInicio, fechaFin, resultados) {
    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Resultados Análisis');

        // Definir columnas
        worksheet.columns = [
            { header: 'Fecha Inicio', key: 'fechaInicio', width: 12 },
            { header: 'Fecha Fin', key: 'fechaFin', width: 12 },
            { header: 'Categoría', key: 'categoria', width: 25 },
            { header: 'Código', key: 'codigo', width: 10 },
            { header: 'Indicador', key: 'indicador', width: 50 },
            { header: 'Base de Datos', key: 'baseDatos', width: 20 },
            { header: 'Resultado', key: 'resultado', width: 15 },
            { header: 'Nº Pacientes', key: 'pacientes', width: 15 },
            { header: 'Estado', key: 'estado', width: 10 },
            { header: 'Error', key: 'error', width: 30 }
        ];

        // Estilo para la fila de encabezados
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF4472C4' } // Azul corporativo
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // Procesar datos
        resultados.forEach(ind => {
            // 1. Filas individuales por base de datos
            if (ind.resultados && ind.resultados.length > 0) {
                ind.resultados.forEach(res => {
                    const row = worksheet.addRow({
                        fechaInicio: fechaInicio,
                        fechaFin: fechaFin,
                        categoria: ind.categoria,
                        codigo: ind.id_code,
                        indicador: ind.indicador,
                        baseDatos: res.baseData,
                        resultado: Number(res.resultado || 0),
                        pacientes: Number(res.numeroDePacientes || res.numero_pacientes || 0),
                        estado: res.error ? 'ERROR' : 'OK',
                        error: res.error || ''
                    });

                    // Formato condicional simple
                    if (res.error) {
                        row.getCell('estado').font = { color: { argb: 'FFFF0000' }, bold: true };
                    }
                });
            }

            // 2. Fila de TOTAL (resumen del indicador)
            if (ind.totales) {
                const totalRow = worksheet.addRow({
                    fechaInicio: fechaInicio,
                    fechaFin: fechaFin,
                    categoria: ind.categoria,
                    codigo: ind.id_code,
                    indicador: ind.indicador,
                    baseDatos: 'TOTAL GLOBAL',
                    resultado: Number(ind.totales.resultado || 0),
                    pacientes: Number(ind.totales.numero_pacientes || 0),
                    estado: 'TOTAL',
                    error: ''
                });

                // Estilo destacado para la fila de total
                totalRow.font = { bold: true, color: { argb: 'FF000000' } };
                totalRow.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFF2F2F2' } // Gris claro
                };
                totalRow.getCell('baseDatos').font = { color: { argb: 'FF1976D2' }, bold: true }; // Azul
            }
        });

        // Generar nombre de archivo con timestamp
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `Analisis_${timestamp}.xlsx`;
        
        // Ruta absoluta a la carpeta backups (subiendo dos niveles desde controllers/flux)
        const backupDir = path.resolve(__dirname, '../../backups');

        // Asegurar que el directorio existe
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const filePath = path.join(backupDir, filename);

        // Guardar archivo
        await workbook.xlsx.writeFile(filePath);
        console.log(`✅ Excel de respaldo guardado exitosamente: ${filePath}`);
        
        return { success: true, path: filePath };

    } catch (error) {
        console.error('❌ Error al generar Excel de respaldo:', error);
        return { success: false, error: error.message };
    }
}

module.exports = { guardarResultadosExcel };
