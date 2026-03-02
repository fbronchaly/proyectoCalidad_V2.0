# 🏗️ ARQUITECTURA HÍBRIDA: MOTOR DE INDICADORES FIREBIRD + MONGODB

## 📋 RESUMEN EJECUTIVO

Esta documentación describe la **solución técnica completa** para integrar indicadores de comorbilidad almacenados en **MongoDB** con el sistema existente de indicadores SQL sobre **Firebird**, manteniendo 100% compatibilidad con la arquitectura actual.

---

## 1️⃣ ARQUITECTURA GENERAL

### 🎯 Patrón de Diseño: **Strategy Pattern + Factory Pattern**

```
┌─────────────────────────────────────────────────────────┐
│               FRONTEND (Angular)                         │
│  - Selector unificado de fuentes                        │
│  - UI única para Firebird y MongoDB                     │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP/REST
                     ▼
┌─────────────────────────────────────────────────────────┐
│           API CONTROLLERS (Express)                      │
│  - /api/fuentes          (GET)                          │
│  - /api/indicadores/ejecutar (POST)                     │
│  - /api/indicadores/catalogo/:tipo (GET)                │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│         INDICADOR SERVICE (Lógica de Negocio)           │
│  - Orquestación de ejecución                            │
│  - Validación de compatibilidad                         │
│  - Gestión de catálogos                                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│       INDICADOR ENGINE FACTORY (Patrón Factory)         │
│  - Detecta tipo de fuente (DB1 → Firebird)             │
│  - Detecta tipo de fuente (MONGO_XXX → MongoDB)        │
│  - Instancia el engine apropiado                        │
└────────────────────┬────────────────────────────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│ FirebirdEngine   │    │  MongoEngine     │
│ (Extiende Base)  │    │ (Extiende Base)  │
├──────────────────┤    ├──────────────────┤
│ - ejecutarSQL()  │    │ - ejecutarAgg()  │
│ - reemplazar:    │    │ - reemplazar{{}} │
│   :FECHAINI      │    │   placeholders   │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐    ┌──────────────────┐
│  Firebird DBs    │    │    MongoDB       │
│  DB1, DB2, ...   │    │  Collections:    │
│                  │    │  - frail         │
│                  │    │  - barthel       │
│                  │    │  - charlson      │
└──────────────────┘    └──────────────────┘
```

---

## 2️⃣ COMPONENTES PRINCIPALES

### 📂 Estructura de Archivos Creada

```
calidad_back_V2.0/
├── controllers/
│   ├── indicadores/
│   │   ├── engines/
│   │   │   ├── BaseEngine.js                 ✅ Clase abstracta
│   │   │   ├── FirebirdEngine.js             ✅ Ejecutor SQL
│   │   │   ├── MongoEngine.js                ✅ Ejecutor Aggregation
│   │   ├── indicadorEngine.factory.js        ✅ Factory Pattern
│   │   ├── indicador.service.js              ✅ Lógica de negocio
│   │   ├── indicador.controller.js           ✅ API endpoints
│   ├── fuentes/
│   │   ├── fuente.service.js                 ✅ Gestión de fuentes
│   │   ├── fuente.controller.js              ✅ API fuentes
├── models/
│   ├── indicadores/
│   │   ├── indicadores_firebird.json         📄 Indicadores SQL
│   │   ├── indicadores_mongo.json            ✅ Indicadores Mongo
```

### 🔧 BaseEngine.js - Clase Abstracta

**Responsabilidad:** Definir la interfaz común para todos los engines.

**Métodos abstractos (deben implementarse):**
- `async ejecutarIndicador(indicador, params)` - Ejecutar indicador
- `async validarConexion()` - Validar conectividad

**Métodos comunes (heredados):**
- `normalizarResultado(raw, metadata)` - Normaliza salida a formato estándar
- `validarParametrosFecha(params)` - Valida fechas
- `log(mensaje, nivel)` - Sistema de logging
- `manejarError(error, contexto)` - Gestión de errores

### 🔥 FirebirdEngine.js - Executor SQL

**Responsabilidad:** Ejecutar consultas SQL sobre bases Firebird.

**Características:**
- Reemplaza placeholders `:FECHAINI`, `:FECHAFIN`
- Reemplaza códigos de test `<CODTEST_FRAIL>`, etc.
- Formatea fechas al formato Firebird (`DD.MM.YYYY`)
- Normaliza resultado a formato estándar

**Configuración requerida:**
```javascript
{
  host: 'localhost',
  port: 3050,
  database: '/path/to/database.fdb',
  user: 'SYSDBA',
  password: 'masterkey'
}
```

### 🍃 MongoEngine.js - Executor Aggregation

**Responsabilidad:** Ejecutar aggregation pipelines sobre MongoDB.

**Características:**
- Reemplaza placeholders `{{fechaInicio}}`, `{{fechaFin}}`, `{{centro}}`
- Convierte fechas a ISOString
- Ejecuta aggregation sobre colecciones específicas
- Normaliza resultado a formato estándar

**Configuración requerida:**
```javascript
{
  db: mongoDbInstance,  // Instancia de MongoDB
  centro: 'CENTRO_01'   // Código del centro
}
```

**Métodos adicionales:**
- `obtenerCentrosDisponibles()` - Lista centros en MongoDB
- `obtenerColeccionesDisponibles()` - Lista colecciones de tests

---

## 3️⃣ ESTRUCTURA DE INDICADORES

### 📄 Indicador Firebird (SQL)

```json
{
  "id_code": "COMORB_FRAIL_PREV",
  "categoria": "Comorbilidad - Fragilidad",
  "indicador": "% pacientes prevalentes con fragilidad",
  "unidad": "%",
  "engine": "firebird",
  "template": "WITH PacientesPrevalentes AS (...) SELECT ... WHERE ... BETWEEN :FECHAINI AND :FECHAFIN"
}
```

**Características:**
- Campo `engine`: `"firebird"`
- Campo `template`: consulta SQL con placeholders `:FECHAINI`, `:FECHAFIN`

### 🍃 Indicador MongoDB (Aggregation)

```json
{
  "id_code": "COMORB_FRAIL_PREV_MONGO",
  "categoria": "Comorbilidad - Fragilidad",
  "indicador": "% pacientes prevalentes con fragilidad",
  "unidad": "%",
  "engine": "mongo",
  "collection": "frail",
  "aggregation": [
    {
      "$match": {
        "centro": "{{centro}}",
        "fecha": {
          "$gte": "{{fechaInicio}}",
          "$lte": "{{fechaFin}}"
        }
      }
    },
    {
      "$group": {
        "_id": "$NREGGEN",
        "ultimoTest": { "$first": "$$ROOT" }
      }
    },
    {
      "$facet": {
        "total": [{ "$count": "count" }],
        "conFragilidad": [
          { "$match": { "puntuacion_total": { "$gte": 3 } } },
          { "$count": "count" }
        ]
      }
    },
    {
      "$project": {
        "numero_pacientes": { "$arrayElemAt": ["$total.count", 0] },
        "numerador": { "$arrayElemAt": ["$conFragilidad.count", 0] },
        "resultado": {
          "$multiply": [
            { "$divide": ["$numerador", "$numero_pacientes"] },
            100
          ]
        }
      }
    }
  ]
}
```

**Características:**
- Campo `engine`: `"mongo"`
- Campo `collection`: nombre de la colección
- Campo `aggregation`: array con pipeline MongoDB
- Placeholders: `{{fechaInicio}}`, `{{fechaFin}}`, `{{centro}}`

---

## 4️⃣ FORMATO DE RESULTADO NORMALIZADO

**Todos los engines devuelven el mismo formato:**

```json
{
  "code": "DB1",  // o "MONGO_CENTRO_01"
  "resultado": 45.67,
  "numero_pacientes": 120,
  "numerador": 55,
  "metadata": {
    "engine": "FirebirdEngine",  // o "MongoEngine"
    "timestamp": "2026-02-23T10:30:00.000Z",
    "categoria": "Comorbilidad - Fragilidad",
    "indicador": "% pacientes prevalentes con fragilidad",
    "unidad": "%",
    "fuente_tipo": "firebird",  // o "mongo"
    "database": "/path/to/db.fdb",  // o "collection": "frail"
    "centro": "CENTRO_01"  // solo para MongoDB
  }
}
```

---

## 5️⃣ API ENDPOINTS

### GET /api/fuentes
**Obtener todas las fuentes disponibles (Firebird + MongoDB)**

**Response:**
```json
{
  "ok": true,
  "fuentes": {
    "firebird": [
      { "code": "DB1", "nombre": "Base Principal", "tipo": "firebird" },
      { "code": "DB2", "nombre": "Base Secundaria", "tipo": "firebird" }
    ],
    "mongo": [
      { "code": "MONGO_CENTRO_01", "nombre": "Centro 01 (MongoDB)", "tipo": "mongo", "centro": "CENTRO_01" },
      { "code": "MONGO_CENTRO_02", "nombre": "Centro 02 (MongoDB)", "tipo": "mongo", "centro": "CENTRO_02" }
    ],
    "total": 4
  }
}
```

### POST /api/indicadores/ejecutar
**Ejecutar indicadores sobre múltiples fuentes**

**Request:**
```json
{
  "indicadores": ["COMORB_FRAIL_PREV", "COMORB_BARTHEL_PREV"],
  "fuentes": [
    { "code": "DB1", "config": {...} },
    { "code": "MONGO_CENTRO_01", "config": {...} }
  ],
  "fechaInicio": "2026-01-01",
  "fechaFin": "2026-01-31"
}
```

**Response:**
```json
{
  "ok": true,
  "resultados": [
    {
      "code": "DB1",
      "resultado": 45.67,
      "numero_pacientes": 120,
      "numerador": 55,
      "metadata": {...}
    },
    {
      "code": "MONGO_CENTRO_01",
      "resultado": 38.24,
      "numero_pacientes": 85,
      "numerador": 32,
      "metadata": {...}
    }
  ],
  "advertencia": "Comparando fuentes de diferentes tipos...",
  "metadata": {
    "total_indicadores": 2,
    "total_fuentes": 2,
    "total_resultados": 4,
    "periodo": { "fechaInicio": "2026-01-01", "fechaFin": "2026-01-31" }
  }
}
```

### GET /api/indicadores/catalogo/:tipo
**Obtener catálogo de indicadores**

**Parámetros:** `tipo` = `firebird` | `mongo` | `all`

**Response:**
```json
{
  "ok": true,
  "tipo": "mongo",
  "indicadores": [
    {
      "id_code": "COMORB_FRAIL_PREV_MONGO",
      "categoria": "Comorbilidad - Fragilidad",
      "indicador": "% pacientes prevalentes con fragilidad",
      "unidad": "%",
      "engine": "mongo",
      "collection": "frail"
    }
  ]
}
```

---

## 6️⃣ FLUJO DE EJECUCIÓN COMPLETO

```
1. Usuario selecciona fuentes en Frontend Angular
   ↓
2. Frontend llama GET /api/fuentes
   → Recibe lista unificada (Firebird + Mongo)
   ↓
3. Usuario selecciona indicadores y rango de fechas
   ↓
4. Frontend llama POST /api/indicadores/ejecutar
   ↓
5. IndicadorController recibe la petición
   ↓
6. IndicadorService.ejecutarIndicadoresMasivo()
   ↓
7. Para cada fuente:
   a. IndicadorEngineFactory.detectarTipoFuente(code)
      → Determina si es Firebird o MongoDB
   
   b. IndicadorEngineFactory.crearEngine(tipo, config)
      → Instancia FirebirdEngine o MongoEngine
   
   c. engine.validarConexion()
      → Verifica conectividad
   
   d. Para cada indicador:
      - IndicadorService.buscarIndicador(id, tipo)
      - engine.ejecutarIndicador(indicador, params)
      - engine.normalizarResultado(raw)
   
   e. engine.cerrar()
   ↓
8. Se agregan todos los resultados
   ↓
9. Se retorna array unificado al Frontend
   ↓
10. Frontend visualiza resultados en UI única
```

---

## 7️⃣ CONSIDERACIONES TÉCNICAS

### 🔒 Seguridad
- **Validación de entrada:** Todas las fechas y parámetros se validan
- **SQL Injection:** Los placeholders evitan inyección SQL
- **NoSQL Injection:** Los pipelines son templates JSON estáticos

### ⚡ Rendimiento
- **Indexación MongoDB:** Crear índices en:
  ```javascript
  db.frail.createIndex({ centro: 1, fecha: -1, NREGGEN: 1 })
  db.barthel.createIndex({ centro: 1, fecha: -1, NREGGEN: 1 })
  db.charlson.createIndex({ centro: 1, fecha: -1, NREGGEN: 1 })
  ```

- **Conexiones Firebird:** Se abre/cierra conexión por consulta (pool opcional)
- **MongoDB:** Reutiliza instancia de base de datos

### 📊 Escalabilidad
- **Agregar nuevos engines:** Crear clase que extienda `BaseEngine`
- **Agregar nuevos indicadores Mongo:** Agregar entrada en `indicadores_mongo.json`
- **Agregar nuevas fuentes:** Automático desde `databases.json` o detección en MongoDB

### 🧪 Testing
- **Unit Tests:** Cada engine puede testearse de forma aislada
- **Integration Tests:** Validar ejecución completa
- **Mock Data:** BaseEngine permite inyección de dependencias

---

## 8️⃣ CAMBIOS EN FRONTEND ANGULAR

### Modificar Selector de Bases

**Antes:**
```typescript
basesDisponibles: string[] = ['DB1', 'DB2', 'DB3'];
```

**Después:**
```typescript
interface Fuente {
  code: string;
  nombre: string;
  tipo: 'firebird' | 'mongo';
  centro?: string;
}

fuentesDisponibles: Fuente[] = [];

ngOnInit() {
  this.http.get<any>('/api/fuentes').subscribe(res => {
    this.fuentesDisponibles = res.fuentes.todas;
  });
}
```

### UI Unificada con Distinción Visual

```html
<mat-select multiple [(ngModel)]="fuentesSeleccionadas">
  <mat-optgroup label="Bases Firebird">
    <mat-option *ngFor="let f of fuentesFirebird" [value]="f">
      <mat-icon>storage</mat-icon> {{ f.nombre }}
    </mat-option>
  </mat-optgroup>
  
  <mat-optgroup label="Centros MongoDB">
    <mat-option *ngFor="let f of fuentesMongo" [value]="f">
      <mat-icon>cloud</mat-icon> {{ f.nombre }}
    </mat-option>
  </mat-optgroup>
</mat-select>
```

---

## 9️⃣ COMPATIBILIDAD CON SISTEMA ACTUAL

✅ **100% Retrocompatible:**
- Los indicadores Firebird existentes NO se modifican
- El flujo actual de ejecución NO se rompe
- Las bases Firebird siguen funcionando exactamente igual
- MongoDB es una **adición** no una **sustitución**

✅ **Convivencia:**
- Firebird vs Firebird: ✅ Funciona
- Mongo vs Mongo: ✅ Funciona
- Firebird vs Mongo: ⚠️ Funciona con advertencia

---

## 🔟 PRÓXIMOS PASOS (IMPLEMENTACIÓN)

1. **Copiar indicadores existentes a `indicadores_firebird.json`**
2. **Inicializar servicios en `index.js`:**
```javascript
const indicadorService = require('./controllers/indicadores/indicador.service');
const fuenteService = require('./controllers/fuentes/fuente.service');

// Al iniciar el servidor
(async () => {
  await indicadorService.cargarIndicadores();
  await fuenteService.cargarFuentesFirebird();
  await fuenteService.cargarCentrosMongo(app.locals.db);
})();
```

3. **Registrar rutas en Express**
4. **Adaptar frontend Angular**
5. **Testing completo**

---

## 📚 REFERENCIAS

- **Strategy Pattern:** https://refactoring.guru/design-patterns/strategy
- **Factory Pattern:** https://refactoring.guru/design-patterns/factory-method
- **MongoDB Aggregation:** https://docs.mongodb.com/manual/aggregation/

---

**Versión:** 1.0  
**Fecha:** 23 de febrero de 2026  
**Autor:** Diseño técnico para integración híbrida Firebird + MongoDB
