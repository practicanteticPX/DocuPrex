import { useState, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';
import { X, Plus, Info } from 'lucide-react';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Modal } from '../ui/modal';
import { useCuentasContables, useCentrosCostos, useNegociadores } from '../../hooks';
import { BACKEND_HOST, API_URL } from '../../config/api';
import axios from 'axios';
import './FacturaTemplate.css';

// Company logos
import LogoPX from '../../assets/Logo PX.png';
import LogoPT from '../../assets/Logo PT.png';
import LogoPY from '../../assets/Logo PY.png';
import LogoCL from '../../assets/Logo CL.png';

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

const formatDateForDisplay = (dateString) => {
  const normalizedDate = formatDate(dateString);
  if (!normalizedDate) return '';

  const [year, month, day] = normalizedDate.split('-');
  return `${day}/${month}/${year}`;
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
 * Map company code to logo
 * @param {string} ciaCode - Company code (PX, PT, PY, CL)
 * @returns {string|null} - Logo image path or null if not found
 */
const getCompanyLogo = (ciaCode) => {
  if (!ciaCode) return null;

  const ciaUpper = ciaCode.toUpperCase().trim();
  const logoMap = {
    'PX': LogoPX,
    'PT': LogoPT,
    'PY': LogoPY,
    'CL': LogoCL
  };

  return logoMap[ciaUpper] || null;
};

/**
 * FacturaTemplate - Plantilla de legalización de facturas
 *
 * Formulario completo para diligenciar información de factura
 * con campos automáticos desde T_Facturas y campos manuales
 *
 * @param {Object} factura - Datos de la factura desde T_Facturas
 * @param {Object} savedData - Datos previamente guardados de la plantilla (para edición)
 * @param {Boolean} isEditMode - Indica si estamos en modo edición
 * @param {Function} onClose - Callback al cerrar el modal
 * @param {Function} onBack - Callback al volver al paso anterior (buscar factura)
 * @param {Function} onSave - Callback al guardar los datos
 */
const FacturaTemplate = ({ factura, savedData, isEditMode, currentDocument, user, onClose, onBack, onSave }) => {
  const { cuentas, loading: loadingCuentas } = useCuentasContables();
  const { centros, loading: loadingCentros, validarResponsable } = useCentrosCostos();
  const { negociadores, loading: loadingNegociadores } = useNegociadores();

  // Estados para retenciones por centro de costo
  const [retenciones, setRetenciones] = useState({});
  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const [selectedCentroForRetention, setSelectedCentroForRetention] = useState(null);

  // Estados para roles dinámicos desde la BD
  const [fvRoles, setFvRoles] = useState(null);
  const [loadingRoles, setLoadingRoles] = useState(true);

  // Estados para grupos de causación dinámicos desde la BD
  const [causacionGrupos, setCausacionGrupos] = useState([]);
  const [loadingGrupos, setLoadingGrupos] = useState(true);

  // Estados para campos automáticos desde T_Facturas
  const [consecutivo, setConsecutivo] = useState('');
  const [cia, setCia] = useState('');
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

  // Estado para observaciones
  const [observaciones, setObservaciones] = useState('');

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

  const normalizarNombreFirmante = (nombre) => {
    if (!nombre) return '';
    return nombre.trim().toUpperCase().replace(/\s+/g, ' ');
  };

  const nombresCoinciden = (nombre1, nombre2) => {
    const n1 = normalizarNombreFirmante(nombre1);
    const n2 = normalizarNombreFirmante(nombre2);

    if (!n1 || !n2) return false;
    if (n1 === n2) return true;

    const words1 = n1.split(' ').filter(w => w.length > 2);
    const words2 = n2.split(' ').filter(w => w.length > 2);

    let matchCount = 0;
    words1.forEach(w1 => {
      if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
        matchCount++;
      }
    });

    return matchCount >= 2;
  };

  const signedSignatures = (currentDocument?.signatures || []).filter(sig => sig.status === 'signed');
  const signedNegociador = signedSignatures.some(sig => {
    const roles = Array.isArray(sig.roleNames) && sig.roleNames.length > 0 ? sig.roleNames : [sig.roleName];
    return roles.some(role => (role || '').toUpperCase().includes('NEGOCIADOR'));
  });
  const signedCausacion = signedSignatures.some(sig => {
    const roles = Array.isArray(sig.roleNames) && sig.roleNames.length > 0 ? sig.roleNames : [sig.roleName];
    return roles.some(role => (role || '').toUpperCase().includes('CAUSACION') || (role || '').toUpperCase().includes('CAUSACIÓN'));
  });

  const isFilaFirmada = (fila) => {
    return signedSignatures.some(sig => {
      const roles = Array.isArray(sig.roleNames) && sig.roleNames.length > 0 ? sig.roleNames : [sig.roleName];
      const signerName = sig.signer?.name || sig.realSignerName || '';

      const signedCuenta = roles.some(role => (role || '').toUpperCase().includes('CUENTA'))
        && nombresCoinciden(signerName, fila.respCuentaContable);
      const signedCentro = roles.some(role => (role || '').toUpperCase().includes('CENTRO'))
        && nombresCoinciden(signerName, fila.respCentroCostos);

      return signedCuenta || signedCentro;
    });
  };

  // Bloquear scroll del body cuando el componente está montado
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const html = document.documentElement;

    // Guardar estilos originales
    const originalBodyOverflow = body.style.overflow;
    const originalHtmlOverflow = html.style.overflow;

    // Bloquear scroll
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';

    return () => {
      // Restaurar estilos
      body.style.overflow = originalBodyOverflow;
      html.style.overflow = originalHtmlOverflow;
      body.style.position = '';
      body.style.top = '';
      body.style.width = '';

      // Restaurar posición de scroll
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Cargar roles dinámicamente desde la BD para tipo de documento FV
  useEffect(() => {
    const cargarRolesFV = async () => {
      try {
        const token = localStorage.getItem('token');

        // Primero obtener el tipo de documento FV
        const tiposResponse = await axios.post(
          API_URL,
          {
            query: `
              query {
                documentTypes {
                  id
                  code
                  name
                }
              }
            `
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const fvType = tiposResponse.data?.data?.documentTypes?.find(dt => dt.code === 'FV');

        if (!fvType) {
          throw new Error('No se encontró el tipo de documento FV');
        }

        console.log('🔍 FV Type encontrado:', fvType);
        console.log('🔍 ID del tipo FV:', fvType.id, 'tipo:', typeof fvType.id);

        // Luego obtener los roles para FV
        const rolesResponse = await axios.post(
          API_URL,
          {
            query: `
              query DocumentTypeRoles($documentTypeId: ID!) {
                documentTypeRoles(documentTypeId: $documentTypeId) {
                  id
                  roleName
                  roleCode
                  orderPosition
                }
              }
            `,
            variables: { documentTypeId: fvType.id }
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const roles = rolesResponse.data?.data?.documentTypeRoles || [];

        // Crear un mapa de roles por código para fácil acceso
        const rolesMap = {};
        roles.forEach(role => {
          rolesMap[role.roleCode] = role;
        });

        console.log('✅ Roles FV cargados desde BD:', rolesMap);
        setFvRoles(rolesMap);
        setLoadingRoles(false);
      } catch (error) {
        console.error('❌ Error cargando roles FV:', error);
        setLoadingRoles(false);
      }
    };

    cargarRolesFV();
  }, []);

  // Cargar grupos de causación dinámicamente desde la BD
  useEffect(() => {
    const cargarGruposCausacion = async () => {
      console.log('🔍 Iniciando carga de grupos de causación...');
      try {
        const token = localStorage.getItem('token');
        console.log('🔑 Token obtenido:', token ? 'Presente' : 'Ausente');

        const gruposResponse = await axios.post(
          API_URL,
          {
            query: `
              query {
                causacionGrupos {
                  id
                  codigo
                  nombre
                  descripcion
                  roleCode
                  activo
                }
              }
            `
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        console.log('📦 Respuesta completa de GraphQL:', gruposResponse.data);
        const grupos = gruposResponse.data?.data?.causacionGrupos || [];
        console.log('✅ Grupos de causación cargados desde BD:', grupos);
        console.log('📊 Cantidad de grupos:', grupos.length);
        setCausacionGrupos(grupos);
        setLoadingGrupos(false);
      } catch (error) {
        console.error('❌ Error cargando grupos de causación:', error);
        console.error('❌ Detalles del error:', error.response?.data || error.message);
        setLoadingGrupos(false);
      }
    };

    cargarGruposCausacion();
  }, []);

  // Cargar datos automáticos de la factura (solo una vez al montar y solo si NO estamos en modo edición)
  const facturaLoadedRef = useRef(false);

  useEffect(() => {
    if (factura && !facturaLoadedRef.current && !isEditMode) {
      console.log('📋 Datos de factura recibidos:', factura);
      console.log('📅 fecha_factura:', factura.fecha_factura);
      console.log('📅 fecha_entrega:', factura.fecha_entrega);
      console.log('🏢 cia:', factura.cia);

      setConsecutivo(factura.numero_control || '');
      setCia(factura.cia || '');
      setProveedor(factura.proveedor || '');
      setNumeroFactura(factura.numero_factura || '');

      const fechaFacturaFormateada = formatDate(factura.fecha_factura);
      const fechaRecepcionFormateada = formatDate(factura.fecha_entrega);

      console.log('✅ Fecha factura formateada:', fechaFacturaFormateada);
      console.log('✅ Fecha recepción formateada:', fechaRecepcionFormateada);

      setFechaFactura(fechaFacturaFormateada);
      setFechaRecepcion(fechaRecepcionFormateada);

      facturaLoadedRef.current = true;
    }
  }, [factura, isEditMode]);

  // Cargar datos previamente guardados si existen (para edición)
  useEffect(() => {
    if (savedData) {
      console.log('🔄 Cargando datos guardados de la plantilla:', savedData);

      // Restaurar campos automáticos de la factura
      if (savedData.consecutivo) setConsecutivo(savedData.consecutivo);
      if (savedData.cia) setCia(savedData.cia);
      if (savedData.proveedor) setProveedor(savedData.proveedor);
      if (savedData.numeroFactura) setNumeroFactura(savedData.numeroFactura);
      if (savedData.fechaFactura) setFechaFactura(savedData.fechaFactura);
      if (savedData.fechaRecepcion) setFechaRecepcion(savedData.fechaRecepcion);

      // Restaurar campos manuales
      if (savedData.legalizaAnticipo !== undefined) setLegalizaAnticipo(savedData.legalizaAnticipo);
      if (savedData.checklistRevision) setChecklistRevision(savedData.checklistRevision);
      if (savedData.nombreNegociador) setNombreNegociador(savedData.nombreNegociador);
      if (savedData.cargoNegociador) setCargoNegociador(savedData.cargoNegociador);
      if (savedData.grupoCausacion) setGrupoCausacion(savedData.grupoCausacion);
      if (savedData.observaciones) setObservaciones(savedData.observaciones);
      if (savedData.filasControl) setFilasControl(savedData.filasControl);

      console.log('✅ Datos de plantilla restaurados correctamente');
    }
  }, [savedData]);

  // Cargar retenciones activas del documento
  useEffect(() => {
    if (currentDocument && currentDocument.retentionData) {
      const retentionsMap = {};
      currentDocument.retentionData.forEach(retention => {
        retentionsMap[retention.centroCostoIndex] = {
          motivo: retention.motivo,
          porcentajeRetenido: retention.porcentajeRetenido,
          userId: retention.userId,
          userName: retention.userName,
          activa: retention.activa
        };
      });
      setRetenciones(retentionsMap);
    }
  }, [currentDocument]);

  const handleAddFila = () => {
    if (isEditMode && signedSignatures.length > 0) {
      return;
    }

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
    const fila = filasControl.find(f => f.id === id);
    if (fila && isFilaFirmada(fila)) {
      return;
    }

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
    const fila = filasControl.find(item => item.id === id);
    if (fila && isFilaFirmada(fila)) {
      return;
    }

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
    const fila = filasControl.find(item => item.id === currentFilaId);
    if (fila && isFilaFirmada(fila)) {
      return;
    }

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
    const fila = filasControl.find(item => item.id === currentFilaId);
    if (fila && isFilaFirmada(fila)) {
      return;
    }

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
    const fila = filasControl.find(item => item.id === id);
    if (fila && isFilaFirmada(fila)) {
      return;
    }

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
    const fila = filasControl.find(item => item.id === id);
    if (fila && isFilaFirmada(fila)) {
      return;
    }

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
    if (fila && isFilaFirmada(fila)) {
      return;
    }

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
    const fila = filasControl.find(item => item.id === id);
    if (fila && isFilaFirmada(fila)) {
      return;
    }

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
    const fila = filasControl.find(item => item.id === id);
    if (fila && isFilaFirmada(fila)) {
      return;
    }

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
    if (fila && isFilaFirmada(fila)) {
      return;
    }

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
      centro.codigo.toString().toUpperCase().includes(filtroUpper)
    );
  };

  const handleNegociadorChange = (nombre) => {
    if (isEditMode && signedNegociador) {
      return;
    }

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
    if (isEditMode && signedNegociador) {
      return;
    }

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
    if (isEditMode && signedNegociador) {
      return;
    }

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
    if (isEditMode && signedNegociador) {
      return;
    }

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

    const hayChecklistSinMarcar = Object.keys(checklistRevision).some(key => !checklistRevision[key]);
    if (hayChecklistSinMarcar) {
      errores.push('Debe marcar todos los checklist de Revisión');
    }

    if (!nombreNegociador.trim()) {
      errores.push('Debe seleccionar un negociador');
    }

    if (!grupoCausacion) {
      errores.push('Debe seleccionar un grupo de causación');
    }

    for (let i = 0; i < filasControl.length; i++) {
      const fila = filasControl[i];
      const numeroFila = i + 1;

      // VALIDACIÓN SIMPLIFICADA: Solo validar campos que el usuario debe seleccionar manualmente
      if (!fila.noCuentaContable.trim()) {
        errores.push(`Fila ${numeroFila}: Debe seleccionar una cuenta contable`);
      }

      if (!fila.centroCostos.trim()) {
        errores.push(`Fila ${numeroFila}: Debe seleccionar un centro de costos`);
      }

      if (!fila.porcentaje || fila.porcentaje.trim() === '') {
        errores.push(`Fila ${numeroFila}: Debe ingresar el porcentaje`);
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

  const handleSave = async () => {
    const errores = validarFormulario();

    if (errores.length > 0) {
      setMensajeError(errores.join('\n'));
      setModalAbierto(true);
      return;
    }

    if (!fvRoles || loadingRoles) {
      setMensajeError('Cargando roles... Por favor espere.');
      setModalAbierto(true);
      return;
    }

    try {
      const firmantes = [];
      const responsablesContablesMap = new Map();

      const agregarFirmante = (nombre, rol, cargo, email, extraData = {}) => {
        if (!nombre || !nombre.trim()) return;

        const nuevoFirmante = {
          name: nombre.trim(),
          role: rol,
          cargo: cargo || '',
          email: email || null,
          ...extraData
        };

        firmantes.push(nuevoFirmante);
        console.log(`Firmante agregado: ${nombre.trim()} - ${Array.isArray(rol) ? rol.join(', ') : rol}`);
      };

      const agregarResponsableContable = (nombre, rol, cargo, email) => {
        if (!nombre || !nombre.trim()) return;

        const nombreKey = nombre.trim().toUpperCase();

        if (responsablesContablesMap.has(nombreKey)) {
          const firmante = responsablesContablesMap.get(nombreKey);
          const rolesActuales = Array.isArray(firmante.role) ? firmante.role : [firmante.role];

          if (!rolesActuales.includes(rol)) {
            firmante.role = [...rolesActuales, rol];
            console.log(`Rol contable adicional agregado a ${nombre.trim()}: ${rol}`);
          }

          if (!firmante.cargo && cargo) {
            firmante.cargo = cargo;
          }

          if (!firmante.email && email) {
            firmante.email = email;
          }

          return;
        }

        responsablesContablesMap.set(nombreKey, {
          name: nombre.trim(),
          role: rol,
          cargo: cargo || '',
          email: email || null,
          signingStageKey: 'RESPONSABLES_CONTABLES'
        });
        console.log(`Responsable contable agregado: ${nombre.trim()} - ${rol}`);
      };
      // 1. Agregar Negociador
      console.log('📋 Agregando Negociador...');
      const roleNegociador = fvRoles['NEGOCIADOR']?.roleName || 'Negociador';
      agregarFirmante(nombreNegociador, roleNegociador, cargoNegociador, null, {
        signingStageKey: 'NEGOCIADOR'
      });

      // 2. Agregar NEGOCIACIONES (OBLIGATORIO)
      console.log('📋 Obteniendo usuario NEGOCIACIONES...');
      const negociacionesResponse = await fetch(`${BACKEND_HOST}/api/facturas/usuario-negociaciones`);
      const negociacionesData = await negociacionesResponse.json();

      if (!negociacionesResponse.ok || !negociacionesData.success || !negociacionesData.data) {
        throw new Error('No se pudo obtener el usuario NEGOCIACIONES. Este usuario es obligatorio para el flujo de facturas.');
      }

      console.log('✅ Usuario NEGOCIACIONES encontrado:', negociacionesData.data.nombre);
      const roleNegociaciones = fvRoles['RESPONSABLE_NEGOCIACIONES']?.roleName || 'Negociaciones';
      agregarFirmante(
        negociacionesData.data.nombre,
        roleNegociaciones,
        negociacionesData.data.cargo,
        negociacionesData.data.email,
        {
          signingStageKey: 'NEGOCIACIONES'
        }
      );

      // 3. Agregar Responsables de Cuentas Contables y Centros de Costos
      console.log('📋 Agregando Responsables de filas de control...');
      const roleRespCuentaCont = fvRoles['RESPONSABLE_CUENTA_CONTABLE']?.roleName || 'Resp Cta Cont';
      const roleRespCentroCost = fvRoles['RESPONSABLE_CENTRO_COSTOS']?.roleName || 'Resp Ctro Cost';

      filasControl.forEach((fila, index) => {
        console.log(`   Fila ${index + 1}:`);
        agregarResponsableContable(fila.respCentroCostos, roleRespCentroCost, fila.cargoCentroCostos);
        agregarResponsableContable(fila.respCuentaContable, roleRespCuentaCont, fila.cargoCuentaContable);
      });

      firmantes.push(...Array.from(responsablesContablesMap.values()));

      // 4. Agregar Grupo de Causación (UN SOLO firmante genérico)
      console.log(`📋 Obteniendo grupo de causación: ${grupoCausacion}...`);

      if (!grupoCausacion || grupoCausacion.trim() === '') {
        throw new Error('Debe seleccionar un grupo de causación antes de guardar la plantilla.');
      }

      const token = localStorage.getItem('token');
      const causacionResponse = await axios.post(
        API_URL,
        {
          query: `
            query CausacionGrupo($codigo: String!) {
              causacionGrupo(codigo: $codigo) {
                id
                codigo
                nombre
                descripcion
                activo
                roleCode
                miembros {
                  id
                  userId
                  cargo
                  activo
                  user {
                    id
                    name
                    email
                  }
                }
              }
            }
          `,
          variables: { codigo: grupoCausacion }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!causacionResponse.data?.data?.causacionGrupo || !causacionResponse.data.data.causacionGrupo.miembros || causacionResponse.data.data.causacionGrupo.miembros.length === 0) {
        throw new Error(`No se encontraron miembros del grupo de causación ${grupoCausacion}. Verifique que los usuarios existan en la tabla causacion_integrantes.`);
      }

      const grupoData = causacionResponse.data.data.causacionGrupo;
      console.log(`✅ Grupo de causación encontrado: ${grupoData.miembros.length} miembros`);

      // Convertir formato de miembros a formato esperado
      const miembrosFormateados = grupoData.miembros.map(m => ({
        nombre: m.user.name,
        cargo: m.cargo,
        email: m.user.email
      }));

      // Agregar UN SOLO firmante genérico para el grupo
      // La lista de miembros permitidos se guarda en metadata del documento
      // Usar el rol "Causación" genérico desde la BD (no los específicos de cada grupo)
      if (!fvRoles || !fvRoles['CAUSACION']) {
        console.error('❌ Rol CAUSACION no encontrado en fvRoles');
        console.error('fvRoles disponibles:', Object.keys(fvRoles || {}));
        throw new Error('El rol CAUSACION no existe en los roles de FV. Verifique la tabla document_type_roles.');
      }

      const roleCausacion = fvRoles['CAUSACION'].roleName;  // "Causación" desde BD

      firmantes.push({
        name: grupoData.nombre,  // Nombre del grupo: Financiera o Logística (sin corchetes)
        role: roleCausacion,  // Rol genérico: "Causación" (desde BD)
        cargo: 'Grupo de Causación',
        email: null,
        signingStageKey: 'CAUSACION',
        grupoCodigo: grupoCausacion,  // Código: 'financiera' o 'logistica'
        grupoMiembros: miembrosFormateados  // Lista de miembros permitidos
      });

      console.log(`✅ Total de firmantes generados: ${firmantes.length}`);
      console.log(`📋 Grupo ${grupoData.nombre}: ${grupoData.miembros.length} miembros permitidos`);
      console.log('📋 Lista de firmantes:', firmantes);

      // Calcular total porcentaje antes de guardar
      const totalPorcentaje = calcularTotalPorcentaje();
      console.log('📊 Total Porcentaje:', totalPorcentaje);

      console.log('🏢 CIA antes de guardar:', cia);
      console.log('📋 Consecutivo antes de guardar:', consecutivo);

      if (onSave) {
        onSave({
          consecutivo,
          cia,
          proveedor,
          numeroFactura,
          fechaFactura,
          fechaRecepcion,
          legalizaAnticipo,
          checklistRevision,
          nombreNegociador,
          cargoNegociador,
          grupoCausacion,
          observaciones,
          filasControl,
          totalPorcentaje,
          firmantes
        });
      }
    } catch (error) {
      console.error('❌ Error generando firmantes:', error);
      setMensajeError(error.message || 'Error al generar la lista de firmantes. Por favor intente nuevamente.');
      setModalAbierto(true);
    }
  };

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      e.stopPropagation();
    }
  };

  return (
    <>
      <div
        className="factura-template-overlay"
        onClick={handleOverlayClick}
      >
        <div className="factura-template-container">
          {/* Header */}
          <div className="factura-template-header">
            <div>
              <h1 className="factura-template-title">Planilla Control Factura</h1>
              <p className="factura-template-subtitle">Factura - {consecutivo}</p>
            </div>
            <button
              className="factura-template-close-btn"
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
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
                  type="text"
                  value={formatDateForDisplay(fechaFactura)}
                  disabled
                  className="factura-input-disabled"
                />
              </div>

              <div className="factura-field">
                <label className="factura-label">Fecha de Recepción</label>
                <Input
                  type="text"
                  value={formatDateForDisplay(fechaRecepcion)}
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
                    disabled={loadingNegociadores || (isEditMode && signedNegociador)}
                    title={nombreNegociador}
                  />
                  {dropdownNegociadoresAbierto && !loadingNegociadores && !(isEditMode && signedNegociador) && dropdownNegociadoresPosition.top && getNegociadoresFiltrados(inputNegociadorValue || '').length > 0 && (
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
                disabled={isEditMode && signedSignatures.length > 0}
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
                    {Object.keys(retenciones).length > 0 && (
                      <>
                        <th>%Ret</th>
                        <th>Motivo</th>
                      </>
                    )}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filasControl.map((fila, filaIndex) => {
                    const filaFirmada = isFilaFirmada(fila);

                    return (
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
                              onFocus={() => !filaFirmada && handleFocus(fila.id)}
                              placeholder={loadingCuentas ? "Cargando..." : "Buscar cuenta..."}
                              className="factura-table-input"
                              disabled={loadingCuentas || filaFirmada}
                              data-cuenta-id={fila.id}
                              onKeyDown={(e) => handleCuentaContableKeyDown(e, fila.id)}
                            />
                            {dropdownAbierto[fila.id] && !loadingCuentas && !filaFirmada && dropdownPositions[fila.id] && getFiltradas(inputValues[fila.id] || '').length > 0 && (
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
                              onFocus={() => !filaFirmada && handleCentrosFocus(fila.id)}
                              placeholder={loadingCentros ? "Cargando..." : "Buscar centro..."}
                              className="factura-table-input"
                              disabled={loadingCentros || filaFirmada}
                              data-centro-id={fila.id}
                              onKeyDown={(e) => handleCentroCostosKeyDown(e, fila.id)}
                            />
                            {dropdownCentrosAbierto[fila.id] && !loadingCentros && !filaFirmada && dropdownCentrosPositions[fila.id] && getCentrosFiltrados(inputCentrosValues[fila.id] || '').length > 0 && (
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
                            disabled={filaFirmada}
                            data-porcentaje-id={fila.id}
                            onKeyDown={(e) => handlePorcentajeKeyDown(e, fila.id)}
                          />
                        </td>
                        {Object.keys(retenciones).length > 0 && (
                          <>
                            <td>
                              {retenciones[filaIndex] ? (
                                <Input
                                  type="text"
                                  value={`${retenciones[filaIndex].porcentajeRetenido}%`}
                                  disabled
                                  className="factura-table-input factura-input-disabled"
                                />
                              ) : '-'}
                            </td>
                            <td>
                              {retenciones[filaIndex] ? (
                                <Input
                                  type="text"
                                  value={retenciones[filaIndex].motivo}
                                  disabled
                                  className="factura-table-input factura-input-disabled"
                                  title={retenciones[filaIndex].motivo}
                                />
                              ) : '-'}
                            </td>
                          </>
                        )}
                        <td>
                          {filasControl.length > 1 && (
                            <button
                              className="factura-remove-row-btn"
                              onClick={() => handleRemoveFila(fila.id)}
                              title="Eliminar fila"
                              disabled={filaFirmada}
                            >
                              <X size={16} />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
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
                    {Object.keys(retenciones).length > 0 && (
                      <>
                        <td></td>
                        <td></td>
                      </>
                    )}
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

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {loadingGrupos ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#666', gridColumn: '1 / -1' }}>
                  Cargando grupos de causación...
                </div>
              ) : causacionGrupos.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: '#ff6b6b', gridColumn: '1 / -1' }}>
                  No se encontraron grupos de causación. Verifique la configuración.
                </div>
              ) : (
                causacionGrupos.map(grupo => (
                  <div
                    key={grupo.codigo}
                    className="factura-checklist-item"
                    onClick={() => {
                      if (!(isEditMode && signedCausacion)) {
                        setGrupoCausacion(grupo.codigo);
                      }
                    }}
                    style={{
                      opacity: isEditMode && signedCausacion ? 0.65 : 1,
                      cursor: isEditMode && signedCausacion ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <div className="factura-checklist-label">
                      <Checkbox
                        checked={grupoCausacion === grupo.codigo}
                        disabled={isEditMode && signedCausacion}
                        onCheckedChange={() => {}}
                      />
                      <span className="factura-checklist-text">{grupo.nombre}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Sección: Observaciones (separada) */}
          <div className="factura-section">
            <h2 className="factura-section-title">Observaciones</h2>
            <div className="factura-field">
              <textarea
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Observaciones adicionales (opcional)"
                rows="3"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  fontFamily: 'Google Sans, sans-serif',
                  color: '#374151',
                  background: '#FFFFFF',
                  border: '1px solid #D1D5DB',
                  borderRadius: '8px',
                  resize: 'vertical',
                  minHeight: '80px',
                  maxHeight: '200px',
                  outline: 'none',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box'
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = '#9CA3AF';
                  e.target.style.background = '#F9FAFB';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#D1D5DB';
                  e.target.style.background = '#FFFFFF';
                }}
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="factura-template-footer">
          <button
            className="factura-btn factura-btn-secondary"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onBack) {
                onBack();
              } else {
                onClose();
              }
            }}
          >
            Atrás
          </button>
          <button
            className="factura-btn factura-btn-primary"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSave();
            }}
          >
            Guardar y Continuar
          </button>
        </div>
        </div>
      </div>

      {/* Modal de validación fuera del overlay */}
      {modalAbierto && (
        <div className="modal-overlay" onClick={() => setModalAbierto(false)}>
          <div className="modal-content-validation" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon-container-warning">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="modal-validation-title">Completa todos los campos para continuar</h3>
            <p className="modal-validation-message">{mensajeError}</p>
            <div className="modal-actions-single">
              <button
                className="btn-modal-validation-ok"
                onClick={() => setModalAbierto(false)}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FacturaTemplate;

