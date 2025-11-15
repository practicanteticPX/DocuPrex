/**
 * Utilidades de validación
 * Funciones reutilizables para validar datos en la aplicación
 */

import {
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE,
  REGEX_PATTERNS,
  CHAR_LIMITS,
  ERROR_MESSAGES
} from './constants';

// ============================================
// VALIDACIÓN DE ARCHIVOS
// ============================================

/**
 * Valida que un archivo sea PDF
 * @param {File} file - Archivo a validar
 * @returns {boolean}
 */
export const isValidFileType = (file) => {
  if (!file) return false;
  return file.type === ALLOWED_FILE_TYPES.PDF || file.name.toLowerCase().endsWith('.pdf');
};

/**
 * Valida que un archivo no exceda el tamaño máximo
 * @param {File} file - Archivo a validar
 * @returns {boolean}
 */
export const isValidFileSize = (file) => {
  if (!file) return false;
  return file.size <= MAX_FILE_SIZE;
};

/**
 * Valida un archivo completamente (tipo y tamaño)
 * @param {File} file - Archivo a validar
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateFile = (file) => {
  if (!file) {
    return { valid: false, error: ERROR_MESSAGES.REQUIRED_FIELD };
  }

  if (!isValidFileType(file)) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_FILE_TYPE };
  }

  if (!isValidFileSize(file)) {
    return { valid: false, error: ERROR_MESSAGES.FILE_TOO_LARGE };
  }

  return { valid: true };
};

/**
 * Valida múltiples archivos
 * @param {File[]} files - Archivos a validar
 * @returns {{ valid: boolean, errors: string[] }}
 */
export const validateFiles = (files) => {
  if (!files || files.length === 0) {
    return { valid: false, errors: [ERROR_MESSAGES.REQUIRED_FIELD] };
  }

  const errors = [];

  files.forEach((file, index) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      errors.push(`Archivo ${index + 1}: ${validation.error}`);
    }
  });

  return {
    valid: errors.length === 0,
    errors
  };
};

// ============================================
// VALIDACIÓN DE TEXTO
// ============================================

/**
 * Valida que un campo de texto no esté vacío
 * @param {string} value - Valor a validar
 * @returns {boolean}
 */
export const isNotEmpty = (value) => {
  return value && value.trim().length > 0;
};

/**
 * Valida que un texto no exceda cierto límite de caracteres
 * @param {string} value - Valor a validar
 * @param {number} limit - Límite de caracteres
 * @returns {boolean}
 */
export const isWithinCharLimit = (value, limit) => {
  return !value || value.length <= limit;
};

/**
 * Valida un título de documento
 * @param {string} title - Título a validar
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateDocumentTitle = (title) => {
  if (!isNotEmpty(title)) {
    return { valid: false, error: 'El título es requerido.' };
  }

  if (!isWithinCharLimit(title, CHAR_LIMITS.DOCUMENT_TITLE)) {
    return {
      valid: false,
      error: `El título no puede exceder ${CHAR_LIMITS.DOCUMENT_TITLE} caracteres.`
    };
  }

  return { valid: true };
};

/**
 * Valida una descripción de documento
 * @param {string} description - Descripción a validar
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateDocumentDescription = (description) => {
  // La descripción es opcional
  if (!description || description.trim() === '') {
    return { valid: true };
  }

  if (!isWithinCharLimit(description, CHAR_LIMITS.DOCUMENT_DESCRIPTION)) {
    return {
      valid: false,
      error: `La descripción no puede exceder ${CHAR_LIMITS.DOCUMENT_DESCRIPTION} caracteres.`
    };
  }

  return { valid: true };
};

/**
 * Valida una razón de rechazo
 * @param {string} reason - Razón a validar
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateRejectReason = (reason) => {
  if (!isNotEmpty(reason)) {
    return { valid: false, error: 'La razón de rechazo es requerida.' };
  }

  if (!isWithinCharLimit(reason, CHAR_LIMITS.REJECT_REASON)) {
    return {
      valid: false,
      error: `La razón no puede exceder ${CHAR_LIMITS.REJECT_REASON} caracteres.`
    };
  }

  return { valid: true };
};

/**
 * Valida un consecutivo
 * @param {string} consecutivo - Consecutivo a validar
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateConsecutivo = (consecutivo) => {
  if (!isNotEmpty(consecutivo)) {
    return { valid: false, error: 'El consecutivo es requerido.' };
  }

  if (!REGEX_PATTERNS.CONSECUTIVO.test(consecutivo)) {
    return {
      valid: false,
      error: 'El consecutivo solo puede contener letras mayúsculas, números y guiones.'
    };
  }

  if (!isWithinCharLimit(consecutivo, CHAR_LIMITS.CONSECUTIVO)) {
    return {
      valid: false,
      error: `El consecutivo no puede exceder ${CHAR_LIMITS.CONSECUTIVO} caracteres.`
    };
  }

  return { valid: true };
};

// ============================================
// VALIDACIÓN DE EMAIL
// ============================================

/**
 * Valida un email
 * @param {string} email - Email a validar
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  if (!email) return false;
  return REGEX_PATTERNS.EMAIL.test(email);
};

// ============================================
// VALIDACIÓN DE FIRMANTES
// ============================================

/**
 * Valida que haya al menos un firmante seleccionado
 * @param {Array} signers - Array de firmantes
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateSigners = (signers) => {
  if (!signers || signers.length === 0) {
    return { valid: false, error: ERROR_MESSAGES.NO_SIGNERS_SELECTED };
  }

  return { valid: true };
};

/**
 * Valida el orden de los firmantes
 * @param {Array} signers - Array de firmantes con propiedad order
 * @returns {{ valid: boolean, error?: string }}
 */
export const validateSignersOrder = (signers) => {
  if (!signers || signers.length === 0) {
    return { valid: false, error: ERROR_MESSAGES.NO_SIGNERS_SELECTED };
  }

  // Verificar que todos tengan un orden válido
  const hasInvalidOrder = signers.some(signer => {
    return typeof signer.order !== 'number' || signer.order < 1;
  });

  if (hasInvalidOrder) {
    return { valid: false, error: ERROR_MESSAGES.INVALID_ORDER };
  }

  // Verificar que no haya órdenes duplicados
  const orders = signers.map(s => s.order);
  const uniqueOrders = new Set(orders);

  if (orders.length !== uniqueOrders.size) {
    return { valid: false, error: 'Hay firmantes con el mismo orden.' };
  }

  return { valid: true };
};

// ============================================
// VALIDACIÓN DE IDS
// ============================================

/**
 * Valida un ID de documento
 * @param {string} id - ID a validar
 * @returns {boolean}
 */
export const isValidDocumentId = (id) => {
  if (!id) return false;
  return REGEX_PATTERNS.DOCUMENT_ID.test(id);
};

// ============================================
// VALIDACIÓN DE FORMULARIOS
// ============================================

/**
 * Valida un formulario de subida de documento
 * @param {{ file: File, title: string, description?: string }} data
 * @returns {{ valid: boolean, errors: Object }}
 */
export const validateUploadForm = (data) => {
  const errors = {};
  let isValid = true;

  // Validar archivo
  const fileValidation = validateFile(data.file);
  if (!fileValidation.valid) {
    errors.file = fileValidation.error;
    isValid = false;
  }

  // Validar título
  const titleValidation = validateDocumentTitle(data.title);
  if (!titleValidation.valid) {
    errors.title = titleValidation.error;
    isValid = false;
  }

  // Validar descripción (opcional)
  if (data.description) {
    const descValidation = validateDocumentDescription(data.description);
    if (!descValidation.valid) {
      errors.description = descValidation.error;
      isValid = false;
    }
  }

  return { valid: isValid, errors };
};

/**
 * Valida un formulario de asignación de firmantes
 * @param {{ signers: Array, documentType?: string }} data
 * @returns {{ valid: boolean, errors: Object }}
 */
export const validateSignersForm = (data) => {
  const errors = {};
  let isValid = true;

  // Validar que haya firmantes
  const signersValidation = validateSigners(data.signers);
  if (!signersValidation.valid) {
    errors.signers = signersValidation.error;
    isValid = false;
  }

  // Validar orden si hay firmantes
  if (data.signers && data.signers.length > 0) {
    const orderValidation = validateSignersOrder(data.signers);
    if (!orderValidation.valid) {
      errors.order = orderValidation.error;
      isValid = false;
    }
  }

  return { valid: isValid, errors };
};

// ============================================
// HELPERS
// ============================================

/**
 * Sanitiza un string removiendo caracteres especiales
 * @param {string} str - String a sanitizar
 * @returns {string}
 */
export const sanitizeString = (str) => {
  if (!str) return '';
  return str.trim().replace(/[<>]/g, '');
};

/**
 * Trunca un texto a cierto número de caracteres
 * @param {string} text - Texto a truncar
 * @param {number} maxLength - Longitud máxima
 * @returns {string}
 */
export const truncateText = (text, maxLength) => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};
