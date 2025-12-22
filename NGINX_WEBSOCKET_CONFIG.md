# Configuración de WebSocket en Nginx Proxy Manager

## Para que funcione con HTTPS (docuprex.com y www.docuprex.com)

### En Nginx Proxy Manager, agregar estas líneas en "Custom Nginx Configuration":

```nginx
# WebSocket support
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# WebSocket timeouts
proxy_read_timeout 86400;
proxy_send_timeout 86400;
```

### Pasos en NPM:

1. **Editar el Proxy Host** para `docuprex.com`
2. Ir a la pestaña **"Advanced"**
3. En **"Custom Nginx Configuration"** pegar el código de arriba
4. Guardar
5. Repetir para `www.docuprex.com`

### Verificar:

- Backend (GraphQL): `https://docuprex.com/graphql`
- WebSocket: `wss://docuprex.com` (Socket.IO usa el mismo path)
- Frontend: `https://docuprex.com`

### Configuración funciona para:

- ✅ `https://docuprex.com` → `wss://docuprex.com`
- ✅ `https://www.docuprex.com` → `wss://www.docuprex.com`
- ✅ `http://192.168.0.30:5173` → `ws://192.168.0.30:5001`
- ✅ `http://localhost:5173` → `ws://localhost:5001`
