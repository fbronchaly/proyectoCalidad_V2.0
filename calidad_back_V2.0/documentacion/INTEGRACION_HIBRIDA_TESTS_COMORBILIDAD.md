# 🔄 Sistema Híbrido de Tests de Comorbilidad: Firebird + MongoDB

## 📊 Descripción General

El sistema ahora soporta **consultas híbridas** para indicadores de comorbilidad, permitiendo que algunos centros consulten desde **Firebird** (bases `.gdb`) y otros desde **MongoDB** (colección `tests_records`).

---

## 🏗️ Arquitectura

```
Cliente solicita indicador de comorbilidad
                ↓
        comienzoFlujo.js
                ↓
        consultaGenerica.js
                ↓
    ¿Tiene placeholder <CODTEST_XXX>?
                ↓
         ┌──────┴──────┐
         SÍ            NO
         ↓              ↓
    Es comorbilidad  Indicador normal
         ↓              (solo Firebird)
    Por cada centro:
         ↓
    ¿Centro tiene datos en MongoDB?
         ↓
    ┌────┴─────┐
    SÍ        NO
    ↓          ↓
MongoDB    Firebird
(nuevo)    (actual)
    ↓          ↓
    └────┬─────┘
         ↓
   Unificar resultados
   (ambos en mismo formato)
         ↓
   agregadorResultados.js
         ↓
    Devolver al cliente
```

---

## 📝 Módulos Creados

### **1. consultaTestsMongo.js**
Módulo especializado en consultas de tests de comorbilidad a MongoDB.

**Funciones principales:**
- `obtenerConexionMongoDB()`: Conexión singleton a MongoDB
- `centroTieneDatosMongo(mongoDb, nombreCentro)`: Detecta si un centro tiene datos en MongoDB
- `consultarTestMongo(mongoDb, tipoTest, centro, fechaInicio, fechaFin, tipoConsulta)`: Ejecuta la consulta MongoDB
- `extraerTipoTestDesdeQuery(query)`: Detecta el tipo de test desde el SQL (ej: `<CODTEST_FRAIL>` → `'FRAIL'`)

**Mapeo de tests:**
```javascript
{
  'CHARLSON': 'charlson',
  'DOWNTON': 'dowton',
  'SARCF': 'sarcf',
  'FRAIL': 'frail',
  'MNA': 'mna_sf',
  'PHQ4': 'phq4',
  'LAWTON': 'lawton_brody',
  'BARTHEL': 'indice_barthel',
  'GIJON': 'gijon'
}
```

---

## 🔍 Tipos de Consulta Soportados

El sistema detecta automáticamente el tipo de consulta desde el SQL y ejecuta el pipeline MongoDB correspondiente:

| Tipo de Consulta | Condición SQL | Pipeline MongoDB |
|------------------|---------------|------------------|
| `prevalentes_fragil` | `PUNTOS_TOT >= 3` | `puntuacion_total >= 3` |
| `prevalentes_sarcopenia` | `PUNTOS_TOT > 3` | `puntuacion_total > 3` |
| `prevalentes_desnutricion` | `PUNTOS_TOT <= 11` | `puntuacion_total <= 11` |
| `prevalentes_dependencia` | `PUNTOS_TOT <= 75` | `puntuacion_total <= 75` |
| `prevalentes_lawton` | `PUNTOS_TOT < 8` | `puntuacion_total < 8` |
| `prevalentes_charlson_alta` | `PUNTOS_TOT >= 5` | `puntuacion_total >= 5` |
| `prevalentes_downton` | `PUNTOS_TOT >= 3` | `puntuacion_total >= 3` |
| `prevalentes_phq4` | `PUNTOS_TOT >= 6` | `puntuacion_total >= 6` |
| `prevalentes_gijon` | `PUNTOS_TOT > 10` | `puntuacion_total > 10` |
| `charlson_media` | `AVG(PUNTOS_TOT)` | `$avg: puntuacion_total` |
| `con_test` | `COUNT(DISTINCT)` | Contar registros existentes |

---

## 🎯 Flujo de Ejecución

### **Ejemplo: Indicador "% Pacientes FRAIL en riesgo"**

```javascript
// 1. Cliente solicita indicador
POST /api/upload {
  fechaInicio: "2025-01-01",
  fechaFin: "2025-01-31",
  indices: ["ID_INDICADOR_FRAIL"]
}

// 2. comienzoFlujo.js carga definición desde indicesJSON.json
{
  "id_code": "FRAIL_PREVALENTES",
  "template": "SELECT ... WHERE CODTEST = <CODTEST_FRAIL> AND PUNTOS_TOT >= 3 ..."
}

// 3. consultaGenerica.js detecta:
// - Placeholder: <CODTEST_FRAIL> → tipoTest = 'FRAIL'
// - Condición SQL: PUNTOS_TOT >= 3 → tipoConsulta = 'prevalentes_fragil'

// 4. Por cada centro (DB1, DB2, ..., DBN):

// Centro DB1 (LosOlmos):
// - centroTieneDatosMongo('LosOlmos') → false
// - Ejecuta: Firebird con SQL tradicional
// - Resultado: { baseData: 'LosOlmos', resultado: 45.5, numeroDePacientes: 120, _origen: 'firebird' }

// Centro DB2 (SantaEngracia):
// - centroTieneDatosMongo('SantaEngracia') → false
// - Ejecuta: Firebird con SQL tradicional
// - Resultado: { baseData: 'SantaEngracia', resultado: 38.2, numeroDePacientes: 95, _origen: 'firebird' }

// Centro CENTRO_MONGO_A:
// - centroTieneDatosMongo('CENTRO_MONGO_A') → true
// - Ejecuta: MongoDB con aggregation pipeline
// - Pipeline: [
//     { $match: { form_id: 'frail', centro: 'CENTRO_MONGO_A', fecha: {...} } },
//     { $sort: { NREGGEN: 1, fecha: -1 } },
//     { $group: { _id: "$NREGGEN", ultimoTest: { $first: "$$ROOT" } } },
//     { $match: { "ultimoTest.puntuacion_total": { $gte: 3 } } }
//   ]
// - Resultado: { baseData: 'CENTRO_MONGO_A', resultado: 52.3, numeroDePacientes: 85, _origen: 'mongodb' }

// 5. Resultados unificados:
[
  { baseData: 'LosOlmos', resultado: 45.5, numeroDePacientes: 120, _origen: 'firebird' },
  { baseData: 'SantaEngracia', resultado: 38.2, numeroDePacientes: 95, _origen: 'firebird' },
  { baseData: 'CENTRO_MONGO_A', resultado: 52.3, numeroDePacientes: 85, _origen: 'mongodb' }
]

// 6. agregadorResultados.js calcula total ponderado
// 7. guardarResultadosLocal.js guarda en MongoDB (colección 'resultados')
// 8. Cliente recibe respuesta unificada
```

---

## ✅ Ventajas del Sistema Híbrido

### **1. Compatibilidad Total**
- ✅ **No rompe nada existente**: Si MongoDB no está configurado, funciona 100% con Firebird
- ✅ **Sin cambios en frontend**: El cliente recibe exactamente el mismo formato
- ✅ **Sin cambios en indicadores**: Los SQL en `indicesJSON.json` siguen igual

### **2. Migración Gradual**
- ✅ Puedes migrar centros de Firebird a MongoDB progresivamente
- ✅ Mientras tanto, el sistema consulta ambas fuentes automáticamente
- ✅ Un centro puede estar en Firebird hoy y MongoDB mañana sin cambios de código

### **3. Transparencia**
- ✅ El campo `_origen` en los resultados indica de dónde vienen los datos
- ✅ Los logs muestran claramente qué fuente se usó por centro
- ✅ Fácil auditoría y debugging

### **4. Rendimiento**
- ✅ MongoDB es más rápido para agregaciones complejas
- ✅ Conexión singleton (no abre/cierra por cada consulta)
- ✅ Consultas en paralelo por centro (ya lo hacía el sistema)

---

## 🔧 Configuración

### **Variables de Entorno (.env)**

```bash
# MongoDB (nuevo)
MONGODB_URI=mongodb://localhost:27017
MONGODB_DBNAME=calidad

# Firebird (actual)
DB_USER=SYSDBA
DB_PASSWORD=masterkey
HOST=localhost
DB1_DATABASE=/NFS/restores/NF6_SantaEngracia.gdb
DB2_DATABASE=/NFS/restores/NF6_LosOlmos.gdb
# ... resto de bases
```

---

## 📊 Estructura de Datos en MongoDB

### **Colección: tests_records**

```javascript
{
  "_id": ObjectId("..."),
  "form_id": "frail",              // Tipo de test
  "NREGGEN": "123456",             // ID paciente
  "centro": "CENTRO_A",            // Nombre del centro
  "fecha": ISODate("2025-01-15"),  // Fecha del test
  "preguntas": {                   // Respuestas individuales
    "pregunta1": 1,
    "pregunta2": 0,
    // ...
  },
  "puntuacion_total": 3,           // Puntuación calculada
  "interpretacion": "FRÁGIL",      // Resultado interpretado
  "createdAt": ISODate("2025-01-15")
}
```

**Índices necesarios:**
```javascript
{ form_id: 1, NREGGEN: 1, fecha: -1 }  // Ya creado en initIndicadoresSchema.js
{ centro: 1, form_id: 1 }               // Ya creado en initIndicadoresSchema.js
```

---

## 🧪 Cómo Probar

### **1. Verificar MongoDB está conectado:**

```bash
# En el backend, al arrancar debería aparecer:
✅ MongoDB conectado para tests de comorbilidad
```

### **2. Insertar datos de prueba en MongoDB:**

```javascript
// Conectar a MongoDB
use calidad

// Insertar test de ejemplo
db.tests_records.insertOne({
  form_id: "frail",
  NREGGEN: "TEST001",
  centro: "CENTRO_PRUEBA",
  fecha: new Date("2025-01-15"),
  preguntas: {
    pregunta1: 1,
    pregunta2: 1,
    pregunta3: 1,
    pregunta4: 0,
    pregunta5: 0
  },
  puntuacion_total: 3,
  interpretacion: "FRÁGIL",
  createdAt: new Date()
})

// Verificar
db.tests_records.find({ centro: "CENTRO_PRUEBA" }).pretty()
```

### **3. Ejecutar indicador de comorbilidad:**

```bash
# Desde el frontend, seleccionar:
# - Fechas: 2025-01-01 a 2025-01-31
# - Centros: Incluir "CENTRO_PRUEBA" (si existe en databases.json)
# - Indicadores: Seleccionar alguno de FRAIL

# Verificar en logs del backend:
🔍 Indicador de comorbilidad detectado: FRAIL - MongoDB disponible
✅ Centro CENTRO_PRUEBA tiene datos en MongoDB - usando MongoDB
🔍 Consultando MongoDB: frail en CENTRO_PRUEBA (2025-01-01 - 2025-01-31)
✅ MongoDB CENTRO_PRUEBA: 1/1 = 100%
```

---

## 📈 Métricas y Monitorización

### **Logs del Sistema**

El sistema genera logs claros para debugging:

```javascript
// Detección de indicador
🔍 Indicador de comorbilidad detectado: FRAIL - MongoDB disponible

// Por cada centro
✅ Centro LosOlmos tiene datos en MongoDB - usando MongoDB
📊 Centro SantaEngracia usando Firebird

// Resultados
✅ MongoDB LosOlmos: 45/120 = 37.5%
✅ Firebird SantaEngracia: 38/95 = 40.0%

// Final
✅ Resultados finales consolidados: [...]
```

---

## 🚀 Próximos Pasos

### **Fase 1: Migración Gradual (Opcional)**
1. Seleccionar 1-2 centros piloto
2. Migrar datos históricos de TEST_PAC a tests_records
3. Verificar que los resultados son consistentes
4. Expandir a más centros progresivamente

### **Fase 2: Optimizaciones (Futuro)**
1. Cache de resultados frecuentes
2. Consultas paralelas Firebird + MongoDB
3. Dashboard de origen de datos por centro

---

## ⚠️ Notas Importantes

1. **El campo `centro` en MongoDB debe coincidir con el nombre limpio de la base**:
   - Firebird: `/NFS/restores/NF6_LosOlmos.gdb` → `"LosOlmos"`
   - MongoDB: `{ centro: "LosOlmos" }`

2. **Los indicadores en `indicesJSON.json` NO necesitan cambios**:
   - Siguen usando placeholders tipo `<CODTEST_FRAIL>`
   - El sistema detecta automáticamente si debe usar MongoDB o Firebird

3. **Compatibilidad total hacia atrás**:
   - Si `MONGODB_URI` no está configurada → Solo Firebird
   - Si un centro no tiene datos en MongoDB → Firebird
   - Si MongoDB falla → Fallback a Firebird (si corresponde)

---

## 📞 Soporte

Para cualquier duda sobre el sistema híbrido:
- Revisar logs en `console.log` del backend
- Verificar que `MONGODB_URI` está configurada
- Comprobar que los índices de MongoDB están creados
- Validar que el campo `centro` en tests_records coincide con nombres de bases

---

**Última actualización:** Febrero 2026  
**Autor:** Sistema de Calidad V2.0  
**Módulos afectados:** `consultaGenerica.js`, `consultaTestsMongo.js` (nuevo)
