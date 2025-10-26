FROM node:18-alpine
WORKDIR /usr/src/app

# 1) Copia package.json, lockfile y patches
COPY package*.json ./
COPY patches ./patches

# 2) Instala **todas** las deps y aplica patch-package
RUN npm ci

# 3) Quita las devDependencies y deja solo prod
RUN npm prune --production

# 3 Instalar bash y openssh
RUN apk add --no-cache bash openssh

# 4) Copia el resto del código
COPY . .

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "index.js"]






