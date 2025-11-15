/**
 * Configuración de Email
 * Centraliza toda la configuración relacionada con el envío de emails
 */

require('dotenv').config();

/**
 * Configuración de email
 */
const emailConfig = {
  // Proveedor de email (smtp, sendgrid, ses, etc.)
  provider: process.env.EMAIL_PROVIDER || 'smtp',

  // SMTP Configuration
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true', // true para puerto 465, false para otros
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASSWORD || ''
    },
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false'
    }
  },

  // Remitente por defecto
  from: {
    name: process.env.EMAIL_FROM_NAME || 'DocuPrex',
    address: process.env.EMAIL_FROM_ADDRESS || 'noreply@docuprex.com'
  },

  // Email de soporte
  supportEmail: process.env.SUPPORT_EMAIL || 'soporte@docuprex.com',

  // Email de administrador
  adminEmail: process.env.ADMIN_EMAIL || 'admin@docuprex.com',

  // Templates directory
  templatesDir: process.env.EMAIL_TEMPLATES_DIR || './templates/email',

  // Opciones de envío
  options: {
    // Retry en caso de fallo
    maxRetries: parseInt(process.env.EMAIL_MAX_RETRIES || '3'),

    // Timeout para envío
    timeout: parseInt(process.env.EMAIL_TIMEOUT || '10000'),

    // Rate limiting (emails por segundo)
    rateLimit: parseInt(process.env.EMAIL_RATE_LIMIT || '5')
  },

  // Habilitar envío de emails
  enabled: process.env.EMAIL_ENABLED !== 'false',

  // Modo de prueba (no envía realmente, solo loguea)
  testMode: process.env.EMAIL_TEST_MODE === 'true',

  // Configuración de notificaciones
  notifications: {
    // Enviar notificación cuando se asigna un documento
    onDocumentAssigned: process.env.EMAIL_NOTIFY_ASSIGNED !== 'false',

    // Enviar notificación cuando se firma un documento
    onDocumentSigned: process.env.EMAIL_NOTIFY_SIGNED !== 'false',

    // Enviar notificación cuando se completa un documento
    onDocumentCompleted: process.env.EMAIL_NOTIFY_COMPLETED !== 'false',

    // Enviar notificación cuando se rechaza un documento
    onDocumentRejected: process.env.EMAIL_NOTIFY_REJECTED !== 'false'
  },

  /**
   * Obtiene el string completo del remitente
   */
  getFromString() {
    return `"${this.from.name}" <${this.from.address}>`;
  },

  /**
   * Verifica si la configuración SMTP está completa
   */
  isConfigured() {
    return !!(this.smtp.host && this.smtp.auth.user && this.smtp.auth.pass);
  },

  /**
   * Verifica si el envío de emails está habilitado y configurado
   */
  isEnabled() {
    return this.enabled && this.isConfigured() && !this.testMode;
  },

  /**
   * Obtiene la configuración de transporte según el proveedor
   */
  getTransportConfig() {
    switch (this.provider) {
      case 'smtp':
        return this.smtp;

      case 'sendgrid':
        return {
          service: 'SendGrid',
          auth: {
            user: 'apikey',
            pass: process.env.SENDGRID_API_KEY
          }
        };

      case 'ses':
        return {
          SES: {
            aws: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              region: process.env.AWS_REGION || 'us-east-1'
            }
          }
        };

      default:
        return this.smtp;
    }
  }
};

module.exports = emailConfig;
