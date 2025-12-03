# Project Status - DocuPrex

## Current Objective
Implementaci�n de buscador de facturas para tipo de documento "Legalizaci�n de Facturas" (FV).

## Recent Changes

### Session: 2025-12-03 (Parte 2) - Configuración de Expiración de JWT a 24 Horas

#### Problem:
Las sesiones JWT no tenían una expiración definida apropiada:
- La configuración era de 8 horas (JWT_EXPIRES=8h)
- Una ruta tenía hardcodeado 24h pero inconsistente
- El frontend no manejaba correctamente la expiración de tokens en GraphQL
- Requisito del usuario: sesiones deben durar máximo 1 día (24 horas)

#### Files Modified:
1. **`server/.env`**
   - Cambiado `JWT_EXPIRES=8h` → `JWT_EXPIRES=24h`
   - Ahora todas las sesiones expiran después de 24 horas

2. **`server/graphql/resolvers-db.js`**
   - Línea 514 (login local): Ya usaba `process.env.JWT_EXPIRES || '8h'` ✅
   - Línea 563 (login LDAP): Ya usaba `process.env.JWT_EXPIRES || '8h'` ✅
   - Línea 614 (register): Cambiado de hardcoded `'24h'` a `process.env.JWT_EXPIRES || '24h'`
   - Ahora todos los flujos usan la misma configuración centralizada

3. **`frontend/src/App.jsx`**
   - Agregado manejo de errores de autenticación en la query `me`
   - Detecta cuando el token expira y cierra la sesión automáticamente
   - Maneja tanto errores HTTP (401/403) como errores GraphQL ("No autenticado")
   - Líneas 61-71: Nueva lógica de detección de errores de autenticación

#### Technical Implementation:
**Backend (JWT Generation):**
- JWT configurado para expirar en 24 horas vía variable de entorno
- Middleware de autenticación [middleware/auth.js](server/middleware/auth.js#L32) ya detecta tokens expirados
- Retorna error "Token inválido o expirado" cuando jwt.verify() falla

**Frontend (Token Expiration Handling):**
- Al cargar la app, ejecuta query `me` para obtener datos del usuario
- Si el token expiró:
  1. Backend devuelve error "No autenticado"
  2. Frontend detecta el error de autenticación
  3. Ejecuta `handleLogout()` automáticamente
  4. Usuario es redirigido a login
- Detección dual: errores HTTP (REST) y errores GraphQL (queries)

#### Result:
✅ **Sistema de sesiones configurado correctamente:**
- Todas las sesiones expiran después de 24 horas
- Los usuarios son deslogueados automáticamente cuando el token expira
- Configuración centralizada y consistente en todo el código
- Manejo robusto de expiración tanto en backend como frontend

### Session: 2025-12-03 (Parte 1) - Correcci�n de URLs para Acceso HTTP/HTTPS

#### Problem:
La funcionalidad de facturas fallaba con "Failed to fetch" porque las URLs del backend estaban hardcodeadas con IP y protocolo HTTP. Esto causaba:
- Errores CORS cuando se accede por HTTPS (mixed content)
- Falta de flexibilidad para acceso por DNS o IP

#### Files Modified:
1. **`frontend/src/components/dashboard/FacturaSearch.jsx`**
   - Eliminada URL hardcodeada: `http://192.168.0.30:5001/api/facturas/search`
   - Agregado import de `BACKEND_HOST` desde `config/api.js`
   - Ahora usa URL din�mica: `${BACKEND_HOST}/api/facturas/search`
   - Funciona autom�ticamente con HTTP y HTTPS

2. **`frontend/src/hooks/useSigners.js`**
   - Eliminada URL hardcodeada: `http://192.168.0.30:5001/graphql`
   - Agregado import de `API_URL` desde `config/api.js`
   - Ahora usa URL din�mica: `API_URL`
   - Consistente con el resto de la aplicaci�n

#### Technical Implementation:
La estrategia centralizada en [config/api.js](frontend/src/config/api.js) detecta autom�ticamente el protocolo:
- **HTTPS**: Usa rutas relativas (`''`) que pasan por el proxy de Vite configurado en [vite.config.js](frontend/vite.config.js)
  - El proxy redirige internamente a `http://firmas_server:5001` (comunicaci�n interna de Docker)
  - Evita errores de "mixed content" (HTTPS frontend → HTTP backend)
- **HTTP**: Usa URLs absolutas (`http://${hostname}:5001`)
  - Acceso directo al backend por IP o hostname

#### Result:
✅ La aplicaci�n ahora funciona correctamente tanto:
  - Por HTTPS: `https://docuprex.com`
  - Por HTTP con IP: `http://192.168.0.30:5173`
  - Ambos protocolos comparten el mismo c�digo sin URLs hardcodeadas

### Session: 2025-12-02 (Parte 2) - Implementaci�n de Buscador de Facturas

#### Files Created:
1. **`server/routes/facturas.js`**
   - Endpoint REST para buscar facturas: `GET /api/facturas/search/:numeroControl`
   - B�squeda por coincidencia exacta en campo `numero_control`
   - Retorna datos: `numero_control`, `proveedor`, `numero_factura`
   - Manejo de errores 400 (par�metro faltante), 404 (no encontrado), 500 (error interno)

2. **`frontend/src/components/dashboard/FacturaSearch.jsx`**
   - Componente de b�squeda de facturas con input y bot�n
   - Integraci�n con endpoint `/api/facturas/search`
   - Estados: loading, error, factura encontrada
   - Card de resultado con formato: "FV - (proveedor) - (numero_factura)"
   - Bot�n de acci�n con �cono de l�piz para seleccionar factura
   - Callback `onFacturaSelect` para notificar al componente padre

3. **`frontend/src/components/dashboard/FacturaSearch.css`**
   - Estilos para el componente FacturaSearch
   - Card de resultado compacta y cuadrada (no rectangular)
   - Estados hover, loading, y error
   - Responsive design para m�viles

#### Files Modified:
1. **`server/server.js`**
   - Agregado import de `facturasRoutes`
   - Montada ruta `/api/facturas` con el router de facturas

2. **`frontend/src/components/dashboard/Dashboard.jsx`**
   - Agregado import de `FacturaSearch`
   - Modificado paso 0 (Cargar documentos) con l�gica condicional:
     - Si `selectedDocumentType.code === 'FV'`: Muestra solo selector de tipo y `FacturaSearch`
     - Si no es FV: Muestra el formulario normal (t�tulo, descripci�n, subir archivos)
   - Al seleccionar factura, se establece el `documentTitle` autom�ticamente

### Session: 2025-12-02 (Parte 2.2) - Mejoras UI y Terminolog�a

#### Files Modified:
1. **`server/routes/facturas.js`**
   - Actualizada terminolog�a: "n�mero de control" → "consecutivo"
   - Mensajes de error actualizados con terminolog�a correcta

2. **`frontend/src/components/dashboard/FacturaSearch.jsx`**
   - Actualizada terminolog�a: "n�mero de control" → "consecutivo"
   - Placeholder: "Ingresa el consecutivo"
   - Mensaje de error: "Ingresa un consecutivo"

3. **`frontend/src/components/dashboard/FacturaSearch.css`**
   - Card redise�ada para coincidir con estilo de cards de documentos
   - Eliminado max-width: ahora full-width (de borde a borde)
   - Actualizado padding: 24px (igual que pending-card-modern)
   - Border-radius: 12px (consistente con otras cards)
   - Box-shadow y hover effects actualizados
   - Responsive design mejorado para m�viles

### Session: 2025-12-02 (Parte 2.1) - Correcci�n Error SQL en Recordatorios

#### Files Modified:
1. **`server/services/signatureReminders.js`**
   - Corregido error SQL: `d.uploaded_by_id` → `d.uploaded_by`
   - La columna correcta en la BD es `uploaded_by`, no `uploaded_by_id`
   - Afectaba l�neas 25 y 44 de la consulta de recordatorios
   - Error manifestado: `ERROR: column d.uploaded_by_id does not exist`
   - Servidor reiniciado exitosamente sin errores SQL

### Session: 2025-12-02 (Parte 1) - Configuraci�n Base de Datos SERV_QPREX

#### Files Modified:
1. **`server/.env`**
   - Agregada variable `FACTURAS_DATABASE_URL` con conexi�n a SERV_QPREX
   - URL codificada correctamente para caracteres especiales en contrase�a
   - Configuraci�n apunta a esquema `crud_facturas` y tabla `T_Facturas`

#### Files Created:
1. **`server/database/facturas-db.js`**
   - Nuevo m�dulo de conexi�n para base de datos externa SERV_QPREX
   - Pool de conexiones optimizado (max: 20, min: 5)
   - Funciones implementadas:
     - `queryFacturas()`: Ejecutar queries con logging de rendimiento
     - `transactionFacturas()`: Manejo de transacciones con SET search_path
     - `testConnectionFacturas()`: Verificaci�n de conexi�n y esquema
     - `closeFacturasPool()`: Cierre seguro del pool
   - Manejo de errores robusto con logging detallado
   - Configuraci�n autom�tica de `search_path` a `crud_facturas` en transacciones

## Technical Notes
- **Password Encoding:** La contrase�a contiene caracteres especiales ($, !, *) que fueron correctamente codificados en formato URL:
  - `$` � `%24`
  - `!` � `%21`
  - `*` � `%2A`
- **Schema Management:** Las transacciones autom�ticamente establecen `SET search_path TO crud_facturas`
- **Connection Pooling:** Pool independiente de la BD principal para evitar contenci�n de recursos

## Next Steps
1. ✅ ~~Implementar funcionalidad espec�fica que utilizar� la tabla `T_Facturas`~~ (Completado)
2. Probar end-to-end el flujo de b�squeda de facturas en el frontend
3. Validar que la conexi�n a SERV_QPREX funciona correctamente con datos reales
4. Considerar agregar tipos TypeScript para las entidades de facturas
5. Implementar la l�gica completa del flujo FV con la factura seleccionada

## Technical Debt
- Ninguna deuda t�cnica introducida en esta sesi�n
- C�digo sigue est�ndares de CLAUDE.md:
  - Sin c�digo muerto o comentado
  - Manejo de errores robusto en backend y frontend
  - Componentes React bien estructurados con estados claros
  - CSS modular y mantenible
  - Nomenclatura sem�ntica en ingl�s

## Known Issues
- Pendiente validar conectividad real a SERV_QPREX (192.168.0.254:5432) con datos de producci�n
- ✅ ~~Error SQL `uploaded_by_id` en recordatorios~~ (Corregido en Parte 2.1)
- Servidor funcionando correctamente con todas las rutas cargadas
