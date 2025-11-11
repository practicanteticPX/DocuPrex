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
 * @returns {string} URL base del backend (vacío para HTTPS, 'http://hostname:5001' para HTTP)
 */
export const getBackendUrl = () => {
  const protocol = window.location.protocol; // 'http:' o 'https:'
  const hostname = window.location.hostname;

  // Si estamos en HTTPS, usar rutas relativas para aprovechar el proxy de Vite
  // Esto evita problemas de mixed content (HTTPS -> HTTP)
  if (protocol === 'https:') {
    return ''; // Ruta relativa, el proxy de Vite redirigirá a http://192.168.0.19:5001
  }

  // Si estamos en HTTP, usar URL absoluta con el puerto del backend
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
