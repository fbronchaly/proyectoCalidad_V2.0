function calcularResultados(data) {
    return data.map((paciente) => {
        const resultados = {};

        const esNumero = (valor) => typeof valor === 'number' && !isNaN(valor);

        if (esNumero(paciente.SUMA_DOWNT)) {
            if (paciente.SUMA_DOWNT === 0) {
                resultados.RESUL_DOWNT = 0;
                resultados.RESUL_DOWNT_TEXT = 'Sin riesgo';
            } else if (paciente.SUMA_DOWNT >= 1 && paciente.SUMA_DOWNT <= 2) {
                resultados.RESUL_DOWNT = 1;
                resultados.RESUL_DOWNT_TEXT = 'Riesgo bajo';
            } else if (paciente.SUMA_DOWNT >= 3 && paciente.SUMA_DOWNT <= 4) {
                resultados.RESUL_DOWNT = 2;
                resultados.RESUL_DOWNT_TEXT = 'Riesgo medio';
            } else if (paciente.SUMA_DOWNT >= 5 && paciente.SUMA_DOWNT <= 9) {
                resultados.RESUL_DOWNT = 3;
                resultados.RESUL_DOWNT_TEXT = 'Riesgo alto';
            }
        }


        if (esNumero(paciente.SUMA_SARCF)) {
            resultados.RESUL_SARCF = paciente.SUMA_SARCF <= 3 ? 0 : 1;
            resultados.RESUL_SARCF_TXT = paciente.SUMA_SARCF <= 3 
                ? 'SALUDABLE'// (0-3 PUNTOS)
                : 'RIESGO SARCOPENIA'// (>4 PUNTOS)';
        }
        

        if (esNumero(paciente.SUMA_FRAIL)) {
            resultados.RESUL_FRAIL = paciente.SUMA_FRAIL === 0 
                ? 1 
                : paciente.SUMA_FRAIL <= 2 
                ? 2 
                : 3;
        
            resultados.RESUL_FRAIL_TEXT = paciente.SUMA_FRAIL === 0
                ? 'NO FRAGIL'
                : paciente.SUMA_FRAIL <= 2
                ? 'PRE FRAGIL' // (1 o 2 PUNTOS)
                : 'FRAGIL';   // (3 o + PUNTOS)
        }
        

        if (esNumero(paciente.SUMA_MNA)) {
            if (paciente.SUMA_MNA <= 7) {
                resultados.RESUL_MNA = 3;
                resultados.RESUL_MNA_TEXT = "Desnutrición";
            } else if (paciente.SUMA_MNA <= 11) {
                resultados.RESUL_MNA = 2;
                resultados.RESUL_MNA_TEXT = "Riesgo de desnutrición";
            } else {
                resultados.RESUL_MNA = 1;
                resultados.RESUL_MNA_TEXT = "Estado nutricional normal";
            }
        }

     // Ajuste en SUMA_ANSIEDAD para evitar que sea 0 por defecto
const tieneDatosAnsiedad = esNumero(paciente["150_10"]) || esNumero(paciente["150_20"]);
if (tieneDatosAnsiedad) {
    const sumaAnsiedad = (esNumero(paciente["150_10"]) ? paciente["150_10"] : 0) +
                         (esNumero(paciente["150_20"]) ? paciente["150_20"] : 0);
    resultados.SUMA_ANSIEDAD = sumaAnsiedad;
    
    // Resultado numérico 0 o 1
    resultados.RESUL_ANSIEDAD = sumaAnsiedad >= 3 ? 1 : 0;
    
    // Texto: "Sí" o "No"
    resultados.RESUL_ANSIEDAD_TXT = sumaAnsiedad >= 3 ? "Sí" : "No";
}


       // Ajuste en SUMA_DEPRE con la misma lógica
const tieneDatosDepre = esNumero(paciente["150_30"]) || esNumero(paciente["150_40"]);
if (tieneDatosDepre) {
    const sumaDepre = (esNumero(paciente["150_30"]) ? paciente["150_30"] : 0) +
                      (esNumero(paciente["150_40"]) ? paciente["150_40"] : 0);
    resultados.SUMA_DEPRE = sumaDepre;

    // Resultado numérico 0 o 1
    resultados.RESUL_DEPRE = sumaDepre >= 3 ? 1 : 0;

    // Texto: "Sí" o "No"
    resultados.RESUL_DEPRE_TXT = sumaDepre >= 3 ? "Sí" : "No";
}


       
        
if (esNumero(paciente.SUMA_LAWT)) {
    if (paciente.SUMA_LAWT <= 1) {
        resultados.RESUL_LAWT = 1;
        resultados.RESUL_LAWT_TEXT = "TOTAL DEPENDENCIA";
    } else if (paciente.SUMA_LAWT <= 3) {
        resultados.RESUL_LAWT = 2;
        resultados.RESUL_LAWT_TEXT = "DEPENDENCIA IMPORTANTE";
    } else if (paciente.SUMA_LAWT <= 5) {
        resultados.RESUL_LAWT = 3;
        resultados.RESUL_LAWT_TEXT = "DEPENDENCIA MODERADA";
    } else if (paciente.SUMA_LAWT <= 7) {
        resultados.RESUL_LAWT = 4;
        resultados.RESUL_LAWT_TEXT = "DEPENDENCIA LIGERA";
    } else {
        resultados.RESUL_LAWT = 5;
        resultados.RESUL_LAWT_TEXT = "INDEPENDIENTE";
    }
}



if (esNumero(paciente.SUMA_BARTHEL)) {
    if (paciente.SUMA_BARTHEL < 5) {
        resultados.RESUL_BARTHEL = 5;
        resultados.RESUL_BARTHEL_TEXT = 'Problema total';
    } else if (paciente.SUMA_BARTHEL <= 50) {
        resultados.RESUL_BARTHEL = 4;
        resultados.RESUL_BARTHEL_TEXT = 'Problema grave';
    } else if (paciente.SUMA_BARTHEL <= 75) {
        resultados.RESUL_BARTHEL = 3;
        resultados.RESUL_BARTHEL_TEXT = 'Problema moderado';
    } else if (paciente.SUMA_BARTHEL <= 95) {
        resultados.RESUL_BARTHEL = 2;
        resultados.RESUL_BARTHEL_TEXT = 'Problema ligero';
    } else {
        resultados.RESUL_BARTHEL = 1;
        resultados.RESUL_BARTHEL_TEXT = 'No hay problema';
    }
}

if (esNumero(paciente.SUMA_GIJON)) {
    if (paciente.SUMA_GIJON === 0) {
        resultados.RESUL_GIJON = 0;
        resultados.RESUL_GIJON_TEXT = 'No valorado';
    } else if (paciente.SUMA_GIJON < 10) {
        resultados.RESUL_GIJON = 1;
        resultados.RESUL_GIJON_TEXT = 'Normal o riesgo social bajo';
    } else if (paciente.SUMA_GIJON <= 16) {
        resultados.RESUL_GIJON = 2;
        resultados.RESUL_GIJON_TEXT = 'Riesgo social intermedio';
    } else {
        resultados.RESUL_GIJON = 3;
        resultados.RESUL_GIJON_TEXT = 'Riesgo social elevado (problema social)';
    }
}



        return { ...paciente, ...resultados };
    });
}

module.exports = calcularResultados;
