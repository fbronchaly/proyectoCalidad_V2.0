# 📊 DIAGRAMA DE FLUJO COMPLETO: EJECUCIÓN DE INDICADORES HÍBRIDOS

## 🎯 Flujo Principal de Ejecución

```
┌─────────────────────────────────────────────────────────────┐
│  PASO 1: USUARIO EN FRONTEND ANGULAR                        │
│  - Selecciona fuentes (DB1, DB2, MONGO_CENTRO_01)          │
│  - Selecciona indicadores                                   │
│  - Define rango de fechas                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP POST /api/indicadores/ejecutar
                         │ Body: {
                         │   indicadores: ['COMORB_FRAIL_PREV'],
                         │   fuentes: [{code: 'DB1'}, {code: 'MONGO_01'}],
                         │   fechaInicio: '2026-01-01',
                         │   fechaFin: '2026-01-31'
                         │ }
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 2: INDICADOR CONTROLLER                               │
│  ✓ Validar request                                          │
│  ✓ Llamar IndicadorService.ejecutarIndicadoresMasivo()     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 3: INDICADOR SERVICE                                  │
│  FOR EACH fuente IN fuentes:                                │
│    ├─ Detectar tipo (Firebird o MongoDB)                   │
│    │                                                         │
│    FOR EACH indicador IN indicadores:                       │
│      ├─ Buscar definición del indicador                     │
│      ├─ Validar compatibilidad                              │
│      └─ Ejecutar indicador                                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 4: INDICADOR ENGINE FACTORY                           │
│  ┌─────────────────────────────────────────┐                │
│  │ detectarTipoFuente(code)                │                │
│  │  ├─ Si code = "DB\d+" → firebird        │                │
│  │  └─ Si code = "MONGO_*" → mongo         │                │
│  └─────────────────────────────────────────┘                │
│                         │                                    │
│  ┌─────────────────────────────────────────┐                │
│  │ crearEngine(tipo, config)               │                │
│  │  ├─ Si tipo = firebird → FirebirdEngine │                │
│  │  └─ Si tipo = mongo → MongoEngine       │                │
│  └─────────────────────────────────────────┘                │
└─────────┬───────────────────────────┬───────────────────────┘
          │                           │
    tipo=firebird              tipo=mongo
          │                           │
          ▼                           ▼
┌──────────────────────┐    ┌──────────────────────┐
│  FIREBIRD ENGINE     │    │  MONGO ENGINE        │
├──────────────────────┤    ├──────────────────────┤
│ PASO 5A:             │    │ PASO 5B:             │
│ 1. Validar conexión  │    │ 1. Validar conexión  │
│    Firebird.attach() │    │    db.admin().ping() │
│                      │    │                      │
│ 2. Preparar SQL      │    │ 2. Preparar Pipeline │
│    - Reemplazar      │    │    - Reemplazar      │
│      :FECHAINI       │    │      {{fechaInicio}} │
│      :FECHAFIN       │    │      {{fechaFin}}    │
│    - Reemplazar      │    │      {{centro}}      │
│      <CODTEST_*>     │    │                      │
│                      │    │ 3. Ejecutar Agg      │
│ 3. Ejecutar SQL      │    │    collection        │
│    db.query(sql)     │    │      .aggregate()    │
│                      │    │                      │
│ 4. Normalizar        │    │ 4. Normalizar        │
│    resultado         │    │    resultado         │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           └───────────┬───────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 6: RESULTADO NORMALIZADO                              │
│  {                                                           │
│    code: "DB1" | "MONGO_CENTRO_01",                         │
│    resultado: 45.67,                                        │
│    numero_pacientes: 120,                                   │
│    numerador: 55,                                           │
│    metadata: {                                              │
│      engine: "FirebirdEngine" | "MongoEngine",              │
│      timestamp: "2026-02-23T10:30:00Z",                     │
│      categoria: "Comorbilidad - Fragilidad",                │
│      fuente_tipo: "firebird" | "mongo",                     │
│      ...                                                    │
│    }                                                        │
│  }                                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Repetir para todos los indicadores
                         │ y todas las fuentes
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 7: AGREGACIÓN DE RESULTADOS                           │
│  [                                                           │
│    { code: "DB1", resultado: 45.67, ... },                  │
│    { code: "MONGO_CENTRO_01", resultado: 38.24, ... },      │
│    { code: "DB1", resultado: 72.15, ... },  // 2do indic.   │
│    { code: "MONGO_CENTRO_01", resultado: 68.90, ... }       │
│  ]                                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP Response
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 8: RESPUESTA AL FRONTEND                              │
│  {                                                           │
│    ok: true,                                                │
│    resultados: [...],                                       │
│    advertencia: "Comparando tipos diferentes..." | null,    │
│    metadata: {                                              │
│      total_indicadores: 2,                                  │
│      total_fuentes: 2,                                      │
│      total_resultados: 4,                                   │
│      periodo: { fechaInicio, fechaFin }                     │
│    }                                                        │
│  }                                                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  PASO 9: FRONTEND ANGULAR - VISUALIZACIÓN                   │
│  - Tabla comparativa unificada                              │
│  - Gráficos de barras (DB1 vs MONGO_CENTRO_01)             │
│  - Distinción visual por tipo de fuente                     │
│  - Mismo formato de presentación                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔀 Flujo de Decisión: Selección de Engine

```
                    ┌─────────────────┐
                    │  Fuente Code    │
                    │  Recibido       │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │  Regex Check    │
                    │  /^DB\d+$/      │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
          ✅ MATCH                      ❌ NO MATCH
              │                             │
              ▼                             ▼
     ┌────────────────┐          ┌──────────────────┐
     │ Tipo: firebird │          │  Regex Check     │
     │                │          │  /MONGO|CENTRO_/ │
     │ FirebirdEngine │          └────────┬─────────┘
     └────────────────┘                   │
                             ┌────────────┴────────────┐
                             │                         │
                         ✅ MATCH                  ❌ NO MATCH
                             │                         │
                             ▼                         ▼
                    ┌────────────────┐      ┌────────────────┐
                    │  Tipo: mongo   │      │ DEFAULT:       │
                    │                │      │ firebird       │
                    │  MongoEngine   │      │ (compatibilid) │
                    └────────────────┘      └────────────────┘
```

---

## 🏗️ Arquitectura de Clases (UML Simplificado)

```
┌────────────────────────────────────────┐
│         <<abstract>>                   │
│          BaseEngine                    │
├────────────────────────────────────────┤
│ # config: Object                       │
├────────────────────────────────────────┤
│ + constructor(config)                  │
│ + ejecutarIndicador(ind, params)*     │ ← Abstracto
│ + validarConexion()*                   │ ← Abstracto
│ + normalizarResultado(raw, meta)      │
│ + validarParametrosFecha(params)      │
│ + log(mensaje, nivel)                 │
│ + manejarError(error, ctx)            │
└────────────────┬───────────────────────┘
                 │
       ┌─────────┴─────────┐
       │                   │
       ▼                   ▼
┌──────────────┐    ┌──────────────┐
│ FirebirdEngine│    │ MongoEngine  │
├──────────────┤    ├──────────────┤
│ - connPool   │    │ - db         │
│              │    │ - centro     │
├──────────────┤    ├──────────────┤
│ + ejecutar   │    │ + ejecutar   │
│   Indicador()│    │   Indicador()│
│ + validar    │    │ + validar    │
│   Conexion() │    │   Conexion() │
│              │    │              │
│ - preparar   │    │ - preparar   │
│   SQL()      │    │   Pipeline() │
│ - ejecutar   │    │ - obtener    │
│   SQL()      │    │   Centros()  │
│ - formatear  │    │ - obtener    │
│   Fecha()    │    │   Colecciones│
└──────────────┘    └──────────────┘
```

---

## 🔄 Ciclo de Vida de una Petición

```
T=0ms    Frontend envía POST /api/indicadores/ejecutar
         │
T=5ms    IndicadorController recibe request
         │
T=10ms   Validación de parámetros
         │
T=15ms   IndicadorService.ejecutarIndicadoresMasivo()
         │
         ├─ Fuente 1 (DB1)
         │  │
T=20ms   │  ├─ Factory detecta tipo: firebird
         │  ├─ Crea FirebirdEngine
T=25ms   │  ├─ Valida conexión Firebird
         │  │
         │  ├─ Indicador 1
T=30ms   │  │  ├─ Busca definición
T=35ms   │  │  ├─ Prepara SQL
T=40ms   │  │  ├─ Ejecuta consulta (100-500ms típico)
T=540ms  │  │  ├─ Normaliza resultado
         │  │  └─ ✓ Resultado 1.1
         │  │
         │  └─ Indicador 2
T=545ms  │     ├─ Prepara SQL
T=550ms  │     ├─ Ejecuta consulta
T=1050ms │     ├─ Normaliza resultado
         │     └─ ✓ Resultado 1.2
         │
T=1055ms ├─ Fuente 2 (MONGO_CENTRO_01)
         │  │
         │  ├─ Factory detecta tipo: mongo
         │  ├─ Crea MongoEngine
T=1060ms │  ├─ Valida conexión MongoDB
         │  │
         │  ├─ Indicador 1
T=1065ms │  │  ├─ Busca definición
T=1070ms │  │  ├─ Prepara pipeline
T=1075ms │  │  ├─ Ejecuta aggregation (50-200ms típico)
T=1275ms │  │  ├─ Normaliza resultado
         │  │  └─ ✓ Resultado 2.1
         │  │
         │  └─ Indicador 2
T=1280ms │     ├─ Prepara pipeline
T=1285ms │     ├─ Ejecuta aggregation
T=1485ms │     ├─ Normaliza resultado
         │     └─ ✓ Resultado 2.2
         │
T=1490ms │ Agregar todos los resultados
         │ Preparar response
         │
T=1495ms └─ Response enviada al frontend
         
TOTAL: ~1.5 segundos (para 2 fuentes × 2 indicadores)
```

---

## 📝 Notas de Rendimiento

### ⚡ Optimizaciones Implementadas

1. **Índices MongoDB:**
   ```javascript
   { centro: 1, fecha: -1, NREGGEN: 1 }
   ```
   → Reduce tiempo de aggregation de ~500ms a ~50ms

2. **Aggregation Pipeline Eficiente:**
   - `$match` primero (filtra documentos temprano)
   - `$group` para deduplicar
   - `$facet` para cálculos paralelos

3. **Firebird Connection Pooling (Opcional):**
   - Puede implementarse en FirebirdEngine
   - Reutilizar conexiones reduce latencia

4. **Caché de Catálogos:**
   - Indicadores cargados una vez al inicio
   - No se releen archivos JSON en cada request

---

## 🎨 Diferenciación Visual en Frontend

```html
<!-- Firebird Sources -->
<mat-chip class="source-firebird">
  <mat-icon>storage</mat-icon>
  DB1: 45.67%
</mat-chip>

<!-- MongoDB Sources -->
<mat-chip class="source-mongo">
  <mat-icon>cloud</mat-icon>
  CENTRO_01: 38.24%
</mat-chip>
```

```scss
.source-firebird {
  background-color: #3f51b5; /* Azul Firebird */
  color: white;
}

.source-mongo {
  background-color: #4caf50; /* Verde MongoDB */
  color: white;
}
```

---

**Versión:** 1.0  
**Fecha:** 23 de febrero de 2026
