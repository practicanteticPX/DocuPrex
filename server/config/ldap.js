/**
 * Configuración de LDAP/Active Directory
 * Centraliza toda la configuración relacionada con LDAP
 */

require('dotenv').config();

/**
 * Configuración de LDAP
 */
const ldapConfig = {
  // Protocolo (ldap o ldaps)
  protocol: process.env.AD_PROTOCOL || 'ldap',

  // Hostname del servidor AD
  hostname: process.env.AD_HOSTNAME || '',

  // Puerto
  port: parseInt(process.env.AD_PORT || '389'),

  // Base DN
  baseDN: process.env.AD_BASE_DN || '',

  // Usuario para bind (opcional)
  bindUser: process.env.AD_BIND_USER || '',

  // Password para bind (opcional)
  bindPassword: process.env.AD_BIND_PASSWORD || '',

  // Search filter template
  searchFilter: process.env.AD_SEARCH_FILTER || '(sAMAccountName={{username}})',

  // Timeout para conexiones
  timeout: parseInt(process.env.AD_TIMEOUT || '5000'),

  // Reconnect
  reconnect: process.env.AD_RECONNECT === 'true',

  // TLS options
  tlsOptions: {
    rejectUnauthorized: process.env.AD_TLS_REJECT_UNAUTHORIZED !== 'false'
  },

  // Atributos a obtener del AD
  attributes: process.env.AD_ATTRIBUTES
    ? process.env.AD_ATTRIBUTES.split(',')
    : ['cn', 'mail', 'sAMAccountName', 'displayName', 'memberOf'],

  // Mapeo de campos AD a campos de usuario
  fieldMapping: {
    username: 'sAMAccountName',
    name: 'displayName',
    email: 'mail',
    groups: 'memberOf'
  },

  // Sincronización automática
  autoSync: process.env.AD_AUTO_SYNC === 'true',
  syncInterval: parseInt(process.env.AD_SYNC_INTERVAL || '86400000'), // 24 horas

  // Habilitar autenticación AD
  enabled: process.env.AD_ENABLED === 'true',

  /**
   * Construye la URL completa del servidor LDAP
   */
  getUrl() {
    return `${this.protocol}://${this.hostname}:${this.port}`;
  },

  /**
   * Construye el search filter con el username
   */
  getSearchFilter(username) {
    return this.searchFilter.replace('{{username}}', username);
  },

  /**
   * Verifica si la configuración está completa
   */
  isConfigured() {
    return !!(this.hostname && this.baseDN);
  },

  /**
   * Verifica si LDAP está habilitado y configurado
   */
  isEnabled() {
    return this.enabled && this.isConfigured();
  }
};

module.exports = ldapConfig;
