#!/bin/bash
set -euo pipefail

# =========================
# Configuración del servidor
# =========================
REMOTE_USER="friat"
REMOTE_HOST="193.147.197.113"
REMOTE_PATH="~/proyectoCalidad_V2.0"
SSH_OPTS="-tt -o HostKeyAlgorithms=+ssh-rsa -o PubkeyAcceptedAlgorithms=+ssh-rsa"

echo "🚀 === INICIANDO DESPLIEGUE A PRODUCCIÓN REMOTA ($REMOTE_HOST) ==="

# =========================================================
# 1. Preparar archivos en local (Compilar Angular + Copiar)
# =========================================================
echo "📦 1. Preparando build local..."
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

# =========================
# 2. Subir archivos al servidor
# =========================
echo "📡 2. Subiendo archivos al servidor (rsync)..."
echo "   Destino: $REMOTE_PATH"

# Asegurar que existe el directorio remoto
ssh ${SSH_OPTS/-tt/} $REMOTE_USER@$REMOTE_HOST "mkdir -p $REMOTE_PATH"

rsync -avz -e "ssh ${SSH_OPTS/-tt/}" \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.angular' \
  --exclude 'calidad_front_V2.0/node_modules' \
  --exclude 'calidad_back_V2.0/node_modules' \
  ./ \
  $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/

# =========================
# 3. Reconstruir en el servidor
# =========================
echo "🐳 3. Reconstruyendo Docker en el servidor..."

# Si SUDO_PASS está definida, no preguntamos
if [ "${SUDO_PASS:-}" != "" ]; then
  echo "   🔐 Usando SUDO_PASS desde entorno (modo automático)"
  # CAMBIO: Agregamos 'docker compose down' para borrar la red vieja antes de crear la nueva con subred
  ssh $SSH_OPTS $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && echo '$SUDO_PASS' | sudo -S docker compose down && echo '$SUDO_PASS' | sudo -S docker compose up -d --build"
else
  echo "   🔐 Se requiere contraseña de sudo en el servidor."
  echo -n "   Introduce la contraseña de sudo para $REMOTE_USER@$REMOTE_HOST: "
  read -s PASS
  echo
  # CAMBIO: Agregamos 'docker compose down' aquí también
  ssh $SSH_OPTS $REMOTE_USER@$REMOTE_HOST "cd $REMOTE_PATH && echo '$PASS' | sudo -S docker compose down && echo '$PASS' | sudo -S docker compose up -d --build"
fi

echo "✅ === DESPLIEGUE REMOTO COMPLETADO ==="

# Permisos --> chmod +x deploy-to-server.sh
# Arrancar script -->   ./deploy-to-server.sh