# Usar una imagen base de Node.js (versión LTS Alpine para ligereza)
FROM node:20-alpine

# Instalar dependencias de Chromium para Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Variables de entorno para Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Aumentar límite de memoria de Node.js para soportar:
# - 15 browsers de Puppeteer concurrentes (~150MB cada uno)
# - 50 conexiones WebSocket simultáneas
# - Pool de 50 conexiones PostgreSQL
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código de la aplicación
COPY . .

# Exponer el puerto que usa el servidor (coincide con .env y compose)
EXPOSE 5001

# Comando por defecto para iniciar (aunque lo sobreescribimos en compose)
CMD ["npm", "start"]