#!/bin/bash

# 🚀 Arranca backend y frontend a la vez
# Ajusta las rutas a tu estructura real

cd "$(dirname "$0")"

# Variables de entorno del backend
export USE_PROD_ORIGIN=false

concurrently \
  "cd calidad_back_V2.0 && node index.js" \
  "cd calidad_front_V2.0 && ng serve --open"


# Permisos --> chmod +x start-all.sh
# Arrancar script -->   ./start-all.sh