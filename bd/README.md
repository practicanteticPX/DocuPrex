# Directorio de Datos de PostgreSQL

Este directorio contiene los datos internos de PostgreSQL en tiempo de ejecución.

## ⚠️ IMPORTANTE

**Este directorio NO debe estar en el control de versiones (git).**

Los archivos en este directorio son:
- Archivos binarios de la base de datos
- Archivos temporales y de estado
- Archivos de configuración runtime
- WAL (Write-Ahead Logging) files
- Archivos de transacciones

## Configuración Docker

Este directorio está montado como volumen en el contenedor PostgreSQL:

```yaml
volumes:
  - ./bd:/var/lib/postgresql/data
```

## Inicialización

Cuando inicias los contenedores por primera vez:

1. PostgreSQL creará automáticamente todos los archivos necesarios en este directorio
2. El schema se aplicará desde `server/database/schema.sql`
3. Las migraciones se ejecutarán automáticamente

## Problemas Comunes

### Error: "directory exists but is not empty"

Si ves este error al iniciar PostgreSQL:

```bash
# Detener contenedores
docker-compose down

# Limpiar el directorio (¡CUIDADO! Esto eliminará todos los datos)
rm -rf bd/*

# Reiniciar contenedores
docker-compose up -d
```

### Resetear la Base de Datos

Para resetear completamente la base de datos:

```bash
# Detener y eliminar contenedores y volúmenes
docker-compose down -v

# Limpiar directorio bd
rm -rf bd/*

# Recrear todo
docker-compose up -d
```

## .gitignore

El archivo `.gitignore` contiene:

```
# PostgreSQL data directory - ENTIRE directory (runtime database files)
bd/
```

Esto asegura que los archivos internos de PostgreSQL no se trackeen en git.

## Schema y Migraciones

El schema de la base de datos está en:
- `server/database/schema.sql` - Schema completo
- `server/database/migrations/` - Migraciones

Estos SÍ están en git y son la fuente de verdad para la estructura de la BD.
