# Sistema de Recordatorios de Firmas Pendientes

## Descripción

Sistema automático que envía recordatorios por correo electrónico a los firmantes que tienen documentos pendientes de firma por más de 2 días.

## Características

✅ **Automático**: Se ejecuta diariamente a las 9:00 AM
✅ **Inteligente**: Solo envía recordatorios a firmantes que están en su turno de firmar
✅ **No intrusivo**: Respeta la frecuencia (mínimo cada 2 días)
✅ **Respeta preferencias**: Solo envía a usuarios con notificaciones habilitadas
✅ **Mismo formato**: Usa el mismo correo que la asignación inicial

## Instalación

### 1. Aplicar la migración de base de datos

Ejecutar el siguiente comando desde la raíz del proyecto:

```bash
cd server
node scripts/apply-reminder-migration.js
```

O si prefieres ejecutar el SQL manualmente:

```bash
docker-compose exec db psql -U docuprex_user -d docuprex_db -f /app/database/migrations/005_add_reminder_timestamp.sql
```

### 2. Reiniciar el servidor

El servicio se iniciará automáticamente al reiniciar el servidor:

```bash
docker-compose restart backend
```

## Funcionamiento

### Condiciones para enviar recordatorio

Un recordatorio se envía cuando se cumplen TODAS estas condiciones:

1. ✅ La firma está en estado `pending`
2. ✅ El documento está en estado `pending`
3. ✅ Han pasado más de **2 días** desde la asignación
4. ✅ El usuario tiene `email_notifications = true`
5. ✅ El usuario está activo (`is_active = true`)
6. ✅ Es el **turno actual** del firmante (no hay firmas pendientes con orden menor)
7. ✅ No se ha enviado un recordatorio en los últimos 2 días

### Horario de ejecución

- **Primera ejecución**: A las 9:00 AM del día siguiente al inicio del servidor
- **Ejecuciones subsecuentes**: Cada 24 horas a las 9:00 AM

### Lógica de turnos

El sistema respeta el orden de firma (`order_position`):
- Solo envía recordatorios a firmantes cuyo turno es **ahora**
- Si hay firmantes anteriores sin firmar, NO envía recordatorio a los siguientes
- Ejemplo:
  - Orden 1: Pendiente → ✅ Envía recordatorio
  - Orden 2: Pendiente → ❌ No envía (esperando orden 1)
  - Orden 3: Pendiente → ❌ No envía (esperando orden 1)

## Estructura de la base de datos

### Nueva columna en `signatures`

```sql
ALTER TABLE signatures
ADD COLUMN last_reminder_sent_at TIMESTAMP WITH TIME ZONE;
```

- **Propósito**: Registrar cuándo se envió el último recordatorio
- **Uso**: Evitar enviar recordatorios con demasiada frecuencia
- **Índice**: Optimiza las consultas de búsqueda de firmas pendientes

## Logs y monitoreo

El servicio genera logs detallados:

```
📧 Verificando firmas pendientes para enviar recordatorios...
📬 Encontradas X firmas pendientes que requieren recordatorio
📤 Enviando recordatorio a [nombre] ([email])
   Documento: "[título]"
   Días pendientes: X
✅ Recordatorio enviado exitosamente a [email]
⏭️  Saltando recordatorio para [nombre] - no es su turno aún

📊 Resumen de recordatorios:
   ✅ Enviados: X
   ❌ Fallidos: X
   ⏭️  Saltados (no es su turno): X
```

## Pruebas manuales

### Ejecutar recordatorios inmediatamente

Puedes crear un script de prueba temporal:

```javascript
// test-reminders.js
const { sendPendingSignatureReminders } = require('./services/signatureReminders');

sendPendingSignatureReminders()
  .then(result => {
    console.log('Resultado:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
```

Ejecutar:
```bash
node test-reminders.js
```

### Verificar firmas pendientes

```sql
-- Ver firmas pendientes con más de 2 días
SELECT
  s.id,
  u.name as firmante,
  u.email,
  d.title as documento,
  s.created_at,
  s.last_reminder_sent_at,
  EXTRACT(DAY FROM NOW() - s.created_at) as dias_pendiente,
  ds.order_position
FROM signatures s
JOIN users u ON s.signer_id = u.id
JOIN documents d ON s.document_id = d.id
JOIN document_signers ds ON ds.document_id = s.document_id AND ds.user_id = s.signer_id
WHERE s.status = 'pending'
  AND d.status = 'pending'
  AND s.created_at < NOW() - INTERVAL '2 days'
ORDER BY s.created_at;
```

## Configuración

### Frecuencia de recordatorios

Para cambiar la frecuencia, modifica en `signatureReminders.js`:

```javascript
// Línea ~35: Cambiar el intervalo de 2 días
AND s.created_at < NOW() - INTERVAL '2 days'

// Línea ~47: Cambiar frecuencia mínima entre recordatorios
OR s.last_reminder_sent_at < NOW() - INTERVAL '2 days'
```

### Horario de ejecución

Para cambiar el horario, modifica en `signatureReminders.js`:

```javascript
// Línea ~144: Cambiar la hora (actualmente 9 AM)
9, // 9:00 AM
```

## Solución de problemas

### Los recordatorios no se envían

1. Verificar que el servicio esté iniciado (revisar logs del servidor)
2. Verificar configuración SMTP en `.env`
3. Verificar que existan firmas pendientes con más de 2 días
4. Verificar que los usuarios tengan `email_notifications = true`
5. Verificar que es el turno del firmante

### Correos no llegan

1. Revisar logs del servidor para ver errores de SMTP
2. Verificar credenciales SMTP en `.env`:
   ```
   SMTP_HOST=
   SMTP_PORT=
   SMTP_USER=
   SMTP_PASS=
   SMTP_FROM_EMAIL=
   SMTP_FROM_NAME=
   ```

### Demasiados recordatorios

Si un usuario recibe demasiados recordatorios:
- Verificar que `last_reminder_sent_at` se esté actualizando correctamente
- Ajustar el intervalo en la query (actualmente 2 días)

## Mantenimiento

### Deshabilitar el servicio temporalmente

Comentar en `server.js`:

```javascript
// startReminderService();
```

### Ver estadísticas de recordatorios

```sql
-- Conteo de recordatorios enviados por día
SELECT
  DATE(last_reminder_sent_at) as fecha,
  COUNT(*) as recordatorios_enviados
FROM signatures
WHERE last_reminder_sent_at IS NOT NULL
GROUP BY DATE(last_reminder_sent_at)
ORDER BY fecha DESC;
```

## Mejoras futuras

- [ ] Panel de administración para ver recordatorios pendientes
- [ ] Configuración de frecuencia desde la interfaz
- [ ] Diferentes plantillas de correo para recordatorios
- [ ] Escalado de urgencia (más recordatorios después de X días)
- [ ] Notificaciones al creador del documento
