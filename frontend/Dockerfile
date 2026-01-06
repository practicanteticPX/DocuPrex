# ========================================
# Stage 1: Build de Producción
# ========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias (incluyendo devDependencies para el build)
RUN npm install

# Copiar código fuente
COPY . .

# Construir aplicación optimizada para producción
# Vite generará archivos en /app/dist
RUN npm run build

# ========================================
# Stage 2: Servidor de Producción
# ========================================
FROM node:20-alpine

WORKDIR /app

# Copiar el build de producción, package.json y vite.config.js
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/vite.config.js ./

# Instalar solo vite para servir el build (modo preview)
RUN npm install vite --save-dev

# Exponer puerto 5173 (mantenido como solicitó el usuario)
EXPOSE 5173

# Servir aplicación de producción en puerto 5173
# vite preview sirve el build optimizado
CMD ["npx", "vite", "preview", "--port", "5173", "--host"]
