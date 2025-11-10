# Backend GraphQL - Sistema de Firmas Digitales

Servidor GraphQL con Apollo Server para el sistema de firmas digitales.

## Estructura del Proyecto

```
server/
├── graphql/
│   ├── index.js      # Exporta schema y resolvers
│   ├── schema.js     # Definiciones de tipos GraphQL
│   └── resolvers.js  # Lógica de resolución de queries/mutations
├── server.js         # Archivo principal del servidor
├── .env              # Variables de entorno
└── package.json      # Dependencias del proyecto
```

## Instalación

Las dependencias ya están instaladas. Si necesitas reinstalarlas:

```bash
npm install
```

## Configuración

El archivo `.env` contiene las variables de entorno:

```env
PORT=5001
JWT_SECRET=tu-secreto-super-seguro-cambiar-en-produccion
JWT_EXPIRES=8h
FRONTEND_URL=http://192.168.0.19:5173

# Base de Datos PostgreSQL Local (Docker)
DATABASE_URL=postgresql://postgres:postgres123@postgres-db:5432/firmas_db

# Configuración Active Directory
AD_PROTOCOL=ldap
AD_HOSTNAME=192.168.0.253
AD_PORT=389
AD_BASE_DN=DC=prexxa,DC=local
AD_SEARCH_BASE=DC=prexxa,DC=local
AD_BIND_USER=glpi.sync@prexxa.local
AD_BIND_PASS=adminPre8909
AD_USER_SEARCH_FILTER=(objectClass=user)
AD_STARTTLS=false
```

## Iniciar el Servidor

### Con Docker (Recomendado):

Desde la raíz del proyecto:

```bash
docker-compose up
```

Esto iniciará:
- PostgreSQL (Base de datos local con volumen persistente en `./bd`)
- Backend (GraphQL Server en puerto 5001)
- Frontend (React/Vite en puerto 5173)

### Modo desarrollo local (sin Docker):

```bash
npm run dev
```

### Modo producción local:

```bash
npm start
```

El servidor estará disponible en:
- **API GraphQL**: http://192.168.0.19:5001/graphql
- **Health Check**: http://192.168.0.19:5001/health

## Schema GraphQL

### Tipos principales:

- **User**: Usuarios del sistema
- **Document**: Documentos para firmar
- **Signature**: Firmas digitales
- **AuthPayload**: Respuesta de autenticación

### Queries disponibles:

```graphql
# Usuarios
me: User                    # Usuario autenticado
users: [User!]!            # Todos los usuarios (solo admin)
user(id: ID!): User        # Usuario por ID

# Documentos
documents: [Document!]!     # Todos los documentos
document(id: ID!): Document # Documento por ID
myDocuments: [Document!]!   # Documentos del usuario autenticado

# Firmas
signatures(documentId: ID!): [Signature!]!  # Firmas de un documento
```

### Mutations disponibles:

```graphql
# Autenticación
login(email: String!, password: String!): AuthPayload!
register(name: String!, email: String!, password: String!): AuthPayload!

# Usuarios
updateUser(id: ID!, name: String, email: String): User!
deleteUser(id: ID!): Boolean!

# Documentos
createDocument(title: String!, content: String): Document!
updateDocument(id: ID!, title: String, content: String, status: String): Document!
deleteDocument(id: ID!): Boolean!

# Firmas
signDocument(documentId: ID!, signatureData: String!): Signature!
```

## Ejemplo de uso

### Registro de usuario:

```graphql
mutation {
  register(
    name: "Juan Pérez"
    email: "juan@example.com"
    password: "password123"
  ) {
    token
    user {
      id
      name
      email
      role
    }
  }
}
```

### Login:

```graphql
mutation {
  login(
    email: "juan@example.com"
    password: "password123"
  ) {
    token
    user {
      id
      name
      email
    }
  }
}
```

### Crear documento:

```graphql
mutation {
  createDocument(
    title: "Contrato de servicios"
    content: "Contenido del contrato..."
  ) {
    id
    title
    status
    createdAt
  }
}
```

## Autenticación

El servidor usa JWT (JSON Web Tokens) para autenticación. Para acceder a recursos protegidos:

1. Obtén el token mediante login o register
2. Incluye el token en el header de las peticiones:

```
Authorization: Bearer <tu-token>
```

## Base de datos

El servidor usa **PostgreSQL** en Docker para persistencia de datos:

- **Contenedor**: `firmas_db` (postgres:14-alpine)
- **Credenciales locales**:
  - Usuario: `postgres`
  - Password: `postgres123`
  - Base de datos: `firmas_db`
- **Volumen**: Los datos se persisten en la carpeta `./bd` del proyecto
- **Conexión interna**: Los servicios de Docker se conectan usando el hostname `postgres-db`

Para integrar con PostgreSQL:

1. Instala el cliente de PostgreSQL (si aún no está instalado):
   ```bash
   npm install pg
   ```

2. Actualiza los resolvers en `graphql/resolvers.js` para conectar con la base de datos usando la variable `DATABASE_URL` del archivo `.env`

## Sincronización de Emails desde Active Directory

El sistema obtiene automáticamente los emails de Active Directory cuando los usuarios se autentican. Para sincronizar los emails de usuarios existentes:

```bash
# Ejecutar dentro del contenedor Docker
docker-compose exec server node sync-ad-emails.js

# O si estás dentro del servidor
node sync-ad-emails.js
```

El script:
1. Busca todos los usuarios en Active Directory
2. Obtiene el email del campo `mail` de AD
3. Actualiza los emails en la base de datos si hay diferencias

**Prioridad de campos de email en AD:**
1. `mail` - Campo principal de correo electrónico
2. `userPrincipalName` - Si mail no está disponible
3. `{username}@prexxa.local` - Fallback por defecto

## Notificaciones por Correo Electrónico

El sistema envía notificaciones automáticas por correo en los siguientes casos:

### 1. Asignación de Firmante
- **Cuándo**: Al asignar un usuario como firmante de un documento
- **A quién**: Cada firmante asignado
- **Contenido**: Link al documento, nombre del solicitante

### 2. Documento Completado
- **Cuándo**: Cuando se completan todas las firmas requeridas
- **A quién**: Creador del documento + todos los firmantes
- **Contenido**: Link de descarga del documento firmado

### 3. Documento Rechazado
- **Cuándo**: Cuando un firmante rechaza el documento
- **A quién**: Creador + otros firmantes
- **Contenido**: Motivo del rechazo, quién rechazó

### Configuración SMTP

Las credenciales SMTP se configuran en el archivo `.env`:

```env
SMTP_HOST=mail.prexxa.com.co
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=_mainaccount@prexxa.com.co
SMTP_PASS=YccX196U3Md()n*
SMTP_FROM_NAME=DocuPrex
SMTP_FROM_EMAIL=e.zuluaga@prexxa.com.co
```

## Scripts de Utilidad

- `sync-ad-emails.js` - Sincroniza emails desde Active Directory
- `database/init.js` - Inicializa el esquema de la base de datos

## Próximos pasos

- [x] Integrar resolvers con base de datos PostgreSQL
- [x] Crear esquema de tablas (migrations)
- [x] Integrar autenticación con Active Directory
- [x] Implementar sistema de notificaciones por email
- [ ] Agregar validaciones de entrada mejoradas
- [ ] Implementar paginación
- [ ] Agregar tests unitarios
- [ ] Agregar logging mejorado