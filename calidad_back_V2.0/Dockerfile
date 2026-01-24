FROM node:18-slim

WORKDIR /usr/src/app

# Paquetes del sistema (Cambiado de apk a apt-get para Debian)
RUN apt-get update && apt-get install -y bash openssh-client && rm -rf /var/lib/apt/lists/*

# 1) package.json/lock + patches (para que patch-package pueda aplicarse)
COPY package*.json ./
COPY patches ./patches

# 2) Instalar deps (incluye dev para poder ejecutar patch-package en postinstall)
RUN npm ci

# 3) Quitar dev deps dejando solo prod
RUN npm prune --omit=dev

# 4) Copiar el resto del código
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]






