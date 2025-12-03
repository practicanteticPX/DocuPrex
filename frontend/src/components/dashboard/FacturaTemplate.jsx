import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { X, Plus } from 'lucide-react';
import { Input } from '../ui/input';
import { useCuentasContables, useCentrosCostos } from '../../hooks';
import './FacturaTemplate.css';

/**
 * Helper para formatear fechas de PostgreSQL a formato YYYY-MM-DD
 * Usa UTC para evitar problemas de zona horaria
 */
const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';

    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  } catch (error) {
    console.error('Error formateando fecha:', error);
    return '';
  }
};

/**
 * FacturaTemplate - Plantilla de legalización de facturas
 *
 * Formulario completo para diligenciar información de factura
 * con campos automáticos desde T_Facturas y campos manuales
 */
const FacturaTemplate = ({ factura, onClose, onSave }) => {
  const { cuentas, loading: loadingCuentas } = useCuentasContables();
  const { centros, loading: loadingCentros, validarResponsable } = useCentrosCostos();

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
      centroCostos: '',
      respCentroCostos: '',
      cargoCentroCostos: '',
      porcentaje: ''
    }
  ]);

  // Estados para el dropdown de cuentas contables
  const [dropdownAbierto, setDropdownAbierto] = useState({});
  const [dropdownPositions, setDropdownPositions] = useState({});
  const [inputValues, setInputValues] = useState({});
  const [selectedIndexCuentas, setSelectedIndexCuentas] = useState({});
  const dropdownRefs = useRef({});

  // Estados para el dropdown de centros de costos
  const [dropdownCentrosAbierto, setDropdownCentrosAbierto] = useState({});
  const [dropdownCentrosPositions, setDropdownCentrosPositions] = useState({});
  const [inputCentrosValues, setInputCentrosValues] = useState({});
  const [selectedIndexCentros, setSelectedIndexCentros] = useState({});
  const dropdownCentrosRefs = useRef({});

  // Bloquear scroll del body cuando el componente está montado
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  // Cargar datos automáticos de la factura
  useEffect(() => {
    if (factura) {
      console.log('📋 Datos de factura recibidos:', factura);
      console.log('📅 fecha_factura:', factura.fecha_factura);
      console.log('📅 fecha_entrega:', factura.fecha_entrega);

      setConsecutivo(factura.numero_control || '');
      setProveedor(factura.proveedor || '');
      setNumeroFactura(factura.numero_factura || '');

      const fechaFacturaFormateada = formatDate(factura.fecha_factura);
      const fechaRecepcionFormateada = formatDate(factura.fecha_entrega);

      console.log('✅ Fecha factura formateada:', fechaFacturaFormateada);
      console.log('✅ Fecha recepción formateada:', fechaRecepcionFormateada);

      setFechaFactura(fechaFacturaFormateada);
      setFechaRecepcion(fechaRecepcionFormateada);
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
        centroCostos: '',
        respCentroCostos: '',
        cargoCentroCostos: '',
        porcentaje: ''
      }
    ]);
  };

  const handleRemoveFila = (id) => {
    setFilasControl(prevFilas => {
      if (prevFilas.length > 1) {
        return prevFilas.filter(f => f.id !== id);
      }
      return prevFilas;
    });
  };

  const handleFilaChange = (id, field, value) => {
    setFilasControl(prevFilas => prevFilas.map(fila =>
      fila.id === id ? { ...fila, [field]: value } : fila
    ));
  };

  const handlePorcentajeKeyDown = (e, currentFilaId) => {
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();

      const currentIndex = filasControl.findIndex(f => f.id === currentFilaId);
      const nextIndex = currentIndex + 1;

      if (nextIndex < filasControl.length) {
        const nextFilaId = filasControl[nextIndex].id;
        const nextInput = document.querySelector(`input[data-porcentaje-id="${nextFilaId}"]`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    }
  };

  const handleCuentaContableKeyDown = (e, currentFilaId) => {
    const cuentasFiltradas = getFiltradas(inputValues[currentFilaId] || '');
    const dropdownVisible = dropdownAbierto[currentFilaId] && cuentasFiltradas.length > 0;
    const currentSelectedIndex = selectedIndexCuentas[currentFilaId] ?? -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (dropdownVisible) {
        const newIndex = currentSelectedIndex < cuentasFiltradas.length - 1 ? currentSelectedIndex + 1 : 0;
        setSelectedIndexCuentas(prev => ({ ...prev, [currentFilaId]: newIndex }));

        setTimeout(() => {
          const selectedOption = document.querySelector(`[data-cuenta-option="${currentFilaId}-${newIndex}"]`);
          if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }, 0);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (dropdownVisible) {
        const newIndex = currentSelectedIndex > 0 ? currentSelectedIndex - 1 : cuentasFiltradas.length - 1;
        setSelectedIndexCuentas(prev => ({ ...prev, [currentFilaId]: newIndex }));

        setTimeout(() => {
          const selectedOption = document.querySelector(`[data-cuenta-option="${currentFilaId}-${newIndex}"]`);
          if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }, 0);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (dropdownVisible && currentSelectedIndex >= 0) {
        const cuentaSeleccionada = cuentasFiltradas[currentSelectedIndex];
        handleCuentaContableChange(currentFilaId, cuentaSeleccionada.cuenta);
        setSelectedIndexCuentas(prev => ({ ...prev, [currentFilaId]: -1 }));
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();

      const currentIndex = filasControl.findIndex(f => f.id === currentFilaId);
      const nextIndex = currentIndex + 1;

      if (nextIndex < filasControl.length) {
        const nextFilaId = filasControl[nextIndex].id;
        const nextInput = document.querySelector(`input[data-cuenta-id="${nextFilaId}"]`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    }
  };

  const handleCentroCostosKeyDown = (e, currentFilaId) => {
    const centrosFiltrados = getCentrosFiltrados(inputCentrosValues[currentFilaId] || '');
    const dropdownVisible = dropdownCentrosAbierto[currentFilaId] && centrosFiltrados.length > 0;
    const currentSelectedIndex = selectedIndexCentros[currentFilaId] ?? -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (dropdownVisible) {
        const newIndex = currentSelectedIndex < centrosFiltrados.length - 1 ? currentSelectedIndex + 1 : 0;
        setSelectedIndexCentros(prev => ({ ...prev, [currentFilaId]: newIndex }));

        setTimeout(() => {
          const selectedOption = document.querySelector(`[data-centro-option="${currentFilaId}-${newIndex}"]`);
          if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }, 0);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (dropdownVisible) {
        const newIndex = currentSelectedIndex > 0 ? currentSelectedIndex - 1 : centrosFiltrados.length - 1;
        setSelectedIndexCentros(prev => ({ ...prev, [currentFilaId]: newIndex }));

        setTimeout(() => {
          const selectedOption = document.querySelector(`[data-centro-option="${currentFilaId}-${newIndex}"]`);
          if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }, 0);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (dropdownVisible && currentSelectedIndex >= 0) {
        const centroSeleccionado = centrosFiltrados[currentSelectedIndex];
        handleCentroCostosChange(currentFilaId, centroSeleccionado.codigo);
        setSelectedIndexCentros(prev => ({ ...prev, [currentFilaId]: -1 }));
      }
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();

      const currentIndex = filasControl.findIndex(f => f.id === currentFilaId);
      const nextIndex = currentIndex + 1;

      if (nextIndex < filasControl.length) {
        const nextFilaId = filasControl[nextIndex].id;
        const nextInput = document.querySelector(`input[data-centro-id="${nextFilaId}"]`);
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      }
    }
  };

  const handleCuentaContableChange = (id, codigoCuenta) => {
    const cuentaData = cuentas.find(c => c.cuenta === codigoCuenta);

    setInputValues(prev => ({ ...prev, [id]: codigoCuenta }));

    if (cuentaData) {
      setFilasControl(prevFilas => prevFilas.map(fila =>
        fila.id === id ? {
          ...fila,
          noCuentaContable: codigoCuenta,
          respCuentaContable: cuentaData.nombre_responsable || '',
          cargoCuentaContable: cuentaData.cargo || '',
          nombreCuentaContable: cuentaData.nombre_cuenta || ''
        } : fila
      ));
      setDropdownAbierto(prevDropdown => ({ ...prevDropdown, [id]: false }));
    } else {
      setFilasControl(prevFilas => prevFilas.map(fila =>
        fila.id === id ? {
          ...fila,
          noCuentaContable: codigoCuenta,
          respCuentaContable: '',
          cargoCuentaContable: '',
          nombreCuentaContable: ''
        } : fila
      ));
    }
  };

  const handleInputChange = (id, value) => {
    flushSync(() => {
      setInputValues(prev => ({ ...prev, [id]: value }));
      setSelectedIndexCuentas(prev => ({ ...prev, [id]: -1 }));

      setFilasControl(prevFilas => prevFilas.map(fila =>
        fila.id === id ? { ...fila, noCuentaContable: value } : fila
      ));

      const element = dropdownRefs.current[id];
      if (element) {
        const rect = element.getBoundingClientRect();
        setDropdownPositions(prevPositions => ({
          ...prevPositions,
          [id]: {
            top: rect.bottom,
            left: rect.left,
            width: rect.width
          }
        }));
      }

      setDropdownAbierto(prevDropdown => ({ ...prevDropdown, [id]: true }));
    });
  };

  const handleFocus = (id) => {
    const fila = filasControl.find(f => f.id === id);

    if (inputValues[id] === undefined && fila) {
      const valorInicial = fila.noCuentaContable || '';
      setInputValues(prev => ({ ...prev, [id]: valorInicial }));
    }

    const element = dropdownRefs.current[id];
    if (element) {
      const rect = element.getBoundingClientRect();
      setDropdownPositions(prevPositions => ({
        ...prevPositions,
        [id]: {
          top: rect.bottom,
          left: rect.left,
          width: rect.width
        }
      }));
    }
    setDropdownAbierto(prevDropdown => ({ ...prevDropdown, [id]: true }));
  };

  const getFiltradas = (filtro) => {
    if (!filtro || filtro.trim() === '') {
      return cuentas;
    }

    const filtroUpper = filtro.toUpperCase();
    return cuentas.filter(cuenta =>
      cuenta.cuenta.toString().toUpperCase().startsWith(filtroUpper)
    );
  };

  const handleCentroCostosChange = async (id, codigo) => {
    const centroData = centros.find(c => c.codigo === codigo);

    setInputCentrosValues(prev => ({ ...prev, [id]: codigo }));

    if (centroData) {
      const responsableData = await validarResponsable(centroData.responsable);

      setFilasControl(prevFilas => prevFilas.map(fila =>
        fila.id === id ? {
          ...fila,
          centroCostos: codigo,
          respCentroCostos: centroData.responsable || '',
          cargoCentroCostos: responsableData?.cargo || ''
        } : fila
      ));
      setDropdownCentrosAbierto(prevDropdown => ({ ...prevDropdown, [id]: false }));
    } else {
      setFilasControl(prevFilas => prevFilas.map(fila =>
        fila.id === id ? {
          ...fila,
          centroCostos: codigo,
          respCentroCostos: '',
          cargoCentroCostos: ''
        } : fila
      ));
    }
  };

  const handleInputCentrosChange = (id, value) => {
    flushSync(() => {
      setInputCentrosValues(prev => ({ ...prev, [id]: value }));
      setSelectedIndexCentros(prev => ({ ...prev, [id]: -1 }));

      setFilasControl(prevFilas => prevFilas.map(fila =>
        fila.id === id ? { ...fila, centroCostos: value } : fila
      ));

      const element = dropdownCentrosRefs.current[id];
      if (element) {
        const rect = element.getBoundingClientRect();
        setDropdownCentrosPositions(prevPositions => ({
          ...prevPositions,
          [id]: {
            top: rect.bottom,
            left: rect.left,
            width: rect.width
          }
        }));
      }

      setDropdownCentrosAbierto(prevDropdown => ({ ...prevDropdown, [id]: true }));
    });
  };

  const handleCentrosFocus = (id) => {
    const fila = filasControl.find(f => f.id === id);
    if (inputCentrosValues[id] === undefined && fila) {
      setInputCentrosValues(prev => ({ ...prev, [id]: fila.centroCostos }));
    }

    const element = dropdownCentrosRefs.current[id];
    if (element) {
      const rect = element.getBoundingClientRect();
      setDropdownCentrosPositions(prevPositions => ({
        ...prevPositions,
        [id]: {
          top: rect.bottom,
          left: rect.left,
          width: rect.width
        }
      }));
    }
    setDropdownCentrosAbierto(prevDropdown => ({ ...prevDropdown, [id]: true }));
  };

  const getCentrosFiltrados = (filtro) => {
    if (!filtro || filtro.trim() === '') {
      return centros;
    }

    const filtroUpper = filtro.toUpperCase();
    return centros.filter(centro =>
      centro.codigo.toString().toUpperCase().startsWith(filtroUpper)
    );
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      Object.keys(dropdownRefs.current).forEach((id) => {
        if (dropdownRefs.current[id] && !dropdownRefs.current[id].contains(event.target)) {
          setDropdownAbierto(prev => ({ ...prev, [id]: false }));
        }
      });

      Object.keys(dropdownCentrosRefs.current).forEach((id) => {
        if (dropdownCentrosRefs.current[id] && !dropdownCentrosRefs.current[id].contains(event.target)) {
          setDropdownCentrosAbierto(prev => ({ ...prev, [id]: false }));
        }
      });
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const calcularTotalPorcentaje = () => {
    return filasControl.reduce((total, fila) => {
      const valor = parseFloat(fila.porcentaje) || 0;
      return total + valor;
    }, 0);
  };

  const esPorcentajeValido = (total) => {
    return total === 100;
  };

  const handleSave = () => {
    const totalPorcentaje = calcularTotalPorcentaje();
    if (!esPorcentajeValido(totalPorcentaje)) {
      alert(`El porcentaje total debe ser exactamente 100%. Actualmente es ${totalPorcentaje.toFixed(2)}%`);
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
                  title={consecutivo}
                />
              </div>

              <div className="factura-field">
                <label className="factura-label">Proveedor</label>
                <Input
                  type="text"
                  value={proveedor}
                  disabled
                  className="factura-input-disabled"
                  title={proveedor}
                />
              </div>

              <div className="factura-field">
                <label className="factura-label"># Factura</label>
                <Input
                  type="text"
                  value={numeroFactura}
                  disabled
                  className="factura-input-disabled"
                  title={numeroFactura}
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
                  title={nombreNegociador}
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
                  title={cargoNegociador}
                />
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
                    <th>C.Co</th>
                    <th>Resp. C.Co</th>
                    <th>Cargo Resp. C.Co</th>
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
                        <div
                          className="factura-autocomplete-wrapper"
                          ref={(el) => dropdownRefs.current[fila.id] = el}
                        >
                          <Input
                            type="text"
                            value={inputValues[fila.id] !== undefined ? inputValues[fila.id] : fila.noCuentaContable}
                            onChange={(e) => handleInputChange(fila.id, e.target.value)}
                            onFocus={() => handleFocus(fila.id)}
                            placeholder={loadingCuentas ? "Cargando..." : "Buscar cuenta..."}
                            className="factura-table-input"
                            disabled={loadingCuentas}
                            data-cuenta-id={fila.id}
                            onKeyDown={(e) => handleCuentaContableKeyDown(e, fila.id)}
                          />
                          {dropdownAbierto[fila.id] && !loadingCuentas && dropdownPositions[fila.id] && getFiltradas(inputValues[fila.id] || '').length > 0 && (
                            <div
                              className="factura-autocomplete-dropdown"
                              style={{
                                top: `${dropdownPositions[fila.id].top}px`,
                                left: `${dropdownPositions[fila.id].left}px`,
                                width: `${dropdownPositions[fila.id].width}px`
                              }}
                            >
                              {getFiltradas(inputValues[fila.id] || '').map((cuenta, index) => (
                                <div
                                  key={`cuenta-${cuenta.cuenta}-${index}`}
                                  data-cuenta-option={`${fila.id}-${index}`}
                                  className={`factura-autocomplete-option ${index === selectedIndexCuentas[fila.id] ? 'factura-autocomplete-option-selected' : ''}`}
                                  onClick={() => handleCuentaContableChange(fila.id, cuenta.cuenta)}
                                >
                                  {cuenta.cuenta}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.respCuentaContable}
                          disabled
                          className="factura-table-input factura-input-disabled"
                          title={fila.respCuentaContable}
                        />
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.cargoCuentaContable}
                          disabled
                          className="factura-table-input factura-input-disabled"
                          title={fila.cargoCuentaContable}
                        />
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.nombreCuentaContable}
                          disabled
                          className="factura-table-input factura-input-disabled"
                          title={fila.nombreCuentaContable}
                        />
                      </td>
                      <td>
                        <div
                          className="factura-autocomplete-wrapper"
                          ref={(el) => dropdownCentrosRefs.current[fila.id] = el}
                        >
                          <Input
                            type="text"
                            value={inputCentrosValues[fila.id] !== undefined ? inputCentrosValues[fila.id] : fila.centroCostos}
                            onChange={(e) => handleInputCentrosChange(fila.id, e.target.value)}
                            onFocus={() => handleCentrosFocus(fila.id)}
                            placeholder={loadingCentros ? "Cargando..." : "Buscar centro..."}
                            className="factura-table-input"
                            disabled={loadingCentros}
                            data-centro-id={fila.id}
                            onKeyDown={(e) => handleCentroCostosKeyDown(e, fila.id)}
                          />
                          {dropdownCentrosAbierto[fila.id] && !loadingCentros && dropdownCentrosPositions[fila.id] && getCentrosFiltrados(inputCentrosValues[fila.id] || '').length > 0 && (
                            <div
                              className="factura-autocomplete-dropdown"
                              style={{
                                top: `${dropdownCentrosPositions[fila.id].top}px`,
                                left: `${dropdownCentrosPositions[fila.id].left}px`,
                                width: `${dropdownCentrosPositions[fila.id].width}px`
                              }}
                            >
                              {getCentrosFiltrados(inputCentrosValues[fila.id] || '').map((centro, index) => (
                                <div
                                  key={`centro-${centro.codigo}-${index}`}
                                  data-centro-option={`${fila.id}-${index}`}
                                  className={`factura-autocomplete-option ${index === selectedIndexCentros[fila.id] ? 'factura-autocomplete-option-selected' : ''}`}
                                  onClick={() => handleCentroCostosChange(fila.id, centro.codigo)}
                                >
                                  {centro.codigo}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.respCentroCostos}
                          disabled
                          className="factura-table-input factura-input-disabled"
                          title={fila.respCentroCostos}
                        />
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={fila.cargoCentroCostos}
                          disabled
                          className="factura-table-input factura-input-disabled"
                          title={fila.cargoCentroCostos}
                        />
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
                          data-porcentaje-id={fila.id}
                          onKeyDown={(e) => handlePorcentajeKeyDown(e, fila.id)}
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
                    <td colSpan="8" style={{ textAlign: 'right', fontWeight: '600', color: '#374151' }}>
                      Total Porcentaje:
                    </td>
                    <td>
                      <div className={`factura-total-porcentaje ${!esPorcentajeValido(calcularTotalPorcentaje()) ? 'factura-total-error' : 'factura-total-ok'}`}>
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
