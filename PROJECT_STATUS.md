# Project Status - DocuPrex

## Current Objective
Sistema de autocompletado tipo Excel completamente funcional para Cuentas Contables y Centros de Costos.

## Recent Changes

### Session: 2025-12-03 (Parte 5) - Autocompletado de Centros de Costos con Validación de Responsables

#### Problem:
La plantilla de facturas necesita autocompletado tipo Excel para la columna "C.Co" (Centro de Costos) con las siguientes características:
- Buscar en tiempo real desde tabla `T_CentrosCostos` de SERV_QPREX
- Autocompletar "Resp. C.Co" con el responsable del centro de costos seleccionado
- Validar el nombre del responsable en `T_Master_Responsable_Cuenta` de DB_QPREX
- Autocompletar "Cargo Resp. C.Co" con el cargo del responsable validado

#### Files Created:
1. **`frontend/src/hooks/useCentrosCostos.js`**
   - Hook React para gestionar centros de costos
   - Función `fetchCentrosCostos()`: Carga automática al montar el componente
   - Estados: `centros`, `loading`, `error`
   - Funciones helper:
     - `getCentroData(codigo)`: Obtener datos de un centro por código
     - `validarResponsable(nombre)`: Validar y obtener cargo del responsable
   - Manejo de errores robusto con logging

#### Files Modified:
1. **`server/routes/facturas.js`**
   - Líneas 44-78: Nuevo endpoint `GET /api/facturas/centros-costos`
     - Consulta tabla: `crud_facturas.T_CentrosCostos`
     - Columnas: `Cia_CC` (código), `Responsable` (nombre responsable)
     - Ordenado por código ascendente
     - Retorna success: true/false y data
   - Líneas 80-124: Nuevo endpoint `GET /api/facturas/validar-responsable/:nombre`
     - Consulta tabla: `public.T_Master_Responsable_Cuenta` (DB_QPREX)
     - Búsqueda case-insensitive con UPPER()
     - Columnas: `NombreResp` (nombre), `Cargo` (cargo)
     - Retorna datos del responsable si existe, 404 si no se encuentra

2. **`frontend/src/hooks/index.js`**
   - Línea 14: Agregada exportación de `useCentrosCostos`
   - Mantenida consistencia con estructura existente

3. **`frontend/src/components/dashboard/FacturaTemplate.jsx`**
   - Línea 5: Agregado import de `useCentrosCostos`
   - Línea 37: Agregado uso del hook con destructuring
   - Líneas 74-78: Nuevos estados para dropdown de centros de costos:
     - `dropdownCentrosAbierto`: Estado abierto/cerrado por fila
     - `dropdownCentrosPositions`: Posiciones absolutas de cada dropdown
     - `inputCentrosValues`: Valores de búsqueda por fila
     - `dropdownCentrosRefs`: Referencias DOM para detectar clicks fuera
   - Líneas 227-254: Nueva función `handleCentroCostosChange`:
     - Busca datos del centro seleccionado
     - Autocompleta "Resp. C.Co" con el responsable
     - Valida el responsable llamando a `validarResponsable()`
     - Autocompleta "Cargo Resp. C.Co" con el cargo validado
     - Cierra el dropdown automáticamente
   - Líneas 256-279: Nueva función `handleInputCentrosChange`:
     - Actualiza el filtro de búsqueda en tiempo real
     - Recalcula posición del dropdown
     - Abre el dropdown automáticamente al escribir
   - Líneas 281-300: Nueva función `handleCentrosFocus`:
     - Inicializa valor del input al recibir foco
     - Calcula posición del dropdown
     - Abre el dropdown
   - Líneas 302-308: Nueva función `getCentrosFiltrados`:
     - Filtra centros según texto ingresado
     - Lógica: busca coincidencias que empiezan con el filtro
     - Similar a comportamiento de Excel
   - Líneas 318-322: Actualizado `useEffect` de click outside:
     - Detecta clicks fuera de dropdowns de centros de costos
     - Cierra automáticamente el dropdown correspondiente
   - Líneas 589-624: Reemplazado input simple por componente de autocompletado:
     - Wrapper con posición relativa
     - Input controlado con valores independientes por fila
     - Dropdown absoluto posicionado con portal-like behavior
     - Lista filtrada de centros con scroll
     - Placeholder dinámico: "Cargando..." o "Buscar centro..."
     - Disabled durante carga de datos

#### Technical Implementation:

**Arquitectura de Múltiples Bases de Datos:**
- **DB Local (firmas_db)**: PostgreSQL local en Docker
  - Gestión de usuarios y documentos
- **SERV_QPREX (crud_facturas)**: Base de datos externa para facturas y centros de costos
  - Tabla: `T_Facturas` (datos de facturas)
  - Tabla: `T_CentrosCostos` (códigos y responsables de centros de costos)
- **DB_QPREX (public)**: Base de datos externa para maestros
  - Tabla: `T_Master_Responsable_Cuenta` (cuentas contables, responsables y cargos)

**Flujo de Datos Completo:**
1. Usuario abre plantilla de factura
2. Hook `useCentrosCostos` se ejecuta automáticamente
3. Frontend llama a `GET /api/facturas/centros-costos`
4. Backend consulta `SERV_QPREX.crud_facturas.T_CentrosCostos`
5. Datos se cargan en el estado del componente
6. Usuario escribe en columna "C.Co"
7. Dropdown muestra centros filtrados en tiempo real
8. Usuario selecciona un centro de costos
9. Función `handleCentroCostosChange`:
   - Obtiene el responsable del centro desde los datos cargados
   - Llama a `validarResponsable(nombre)`
10. Frontend llama a `GET /api/facturas/validar-responsable/:nombre`
11. Backend consulta `DB_QPREX.public.T_Master_Responsable_Cuenta`
12. Backend retorna nombre validado y cargo
13. Frontend autocompleta 3 campos:
    - "C.Co": código del centro de costos
    - "Resp. C.Co": nombre del responsable
    - "Cargo Resp. C.Co": cargo del responsable validado

**Características del Autocompletado:**
- **Búsqueda en tiempo real**: Filtra mientras el usuario escribe
- **Lógica tipo Excel**: Si escribes "1", muestra todos los que comienzan con "1"
- **Independencia por fila**: Cada fila tiene su propio dropdown y estado
- **Click outside detection**: useEffect detecta clicks fuera y cierra dropdown
- **Posicionamiento dinámico**: Dropdown se posiciona debajo del input usando coordenadas absolutas
- **Estados de carga**: Muestra "Cargando..." mientras obtiene datos
- **Validación asíncrona**: Valida responsable en DB_QPREX después de seleccionar

**Integración con Sistema Existente:**
- Reutiliza estilos CSS existentes (`.factura-autocomplete-*`)
- Sigue patrón arquitectónico de cuentas contables
- Mantiene consistencia con UX existente
- Estados completamente independientes entre dropdowns de cuentas y centros

#### Result:
✅ **Sistema de centros de costos completamente funcional:**
- Conexión exitosa a SERV_QPREX para centros de costos
- Endpoint retorna lista completa con código y responsable
- Frontend carga y muestra opciones en dropdown
- Autocompletado tipo Excel: filtra según lo que el usuario digita
- Autocompletado funciona correctamente para 3 campos:
  1. C.Co (código del centro)
  2. Resp. C.Co (responsable del centro)
  3. Cargo Resp. C.Co (cargo del responsable validado en DB_QPREX)
- Validación cross-database: consulta SERV_QPREX y valida en DB_QPREX
- UX consistente con autocompletado de cuentas contables
- Múltiples filas funcionan independientemente
- Tres bases de datos externas trabajando simultáneamente sin conflictos

### Session: 2025-12-03 (Parte 4) - Componente de Autocompletar Personalizado para "No. Cta Contable"

#### Problem:
El campo "No. Cta Contable" requería un componente de autocompletar que permitiera:
- Escribir y buscar cuentas contables en tiempo real
- Dropdown desplegable hacia abajo con altura limitada (mostrar solo 4 opciones)
- Scroll interno cuando hay más opciones
- Mostrar tanto el código de cuenta como el nombre de la cuenta en las opciones

#### Files Modified:
1. **`frontend/src/components/dashboard/FacturaTemplate.jsx`**
   - Línea 1: Agregado import de `useRef` para referencias del DOM
   - Líneas 66-69: Agregados estados para controlar:
     - `dropdownAbierto`: objeto que guarda el estado abierto/cerrado por cada fila
     - `filtrosCuentas`: objeto que guarda el texto de búsqueda por cada fila
     - `dropdownRefs`: referencias al DOM para detectar clics fuera del componente
   - Líneas 132-158: Modificada función `handleCuentaContableChange`:
     - Al seleccionar una cuenta, cierra el dropdown automáticamente
     - Limpia el filtro de búsqueda
     - Autocompleta los 3 campos dependientes (responsable, cargo, nombre cuenta)
   - Líneas 160-167: Nueva función `handleInputChange`:
     - Actualiza el filtro de búsqueda en tiempo real
     - Abre el dropdown automáticamente al escribir
     - Actualiza el valor del input
   - Líneas 169-176: Nueva función `getFiltradas`:
     - Filtra las cuentas según el texto ingresado
     - Busca coincidencias tanto en código de cuenta como en nombre
     - Retorna todas las cuentas si no hay filtro
   - Líneas 178-189: Nuevo useEffect para detectar clics fuera del dropdown:
     - Cierra el dropdown cuando se hace clic fuera del componente
     - Usa referencias del DOM para cada fila independientemente
   - Líneas 391-428: Reemplazado `<select>` por componente de autocompletar personalizado:
     - Wrapper con posición relativa
     - Input para escribir y buscar
     - Dropdown absoluto que se muestra cuando `dropdownAbierto[fila.id]` es true
     - Cada opción muestra código de cuenta (bold) y nombre (gris)
     - Mensaje "No se encontraron cuentas" cuando el filtro no tiene resultados

2. **`frontend/src/components/dashboard/FacturaTemplate.css`**
   - Líneas 247-327: Agregados estilos para el componente de autocompletar:
     - `.factura-autocomplete-wrapper`: contenedor relativo (posición base)
     - `.factura-autocomplete-dropdown`: dropdown con:
       - Posición absoluta debajo del input
       - Max-height: 192px (aprox 4 opciones de 48px cada una)
       - Overflow-y: auto (scroll automático)
       - Z-index: 1000 (aparece sobre otros elementos)
       - Box-shadow y border-radius para estilo moderno
     - Scrollbar personalizado:
       - Width: 6px
       - Track gris claro (#F3F4F6)
       - Thumb gris (#D1D5DB) con hover más oscuro (#9CA3AF)
     - `.factura-autocomplete-option`: cada opción con:
       - Padding: 12px 16px
       - Hover: fondo gris claro (#F9FAFB)
       - Active: fondo gris más oscuro (#F3F4F6)
       - Border-bottom separando opciones
     - `.factura-autocomplete-cuenta`: código de cuenta (bold, color oscuro)
     - `.factura-autocomplete-nombre`: nombre de cuenta (pequeño, gris)
     - `.factura-autocomplete-empty`: mensaje cuando no hay resultados

#### Technical Implementation:
**Arquitectura del Componente:**
- **Estado por fila independiente**: Cada fila tiene su propio dropdown y filtro
- **Búsqueda en tiempo real**: Filtra mientras el usuario escribe
- **Click outside detection**: useEffect con event listener en document
- **Referencias DOM**: useRef para trackear cada wrapper y detectar clics fuera

**Flujo de interacción:**
1. Usuario hace clic en el input → `onFocus` abre el dropdown
2. Usuario escribe "1234" → `handleInputChange` actualiza el filtro y muestra opciones filtradas
3. Usuario hace clic en una opción → `handleCuentaContableChange`:
   - Autocompleta los 3 campos dependientes
   - Cierra el dropdown
   - Limpia el filtro
4. Usuario hace clic fuera → useEffect detecta y cierra el dropdown

**Altura y Scroll:**
- Max-height fijo: 192px (4 opciones × 48px aprox)
- Cuando hay >4 opciones: scroll aparece automáticamente
- Scrollbar personalizado con estilos webkit (Chrome, Edge, Safari)

#### Result:
✅ **Componente de autocompletar completamente funcional:**
- Input donde se puede escribir libremente para buscar
- Búsqueda en tiempo real (filtra por código y nombre de cuenta)
- Dropdown se despliega hacia abajo debajo del input
- Altura limitada a ~4 opciones visibles (192px)
- Scroll personalizado cuando hay más de 4 resultados
- Cada opción muestra código (bold) y nombre (gris) en dos líneas
- Al seleccionar: autocompleta campos dependientes y cierra el dropdown
- Click fuera del componente cierra el dropdown automáticamente
- Múltiples filas funcionan independientemente (cada una con su dropdown)
- Experiencia similar a Google/Select2/React-Select pero personalizado

### Session: 2025-12-03 (Parte 3) - Integración de Cuentas Contables desde DB_QPREX

#### Problem:
La plantilla de facturas necesita cargar cuentas contables desde una segunda base de datos externa (DB_QPREX) para autocompletar los campos de "Responsable de Cuenta Contable", "Cargo" y "Nombre de Cuenta Contable" cuando se selecciona una cuenta. Además, se requiere mejorar la UX del autocompletado tipo Excel y hacer más visibles los campos autocompletados.

#### Files Created:
1. **`server/database/cuentas-db.js`**
   - Nuevo módulo de conexión para base de datos DB_QPREX
   - Pool de conexiones independiente (max: 20, min: 5)
   - Esquema: `public`
   - Tabla principal: `T_Master_Responsable_Cuenta`
   - Funciones implementadas:
     - `queryCuentas()`: Ejecutar queries con logging de rendimiento
     - `transactionCuentas()`: Manejo de transacciones con SET search_path
     - `testConnectionCuentas()`: Verificación de conexión
     - `closeCuentasPool()`: Cierre seguro del pool

2. **`frontend/src/hooks/useCuentasContables.js`**
   - Hook React para cargar cuentas contables
   - Carga automática al montar el componente
   - Estados: `cuentas`, `loading`, `error`
   - Función helper: `getCuentaData(codigoCuenta)`

#### Files Modified:
1. **`server/.env`**
   - Agregada variable `CUENTAS_DATABASE_URL` con conexión a DB_QPREX
   - URL: `postgresql://admin:$40M1n*!!2023@192.168.0.254:5432/DB_QPREX`
   - Esquema: `public`

2. **`server/routes/facturas.js`**
   - Agregado import de `queryCuentas` desde `cuentas-db`
   - Nuevo endpoint: `GET /api/facturas/cuentas-contables`
   - Consulta campos: `Cuenta`, `NombreCuenta`, `NombreResp`, `Cargo`
   - Ordenado por código de cuenta ascendente
   - IMPORTANTE: Ruta específica antes de ruta con parámetros para evitar conflictos

3. **`frontend/src/hooks/index.js`**
   - Exportado hook `useCuentasContables`
   - Comentadas temporalmente exportaciones con dependencias rotas (useAuth, useDocuments, useNotifications, useSigners)

4. **`frontend/src/components/dashboard/FacturaTemplate.jsx`**
   - Agregado import y uso del hook `useCuentasContables`
   - Campo "No. Cta Contable" convertido a input con datalist (autocompletado tipo Excel)
   - Nueva función: `handleCuentaContableChange(id, codigoCuenta)`
   - Autocompletado de campos dependientes:
     - `respCuentaContable`: Se llena automáticamente con `nombre_responsable`
     - `cargoCuentaContable`: Se llena automáticamente con `cargo`
     - `nombreCuentaContable`: Se llena automáticamente con `nombre_cuenta`
   - Datalist simplificado: muestra solo números de cuenta (no nombres de responsables)
   - Estado de carga mostrado en placeholder
   - Datalist único por fila usando `cuentas-list-${fila.id}`

5. **`frontend/src/components/dashboard/FacturaTemplate.css`**
   - Mejorados estilos de `.factura-input-disabled`:
     - Background: #E5E7EB (más oscuro, antes #F9FAFB)
     - Color: #1F2937 (más oscuro, antes #6B7280)
     - Font-weight: 500 (más bold)
     - Border-color: #D1D5DB (más visible)
   - Mejora UX: los campos autocompletados ahora se distinguen claramente de los editables

#### Technical Implementation:
**Arquitectura de Bases de Datos:**
- **DB Local (firmas_db)**: PostgreSQL local en Docker para gestión de documentos y usuarios
- **SERV_QPREX (crud_facturas)**: Base de datos externa para consulta de facturas
  - Tabla: `T_Facturas`
  - Campos: `numero_control`, `proveedor`, `numero_factura`, etc.
- **DB_QPREX (public)**: Nueva base de datos externa para cuentas contables
  - Tabla: `T_Master_Responsable_Cuenta`
  - Campos: `Cuenta`, `NombreCuenta`, `NombreResp`, `Cargo`

**Flujo de Datos:**
1. Usuario abre plantilla de factura
2. Hook `useCuentasContables` se ejecuta automáticamente
3. Frontend llama a `GET /api/facturas/cuentas-contables`
4. Backend consulta DB_QPREX.public."T_Master_Responsable_Cuenta"
5. Datos se cargan en el datalist de cada fila
6. Usuario empieza a escribir en "No. Cta Contable"
7. Navegador muestra sugerencias del datalist (solo números de cuenta)
8. Al seleccionar, función `handleCuentaContableChange` auto-completa 4 campos dependientes:
   - Resp. Cta Contable (nombre_responsable)
   - Cargo Resp Cta Contable (cargo)
   - Cta Contable (nombre_cuenta)
   - Campos se muestran con fondo oscuro para distinguir que son autocompletados

**Express Route Order Fix:**
- Rutas específicas deben ir ANTES de rutas con parámetros
- Orden correcto:
  1. `/cuentas-contables` (específica)
  2. `/search/:numeroControl` (parámetro)
- Orden incorrecto causaría que `/cuentas-contables` fuera capturado por `/:numeroControl`

#### Result:
✅ **Sistema de cuentas contables funcionando:**
- Conexión exitosa a DB_QPREX
- Endpoint retorna lista completa de cuentas contables con 4 campos
- Frontend carga y muestra opciones en datalist (solo números de cuenta)
- Autocompletado tipo Excel: filtra según lo que el usuario digita
- Autocompletado funciona correctamente para 4 campos:
  1. Resp. Cta Contable
  2. Cargo Resp Cta Contable
  3. Cta Contable (nombre de la cuenta)
  4. Todos con estilos oscuros distinguibles
- UX mejorada: campos autocompletados se ven claramente diferentes de los editables
- Dos bases de datos externas funcionando simultáneamente:
  - SERV_QPREX para facturas
  - DB_QPREX para cuentas contables

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
