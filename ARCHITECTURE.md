# 🏗️ Arquitectura de DocuPrex

Documentación de la arquitectura profesional implementada en la Fase 5 de refactorización.

## 📋 Tabla de Contenidos

- [Visión General](#visión-general)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [Frontend](#frontend)
- [Backend](#backend)
- [Flujo de Datos](#flujo-de-datos)
- [Mejores Prácticas](#mejores-prácticas)

---

## 🎯 Visión General

DocuPrex es una aplicación de firmas electrónicas construida con una arquitectura moderna y escalable:

- **Frontend**: React 19 + Vite + Context API
- **Backend**: Node.js + Express + Apollo GraphQL
- **Base de Datos**: PostgreSQL 14
- **Autenticación**: LDAP/Active Directory + JWT
- **Email**: Nodemailer con plantillas HTML
- **PDF**: pdf-lib para generación de documentos

### Principios de Arquitectura

✅ **Separación de Responsabilidades** - Cada módulo tiene una única responsabilidad
✅ **Modularidad** - Código organizado en módulos reutilizables
✅ **Escalabilidad** - Fácil agregar nuevas funcionalidades
✅ **Mantenibilidad** - Código limpio y bien documentado
✅ **Profesionalismo** - Mejores prácticas de la industria

---

## 📁 Estructura del Proyecto

```
DocuPrex/
├── frontend/              # Aplicación React
│   ├── src/
│   │   ├── api/          # Cliente GraphQL centralizado
│   │   ├── components/   # Componentes React
│   │   ├── context/      # Context API (estado global)
│   │   ├── hooks/        # Hooks personalizados
│   │   └── utils/        # Utilidades (validators, formatters, helpers)
│   └── ...
├── server/                # Backend Node.js
│   ├── config/           # Configuración centralizada
│   ├── database/         # Schema y queries SQL
│   ├── graphql/          # Schema y resolvers GraphQL
│   ├── services/         # Servicios (LDAP, Email, etc)
│   ├── templates/        # Plantillas HTML de email
│   ├── utils/            # Utilidades (PDF, uploads)
│   └── ...
└── bd/                    # Datos de PostgreSQL
```

---

## 💻 Frontend

### Arquitectura Frontend

```
frontend/src/
├── api/                           # Cliente GraphQL
│   ├── client.js                  # Cliente GraphQL singleton
│   ├── queries/                   # Queries por dominio
│   │   ├── documents.js
│   │   ├── users.js
│   │   └── notifications.js
│   └── mutations/                 # Mutations por dominio
│       ├── auth.js
│       ├── documents.js
│       └── notifications.js
│
├── context/                       # Estado Global (Context API)
│   ├── AuthContext.jsx           # Autenticación
│   ├── DocumentContext.jsx       # Documentos
│   └── NotificationContext.jsx   # Notificaciones
│
├── hooks/                         # Hooks Personalizados
│   ├── useAuth.js                # Hook de autenticación
│   ├── useDocuments.js           # Hook de documentos
│   ├── useNotifications.js       # Hook de notificaciones
│   ├── useSigners.js             # Hook de firmantes
│   └── useFileUpload.js          # Hook de subida de archivos
│
├── utils/                         # Utilidades
│   ├── constants.js              # 250+ constantes
│   ├── validators.js             # 20+ validadores
│   ├── formatters.js             # 30+ formateadores
│   └── helpers.js                # 50+ helpers
│
└── components/                    # Componentes React
    ├── login/
    └── dashboard/
```

### Sistema de Estado (Context API)

#### AuthContext
Maneja toda la lógica de autenticación:
- Login/Logout
- Manejo de JWT
- Persistencia en localStorage
- Validación de roles

#### DocumentContext
Maneja documentos y operaciones:
- Fetch de documentos (pending, signed, rejected, etc)
- Firma y rechazo de documentos
- Asignación de firmantes
- Tipos de documentos

#### NotificationContext
Maneja notificaciones in-app:
- Polling automático (cada 30s)
- Notificaciones toast
- Mark as read/unread
- Conteo de no leídas

### Hooks Personalizados

```javascript
// Ejemplo de uso
import { useAuth, useDocuments, useNotifications } from './hooks';

function MyComponent() {
  const { user, login, logout } = useAuth();
  const { pendingDocuments, fetchPendingDocuments } = useDocuments();
  const { showSuccess, showError } = useNotifications();

  // ... lógica del componente
}
```

### Cliente GraphQL

```javascript
// Uso del cliente
import { graphqlClient, queries } from './api';

// Query
const data = await graphqlClient.query(queries.GET_PENDING_DOCUMENTS);

// Mutation
const result = await graphqlClient.mutate(mutations.SIGN_DOCUMENT, {
  documentId,
  consecutivo
});
```

---

## 🖥️ Backend

### Arquitectura Backend

```
server/
├── config/                        # Configuración Centralizada
│   ├── database.js               # PostgreSQL config + pool
│   ├── server.js                 # Express config
│   ├── ldap.js                   # LDAP/AD config
│   ├── email.js                  # Email/SMTP config
│   └── index.js                  # Exportación + validación
│
├── database/
│   ├── queries/                  # Queries SQL Organizadas
│   │   ├── users.queries.js      # 18 queries de usuarios
│   │   ├── documents.queries.js  # 19 queries de documentos
│   │   ├── signatures.queries.js # 22 queries de firmas
│   │   ├── notifications.queries.js # 13 queries
│   │   ├── documentTypes.queries.js # 14 queries
│   │   ├── audit.queries.js      # 12 queries
│   │   └── index.js              # Exportación centralizada
│   ├── schema.sql                # Schema de BD
│   └── migrations/               # Migraciones
│
├── graphql/
│   ├── schema.js                 # GraphQL Schema
│   ├── resolvers-db.js           # Resolvers principales
│   └── index.js
│
├── services/                      # Servicios de Negocio
│   ├── ldap.js                   # Autenticación LDAP/AD
│   ├── emailService.js           # Envío de emails
│   └── notificationCleanup.js    # Limpieza automática
│
├── templates/                     # Plantillas Separadas
│   └── email/
│       ├── signer-assigned.html
│       ├── document-signed.html
│       ├── document-rejected.html
│       └── templateRenderer.js
│
├── utils/
│   ├── pdf/                       # Utilidades PDF Modularizadas
│   │   ├── constants.js          # Constantes (colores, tamaños)
│   │   ├── helpers.js            # 15+ helpers
│   │   ├── renderer.js           # Funciones de renderizado
│   │   └── index.js              # Exportación
│   ├── pdfCoverPage.js           # (Original, aún en uso)
│   └── fileUpload.js             # Config de Multer
│
└── routes/
    └── upload.js                  # Rutas REST de upload
```

### Configuración Centralizada

```javascript
// Uso de configuración
const { server, database, ldap, email } = require('./config');

console.log(`Server running on port ${server.port}`);
console.log(`Database: ${database.dbConfig.database}`);

if (ldap.isEnabled()) {
  console.log(`LDAP enabled: ${ldap.getUrl()}`);
}

if (email.isEnabled()) {
  console.log(`Email enabled: ${email.getFromString()}`);
}
```

### Queries SQL Centralizadas

Antes (queries dispersas en resolvers):
```javascript
const result = await query(`
  SELECT * FROM users WHERE id = $1
`, [userId]);
```

Después (queries organizadas por dominio):
```javascript
const queries = require('./database/queries');

// Uso simple
const result = await query(queries.users.getUserById, [userId]);

// Todas las queries están tipadas y documentadas
const docs = await query(queries.documents.getPendingDocumentsForUser, [userId]);
const sigs = await query(queries.signatures.getSignaturesByDocument, [docId]);
```

#### Beneficios:
- ✅ Queries complejas encapsuladas
- ✅ Fácil testing y mantenimiento
- ✅ Reutilización de queries
- ✅ Queries SQL en un solo lugar
- ✅ Cambios en BD centralizados

### Modularización de PDF

Antes (pdfCoverPage.js - 717 líneas monolíticas):
```javascript
// Todo mezclado en un archivo enorme
```

Después (modularizado):
```javascript
const { constants, helpers, renderer } = require('./utils/pdf');

// Constantes centralizadas
const { COLORS, FONT_SIZES, LABELS } = constants;

// Helpers reutilizables
const status = helpers.getDocumentStatus(signers);
const statusColor = helpers.getStatusColor(status);
const formattedDate = helpers.formatDate(new Date());

// Renderizado componentizado
renderer.drawWatermark(page, status, font, status);
renderer.drawTitle(page, fontBold, yPosition);
renderer.drawDocumentInfo(page, documentInfo, fontBold, fontRegular, yPosition);
```

### Plantillas de Email

Antes (HTML embebido en código - 565 líneas):
```javascript
const html = `<!DOCTYPE html>... 300 líneas de HTML aquí ...`;
```

Después (plantillas separadas + renderizador):
```javascript
const { renderSignerAssignedTemplate } = require('./templates/email/templateRenderer');

const html = await renderSignerAssignedTemplate({
  nombreFirmante: 'Juan Pérez',
  nombreDocumento: 'Contrato.pdf',
  documentoUrl: 'http://...',
  creadorDocumento: 'María García'
});
```

#### Beneficios:
- ✅ HTML separado del código
- ✅ Fácil edición de diseños
- ✅ Sistema de placeholders {{variable}}
- ✅ Reutilización de plantillas

---

## 🔄 Flujo de Datos

### 1. Autenticación

```
Usuario → Login Component
  ↓
AuthContext.login()
  ↓
GraphQL Mutation (LOGIN)
  ↓
JWT Token + User Data
  ↓
localStorage + Context State
  ↓
Protected Routes Accessible
```

### 2. Subir Documento

```
Usuario → Upload Component
  ↓
useFileUpload Hook
  ↓
REST API /api/upload
  ↓
Multer → Filesystem
  ↓
Database (INSERT documento)
  ↓
Response con documentId
  ↓
Asignar Firmantes (GraphQL)
  ↓
Email Notifications
```

### 3. Firmar Documento

```
Usuario → Pending Documents Tab
  ↓
DocumentContext.fetchPendingDocuments()
  ↓
GraphQL Query (pendingDocuments)
  ↓
Validación de orden de firma
  ↓
useDocuments.signDocument(id, consecutivo)
  ↓
GraphQL Mutation (signDocument)
  ↓
Update DB + PDF Cover Page
  ↓
Email Notification
  ↓
Refresh Document Lists
```

---

## 🎯 Mejores Prácticas

### Frontend

#### 1. Uso de Context API en lugar de Props Drilling
❌ **Antes:**
```javascript
<Dashboard user={user} onLogout={onLogout} />
  <Sidebar user={user} />
    <UserProfile user={user} />
```

✅ **Después:**
```javascript
<AuthProvider>
  <Dashboard />
    <Sidebar />
      <UserProfile />  {/* useAuth() internamente */}
</AuthProvider>
```

#### 2. Custom Hooks para lógica reutilizable
❌ **Antes:**
```javascript
const [loading, setLoading] = useState(false);
const [documents, setDocuments] = useState([]);
// ... 50 líneas de lógica duplicada
```

✅ **Después:**
```javascript
const { documents, loading, fetchDocuments } = useDocuments();
```

#### 3. Validación centralizada
❌ **Antes:**
```javascript
if (!file || file.size > 50000000 || file.type !== 'application/pdf') {
  // validación duplicada en múltiples lugares
}
```

✅ **Después:**
```javascript
import { validateFile } from './utils/validators';

const validation = validateFile(file);
if (!validation.valid) {
  showError(validation.error);
}
```

### Backend

#### 1. Queries SQL centralizadas
❌ **Antes:**
```javascript
// Resolver 1
const result = await query('SELECT * FROM users WHERE id = $1', [id]);

// Resolver 2
const result = await query('SELECT * FROM users WHERE id = $1', [id]);
// Query duplicada!
```

✅ **Después:**
```javascript
const queries = require('./database/queries');

// Ambos resolvers usan la misma query
const result = await query(queries.users.getUserById, [id]);
```

#### 2. Configuración centralizada
❌ **Antes:**
```javascript
// Hardcoded en múltiples archivos
const port = 5001;
const dbHost = 'postgres-db';
const jwtSecret = 'secret';
```

✅ **Después:**
```javascript
const { server, database } = require('./config');

const port = server.port;
const dbHost = database.dbConfig.host;
const jwtSecret = server.jwtSecret;
```

#### 3. Plantillas separadas
❌ **Antes:**
```javascript
const html = `<html><body>... 300 líneas ...</body></html>`;
```

✅ **Después:**
```javascript
const html = await renderTemplate('signer-assigned', data);
```

---

## 📊 Métricas de Mejora

### Antes de la Refactorización

| Archivo | Líneas | Problema |
|---------|--------|----------|
| Dashboard.jsx | 6,317 | Componente monolítico |
| resolvers-db.js | 2,289 | Todos los resolvers juntos |
| pdfCoverPage.js | 717 | Lógica PDF sin modularizar |
| emailService.js | 565 | HTML embebido en código |

**Total**: ~9,888 líneas en 4 archivos problemáticos

### Después de la Refactorización

| Categoría | Archivos | Líneas Totales |
|-----------|----------|----------------|
| Frontend Utils | 4 | ~2,000 |
| Frontend Context | 3 | ~600 |
| Frontend Hooks | 5 | ~400 |
| Frontend API | 10 | ~800 |
| Backend Config | 5 | ~400 |
| Backend Queries | 7 | ~1,500 |
| Backend PDF Utils | 4 | ~600 |
| Backend Templates | 4 | ~500 |

**Total**: 42 archivos modulares organizados

### Beneficios Cuantificables

- ✅ **+42 archivos** bien organizados vs 4 archivos monolíticos
- ✅ **Promedio de líneas por archivo**: ~150 vs ~2,000
- ✅ **Queries centralizadas**: 100+ queries en 7 archivos
- ✅ **Código reutilizable**: 50+ helpers, 20+ validadores, 30+ formatters
- ✅ **Mantenibilidad**: Cambios localizados en archivos específicos

---

## 🚀 Próximos Pasos

### Refactorización Pendiente

1. **Refactorizar Dashboard.jsx** (6,317 líneas)
   - Dividir en ~20 componentes pequeños
   - Usar Context API + Hooks
   - Tabs component
   - Modals component
   - Upload component

2. **Refactorizar resolvers-db.js** (2,289 líneas)
   - Usar queries centralizadas
   - Dividir en resolvers por dominio
   - Crear capa de servicios

3. **Agregar Testing**
   - Tests unitarios (hooks, helpers, validators)
   - Tests de integración (API, BD)
   - Tests E2E (Playwright)

4. **TypeScript** (Opcional)
   - Migrar progresivamente a TypeScript
   - Tipado fuerte para mejor DX

---

## 📝 Guía de Contribución

### Agregar una Nueva Feature

1. **Frontend**:
   - Crear componentes en `components/`
   - Agregar queries/mutations en `api/`
   - Crear hooks si es necesario en `hooks/`
   - Actualizar Context si afecta estado global

2. **Backend**:
   - Agregar queries SQL en `database/queries/`
   - Crear resolvers en `graphql/resolvers/`
   - Agregar servicios en `services/` si es lógica de negocio
   - Actualizar schema GraphQL si es necesario

### Convenciones de Código

- **Nombres de archivos**: camelCase.js (utils), PascalCase.jsx (components)
- **Funciones**: camelCase
- **Constantes**: UPPER_CASE
- **Componentes**: PascalCase
- **Hooks**: useCamelCase
- **Context**: PascalCase + Context suffix

---

## 🙏 Créditos

Refactorización profesional implementada en la Fase 5.

**Arquitectura**: Nivel profesional para producción
**Mejores Prácticas**: Siguiendo estándares de la industria
**Escalabilidad**: Preparado para crecer

---

*Última actualización: 15 de Noviembre, 2025*
