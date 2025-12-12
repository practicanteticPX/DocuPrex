/**
 * Genera HTML que replica EXACTAMENTE el componente FacturaTemplate.jsx
 * TODO en una sola página con textos completos y checks visibles
 * CORRIGE los nombres de campos para que coincidan con filasControl
 */
function generateFacturaHTML(data) {
  const {
    consecutivo = '',
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
    firmas = {} // Objeto con las firmas: { 'nombre_persona': 'nombre_firmante' }
  } = data;

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

  const filasHTML = filasControl.map(fila => {
    const firmaCuentaContable = firmas[fila.respCuentaContable] || '';
    const firmaCentroCostos = firmas[fila.respCentroCostos] || '';

    return `
    <tr>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${fila.noCuentaContable || ''}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${fila.respCuentaContable || ''}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${fila.cargoCuentaContable || ''}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content-firma">${firmaCuentaContable}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${fila.nombreCuentaContable || ''}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${fila.centroCostos || ''}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${fila.respCentroCostos || ''}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${fila.cargoCentroCostos || ''}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content-firma">${firmaCentroCostos}</div>
      </td>
      <td style="padding: 6px; border-bottom: 1px solid #F3F4F6;">
        <div class="cell-content">${fila.porcentaje || ''}</div>
      </td>
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
  <link href="https://fonts.googleapis.com/css2?family=Google+Sans:wght@300;400;500;600;700&family=Great+Vibes&display=swap" rel="stylesheet">
  <style>
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
      font-weight: 600;
      color: #111827;
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
      font-weight: 600;
      color: #374151;
    }

    .ui-input {
      padding: 7px 10px;
      border: 1px solid #D1D5DB;
      border-radius: 4px;
      font-size: 11px;
      font-family: 'Google Sans', sans-serif;
      font-weight: 500;
      color: #1F2937;
      background: #E5E7EB;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ui-input-firma {
      padding: 7px 10px;
      border: 1px solid #D1D5DB;
      border-radius: 4px;
      font-size: 16px;
      font-family: 'Great Vibes', cursive;
      font-weight: 400;
      font-style: normal;
      color: #1F2937;
      background: #E5E7EB;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-height: 34px;
      display: flex;
      align-items: center;
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
      font-weight: 600;
      color: #374151;
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
    }

    .cell-content-firma {
      font-size: 14px;
      font-family: 'Great Vibes', cursive;
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
  </style>
</head>
<body>
  <div class="factura-template-container">
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
              <th>Firma</th>
              <th>Cta Contable</th>
              <th>C.Co</th>
              <th>Resp. C.Co</th>
              <th>Cargo Resp.<br/>C.Co</th>
              <th>Firma</th>
              <th>% C.Co</th>
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
  </div>
</body>
</html>
  `;
}

module.exports = { generateFacturaHTML };
