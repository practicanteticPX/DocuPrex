/**
 * Utilidades de formateo
 * Funciones reutilizables para formatear datos en la aplicación
 */

import {
  DOCUMENT_STATUS_LABELS,
  SIGNATURE_STATUS_LABELS,
  USER_ROLE_LABELS,
  NOTIFICATION_TYPE_LABELS
} from './constants';

// ============================================
// FORMATEO DE FECHAS
// ============================================

/**
 * Formatea una fecha a formato legible en español
 * @param {string|Date} date - Fecha a formatear
 * @param {Object} options - Opciones de formateo
 * @returns {string}
 */
export const formatDate = (date, options = {}) => {
  if (!date) return '-';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '-';

  const defaultOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options
  };

  return dateObj.toLocaleDateString('es-ES', defaultOptions);
};

/**
 * Formatea una fecha a formato corto (dd/mm/yyyy)
 * @param {string|Date} date - Fecha a formatear
 * @returns {string}
 */
export const formatDateShort = (date) => {
  if (!date) return '-';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '-';

  return dateObj.toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
};

/**
 * Formatea una fecha con hora
 * @param {string|Date} date - Fecha a formatear
 * @returns {string}
 */
export const formatDateTime = (date) => {
  if (!date) return '-';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '-';

  return dateObj.toLocaleString('es-ES', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Formatea una fecha a formato relativo (hace 2 horas, hace 3 días, etc.)
 * @param {string|Date} date - Fecha a formatear
 * @returns {string}
 */
export const formatRelativeTime = (date) => {
  if (!date) return '-';

  const dateObj = typeof date === 'string' ? new Date(date) : date;

  if (isNaN(dateObj.getTime())) return '-';

  const now = new Date();
  const diffMs = now - dateObj;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return 'Hace un momento';
  if (diffMin < 60) return `Hace ${diffMin} minuto${diffMin > 1 ? 's' : ''}`;
  if (diffHour < 24) return `Hace ${diffHour} hora${diffHour > 1 ? 's' : ''}`;
  if (diffDay < 7) return `Hace ${diffDay} día${diffDay > 1 ? 's' : ''}`;
  if (diffWeek < 4) return `Hace ${diffWeek} semana${diffWeek > 1 ? 's' : ''}`;
  if (diffMonth < 12) return `Hace ${diffMonth} mes${diffMonth > 1 ? 'es' : ''}`;
  return `Hace ${diffYear} año${diffYear > 1 ? 's' : ''}`;
};

// ============================================
// FORMATEO DE NÚMEROS
// ============================================

/**
 * Formatea un número con separadores de miles
 * @param {number} num - Número a formatear
 * @returns {string}
 */
export const formatNumber = (num) => {
  if (typeof num !== 'number') return '-';
  return num.toLocaleString('es-ES');
};

/**
 * Formatea bytes a tamaño legible (KB, MB, GB)
 * @param {number} bytes - Bytes a formatear
 * @param {number} decimals - Decimales a mostrar
 * @returns {string}
 */
export const formatFileSize = (bytes, decimals = 2) => {
  if (!bytes || bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// ============================================
// FORMATEO DE ESTADOS
// ============================================

/**
 * Formatea un estado de documento a texto legible
 * @param {string} status - Estado del documento
 * @returns {string}
 */
export const formatDocumentStatus = (status) => {
  return DOCUMENT_STATUS_LABELS[status] || status || '-';
};

/**
 * Formatea un estado de firma a texto legible
 * @param {string} status - Estado de la firma
 * @returns {string}
 */
export const formatSignatureStatus = (status) => {
  return SIGNATURE_STATUS_LABELS[status] || status || '-';
};

/**
 * Formatea un rol de usuario a texto legible
 * @param {string} role - Rol del usuario
 * @returns {string}
 */
export const formatUserRole = (role) => {
  return USER_ROLE_LABELS[role] || role || '-';
};

/**
 * Formatea un tipo de notificación a texto legible
 * @param {string} type - Tipo de notificación
 * @returns {string}
 */
export const formatNotificationType = (type) => {
  return NOTIFICATION_TYPE_LABELS[type] || type || '-';
};

// ============================================
// FORMATEO DE NOMBRES
// ============================================

/**
 * Formatea un nombre completo (capitaliza primera letra de cada palabra)
 * @param {string} name - Nombre a formatear
 * @returns {string}
 */
export const formatName = (name) => {
  if (!name) return '-';

  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Obtiene las iniciales de un nombre
 * @param {string} name - Nombre completo
 * @returns {string}
 */
export const getInitials = (name) => {
  if (!name) return '?';

  const parts = name.trim().split(' ');

  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

// ============================================
// FORMATEO DE TEXTO
// ============================================

/**
 * Capitaliza la primera letra de un texto
 * @param {string} text - Texto a capitalizar
 * @returns {string}
 */
export const capitalize = (text) => {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

/**
 * Convierte texto a mayúsculas
 * @param {string} text - Texto a convertir
 * @returns {string}
 */
export const toUpperCase = (text) => {
  if (!text) return '';
  return text.toUpperCase();
};

/**
 * Convierte texto a minúsculas
 * @param {string} text - Texto a convertir
 * @returns {string}
 */
export const toLowerCase = (text) => {
  if (!text) return '';
  return text.toLowerCase();
};

/**
 * Trunca un texto y agrega "..."
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Longitud máxima
 * @returns {string}
 */
export const truncate = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Pluraliza una palabra basándose en la cantidad
 * @param {number} count - Cantidad
 * @param {string} singular - Palabra en singular
 * @param {string} plural - Palabra en plural (opcional)
 * @returns {string}
 */
export const pluralize = (count, singular, plural = null) => {
  if (count === 1) return singular;
  return plural || `${singular}s`;
};

// ============================================
// FORMATEO DE DOCUMENTOS
// ============================================

/**
 * Formatea el nombre de archivo removiendo extensión y caracteres especiales
 * @param {string} fileName - Nombre del archivo
 * @returns {string}
 */
export const formatFileName = (fileName) => {
  if (!fileName) return '-';

  // Remover extensión
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, '');

  // Reemplazar guiones bajos y guiones con espacios
  return nameWithoutExt.replace(/[-_]/g, ' ');
};

/**
 * Formatea un ID de documento para mostrar
 * @param {string} id - ID del documento
 * @returns {string}
 */
export const formatDocumentId = (id) => {
  if (!id) return '-';

  // Si el ID es muy largo, mostrar solo los primeros y últimos caracteres
  if (id.length > 16) {
    return `${id.substring(0, 8)}...${id.substring(id.length - 8)}`;
  }

  return id;
};

// ============================================
// FORMATEO DE LISTAS
// ============================================

/**
 * Formatea una lista de nombres a string
 * @param {Array} names - Array de nombres
 * @param {number} maxDisplay - Máximo de nombres a mostrar
 * @returns {string}
 */
export const formatNamesList = (names, maxDisplay = 3) => {
  if (!names || names.length === 0) return '-';

  if (names.length <= maxDisplay) {
    return names.join(', ');
  }

  const displayed = names.slice(0, maxDisplay).join(', ');
  const remaining = names.length - maxDisplay;

  return `${displayed} y ${remaining} más`;
};

/**
 * Formatea un progreso de firmas
 * @param {number} signed - Cantidad de firmantes que firmaron
 * @param {number} total - Total de firmantes
 * @returns {string}
 */
export const formatSignatureProgress = (signed, total) => {
  if (typeof signed !== 'number' || typeof total !== 'number') return '-';
  return `${signed}/${total} firmado${signed !== 1 ? 's' : ''}`;
};

/**
 * Calcula el porcentaje de progreso
 * @param {number} current - Valor actual
 * @param {number} total - Valor total
 * @returns {number}
 */
export const calculateProgress = (current, total) => {
  if (!total || total === 0) return 0;
  return Math.round((current / total) * 100);
};

// ============================================
// FORMATEO DE URLS
// ============================================

/**
 * Construye una query string desde un objeto
 * @param {Object} params - Parámetros
 * @returns {string}
 */
export const buildQueryString = (params) => {
  if (!params || Object.keys(params).length === 0) return '';

  const query = Object.entries(params)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');

  return query ? `?${query}` : '';
};

/**
 * Parsea una query string a objeto
 * @param {string} queryString - Query string
 * @returns {Object}
 */
export const parseQueryString = (queryString) => {
  if (!queryString) return {};

  const query = queryString.startsWith('?') ? queryString.substring(1) : queryString;

  return query.split('&').reduce((acc, param) => {
    const [key, value] = param.split('=');
    if (key) {
      acc[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
    return acc;
  }, {});
};

// ============================================
// HELPERS DE COMPARACIÓN
// ============================================

/**
 * Compara dos fechas
 * @param {string|Date} date1
 * @param {string|Date} date2
 * @returns {number} -1 si date1 < date2, 0 si iguales, 1 si date1 > date2
 */
export const compareDates = (date1, date2) => {
  const d1 = typeof date1 === 'string' ? new Date(date1) : date1;
  const d2 = typeof date2 === 'string' ? new Date(date2) : date2;

  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
};

/**
 * Verifica si una fecha es hoy
 * @param {string|Date} date - Fecha a verificar
 * @returns {boolean}
 */
export const isToday = (date) => {
  if (!date) return false;

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();

  return (
    dateObj.getDate() === today.getDate() &&
    dateObj.getMonth() === today.getMonth() &&
    dateObj.getFullYear() === today.getFullYear()
  );
};

/**
 * Verifica si una fecha es de esta semana
 * @param {string|Date} date - Fecha a verificar
 * @returns {boolean}
 */
export const isThisWeek = (date) => {
  if (!date) return false;

  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);

  return dateObj >= weekAgo && dateObj <= today;
};
