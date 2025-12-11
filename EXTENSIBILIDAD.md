# 📘 Guía de Extensibilidad del Sistema

## 🎯 Objetivo

Este documento describe cómo extender el sistema **sin tocar código**. El sistema está diseñado para ser completamente extensible desde la base de datos.

---

## 🏗️ Arquitectura de Extensibilidad

El sistema utiliza un enfoque **data-driven** donde:

- ✅ **Tablas maestras** definen configuraciones (grupos, roles, tipos de documento)
- ✅ **Relaciones CASCADE** mantienen integridad referencial automáticamente
- ✅ **Frontend dinámico** carga configuraciones desde la BD en tiempo real
- ✅ **Backend genérico** resuelve queries sin hardcoding

### Principio Fundamental

> **"Si agregas un registro en la BD, el sistema lo reconoce automáticamente"**

No se requiere modificar código para agregar:
- Nuevos grupos de causación
- Nuevos tipos de documentos
- Nuevos roles por tipo de documento
- Nuevos integrantes de grupos

---

## 📊 Tablas Maestras

### 1. `causacion_grupos` - Grupos de Causación

Define los grupos que pueden realizar causación de facturas.

**Estructura:**
```sql
CREATE TABLE causacion_grupos (
  id SERIAL PRIMARY KEY,
  codigo VARCHAR(50) UNIQUE NOT NULL,      -- Identificador único (ej: 'financiera')
  nombre VARCHAR(255) NOT NULL,            -- Nombre visible (ej: 'Financiera')
  descripcion TEXT,                        -- Descripción del grupo
  role_code VARCHAR(50),                   -- Código del rol asociado (ej: 'CAUSACION_FINANCIERA')
  activo BOOLEAN DEFAULT true,             -- Estado activo/inactivo
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Cómo agregar un nuevo grupo:**

```sql
-- Paso 1: Agregar el grupo
INSERT INTO causacion_grupos (codigo, nombre, descripcion, role_code, activo)
VALUES (
  'comercial',                              -- Código único
  'Comercial',                              -- Nombre visible
  'Grupo de causación del área comercial',  -- Descripción
  'CAUSACION_COMERCIAL',                    -- Código de rol (debe existir en document_type_roles)
  true                                      -- Activo
);

-- Paso 2: Agregar integrantes al grupo (se explica abajo)
```

**✨ Resultado:** El nuevo grupo aparecerá automáticamente en el UI de FacturaTemplate.jsx como una opción seleccionable.

---

### 2. `causacion_integrantes` - Miembros de Grupos

Define qué usuarios pertenecen a cada grupo de causación.

**Estructura:**
```sql
CREATE TABLE causacion_integrantes (
  id SERIAL PRIMARY KEY,
  grupo_id INTEGER NOT NULL REFERENCES causacion_grupos(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cargo VARCHAR(255) DEFAULT 'Causación',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(grupo_id, user_id)
);
```

**Cómo agregar un miembro a un grupo:**

```sql
INSERT INTO causacion_integrantes (grupo_id, user_id, cargo, activo)
VALUES (
  (SELECT id FROM causacion_grupos WHERE codigo = 'comercial'),  -- Buscar ID del grupo
  (SELECT id FROM users WHERE email = 'usuario@empresa.com'),    -- Buscar ID del usuario
  'Causación Comercial',                                         -- Cargo
  true                                                           -- Activo
);
```

**✨ Resultado:** El usuario podrá firmar documentos asignados a ese grupo.

**⚠️ Nota sobre CASCADE:**
- Si eliminas un grupo (`DELETE FROM causacion_grupos WHERE id = X`), todos sus integrantes se eliminan automáticamente.
- Si eliminas un usuario (`DELETE FROM users WHERE id = X`), se eliminan todas sus membresías a grupos.

---

### 3. `document_types` - Tipos de Documento

Define los tipos de documentos del sistema (FV, OC, etc.).

**Estructura:**
```sql
CREATE TABLE document_types (
  id SERIAL PRIMARY KEY,
  code VARCHAR(10) UNIQUE NOT NULL,        -- Código único (ej: 'FV', 'OC')
  name VARCHAR(100) NOT NULL,              -- Nombre visible (ej: 'Factura de Venta')
  description TEXT,                        -- Descripción
  active BOOLEAN DEFAULT true,             -- Estado activo/inactivo
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Cómo agregar un nuevo tipo de documento:**

```sql
-- Paso 1: Agregar el tipo de documento
INSERT INTO document_types (code, name, description, active)
VALUES (
  'OC',                                     -- Código único
  'Orden de Compra',                        -- Nombre visible
  'Órdenes de compra a proveedores',        -- Descripción
  true                                      -- Activo
);

-- Paso 2: Agregar roles para este tipo de documento (se explica abajo)
```

**✨ Resultado:** El nuevo tipo de documento estará disponible para crear workflows de firma.

---

### 4. `document_type_roles` - Roles por Tipo de Documento

Define qué roles aplican a cada tipo de documento y su orden de firma.

**Estructura:**
```sql
CREATE TABLE document_type_roles (
  id SERIAL PRIMARY KEY,
  document_type_id INTEGER NOT NULL REFERENCES document_types(id) ON DELETE CASCADE,
  role_code VARCHAR(50) NOT NULL,          -- Código único del rol (ej: 'REVISADOR')
  role_name VARCHAR(100) NOT NULL,         -- Nombre visible (ej: 'Revisador')
  signing_order INTEGER NOT NULL,          -- Orden de firma (1, 2, 3...)
  is_required BOOLEAN DEFAULT true,        -- Si es obligatorio
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(document_type_id, role_code)      -- Un rol solo puede estar una vez por tipo de documento
);
```

**Cómo agregar un nuevo rol a un tipo de documento:**

```sql
INSERT INTO document_type_roles (document_type_id, role_code, role_name, signing_order, is_required)
VALUES (
  (SELECT id FROM document_types WHERE code = 'FV'),  -- Tipo de documento
  'APROBADOR_GERENCIA',                               -- Código del rol
  'Aprobador de Gerencia',                            -- Nombre visible
  5,                                                  -- Orden de firma (después de Causación)
  true                                                -- Es requerido
);
```

**✨ Resultado:**
- El nuevo rol aparecerá en el workflow de firmas para ese tipo de documento
- Se respetará el orden de firma definido
- El frontend cargará el rol dinámicamente

**Ejemplo completo: Agregar "Causación Comercial" para FV:**

```sql
-- Agregar el rol a document_type_roles
INSERT INTO document_type_roles (document_type_id, role_code, role_name, signing_order, is_required)
VALUES (
  (SELECT id FROM document_types WHERE code = 'FV'),
  'CAUSACION_COMERCIAL',
  'Causación Comercial',
  5,
  true
);

-- Agregar el grupo de causación
INSERT INTO causacion_grupos (codigo, nombre, descripcion, role_code, activo)
VALUES (
  'comercial',
  'Comercial',
  'Grupo de causación del área comercial',
  'CAUSACION_COMERCIAL',
  true
);

-- Agregar miembros al grupo
INSERT INTO causacion_integrantes (grupo_id, user_id, cargo, activo)
VALUES
  ((SELECT id FROM causacion_grupos WHERE codigo = 'comercial'), (SELECT id FROM users WHERE email = 'usuario1@empresa.com'), 'Causación Comercial', true),
  ((SELECT id FROM causacion_grupos WHERE codigo = 'comercial'), (SELECT id FROM users WHERE email = 'usuario2@empresa.com'), 'Causación Comercial', true);
```

**✨ Resultado final:**
- El grupo "Comercial" aparece en el UI de FacturaTemplate.jsx
- Al seleccionarlo, se asigna el rol "Causación Comercial" automáticamente
- Los usuarios del grupo reciben notificaciones para firmar

---

## 🔗 Relaciones CASCADE

El sistema usa **ON DELETE CASCADE** para mantener integridad referencial automáticamente.

### Jerarquía de Cascada

```
document_types
  ↓ (CASCADE)
  document_type_roles

causacion_grupos
  ↓ (CASCADE)
  causacion_integrantes

users
  ↓ (CASCADE)
  causacion_integrantes
  ↓ (CASCADE)
  document_signers
  ↓ (CASCADE)
  signatures
```

### Ejemplos de Cascada

**Si eliminas un tipo de documento:**
```sql
DELETE FROM document_types WHERE code = 'FV';
-- Automáticamente elimina todos los roles asociados en document_type_roles
```

**Si eliminas un grupo de causación:**
```sql
DELETE FROM causacion_grupos WHERE codigo = 'financiera';
-- Automáticamente elimina todos los integrantes del grupo
```

**Si eliminas un usuario:**
```sql
DELETE FROM users WHERE email = 'usuario@empresa.com';
-- Automáticamente elimina:
--   - Sus membresías a grupos (causacion_integrantes)
--   - Sus asignaciones como firmante (document_signers)
--   - Sus firmas (signatures)
```

---

## 🎨 Frontend Dinámico

El frontend está diseñado para cargar configuraciones desde la BD sin hardcoding.

### Ejemplo: Carga de Grupos de Causación

**Antes (hardcoded):**
```jsx
<option value="financiera">Financiera</option>
<option value="logistica">Logística</option>
```

**Ahora (dinámico):**
```jsx
{causacionGrupos.map(grupo => (
  <option key={grupo.codigo} value={grupo.codigo}>
    {grupo.nombre}
  </option>
))}
```

**¿Cómo funciona?**

1. Al cargar el componente, se ejecuta una query GraphQL:
   ```graphql
   query {
     causacionGrupos {
       codigo
       nombre
       roleCode
     }
   }
   ```

2. El frontend renderiza los grupos dinámicamente
3. Al seleccionar un grupo, se usa su `roleCode` para asignar el rol correcto

**✨ Resultado:** Agregar un grupo en la BD lo hace aparecer inmediatamente en el UI.

---

## 🧩 Backend Genérico

El backend usa GraphQL para resolver queries de forma genérica.

### Ejemplo: Resolver Grupos Dinámicamente

**Resolver en `resolvers-db.js`:**
```javascript
causacionGrupos: async () => {
  const result = await pool.query(`
    SELECT id, codigo, nombre, descripcion, role_code as "roleCode", activo
    FROM causacion_grupos
    WHERE activo = true
    ORDER BY nombre
  `);
  return result.rows;
}
```

**✨ Resultado:** El backend devuelve TODOS los grupos activos sin filtrar ni hardcodear.

---

## 📝 Casos de Uso Comunes

### Caso 1: Agregar un Nuevo Grupo de Causación

**Escenario:** Necesitas agregar el grupo "Recursos Humanos" para causar facturas de nómina.

**Pasos:**

1. **Agregar el rol en `document_type_roles`:**
   ```sql
   INSERT INTO document_type_roles (document_type_id, role_code, role_name, signing_order, is_required)
   VALUES (
     (SELECT id FROM document_types WHERE code = 'FV'),
     'CAUSACION_RRHH',
     'Causación RRHH',
     5,
     true
   );
   ```

2. **Agregar el grupo en `causacion_grupos`:**
   ```sql
   INSERT INTO causacion_grupos (codigo, nombre, descripcion, role_code, activo)
   VALUES (
     'rrhh',
     'Recursos Humanos',
     'Grupo de causación del área de RRHH',
     'CAUSACION_RRHH',
     true
   );
   ```

3. **Agregar miembros al grupo:**
   ```sql
   INSERT INTO causacion_integrantes (grupo_id, user_id, cargo, activo)
   VALUES
     ((SELECT id FROM causacion_grupos WHERE codigo = 'rrhh'), (SELECT id FROM users WHERE email = 'rrhh1@empresa.com'), 'Causación RRHH', true),
     ((SELECT id FROM causacion_grupos WHERE codigo = 'rrhh'), (SELECT id FROM users WHERE email = 'rrhh2@empresa.com'), 'Causación RRHH', true);
   ```

**✨ Resultado:** El grupo "Recursos Humanos" aparece en el UI de FacturaTemplate.jsx y funciona de inmediato.

---

### Caso 2: Agregar un Nuevo Tipo de Documento

**Escenario:** Necesitas agregar "Órdenes de Compra" (OC) con su propio workflow.

**Pasos:**

1. **Agregar el tipo de documento:**
   ```sql
   INSERT INTO document_types (code, name, description, active)
   VALUES ('OC', 'Orden de Compra', 'Órdenes de compra a proveedores', true);
   ```

2. **Agregar roles para OC:**
   ```sql
   INSERT INTO document_type_roles (document_type_id, role_code, role_name, signing_order, is_required)
   VALUES
     ((SELECT id FROM document_types WHERE code = 'OC'), 'SOLICITANTE', 'Solicitante', 1, true),
     ((SELECT id FROM document_types WHERE code = 'OC'), 'APROBADOR', 'Aprobador', 2, true),
     ((SELECT id FROM document_types WHERE code = 'OC'), 'COMPRAS', 'Compras', 3, true);
   ```

**✨ Resultado:** El tipo de documento OC está listo para usarse con su workflow de 3 firmas.

---

## ⚠️ Consideraciones Importantes

### 1. Estados `activo`

Muchas tablas tienen un campo `activo` para soft-delete:
```sql
-- En lugar de eliminar físicamente:
DELETE FROM causacion_grupos WHERE id = 5;

-- Mejor desactivar:
UPDATE causacion_grupos SET activo = false WHERE id = 5;
```

**Ventajas:**
- Mantiene integridad histórica
- Permite reactivar fácilmente
- No rompe relaciones existentes

### 2. Validación de `role_code`

El campo `role_code` en `causacion_grupos` debe existir en `document_type_roles`:
```sql
-- Verificar que el role_code existe antes de insertar:
SELECT * FROM document_type_roles WHERE role_code = 'CAUSACION_COMERCIAL';
```

### 3. Orden de Firma

El campo `signing_order` en `document_type_roles` controla el flujo de firmas:
```sql
-- Asegúrate de que no haya gaps en el orden:
-- ✅ Correcto: 1, 2, 3, 4, 5
-- ❌ Incorrecto: 1, 2, 5, 7
```

---

## 🚀 Testing de Extensibilidad

Para verificar que el sistema es extensible, prueba este flujo:

1. **Agregar un nuevo grupo en la BD**
2. **Refrescar el frontend** (sin rebuild)
3. **Verificar que aparece en el UI**
4. **Seleccionar el grupo y crear una factura**
5. **Verificar que se asignan los firmantes correctos**

**Si todo funciona sin tocar código, ¡el sistema es extensible! ✅**

---

## 📚 Recursos Adicionales

- **Migraciones:** Ver `server/database/migrations/` para ejemplos de scripts SQL
- **Schema GraphQL:** Ver `server/graphql/schema.js` para queries disponibles
- **Resolvers:** Ver `server/graphql/resolvers-db.js` para lógica de backend

---

## 🎓 Resumen

### ✅ Lo que puedes hacer sin tocar código:

- Agregar/eliminar grupos de causación
- Agregar/eliminar miembros de grupos
- Agregar nuevos tipos de documentos
- Agregar nuevos roles a tipos de documentos
- Modificar orden de firma
- Activar/desactivar grupos o roles

### ❌ Lo que requiere código:

- Cambiar lógica de negocio (ej: validaciones personalizadas)
- Agregar nuevos tipos de datos (ej: campos personalizados en formularios)
- Modificar UI (ej: cambiar diseño de componentes)
- Agregar integraciones externas (ej: APIs de terceros)

---

**Última actualización:** 2025-12-10
**Versión del sistema:** 1.0
**Mantenido por:** Equipo de Desarrollo Docuprex
