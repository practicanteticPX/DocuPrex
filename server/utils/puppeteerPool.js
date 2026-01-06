const puppeteer = require('puppeteer');

/**
 * Browser Pool para Puppeteer
 * Reutiliza instancias de browser para evitar el costo de lanzamiento (2-3 segundos por browser)
 *
 * PERFORMANCE IMPROVEMENT:
 * - Sin pool: ~3-5 segundos por generación de PDF (lanzar browser + generar)
 * - Con pool: ~0.5-1 segundo por generación de PDF (solo generar)
 *
 * CONCURRENCY:
 * - Max 15 browsers simultáneos para soportar 12+ acciones de PDF concurrentes
 * - Cada acción de creación/firma puede generar múltiples PDFs (documento + stamps)
 * - Auto-cleanup de browsers si hay crashes
 * - Graceful shutdown al cerrar servidor
 */
class PuppeteerPool {
  constructor() {
    this.browsers = [];
    this.maxBrowsers = 15; // Aumentado para soportar 30 usuarios con 12+ acciones simultáneas
    this.inUse = new Set(); // Track browsers currently in use
    this.isShuttingDown = false;
    console.log(`🏊 Puppeteer Browser Pool inicializado (max: ${this.maxBrowsers} browsers)`);
  }

  /**
   * Obtiene un browser del pool, o crea uno nuevo si no hay disponibles
   * @returns {Promise<Browser>} Browser de Puppeteer listo para usar
   */
  async getBrowser() {
    if (this.isShuttingDown) {
      throw new Error('Pool is shutting down');
    }

    // Si hay un browser disponible en el pool, usarlo
    if (this.browsers.length > 0) {
      const browser = this.browsers.pop();

      // Verificar que el browser sigue activo
      try {
        await browser.version(); // Quick health check
        this.inUse.add(browser);
        return browser;
      } catch (error) {
        // Si el browser está cerrado, crear uno nuevo
      }
    }

    // Crear un nuevo browser
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-web-security', // Acelera carga de recursos locales
        '--disable-features=IsolateOrigins,site-per-process' // Reduce overhead
      ]
    });

    this.inUse.add(browser);
    return browser;
  }

  /**
   * Devuelve un browser al pool para reutilización
   * @param {Browser} browser - Browser a devolver al pool
   */
  async releaseBrowser(browser) {
    if (!browser) return;

    this.inUse.delete(browser);

    // Si estamos cerrando, destruir el browser
    if (this.isShuttingDown) {
      try {
        await browser.close();
      } catch (error) {
        // Silently ignore error
      }
      return;
    }

    // Verificar que el browser sigue activo
    try {
      await browser.version();

      // Si tenemos espacio en el pool, guardar el browser
      if (this.browsers.length < this.maxBrowsers) {
        this.browsers.push(browser);
      } else {
        // Pool lleno, cerrar este browser
        await browser.close();
      }
    } catch (error) {
      // Browser está muerto, no hacer nada
    }
  }

  /**
   * Limpia y cierra todos los browsers del pool
   * Debe llamarse al cerrar el servidor
   */
  async shutdown() {
    console.log('🛑 Cerrando Puppeteer Pool...');
    this.isShuttingDown = true;

    // Cerrar browsers en el pool
    const closePromises = this.browsers.map(async (browser) => {
      try {
        await browser.close();
      } catch (error) {
        // Silently ignore error
      }
    });

    // Cerrar browsers en uso
    for (const browser of this.inUse) {
      closePromises.push(
        browser.close().catch(() => {})
      );
    }

    await Promise.all(closePromises);

    this.browsers = [];
    this.inUse.clear();
    console.log('✅ Puppeteer Pool cerrado completamente');
  }

  /**
   * Obtiene estadísticas del pool para debugging
   * @returns {Object} Estado actual del pool
   */
  getStats() {
    return {
      available: this.browsers.length,
      inUse: this.inUse.size,
      maxBrowsers: this.maxBrowsers,
      isShuttingDown: this.isShuttingDown
    };
  }
}

// Singleton instance
const puppeteerPool = new PuppeteerPool();

// Graceful shutdown cuando el servidor se cierra
process.on('SIGTERM', async () => {
  await puppeteerPool.shutdown();
});

process.on('SIGINT', async () => {
  await puppeteerPool.shutdown();
  process.exit(0);
});

module.exports = puppeteerPool;
