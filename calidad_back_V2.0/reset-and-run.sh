#!/bin/bash

echo "🧹 Parando y eliminando todos los contenedores..."
docker stop $(docker ps -aq) 2>/dev/null
docker rm $(docker ps -aq) 2>/dev/null

echo "🧹 Eliminando todas las imágenes..."
docker rmi -f $(docker images -q) 2>/dev/null

echo "🧼 Limpiando volúmenes y caché..."
docker volume prune -f
docker builder prune -af

echo "🔨 Construyendo imágenes con docker-compose..."
docker-compose build

echo "🚀 Levantando servicios con docker-compose..."
docker-compose up
d