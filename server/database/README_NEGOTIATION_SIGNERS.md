# Gestión de Firmantes de Negociaciones

## Descripción

Esta tabla almacena los usuarios autorizados para usar la cuenta de "Negociaciones", junto con sus cédulas para verificación de identidad.

## Tabla: `negotiation_signers`

### Estructura

```sql
CREATE TABLE negotiation_signers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  cedula VARCHAR(20) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Campos

- **id**: Identificador único
- **name**: Nombre completo del firmante (debe coincidir con el nombre seleccionado en el modal)
- **cedula**: Cédula completa del usuario (se verificarán los últimos 4 dígitos)
- **active**: Indica si el usuario está activo para firmar
- **created_at**: Fecha de creación del registro
- **updated_at**: Fecha de última actualización

## Usuarios Actuales

Los siguientes usuarios están configurados actualmente:

1. Carolina Martinez
2. Valentina Arroyave
3. Manuela Correa
4. Luisa Velez
5. Sebastian Pinto

**IMPORTANTE**: Las cédulas en la base de datos son de ejemplo (1234, 5678, 9012, 3456, 7890). Deben ser actualizadas con las cédulas reales.

## Cómo actualizar las cédulas

### Opción 1: Usando SQL directo

Conéctate a la base de datos y ejecuta:

```sql
-- Actualizar cédula de Carolina Martinez
UPDATE negotiation_signers
SET cedula = 'CEDULA_COMPLETA_AQUI', updated_at = CURRENT_TIMESTAMP
WHERE name = 'Carolina Martinez';

-- Ejemplo con cédula completa:
UPDATE negotiation_signers
SET cedula = '1234567890', updated_at = CURRENT_TIMESTAMP
WHERE name = 'Carolina Martinez';
```

### Opción 2: Usando Docker Compose

```bash
# Conectarse a la base de datos
docker-compose exec postgres-db psql -U postgres -d firmas_db

# Luego ejecutar el UPDATE
UPDATE negotiation_signers
SET cedula = 'CEDULA_COMPLETA', updated_at = CURRENT_TIMESTAMP
WHERE name = 'NOMBRE_COMPLETO';
```

### Opción 3: Actualizar todas las cédulas a la vez

```sql
UPDATE negotiation_signers SET cedula = '1234567890', updated_at = CURRENT_TIMESTAMP WHERE name = 'Carolina Martinez';
UPDATE negotiation_signers SET cedula = '0987654321', updated_at = CURRENT_TIMESTAMP WHERE name = 'Valentina Arroyave';
UPDATE negotiation_signers SET cedula = '1122334455', updated_at = CURRENT_TIMESTAMP WHERE name = 'Manuela Correa';
UPDATE negotiation_signers SET cedula = '5544332211', updated_at = CURRENT_TIMESTAMP WHERE name = 'Luisa Velez';
UPDATE negotiation_signers SET cedula = '9988776655', updated_at = CURRENT_TIMESTAMP WHERE name = 'Sebastian Pinto';
```

## Agregar un nuevo firmante

```sql
INSERT INTO negotiation_signers (name, cedula, active)
VALUES ('Nombre Completo', 'CEDULA_COMPLETA', true);
```

## Desactivar un firmante (sin eliminarlo)

```sql
UPDATE negotiation_signers
SET active = false, updated_at = CURRENT_TIMESTAMP
WHERE name = 'Nombre del Firmante';
```

## Reactivar un firmante

```sql
UPDATE negotiation_signers
SET active = true, updated_at = CURRENT_TIMESTAMP
WHERE name = 'Nombre del Firmante';
```

## Ver todos los firmantes

```sql
SELECT id, name,
       CONCAT('****', RIGHT(cedula, 4)) as cedula_parcial,
       active,
       created_at
FROM negotiation_signers
ORDER BY name;
```

## Flujo de Verificación

1. El usuario "Negociaciones" intenta firmar o rechazar un documento
2. Se muestra un modal para seleccionar el nombre del firmante real
3. Una vez seleccionado, se pide ingresar los últimos 4 dígitos de la cédula
4. El sistema verifica que los últimos 4 dígitos coincidan con la cédula almacenada
5. Si coinciden, se permite la firma y se registra el nombre del firmante real
6. Si no coinciden, se muestra un error y no se permite continuar

## Seguridad

- Las cédulas se almacenan completas en la base de datos
- Solo se solicitan los últimos 4 dígitos al usuario
- La verificación se realiza en el servidor
- Solo el usuario "Negociaciones" puede acceder a esta funcionalidad
- Los nombres deben coincidir exactamente con los configurados en el frontend

## Mantenimiento

Para cambiar la lista de nombres disponibles en el modal, editar:
- Frontend: `frontend/src/components/dashboard/RealSignerModal.jsx` (líneas 27-33)
- Asegurarse de que los nombres en el frontend coincidan exactamente con los de la base de datos
