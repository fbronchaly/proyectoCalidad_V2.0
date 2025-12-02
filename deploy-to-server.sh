#!/bin/bash

# Configuración del servidor
REMOTE_USER="friat"
REMOTE_HOST="193.147.197.113"
# ⚠️ IMPORTANTE: Ajusta esta ruta a donde tengas el proyecto en el servidor
REMOTE_PATH="~/proyectoCalidad_V2.0" 
SSH_OPTS="-o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa"

echo "🚀 === INICIANDO DESPLIEGUE A PRODUCCIÓN REMOTA ($REMOTE_HOST) ==="

# 1. Preparar archivos en local (Compilar Angular + Copiar a Backend)
echo "📦 1. Preparando build local..."
# Ejecutamos la compilación localmente para aprovechar la velocidad del Mac
cd calidad_front_V2.0
./node_modules/.bin/ng build --configuration production
cd ..

# Copiar dist al backend local
rm -rf calidad_back_V2.0/public/dist
mkdir -p calidad_back_V2.0/public/dist
if [ -d "calidad_front_V2.0/dist/app" ]; then
    cp -r calidad_front_V2.0/dist/app/* calidad_back_V2.0/public/dist/
else
    cp -r calidad_front_V2.0/dist/calidad-front-v2.0/* calidad_back_V2.0/public/dist/
fi

# 2. Subir archivos al servidor
echo "📡 2. Subiendo archivos al servidor (rsync)..."
echo "   Destino: $REMOTE_PATH"

# Usamos rsync para subir solo lo necesario (excluyendo node_modules pesados)
rsync -avz -e "ssh $SSH_OPTS" \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.angular' \
    --exclude 'calidad_front_V2.0/node_modules' \
    --exclude 'calidad_back_V2.0/node_modules' \
    ./ \
    $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/

# 3. Reconstruir en el servidor
echo "🐳 3. Reconstruyendo Docker en el servidor..."
ssh $SSH_OPTS $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && docker-compose down && docker-compose up -d --build"

echo "✅ === DESPLIEGUE REMOTO COMPLETADO ==="

# Para activar ./deploy-to-server.sh
