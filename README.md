# Docuprex - Sistema de Gestión de Documentos con Firmas Digitales

## 📋 Descripción General

Sistema de gestión documental con flujo de firmas digitales secuenciales. Permite la creación, distribución y firma de documentos con múltiples firmantes en orden específico.

---

## 🗂️ TIPOS DE DOCUMENTOS (SOLO 3)

El sistema maneja **EXACTAMENTE 3 tipos de documentos**. No existen otros tipos.

### 1. **Documentos sin tipo específico**
- **Identificación:** `document_type_id = NULL`
- **Uso:** Documentos generales sin flujo predefinido

**Características:**
- ✅ Título libre (campo de texto obligatorio)
- ✅ Descripción opcional
- ✅ Uno o más archivos PDF
- ✅ Firmantes sin roles predefinidos
- ✅ Orden manual de firmantes (drag & drop habilitado)
- ✅ Sin validaciones de roles
- ✅ Sin restricciones de número de firmantes

**Flujo de creación:**
1. Subir PDF(s)
2. Asignar título y descripción
3. Seleccionar firmantes en orden deseado
4. Enviar

---

### 2. **FV - Factura de Venta (Legalización de Facturas)**
- **Identificación:** `document_type_code = 'FV'`
- **Uso:** Legalización de facturas con plantilla de datos

**Características:**
- ✅ **Plantilla de factura OBLIGATORIA** (datos estructurados)
- ✅ Título generado automáticamente (no editable)
- ✅ Firmantes extraídos automáticamente de la plantilla
- ✅ **Roles múltiples por firmante** (hasta 3 roles simultáneos)
- ✅ **Roles exclusivos:** Negociador, Área Financiera, Causación
- ✅ **Grupo de Causación** opcional (múltiples usuarios, uno firma)
- ✅ Orden de firmantes **FIJO** según plantilla (no modificable)
- ✅ Drag & drop **DESHABILITADO**
- ✅ Autofirma del Negociador (si el creador es el Negociador)
- ✅ Generación de PDF con datos de plantilla
- ✅ Portada con información de firmantes

**Flujo de creación:**
1. Seleccionar tipo FV
2. Completar plantilla de factura (búsqueda de factura existente)
3. Sistema extrae firmantes automáticamente
4. Sistema genera PDF con plantilla
5. Enviar (autofirma si eres Negociador)

**Reglas especiales FV:**
- El primer firmante DEBE ser el Negociador (rol obligatorio)
- Si el creador es el Negociador → autofirma automática
- Los firmantes y su orden NO pueden ser modificados manualmente
- Mínimo 3 firmantes (Negociador + 2 más)

---

### 3. **SA - Solicitud de Anticipo**
- **Identificación:** `document_type_code = 'SA'`
- **Uso:** Solicitudes de anticipo con flujo de aprobación estructurado

**Características:**
- ✅ Título libre (campo de texto obligatorio)
- ✅ Descripción opcional
- ✅ Uno o más archivos PDF
- ✅ **Wizard paso a paso** (5 pasos) para asignar firmantes
- ✅ **Roles obligatorios:** Solicitante, Aprobador, Tesorería
- ✅ **Roles opcionales:** Negociaciones, Gerencia
- ✅ **Orden FIJO automático** (no modificable)
- ✅ Drag & drop **DESHABILITADO**
- ✅ Mínimo 3 firmantes, máximo 5 firmantes
- ✅ Sin roles duplicados
- ✅ Botón "No aplica" para roles opcionales

**Orden de firmantes SA (OBLIGATORIO):**
```
1. Solicitante    (obligatorio)
2. Aprobador      (obligatorio)
3. Negociaciones  (opcional)
4. Gerencia       (opcional)
5. Tesorería      (obligatorio) ← SIEMPRE último
```

**Flujo de creación (Wizard):**
1. Subir PDF(s)
2. Asignar título y descripción
3. **Paso 1 - Solicitante:**
   - Botón: "Yo voy a firmar (Soy el solicitante)" ← Atajo común
   - O seleccionar otro usuario
4. **Paso 2 - Aprobador:** Seleccionar usuario
5. **Paso 3 - Negociaciones:** Seleccionar usuario o "No aplica"
6. **Paso 4 - Gerencia:** Seleccionar usuario o "No aplica"
7. **Paso 5 - Tesorería:** Seleccionar usuario
8. Enviar

**Reglas especiales SA:**
- Normalmente el creador ES el Solicitante (por eso el botón destacado)
- Tesorería SIEMPRE firma último (incluso si Gerencia no aplica)
- Si eliminas un firmante → wizard se reinicia desde cero
- Los firmantes se ordenan automáticamente según su rol
- No se puede modificar el orden manualmente

---

## 🚨 REGLAS CRÍTICAS PARA MODIFICACIONES

### 1. **Principio de No-Regresión**
> **"DO NO HARM"** - La funcionalidad existente NUNCA debe romperse.

Antes de aplicar CUALQUIER cambio:
- ✅ Verificar que solo afecta al tipo de documento especificado
- ✅ Probar que los otros tipos siguen funcionando igual
- ✅ Confirmar que no se rompen flujos existentes (Login, Firmas, PDF, LDAP, DB)

### 2. **Aislamiento de Tipos de Documentos**
Cada tipo de documento tiene su **lógica aislada**:

```javascript
// ✅ CORRECTO - Lógica específica por tipo
if (selectedDocumentType?.code === 'SA') {
  // Lógica SOLO para SA
} else if (selectedDocumentType?.code === 'FV') {
  // Lógica SOLO para FV
} else {
  // Lógica para documentos sin tipo
}

// ❌ INCORRECTO - Lógica global que afecta a todos
const allDocuments = documents.map(doc => {
  // Esto afecta a TODOS los tipos
});
```

### 3. **Cambios Solicitados por el Usuario**
Cuando el usuario solicita un cambio:
- **Si especifica un tipo:** Aplicar cambio SOLO a ese tipo
- **Si menciona "todos los tipos":** Aplicar a los 3 tipos explícitamente
- **Si no especifica:** PREGUNTAR antes de aplicar

**Ejemplo:**
```
Usuario: "Agrega validación de email para firmantes"
Claude: ¿Esta validación debe aplicarse a:
  1. Solo documentos sin tipo
  2. Solo SA
  3. Solo FV
  4. Todos los tipos
```

### 4. **Verificación de JOIN en SQL**
- **INNER JOIN:** Excluye documentos sin tipo (`document_type_id = NULL`)
- **LEFT JOIN:** Incluye documentos sin tipo
- ⚠️ Usar LEFT JOIN cuando la query debe incluir documentos sin tipo

### 5. **Testing Mental Checklist**
Antes de finalizar un cambio, verificar:
- [ ] ¿Este cambio solo afecta al tipo solicitado?
- [ ] ¿Los otros tipos siguen funcionando?
- [ ] ¿Las validaciones son específicas del tipo?
- [ ] ¿El orden de firmantes respeta las reglas del tipo?
- [ ] ¿Los logs de debugging son claros?

---

## 📂 Estructura de Archivos Clave

### Backend
```
server/
├── graphql/
│   ├── resolvers-db.js      # Resolvers GraphQL (assignSigners, signDocument, etc.)
│   └── schema.js            # Schema GraphQL
├── routes/
│   └── upload.js            # Endpoint upload (create documents)
├── services/
│   └── pdfService.js        # Generación de PDFs (FV, portadas)
└── database/
    └── db.js                # Conexión PostgreSQL
```

### Frontend
```
frontend/src/components/dashboard/
├── Dashboard.jsx            # Componente principal (TODOS los flujos)
├── FacturaTemplate.jsx      # Plantilla FV (búsqueda y formulario)
└── DocumentTypeSelector.jsx # Selector de tipos de documentos
```

### Archivos de Configuración
```
/
├── docker-compose.yml       # Configuración Docker
├── CLAUDE.md               # Estándares de ingeniería
└── README.md               # Este archivo
```

---

## 🔧 Ubicación de Lógica por Tipo

### Documentos sin tipo
- **Backend:** `resolvers-db.js` (lógica genérica, sin validaciones especiales)
- **Frontend:** `Dashboard.jsx` (flujo estándar, drag & drop habilitado)

### FV (Factura de Venta)
- **Backend:**
  - `resolvers-db.js` → Lógica de asignación automática de firmantes desde plantilla
  - `pdfService.js` → Generación de PDF con datos de plantilla
- **Frontend:**
  - `Dashboard.jsx` → Detección de tipo FV
  - `FacturaTemplate.jsx` → Formulario de plantilla
- **Identificación:** `if (doc.document_type_code === 'FV')` o `if (selectedDocumentType?.code === 'FV')`

### SA (Solicitud de Anticipo)
- **Backend:**
  - `resolvers-db.js` → Validación de roles obligatorios (línea ~1390)
- **Frontend:**
  - `Dashboard.jsx` → Wizard paso a paso (línea ~5065)
  - `Dashboard.jsx` → Función `sortSASigners()` (línea ~2191)
  - `Dashboard.jsx` → Estado `saWizardStep` (línea ~163)
- **Identificación:** `if (selectedDocumentType?.code === 'SA')` o `if (isSA)`

---

## 🎯 Funcionalidades Compartidas (TODOS los tipos)

Estas funcionalidades aplican a **LOS 3 TIPOS** por igual:
- ✅ Sistema de firmas digitales secuenciales
- ✅ Notificaciones en tiempo real (WebSockets)
- ✅ Retenciones de documentos (retención parcial por centro de costo)
- ✅ Portada con información de firmantes (generada automáticamente)
- ✅ Backup de PDF original
- ✅ Logs de auditoría
- ✅ Permisos de usuario (admin, usuario normal)
- ✅ Visor de PDF integrado
- ✅ Descarga de documentos
- ✅ Rechazo de documentos

---

## 📝 Convenciones de Código

### Nombres de Variables
```javascript
// Tipos de documentos
const isFVDocument = doc.document_type_code === 'FV';
const isSADocument = selectedDocumentType?.code === 'SA';
const hasNoType = doc.document_type_id === null;

// Estados para cada tipo
const [facturaTemplateData, setFacturaTemplateData] = useState(null); // Solo FV
const [saWizardStep, setSaWizardStep] = useState(0); // Solo SA
```

### Comentarios Importantes
```javascript
// ========== LÓGICA ESPECIAL PARA DOCUMENTOS FV ==========
// ========== LÓGICA ESPECIAL PARA DOCUMENTOS SA ==========
// Para documentos sin tipo: flujo estándar
```

### Logs de Debugging
```javascript
console.log('📄 Documento FV detectado - respetando orden basado en roles');
console.log('🔍 assignSigners: Documento SA - validando roles obligatorios');
console.log('✅ Documento sin tipo - orden manual permitido');
```

---

## ⚠️ Errores Comunes a Evitar

### 1. Asumir que todos los documentos tienen tipo
```javascript
// ❌ INCORRECTO
JOIN document_types dt ON d.document_type_id = dt.id

// ✅ CORRECTO
LEFT JOIN document_types dt ON d.document_type_id = dt.id
```

### 2. Aplicar lógica FV a todos los documentos
```javascript
// ❌ INCORRECTO
const allDocs = documents.map(doc => addCoverPageWithSigners(doc));

// ✅ CORRECTO
if (doc.document_type_code === 'FV') {
  addCoverPageWithSigners(doc);
}
```

### 3. No validar roles opcionales en SA
```javascript
// ❌ INCORRECTO - Requiere los 5 roles
if (selectedSigners.length !== 5) return false;

// ✅ CORRECTO - Mínimo 3 (obligatorios), máximo 5
if (selectedSigners.length < 3 || selectedSigners.length > 5) return false;
```

### 4. Olvidar resetear wizard SA
```javascript
// ❌ INCORRECTO - No resetea wizard al cambiar tipo
setSelectedDocumentType(newType);

// ✅ CORRECTO
setSelectedDocumentType(newType);
setSaWizardStep(0); // Reset wizard SA
```

---

## 📚 Referencias Técnicas

### Base de Datos (PostgreSQL)
```sql
-- Tabla principal
documents (
  id,
  title,
  document_type_id,  -- NULL para sin tipo, FK para FV/SA
  status,            -- 'pending', 'completed', 'rejected'
  uploaded_by,
  metadata           -- JSONB (solo FV tiene datos aquí)
)

-- Tipos de documentos
document_types (
  id,
  code,              -- 'FV', 'SA'
  name
)

-- Firmantes asignados
document_signers (
  document_id,
  user_id,
  order_position,    -- Orden de firma (importante!)
  role_name,         -- Para SA: 'Solicitante', 'Aprobador', etc.
  is_causacion_group -- Solo para FV
)
```

### GraphQL API
```graphql
# Crear documento
mutation CreateDocument($input: DocumentInput!) {
  createDocument(input: $input) {
    id
    title
    status
  }
}

# Asignar firmantes
mutation AssignSigners($documentId: Int!, $signerAssignments: [SignerAssignment!]!) {
  assignSigners(documentId: $documentId, signerAssignments: $signerAssignments)
}

# Firmar documento
mutation SignDocument($documentId: Int!, $signatureData: String!) {
  signDocument(documentId: $documentId, signatureData: $signatureData) {
    id
    status
    signedAt
  }
}
```

---

## 🚀 Workflow de Desarrollo

### Al recibir una solicitud de cambio:

1. **Identificar el tipo de documento afectado**
   - ¿Es para SA, FV, sin tipo, o todos?
   - Si no está claro → PREGUNTAR

2. **Verificar el código existente**
   - Leer la sección correspondiente en `Dashboard.jsx` o `resolvers-db.js`
   - Buscar comentarios `// ========== LÓGICA ESPECIAL PARA...`

3. **Implementar el cambio**
   - Usar condicionales específicos del tipo
   - Agregar logs de debugging
   - Comentar el "por qué" del cambio

4. **Verificar no-regresión**
   - Revisar mentalmente el impacto en otros tipos
   - Confirmar que las validaciones son específicas
   - Verificar JOIN en queries SQL

5. **Reiniciar servicios**
   ```bash
   docker-compose restart server   # Si cambió backend
   docker-compose restart frontend # Si cambió frontend
   ```

6. **Documentar el cambio**
   - Actualizar `PROJECT_STATUS.md` si es necesario
   - Agregar comentarios en el código

---

## 📞 Contacto y Soporte

- **Repositorio:** (Añadir URL del repo)
- **Documentación técnica:** Ver `CLAUDE.md` para estándares de ingeniería
- **Issues:** Reportar en GitHub Issues

---

## 📖 Historial de Cambios Importantes

### 2026-01-09
- ✅ Fix: Documentos sin tipo ahora funcionan correctamente (LEFT JOIN)
- ✅ Implementado: Wizard paso a paso para SA
- ✅ Implementado: Botón "Yo voy a firmar" en paso 1 de SA
- ✅ Corregido: Orden SA - Tesorería SIEMPRE último
- ✅ Documentado: README.md con especificaciones de tipos

---

## 🎓 Para Claude (Asistente IA)

### Reglas de Oro:
1. **SIEMPRE** leer este archivo antes de hacer cambios
2. **NUNCA** asumir que existe un tipo de documento que no esté aquí
3. **SIEMPRE** preguntar si no está claro el tipo afectado
4. **VERIFICAR** que el cambio no rompe otros tipos
5. **USAR** LEFT JOIN para queries que deben incluir documentos sin tipo

### Checklist Mental:
- [ ] ¿Qué tipo de documento estoy modificando?
- [ ] ¿Mis condiciones son específicas del tipo (`if (code === 'SA')`)?
- [ ] ¿Estoy usando LEFT JOIN si incluyo documentos sin tipo?
- [ ] ¿Los otros tipos siguen funcionando después de mi cambio?
- [ ] ¿Actualicé los comentarios en el código?

**Recuerda: Solo existen 3 tipos de documentos. Nada más.**
