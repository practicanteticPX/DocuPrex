/**
 * Utilidades helpers generales
 * Funciones de ayuda para operaciones comunes
 */

// ============================================
// HELPERS DE ARRAY
// ============================================

/**
 * Ordena un array de objetos por una propiedad
 * @param {Array} array - Array a ordenar
 * @param {string} key - Propiedad por la cual ordenar
 * @param {string} order - 'asc' o 'desc'
 * @returns {Array}
 */
export const sortBy = (array, key, order = 'asc') => {
  if (!array || !Array.isArray(array)) return [];

  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
};

/**
 * Agrupa un array de objetos por una propiedad
 * @param {Array} array - Array a agrupar
 * @param {string} key - Propiedad por la cual agrupar
 * @returns {Object}
 */
export const groupBy = (array, key) => {
  if (!array || !Array.isArray(array)) return {};

  return array.reduce((result, item) => {
    const groupKey = item[key];
    if (!result[groupKey]) {
      result[groupKey] = [];
    }
    result[groupKey].push(item);
    return result;
  }, {});
};

/**
 * Filtra valores únicos de un array
 * @param {Array} array - Array a filtrar
 * @returns {Array}
 */
export const unique = (array) => {
  if (!array || !Array.isArray(array)) return [];
  return [...new Set(array)];
};

/**
 * Remueve un elemento de un array por índice
 * @param {Array} array - Array original
 * @param {number} index - Índice a remover
 * @returns {Array}
 */
export const removeAt = (array, index) => {
  if (!array || !Array.isArray(array)) return [];
  return [...array.slice(0, index), ...array.slice(index + 1)];
};

/**
 * Mueve un elemento en un array
 * @param {Array} array - Array original
 * @param {number} fromIndex - Índice origen
 * @param {number} toIndex - Índice destino
 * @returns {Array}
 */
export const moveItem = (array, fromIndex, toIndex) => {
  if (!array || !Array.isArray(array)) return [];

  const newArray = [...array];
  const [removed] = newArray.splice(fromIndex, 1);
  newArray.splice(toIndex, 0, removed);

  return newArray;
};

// ============================================
// HELPERS DE OBJETO
// ============================================

/**
 * Verifica si un objeto está vacío
 * @param {Object} obj - Objeto a verificar
 * @returns {boolean}
 */
export const isEmpty = (obj) => {
  if (!obj) return true;
  return Object.keys(obj).length === 0;
};

/**
 * Selecciona propiedades específicas de un objeto
 * @param {Object} obj - Objeto origen
 * @param {Array} keys - Propiedades a seleccionar
 * @returns {Object}
 */
export const pick = (obj, keys) => {
  if (!obj || !keys || !Array.isArray(keys)) return {};

  return keys.reduce((result, key) => {
    if (obj.hasOwnProperty(key)) {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

/**
 * Omite propiedades específicas de un objeto
 * @param {Object} obj - Objeto origen
 * @param {Array} keys - Propiedades a omitir
 * @returns {Object}
 */
export const omit = (obj, keys) => {
  if (!obj || !keys || !Array.isArray(keys)) return obj;

  return Object.keys(obj).reduce((result, key) => {
    if (!keys.includes(key)) {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

/**
 * Hace una copia profunda de un objeto
 * @param {*} obj - Objeto a copiar
 * @returns {*}
 */
export const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  return JSON.parse(JSON.stringify(obj));
};

// ============================================
// HELPERS DE STRING
// ============================================

/**
 * Genera un ID único aleatorio
 * @param {number} length - Longitud del ID
 * @returns {string}
 */
export const generateId = (length = 16) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  return result;
};

/**
 * Convierte un string a slug
 * @param {string} str - String a convertir
 * @returns {string}
 */
export const slugify = (str) => {
  if (!str) return '';

  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/[^\w\s-]/g, '') // Remover caracteres especiales
    .replace(/\s+/g, '-') // Reemplazar espacios con guiones
    .replace(/-+/g, '-') // Reemplazar múltiples guiones con uno solo
    .trim();
};

/**
 * Busca un texto dentro de otro (case insensitive)
 * @param {string} text - Texto donde buscar
 * @param {string} search - Texto a buscar
 * @returns {boolean}
 */
export const searchInText = (text, search) => {
  if (!text || !search) return false;

  return text.toLowerCase().includes(search.toLowerCase());
};

// ============================================
// HELPERS DE TIEMPO
// ============================================

/**
 * Espera un tiempo determinado
 * @param {number} ms - Milisegundos a esperar
 * @returns {Promise}
 */
export const sleep = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Debounce de una función
 * @param {Function} func - Función a ejecutar
 * @param {number} wait - Tiempo de espera en ms
 * @returns {Function}
 */
export const debounce = (func, wait) => {
  let timeout;

  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * Throttle de una función
 * @param {Function} func - Función a ejecutar
 * @param {number} limit - Límite de tiempo en ms
 * @returns {Function}
 */
export const throttle = (func, limit) => {
  let inThrottle;

  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

// ============================================
// HELPERS DE NAVEGACIÓN
// ============================================

/**
 * Navega a una URL
 * @param {string} url - URL destino
 */
export const navigateTo = (url) => {
  window.location.href = url;
};

/**
 * Recarga la página
 */
export const reloadPage = () => {
  window.location.reload();
};

/**
 * Abre una URL en nueva pestaña
 * @param {string} url - URL a abrir
 */
export const openInNewTab = (url) => {
  window.open(url, '_blank', 'noopener,noreferrer');
};

/**
 * Descarga un archivo
 * @param {string} url - URL del archivo
 * @param {string} filename - Nombre del archivo
 */
export const downloadFile = (url, filename) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'download';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

// ============================================
// HELPERS DE STORAGE
// ============================================

/**
 * Guarda en localStorage
 * @param {string} key - Clave
 * @param {*} value - Valor
 */
export const setLocalStorage = (key, value) => {
  try {
    const serialized = JSON.stringify(value);
    localStorage.setItem(key, serialized);
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
};

/**
 * Obtiene de localStorage
 * @param {string} key - Clave
 * @param {*} defaultValue - Valor por defecto
 * @returns {*}
 */
export const getLocalStorage = (key, defaultValue = null) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return defaultValue;
  }
};

/**
 * Remueve de localStorage
 * @param {string} key - Clave
 */
export const removeLocalStorage = (key) => {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Error removing from localStorage:', error);
  }
};

/**
 * Limpia localStorage
 */
export const clearLocalStorage = () => {
  try {
    localStorage.clear();
  } catch (error) {
    console.error('Error clearing localStorage:', error);
  }
};

/**
 * Guarda en sessionStorage
 * @param {string} key - Clave
 * @param {*} value - Valor
 */
export const setSessionStorage = (key, value) => {
  try {
    const serialized = JSON.stringify(value);
    sessionStorage.setItem(key, serialized);
  } catch (error) {
    console.error('Error saving to sessionStorage:', error);
  }
};

/**
 * Obtiene de sessionStorage
 * @param {string} key - Clave
 * @param {*} defaultValue - Valor por defecto
 * @returns {*}
 */
export const getSessionStorage = (key, defaultValue = null) => {
  try {
    const item = sessionStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Error reading from sessionStorage:', error);
    return defaultValue;
  }
};

// ============================================
// HELPERS DE CLIPBOARD
// ============================================

/**
 * Copia texto al clipboard
 * @param {string} text - Texto a copiar
 * @returns {Promise<boolean>}
 */
export const copyToClipboard = async (text) => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback para navegadores antiguos
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch (err) {
      document.body.removeChild(textArea);
      return false;
    }
  } catch (error) {
    console.error('Error copying to clipboard:', error);
    return false;
  }
};

// ============================================
// HELPERS DE VALIDACIÓN
// ============================================

/**
 * Verifica si estamos en desarrollo
 * @returns {boolean}
 */
export const isDevelopment = () => {
  return import.meta.env.DEV || import.meta.env.MODE === 'development';
};

/**
 * Verifica si estamos en producción
 * @returns {boolean}
 */
export const isProduction = () => {
  return import.meta.env.PROD || import.meta.env.MODE === 'production';
};

/**
 * Verifica si un valor es una función
 * @param {*} value - Valor a verificar
 * @returns {boolean}
 */
export const isFunction = (value) => {
  return typeof value === 'function';
};

/**
 * Verifica si un valor es un objeto
 * @param {*} value - Valor a verificar
 * @returns {boolean}
 */
export const isObject = (value) => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

/**
 * Verifica si un valor es un array
 * @param {*} value - Valor a verificar
 * @returns {boolean}
 */
export const isArray = (value) => {
  return Array.isArray(value);
};

// ============================================
// HELPERS DE ERROR
// ============================================

/**
 * Extrae el mensaje de error de un error
 * @param {*} error - Error
 * @param {string} defaultMessage - Mensaje por defecto
 * @returns {string}
 */
export const getErrorMessage = (error, defaultMessage = 'Ocurrió un error inesperado') => {
  if (!error) return defaultMessage;

  if (typeof error === 'string') return error;

  if (error.message) return error.message;

  if (error.graphQLErrors && error.graphQLErrors.length > 0) {
    return error.graphQLErrors[0].message;
  }

  if (error.networkError) {
    return 'Error de conexión. Por favor, verifica tu conexión a internet.';
  }

  return defaultMessage;
};

/**
 * Verifica si un error es de autenticación
 * @param {*} error - Error
 * @returns {boolean}
 */
export const isAuthError = (error) => {
  if (!error) return false;

  const message = getErrorMessage(error).toLowerCase();

  return (
    message.includes('autenticado') ||
    message.includes('authenticated') ||
    message.includes('no autenticado') ||
    message.includes('unauthorized') ||
    message.includes('401')
  );
};

/**
 * Verifica si un error es de red
 * @param {*} error - Error
 * @returns {boolean}
 */
export const isNetworkError = (error) => {
  if (!error) return false;

  return (
    error.networkError ||
    error.message?.includes('Network') ||
    error.message?.includes('fetch')
  );
};

// ============================================
// HELPERS DE CLASE CSS
// ============================================

/**
 * Combina clases CSS condicionalmente
 * @param {...any} classes - Clases a combinar
 * @returns {string}
 */
export const classNames = (...classes) => {
  return classes
    .filter(Boolean)
    .map(cls => {
      if (typeof cls === 'string') return cls;
      if (typeof cls === 'object') {
        return Object.keys(cls)
          .filter(key => cls[key])
          .join(' ');
      }
      return '';
    })
    .join(' ')
    .trim();
};

// ============================================
// HELPERS DE LOG
// ============================================

/**
 * Log condicional (solo en desarrollo)
 * @param {...any} args - Argumentos a loguear
 */
export const devLog = (...args) => {
  if (isDevelopment()) {
    console.log(...args);
  }
};

/**
 * Error log condicional (solo en desarrollo)
 * @param {...any} args - Argumentos a loguear
 */
export const devError = (...args) => {
  if (isDevelopment()) {
    console.error(...args);
  }
};

/**
 * Warning log condicional (solo en desarrollo)
 * @param {...any} args - Argumentos a loguear
 */
export const devWarn = (...args) => {
  if (isDevelopment()) {
    console.warn(...args);
  }
};
