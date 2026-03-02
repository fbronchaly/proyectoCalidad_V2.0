# GUÍA DE CONFIGURACIÓN — Indicadores de Comorbilidad en MongoDB
> Fecha: 02-03-2026 | Base de datos: `cormo_tests` | Colección: `test_responses`

---

## 1. Estructura real del documento en MongoDB

Todos los documentos de la colección `test_responses` siguen esta estructura:

```json
{
  "_id": ObjectId,
  "metadata": {
    "form_id":          "frail",        // ← ID del test (ver tabla sección 2)
    "NREGGEN":          "4044566",      // ← ID del paciente (String)
    "sexo":             "HOMBRE",       // "HOMBRE" | "MUJER" | null
    "fecha_nacimiento": "19-10-1943",   // Formato DD-MM-YYYY (String)
    "centro":           "LAS ENCINAS", // ← Nombre exacto del centro
    "fecha_insercion":  "16-10-2024"   // Formato DD-MM-YYYY (String) ← clave para filtros de fecha
  },
  "preguntas":     { ... },             // Respuestas del test
  "puntuacion":    3,                   // Number | null  ← ATENCIÓN: puede ser null
  "interpretacion":"FRÁGIL",           // String
  "created_at":    ISODate,
  "updated_at":    ISODate
}
```

---

## 2. ⚠️ Tabla de `form_id` Correctos (CRÍTICO)

> Los `form_id` deben coincidir **exactamente** con los valores almacenados en `metadata.form_id`.
> Cuatro de los cinco indicadores del JSON original tenían IDs incorrectos.

| Indicador | `form_id` usado en JSON original | `form_id` correcto en BD | Estado |
|---|---|---|---|
| FRAIL (Fragilidad) | `frail` | **`frail`** | ✅ Correcto |
| Barthel (Dependencia) | `barthel` | **`indice_barthel`** | ❌ Corregir |
| Charlson (Comorbilidad) | `charlson` | **`charlson_comorbidity_index`** | ❌ Corregir |
| MNA (Nutrición) | `mna` | **`mna_sf`** | ❌ Corregir |
| Lawton (AIVD) | `lawton` | **`lawton_brody`** | ❌ Corregir |

---

## 3. ⚠️ Problema con `puntuacion: null`

Algunos registros tienen `"puntuacion": null` (por ejemplo, pacientes FRAIL con puntuación 0 que se guarda como null, o pacientes clasificados como "NO FRÁGIL").

**Comportamiento de MongoDB con `null` en comparaciones numéricas:**

```
null >= 3   → false  ✓ (no afecta a FRAIL, descarta correctamente)
null <= 75  → false  ✗ (BARTHEL: puede excluir pacientes válidos con puntuación 0)
null <= 11  → false  ✗ (MNA: puede excluir pacientes válidos con puntuación 0)
null < 8    → false  ✗ (LAWTON: puede excluir pacientes con puntuación 0)
```

**Solución:** Añadir `"$ne": null` en los `$match` dentro del `$facet` para Barthel, MNA y Lawton.

---

## 4. Consultas corregidas — JSON completo

### 4.1 FRAIL — Fragilidad (sin cambios, era correcto)
```json
{
  "id_code": "COMORB_FRAIL_PREV_MONGO",
  "categoria": "Comorbilidad - Fragilidad",
  "indicador": "Porcentaje de pacientes prevalentes en periodo con fragilidad (FRAIL >= 3)",
  "unidad": "%",
  "engine": "mongo",
  "collection": "test_responses",
  "aggregation": [
    { "$match": { "metadata.form_id": "frail", "metadata.centro": "{{centro}}" } },
    { "$addFields": { "fechaDate": { "$dateFromString": { "dateString": "$metadata.fecha_insercion", "format": "%d-%m-%Y" } } } },
    { "$match": { "fechaDate": { "$gte": { "$date": "{{fechaInicio}}T00:00:00.000Z" }, "$lte": { "$date": "{{fechaFin}}T23:59:59.999Z" } } } },
    { "$sort": { "metadata.NREGGEN": 1, "fechaDate": -1 } },
    { "$group": { "_id": "$metadata.NREGGEN", "ultimoTest": { "$first": "$$ROOT" } } },
    { "$replaceRoot": { "newRoot": "$ultimoTest" } },
    { "$facet": {
        "total": [{ "$count": "count" }],
        "conFragilidad": [{ "$match": { "puntuacion": { "$gte": 3 } } }, { "$count": "count" }]
    }},
    { "$project": {
        "numero_pacientes": { "$arrayElemAt": ["$total.count", 0] },
        "numerador": { "$arrayElemAt": ["$conFragilidad.count", 0] },
        "resultado": { "$cond": { "if": { "$gt": [{ "$arrayElemAt": ["$total.count", 0] }, 0] }, "then": { "$multiply": [{ "$divide": [{ "$arrayElemAt": ["$conFragilidad.count", 0] }, { "$arrayElemAt": ["$total.count", 0] }] }, 100] }, "else": 0 } }
    }}
  ]
}
```

---

### 4.2 BARTHEL — Dependencia *(corregido)*
> **Cambios:** `form_id` de `"barthel"` → `"indice_barthel"` + `"$ne": null` en el facet

```json
{
  "id_code": "COMORB_BARTHEL_PREV_MONGO",
  "categoria": "Comorbilidad - Dependencia",
  "indicador": "Porcentaje de pacientes prevalentes con dependencia moderada-severa (Barthel <= 75)",
  "unidad": "%",
  "engine": "mongo",
  "collection": "test_responses",
  "aggregation": [
    { "$match": { "metadata.form_id": "indice_barthel", "metadata.centro": "{{centro}}" } },
    { "$addFields": { "fechaDate": { "$dateFromString": { "dateString": "$metadata.fecha_insercion", "format": "%d-%m-%Y" } } } },
    { "$match": { "fechaDate": { "$gte": { "$date": "{{fechaInicio}}T00:00:00.000Z" }, "$lte": { "$date": "{{fechaFin}}T23:59:59.999Z" } } } },
    { "$sort": { "metadata.NREGGEN": 1, "fechaDate": -1 } },
    { "$group": { "_id": "$metadata.NREGGEN", "ultimoTest": { "$first": "$$ROOT" } } },
    { "$replaceRoot": { "newRoot": "$ultimoTest" } },
    { "$facet": {
        "total": [{ "$count": "count" }],
        "conDependencia": [
          { "$match": { "puntuacion": { "$ne": null, "$lte": 75 } } },
          { "$count": "count" }
        ]
    }},
    { "$project": {
        "numero_pacientes": { "$arrayElemAt": ["$total.count", 0] },
        "numerador": { "$arrayElemAt": ["$conDependencia.count", 0] },
        "resultado": { "$cond": { "if": { "$gt": [{ "$arrayElemAt": ["$total.count", 0] }, 0] }, "then": { "$multiply": [{ "$divide": [{ "$arrayElemAt": ["$conDependencia.count", 0] }, { "$arrayElemAt": ["$total.count", 0] }] }, 100] }, "else": 0 } }
    }}
  ]
}
```

---

### 4.3 CHARLSON — Índice de Comorbilidad *(corregido)*
> **Cambio:** `form_id` de `"charlson"` → `"charlson_comorbidity_index"`

```json
{
  "id_code": "COMORB_CHARLSON_MEDIO_MONGO",
  "categoria": "Comorbilidad - Comorbilidad",
  "indicador": "Puntuación media de índice de Charlson",
  "unidad": "Puntos",
  "engine": "mongo",
  "collection": "test_responses",
  "aggregation": [
    { "$match": { "metadata.form_id": "charlson_comorbidity_index", "metadata.centro": "{{centro}}" } },
    { "$addFields": { "fechaDate": { "$dateFromString": { "dateString": "$metadata.fecha_insercion", "format": "%d-%m-%Y" } } } },
    { "$match": { "fechaDate": { "$gte": { "$date": "{{fechaInicio}}T00:00:00.000Z" }, "$lte": { "$date": "{{fechaFin}}T23:59:59.999Z" } } } },
    { "$sort": { "metadata.NREGGEN": 1, "fechaDate": -1 } },
    { "$group": { "_id": "$metadata.NREGGEN", "ultimoTest": { "$first": "$$ROOT" } } },
    { "$replaceRoot": { "newRoot": "$ultimoTest" } },
    { "$group": { "_id": null, "resultado": { "$avg": "$puntuacion" }, "numero_pacientes": { "$sum": 1 } } },
    { "$project": { "_id": 0, "resultado": { "$round": ["$resultado", 2] }, "numero_pacientes": 1, "numerador": null } }
  ]
}
```

---

### 4.4 MNA-SF — Nutrición *(corregido)*
> **Cambios:** `form_id` de `"mna"` → `"mna_sf"` + `"$ne": null` en el facet

```json
{
  "id_code": "COMORB_MNA_PREV_MONGO",
  "categoria": "Comorbilidad - Nutrición",
  "indicador": "Porcentaje de pacientes con desnutrición/riesgo (MNA <= 11)",
  "unidad": "%",
  "engine": "mongo",
  "collection": "test_responses",
  "aggregation": [
    { "$match": { "metadata.form_id": "mna_sf", "metadata.centro": "{{centro}}" } },
    { "$addFields": { "fechaDate": { "$dateFromString": { "dateString": "$metadata.fecha_insercion", "format": "%d-%m-%Y" } } } },
    { "$match": { "fechaDate": { "$gte": { "$date": "{{fechaInicio}}T00:00:00.000Z" }, "$lte": { "$date": "{{fechaFin}}T23:59:59.999Z" } } } },
    { "$sort": { "metadata.NREGGEN": 1, "fechaDate": -1 } },
    { "$group": { "_id": "$metadata.NREGGEN", "ultimoTest": { "$first": "$$ROOT" } } },
    { "$replaceRoot": { "newRoot": "$ultimoTest" } },
    { "$facet": {
        "total": [{ "$count": "count" }],
        "conDesnutricion": [
          { "$match": { "puntuacion": { "$ne": null, "$lte": 11 } } },
          { "$count": "count" }
        ]
    }},
    { "$project": {
        "numero_pacientes": { "$arrayElemAt": ["$total.count", 0] },
        "numerador": { "$arrayElemAt": ["$conDesnutricion.count", 0] },
        "resultado": { "$cond": { "if": { "$gt": [{ "$arrayElemAt": ["$total.count", 0] }, 0] }, "then": { "$multiply": [{ "$divide": [{ "$arrayElemAt": ["$conDesnutricion.count", 0] }, { "$arrayElemAt": ["$total.count", 0] }] }, 100] }, "else": 0 } }
    }}
  ]
}
```

---

### 4.5 LAWTON — Dependencia AIVD *(corregido)*
> **Cambios:** `form_id` de `"lawton"` → `"lawton_brody"` + `"$ne": null` en el facet

```json
{
  "id_code": "COMORB_LAWTON_PREV_MONGO",
  "categoria": "Comorbilidad - Dependencia AIVD",
  "indicador": "Porcentaje de pacientes con dependencia en AIVD (Lawton < 8)",
  "unidad": "%",
  "engine": "mongo",
  "collection": "test_responses",
  "aggregation": [
    { "$match": { "metadata.form_id": "lawton_brody", "metadata.centro": "{{centro}}" } },
    { "$addFields": { "fechaDate": { "$dateFromString": { "dateString": "$metadata.fecha_insercion", "format": "%d-%m-%Y" } } } },
    { "$match": { "fechaDate": { "$gte": { "$date": "{{fechaInicio}}T00:00:00.000Z" }, "$lte": { "$date": "{{fechaFin}}T23:59:59.999Z" } } } },
    { "$sort": { "metadata.NREGGEN": 1, "fechaDate": -1 } },
    { "$group": { "_id": "$metadata.NREGGEN", "ultimoTest": { "$first": "$$ROOT" } } },
    { "$replaceRoot": { "newRoot": "$ultimoTest" } },
    { "$facet": {
        "total": [{ "$count": "count" }],
        "conDependenciaAIVD": [
          { "$match": { "puntuacion": { "$ne": null, "$lt": 8 } } },
          { "$count": "count" }
        ]
    }},
    { "$project": {
        "numero_pacientes": { "$arrayElemAt": ["$total.count", 0] },
        "numerador": { "$arrayElemAt": ["$conDependenciaAIVD.count", 0] },
        "resultado": { "$cond": { "if": { "$gt": [{ "$arrayElemAt": ["$total.count", 0] }, 0] }, "then": { "$multiply": [{ "$divide": [{ "$arrayElemAt": ["$conDependenciaAIVD.count", 0] }, { "$arrayElemAt": ["$total.count", 0] }] }, 100] }, "else": 0 } }
    }}
  ]
}
```

---

## 5. Rangos de puntuación validados

| Test | `form_id` | Rango real | Umbral del indicador | Nota |
|---|---|---|---|---|
| FRAIL | `frail` | 0–5 | `>= 3` = FRÁGIL | `null` = NO FRÁGIL (0 preguntas SI) |
| Barthel | `indice_barthel` | 0–100 | `<= 75` = dependencia mod-severa | Saltos de 5 y 10 puntos |
| Charlson | `charlson_comorbidity_index` | 0–37 | media (`$avg`) | Incluye factor edad en décadas |
| MNA-SF | `mna_sf` | 0–14 | `<= 11` = riesgo/desnutrición | 12-14 normal, 8-11 riesgo, 0-7 desnutrición |
| Lawton-Brody | `lawton_brody` | 0–8 | `< 8` = alguna dependencia | 8 = independiente total |

---

## 6. Lógica de la pipeline (común a todos los indicadores)

Cada aggregation sigue el mismo patrón de 7 pasos:

```
1. $match form_id + centro        → filtra el tipo de test y el centro
2. $addFields fechaDate           → convierte "DD-MM-YYYY" a Date real de MongoDB
3. $match rango de fechas         → filtra por periodo (fechaInicio / fechaFin)
4. $sort NREGGEN asc + fecha desc → ordena para quedarse con el más reciente
5. $group por NREGGEN ($first)    → 1 documento por paciente (último test)
6. $replaceRoot                   → desenvuelve el subdocumento
7. $facet / $group final          → calcula numerador, denominador y resultado
```

---

## 7. Variables de sustitución `{{placeholder}}`

| Variable | Tipo | Ejemplo | Descripción |
|---|---|---|---|
| `{{centro}}` | String | `"LAS ENCINAS"` | Nombre exacto del centro (case-sensitive) |
| `{{fechaInicio}}` | ISO Date string | `"2024-01-01"` | Inicio del periodo (se completa con `T00:00:00.000Z`) |
| `{{fechaFin}}` | ISO Date string | `"2024-12-31"` | Fin del periodo (se completa con `T23:59:59.999Z`) |

> ⚠️ El campo `metadata.centro` es **case-sensitive**. Usar exactamente los nombres de la sección 8.

---

## 8. Nombres de centros disponibles en la BD

Extraídos de los datos reales de la colección:

```
EL CASTAÑAR        LAS ENCINAS        LOS LAUROS         LOS LLANOS
LOS LLANOS II      LOS LLANOS III     LOS OLMOS          LOS PINOS
SANTA ENGRACIA     SANTA MARIA        FJD / HFJD         HRJC
HUIE               HGV                OS CARBALLOS       OS CARBALLOS II
GETAFE             VILLALBA           TEIXEDAL           SALGUEIROS
```

---

## 9. Índices recomendados en MongoDB

Para optimizar el rendimiento de estas consultas ejecutar en la colección `test_responses`:

```javascript
db.test_responses.createIndexes([
  { key: { "metadata.form_id": 1, "metadata.centro": 1 } },
  { key: { "metadata.form_id": 1, "metadata.NREGGEN": 1, "metadata.fecha_insercion": -1 } },
  { key: { "metadata.centro": 1 } },
  { key: { "metadata.fecha_insercion": -1 } }
]);
```

> El índice compuesto `(form_id, centro)` es el más crítico ya que es el primer `$match` de todas las pipelines.
