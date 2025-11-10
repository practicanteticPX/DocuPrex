# Usar una imagen base de Node.js (versión LTS Alpine)
FROM node:20-alpine

# Establecer el directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código de la aplicación
COPY . .

# Exponer el puerto que usa Vite (coincide con .env y compose)
EXPOSE 5173

# Comando por defecto para iniciar (aunque lo sobreescribimos en compose)
# Importante: '--host' permite acceder desde fuera del contenedor
CMD ["npm", "run", "dev", "--", "--host"]