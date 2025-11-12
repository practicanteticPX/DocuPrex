# 🚀 Guía de Migración entre Servidores - DocuPrex

Esta guía te ayudará a migrar la aplicación DocuPrex de un servidor a otro SIN PERDER DATOS y asegurando que **TODAS LAS FUNCIONALIDADES FUNCIONEN AL 100%**.

---

## 📋 Pre-requisitos

- [ ] Docker y Docker Compose instalados en el nuevo servidor
- [ ] Acceso a Active Directory desde el nuevo servidor
- [ ] IP estática asignada al nuevo servidor
- [ ] Puertos 5001 (backend) y 5173 (frontend) disponibles

---

## 🔄 Pasos de Migración

### **PASO 1: Backup de Datos del Servidor Actual** ⏱️ 5 minutos

En el servidor **ACTUAL** (antes de apagar):

```bash
# 1. Hacer backup de la base de datos
cd D:\docuprex_docker
docker-compose exec postgres-db pg_dump -U postgres firmas_db > backup_$(date +%Y%m%d_%H%M%S).sql

# 2. Copiar archivos de documentos
# Los documentos están en: D:\docuprex_docker\server\uploads\
# Copiar toda la carpeta a un USB o unidad de red

# 3. Copiar archivos de configuración (contienen IPs)
# - server/.env
# - frontend/.env
# - docker-compose.yml
```

### **PASO 2: Preparar el Nuevo Servidor** ⏱️ 10 minutos

En el servidor **NUEVO**:

```bash
# 1. Clonar o copiar el proyecto
cd D:\
# (Copia todos los archivos del proyecto)

# 2. Identificar la NUEVA IP del servidor
ipconfig
# Ejemplo: 192.168.0.30 (anota esta IP)
```

### **PASO 3: Actualizar Configuración con la Nueva IP** ⏱️ 5 minutos

#### 3.1. Actualizar `docker-compose.yml`

Buscar y reemplazar **TODAS** las ocurrencias de la IP antigua por la nueva:

```yaml
# ANTES (ejemplo con IP antigua 192.168.0.19):
- "192.168.0.19:5001:5001"
- "192.168.0.19:5173:5173"

# DESPUÉS (con IP nueva 192.168.0.30):
- "192.168.0.30:5001:5001"
- "192.168.0.30:5173:5173"
```

**Ubicaciones a cambiar en `docker-compose.yml`**:
- Línea ~29: `ports` del servicio `server`
- Línea ~56: `ports` del servicio `frontend`

#### 3.2. Actualizar `server/.env`

```bash
# Editar D:\docuprex_docker\server\.env

# Cambiar la URL de GraphQL:
# ANTES:
GRAPHQL_URL=http://192.168.0.19:5001/graphql

# DESPUÉS:
GRAPHQL_URL=http://192.168.0.30:5001/graphql
```

**Verificar también**:
- `DATABASE_URL` (debe apuntar a `postgres-db`, no a IP)
- `LDAP_URL` (IP del Active Directory, NO cambiar)
- `EMAIL_*` (configuración SMTP, NO cambiar)

#### 3.3. Actualizar `frontend/.env`

```bash
# Editar D:\docuprex_docker\frontend\.env

# Cambiar la URL del API:
# ANTES:
VITE_API_URL=http://192.168.0.19:5001/graphql

# DESPUÉS:
VITE_API_URL=http://192.168.0.30:5001/graphql
```

#### 3.4. Actualizar URL de descarga en `server/graphql/resolvers-db.js`

```javascript
// Buscar la línea ~1965 en resolvers-db.js:
// ANTES:
const urlDescarga = `http://192.168.0.19:5001/api/download/${documentId}`;

// DESPUÉS:
const urlDescarga = `http://192.168.0.30:5001/api/download/${documentId}`;
```

### **PASO 4: Recrear la Base de Datos** ⏱️ 10 minutos

```bash
cd D:\docuprex_docker

# 1. Detener contenedores si están corriendo
docker-compose down

# 2. ELIMINAR la carpeta bd/ (datos corruptos)
# IMPORTANTE: Haz backup antes si tienes datos importantes
rmdir /s bd

# 3. Crear la carpeta bd/ vacía
mkdir bd

# 4. Iniciar solo PostgreSQL
docker-compose up -d postgres-db

# 5. Esperar 10 segundos a que PostgreSQL inicie
timeout 10

# 6. Ejecutar el schema completo
docker-compose exec -T postgres-db psql -U postgres -d firmas_db < server\database\DATABASE_COMPLETE_SCHEMA.sql

# 7. Verificar que todo se creó correctamente
docker-compose exec postgres-db psql -U postgres -d firmas_db -c "\dt"
# Debería mostrar 8 tablas: users, documents, signatures, document_signers, notifications, audit_log, document_types, document_type_roles

# 8. Verificar que el tipo de documento SA existe
docker-compose exec postgres-db psql -U postgres -d firmas_db -c "SELECT * FROM document_types WHERE code = 'SA';"
```

### **PASO 5: Restaurar Archivos de Documentos** ⏱️ 5 minutos

```bash
# Copiar la carpeta uploads/ del backup al nuevo servidor
# Destino: D:\docuprex_docker\server\uploads\
```

### **PASO 6: Restaurar Datos de Usuario (Opcional)** ⏱️ 10 minutos

Si quieres migrar usuarios, documentos y firmas del servidor anterior:

```bash
# En el servidor NUEVO:
cd D:\docuprex_docker

# Restaurar desde el backup SQL
docker-compose exec -T postgres-db psql -U postgres -d firmas_db < backup_YYYYMMDD_HHMMSS.sql

# NOTA: Esto puede causar conflictos si el schema ya tiene datos
# Recomendación: Partir con BD limpia y que los usuarios vuelvan a subir documentos
```

### **PASO 7: Iniciar la Aplicación** ⏱️ 5 minutos

```bash
cd D:\docuprex_docker

# 1. Detener todo
docker-compose down

# 2. Reconstruir imágenes (con la nueva configuración)
docker-compose build --no-cache

# 3. Iniciar todos los servicios
docker-compose up -d

# 4. Ver logs para verificar que todo inició correctamente
docker-compose logs -f
```

### **PASO 8: Verificación Post-Migración** ⏱️ 10 minutos

#### 8.1. Verificar Backend

```bash
# Revisar logs del servidor
docker-compose logs server

# Debe mostrar:
# ✅ "Servidor corriendo en http://192.168.0.30:5001"
# ✅ "GraphQL disponible en http://192.168.0.30:5001/graphql"
# ✅ "Base de datos: PostgreSQL conectado"
# ✅ "Autenticación Active Directory configurada"

# NO debe mostrar:
# ❌ Errores de conexión a BD
# ❌ "could not open file"
# ❌ Errores de Active Directory
```

#### 8.2. Verificar Frontend

```bash
# Revisar logs del frontend
docker-compose logs frontend

# Debe mostrar:
# ✅ "VITE ready"
# ✅ "Local: http://localhost:5173/"
```

#### 8.3. Verificar Base de Datos

```bash
# Conectarse a la BD
docker-compose exec postgres-db psql -U postgres -d firmas_db

# Verificar tablas
\dt
# Debería mostrar 8 tablas

# Verificar que no hay errores de corrupción
SELECT * FROM users LIMIT 1;
SELECT * FROM document_types;

# Salir
\q
```

#### 8.4. Verificar desde el Navegador

1. **Frontend**: Abrir `http://192.168.0.30:5173`
   - ✅ Debe cargar la página de login
   - ✅ No debe mostrar errores en consola del navegador

2. **Backend GraphQL**: Abrir `http://192.168.0.30:5001/graphql`
   - ✅ Debe cargar GraphQL Playground
   - ✅ Ejecutar query de prueba:
     ```graphql
     query {
       documentTypes {
         id
         name
         code
       }
     }
     ```
   - ✅ Debe devolver el tipo "SA"

3. **Login**: En la página de login
   - ✅ Intentar login con usuario de Active Directory
   - ✅ Debe autenticar correctamente
   - ✅ NO debe mostrar "Usuario o contraseña inválidos" (a menos que sean incorrectos)

---

## ✅ Checklist de Migración Completa

### Configuración
- [ ] IP del servidor actualizada en `docker-compose.yml`
- [ ] IP actualizada en `server/.env`
- [ ] IP actualizada en `frontend/.env`
- [ ] URL de descarga actualizada en `resolvers-db.js`

### Base de Datos
- [ ] Carpeta `bd/` eliminada y recreada
- [ ] Schema completo ejecutado (`DATABASE_COMPLETE_SCHEMA.sql`)
- [ ] 8 tablas creadas correctamente
- [ ] Tipo de documento "SA" existe
- [ ] 5 roles para "SA" existen
- [ ] No hay errores de corrupción

### Archivos
- [ ] Carpeta `server/uploads/` restaurada con documentos

### Servicios
- [ ] Contenedores corriendo: `docker-compose ps`
- [ ] Backend respondiendo en puerto 5001
- [ ] Frontend respondiendo en puerto 5173
- [ ] PostgreSQL respondiendo en puerto 5432

### Funcionalidad
- [ ] Login con Active Directory funciona
- [ ] GraphQL responde correctamente
- [ ] Frontend carga sin errores
- [ ] No hay mensajes de error en logs

---

## 🆘 Troubleshooting

### Error: "could not open file base/16384/XXXXX"

**Causa**: Corrupción de base de datos
**Solución**:
```bash
docker-compose down
rmdir /s bd
mkdir bd
docker-compose up -d postgres-db
docker-compose exec -T postgres-db psql -U postgres -d firmas_db < server\database\DATABASE_COMPLETE_SCHEMA.sql
```

### Error: "Usuario o contraseña inválidos" (con credenciales correctas)

**Causa**: Base de datos no inicializada o tabla users corrupta
**Solución**: Verificar que el schema se ejecutó correctamente
```bash
docker-compose exec postgres-db psql -U postgres -d firmas_db -c "SELECT COUNT(*) FROM users;"
```

### Error: "Connection refused" al hacer login

**Causa**: IP incorrecta en configuración
**Solución**: Verificar que todas las IPs en `.env` y `docker-compose.yml` sean la nueva IP

### Error: "Network error" en frontend

**Causa**: Backend no responde o IP incorrecta
**Solución**:
1. Verificar que backend está corriendo: `docker-compose logs server`
2. Verificar IP en `frontend/.env`
3. Reconstruir frontend: `docker-compose build frontend && docker-compose up -d frontend`

### Documentos no se descargan

**Causa**: URL de descarga tiene IP antigua
**Solución**: Actualizar línea ~1965 en `server/graphql/resolvers-db.js`

---

## 📝 Resumen de Archivos a Actualizar

| Archivo | Qué Cambiar | Ubicación |
|---------|-------------|-----------|
| `docker-compose.yml` | IPs en `ports` | Líneas ~29, ~56 |
| `server/.env` | `GRAPHQL_URL` | Variable `GRAPHQL_URL` |
| `frontend/.env` | `VITE_API_URL` | Variable `VITE_API_URL` |
| `server/graphql/resolvers-db.js` | URL de descarga | Línea ~1965 |

---

## 🔐 Seguridad Post-Migración

1. **Cambiar credenciales de PostgreSQL** (opcional pero recomendado)
2. **Actualizar secreto JWT** en `server/.env` → `JWT_SECRET`
3. **Verificar reglas de firewall** en el nuevo servidor
4. **Configurar backup automático** de la base de datos

---

## 📞 Soporte

Si encuentras problemas durante la migración:
1. Revisa los logs: `docker-compose logs`
2. Verifica que la base de datos tiene las 8 tablas
3. Confirma que todas las IPs fueron actualizadas
4. Asegúrate de que Active Directory es accesible desde el nuevo servidor

---

**Última actualización**: 2025-11-11
**Tiempo estimado de migración completa**: 60 minutos
