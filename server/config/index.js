/**
 * Configuración centralizada del servidor
 * Punto de entrada único para toda la configuración
 */

const serverConfig = require('./server');
const databaseConfig = require('./database');
const ldapConfig = require('./ldap');
const emailConfig = require('./email');

/**
 * Exporta toda la configuración
 */
module.exports = {
  server: serverConfig,
  database: databaseConfig,
  ldap: ldapConfig,
  email: emailConfig,

  // Helpers globales
  isDevelopment: () => serverConfig.isDevelopment(),
  isProduction: () => serverConfig.isProduction(),
  isTest: () => serverConfig.isTest(),

  /**
   * Valida que toda la configuración esté correcta
   */
  validate() {
    const errors = [];

    // Validar servidor
    if (!serverConfig.port) {
      errors.push('Puerto del servidor no configurado');
    }

    if (!serverConfig.jwtSecret || serverConfig.jwtSecret === 'your-secret-key-change-in-production') {
      errors.push('JWT Secret debe ser cambiado en producción');
    }

    // Validar base de datos
    if (!databaseConfig.dbConfig.host) {
      errors.push('Host de base de datos no configurado');
    }

    if (!databaseConfig.dbConfig.database) {
      errors.push('Nombre de base de datos no configurado');
    }

    // Advertencias (no errores críticos)
    const warnings = [];

    if (emailConfig.enabled && !emailConfig.isConfigured()) {
      warnings.push('Email habilitado pero no configurado correctamente');
    }

    if (ldapConfig.enabled && !ldapConfig.isConfigured()) {
      warnings.push('LDAP habilitado pero no configurado correctamente');
    }

    if (serverConfig.isProduction() && serverConfig.graphqlPlayground) {
      warnings.push('GraphQL Playground habilitado en producción');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  },

  /**
   * Imprime un resumen de la configuración
   */
  printSummary() {
    console.log('\n📋 ===== CONFIGURACIÓN DEL SERVIDOR =====\n');

    console.log(`🌍 Entorno: ${serverConfig.env}`);
    console.log(`🚀 Servidor: ${serverConfig.host}:${serverConfig.port}`);
    console.log(`🔗 Backend URL: ${serverConfig.backendUrl}`);
    console.log(`💻 Frontend URL: ${serverConfig.frontendUrl}`);
    console.log(`🔐 JWT Expires In: ${serverConfig.jwtExpiresIn}`);

    console.log(`\n💾 Base de Datos:`);
    console.log(`   Host: ${databaseConfig.dbConfig.host}:${databaseConfig.dbConfig.port}`);
    console.log(`   Database: ${databaseConfig.dbConfig.database}`);
    console.log(`   Pool Max: ${databaseConfig.dbConfig.max}`);

    console.log(`\n📧 Email:`);
    console.log(`   Habilitado: ${emailConfig.enabled ? '✅' : '❌'}`);
    console.log(`   Configurado: ${emailConfig.isConfigured() ? '✅' : '❌'}`);
    console.log(`   Modo Test: ${emailConfig.testMode ? '✅' : '❌'}`);
    console.log(`   Provider: ${emailConfig.provider}`);

    console.log(`\n🔐 LDAP/Active Directory:`);
    console.log(`   Habilitado: ${ldapConfig.enabled ? '✅' : '❌'}`);
    console.log(`   Configurado: ${ldapConfig.isConfigured() ? '✅' : '❌'}`);
    if (ldapConfig.isConfigured()) {
      console.log(`   URL: ${ldapConfig.getUrl()}`);
    }

    console.log(`\n🎨 GraphQL:`);
    console.log(`   Path: ${serverConfig.graphqlPath}`);
    console.log(`   Playground: ${serverConfig.graphqlPlayground ? '✅' : '❌'}`);
    console.log(`   Introspection: ${serverConfig.graphqlIntrospection ? '✅' : '❌'}`);

    console.log(`\n📁 Archivos:`);
    console.log(`   Max Size: ${(serverConfig.maxFileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   Max Files: ${serverConfig.maxFiles}`);
    console.log(`   Upload Dir: ${serverConfig.uploadDir}`);

    // Validar configuración
    const validation = this.validate();

    if (validation.warnings.length > 0) {
      console.log(`\n⚠️  Advertencias:`);
      validation.warnings.forEach(warning => {
        console.log(`   - ${warning}`);
      });
    }

    if (!validation.valid) {
      console.log(`\n❌ Errores de configuración:`);
      validation.errors.forEach(error => {
        console.log(`   - ${error}`);
      });
    }

    console.log('\n=====================================\n');

    return validation.valid;
  }
};
