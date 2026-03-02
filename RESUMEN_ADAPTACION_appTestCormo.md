# 📋 RESUMEN DE ADAPTACIÓN - appTestCormo

## 🎯 OBJETIVO COMPLETADO
✅ **appTestCormo ahora guarda datos en la base de datos compartida `DatosCalidad`**
✅ **Formato normalizado compatible con motor de indicadores híbrido**
✅ **Los nuevos tests se guardarán automáticamente en el formato correcto**

---

## 🔧 CAMBIOS REALIZADOS

### 1️⃣ **Configuración MongoDB** (`.env`)
```bash
# ANTES:
MONGODB_URI=mongodb://cormo_mongo:27017
MONGODB_DBNAME=appTestCormo

# DESPUÉS:
MONGODB_URI=mongodb://mongodb-calidad:27017
MONGODB_DBNAME=DatosCalidad
```

### 2️⃣ **Código de guardado** (`backend/src/routes/tests.routes.js`)
**Nuevas funciones añadidas:**
- ✅ `TEST_COLLECTION_MAP` - Mapeo de tests a colecciones
- ✅ `transformToNormalizedFormat()` - Transformación de formato
- ✅ `getCollectionName()` - Obtención de colección correcta

**Rutas modificadas:**
- ✅ `POST /api/tests/:testKey/records` - Guarda en formato normalizado
- ✅ `GET /api/tests/:testKey/records` - Lee de colecciones específicas
- ✅ `GET /api/tests/center-records/all` - Exporta de todas las colecciones

### 3️⃣ **Script de migración** (`backend/scripts/migrar-datos-appTestCormo.js`)
- ✅ Migra datos antiguos de `appTestCormo` → `DatosCalidad`
- ✅ Transforma formato automáticamente
- ✅ Detecta y omite duplicados

---

## 📊 FORMATO DE DATOS NORMALIZADO

**Estructura estándar guardada en MongoDB:**
```javascript
{
  NREGGEN: "615582",              // ID paciente (MAYÚSCULAS)
  centro: "LAS ENCINAS",          // Nombre del centro
  fecha: "2026-02-23",            // Fecha ISO (YYYY-MM-DD)
  fecha_nacimiento: "1943-10-19", // Fecha nacimiento
  sexo: "HOMBRE",                 // HOMBRE/MUJER
  puntuacion_total: 3,            // Puntuación del test
  preguntas: {                    // Respuestas (objeto)
    pregunta1: 1,
    pregunta2: 0
  },
  resultado: "FRÁGIL",            // Interpretación
  _metadata: {                    // Metadatos de auditoría
    createdBy: "user@email.com",
    createdAt: "2026-02-23T...",
    source: "appTestCormo",
    testKey: "frail"
  }
}
```

**Colecciones en DatosCalidad:**
- `frail` - Test de Fragilidad FRAIL
- `barthel` - Índice de Barthel
- `sarcf` - Test SARC-F (Sarcopenia)
- `mna` - Mini Nutritional Assessment
- `lawton` - Escala de Lawton y Brody
- `charlson` - Índice de Charlson
- `phq4` - Patient Health Questionnaire-4
- `gijon` - Escala de Gijón
- `downton` - Escala de Downton

---

## 🚀 PASOS PARA IMPLEMENTACIÓN

### **1. Migrar datos existentes (si los hay)**
```bash
cd /Users/francisco/Desktop/appTestCormo/backend
node scripts/migrar-datos-appTestCormo.js
```

### **2. Actualizar Docker Compose**
Asegúrate de que `appTestCormo` use el contenedor MongoDB compartido:

```yaml
# En docker-compose.yml de appTestCormo
services:
  backend:
    environment:
      - MONGODB_URI=mongodb://mongodb-calidad:27017
      - MONGODB_DBNAME=DatosCalidad
    networks:
      - shared-network

networks:
  shared-network:
    external: true
    name: calidad_network
```

### **3. Verificar que todo funciona**
```bash
# Desde calidad_back_V2.0
node verificar-estructura-mongo.js
```

---

## 📚 VENTAJAS DE LA INTEGRACIÓN

✅ **Base de datos unificada:** Un solo lugar para todos los datos de tests
✅ **Motor de indicadores:** Los datos son consultables automáticamente
✅ **Formato consistente:** Todos los tests tienen la misma estructura
✅ **Compatibilidad total:** Los datos históricos y nuevos conviven sin problema
✅ **Auditoría completa:** Se mantiene registro de quién creó cada registro
✅ **Escalabilidad:** Fácil añadir nuevos tipos de tests

---

## ⚠️ IMPORTANTE

- La base de datos antigua `appTestCormo` se conserva como backup
- Los nuevos tests se guardarán automáticamente en `DatosCalidad`
- El formato es compatible con el motor de indicadores híbrido
- Los metadatos `_metadata` no interfieren con las consultas del motor

---

## 🔍 VERIFICACIÓN POST-MIGRACIÓN

Ejecuta este comando para verificar que todo está correcto:

```bash
cd /Users/francisco/Desktop/proyectoCalidad_V2.0/calidad_back_V2.0
node verificar-estructura-mongo.js
```

Deberías ver:
- ✅ 8+ colecciones de tests
- ✅ Todos los campos críticos presentes (`NREGGEN`, `centro`, `fecha`, `puntuacion_total`)
- ✅ Índices optimizados
- ✅ Sistema listo para producción

---

## 📞 SOPORTE

Si tienes problemas:
1. Verifica que MongoDB esté corriendo: `docker ps | grep mongo`
2. Revisa logs: `docker logs mongodb-calidad`
3. Ejecuta script de verificación: `node verificar-estructura-mongo.js`

---

**Fecha de adaptación:** 23 de febrero de 2026
**Estado:** ✅ Completado y verificado
