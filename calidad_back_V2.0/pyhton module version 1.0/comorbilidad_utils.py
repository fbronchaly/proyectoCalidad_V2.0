"""
Utilidades para procesar datos de comorbilidad desde MongoDB
y generar indicadores para el informe PDF
"""

from typing import Dict, List, Any, Optional
from datetime import datetime
import json
from pathlib import Path


class ComorbilityProcessor:
    """Procesador de datos de comorbilidad para informes"""
    
    def __init__(self, db):
        """
        Args:
            db: Conexión a la base de datos MongoDB
        """
        self.db = db
        self.indicadores_config = self._load_indicadores_config()
    
    def _load_indicadores_config(self) -> Dict[str, Any]:
        """Carga la configuración de indicadores de comorbilidad"""
        config_path = Path(__file__).parent.parent / "documentacion" / "indicadores_comorbilidad.json"
        
        if not config_path.exists():
            return {}
        
        try:
            with open(config_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return {item['id_code']: item for item in data}
        except Exception as e:
            print(f"Error cargando config de comorbilidad: {e}")
            return {}
    
    def obtener_datos_comorbilidad(self, id_transaccion: str) -> List[Dict[str, Any]]:
        """
        Obtiene datos de comorbilidad desde MongoDB para una transacción
        
        Args:
            id_transaccion: ID de la transacción
            
        Returns:
            Lista de indicadores procesados con formato estándar
        """
        try:
            # Buscar en la colección de comorbilidad
            col_comorb = self.db["comorbilidad"]
            docs = list(col_comorb.find(
                {"id_transaccion": id_transaccion},
                {"_id": 0}
            ))
            
            if not docs:
                print(f"No se encontraron datos de comorbilidad para transacción {id_transaccion}")
                return []
            
            return self._procesar_documentos_comorbilidad(docs)
            
        except Exception as e:
            print(f"Error obteniendo datos de comorbilidad: {e}")
            return []
    
    def _procesar_documentos_comorbilidad(self, docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Procesa documentos de comorbilidad y los transforma al formato de indicadores
        
        Args:
            docs: Documentos de MongoDB
            
        Returns:
            Lista de indicadores procesados
        """
        indicadores_procesados = {}
        
        for doc in docs:
            test_type = doc.get("test_type") or doc.get("tipo_test") or ""
            centro = doc.get("centro") or doc.get("base", {}).get("nombre") or "Centro"
            
            # Obtener resultados
            resultados = doc.get("resultados") or {}
            
            # Procesar según tipo de test
            if test_type in ["FRAIL", "SARCF", "MNA", "BARTHEL", "LAWTON", 
                            "CHARLSON", "DOWNTON", "PHQ4", "GIJON"]:
                
                # Generar indicadores para incidentes y prevalentes
                self._procesar_test_individual(
                    test_type, centro, resultados, indicadores_procesados
                )
        
        # Convertir dict a lista
        return list(indicadores_procesados.values())
    
    def _procesar_test_individual(
        self, 
        test_type: str, 
        centro: str, 
        resultados: Dict[str, Any],
        indicadores_procesados: Dict[str, Any]
    ):
        """
        Procesa un test individual y genera indicadores
        
        Args:
            test_type: Tipo de test (FRAIL, BARTHEL, etc.)
            centro: Nombre del centro
            resultados: Resultados del test
            indicadores_procesados: Diccionario donde acumular resultados
        """
        # Configuración de umbrales por test
        config_umbrales = {
            "FRAIL": {"umbral": 3, "operador": ">=", "tipo": "porcentaje"},
            "SARCF": {"umbral": 3, "operador": ">", "tipo": "porcentaje"},
            "MNA": {"umbral": 11, "operador": "<=", "tipo": "porcentaje"},
            "BARTHEL": {"umbral": 75, "operador": "<=", "tipo": "porcentaje"},
            "LAWTON": {"umbral": 8, "operador": "<", "tipo": "porcentaje"},
            "CHARLSON": {"tipo": "media"},
            "DOWNTON": {"umbral": 3, "operador": ">=", "tipo": "porcentaje"},
            "PHQ4": {"umbral": 6, "operador": ">=", "tipo": "porcentaje"},
            "GIJON": {"umbral": 10, "operador": ">", "tipo": "porcentaje"},
        }
        
        config = config_umbrales.get(test_type, {})
        
        # Generar indicadores para incidentes
        self._generar_indicador_comorbilidad(
            f"COMORB_{test_type}_INC",
            test_type,
            centro,
            resultados.get("incidentes", {}),
            config,
            "incidentes",
            indicadores_procesados
        )
        
        # Generar indicadores para prevalentes
        self._generar_indicador_comorbilidad(
            f"COMORB_{test_type}_PREV",
            test_type,
            centro,
            resultados.get("prevalentes", {}),
            config,
            "prevalentes",
            indicadores_procesados
        )
        
        # Indicador especial para Charlson alto (solo prevalentes)
        if test_type == "CHARLSON":
            self._generar_indicador_comorbilidad(
                "COMORB_CHARLSON_ALTO_PREV",
                test_type,
                centro,
                resultados.get("prevalentes", {}),
                {"umbral": 5, "operador": ">=", "tipo": "porcentaje"},
                "prevalentes_alto",
                indicadores_procesados
            )
    
    def _generar_indicador_comorbilidad(
        self,
        id_code: str,
        test_type: str,
        centro: str,
        datos: Dict[str, Any],
        config: Dict[str, Any],
        tipo_poblacion: str,
        indicadores_procesados: Dict[str, Any]
    ):
        """
        Genera un indicador de comorbilidad específico
        
        Args:
            id_code: Código del indicador
            test_type: Tipo de test
            centro: Nombre del centro
            datos: Datos del test
            config: Configuración de umbrales
            tipo_poblacion: Tipo de población (incidentes/prevalentes)
            indicadores_procesados: Diccionario donde acumular
        """
        if not datos:
            return
        
        # Obtener configuración del indicador
        ind_config = self.indicadores_config.get(id_code, {})
        
        # Inicializar indicador si no existe
        if id_code not in indicadores_procesados:
            indicadores_procesados[id_code] = {
                "id_code": id_code,
                "titulo": ind_config.get("titulo", f"{test_type} - {tipo_poblacion}"),
                "categoria": ind_config.get("categoria", f"Comorbilidad - {test_type}"),
                "objetivo": ind_config.get("objetivo", ""),
                "unidad": ind_config.get("unidad", "%"),
                "items": []
            }
        
        # Calcular valor según tipo
        valor = None
        total_pacientes = datos.get("total_pacientes", 0)
        
        if config.get("tipo") == "media":
            # Para Charlson: media de puntuaciones
            suma_total = datos.get("suma_puntuaciones", 0)
            if total_pacientes > 0:
                valor = suma_total / total_pacientes
        else:
            # Para porcentajes: calcular según umbral
            pacientes_positivos = datos.get("pacientes_positivos", 0)
            if total_pacientes > 0:
                valor = (pacientes_positivos / total_pacientes) * 100
        
        # Agregar item al indicador
        if valor is not None:
            indicadores_procesados[id_code]["items"].append({
                "centro": centro,
                "region": None,
                "centro_id": None,
                "valor": valor,
                "valor_num": valor,
                "pacientes": total_pacientes
            })
    
    def calcular_cobertura_screening(
        self, 
        id_transaccion: str,
        test_type: str
    ) -> Dict[str, Any]:
        """
        Calcula la cobertura de screening para un test específico
        
        Args:
            id_transaccion: ID de la transacción
            test_type: Tipo de test (FRAIL, MNA, BARTHEL, etc.)
            
        Returns:
            Indicador de cobertura
        """
        try:
            col_comorb = self.db["comorbilidad"]
            
            # Obtener datos del test
            docs = list(col_comorb.find(
                {
                    "id_transaccion": id_transaccion,
                    "test_type": test_type
                },
                {"_id": 0}
            ))
            
            if not docs:
                return {}
            
            # Calcular cobertura
            id_code = f"COMORB_COBERTURA_{test_type}"
            ind_config = self.indicadores_config.get(id_code, {})
            
            indicador = {
                "id_code": id_code,
                "titulo": ind_config.get("titulo", f"Cobertura screening {test_type}"),
                "categoria": ind_config.get("categoria", "Comorbilidad - Cobertura Screening"),
                "objetivo": ind_config.get("objetivo", ""),
                "unidad": "%",
                "items": []
            }
            
            for doc in docs:
                centro = doc.get("centro", "Centro")
                resultados = doc.get("resultados", {})
                prevalentes = resultados.get("prevalentes", {})
                
                total_pacientes = prevalentes.get("total_pacientes", 0)
                pacientes_con_test = prevalentes.get("pacientes_evaluados", 0)
                
                if total_pacientes > 0:
                    cobertura = (pacientes_con_test / total_pacientes) * 100
                    
                    indicador["items"].append({
                        "centro": centro,
                        "region": None,
                        "centro_id": None,
                        "valor": cobertura,
                        "valor_num": cobertura,
                        "pacientes": total_pacientes
                    })
            
            return indicador
            
        except Exception as e:
            print(f"Error calculando cobertura: {e}")
            return {}


def obtener_indicadores_comorbilidad(db, id_transaccion: str) -> List[Dict[str, Any]]:
    """
    Función principal para obtener todos los indicadores de comorbilidad
    
    Args:
        db: Conexión a MongoDB
        id_transaccion: ID de la transacción
        
    Returns:
        Lista de indicadores de comorbilidad procesados
    """
    processor = ComorbilityProcessor(db)
    
    # Obtener indicadores básicos
    indicadores = processor.obtener_datos_comorbilidad(id_transaccion)
    
    # Agregar indicadores de cobertura
    for test_type in ["FRAIL", "MNA", "BARTHEL"]:
        ind_cobertura = processor.calcular_cobertura_screening(id_transaccion, test_type)
        if ind_cobertura:
            indicadores.append(ind_cobertura)
    
    return indicadores
