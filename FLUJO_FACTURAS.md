# Flujo Completo de Legalización de Facturas

## Descripción General

Este documento describe el flujo completo para la gestión de legalizaciones de facturas en DocuPrex, incluyendo:
- Búsqueda y validación de facturas
- Generación automática de firmantes
- Manejo de estados en la base de datos externa
- Lógica de firmas y causación

---

## 1. Estructura de Datos

### Tabla T_Facturas (SERV_QPREX.crud_facturas)

Columnas de estado agregadas:
- `en_proceso` (BOOLEAN) - Indica que hay un documento activo con esta factura
- `finalizado` (BOOLEAN) - Indica que el documento fue completamente firmado
- `causado` (BOOLEAN) - Indica que el grupo de causación ya firmó

### Roles de Firmantes

| Rol                    | Descripción                                      |
|------------------------|--------------------------------------------------|
| `Negociador`           | Persona que negoció la factura                   |
| `Resp Cta Cont`        | Responsable de Cuenta Contable                   |
| `Resp Ctro Cost`       | Responsable de Centro de Costos                  |
| `Negociaciones`        | Usuario especial NEGOCIACIONES (de T_Personas)   |
| `Causación Financiera` | Grupo de causación financiera (varios miembros)  |
| `Causación Logística`  | Grupo de causación logística (varios miembros)   |

---

## 2. Endpoints del Backend

### Búsqueda de Facturas

```http
GET /api/facturas/search/:numeroControl
```

**Validaciones:**
- ✅ Retorna la factura si NO está en proceso ni finalizada
- ❌ Retorna 409 si `en_proceso = true`
- ❌ Retorna 409 si `finalizado = true`

### Gestión de Estados

```http
POST /api/facturas/marcar-en-proceso/:numeroControl
```
Marca `en_proceso = TRUE` cuando se **crea** un documento

```http
POST /api/facturas/desmarcar-en-proceso/:numeroControl
```
Marca `en_proceso = FALSE, causado = FALSE, finalizado = FALSE` cuando:
- Se **elimina** un documento
- Se **rechaza** un documento

```http
POST /api/facturas/marcar-causado/:numeroControl
```
Marca `causado = TRUE` cuando el grupo de causación firma

```http
POST /api/facturas/marcar-finalizado/:numeroControl
```
Marca `en_proceso = FALSE, finalizado = TRUE` cuando todos los firmantes firman

### Obtención de Firmantes Especiales

```http
GET /api/facturas/usuario-negociaciones
```
Retorna el usuario NEGOCIACIONES de T_Personas

```http
GET /api/facturas/grupos-causacion/:grupo
```
Parámetro: `financiera` o `logistica`
Retorna todos los miembros del grupo de causación

---

## 3. Flujo en el Frontend

### 3.1 Búsqueda de Factura

**Archivo:** `FacturaSearch.jsx`

1. Usuario ingresa consecutivo
2. Se llama a `GET /api/facturas/search/:numeroControl`
3. Si retorna 409:
   - Mostrar mensaje de error (factura en proceso o finalizada)
   - No permitir selección
4. Si retorna 200:
   - Mostrar factura en la lista
   - Permitir abrir la plantilla

### 3.2 Llenado de Plantilla

**Archivo:** `FacturaTemplate.jsx`

Usuario completa:
- Checklist de revisión
- Negociador (con autocompletado desde T_Negociadores)
- Tabla de control de firmas (Cuentas Contables y Centros de Costos)
- Grupo de causación (Financiera o Logística)

Al hacer clic en **"Guardar y Continuar"**:

```javascript
const handleSave = async () => {
  // 1. Validar formulario
  const errores = validarFormulario();
  if (errores.length > 0) {
    // Mostrar errores
    return;
  }

  // 2. Generar lista de firmantes automáticamente
  const firmantes = [];

  // Agregar Negociador
  firmantes.push({
    name: nombreNegociador,
    role: 'Negociador',
    cargo: cargoNegociador,
    email: null
  });

  // Agregar Responsables de Cuentas y Centros de Costos
  filasControl.forEach((fila) => {
    // Resp Cta Cont
    firmantes.push({
      name: fila.respCuentaContable,
      role: 'Resp Cta Cont',
      cargo: fila.cargoCuentaContable,
      email: null
    });

    // Resp Ctro Cost
    firmantes.push({
      name: fila.respCentroCostos,
      role: 'Resp Ctro Cost',
      cargo: fila.cargoCentroCostos,
      email: null
    });
  });

  // Agregar NEGOCIACIONES
  const negociacionesResponse = await fetch('/api/facturas/usuario-negociaciones');
  const negociacionesData = await negociacionesResponse.json();
  firmantes.push({
    name: negociacionesData.data.nombre,
    role: 'Negociaciones',
    cargo: negociacionesData.data.cargo,
    email: negociacionesData.data.email
  });

  // Agregar Grupo de Causación
  const causacionResponse = await fetch(`/api/facturas/grupos-causacion/${grupoCausacion}`);
  const causacionData = await causacionResponse.json();
  causacionData.data.forEach((miembro) => {
    firmantes.push({
      name: miembro.nombre,
      role: grupoCausacion === 'financiera' ? 'Causación Financiera' : 'Causación Logística',
      cargo: miembro.cargo,
      email: miembro.email
    });
  });

  // 3. Llamar a onSave con datos de plantilla + firmantes
  onSave({
    consecutivo,
    proveedor,
    numeroFactura,
    fechaFactura,
    fechaRecepcion,
    legalizaAnticipo,
    checklistRevision,
    nombreNegociador,
    cargoNegociador,
    grupoCausacion,
    filasControl,
    firmantes // ← Lista generada automáticamente
  });
};
```

### 3.3 Creación de Documento en Dashboard

**Archivo:** `Dashboard.jsx`

Cuando se crea el documento (después de que el usuario sube el PDF y confirma):

```javascript
const handleCreateDocument = async () => {
  try {
    // 1. Crear el documento con firmantes generados
    const response = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: documentTitle,
        description: documentDescription,
        file_path: uploadedFilePath,
        signers: facturaData.firmantes, // ← Firmantes generados en plantilla
        document_type: 'FV',
        metadata: {
          consecutivo: facturaData.consecutivo,
          proveedor: facturaData.proveedor,
          numeroFactura: facturaData.numeroFactura,
          // ... otros datos de la plantilla
        }
      })
    });

    const result = await response.json();

    // 2. Marcar factura como en proceso
    if (result.success) {
      await fetch(`/api/facturas/marcar-en-proceso/${facturaData.consecutivo}`, {
        method: 'POST'
      });

      console.log(`✅ Factura ${facturaData.consecutivo} marcada como en proceso`);
    }
  } catch (error) {
    console.error('Error creando documento:', error);
  }
};
```

### 3.4 Eliminación de Documento

```javascript
const handleDeleteDocument = async (docId, documentMetadata) => {
  try {
    // 1. Eliminar documento
    const response = await fetch(`/api/documents/${docId}`, {
      method: 'DELETE'
    });

    // 2. Si el documento era de tipo FV, desmarcar factura
    if (response.ok && documentMetadata?.consecutivo) {
      await fetch(`/api/facturas/desmarcar-en-proceso/${documentMetadata.consecutivo}`, {
        method: 'POST'
      });

      console.log(`✅ Factura ${documentMetadata.consecutivo} desmarcada de en_proceso`);
    }
  } catch (error) {
    console.error('Error eliminando documento:', error);
  }
};
```

### 3.5 Rechazo de Documento

```javascript
const handleRejectDocument = async (docId, reason, documentMetadata) => {
  try {
    // 1. Rechazar documento
    const response = await fetch(`/api/documents/${docId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });

    // 2. Si el documento era de tipo FV, desmarcar factura
    if (response.ok && documentMetadata?.consecutivo) {
      await fetch(`/api/facturas/desmarcar-en-proceso/${documentMetadata.consecutivo}`, {
        method: 'POST'
      });

      console.log(`✅ Factura ${documentMetadata.consecutivo} desmarcada por rechazo`);
    }
  } catch (error) {
    console.error('Error rechazando documento:', error);
  }
};
```

### 3.6 Firma de Documento

```javascript
const handleSignDocument = async (docId, signerInfo, documentMetadata) => {
  try {
    // 1. Firmar documento
    const response = await fetch(`/api/documents/${docId}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signerInfo })
    });

    const result = await response.json();

    // 2. Si el firmante es del grupo de Causación, marcar como causado
    if (signerInfo.role === 'Causación Financiera' || signerInfo.role === 'Causación Logística') {
      if (documentMetadata?.consecutivo) {
        await fetch(`/api/facturas/marcar-causado/${documentMetadata.consecutivo}`, {
          method: 'POST'
        });

        console.log(`✅ Factura ${documentMetadata.consecutivo} marcada como causada`);
      }
    }

    // 3. Si todos firmaron, marcar como finalizado
    if (result.allSigned && documentMetadata?.consecutivo) {
      await fetch(`/api/facturas/marcar-finalizado/${documentMetadata.consecutivo}`, {
        method: 'POST'
      });

      console.log(`✅ Factura ${documentMetadata.consecutivo} marcada como finalizada`);
    }
  } catch (error) {
    console.error('Error firmando documento:', error);
  }
};
```

---

## 4. Lógica de Roles y Firmas

### 4.1 Orden de Firmantes

Los firmantes se agregan en este orden:

1. **Negociador** - Persona que negoció (1 firmante)
2. **Resp Cta Cont** - Responsables de cuentas contables (1 por fila)
3. **Resp Ctro Cost** - Responsables de centros de costos (1 por fila)
4. **Negociaciones** - Usuario especial (1 firmante)
5. **Causación** - Grupo completo (N firmantes del grupo seleccionado)

### 4.2 Display del Rol "Causación"

**ANTES de que el grupo firme:**
- Se muestra: `"Causación Financiera"` o `"Causación Logística"`
- Cada miembro del grupo aparece con este rol

**DESPUÉS de que el grupo firme:**
- Se muestra: `"Causación"`
- El nombre del firmante específico que firmó

### 4.3 Validación de Firmantes Únicos

El sistema evita duplicados usando esta lógica:

```javascript
const firmantesUnicos = new Set();

const agregarFirmante = (nombre, rol, cargo, email) => {
  const key = `${nombre}-${rol}`;
  if (!firmantesUnicos.has(key) && nombre && nombre.trim()) {
    firmantesUnicos.add(key);
    firmantes.push({ name: nombre, role: rol, cargo, email });
  }
};
```

---

## 5. Estados de la Factura

| Estado           | Condición                                           | Permite crear doc |
|------------------|-----------------------------------------------------|-------------------|
| Normal           | `en_proceso=false`, `finalizado=false`              | ✅ SÍ             |
| En Proceso       | `en_proceso=true`, `finalizado=false`               | ❌ NO             |
| Causado          | `en_proceso=true`, `causado=true`, `finalizado=false` | ❌ NO           |
| Finalizado       | `en_proceso=false`, `finalizado=true`               | ❌ NO             |

---

## 6. Casos de Uso Completos

### Caso 1: Crear y Firmar un Documento Exitosamente

1. Usuario busca factura `24806` → Estado: Normal ✅
2. Usuario llena plantilla y guarda → Genera 15 firmantes automáticamente
3. Sistema crea documento → Llama a `marcar-en-proceso` → `en_proceso=true`
4. Firmantes van firmando uno por uno
5. Miembro del grupo de Causación firma → Llama a `marcar-causado` → `causado=true`
6. Último firmante firma → Llama a `marcar-finalizado` → `en_proceso=false`, `finalizado=true`
7. Factura `24806` ya no se puede usar para crear más documentos

### Caso 2: Documento Rechazado

1. Usuario busca factura `24807` → Estado: Normal ✅
2. Usuario crea documento → `en_proceso=true`
3. Algún firmante rechaza el documento → Llama a `desmarcar-en-proceso`
4. Factura vuelve a estado Normal → `en_proceso=false`, `causado=false`, `finalizado=false`
5. Se puede crear un nuevo documento con esta factura

### Caso 3: Documento Eliminado

1. Usuario busca factura `24808` → Estado: Normal ✅
2. Usuario crea documento → `en_proceso=true`
3. Usuario elimina el documento → Llama a `desmarcar-en-proceso`
4. Factura vuelve a estado Normal → `en_proceso=false`, `causado=false`, `finalizado=false`
5. Se puede crear un nuevo documento con esta factura

---

## 7. Puntos de Integración en Dashboard.jsx

### Ubicación de los Cambios

```javascript
// 1. Al crear documento (después de subir PDF)
const handleSubmitDocument = async () => {
  // ... código existente para crear documento ...

  // AGREGAR: Marcar factura en proceso si es tipo FV
  if (selectedDocumentType?.code === 'FV' && facturaTemplateData?.consecutivo) {
    await fetch(`${BACKEND_HOST}/api/facturas/marcar-en-proceso/${facturaTemplateData.consecutivo}`, {
      method: 'POST'
    });
  }
};

// 2. Al eliminar documento
const handleDeleteDocument = async (docId) => {
  const doc = documents.find(d => d.id === docId);

  // ... código existente para eliminar ...

  // AGREGAR: Desmarcar factura si es tipo FV
  if (doc?.document_type === 'FV' && doc?.metadata?.consecutivo) {
    await fetch(`${BACKEND_HOST}/api/facturas/desmarcar-en-proceso/${doc.metadata.consecutivo}`, {
      method: 'POST'
    });
  }
};

// 3. Al rechazar documento (en el flujo de firma)
const handleReject = async (docId, reason) => {
  const doc = documents.find(d => d.id === docId);

  // ... código existente para rechazar ...

  // AGREGAR: Desmarcar factura si es tipo FV
  if (doc?.document_type === 'FV' && doc?.metadata?.consecutivo) {
    await fetch(`${BACKEND_HOST}/api/facturas/desmarcar-en-proceso/${doc.metadata.consecutivo}`, {
      method: 'POST'
    });
  }
};

// 4. Al firmar documento
const handleSign = async (docId) => {
  const doc = documents.find(d => d.id === docId);
  const currentUser = getCurrentUser(); // Obtener usuario actual

  // ... código existente para firmar ...

  // AGREGAR: Si el firmante es del grupo de Causación
  if (currentUser.role === 'Causación Financiera' || currentUser.role === 'Causación Logística') {
    if (doc?.metadata?.consecutivo) {
      await fetch(`${BACKEND_HOST}/api/facturas/marcar-causado/${doc.metadata.consecutivo}`, {
        method: 'POST'
      });
    }
  }

  // AGREGAR: Si todos firmaron
  const signatureStatus = await checkAllSigned(docId);
  if (signatureStatus.allSigned && doc?.metadata?.consecutivo) {
    await fetch(`${BACKEND_HOST}/api/facturas/marcar-finalizado/${doc.metadata.consecutivo}`, {
      method: 'POST'
    });
  }
};
```

---

## 8. Estructura de Metadata del Documento

Al crear un documento de tipo FV, se debe guardar esta metadata:

```javascript
{
  document_type: 'FV',
  metadata: {
    // Datos básicos de la factura
    consecutivo: '24806',
    proveedor: 'LONDOÑO SERNA JOHN JAIRO',
    numeroFactura: '000000034',
    fechaFactura: '2025-12-09',
    fechaRecepcion: '2025-12-10',
    legalizaAnticipo: false,

    // Checklist de revisión
    checklistRevision: {
      fechaEmision: true,
      fechaVencimiento: true,
      cantidades: true,
      precioUnitario: true,
      fletes: true,
      valoresTotales: true,
      descuentosTotales: true
    },

    // Negociador
    nombreNegociador: 'Juan Pérez',
    cargoNegociador: 'Gerente de Compras',

    // Grupo de causación seleccionado
    grupoCausacion: 'financiera', // o 'logistica'

    // Control de firmas (para referencia)
    filasControl: [
      {
        noCuentaContable: '1105',
        respCuentaContable: 'María González',
        cargoCuentaContable: 'Contador',
        nombreCuentaContable: 'Caja General',
        centroCostos: 'ADM001',
        respCentroCostos: 'Carlos Ruiz',
        cargoCentroCostos: 'Director Administrativo',
        porcentaje: '100'
      }
    ]
  }
}
```

---

## 9. Testing

### Escenarios de Prueba

1. ✅ Buscar factura normal → Debe permitir crear documento
2. ✅ Buscar factura en proceso → Debe mostrar error 409
3. ✅ Buscar factura finalizada → Debe mostrar error 409
4. ✅ Crear documento → Debe marcar factura en proceso
5. ✅ Eliminar documento → Debe desmarcar factura
6. ✅ Rechazar documento → Debe desmarcar factura
7. ✅ Grupo causación firma → Debe marcar como causado
8. ✅ Todos firman → Debe marcar como finalizado
9. ✅ Verificar que no se permiten duplicados de firmantes
10. ✅ Verificar que NEGOCIACIONES siempre se agrega
11. ✅ Verificar que grupo de causación se agrega completo

---

## 10. Troubleshooting

### Problema: Factura no se desmarca al eliminar documento

**Solución:** Verificar que el metadata del documento contenga el `consecutivo` y que se esté llamando correctamente al endpoint `desmarcar-en-proceso`.

### Problema: Firmantes duplicados en la lista

**Solución:** Verificar que la función `agregarFirmante` esté usando el Set correctamente para evitar duplicados.

### Problema: No se encuentra usuario NEGOCIACIONES

**Solución:** Verificar que en la tabla `T_Personas` exista un registro con nombre exactamente "NEGOCIACIONES" (mayúsculas).

### Problema: Grupo de causación vacío

**Solución:** Verificar que en `T_Personas` existan registros con el campo `grupo` = "CAUSACION FINANCIERA" o "CAUSACION LOGISTICA" (exactamente en mayúsculas).

---

## Resumen

Este flujo asegura que:
- ✅ No se pueden crear documentos duplicados de una misma factura
- ✅ Los firmantes se generan automáticamente según la plantilla
- ✅ El estado de la factura se actualiza correctamente en cada etapa
- ✅ Se puede reintentar crear un documento si fue rechazado o eliminado
- ✅ Una vez finalizado, la factura queda bloqueada permanentemente
