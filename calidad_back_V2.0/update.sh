#!/bin/bash

echo "🚀 Parando contenedores..."
docker-compose down

echo "🚀 Reconstruyendo la imagen..."
docker-compose build --no-cache

echo "🚀 Lanzando el sistema..."
docker-compose up -d

echo "✅ Despliegue completado con éxito"
