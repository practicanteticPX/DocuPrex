import { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { Input } from '../ui/input';
import './FacturaTemplate.css';

/**
 * FacturaTemplate - Plantilla de legalización de facturas
 *
 * Formulario completo para diligenciar información de factura
 * con campos automáticos desde T_Facturas y campos manuales
 */
const FacturaTemplate = ({ factura, onClose, onSave }) => {
  // Estados para campos automáticos desde T_Facturas
  const [consecutivo, setConsecutivo] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [fechaFactura, setFechaFactura] = useState('');
  const [fechaRecepcion, setFechaRecepcion] = useState('');
  const [legalizaAnticipo, setLegalizaAnticipo] = useState(false);

  // Estados para campos manuales
  const [nombreNegociador, setNombreNegociador] = useState('');
  const [cargoNegociador, setCargoNegociador] = useState('');
  const [firmaNegociador, setFirmaNegociador] = useState('');

  // Estado para las filas de la tabla de control de firmas
  const [filasControl, setFilasControl] = useState([
    {
      id: 1,
      proceso: 'Aprobación',
      noCuentaContable: '',
      respCuentaContable: '',
      cargoCuentaContable: '',
      nombreCuentaContable: '',
      firmaCuentaContable: '',
      centroCostos: '',
      respCentroCostos: '',
      cargoCentroCostos: '',
      firmaCentroCostos: '',
      porcentaje: '100'
    }
  ]);

  // Cargar datos automáticos de la factura
  useEffect(() => {
    if (factura) {
      setConsecutivo(factura.numero_control || '');
      setProveedor(factura.proveedor || '');
      setNumeroFactura(factura.numero_factura || '');
      setFechaFactura(factura.fecha_factura || '');
      setFechaRecepcion(factura.fecha_entrega || '');
    }
  }, [factura]);

  const handleAddFila = () => {
    const newId = Math.max(...filasControl.map(f => f.id), 0) + 1;
    setFilasControl([
      ...filasControl,
      {
        id: newId,
        proceso: 'Aprobación',
        noCuentaContable: '',
        respCuentaContable: '',
        cargoCuentaContable: '',
        nombreCuentaContable: '',
        firmaCuentaContable: '',
        centroCostos: '',
        respCentroCostos: '',
        cargoCentroCostos: '',
        firmaCentroCostos: '',
        porcentaje: ''
      }
    ]);
  };

  const handleRemoveFila = (id) => {
    if (filasControl.length > 1) {
      setFilasControl(filasControl.filter(f => f.id !== id));
    }
  };

  const handleFilaChange = (id, field, value) => {
    setFilasControl(filasControl.map(fila =>
      fila.id === id ? { ...fila, [field]: value } : fila
    ));
  };

  const calcularTotalPorcentaje = () => {
    return filasControl.reduce((total, fila) => {
      const valor = parseFloat(fila.porcentaje) || 0;
      return total + valor;
    }, 0);
  };

  const handleSave = () => {
    const totalPorcentaje = calcularTotalPorcentaje();
    if (totalPorcentaje !== 100) {
      alert(`El porcentaje total debe ser 100%. Actualmente es ${totalPorcentaje}%`);
      return;
    }

    // Aquí se implementará la lógica de guardado
    if (onSave) {
      onSave({
        consecutivo,
        proveedor,
        numeroFactura,
        fechaFactura,
        fechaRecepcion,
        legalizaAnticipo,
        nombreNegociador,
        cargoNegociador,
        firmaNegociador,
        filasControl
      });
    }
  };

  return (
    <div className="factura-template-overlay">
      <div className="factura-template-container">
        {/* Header */}
        <div className="factura-template-header">
          <div>
            <h1 className="factura-template-title">Plantilla Control Factura</h1>
            <p className="factura-template-subtitle">Legalización de Facturas - {consecutivo}</p>
          </div>
          <button
            className="factura-template-close-btn"
            onClick={onClose}
            title="Cerrar"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="factura-template-content">
          {/* Sección: Información General */}
          <div className="factura-section">
            <h2 className="factura-section-title">Información General de la Factura</h2>

            <div className="factura-grid">
              <div className="factura-field">
                <label className="factura-label">Consecutivo</label>
                <Input
                  type="text"
                  value={consecutivo}
                  disabled
                  className="factura-input-disabled"
                />
              </div>

              <div className="factura-field">
                <label className="factura-label">Proveedor</label>
                <Input
                  type="text"
                  value={proveedor}
                  disabled
                  className="factura-input-disabled"
                />
              </div>

              <div className="factura-field">
                <label className="factura-label"># Factura</label>
                <Input
                  type="text"
                  value={numeroFactura}
                  disabled
                  className="factura-input-disabled"
                />
              </div>

              <div className="factura-field">
                <label className="factura-label">Fecha Factura</label>
                <Input
                  type="date"
                  value={fechaFactura}
                  disabled
                  className="factura-input-disabled"
                />
              </div>

              <div className="factura-field">
                <label className="factura-label">Fecha de Recepción</label>
                <Input
                  type="date"
                  value={fechaRecepcion}
                  disabled
                  className="factura-input-disabled"
                />
              </div>

              <div className="factura-field factura-field-checkbox">
                <label className="factura-checkbox-label">
                  <input
                    type="checkbox"
                    checked={legalizaAnticipo}
                    onChange={(e) => setLegalizaAnticipo(e.target.checked)}
                    className="factura-checkbox"
                  />
                  <span>Legaliza Anticipo</span>
                </label>
              </div>
            </div>
          </div>

          {/* Sección: Negociador */}
          <div className="factura-section">
            <h2 className="factura-section-title">Información del Negociador</h2>

            <div className="factura-grid">
              <div className="factura-field">
                <label className="factura-label">Nombre Negociador</label>
                <Input
                  type="text"
                  value={nombreNegociador}
                  onChange={(e) => setNombreNegociador(e.target.value)}
                  placeholder="Seleccionar negociador..."
                />
              </div>

              <div className="factura-field">
                <label className="factura-label">Cargo Negociador</label>
                <Input
                  type="text"
                  value={cargoNegociador}
                  disabled
                  className="factura-input-disabled"
                  placeholder="Se completa automáticamente"
                />
              </div>

              <div className="factura-field">
                <label className="factura-label">Firma Negociador</label>
                <div className="factura-firma">
                  {firmaNegociador || 'Se generará automáticamente'}
                </div>
              </div>
            </div>
          </div>

          {/* Sección: Control de Firmas */}
          <div className="factura-section">
            <div className="factura-section-header">
              <h2 className="factura-section-title">Control de Firmas</h2>
              <button
                className="factura-add-row-btn"
                onClick={handleAddFila}
                title="Agregar fila"
              >
                <Plus size={20} />
                <span>Agregar Fila</span>
              </button>
            </div>

            <div className="factura-table-wrapper">
              <table className="factura-table">
                <thead>
                  <tr>
                    <th>Proceso</th>
                    <th>No. Cta Contable</th>
                    <th>Resp. Cta Contable</th>
                    <th>Cargo Resp Cta Contable</th>
                    <th>Cta Contable</th>
                    <th>Firma Resp Cta Contable</th>
                    <th>C.Co</th>
                    <th>Resp. C.Co</th>
                    <th>Cargo Resp. C.Co</th>
                    <th>Firma Resp C.Co</th>
                    <th>% C.Co</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filasControl.map((fila) => (
                    <tr key={fila.id}>
                      <td>
                        <Input
                          type="text"
                          value={fila.proceso}
                          disabled
                          className="factura-table-input factura-input-disabled"
                        />
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.noCuentaContable}
                          onChange={(e) => handleFilaChange(fila.id, 'noCuentaContable', e.target.value)}
                          placeholder="Seleccionar..."
                          className="factura-table-input"
                        />
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.respCuentaContable}
                          disabled
                          className="factura-table-input factura-input-disabled"
                        />
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.cargoCuentaContable}
                          disabled
                          className="factura-table-input factura-input-disabled"
                        />
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.nombreCuentaContable}
                          disabled
                          className="factura-table-input factura-input-disabled"
                        />
                      </td>
                      <td>
                        <div className="factura-firma-cell">
                          {fila.firmaCuentaContable || '-'}
                        </div>
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.centroCostos}
                          onChange={(e) => handleFilaChange(fila.id, 'centroCostos', e.target.value)}
                          placeholder="Seleccionar..."
                          className="factura-table-input"
                        />
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.respCentroCostos}
                          disabled
                          className="factura-table-input factura-input-disabled"
                        />
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.cargoCentroCostos}
                          disabled
                          className="factura-table-input factura-input-disabled"
                        />
                      </td>
                      <td>
                        <div className="factura-firma-cell">
                          {fila.firmaCentroCostos || '-'}
                        </div>
                      </td>
                      <td>
                        <Input
                          type="number"
                          value={fila.porcentaje}
                          onChange={(e) => handleFilaChange(fila.id, 'porcentaje', e.target.value)}
                          placeholder="0"
                          min="0"
                          max="100"
                          step="0.01"
                          className="factura-table-input"
                        />
                      </td>
                      <td>
                        {filasControl.length > 1 && (
                          <button
                            className="factura-remove-row-btn"
                            onClick={() => handleRemoveFila(fila.id)}
                            title="Eliminar fila"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan="10" style={{ textAlign: 'right', fontWeight: '600' }}>
                      Total Porcentaje:
                    </td>
                    <td>
                      <div className={`factura-total-porcentaje ${calcularTotalPorcentaje() !== 100 ? 'factura-total-error' : 'factura-total-ok'}`}>
                        {calcularTotalPorcentaje().toFixed(2)}%
                      </div>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="factura-template-footer">
          <button
            className="factura-btn factura-btn-secondary"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            className="factura-btn factura-btn-primary"
            onClick={handleSave}
          >
            Guardar y Continuar
          </button>
        </div>
      </div>
    </div>
  );
};

export default FacturaTemplate;
