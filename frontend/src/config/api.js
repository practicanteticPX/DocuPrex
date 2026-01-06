/**
 * Configuración centralizada de URLs del backend
 *
 * Este archivo centraliza toda la lógica de construcción de URLs para el backend,
 * permitiendo que la aplicación funcione tanto con HTTP como con HTTPS.
 *
 * Estrategia:
 * - En HTTPS: Usa rutas relativas que pasan por el proxy de Vite
 * - En HTTP: Usa URLs absolutas con el puerto del backend
 */

/**
 * Obtiene la URL base del backend según el protocolo de acceso
 * @returns {string} URL base del backend (vacío para usar proxy, URL completa para acceso directo)
 */
export const getBackendUrl = () => {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port;

  // Si estamos en el puerto 5173 (frontend Vite), usar el proxy interno
  // Esto aplica tanto para desarrollo (vite dev) como producción (vite preview)
  if (port === '5173') {
    return ''; // Rutas relativas usan el proxy de Vite
  }

  // HTTPS: Usar mismo dominio (proxy reverso maneja el routing)
  if (protocol === 'https:') {
    return `https://${hostname}`;
  }

  // HTTP con dominio (no IP): Asumir proxy en puerto 80
  if (hostname !== 'localhost' && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    return `http://${hostname}`;
  }

  // HTTP con IP o localhost: Usar puerto 5001 directo
  return `http://${hostname}:5001`;
};

// URL base del backend
export const BACKEND_HOST = getBackendUrl();

// Endpoints principales
export const API_URL = `${BACKEND_HOST}/graphql`;
export const API_UPLOAD_URL = `${BACKEND_HOST}/api/upload`;
export const API_UPLOAD_MULTI_URL = `${BACKEND_HOST}/api/upload-multiple`;
export const API_UPLOAD_UNIFIED_URL = `${BACKEND_HOST}/api/upload-unified`;

/**
 * Construye la URL para acceder a un archivo subido
 * @param {string} filePath - Ruta del archivo
 * @returns {string} URL completa del archivo
 */
export const getDocumentUrl = (filePath) => {
  if (!filePath) return '';

  // Si la ruta comienza con /app/uploads (formato antiguo), convertir a ruta relativa
  if (filePath.startsWith('/app/uploads/')) {
    return `${BACKEND_HOST}/uploads/${filePath.replace('/app/uploads/', '')}`;
  }

  // Si la ruta comienza con uploads/ (formato nuevo), usar directamente
  if (filePath.startsWith('uploads/')) {
    return `${BACKEND_HOST}/${filePath}`;
  }

  // Si no tiene ningún prefijo, asumir que es relativo a uploads/
  return `${BACKEND_HOST}/uploads/${filePath}`;
};

/**
 * Construye la URL para descargar un documento por ID
 * @param {number|string} documentId - ID del documento
 * @returns {string} URL de descarga
 */
export const getDownloadUrl = (documentId) => {
  return `${BACKEND_HOST}/api/download/${documentId}`;
};

/**
 * Construye la URL para visualizar un documento por ID
 * @param {number|string} documentId - ID del documento
 * @returns {string} URL de visualización
 */
export const getViewUrl = (documentId) => {
  return `${BACKEND_HOST}/api/view/${documentId}`;
};

/**
 * Obtiene la URL del WebSocket según el protocolo de acceso
 * Funciona con HTTP, HTTPS, localhost, IP, dominio, con/sin puerto
 * @returns {string} URL completa del WebSocket (ws:// o wss://)
 */
export const getWebSocketUrl = () => {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port;
  const wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';

  // Si estamos en puerto 5173, conectar directamente al backend en 5001
  // (WebSocket no puede usar el proxy HTTP de Vite)
  if (port === '5173') {
    return `${wsProtocol}//${hostname}:5001`;
  }

  // HTTPS: Usar proxy reverso en el mismo dominio
  if (protocol === 'https:') {
    return `${wsProtocol}//${hostname}`;
  }

  // HTTP con dominio (no IP): Usar puerto 5001
  if (hostname !== 'localhost' && !hostname.match(/^\d+\.\d+\.\d+\.\d+$/)) {
    return `${wsProtocol}//${hostname}:5001`;
  }

  // HTTP con IP o localhost: Usar puerto 5001
  return `${wsProtocol}//${hostname}:5001`;
};
