#!/bin/bash

# 🚀 Arranca backend y frontend a la vez
# Ajusta las rutas a tu estructura real

cd "$(dirname "$0")"

# Variables de entorno del backend
export USE_PROD_ORIGIN=false

# Verificar que concurrently esté instalado
if [ ! -f "node_modules/.bin/concurrently" ]; then
    echo "❌ Error: concurrently no está instalado. Ejecuta: npm install"
    exit 1
fi

# Verificar que las dependencias estén instaladas
if [ ! -d "calidad_back_V2.0/node_modules" ]; then
    echo "❌ Error: Dependencias del backend no instaladas. Ejecuta: cd calidad_back_V2.0 && npm install"
    exit 1
fi

if [ ! -d "calidad_front_V2.0/node_modules" ]; then
    echo "❌ Error: Dependencias del frontend no instaladas. Ejecuta: cd calidad_front_V2.0 && npm install"
    exit 1
fi

echo "🚀 Iniciando backend y frontend..."

./node_modules/.bin/concurrently \
  "cd calidad_back_V2.0 && node index.js" \
  "cd calidad_front_V2.0 && ng serve --open"


# Permisos --> chmod +x start-all.sh
# Arrancar script -->   ./start-all.sh