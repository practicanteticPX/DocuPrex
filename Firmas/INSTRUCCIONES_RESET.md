# 🔄 Instrucciones para Resetear la Base de Datos

## ⚠️ ADVERTENCIA

Estos scripts **ELIMINARÁN TODOS LOS DATOS** de la aplicación:
- ✗ Usuarios (excepto admin)
- ✗ Documentos subidos
- ✗ Firmas
- ✗ Notificaciones
- ✗ Logs de auditoría
- ✗ Archivos físicos en `/uploads`

---

## 📋 Opciones Disponibles

### Opción 1: Reset Completo (Recomendado)
**Script automático que elimina TODO y crea usuario admin**

```bash
cd D:\Firmas\server
node scripts/reset-database.js
```

**¿Qué hace?**
1. ✓ Pide confirmación (debes escribir "SI")
2. ✓ Elimina todos los archivos de `/uploads`
3. ✓ Limpia todas las tablas de la BD
4. ✓ Crea usuario administrador
5. ✓ Muestra estadísticas finales

**Credenciales creadas:**
- Email: `admin@prexxa.local`
- Contraseña: `admin123`

---

### Opción 2: Reset con Backup (Más Seguro)
**Igual que opción 1 pero crea backup antes de eliminar**

```bash
cd D:\Firmas\server
node scripts/reset-database-with-backup.js
```

**¿Qué hace?**
1. ✓ Pregunta si quieres hacer backup
2. ✓ Crea archivo SQL de backup en `/server/backups`
3. ✓ Ejecuta limpieza completa
4. ✓ Crea usuario administrador

**El backup se guarda en:**
```
D:\Firmas\server\backups\backup-YYYY-MM-DD.sql
```

**Para restaurar un backup:**
```bash
psql -h localhost -U postgres -d nombre_db -f backups/backup-2024-01-15.sql
```

---

### Opción 3: Reset Manual con SQL
**Para ejecutar desde pgAdmin o psql**

```bash
# Abrir en pgAdmin o ejecutar:
psql -h localhost -U postgres -d nombre_db -f scripts/reset-database.sql
```

**⚠️ Importante:**
- Este script NO elimina archivos físicos
- Debes eliminar manualmente la carpeta `D:\Firmas\server\uploads`
- El hash de contraseña en el SQL debe actualizarse

---

## 📝 Pasos Detallados - Opción 1 (Recomendado)

### 1. Detener el servidor
```bash
# Si el servidor está corriendo, presiona Ctrl+C
```

### 2. Ejecutar el script
```bash
cd D:\Firmas\server
node scripts/reset-database.js
```

### 3. Confirmar la acción
```
⚠️  ¿Estás SEGURO de que quieres ELIMINAR TODOS LOS DATOS? (escribe 'SI' para confirmar): SI
```

### 4. Esperar a que termine
Verás algo como:
```
🚀 Iniciando reseteo...
🗑️  Eliminando archivos subidos...
  ✓ 15 archivos eliminados
🗄️  Eliminando todos los registros de la base de datos...
  ✓ Tabla 'audit_log' limpiada
  ✓ Tabla 'notifications' limpiada
  ✓ Tabla 'signatures' limpiada
  ✓ Tabla 'document_signers' limpiada
  ✓ Tabla 'documents' limpiada
  ✓ Tabla 'users' limpiada
👤 Creando usuario administrador...
  ✓ Usuario administrador creado:
  - Email: admin@prexxa.local
  - Contraseña: admin123

========================================
  ✓ RESETEO COMPLETADO EXITOSAMENTE
========================================
```

### 5. Reiniciar el servidor
```bash
npm start
```

### 6. Iniciar sesión
- Email: `admin@prexxa.local`
- Contraseña: `admin123`

---

## 🛠️ Resolución de Problemas

### Error: "Cannot find module 'bcryptjs'"
```bash
cd D:\Firmas\server
npm install
```

### Error: "Connection refused"
- Verifica que PostgreSQL esté corriendo
- Verifica la variable `DATABASE_URL` en `.env`

### Error de permisos en Windows
- Ejecuta el terminal como Administrador
- Verifica permisos de la carpeta `uploads/`

### El script se cuelga
- Presiona Ctrl+C
- Verifica que no haya conexiones abiertas a la BD
- Reinicia PostgreSQL

---

## 🔒 Seguridad

### Cambiar contraseña de admin
Después de iniciar sesión:
1. Ve a Configuración
2. Cambia la contraseña por defecto
3. O ejecuta este SQL:

```sql
UPDATE users
SET password_hash = 'nuevo_hash_aqui'
WHERE email = 'admin@prexxa.local';
```

Para generar hash:
```bash
node -e "console.log(require('bcryptjs').hashSync('tu_nueva_contraseña', 10))"
```

---

## 📊 Verificar Estado de la BD

### Después del reset, verifica:
```sql
-- Ver usuarios
SELECT id, name, email, role FROM users;

-- Ver documentos
SELECT COUNT(*) FROM documents;

-- Ver notificaciones
SELECT COUNT(*) FROM notifications;

-- Ver todo
SELECT
  'users' as tabla, COUNT(*) as total FROM users
UNION ALL SELECT 'documents', COUNT(*) FROM documents
UNION ALL SELECT 'signatures', COUNT(*) FROM signatures
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'audit_log', COUNT(*) FROM audit_log;
```

---

## ⚡ Scripts Rápidos

### Solo limpiar archivos (sin tocar BD)
```bash
cd D:\Firmas\server\uploads
rm -rf * # Linux/Mac
del /q * # Windows CMD
Remove-Item * -Force # Windows PowerShell
```

### Solo limpiar usuarios (mantener documentos)
```sql
DELETE FROM users WHERE role != 'admin';
```

### Crear usuario adicional
```bash
node -e "
const bcrypt = require('bcryptjs');
console.log('Hash:', bcrypt.hashSync('contraseña123', 10));
"

# Luego ejecuta en SQL:
INSERT INTO users (name, email, password_hash, role, is_active)
VALUES ('Juan Pérez', 'juan@empresa.com', 'HASH_AQUI', 'user', true);
```

---

## 📞 Soporte

Si encuentras problemas:
1. Verifica que PostgreSQL esté corriendo
2. Verifica las credenciales en `.env`
3. Revisa los logs del servidor
4. Ejecuta con backup primero (opción 2)

---

## ✅ Checklist Post-Reset

- [ ] Base de datos limpia (0 registros excepto admin)
- [ ] Carpeta uploads vacía
- [ ] Usuario admin puede iniciar sesión
- [ ] Contraseña de admin cambiada
- [ ] Servidor funcionando correctamente
- [ ] Backup guardado (si usaste opción 2)
