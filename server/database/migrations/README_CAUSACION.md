# Grupos de Causación - Guía de Uso

## 📋 Descripción

El sistema de grupos de causación permite asignar facturas a equipos específicos (Financiera o Logística). Todas las personas del grupo seleccionado recibirán una notificación para firmar.

## 🗄️ Estructura de Tablas

### `causacion_grupos`
Almacena los grupos disponibles para causación.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL | ID único del grupo |
| codigo | VARCHAR(50) | Código del grupo: `financiera` o `logistica` |
| nombre | VARCHAR(255) | Nombre descriptivo del grupo |
| descripcion | TEXT | Descripción del grupo |
| activo | BOOLEAN | Si el grupo está activo |

### `causacion_integrantes`
Almacena los integrantes de cada grupo.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | SERIAL | ID único del integrante |
| grupo_id | INTEGER | Referencia al grupo (FK) |
| nombre | VARCHAR(255) | Nombre completo de la persona |
| email | VARCHAR(255) | Email corporativo |
| cargo | VARCHAR(255) | Cargo (por defecto: "Causación") |
| activo | BOOLEAN | Si el integrante está activo |

## ✅ Estado Actual

Las tablas ya están creadas y los grupos iniciales insertados:
- ✅ Grupo **Financiera** (código: `financiera`)
- ✅ Grupo **Logística** (código: `logistica`)

## 📝 Cómo Agregar Integrantes

### Opción 1: Usando SQL directamente

```bash
# Conectarse al contenedor de la base de datos
docker exec -it firmas_db psql -U postgres -d firmas_db
```

Luego ejecutar:

```sql
-- Agregar integrante al grupo Financiera
INSERT INTO causacion_integrantes (grupo_id, nombre, email, cargo)
VALUES (
  (SELECT id FROM causacion_grupos WHERE codigo = 'financiera'),
  'Nombre Completo',
  'email@empresa.com',
  'Causación'
);

-- Agregar integrante al grupo Logística
INSERT INTO causacion_integrantes (grupo_id, nombre, email, cargo)
VALUES (
  (SELECT id FROM causacion_grupos WHERE codigo = 'logistica'),
  'Nombre Completo',
  'email@empresa.com',
  'Causación'
);
```

### Opción 2: Usando el archivo de ejemplo

1. Edita el archivo `007_insert_causacion_members_EXAMPLE.sql` con los datos reales
2. Ejecuta:

```bash
docker exec -i firmas_db psql -U postgres -d firmas_db < "server/database/migrations/007_insert_causacion_members_EXAMPLE.sql"
```

## 🔍 Consultas Útiles

### Ver todos los grupos
```sql
SELECT * FROM causacion_grupos;
```

### Ver integrantes de un grupo específico
```sql
-- Integrantes de Financiera
SELECT ci.nombre, ci.email, ci.cargo, ci.activo
FROM causacion_integrantes ci
JOIN causacion_grupos cg ON ci.grupo_id = cg.id
WHERE cg.codigo = 'financiera' AND ci.activo = true;

-- Integrantes de Logística
SELECT ci.nombre, ci.email, ci.cargo, ci.activo
FROM causacion_integrantes ci
JOIN causacion_grupos cg ON ci.grupo_id = cg.id
WHERE cg.codigo = 'logistica' AND ci.activo = true;
```

### Ver todos los integrantes con su grupo
```sql
SELECT
  cg.nombre as grupo,
  ci.nombre,
  ci.email,
  ci.cargo,
  ci.activo
FROM causacion_integrantes ci
JOIN causacion_grupos cg ON ci.grupo_id = cg.id
ORDER BY cg.nombre, ci.nombre;
```

### Desactivar un integrante (sin eliminarlo)
```sql
UPDATE causacion_integrantes
SET activo = false
WHERE email = 'email@empresa.com';
```

### Reactivar un integrante
```sql
UPDATE causacion_integrantes
SET activo = true
WHERE email = 'email@empresa.com';
```

## 🔄 Flujo de Uso en la Aplicación

1. **Usuario completa la plantilla de factura** en el frontend
2. **Selecciona un grupo de causación** (Financiera o Logística)
3. **Al guardar**, el sistema:
   - Almacena `grupoCausacion` con el valor seleccionado
   - Envía notificaciones a todos los integrantes activos del grupo
   - Mientras ninguno firme, el informe muestra: `"Causación - Financiera - causacion"` o `"Causación - Logística - causacion"`
   - Después de la primera firma, muestra: `"Nombre Persona - Causación"`

## 🎯 Próximos Pasos para el Backend

Para completar esta funcionalidad necesitas implementar:

1. **Endpoint para obtener integrantes de un grupo**
   ```javascript
   GET /api/causacion/grupos/:codigo/integrantes
   // Retorna lista de integrantes activos del grupo
   ```

2. **Lógica de notificaciones**
   - Enviar email a todos los integrantes del grupo seleccionado
   - Incluir link de firma en el email

3. **Sistema de tracking de firmas**
   - Registrar quién firmó primero
   - Actualizar el informe con el nombre del firmante

4. **Actualización de la tabla de legalizaciones**
   - Añadir campo `grupo_causacion` a la tabla de facturas/legalizaciones
   - Relacionar con la tabla `causacion_grupos`
