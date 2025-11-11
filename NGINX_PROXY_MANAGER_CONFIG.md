# Configuración de Nginx Proxy Manager para DocuPrex

Esta guía explica cómo configurar Nginx Proxy Manager (NPM) para que DocuPrex funcione con HTTPS para usuarios internos con acceso al Active Directory y con HTTP para usuarios remotos sin acceso al AD.

## ⚠️ IMPORTANTE: Configuración Completada

**Cambios aplicados al proyecto (Configuración Segura):**
- ✅ `docker-compose.yml` configurado con redes aisladas
- ✅ Backend **NO expuesto** públicamente (puerto 5001 solo accesible internamente)
- ✅ Frontend expuesto solo en IP específica `192.168.0.30:5173` (no en 0.0.0.0)
- ✅ Contenedores conectados a la red de NPM (`npm_docker_default`)
- ✅ Código centralizado en `frontend/src/config/api.js` para URLs del backend
- ✅ Todos los componentes actualizados (App.jsx, Login.jsx, Dashboard.jsx, Notifications.jsx)
- ✅ Detección automática de protocolo (HTTP/HTTPS)
- ✅ Proxy de Vite usa nombres de contenedor (`firmas_server`) para comunicación interna
- ✅ Frontend accesible: `http://192.168.0.30:5173` (usuarios remotos) y `https://docuprex.com` (NPM con SSL)
- ✅ Backend **SOLO accesible internamente** dentro de la red Docker (más seguro)

---

## Arquitectura de Acceso

### Usuarios Internos (con AD)
```
Usuario → https://docuprex.com (NPM con SSL)
            ↓
       NPM (Docker) → firmas_frontend:5173 (nombre de contenedor)
            ↓
       Frontend (Vite) → firmas_server:5001 (comunicación interna Docker)
            ↓
       Backend (GraphQL/API)
```

### Usuarios Remotos (sin AD)
```
Usuario → http://192.168.0.30:5173 (Frontend directo)
            ↓
       Frontend (Vite) → firmas_server:5001 (comunicación interna Docker)
            ↓
       Backend (GraphQL/API)
```

**Nota de seguridad:** El backend (puerto 5001) **NO está expuesto** públicamente. Solo es accesible dentro de la red Docker.

---

## Configuración en Nginx Proxy Manager

### 1. Crear/Editar Proxy Host para el Frontend (Puerto 5173)

**Detalles básicos:**
- **Domain Names:**
  - `docuprex.com`
  - `www.docuprex.com`
- **Scheme:** `http`
- **Forward Hostname/IP:** `firmas_frontend` (**RECOMENDADO** - nombre de contenedor Docker)
  - Alternativa: `192.168.0.30` (funciona pero menos seguro)
- **Forward Port:** `5173`
- **Cache Assets:** ❌ Deshabilitado (importante para desarrollo)
- **Block Common Exploits:** ✅ Habilitado (opcional)
- **Websockets Support:** ❌ **DESHABILITADO** (causa que NPM marque el host como "Offline")

**SSL:**
- **SSL Certificate:** Seleccionar tu certificado autofirmado
- **Force SSL:** ❌ Deshabilitado (permitir HTTP directo para usuarios remotos)
- **HTTP/2 Support:** ✅ Habilitado
- **HSTS Enabled:** ❌ Deshabilitado (para no forzar HTTPS en todos lados)
- **HSTS Subdomains:** ❌ Deshabilitado

**Custom Nginx Configuration (pestaña Advanced):**
```nginx
# Headers para proxy correcto
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;

# Timeouts para operaciones largas
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
```

**NOTA IMPORTANTE sobre WebSockets:**
- **NO incluyas** configuración de WebSocket (`proxy_http_version 1.1`, `Upgrade`, `Connection`)
- **NO actives** "Websockets Support" en la pestaña Details
- Esto causa que NPM marque el host como "Offline" porque el health check de WebSocket falla
- El HMR de Vite funcionará correctamente por acceso directo HTTP (`192.168.0.30:5173`) durante desarrollo
- Los usuarios en producción (HTTPS) no necesitan HMR

---

### 2. Crear Proxy Host para el Backend (Puerto 5001) - OPCIONAL

Si quieres que los usuarios con HTTPS accedan al backend también por HTTPS, crea este proxy:

**Detalles básicos:**
- **Domain Names:**
  - `api.docuprex.com`
- **Scheme:** `http`
- **Forward Hostname/IP:** `192.168.0.30`
- **Forward Port:** `5001`
- **Cache Assets:** ❌ Deshabilitado
- **Block Common Exploits:** ✅ Habilitado
- **Websockets Support:** ✅ Habilitado

**SSL:**
- **SSL Certificate:** Seleccionar tu certificado autofirmado
- **Force SSL:** ❌ Deshabilitado
- **HTTP/2 Support:** ✅ Habilitado
- **HSTS Enabled:** ❌ Deshabilitado

**Custom Nginx Configuration:**
```nginx
# Headers para proxy correcto
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-Host $host;

# Para GraphQL y uploads grandes
client_max_body_size 100M;

# Timeouts para operaciones largas
proxy_connect_timeout 300s;
proxy_send_timeout 300s;
proxy_read_timeout 300s;
```

**NOTA:** Si creas este proxy, deberás ajustar el código frontend para que use `api.docuprex.com` cuando esté en HTTPS. La configuración actual **NO requiere** este proxy porque usa el proxy de Vite.

---

## Configuración Actual del Proyecto

### Cómo funciona la detección automática de protocolo

El frontend detecta automáticamente el protocolo de acceso:

**En [App.jsx](frontend/src/App.jsx):**
```javascript
const getBackendHost = () => {
  const protocol = window.location.protocol; // 'http:' o 'https:'
  const hostname = window.location.hostname;

  // Si estamos en HTTPS, usar rutas relativas para aprovechar el proxy de Vite
  if (protocol === 'https:') {
    return ''; // El proxy de Vite redirigirá a http://192.168.0.30:5001
  }

  // Si estamos en HTTP, usar URL absoluta con el puerto del backend
  return `http://${hostname}:5001`;
};
```

### Proxy de Vite configurado

**En [vite.config.js](frontend/vite.config.js):**
```javascript
proxy: {
  '/graphql': {
    target: 'http://192.168.0.30:5001',
    changeOrigin: true,
    secure: false
  },
  '/api': {
    target: 'http://192.168.0.30:5001',
    changeOrigin: true,
    secure: false
  },
  '/uploads': {
    target: 'http://192.168.0.30:5001',
    changeOrigin: true,
    secure: false
  }
}
```

Esto significa:
- Cuando acceden por `https://docuprex.com`, las llamadas a `/graphql`, `/api` y `/uploads` pasan por el proxy de Vite
- El proxy reenvía internamente a `http://192.168.0.30:5001`
- **NO hay mixed content** porque el navegador solo ve HTTPS

---

## Configuración del DNS en Active Directory

### Crear registro A en DNS del AD

1. Abrir **DNS Manager** en el servidor de Active Directory
2. Navegar a **Forward Lookup Zones** → `prexxa.local`
3. Click derecho → **New Host (A or AAAA)...**

**Para `docuprex.com`:**
- **Name:** `docuprex`
- **FQDN:** `docuprex.prexxa.local`
- **IP Address:** `192.168.0.30` (IP del servidor Nginx Proxy Manager)

**Para `www.docuprex.com`:**
- **Name:** `www.docuprex`
- **FQDN:** `www.docuprex.prexxa.local`
- **IP Address:** `192.168.0.30`

### Distribución del Certificado SSL por GPO

Tu certificado autofirmado ya está distribuido por política de grupo. Asegúrate de que:

1. El certificado esté en **Trusted Root Certification Authorities**
2. La GPO esté aplicada a todos los usuarios que deben acceder al sistema
3. Ejecutar `gpupdate /force` en los clientes si no se ha aplicado aún

---

## Verificación de la Configuración

### Test desde un usuario interno (con AD):

1. Abrir navegador en una PC conectada al dominio
2. Ir a `https://docuprex.com`
3. **Verificar:**
   - ✅ No aparece advertencia de seguridad (certificado confiable)
   - ✅ La URL muestra el candado verde/gris
   - ✅ El login funciona correctamente
   - ✅ No hay errores de CORS en la consola del navegador (F12)

### Test desde un usuario remoto (sin AD):

1. Abrir navegador en una PC **sin conexión al dominio**
2. Ir a `http://192.168.0.30:5173`
3. **Verificar:**
   - ✅ La aplicación carga correctamente
   - ✅ El login funciona
   - ✅ No hay errores de mixed content
   - ✅ No hay errores de CORS en la consola

---

## Troubleshooting

### Problema: "Mixed Content Blocked"

**Causa:** El navegador bloquea contenido HTTP desde una página HTTPS.

**Solución:**
- Verificar que el proxy de Vite esté configurado correctamente en `vite.config.js`
- Verificar que `App.jsx` use rutas relativas (`''`) cuando detecta HTTPS

### Problema: CORS error al acceder por HTTPS

**Causa:** El backend no reconoce el origen HTTPS.

**Solución:**
- Verificar que `server/.env` incluya las URLs HTTPS en `FRONTEND_URL`
- Verificar que `server.js` tenga `app.set('trust proxy', true)`
- Reiniciar el contenedor del backend: `docker-compose restart server`

### Problema: WebSocket error / HMR no funciona

**Causa:** Nginx no está reenviando las conexiones WebSocket.

**Solución:**
- Asegurarse de tener **Websockets Support** ✅ activado en NPM
- Verificar que la configuración personalizada de Nginx incluya:
  ```nginx
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  ```

### Problema: 502 Bad Gateway

**Causa:** El backend no está accesible o no está corriendo.

**Solución:**
```bash
# Verificar que los contenedores estén corriendo
docker-compose ps

# Si no están corriendo, iniciarlos
docker-compose up -d

# Ver logs del frontend
docker-compose logs -f frontend

# Ver logs del backend
docker-compose logs -f server
```

### Problema: Usuario remoto no puede acceder por IP

**Causa:** Firewall bloqueando el puerto 5173.

**Solución:**
```powershell
# En el servidor (Windows), abrir el puerto en el firewall
New-NetFirewallRule -DisplayName "Vite Frontend 5173" -Direction Inbound -LocalPort 5173 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Backend API 5001" -Direction Inbound -LocalPort 5001 -Protocol TCP -Action Allow
```

---

## Comandos Útiles

### Reiniciar solo el frontend (si cambias vite.config.js)
```bash
docker-compose restart frontend
```

### Reiniciar solo el backend (si cambias server.js o .env)
```bash
docker-compose restart server
```

### Ver logs en tiempo real
```bash
# Ambos servicios
docker-compose logs -f

# Solo frontend
docker-compose logs -f frontend

# Solo backend
docker-compose logs -f server
```

### Reconstruir contenedores después de cambios importantes
```bash
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

---

## Resumen de URLs de Acceso

| Tipo de Usuario | URL de Acceso | Protocolo | Certificado | Backend URL |
|----------------|---------------|-----------|-------------|-------------|
| **Interno (AD)** | `https://docuprex.com` | HTTPS | Autofirmado (confiable) | Via proxy Vite |
| **Interno (AD)** | `https://www.docuprex.com` | HTTPS | Autofirmado (confiable) | Via proxy Vite |
| **Remoto (sin AD)** | `http://192.168.0.30:5173` | HTTP | N/A | `http://192.168.0.30:5001` |

---

## Consideraciones de Seguridad

1. **Certificado autofirmado:** Está bien para uso interno, pero no es válido para acceso público desde Internet.

2. **Puerto expuesto (5173):** Asegúrate de que solo usuarios autorizados puedan acceder a la red `192.168.0.0/24`.

3. **CORS permisivo:** El backend permite todos los orígenes en desarrollo. Para producción, considera restringirlo.

4. **HTTPS opcional:** Los usuarios remotos acceden por HTTP sin cifrado. Si manejan datos sensibles, considera implementar VPN o SSL también para ellos.

5. **Active Directory:** La autenticación usa LDAP sin STARTTLS. Para mayor seguridad, considera habilitar `AD_STARTTLS=true` y configurar certificados en el AD.

---

## Próximos Pasos (Opcional)

Si quieres mejorar la configuración en el futuro:

1. **SSL/TLS para el backend:**
   - Configurar certificado SSL en Express (puerto 5001)
   - Cambiar Docker para exponer 5001 con HTTPS
   - Eliminar el proxy de Vite y usar URLs directas con HTTPS

2. **VPN para usuarios remotos:**
   - Implementar WireGuard o OpenVPN
   - Los usuarios remotos se conectan a la VPN
   - Acceden igual que los usuarios internos (por dominio con SSL)

3. **Certificado SSL válido:**
   - Usar Let's Encrypt con certbot
   - Configurar renovación automática
   - Válido solo si el dominio es público (no aplica para `.local`)
