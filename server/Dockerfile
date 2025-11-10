# Usar una imagen base de Node.js (versión LTS Alpine para ligereza)
FROM node:20-alpine

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