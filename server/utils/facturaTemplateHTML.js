const resourceCache = require('./resourceCache');

/**
 * OPTIMIZED: Helper functions now use in-memory cache instead of disk I/O
 * Performance: ~95% faster (from ~50-100ms to <1ms per call)
 */

/**
 * Helper function to get logo as base64 data URL from cache
 * @param {string} cia - Company code (PX, PT, PY, CL)
 * @returns {string|null} - Base64 data URL or null if not found
 */
function getCompanyLogoBase64(cia) {
  return resourceCache.getLogo(cia);
}

/**
 * Helper function to get Higher font as base64 data URL from cache
 * @returns {string|null} - Base64 data URL or null if not found
 */
function getHigherFontBase64() {
  return resourceCache.getHigherFont();
}

/**
 * Helper function to get Google Sans font as base64 data URLs from cache
 * @returns {Object} - Object with base64 data URLs for different weights
 */
function getGoogleSansFontsBase64() {
  return resourceCache.getGoogleSansFonts();
}

/**
 * Genera HTML que replica EXACTAMENTE el componente FacturaTemplate.jsx
 * TODO en una sola página con textos completos y checks visibles
 * CORRIGE los nombres de campos para que coincidan con filasControl
 */
function generateFacturaHTML(data) {
  const {
    consecutivo = '',
    cia = '',
    numeroFactura = '',
    proveedor = '',
    fechaFactura = '',
    fechaRecepcion = '',
    legalizaAnticipo = false,
    checklistRevision = {},
    nombreNegociador = '',
    cargoNegociador = '',
    filasControl = [],
    totalPorcentaje = 0,
    observaciones = '',
    firmas = {}, // Objeto con las firmas: { 'nombre_persona': 'nombre_firmante' }
    retentionData = [], // Array con las retenciones activas del documento
    isRejected = false // Si el documento fue rechazado
  } = data;

  // Get logo as base64
  const logoBase64 = getCompanyLogoBase64(cia);

  // Get Higher font as base64
  const higherFontBase64 = getHigherFontBase64();
  if (!higherFontBase64) {
    console.warn(`⚠️ Fuente Higher NO pudo cargarse - usando fallback`);
  }

  // Get Google Sans fonts as base64
  const googleSansFonts = getGoogleSansFontsBase64();
  if (Object.keys(googleSansFonts).length === 0) {
    console.warn(`⚠️ Google Sans NO pudo cargarse - usando fallback`);
  }

  // Usar checklistRevision si existe, si no usar condiciones (compatibilidad)
  const condiciones = data.condiciones || checklistRevision || {};

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const calcularTotal = () => {
    if (totalPorcentaje !== undefined && totalPorcentaje !== null) {
      return totalPorcentaje;
    }
    return filasControl.reduce((total, fila) => {
      const valor = parseFloat(fila.porcentaje) || 0;
      return total + valor;
    }, 0);
  };

  const total = calcularTotal();
  const totalOk = Math.abs(total - 100) < 0.01;

  // Verificar si hay retenciones activas
  const hasRetentions = retentionData && Array.isArray(retentionData) && retentionData.length > 0;

  // Crear un mapa de retenciones por índice de centro de costo
  const retentionMap = {};
  if (hasRetentions) {
    retentionData.forEach((retention) => {
      if (retention.activa) {
        retentionMap[retention.centroCostoIndex] = retention;
      }
    });
  }

  const filasHTML = filasControl.map((fila, index) => {
    // VALIDACIÓN Y FALLBACKS: Detectar datos faltantes en metadata
    const noCuentaContable = fila.noCuentaContable || '';
    const respCuentaContable = fila.respCuentaContable || '';
    const cargoCuentaContable = fila.cargoCuentaContable || '';
    const nombreCuentaContable = fila.nombreCuentaContable || '';
    const centroCostos = fila.centroCostos || '';
    const respCentroCostos = fila.respCentroCostos || '';
    const cargoCentroCostos = fila.cargoCentroCostos || '';
    const porcentaje = fila.porcentaje || '';

    // LOGS DE DEPURACIÓN: Advertir sobre datos faltantes
    if (noCuentaContable && !respCuentaContable) {
      console.warn(`⚠️ [HTML] Fila ${index + 1}: Cuenta "${noCuentaContable}" sin responsable`);
    }
    if (noCuentaContable && !cargoCuentaContable) {
      console.warn(`⚠️ [HTML] Fila ${index + 1}: Cuenta "${noCuentaContable}" sin cargo`);
    }
    if (noCuentaContable && !nombreCuentaContable) {
      console.warn(`⚠️ [HTML] Fila ${index + 1}: Cuenta "${noCuentaContable}" sin nombre de cuenta`);
    }
    if (centroCostos && !respCentroCostos) {
      console.warn(`⚠️ [HTML] Fila ${index + 1}: Centro "${centroCostos}" sin responsable`);
    }
    if (centroCostos && !cargoCentroCostos) {
      console.warn(`⚠️ [HTML] Fila ${index + 1}: Centro "${centroCostos}" sin cargo`);
    }

    const firmaCuentaContable = firmas[fila.respCuentaContable] || '';
    const firmaCentroCostos = firmas[fila.respCentroCostos] || '';

    // Obtener retención para esta fila (si existe)
    const retention = retentionMap[index];

    return `
    <tr>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${noCuentaContable}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${respCuentaContable}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${cargoCuentaContable}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${nombreCuentaContable}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content-firma">${firmaCuentaContable}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6; ${retention ? 'background: #FEF3C7;' : ''}">
        <div class="cell-content" style="${retention ? 'background: #FEF3C7;' : ''}">${centroCostos}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6; ${retention ? 'background: #FEF3C7;' : ''}">
        <div class="cell-content" style="${retention ? 'background: #FEF3C7;' : ''}">${respCentroCostos}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6; ${retention ? 'background: #FEF3C7;' : ''}">
        <div class="cell-content" style="${retention ? 'background: #FEF3C7;' : ''}">${cargoCentroCostos}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6; ${retention ? 'background: #FEF3C7;' : ''}">
        <div class="cell-content-firma" style="${retention ? 'background: #FEF3C7;' : ''}">${firmaCentroCostos}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6; ${retention ? 'background: #FEF3C7;' : ''}">
        <div class="cell-content" style="${retention ? 'background: #FEF3C7;' : ''}">${porcentaje}</div>
      </td>
      ${hasRetentions ? `
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6; ${retention ? 'background: #FEF3C7;' : ''}">
        <div class="cell-content" style="${retention ? 'background: #FEF3C7; color: #92400E; font-weight: 600;' : ''}">${retention ? retention.porcentajeRetenido + '%' : '-'}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6; ${retention ? 'background: #FEF3C7;' : ''}">
        <div class="cell-content" style="${retention ? 'background: #FEF3C7; color: #92400E;' : ''}">${retention ? retention.motivo : '-'}</div>
      </td>
      ` : ''}
    </tr>
  `;
  }).join('');

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Planilla Control Factura</title>
  <style>
    /* Google Sans - Fuente principal embebida */
    ${googleSansFonts['400'] ? `
    @font-face {
      font-family: 'Google Sans';
      src: url('${googleSansFonts['400']}');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }` : ''}
    ${googleSansFonts['500'] ? `
    @font-face {
      font-family: 'Google Sans';
      src: url('${googleSansFonts['500']}');
      font-weight: 500;
      font-style: normal;
      font-display: swap;
    }` : ''}
    ${googleSansFonts['600'] ? `
    @font-face {
      font-family: 'Google Sans';
      src: url('${googleSansFonts['600']}');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }` : ''}
    ${googleSansFonts['700'] ? `
    @font-face {
      font-family: 'Google Sans';
      src: url('${googleSansFonts['700']}');
      font-weight: 700;
      font-style: normal;
      font-display: swap;
    }` : ''}

    /* Higher - Fuente para firmas embebida */
    ${higherFontBase64 ? `
    @font-face {
      font-family: 'Higher';
      src: url('${higherFontBase64}') format('opentype');
      font-weight: normal;
      font-style: normal;
      font-display: block;
    }` : ''}

    /* Fallback si la fuente no carga */
    @font-face {
      font-family: 'HigherFallback';
      src: local('Brush Script MT'), local('Lucida Handwriting'), local('Segoe Script');
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Google Sans', sans-serif;
      background: white;
      padding: 16px;
      margin: 0;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    .factura-template-container {
      background: white;
      width: 100%;
    }

    .factura-section {
      background: #F9FAFB;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      padding: 14px;
      margin-bottom: 14px;
    }

    .factura-section-title {
      font-size: 15px;
      font-weight: 700;
      color: #172B4D;
      letter-spacing: -0.03em;
      margin: 0 0 12px 0;
    }

    .factura-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 10px;
    }

    .factura-grid-2 {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }

    .factura-grid-3 {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }

    .factura-field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .factura-label {
      font-size: 11px;
      font-weight: 500;
      color: #5E6C84;
    }

    .ui-input {
      padding: 7px 10px;
      border: 1px solid #D1D5DB;
      border-radius: 4px;
      font-size: 11px;
      font-family: 'Google Sans', sans-serif;
      font-weight: 500;
      color: #091E42;
      letter-spacing: -0.01em;
      background: #E5E7EB;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-height: 32px;
      height: 32px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
    }

    .ui-input-firma {
      padding: 7px 10px;
      border: 1px solid #D1D5DB;
      border-radius: 4px;
      font-size: 18px;
      font-family: 'Higher', 'HigherFallback', 'Brush Script MT', cursive !important;
      font-weight: 400;
      font-style: normal;
      color: #1F2937;
      background: #E5E7EB;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-height: 32px;
      height: 32px;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      letter-spacing: -0.5px;
    }

    .factura-field-checkbox-simple {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 7px 0;
    }

    .factura-checkbox-simple-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .custom-checkbox {
      width: 18px;
      height: 18px;
      border: 2px solid #D1D5DB;
      border-radius: 3px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: white;
      flex-shrink: 0;
    }

    .custom-checkbox.checked {
      background: #5F6368;
      border-color: #5F6368;
    }

    .custom-checkbox.checked::after {
      content: '';
      width: 3px;
      height: 8px;
      border: solid white;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
      margin-top: -2px;
    }

    .factura-checkbox-simple-text {
      font-size: 11px;
      font-weight: 500;
      color: #374151;
    }

    .factura-checklist-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
    }

    .factura-checklist-item {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      padding: 8px 10px;
      background: white;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
    }

    .factura-checklist-item-wide {
      grid-column: span 2;
    }

    .factura-checklist-label {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 1;
    }

    .factura-checklist-text {
      font-size: 11px;
      font-weight: 500;
      color: #374151;
      line-height: 1.3;
    }

    .factura-table-wrapper {
      overflow-x: visible;
      border: 1px solid #E5E7EB;
      border-radius: 6px;
      background: white;
    }

    .factura-table {
      width: 100%;
      border-collapse: collapse;
    }

    .factura-table thead {
      background: #F9FAFB;
    }

    .factura-table th {
      padding: 8px 6px;
      text-align: left;
      font-size: 10px;
      font-weight: 500;
      color: #5E6C84;
      border-bottom: 1px solid #E5E7EB;
      line-height: 1.2;
    }

    .factura-table th:first-child {
      padding-left: 10px;
    }

    .factura-table th:last-child {
      padding-right: 10px;
    }

    .factura-table td:first-child {
      padding-left: 10px;
    }

    .factura-table td:last-child {
      padding-right: 10px;
    }

    .cell-content {
      font-size: 10px;
      font-family: 'Google Sans', sans-serif;
      font-weight: 500;
      color: #091E42;
      letter-spacing: -0.01em;
      padding: 5px 8px;
      border: 1px solid #D1D5DB;
      border-radius: 4px;
      background: #F9FAFB;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-height: 26px;
      display: flex;
      align-items: center;
    }

    .cell-content-firma {
      font-size: 16px;
      font-family: 'Higher', 'HigherFallback', 'Brush Script MT', cursive !important;
      font-weight: 400;
      font-style: normal;
      color: #1F2937;
      padding: 5px 8px;
      border: 1px solid #D1D5DB;
      border-radius: 4px;
      background: #F9FAFB;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-height: 26px;
      display: flex;
      align-items: center;
      letter-spacing: -0.5px;
    }

    .factura-total-section {
      display: flex;
      justify-content: flex-end;
      margin-top: 10px;
      padding-right: 10px;
    }

    .factura-total-porcentaje {
      padding: 8px 16px;
      text-align: center;
      font-weight: 700;
      font-size: 12px;
      border-radius: 4px;
    }

    .factura-total-ok {
      background: #D1FAE5;
      color: #065F46;
    }

    .factura-total-error {
      background: #FEE2E2;
      color: #DC2626;
    }

    /* Company Logo Styles */
    .company-logo-section {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px 0;
      margin-bottom: 20px;
      background: white;
    }

    .company-logo {
      max-width: 200px;
      max-height: 80px;
      width: auto;
      height: auto;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div class="factura-template-container">
    ${logoBase64 ? `
    <!-- Company Logo -->
    <div class="company-logo-section">
      <img src="${logoBase64}" alt="Logo ${cia}" class="company-logo" />
    </div>
    ` : ''}
    <!-- Información General de la Factura -->
    <div class="factura-section">
      <h2 class="factura-section-title">Información General de la Factura</h2>
      <div class="factura-grid">
        <div class="factura-field">
          <label class="factura-label">Consecutivo</label>
          <input type="text" value="${consecutivo}" class="ui-input" readonly />
        </div>
        <div class="factura-field">
          <label class="factura-label">Proveedor</label>
          <input type="text" value="${proveedor}" class="ui-input" readonly title="${proveedor}" />
        </div>
        <div class="factura-field">
          <label class="factura-label"># Factura</label>
          <input type="text" value="${numeroFactura}" class="ui-input" readonly />
        </div>
        <div class="factura-field">
          <label class="factura-label">Fecha Factura</label>
          <input type="date" value="${formatDate(fechaFactura)}" class="ui-input" readonly />
        </div>
        <div class="factura-field">
          <label class="factura-label">Fecha de Recepción</label>
          <input type="date" value="${formatDate(fechaRecepcion)}" class="ui-input" readonly />
        </div>
      </div>
      <div class="factura-field-checkbox-simple">
        <label class="factura-checkbox-simple-label">
          <div class="custom-checkbox ${legalizaAnticipo ? 'checked' : ''}"></div>
          <span class="factura-checkbox-simple-text">Legaliza Anticipo</span>
        </label>
      </div>
    </div>

    <!-- Checklist de Revisión -->
    <div class="factura-section">
      <h2 class="factura-section-title">Checklist de Revisión de Condiciones de Negociación</h2>
      <div class="factura-checklist-grid">
        <div class="factura-checklist-item">
          <div class="factura-checklist-label">
            <div class="custom-checkbox ${condiciones.fechaEmision ? 'checked' : ''}"></div>
            <span class="factura-checklist-text">Fecha de Emisión</span>
          </div>
        </div>
        <div class="factura-checklist-item">
          <div class="factura-checklist-label">
            <div class="custom-checkbox ${condiciones.fechaVencimiento ? 'checked' : ''}"></div>
            <span class="factura-checklist-text">Fecha de Vencimiento</span>
          </div>
        </div>
        <div class="factura-checklist-item">
          <div class="factura-checklist-label">
            <div class="custom-checkbox ${condiciones.cantidades ? 'checked' : ''}"></div>
            <span class="factura-checklist-text">Cantidades</span>
          </div>
        </div>
        <div class="factura-checklist-item">
          <div class="factura-checklist-label">
            <div class="custom-checkbox ${condiciones.precioUnitario ? 'checked' : ''}"></div>
            <span class="factura-checklist-text">Precio Unitario</span>
          </div>
        </div>
        <div class="factura-checklist-item">
          <div class="factura-checklist-label">
            <div class="custom-checkbox ${condiciones.fletes ? 'checked' : ''}"></div>
            <span class="factura-checklist-text">Fletes</span>
          </div>
        </div>
        <div class="factura-checklist-item factura-checklist-item-wide">
          <div class="factura-checklist-label">
            <div class="custom-checkbox ${condiciones.valoresTotales ? 'checked' : ''}"></div>
            <span class="factura-checklist-text">Vlr Totales = Vlr Orden de Compra</span>
          </div>
        </div>
        <div class="factura-checklist-item">
          <div class="factura-checklist-label">
            <div class="custom-checkbox ${condiciones.descuentosTotales ? 'checked' : ''}"></div>
            <span class="factura-checklist-text">Descuentos Totales</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Información del Negociador -->
    <div class="factura-section">
      <h2 class="factura-section-title">Información del Negociador</h2>
      <div class="factura-grid-3">
        <div class="factura-field">
          <label class="factura-label">Nombre Negociador</label>
          <input type="text" value="${nombreNegociador}" class="ui-input" readonly title="${nombreNegociador}" />
        </div>
        <div class="factura-field">
          <label class="factura-label">Cargo Negociador</label>
          <input type="text" value="${cargoNegociador}" class="ui-input" readonly title="${cargoNegociador}" />
        </div>
        <div class="factura-field">
          <label class="factura-label">Firma</label>
          <div class="ui-input-firma">${firmas[nombreNegociador] || ''}</div>
        </div>
      </div>
    </div>

    <!-- Firmas de Negociaciones y Causación -->
    <div class="factura-section">
      <div class="factura-grid-2">
        <div class="factura-field">
          <label class="factura-label">Firma Negociaciones</label>
          <div class="ui-input-firma">${firmas['_NEGOCIACIONES'] || ''}</div>
        </div>
        <div class="factura-field">
          <label class="factura-label">Firma Causación</label>
          <div class="ui-input-firma">${firmas['_CAUSACION'] || ''}</div>
        </div>
      </div>
    </div>

    <!-- Control de Firmas -->
    <div class="factura-section">
      <h2 class="factura-section-title">Control de Firmas</h2>
      <div class="factura-table-wrapper">
        <table class="factura-table">
          <thead>
            <tr>
              <th>No. Cta<br/>Contable</th>
              <th>Resp. Cta<br/>Contable</th>
              <th>Cargo Resp<br/>Cta Contable</th>
              <th>Cta Contable</th>
              <th>Firma</th>
              <th${hasRetentions ? ' style="background: #FEF3C7;"' : ''}>C.Co</th>
              <th${hasRetentions ? ' style="background: #FEF3C7;"' : ''}>Resp. C.Co</th>
              <th${hasRetentions ? ' style="background: #FEF3C7;"' : ''}>Cargo Resp.<br/>C.Co</th>
              <th${hasRetentions ? ' style="background: #FEF3C7;"' : ''}>Firma</th>
              <th${hasRetentions ? ' style="background: #FEF3C7;"' : ''}>% C.Co</th>
              ${hasRetentions ? `
              <th style="background: #FEF3C7;">% Ret</th>
              <th style="background: #FEF3C7;">Motivo</th>
              ` : ''}
            </tr>
          </thead>
          <tbody>
            ${filasHTML}
          </tbody>
        </table>
      </div>
      <div class="factura-total-section">
        <div class="factura-total-porcentaje ${totalOk ? 'factura-total-ok' : 'factura-total-error'}">
          Total Porcentaje: ${total.toFixed(2)}%
        </div>
      </div>
    </div>

    ${observaciones ? `
    <!-- Sección de Observaciones -->
    <div class="factura-section">
      <h2 class="factura-section-title">Observaciones</h2>
      <div class="factura-field">
        <textarea class="ui-input" readonly style="
          min-height: 60px;
          white-space: pre-wrap;
          overflow-wrap: break-word;
          resize: none;
          line-height: 1.5;
          background: white;
        ">${observaciones}</textarea>
      </div>
    </div>
    ` : ''}
  </div>
</body>
</html>
  `;
}

module.exports = { generateFacturaHTML };
