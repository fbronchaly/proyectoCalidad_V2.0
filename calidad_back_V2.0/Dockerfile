FROM node:18-alpine

WORKDIR /usr/src/app

# Paquetes del sistema (si solo necesitas cliente SSH: openssh-client)
RUN apk add --no-cache bash openssh-client

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






