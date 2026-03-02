# 📊 Resumen de Integración MongoDB - Sistema de Calidad

## ✅ Cambios Completados

### 1. **Frontend - Nuevos Centros**
- ✅ Añadido **DB19: Barco de Valdeorras** (Galicia)
- ✅ Añadido **DB20: Santa María** (Galicia)
- ✅ Actualizado `database.service.ts` con los nuevos centros

### 2. **Frontend - Servicio MongoDB**
Archivo creado: `src/app/services/mongodb.service.ts`

**Funcionalidades:**
- `getMongoIndicadores()` - Obtener lista de indicadores MongoDB
- `executeMongoQueries()` - Ejecutar múltiples consultas
- `executeMongoQuery()` - Ejecutar consulta individual
- `getCentrosDisponibles()` - Listar centros con datos
- `checkCentroData()` - Verificar si un centro tiene datos

### 3. **Frontend - Selector de Indicadores Mejorado**
Archivo actualizado: `src/app/components/indicadores-selector/indicadores-selector.component.ts`

**Nuevas características:**
- ✅ Carga automática de indicadores MongoDB
- ✅ Identificación visual de fuente (Firebird ��️ / MongoDB 📊)
- ✅ Integración transparente en el mismo selector
- ✅ Variables: `loadingMongo`, `mongoIndicadoresDisponibles`

### 4. **Backend - Configuración de Centros**
Archivos creados:
- `documentacion/DB19.json` - Configuración Barco de Valdeorras
- `documentacion/DB20.json` - Configuración Santa María
- `documentacion/mapeo_centros.json` - Mapeo Firebird ↔ MongoDB

**Mapeo de Centros:**
```json
{
  "DB3": "LOS LLANOS 1",
  "DB13": "LOS LLANOS 2",
  "DB19": "BARCO DE VALDEORRAS",
  "DB20": "SANTA MARIA"
}
```

### 5. **Backend - Controlador MongoDB**
Archivo creado: `controllers/indicadores/mongoIndicadoresController.js`

**Funciones principales:**
- `cargarMapeoCentros()` - Carga mapeo Firebird ↔ MongoDB
- `dbIdToMongoCentro()` - Convierte DB1 → SANTA ENGRACIA
- `getIndicadoresMongoDB()` - GET /api/indicadores/mongodb
- `executeMongoQueries()` - POST /api/indicadores/mongodb/execute
- `executeMongoQuerySingle()` - POST /api/indicadores/mongodb/execute-single
- `getCentrosDisponibles()` - GET /api/mongodb/centros
- `checkCentroData()` - GET /api/mongodb/centro/:centro/check

### 6. **Backend - Rutas API**
Archivo actualizado: `index.js`

**Nuevas rutas:**
```javascript
GET  /api/indicadores/mongodb
POST /api/indicadores/mongodb/execute
POST /api/indicadores/mongodb/execute-single
GET  /api/mongodb/centros
GET  /api/mongodb/centro/:centro/check
```

### 7. **Backend - Indicadores MongoDB**
Archivo creado: `documentacion/indicadoresMongoDB.json`

**12 Indicadores disponibles:**

#### Fragilidad (FRAIL)
- `MONGO_FRAIL_INC` - % pacientes incidentes con fragilidad
- `MONGO_FRAIL_PREV` - % pacientes prevalentes con fragilidad

#### Sarcopenia (SARC-F)
- `MONGO_SARCF_PREV` - % pacientes con sarcopenia

#### Nutrición (MNA)
- `MONGO_MNA_PREV` - % pacientes con desnutrición/riesgo

#### Dependencia ABVD (Barthel)
- `MONGO_BARTHEL_PREV` - % pacientes con dependencia moderada-severa

#### Dependencia AIVD (Lawton-Brody)
- `MONGO_LAWTON_PREV` - % pacientes con dependencia en AIVD

#### Comorbilidad (Charlson)
- `MONGO_CHARLSON_PREV` - Puntuación media
- `MONGO_CHARLSON_ALTO_PREV` - % con alta comorbilidad (≥5)

#### Riesgo de Caídas (Downton)
- `MONGO_DOWNTON_PREV` - % con riesgo de caídas

#### Salud Mental (PHQ-4)
- `MONGO_PHQ4_PREV` - % con síntomas de ansiedad/depresión

#### Riesgo Social (Gijón)
- `MONGO_GIJON_PREV` - % con riesgo social

#### Cobertura de Screening
- `MONGO_COBERTURA_FRAIL` - % cobertura FRAIL
- `MONGO_COBERTURA_MNA` - % cobertura MNA
- `MONGO_COBERTURA_BARTHEL` - % cobertura Barthel

## 🔧 Características Técnicas

### Pipeline de Agregación MongoDB
Los indicadores usan pipelines de agregación optimizados:
```javascript
{
  "$match": {
    "form_id": "frail",
    "centro": ":CENTRO",
    "_isTest": { "$ne": true },
    "fecha": { "$between": [":FECHAINI", ":FECHAFIN"] }
  }
}
```

### Conversión Automática de Centros
El backend convierte automáticamente:
- Frontend envía: `["DB1", "DB3"]`
- Backend convierte: `"SANTA ENGRACIA"`, `"LOS LLANOS 1"`
- MongoDB consulta: Por nombre de centro

### Formato de Respuesta
```json
{
  "id_code": "MONGO_FRAIL_PREV",
  "categoria": "Comorbilidad MongoDB - Fragilidad",
  "indicador": "Porcentaje de pacientes prevalentes con fragilidad",
  "centro": "SANTA ENGRACIA",
  "resultado": 23.45,
  "numero_pacientes": 120,
  "numerador": 28
}
```

## 🚀 Flujo de Trabajo

### 1. Usuario selecciona indicadores
```
Frontend → Selector de Indicadores
  ├─ Carga indicadores Firebird (indicesJSON.json)
  └─ Carga indicadores MongoDB (API)
      └─ GET /api/indicadores/mongodb
```

### 2. Usuario ejecuta análisis
```
Dashboard → API Upload
  ├─ Indicadores Firebird → Worker tradicional
  └─ Indicadores MongoDB → executeMongoQueries()
      ├─ Convierte DB1 → SANTA ENGRACIA
      ├─ Ejecuta aggregation pipeline
      └─ Retorna resultados
```

### 3. Resultados unificados
```
Dashboard
  ├─ Tabla unificada con ambas fuentes
  ├─ Badge visual (🗄️ Firebird / 📊 MongoDB)
  └─ Exportación Excel/PDF
```

## 📝 Próximos Pasos

### Pendientes de Implementación:
1. ✅ Servicios creados
2. ✅ Controladores backend
3. ✅ Rutas configuradas
4. ⚠️ **PENDIENTE**: Actualizar template HTML del selector
5. ⚠️ **PENDIENTE**: Integrar ejecución en dashboard
6. ⚠️ **PENDIENTE**: Unificar resultados Firebird + MongoDB
7. ⚠️ **PENDIENTE**: Testing completo

### Próxima Fase:
- Actualizar `indicadores-selector.component.html` para mostrar badges
- Modificar `dashboard.component.ts` para detectar y ejecutar indicadores MongoDB
- Crear helper para combinar resultados de ambas fuentes
- Validar formato de fechas (dd-MM-yyyy para MongoDB)

## 🔍 Testing

### Verificar Indicadores MongoDB:
```bash
curl http://localhost:3000/api/indicadores/mongodb
```

### Verificar Centros Disponibles:
```bash
curl http://localhost:3000/api/mongodb/centros
```

### Ejecutar Consulta de Prueba:
```bash
curl -X POST http://localhost:3000/api/indicadores/mongodb/execute \
  -H "Content-Type: application/json" \
  -d '{
    "dbIds": ["DB1"],
    "fechaIni": "01-01-2025",
    "fechaFin": "31-01-2025",
    "indicadores": ["MONGO_FRAIL_PREV"]
  }'
```

## 📚 Documentación Relacionada

- `ARQUITECTURA_HIBRIDA_FIREBIRD_MONGODB.md`
- `INTEGRACION_HIBRIDA_TESTS_COMORBILIDAD.md`
- `indicadoresMongoDB.json`
- `mapeo_centros.json`

---
**Fecha de integración:** 1 de marzo de 2026
**Sistema:** Proyecto Calidad V2.0
**Estado:** Backend completo ✅ | Frontend parcial ⚠️
