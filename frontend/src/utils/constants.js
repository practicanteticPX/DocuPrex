/**
 * Constantes compartidas de la aplicación DocuPrex
 * Centraliza todos los valores constantes para facilitar mantenimiento
 */

// ============================================
// ESTADOS DE DOCUMENTOS
// ============================================
export const DOCUMENT_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  ARCHIVED: 'archived'
};

export const DOCUMENT_STATUS_LABELS = {
  [DOCUMENT_STATUS.PENDING]: 'Pendiente',
  [DOCUMENT_STATUS.IN_PROGRESS]: 'En Proceso',
  [DOCUMENT_STATUS.COMPLETED]: 'Completado',
  [DOCUMENT_STATUS.REJECTED]: 'Rechazado',
  [DOCUMENT_STATUS.ARCHIVED]: 'Archivado'
};

// ============================================
// ESTADOS DE FIRMAS
// ============================================
export const SIGNATURE_STATUS = {
  PENDING: 'pending',
  SIGNED: 'signed',
  REJECTED: 'rejected'
};

export const SIGNATURE_STATUS_LABELS = {
  [SIGNATURE_STATUS.PENDING]: 'Pendiente',
  [SIGNATURE_STATUS.SIGNED]: 'Firmado',
  [SIGNATURE_STATUS.REJECTED]: 'Rechazado'
};

// ============================================
// ROLES DE USUARIO
// ============================================
export const USER_ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  APPROVER: 'approver'
};

export const USER_ROLE_LABELS = {
  [USER_ROLES.ADMIN]: 'Administrador',
  [USER_ROLES.USER]: 'Usuario',
  [USER_ROLES.APPROVER]: 'Aprobador'
};

// ============================================
// TIPOS DE NOTIFICACIONES
// ============================================
export const NOTIFICATION_TYPES = {
  SIGNATURE_REQUEST: 'signature_request',
  DOCUMENT_SIGNED: 'document_signed',
  DOCUMENT_COMPLETED: 'document_completed',
  DOCUMENT_REJECTED: 'document_rejected',
  DOCUMENT_ASSIGNED: 'document_assigned',
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error'
};

export const NOTIFICATION_TYPE_LABELS = {
  [NOTIFICATION_TYPES.SIGNATURE_REQUEST]: 'Solicitud de Firma',
  [NOTIFICATION_TYPES.DOCUMENT_SIGNED]: 'Documento Firmado',
  [NOTIFICATION_TYPES.DOCUMENT_COMPLETED]: 'Documento Completado',
  [NOTIFICATION_TYPES.DOCUMENT_REJECTED]: 'Documento Rechazado',
  [NOTIFICATION_TYPES.DOCUMENT_ASSIGNED]: 'Documento Asignado',
  [NOTIFICATION_TYPES.INFO]: 'Información',
  [NOTIFICATION_TYPES.SUCCESS]: 'Éxito',
  [NOTIFICATION_TYPES.WARNING]: 'Advertencia',
  [NOTIFICATION_TYPES.ERROR]: 'Error'
};

// ============================================
// TABS DEL DASHBOARD
// ============================================
export const DASHBOARD_TABS = {
  UPLOAD: 'upload',
  PENDING: 'pending',
  SIGNED: 'signed',
  MY_DOCUMENTS: 'my-documents',
  REJECTED_BY_ME: 'rejected-by-me',
  REJECTED_BY_OTHERS: 'rejected-by-others'
};

export const DASHBOARD_TAB_LABELS = {
  [DASHBOARD_TABS.UPLOAD]: 'Subir Documento',
  [DASHBOARD_TABS.PENDING]: 'Pendientes',
  [DASHBOARD_TABS.SIGNED]: 'Firmados',
  [DASHBOARD_TABS.MY_DOCUMENTS]: 'Mis Documentos',
  [DASHBOARD_TABS.REJECTED_BY_ME]: 'Rechazados por Mí',
  [DASHBOARD_TABS.REJECTED_BY_OTHERS]: 'Rechazados por Otros'
};

// ============================================
// TIPOS DE ARCHIVOS PERMITIDOS
// ============================================
export const ALLOWED_FILE_TYPES = {
  PDF: 'application/pdf'
};

export const ALLOWED_FILE_EXTENSIONS = ['.pdf'];

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const MAX_FILE_SIZE_LABEL = '50 MB';

// ============================================
// MENSAJES DE ERROR
// ============================================
export const ERROR_MESSAGES = {
  NETWORK_ERROR: 'Error de conexión. Por favor, verifica tu conexión a internet.',
  AUTH_ERROR: 'Error de autenticación. Por favor, inicia sesión nuevamente.',
  FILE_TOO_LARGE: `El archivo es demasiado grande. Tamaño máximo: ${MAX_FILE_SIZE_LABEL}`,
  INVALID_FILE_TYPE: 'Tipo de archivo no válido. Solo se permiten archivos PDF.',
  UPLOAD_FAILED: 'Error al subir el archivo. Por favor, intenta nuevamente.',
  DOCUMENT_NOT_FOUND: 'Documento no encontrado.',
  SIGNATURE_FAILED: 'Error al firmar el documento. Por favor, intenta nuevamente.',
  REJECTION_FAILED: 'Error al rechazar el documento. Por favor, intenta nuevamente.',
  NO_SIGNERS_SELECTED: 'Debes seleccionar al menos un firmante.',
  INVALID_ORDER: 'El orden de los firmantes no es válido.',
  REQUIRED_FIELD: 'Este campo es requerido.',
  GENERIC_ERROR: 'Ocurrió un error inesperado. Por favor, intenta nuevamente.'
};

// ============================================
// MENSAJES DE ÉXITO
// ============================================
export const SUCCESS_MESSAGES = {
  UPLOAD_SUCCESS: 'Documento subido exitosamente.',
  SIGNATURE_SUCCESS: 'Documento firmado exitosamente.',
  REJECTION_SUCCESS: 'Documento rechazado exitosamente.',
  SIGNERS_ASSIGNED: 'Firmantes asignados correctamente.',
  SETTINGS_SAVED: 'Configuración guardada exitosamente.'
};

// ============================================
// CONFIGURACIÓN DE POLLING
// ============================================
export const POLLING_INTERVALS = {
  NOTIFICATIONS: 30000, // 30 segundos
  DOCUMENTS: 60000 // 1 minuto
};

// ============================================
// LÍMITES DE CARACTERES
// ============================================
export const CHAR_LIMITS = {
  DOCUMENT_TITLE: 200,
  DOCUMENT_DESCRIPTION: 1000,
  REJECT_REASON: 500,
  CONSECUTIVO: 50
};

// ============================================
// CONFIGURACIÓN DE PAGINACIÓN
// ============================================
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100]
};

// ============================================
// REGEX PATTERNS
// ============================================
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  DOCUMENT_ID: /^[a-zA-Z0-9\-]+$/,
  CONSECUTIVO: /^[A-Z0-9\-]+$/
};

// ============================================
// LOCAL STORAGE KEYS
// ============================================
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'authToken',
  USER_DATA: 'userData',
  REDIRECT_PATH: 'redirectAfterLogin',
  THEME: 'theme'
};

// ============================================
// RUTAS DE LA APLICACIÓN
// ============================================
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  DASHBOARD: '/dashboard',
  DOCUMENT: '/documento/:id'
};

// ============================================
// CONFIGURACIÓN DE DRAG & DROP
// ============================================
export const DRAG_DROP = {
  ACCEPT_TYPES: ALLOWED_FILE_TYPES,
  MAX_SIZE: MAX_FILE_SIZE,
  MULTIPLE: false // Por defecto, cambiar según necesidad
};

// ============================================
// CÓDIGOS DE TIPO DE DOCUMENTO
// ============================================
export const DOCUMENT_TYPE_CODES = {
  SOLICITUD_ANTICIPO: 'SA',
  LEGALIZACION_FACTURAS: 'LF',
  OTROS: 'OT'
};

// ============================================
// TIMEOUTS
// ============================================
export const TIMEOUTS = {
  NOTIFICATION_AUTO_HIDE: 5000, // 5 segundos
  SUCCESS_MESSAGE: 3000, // 3 segundos
  ERROR_MESSAGE: 5000, // 5 segundos
  DEBOUNCE_SEARCH: 300 // 300ms
};

// ============================================
// COLORES DE ESTADO (para badges, etc)
// ============================================
export const STATUS_COLORS = {
  [DOCUMENT_STATUS.PENDING]: '#FFA500',
  [DOCUMENT_STATUS.IN_PROGRESS]: '#3B82F6',
  [DOCUMENT_STATUS.COMPLETED]: '#10B981',
  [DOCUMENT_STATUS.REJECTED]: '#EF4444',
  [DOCUMENT_STATUS.ARCHIVED]: '#6B7280'
};

export const SIGNATURE_COLORS = {
  [SIGNATURE_STATUS.PENDING]: '#FFA500',
  [SIGNATURE_STATUS.SIGNED]: '#10B981',
  [SIGNATURE_STATUS.REJECTED]: '#EF4444'
};
