/**
 * Módulo de agregación estadística para indicadores de calidad.
 * Resuelve el problema de la "falacia ecológica" al agregar porcentajes entre centros de distinto tamaño.
 */

/**
 * Determina si un indicador es de tipo porcentual basándose en sus metadatos.
 * @param {Object} metadatos - Definición del indicador (unidad, nombre, etc.)
 * @returns {boolean}
 */
function esIndicadorPorcentual(metadatos) {
  if (!metadatos) return false;
  
  // 1. Chequeo explícito por unidad
  if (metadatos.unidad === '%' || metadatos.unidad === 'PCT') return true;

  // 2. Chequeo semántico en el nombre del indicador
  const nombreNormalizado = (metadatos.indicador || '').toLowerCase();
  if (nombreNormalizado.includes('porcentaje') || 
      nombreNormalizado.includes('tasa') || 
      nombreNormalizado.includes('%')) {
    return true;
  }

  return false;
}

/**
 * Calcula el resultado global consolidado a partir de los resultados por centro.
 * 
 * - Para CONTEOS (ej: Nº de infecciones): SUMA DIRECTA.
 * - Para PORCENTAJES (ej: % Hemoglobina > 10): PROMEDIO PONDERADO por N de pacientes.
 * 
 * Fórmula Ponderada:
 * Global = Σ (Resultado_Centro_i × N_Pacientes_Centro_i) / Σ (N_Pacientes_Centro_i)
 * 
 * @param {Array} resultadosPorBase - Array de objetos { resultado, numeroDePacientes, ... }
 * @param {Object} metadatos - Definición del indicador para decidir la estrategia
 * @returns {Object} { resultado, numero_pacientes }
 */
function calcularAgregacionGlobal(resultadosPorBase, metadatos) {
  // Validación defensiva
  if (!Array.isArray(resultadosPorBase) || resultadosPorBase.length === 0) {
    return { resultado: 0, numero_pacientes: 0 };
  }

  const esPorcentaje = esIndicadorPorcentual(metadatos);
  
  let sumaNumeradorPonderado = 0; // Para porcentajes: (valor * peso)
  let sumaResultadoSimple = 0;    // Para conteos: suma directa
  let sumaPacientesC = 0;         // Denominador común (población total)

  for (const item of resultadosPorBase) {
    // Normalizar valores (asegurar que son números)
    // Nota: adaptamos para leer 'numeroDePacientes' o 'numero_pacientes' por robustez
    const valorCentro = Number(item.resultado || 0);
    const nPacientesCentro = Number(item.numeroDePacientes || item.numero_pacientes || 0);

    // Acumulamos población total siempre
    sumaPacientesC += nPacientesCentro;

    if (esPorcentaje) {
      // Estrategia PORCENTAJE: Acumular para media ponderada
      // Si el centro reporta 70% sobre 100 pacientes, aporta 7000 "puntos porcentuales"
      sumaNumeradorPonderado += (valorCentro * nPacientesCentro);
    } else {
      // Estrategia CONTEO: Suma aritmética simple
      // Ejemplo: 5 infecciones en centro A + 3 en centro B = 8 total
      sumaResultadoSimple += valorCentro;
    }
  }

  // Cálculo final
  let resultadoGlobal = 0;

  if (esPorcentaje) {
    // Evitar división por cero
    if (sumaPacientesC > 0) {
      resultadoGlobal = sumaNumeradorPonderado / sumaPacientesC;
    } else {
      resultadoGlobal = 0;
    }
    
    // Redondeo a 2 decimales para consistencia
    resultadoGlobal = Math.round((resultadoGlobal + Number.EPSILON) * 100) / 100;
  } else {
    // Para contadores absolutos
    resultadoGlobal = sumaResultadoSimple;
  }

  return {
    resultado: resultadoGlobal,
    numero_pacientes: sumaPacientesC
  };
}

module.exports = {
  calcularAgregacionGlobal,
  esIndicadorPorcentual
};
