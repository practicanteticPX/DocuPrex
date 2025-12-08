import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { X, Plus, Info } from 'lucide-react';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Modal } from '../ui/modal';
import { useCuentasContables, useCentrosCostos, useNegociadores } from '../../hooks';
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
 * Mensajes informativos para tooltips del checklist
 */
const CHECKLIST_TOOLTIPS = {
  fechaEmision: 'Marque si revisó la fecha de emisión de la factura y es correcta. En caso contrario solicite a su proveedor la modificación de la misma.',
  fechaVencimiento: 'Marque si revisó la Fecha de vencimiento de la factura y es correcta. En caso contrario solicite a su proveedor la modificación de la misma.',
  cantidades: 'Marque si revisó que las cantidades cobradas en la factura son correctas. Si no son correctas, por favor solicite a su proveedor la modificación de la factura.',
  precioUnitario: 'Marque si revisó que el precio unitario cobrado en la factura es correcto. Si no es correcto, por favor solicite a su proveedor la modificación de la factura.',
  fletes: 'Marque si revisó que los fletes cobrados en la factura son correctos. Si no son correctos, por favor solicite a su proveedor la modificación de la factura.',
  valoresTotales: 'Marque si revisó que el total de la factura fuera igual al total de la Orden de compra emitida. En caso contrario solicite a su proveedor la modificación de la misma.',
  descuentosTotales: 'Marque si revisó que los descuentos totales en la factura son correctos. Si no son correctos, por favor solicite a su proveedor la modificación de la factura.'
};

/**
 * FacturaTemplate - Plantilla de legalización de facturas
 *
 * Formulario completo para diligenciar información de factura
 * con campos automáticos desde T_Facturas y campos manuales
 *
 * @param {Object} factura - Datos de la factura desde T_Facturas
 * @param {Object} savedData - Datos previamente guardados de la plantilla (para edición)
 * @param {Function} onClose - Callback al cerrar el modal
 * @param {Function} onBack - Callback al volver al paso anterior (buscar factura)
 * @param {Function} onSave - Callback al guardar los datos
 */
const FacturaTemplate = ({ factura, savedData, onClose, onBack, onSave }) => {
  const { cuentas, loading: loadingCuentas } = useCuentasContables();
  const { centros, loading: loadingCentros, validarResponsable } = useCentrosCostos();
  const { negociadores, loading: loadingNegociadores } = useNegociadores();

  // Estados para campos automáticos desde T_Facturas
  const [consecutivo, setConsecutivo] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [fechaFactura, setFechaFactura] = useState('');
  const [fechaRecepcion, setFechaRecepcion] = useState('');
  const [legalizaAnticipo, setLegalizaAnticipo] = useState(false);

  // Estados para el checklist de revisión
  const [checklistRevision, setChecklistRevision] = useState({
    fechaEmision: false,
    fechaVencimiento: false,
    cantidades: false,
    precioUnitario: false,
    fletes: false,
    valoresTotales: false,
    descuentosTotales: false
  });

  // Estados para campos manuales
  const [nombreNegociador, setNombreNegociador] = useState('');
  const [cargoNegociador, setCargoNegociador] = useState('');

  // Estado para grupo de causación
  const [grupoCausacion, setGrupoCausacion] = useState('');

  // Estado para las filas de la tabla de control de firmas
  const [filasControl, setFilasControl] = useState([
    {
      id: 1,
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

  // Estados para el dropdown de negociadores
  const [dropdownNegociadoresAbierto, setDropdownNegociadoresAbierto] = useState(false);
  const [dropdownNegociadoresPosition, setDropdownNegociadoresPosition] = useState({});
  const [inputNegociadorValue, setInputNegociadorValue] = useState('');
  const [selectedIndexNegociadores, setSelectedIndexNegociadores] = useState(-1);
  const dropdownNegociadoresRef = useRef(null);

  // Estados para el modal de validación
  const [modalAbierto, setModalAbierto] = useState(false);
  const [mensajeError, setMensajeError] = useState('');

  // Estado para tooltips del checklist
  const [tooltipAbierto, setTooltipAbierto] = useState(null);

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

  // Cargar datos previamente guardados si existen (para edición)
  useEffect(() => {
    if (savedData) {
      console.log('🔄 Cargando datos guardados de la plantilla:', savedData);

      // Restaurar campos manuales
      if (savedData.legalizaAnticipo !== undefined) setLegalizaAnticipo(savedData.legalizaAnticipo);
      if (savedData.checklistRevision) setChecklistRevision(savedData.checklistRevision);
      if (savedData.nombreNegociador) setNombreNegociador(savedData.nombreNegociador);
      if (savedData.cargoNegociador) setCargoNegociador(savedData.cargoNegociador);
      if (savedData.grupoCausacion) setGrupoCausacion(savedData.grupoCausacion);
      if (savedData.filasControl) setFilasControl(savedData.filasControl);

      console.log('✅ Datos de plantilla restaurados correctamente');
    }
  }, [savedData]);

  const handleAddFila = () => {
    const newId = Math.max(...filasControl.map(f => f.id), 0) + 1;
    setFilasControl([
      ...filasControl,
      {
        id: newId,
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

  const handleChecklistChange = (field) => {
    setChecklistRevision(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const handleTooltipToggle = (tooltipId) => {
    setTooltipAbierto(prev => prev === tooltipId ? null : tooltipId);
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
        fila.id === id ? {
          ...fila,
          noCuentaContable: value,
          respCuentaContable: value.trim() === '' ? '' : fila.respCuentaContable,
          cargoCuentaContable: value.trim() === '' ? '' : fila.cargoCuentaContable,
          nombreCuentaContable: value.trim() === '' ? '' : fila.nombreCuentaContable
        } : fila
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
        fila.id === id ? {
          ...fila,
          centroCostos: value,
          respCentroCostos: value.trim() === '' ? '' : fila.respCentroCostos,
          cargoCentroCostos: value.trim() === '' ? '' : fila.cargoCentroCostos
        } : fila
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

  const handleNegociadorChange = (nombre) => {
    const negociadorData = negociadores.find(n => n.negociador === nombre);

    setInputNegociadorValue(nombre);

    if (negociadorData) {
      setNombreNegociador(nombre);
      setCargoNegociador(negociadorData.cargo || '');
      setDropdownNegociadoresAbierto(false);
    } else {
      setNombreNegociador(nombre);
      setCargoNegociador('');
    }
  };

  const handleInputNegociadorChange = (value) => {
    flushSync(() => {
      setInputNegociadorValue(value);
      setSelectedIndexNegociadores(-1);

      setNombreNegociador(value);
      setCargoNegociador(value.trim() === '' ? '' : cargoNegociador);

      const element = dropdownNegociadoresRef.current;
      if (element) {
        const rect = element.getBoundingClientRect();
        setDropdownNegociadoresPosition({
          top: rect.bottom,
          left: rect.left,
          width: rect.width
        });
      }

      setDropdownNegociadoresAbierto(true);
    });
  };

  const handleNegociadorFocus = () => {
    if (inputNegociadorValue === undefined) {
      setInputNegociadorValue(nombreNegociador || '');
    }

    const element = dropdownNegociadoresRef.current;
    if (element) {
      const rect = element.getBoundingClientRect();
      setDropdownNegociadoresPosition({
        top: rect.bottom,
        left: rect.left,
        width: rect.width
      });
    }
    setDropdownNegociadoresAbierto(true);
  };

  const handleNegociadorKeyDown = (e) => {
    const negociadoresFiltrados = getNegociadoresFiltrados(inputNegociadorValue || '');
    const dropdownVisible = dropdownNegociadoresAbierto && negociadoresFiltrados.length > 0;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (dropdownVisible) {
        const newIndex = selectedIndexNegociadores < negociadoresFiltrados.length - 1 ? selectedIndexNegociadores + 1 : 0;
        setSelectedIndexNegociadores(newIndex);

        setTimeout(() => {
          const selectedOption = document.querySelector(`[data-negociador-option="${newIndex}"]`);
          if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }, 0);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (dropdownVisible) {
        const newIndex = selectedIndexNegociadores > 0 ? selectedIndexNegociadores - 1 : negociadoresFiltrados.length - 1;
        setSelectedIndexNegociadores(newIndex);

        setTimeout(() => {
          const selectedOption = document.querySelector(`[data-negociador-option="${newIndex}"]`);
          if (selectedOption) {
            selectedOption.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          }
        }, 0);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (dropdownVisible && selectedIndexNegociadores >= 0) {
        const negociadorSeleccionado = negociadoresFiltrados[selectedIndexNegociadores];
        handleNegociadorChange(negociadorSeleccionado.negociador);
        setSelectedIndexNegociadores(-1);
      }
    }
  };

  const getNegociadoresFiltrados = (filtro) => {
    if (!filtro || filtro.trim() === '') {
      return negociadores;
    }

    const filtroUpper = filtro.toUpperCase();
    return negociadores.filter(negociador =>
      negociador.negociador.toUpperCase().includes(filtroUpper)
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

      if (dropdownNegociadoresRef.current && !dropdownNegociadoresRef.current.contains(event.target)) {
        setDropdownNegociadoresAbierto(false);
      }

      if (tooltipAbierto && !event.target.closest('.factura-info-btn') && !event.target.closest('.factura-tooltip')) {
        setTooltipAbierto(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [tooltipAbierto]);

  const calcularTotalPorcentaje = () => {
    return filasControl.reduce((total, fila) => {
      const valor = parseFloat(fila.porcentaje) || 0;
      return total + valor;
    }, 0);
  };

  const esPorcentajeValido = (total) => {
    return total === 100;
  };

  const validarFormulario = () => {
    const errores = [];

    const checklistLabels = {
      fechaEmision: 'Fecha de Emisión',
      fechaVencimiento: 'Fecha de Vencimiento',
      cantidades: 'Cantidades',
      precioUnitario: 'Precio Unitario',
      fletes: 'Fletes',
      valoresTotales: 'Vlr Totales = Vlr Orden de Compra',
      descuentosTotales: 'Descuentos Totales'
    };

    Object.keys(checklistRevision).forEach(key => {
      if (!checklistRevision[key]) {
        errores.push(`Debe marcar el checklist: "${checklistLabels[key]}"`);
      }
    });

    if (!nombreNegociador.trim()) {
      errores.push('El nombre del negociador es obligatorio');
    }

    if (!cargoNegociador.trim()) {
      errores.push('El cargo del negociador es obligatorio');
    }

    if (!grupoCausacion) {
      errores.push('Debe seleccionar un grupo de causación');
    }

    for (let i = 0; i < filasControl.length; i++) {
      const fila = filasControl[i];
      const numeroFila = i + 1;

      if (!fila.noCuentaContable.trim()) {
        errores.push(`Fila ${numeroFila}: El campo "No. Cuenta Contable" es obligatorio`);
      }

      if (!fila.centroCostos.trim()) {
        errores.push(`Fila ${numeroFila}: El campo "Centro de Costos" es obligatorio`);
      }

      if (!fila.porcentaje || fila.porcentaje.trim() === '') {
        errores.push(`Fila ${numeroFila}: El campo "Porcentaje" es obligatorio`);
      } else {
        const porcentajeNum = parseFloat(fila.porcentaje);
        if (isNaN(porcentajeNum) || porcentajeNum <= 0) {
          errores.push(`Fila ${numeroFila}: El porcentaje debe ser un número mayor a 0`);
        }
      }
    }

    const totalPorcentaje = calcularTotalPorcentaje();
    if (!esPorcentajeValido(totalPorcentaje)) {
      errores.push(`El porcentaje total debe ser exactamente 100%. Actualmente es ${totalPorcentaje.toFixed(2)}%`);
    }

    return errores;
  };

  const handleSave = () => {
    const errores = validarFormulario();

    if (errores.length > 0) {
      setMensajeError(errores.join('\n'));
      setModalAbierto(true);
      return;
    }

    if (onSave) {
      onSave({
        consecutivo,
        proveedor,
        numeroFactura,
        fechaFactura,
        fechaRecepcion,
        legalizaAnticipo,
        checklistRevision,
        nombreNegociador,
        cargoNegociador,
        grupoCausacion,
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

              <div className="factura-field factura-field-checkbox-simple">
                <label className="factura-checkbox-simple-label">
                  <Checkbox
                    id="legaliza-anticipo"
                    checked={legalizaAnticipo}
                    onCheckedChange={setLegalizaAnticipo}
                  />
                  <span className="factura-checkbox-simple-text">Legaliza Anticipo</span>
                </label>
              </div>
            </div>
          </div>

          {/* Sección: Checklist de Revisión */}
          <div className="factura-section">
            <h2 className="factura-section-title">Checklist de Revisión de Condiciones de Negociación</h2>

            <div className="factura-checklist-grid">
              <div
                className="factura-checklist-item"
                onClick={() => handleChecklistChange('fechaEmision')}
              >
                <div className="factura-checklist-label">
                  <Checkbox
                    checked={checklistRevision.fechaEmision}
                    onCheckedChange={() => {}}
                  />
                  <span className="factura-checklist-text">Fecha de Emisión</span>
                </div>
                <div className="factura-info-btn-wrapper">
                  <button
                    type="button"
                    className="factura-info-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTooltipToggle('fechaEmision');
                    }}
                    title="Ver información"
                  >
                    <Info size={14} />
                  </button>
                  {tooltipAbierto === 'fechaEmision' && (
                    <div className="factura-tooltip">
                      {CHECKLIST_TOOLTIPS.fechaEmision}
                      <div className="factura-tooltip-arrow"></div>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="factura-checklist-item"
                onClick={() => handleChecklistChange('fechaVencimiento')}
              >
                <div className="factura-checklist-label">
                  <Checkbox
                    checked={checklistRevision.fechaVencimiento}
                    onCheckedChange={() => {}}
                  />
                  <span className="factura-checklist-text">Fecha de Vencimiento</span>
                </div>
                <div className="factura-info-btn-wrapper">
                  <button
                    type="button"
                    className="factura-info-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTooltipToggle('fechaVencimiento');
                    }}
                    title="Ver información"
                  >
                    <Info size={14} />
                  </button>
                  {tooltipAbierto === 'fechaVencimiento' && (
                    <div className="factura-tooltip">
                      {CHECKLIST_TOOLTIPS.fechaVencimiento}
                      <div className="factura-tooltip-arrow"></div>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="factura-checklist-item"
                onClick={() => handleChecklistChange('cantidades')}
              >
                <div className="factura-checklist-label">
                  <Checkbox
                    checked={checklistRevision.cantidades}
                    onCheckedChange={() => {}}
                  />
                  <span className="factura-checklist-text">Cantidades</span>
                </div>
                <div className="factura-info-btn-wrapper">
                  <button
                    type="button"
                    className="factura-info-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTooltipToggle('cantidades');
                    }}
                    title="Ver información"
                  >
                    <Info size={14} />
                  </button>
                  {tooltipAbierto === 'cantidades' && (
                    <div className="factura-tooltip">
                      {CHECKLIST_TOOLTIPS.cantidades}
                      <div className="factura-tooltip-arrow"></div>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="factura-checklist-item"
                onClick={() => handleChecklistChange('precioUnitario')}
              >
                <div className="factura-checklist-label">
                  <Checkbox
                    checked={checklistRevision.precioUnitario}
                    onCheckedChange={() => {}}
                  />
                  <span className="factura-checklist-text">Precio Unitario</span>
                </div>
                <div className="factura-info-btn-wrapper">
                  <button
                    type="button"
                    className="factura-info-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTooltipToggle('precioUnitario');
                    }}
                    title="Ver información"
                  >
                    <Info size={14} />
                  </button>
                  {tooltipAbierto === 'precioUnitario' && (
                    <div className="factura-tooltip">
                      {CHECKLIST_TOOLTIPS.precioUnitario}
                      <div className="factura-tooltip-arrow"></div>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="factura-checklist-item"
                onClick={() => handleChecklistChange('fletes')}
              >
                <div className="factura-checklist-label">
                  <Checkbox
                    checked={checklistRevision.fletes}
                    onCheckedChange={() => {}}
                  />
                  <span className="factura-checklist-text">Fletes</span>
                </div>
                <div className="factura-info-btn-wrapper">
                  <button
                    type="button"
                    className="factura-info-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTooltipToggle('fletes');
                    }}
                    title="Ver información"
                  >
                    <Info size={14} />
                  </button>
                  {tooltipAbierto === 'fletes' && (
                    <div className="factura-tooltip">
                      {CHECKLIST_TOOLTIPS.fletes}
                      <div className="factura-tooltip-arrow"></div>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="factura-checklist-item factura-checklist-item-wide"
                onClick={() => handleChecklistChange('valoresTotales')}
              >
                <div className="factura-checklist-label">
                  <Checkbox
                    checked={checklistRevision.valoresTotales}
                    onCheckedChange={() => {}}
                  />
                  <span className="factura-checklist-text">Vlr Totales = Vlr Orden de Compra</span>
                </div>
                <div className="factura-info-btn-wrapper">
                  <button
                    type="button"
                    className="factura-info-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTooltipToggle('valoresTotales');
                    }}
                    title="Ver información"
                  >
                    <Info size={14} />
                  </button>
                  {tooltipAbierto === 'valoresTotales' && (
                    <div className="factura-tooltip">
                      {CHECKLIST_TOOLTIPS.valoresTotales}
                      <div className="factura-tooltip-arrow"></div>
                    </div>
                  )}
                </div>
              </div>

              <div
                className="factura-checklist-item"
                onClick={() => handleChecklistChange('descuentosTotales')}
              >
                <div className="factura-checklist-label">
                  <Checkbox
                    checked={checklistRevision.descuentosTotales}
                    onCheckedChange={() => {}}
                  />
                  <span className="factura-checklist-text">Descuentos Totales</span>
                </div>
                <div className="factura-info-btn-wrapper">
                  <button
                    type="button"
                    className="factura-info-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTooltipToggle('descuentosTotales');
                    }}
                    title="Ver información"
                  >
                    <Info size={14} />
                  </button>
                  {tooltipAbierto === 'descuentosTotales' && (
                    <div className="factura-tooltip">
                      {CHECKLIST_TOOLTIPS.descuentosTotales}
                      <div className="factura-tooltip-arrow"></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sección: Negociador */}
          <div className="factura-section">
            <h2 className="factura-section-title">Información del Negociador</h2>

            <div className="factura-grid">
              <div className="factura-field">
                <label className="factura-label">Nombre Negociador</label>
                <div
                  className="factura-autocomplete-wrapper"
                  ref={dropdownNegociadoresRef}
                >
                  <Input
                    type="text"
                    value={inputNegociadorValue !== undefined && inputNegociadorValue !== '' ? inputNegociadorValue : nombreNegociador}
                    onChange={(e) => handleInputNegociadorChange(e.target.value)}
                    onFocus={handleNegociadorFocus}
                    onKeyDown={handleNegociadorKeyDown}
                    placeholder={loadingNegociadores ? "Cargando..." : "Buscar negociador..."}
                    disabled={loadingNegociadores}
                    title={nombreNegociador}
                  />
                  {dropdownNegociadoresAbierto && !loadingNegociadores && dropdownNegociadoresPosition.top && getNegociadoresFiltrados(inputNegociadorValue || '').length > 0 && (
                    <div
                      className="factura-autocomplete-dropdown"
                      style={{
                        top: `${dropdownNegociadoresPosition.top}px`,
                        left: `${dropdownNegociadoresPosition.left}px`,
                        width: `${dropdownNegociadoresPosition.width}px`
                      }}
                    >
                      {getNegociadoresFiltrados(inputNegociadorValue || '').map((negociador, index) => (
                        <div
                          key={`negociador-${negociador.negociador}-${index}`}
                          data-negociador-option={index}
                          className={`factura-autocomplete-option ${index === selectedIndexNegociadores ? 'factura-autocomplete-option-selected' : ''}`}
                          onClick={() => handleNegociadorChange(negociador.negociador)}
                        >
                          {negociador.negociador}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="factura-field">
                <label className="factura-label">Cargo Negociador</label>
                <Input
                  type="text"
                  value={cargoNegociador}
                  disabled
                  className="factura-input-disabled"
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
                    <td colSpan="7" style={{ textAlign: 'right', fontWeight: '600', color: '#374151' }}>
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

          {/* Sección: Grupo de Causación */}
          <div className="factura-section">
            <h2 className="factura-section-title">Grupo de Causación</h2>
            <p className="factura-checklist-description">
              Seleccione el grupo que realizará el proceso de causación. Todas las personas del grupo seleccionado recibirán una notificación para firmar.
            </p>

            <div className="factura-checklist-grid">
              <div
                className="factura-checklist-item"
                onClick={() => setGrupoCausacion('financiera')}
              >
                <div className="factura-checklist-label">
                  <Checkbox
                    checked={grupoCausacion === 'financiera'}
                    onCheckedChange={() => {}}
                  />
                  <span className="factura-checklist-text">Financiera</span>
                </div>
              </div>

              <div
                className="factura-checklist-item"
                onClick={() => setGrupoCausacion('logistica')}
              >
                <div className="factura-checklist-label">
                  <Checkbox
                    checked={grupoCausacion === 'logistica'}
                    onCheckedChange={() => {}}
                  />
                  <span className="factura-checklist-text">Logística</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="factura-template-footer">
          <button
            className="factura-btn factura-btn-secondary"
            onClick={onBack || onClose}
          >
            Atrás
          </button>
          <button
            className="factura-btn factura-btn-primary"
            onClick={handleSave}
          >
            Guardar y Continuar
          </button>
        </div>
      </div>

      {/* Modal de validación */}
      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title="Error de Validación"
      >
        <div style={{ whiteSpace: 'pre-line' }}>
          {mensajeError}
        </div>
      </Modal>
    </div>
  );
};

export default FacturaTemplate;
