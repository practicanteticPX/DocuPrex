/**
 * Configuración del Servidor
 * Centraliza toda la configuración relacionada con Express y el servidor
 */

require('dotenv').config();

/**
 * Configuración del servidor
 */
const serverConfig = {
  // Puerto del servidor
  port: parseInt(process.env.PORT || '5001'),

  // Host del servidor
  host: process.env.HOST || '0.0.0.0',

  // Entorno
  env: process.env.NODE_ENV || 'development',

  // Backend URL completa
  backendUrl: process.env.BACKEND_URL || 'http://192.168.0.30:5001',

  // Frontend URL
  frontendUrl: process.env.FRONTEND_URL || 'http://192.168.0.30:5173',

  // Hosts permitidos
  allowedHosts: process.env.ALLOWED_HOSTS
    ? process.env.ALLOWED_HOSTS.split(',')
    : ['localhost', '192.168.0.30', 'docuprex.com'],

  // CORS origins permitidos
  corsOrigins: process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://192.168.0.30:5173', 'http://localhost:5173', 'https://docuprex.com'],

  // JWT
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // Body parser limits
  bodyLimit: process.env.BODY_LIMIT || '50mb',

  // File upload limits
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800'), // 50 MB en bytes
  maxFiles: parseInt(process.env.MAX_FILES || '10'),

  // Upload directory
  uploadDir: process.env.UPLOAD_DIR || './uploads',

  // GraphQL
  graphqlPath: process.env.GRAPHQL_PATH || '/graphql',
  graphqlPlayground: process.env.GRAPHQL_PLAYGROUND === 'true' || process.env.NODE_ENV === 'development',
  graphqlIntrospection: process.env.GRAPHQL_INTROSPECTION === 'true' || process.env.NODE_ENV === 'development',

  // Session
  sessionSecret: process.env.SESSION_SECRET || 'your-session-secret-change-in-production',

  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutos
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Notification cleanup schedule
  notificationCleanupSchedule: process.env.NOTIFICATION_CLEANUP_SCHEDULE || '0 2 * * *', // 2:00 AM diario

  // Helpers
  isDevelopment() {
    return this.env === 'development';
  },

  isProduction() {
    return this.env === 'production';
  },

  isTest() {
    return this.env === 'test';
  },

  getFullUrl(path = '') {
    return `${this.backendUrl}${path}`;
  }
};

module.exports = serverConfig;
