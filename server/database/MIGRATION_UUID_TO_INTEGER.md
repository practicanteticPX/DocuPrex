# 🔄 Migración Completa: UUID → INTEGER (IDs Numéricas)

## ✅ Estado: COMPLETADO

**Fecha:** 2025-12-05
**Resultado:** Exitoso - Base de datos completamente migrada a IDs numéricas

---

## 📊 Resumen de la Migración

### Antes (UUIDs)
```sql
id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
-- Ejemplo: '4fb7c77e-cb5c-442b-b0e0-00bbc1c7ceb5'
```

### Después (INTEGER)
```sql
id SERIAL PRIMARY KEY
-- Ejemplo: 1, 2, 3, 4, 5...
```

---

## 🗄️ Tablas Migradas

| Tabla | IDs Numéricas | Registros | Estado |
|-------|--------------|-----------|---------|
| **users** | ✅ | 78 | ✅ Datos preservados |
| **documents** | ✅ | 0 | ✅ Limpia |
| **document_types** | ✅ | 1 | ✅ Datos iniciales |
| **document_type_roles** | ✅ | 5 | ✅ Datos iniciales |
| **document_signers** | ✅ | 0 | ✅ Limpia |
| **signatures** | ✅ | 0 | ✅ Limpia |
| **notifications** | ✅ | 0 | ✅ Limpia |
| **negotiation_signers** | ✅ | 5 | ✅ Datos iniciales |
| **causacion_grupos** | ✅ | 2 | ✅ Datos iniciales |
| **causacion_integrantes** | ✅ | 0 | ✅ Limpia |

---

## 🔧 Cambios en Foreign Keys

### Antes:
```sql
document_id UUID REFERENCES documents(id)
user_id UUID REFERENCES users(id)
```

### Después:
```sql
document_id INTEGER REFERENCES documents(id)
user_id INTEGER REFERENCES users(id)
```

---

## 💾 Datos Preservados

### ✅ Usuarios (78 registros)
Todos los usuarios se migraron correctamente manteniendo:
- Nombre
- Email
- Rol (admin/user/viewer)
- Usuario AD
- Estado activo
- Preferencias de notificaciones

**Ejemplo:**
```
ID | Nombre              | Email
---|---------------------|---------------------------
1  | Esteban Zuluaga     | e.zuluaga@prexxa.com.co
2  | Jorge Anibal Peña   | j.pena@prexxa.com.co
3  | Monica Bustamante   | m.bustamante@prexxa.com.co
...
```

### ✅ Configuraciones del Sistema
- Tipo de documento SA (Solicitud de Anticipo)
- 5 roles del documento SA
- Firmantes de negociaciones (5 usuarios)
- Grupos de causación (Financiera y Logística)

---

## 🚨 Datos Eliminados (Reset)

Los siguientes datos se eliminaron para empezar limpio:
- ❌ Documentos subidos (0 registros)
- ❌ Firmantes de documentos (0 registros)
- ❌ Firmas realizadas (0 registros)
- ❌ Notificaciones (0 registros)
- ❌ Integrantes de grupos de causación (0 registros)

---

## 🔄 Cambios Requeridos en el Backend

### 1. **Importaciones en Node.js**
Ya no necesitas `uuid` package:

**Antes:**
```javascript
const { v4: uuidv4 } = require('uuid');
const newId = uuidv4(); // 'a1b2c3d4-...'
```

**Después:**
```javascript
// Los IDs se generan automáticamente por PostgreSQL (SERIAL)
// No necesitas generar IDs manualmente
```

### 2. **Tipos en TypeScript/GraphQL**

**Antes:**
```typescript
interface User {
  id: string; // UUID
}
```

**Después:**
```typescript
interface User {
  id: number; // INTEGER
}
```

### 3. **Queries SQL**

**Antes:**
```sql
WHERE id = $1  -- $1 debe ser UUID string
```

**Después:**
```sql
WHERE id = $1  -- $1 debe ser INTEGER number
```

### 4. **Inserción de Registros**

**Antes:**
```javascript
const result = await pool.query(
  'INSERT INTO documents (id, title, ...) VALUES ($1, $2, ...)',
  [uuidv4(), 'Title', ...]
);
```

**Después:**
```javascript
const result = await pool.query(
  'INSERT INTO documents (title, ...) VALUES ($1, ...) RETURNING id',
  ['Title', ...]
);
const newId = result.rows[0].id; // INTEGER
```

### 5. **Arrays de IDs**

**Antes:**
```sql
assigned_role_ids UUID[] -- Array de UUIDs
```

**Después:**
```sql
assigned_role_ids INTEGER[] -- Array de INTEGERs
```

---

## 📁 Archivos Importantes

### Backups Creados:
1. **`backups/backup_pre_uuid_migration.sql`** - Backup completo antes de la migración (con UUIDs)
2. **`backups/users_backup.csv`** - Backup CSV de usuarios (usado para restaurar)

### Schemas:
1. **`schema.sql`** - Schema antiguo (con UUIDs) - NO USAR
2. **`schema_integer_ids.sql`** - Schema nuevo (con INTEGERs) - ✅ USAR ESTE

### Migraciones:
1. **`007_create_causacion_groups_v2.sql`** - Grupos de causación (con INTEGERs)
2. **`007_insert_causacion_members_v2_EXAMPLE.sql`** - Ejemplo de cómo agregar integrantes

---

## 🎯 Próximos Pasos

### 1. Actualizar el Código del Backend
- [ ] Buscar todos los tipos `UUID` y cambiarlos a `number`
- [ ] Buscar todos los `uuid_generate_v4()` y eliminarlos
- [ ] Actualizar interfaces TypeScript
- [ ] Actualizar schemas GraphQL
- [ ] Actualizar validaciones de IDs

### 2. Agregar Integrantes a Grupos de Causación
```sql
-- Ver usuarios disponibles
SELECT id, name, email FROM users WHERE is_active = true;

-- Agregar a grupo Financiera
INSERT INTO causacion_integrantes (grupo_id, user_id, cargo)
VALUES (
  (SELECT id FROM causacion_grupos WHERE codigo = 'financiera'),
  3,  -- ID numérica de Monica Bustamante
  'Causación'
);

-- Agregar a grupo Logística
INSERT INTO causacion_integrantes (grupo_id, user_id, cargo)
VALUES (
  (SELECT id FROM causacion_grupos WHERE codigo = 'logistica'),
  4,  -- ID numérica de Juan Duque
  'Causación'
);
```

### 3. Probar el Sistema
- [ ] Crear un documento de prueba
- [ ] Asignar firmantes
- [ ] Probar el flujo de firma
- [ ] Verificar notificaciones

---

## 🔍 Verificación Post-Migración

Ejecutar estas consultas para verificar:

```sql
-- Ver todos los usuarios con IDs numéricas
SELECT id, name, email FROM users LIMIT 10;

-- Verificar foreign keys funcionan
SELECT
  dt.id as tipo_id,
  dt.name as tipo,
  dtr.id as rol_id,
  dtr.role_name as rol
FROM document_types dt
JOIN document_type_roles dtr ON dt.id = dtr.document_type_id;

-- Ver grupos de causación
SELECT cg.nombre as grupo, COUNT(ci.id) as integrantes
FROM causacion_grupos cg
LEFT JOIN causacion_integrantes ci ON cg.id = ci.grupo_id
GROUP BY cg.id, cg.nombre;
```

---

## ⚠️ Notas Importantes

1. **No usar archivos antiguos:** El archivo `schema.sql` todavía usa UUIDs. Siempre usar `schema_integer_ids.sql`.

2. **Backups preservados:** Los datos originales están en `backups/backup_pre_uuid_migration.sql` si necesitas algo.

3. **IDs secuenciales:** Los IDs ahora son secuenciales (1, 2, 3...) lo que facilita debugging y relaciones.

4. **Performance:** IDs numéricas son más eficientes en índices y joins que UUIDs.

5. **Migraciones futuras:** Todas las nuevas migraciones deben usar INTEGER, no UUID.

---

## 🆘 Rollback (En caso de emergencia)

Si necesitas volver atrás:

```bash
# Restaurar desde el backup completo
docker exec -i firmas_db psql -U postgres -d postgres << 'EOF'
DROP DATABASE IF EXISTS firmas_db;
CREATE DATABASE firmas_db;
EOF

docker exec -i firmas_db psql -U postgres -d firmas_db < backups/backup_pre_uuid_migration.sql
```

**⚠️ ADVERTENCIA:** Esto restaurará TODA la base de datos al estado anterior (con UUIDs).

---

## ✅ Verificación Final

```bash
# Verificar todas las tablas tienen IDs INTEGER
docker exec -i firmas_db psql -U postgres -d firmas_db -c "
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
  AND column_name = 'id'
  ORDER BY table_name;
"

# Resultado esperado:
# Todas las tablas deben mostrar data_type = 'integer'
```

---

## 📚 Recursos

- Schema completo con IDs INTEGER: `schema_integer_ids.sql`
- Documentación de grupos de causación: `README_CAUSACION.md`
- Backup completo: `backups/backup_pre_uuid_migration.sql`
- Backup usuarios: `backups/users_backup.csv`
