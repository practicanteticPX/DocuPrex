import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import './Dashboard.css';
import './Dashboard.overrides.css';
import './Rejected.css';
import './SignersOrder.css';
import './WaitingTurn.css';
import Notifications from './Notifications';
import DocumentTypeSelector from './DocumentTypeSelector';
import FacturaSearch from './FacturaSearch';
import DocumentCreationLoader from '../DocumentCreationLoader/DocumentCreationLoader';
import PyramidLoader from '../PyramidLoader/PyramidLoader';
import Loader from '../Loader/Loader';
import LogoutButton from '../LogoutButton/LogoutButton';
import HelpModal from '../HelpModal/HelpModal';
import RealSignerModal from './RealSignerModal';
import CountUp from '../CountUp';
import { Download, Close, Settings } from '../ui/animated-icons';
import clockImage from '../../assets/clock.png';
import estebanPhoto from '../../assets/esteban.JPG';
import jesusPhoto from '../../assets/jesus.JPG';
import BalatroBackground from '../ui/backgrounds/BalatroBackground';
import {
  API_URL,
  API_UPLOAD_URL,
  API_UPLOAD_MULTI_URL,
  API_UPLOAD_UNIFIED_URL,
  BACKEND_HOST,
  getDocumentUrl,
  getDownloadUrl,
  getViewUrl
} from '../../config/api';

// Log para debug
console.log('🔗 Dashboard - Backend URL:', API_URL);

/**
 * Helper function para manejar errores de autenticación en GraphQL
 * Retorna true si es un error de autenticación que debe ser silenciado
 */
const isAuthError = (error) => {
  if (!error) return false;
  const message = error.message || '';
  return message.includes('autenticado') || message.includes('authenticated') || message.includes('No autenticado');
};

function Dashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('upload');
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentDescription, setDocumentDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [showCreationLoader, setShowCreationLoader] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  // Estados para datos reales
  const [pendingDocuments, setPendingDocuments] = useState([]);
  const [signedDocuments, setSignedDocuments] = useState([]);
  const [myDocuments, setMyDocuments] = useState([]);
  const [rejectedByMe, setRejectedByMe] = useState([]);
  const [rejectedByOthers, setRejectedByOthers] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingSigned, setLoadingSigned] = useState(false);
  const [loadingMy, setLoadingMy] = useState(false);
  const [loadingRejected, setLoadingRejected] = useState(false);
  const [viewingDocument, setViewingDocument] = useState(null);
  const [isViewingPending, setIsViewingPending] = useState(false);
  const [isWaitingTurn, setIsWaitingTurn] = useState(false);
  const [isDownloadBtnHovered, setIsDownloadBtnHovered] = useState(false);
  const [isCloseBtnHovered, setIsCloseBtnHovered] = useState(false);
  const [isSettingsBtnHovered, setIsSettingsBtnHovered] = useState(false);
  const [documentLoadedFromUrl, setDocumentLoadedFromUrl] = useState(false);
  // Establecer isCheckingDocumentFromUrl en true si hay un documento en la URL desde el inicio
  const [isCheckingDocumentFromUrl, setIsCheckingDocumentFromUrl] = useState(() => {
    const path = window.location.pathname;
    const savedPath = sessionStorage.getItem('redirectAfterLogin');
    const checkPath = savedPath || path;
    return /\/documento\/[a-zA-Z0-9\-]+/.test(checkPath);
  });
  const [showWaitingTurnScreen, setShowWaitingTurnScreen] = useState(false);
  const [showSignConfirm, setShowSignConfirm] = useState(false);
  const [showRejectConfirm, setShowRejectConfirm] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [consecutivo, setConsecutivo] = useState(''); // Campo guardado para Legalización de Facturas
  const [tempConsecutivo, setTempConsecutivo] = useState(''); // Campo temporal mientras edita
  const [showConsecutivoModal, setShowConsecutivoModal] = useState(false); // Modal para agregar consecutivo
  const [showDescription, setShowDescription] = useState(false);
  const [showRejectSuccess, setShowRejectSuccess] = useState(false);
  const [showSignSuccess, setShowSignSuccess] = useState(false);
  const [showOrderError, setShowOrderError] = useState(false);
  const [orderErrorMessage, setOrderErrorMessage] = useState('');
  const [signing, setSigning] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  // Estado para modal de notificación elegante
  const [showNotification, setShowNotification] = useState(false);
  const [notificationData, setNotificationData] = useState({ title: '', message: '', type: 'info' });

  // Estado para modal de ayuda
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Estados para confirmación de firma rápida (desde la tarjeta)
  const [showQuickSignConfirm, setShowQuickSignConfirm] = useState(false);
  const [documentToSign, setDocumentToSign] = useState(null);

  // Estados para firmantes
  const [availableSigners, setAvailableSigners] = useState([]);
  const [selectedSigners, setSelectedSigners] = useState([]);
  const [loadingSigners, setLoadingSigners] = useState(false);

  // Estados para tipos de documentos y roles
  const [documentTypes, setDocumentTypes] = useState([]);
  const [selectedDocumentType, setSelectedDocumentType] = useState(null);
  const [documentTypeRoles, setDocumentTypeRoles] = useState([]);
  const [loadingDocumentTypes, setLoadingDocumentTypes] = useState(false);

  // Estados para dropdown de roles
  const [openRoleDropdown, setOpenRoleDropdown] = useState(null); // ID del firmante con dropdown abierto
  const [roleDropdownPosition, setRoleDropdownPosition] = useState({ top: 0, left: 0 });

  // Estados para búsqueda de firmantes
  const [searchTermUpload, setSearchTermUpload] = useState('');
  const [searchTermModal, setSearchTermModal] = useState('');

  // Estado para checkbox "Yo voy a firmar este documento"
  const [willSignDocument, setWillSignDocument] = useState(false);

  // Estados para filtros de "Documentos pendientes"
  const [pendingDocsSearchTerm, setPendingDocsSearchTerm] = useState('');

  // Estados para filtros de "Mis documentos"
  const [myDocsSearchTerm, setMyDocsSearchTerm] = useState('');
  const [myDocsStatusFilter, setMyDocsStatusFilter] = useState('all'); // all, completed, rejected, pending

  // Estados para filtros de "Documentos firmados"
  const [signedDocsSearchTerm, setSignedDocsSearchTerm] = useState('');
  const [signedDocsStatusFilter, setSignedDocsStatusFilter] = useState('all'); // all, completed, rejected, pending

  // Estados para filtros de "Documentos rechazados"
  const [rejectedDocsSearchTerm, setRejectedDocsSearchTerm] = useState('');

  // Estados para filtros de tipo de documento
  const [pendingDocsTypeFilter, setPendingDocsTypeFilter] = useState([]); // ['SA', 'FV', 'NONE']
  const [myDocsTypeFilter, setMyDocsTypeFilter] = useState([]); // ['SA', 'FV', 'NONE']
  const [signedDocsTypeFilter, setSignedDocsTypeFilter] = useState([]); // ['SA', 'FV', 'NONE']
  const [rejectedDocsTypeFilter, setRejectedDocsTypeFilter] = useState([]); // ['SA', 'FV', 'NONE']
  const [showTypeFilterDropdown, setShowTypeFilterDropdown] = useState(null); // 'pending', 'my', 'signed', 'rejected'

  // Estados para modal de selección de firmante real (usuario Negociaciones)
  const [showRealSignerModal, setShowRealSignerModal] = useState(false);
  const [realSignerAction, setRealSignerAction] = useState('firmar'); // 'firmar' o 'rechazar'
  const [realSignerName, setRealSignerName] = useState('');
  const [pendingDocumentAction, setPendingDocumentAction] = useState(null); // Guarda la acción pendiente

  // Estados para configuración
  const [showSettings, setShowSettings] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [rejectedDocsFilter, setRejectedDocsFilter] = useState('all');
  const [selectedDeveloper, setSelectedDeveloper] = useState(null);
  const developerIndexRef = useRef(0);
  const avatarRef = useRef(null);
  const nameRef = useRef(null);
  const roleRef = useRef(null);
  const containerRef = useRef(null);

  const developers = [
    { name: 'Esteban Zuluaga', role: 'Analista de Datos', photo: estebanPhoto },
    { name: 'Jesús Bustamante', role: 'Practicante TIC', photo: jesusPhoto }
  ];

  const switchDeveloper = () => {
    if (!containerRef.current || !avatarRef.current || !nameRef.current || !roleRef.current) return;

    const container = containerRef.current;
    const avatar = avatarRef.current;
    const name = nameRef.current;
    const role = roleRef.current;

    container.style.opacity = '0';
    container.style.transform = 'translateX(-40px)';

    setTimeout(() => {
      developerIndexRef.current = (developerIndexRef.current + 1) % 2;
      const newDev = developers[developerIndexRef.current];

      avatar.src = newDev.photo;
      name.textContent = newDev.name;
      role.textContent = newDev.role;

      container.style.transform = 'translateX(40px)';

      setTimeout(() => {
        container.style.opacity = '1';
        container.style.transform = 'translateX(0)';
      }, 50);
    }, 400);
  };

  // Bloquear scroll cuando el modal de desarrollador esté abierto
  useEffect(() => {
    if (selectedDeveloper) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100vh';
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    };
  }, [selectedDeveloper]);

  // Actualizar emailNotifications cuando el user cambie
  useEffect(() => {
    if (user?.emailNotifications !== undefined) {
      setEmailNotifications(user.emailNotifications);
    }
  }, [user]);

  // Limpiar título y descripción cuando cambie el tipo de documento
  useEffect(() => {
    setDocumentTitle('');
    setDocumentDescription('');
  }, [selectedDocumentType]);

  // Limpiar título y descripción cuando se cambie de tab
  useEffect(() => {
    if (activeTab !== 'upload') {
      setDocumentTitle('');
      setDocumentDescription('');
    }
  }, [activeTab]);

  // Bloquear scroll cuando la pantalla de "Aún no es tu turno" esté activa
  useEffect(() => {
    if (showWaitingTurnScreen) {
      // Guardar el scroll actual
      const scrollY = window.scrollY;
      // Bloquear scroll
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
    } else {
      // Restaurar scroll
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      // Restaurar posición del scroll
      if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
      }
    }

    // Cleanup al desmontar
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, [showWaitingTurnScreen]);

  // Cerrar dropdowns de roles al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      const dropdowns = document.querySelectorAll('.role-dropdown-menu');
      dropdowns.forEach(dropdown => {
        const button = dropdown.previousElementSibling;
        if (dropdown && !dropdown.contains(event.target) && button && !button.contains(event.target)) {
          dropdown.style.display = 'none';
        }
      });
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, []);

  // Cerrar dropdown de filtro de tipo al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      const dropdowns = document.querySelectorAll('.type-filter-dropdown');
      const buttons = document.querySelectorAll('.filter-type-btn');

      let clickedInsideDropdownOrButton = false;

      dropdowns.forEach(dropdown => {
        if (dropdown.contains(event.target)) {
          clickedInsideDropdownOrButton = true;
        }
      });

      buttons.forEach(button => {
        if (button.contains(event.target)) {
          clickedInsideDropdownOrButton = true;
        }
      });

      if (!clickedInsideDropdownOrButton && showTypeFilterDropdown) {
        setShowTypeFilterDropdown(null);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showTypeFilterDropdown]);

  // Cerrar dropdown de roles al hacer scroll
  useEffect(() => {
    const handleScroll = () => {
      if (openRoleDropdown !== null) {
        setOpenRoleDropdown(null);
      }
    };

    // Escuchar scroll en la ventana y en todos los contenedores scrollables
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [openRoleDropdown]);

  // Estados para modal de gestión de firmantes
  const [managingDocument, setManagingDocument] = useState(null);
  const [documentSigners, setDocumentSigners] = useState([]);
  const [loadingDocumentSigners, setLoadingDocumentSigners] = useState(false);
  const [modalSelectedSigners, setModalSelectedSigners] = useState([]);
  const [searchNewSigner, setSearchNewSigner] = useState('');
  // Estado para confirmación de eliminación
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteDocId, setDeleteDocId] = useState(null);
  const [deleteDocTitle, setDeleteDocTitle] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Estados para lista de archivos mejorada
  const [unifyPDFs, setUnifyPDFs] = useState(true);
  const [draggedIndex, setDraggedIndex] = useState(null);

  // Estado para drag and drop de firmantes
  const [draggedSignerIndex, setDraggedSignerIndex] = useState(null);
  const [dragOverSignerIndex, setDragOverSignerIndex] = useState(null);

  // Estado para controlar "ver más" en firmantes de Mis Documentos
  const [expandedSigners, setExpandedSigners] = useState({});

  // Estado para popup de razón de rechazo
  const [rejectionReasonPopup, setRejectionReasonPopup] = useState(null);

  // Estado para confirmación de eliminación de firmante
  const [confirmRemoveSignerModal, setConfirmRemoveSignerModal] = useState(null);
  const [removingSignerLoading, setRemovingSignerLoading] = useState(false);
  const [addingSignerId, setAddingSignerId] = useState(null);
  const [errorModalData, setErrorModalData] = useState(null);

  // Estados para selección de roles al agregar firmante (FV)
  const [pendingSignerForRoles, setPendingSignerForRoles] = useState(null); // { userId, name, email }
  const [selectedRolesForNewSigner, setSelectedRolesForNewSigner] = useState([]); // Array de { roleId, roleName }

  // Estado para popup de error de roles (máximo 3 roles)
  const [roleErrorPopup, setRoleErrorPopup] = useState(null); // { message: string }

  // Estado para modal de posición inválida
  const [invalidPositionModal, setInvalidPositionModal] = useState(false);

  // Estados para Stepper funcional de MUI (3 pasos)
  const steps = ['Cargar documentos', 'Añadir firmantes', 'Enviar'];
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState({});

  // Funciones del Stepper
  const totalSteps = () => steps.length;
  const completedSteps = () => Object.keys(completed).length;
  const isLastStep = () => activeStep === totalSteps() - 1;
  const allStepsCompleted = () => completedSteps() === totalSteps();

  /**
   * Advances to the next step in the multi-step document upload form
   *
   * Triggered when user clicks "Next" button in the upload stepper. Validates step-specific
   * requirements before advancing, with special validation for FV (Factura de Venta) documents
   * which require role assignment for all signers.
   *
   * @returns {void}
   *
   * Business rules:
   * - Step 0 -> Step 1: Requires files selected and document title entered
   * - Step 1 -> Step 2: Requires at least one signer selected
   * - For FV documents at step 1: All signers MUST have at least one role assigned
   * - Advances to next incomplete step or next sequential step
   *
   * Side effects:
   * - Shows error message if FV role validation fails
   * - Clears any existing error messages
   * - Updates activeStep state to advance the stepper
   */
  const handleNext = () => {
    // Validar roles para FV cuando se sale del paso 1 (Añadir firmantes)
    if (activeStep === 1 && selectedDocumentType && selectedDocumentType.code === 'FV') {
      const signersWithoutRoles = selectedSigners.filter(s => {
        if (typeof s === 'object') {
          const hasRoles = s.roleIds && s.roleIds.length > 0;
          return !hasRoles;
        }
        return true; // Si es solo ID, no tiene roles
      });

      if (signersWithoutRoles.length > 0) {
        const errorMsg = 'Para Legalización de Facturas, todos los firmantes deben tener al menos 1 rol asignado';
        setError(errorMsg);
        return; // Bloquear el avance
      }
    }

    // Validar roles para SA cuando se sale del paso 1 (Añadir firmantes)
    if (activeStep === 1 && selectedDocumentType && selectedDocumentType.code === 'SA') {
      const signersWithoutRoles = selectedSigners.filter(s => {
        if (typeof s === 'object') {
          const hasRole = s.roleId && s.roleId !== null;
          return !hasRole;
        }
        return true; // Si es solo ID, no tiene roles
      });

      if (signersWithoutRoles.length > 0) {
        const errorMsg = 'Para Solicitud de Anticipos, todos los firmantes deben tener al menos 1 rol asignado';
        setError(errorMsg);
        return; // Bloquear el avance
      }
    }

    // Validar roles para documentos sin tipo específico cuando se sale del paso 1 (Añadir firmantes)
    if (activeStep === 1 && selectedDocumentType === null && documentTypeRoles && documentTypeRoles.length > 0) {
      const signersWithoutRoles = selectedSigners.filter(s => {
        if (typeof s === 'object') {
          const hasRole = s.roleId && s.roleId !== null;
          return !hasRole;
        }
        return true; // Si es solo ID, no tiene roles
      });

      if (signersWithoutRoles.length > 0) {
        const errorMsg = 'Todos los firmantes deben tener al menos 1 rol asignado';
        setError(errorMsg);
        showNotif('Error de validación', errorMsg, 'error');
        return; // Bloquear el avance
      }
    }

    // Limpiar error si todo está bien
    setError('');

    const newActiveStep =
      isLastStep() && !allStepsCompleted()
        ? steps.findIndex((step, i) => !(i in completed))
        : activeStep + 1;
    setActiveStep(newActiveStep);
  };

  const handleBack = () => {
    setError(''); // Limpiar error al retroceder
    setActiveStep((prevActiveStep) => prevActiveStep - 1);
  };

  const handleStepClick = (step) => () => {
    setActiveStep(step);
  };

  const handleComplete = () => {
    setCompleted({
      ...completed,
      [activeStep]: true,
    });
    handleNext();
  };

  // Función helper para mostrar notificaciones elegantes
  const showNotif = (title, message, type = 'info') => {
    setNotificationData({ title, message, type });
    setShowNotification(true);
  };

  const handleReset = () => {
    setActiveStep(0);
    setCompleted({});
    setSelectedFiles([]);
    setSelectedSigners([]);
    setDocumentTitle('');
    setDocumentDescription('');
    setUploadSuccess(false);
    setError('');
  };

  // Validar si el paso actual está completo para poder avanzar
  const canProceedToNextStep = () => {
    switch (activeStep) {
      case 0: // Cargar documentos
        return selectedFiles && selectedFiles.length > 0 && documentTitle.trim().length > 0;
      case 1: // Añadir firmantes
        return selectedSigners && selectedSigners.length > 0;
      case 2: // Enviar
        return true;
      default:
        return false;
    }
  };

  /**
   * Abrir el visor de PDF con el documento seleccionado
   */
  const handleViewDocument = (doc, isPending = false, isWaiting = false) => {
    setViewingDocument(doc);
    setIsViewingPending(isPending);
    setIsWaitingTurn(isWaiting);
  };

  /**
   * Cargar un documento específico desde la URL
   */
  const loadDocumentFromUrl = async (documentId) => {
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query GetDocumentForUrl($documentId: ID!) {
              document(id: $documentId) {
                id
                title
                description
                fileName
                filePath
                fileSize
                status
                createdAt
                uploadedBy {
                  id
                  name
                  email
                }
                totalSigners
                signedCount
                pendingCount
                signatures {
                  id
                  signer {
                    id
                    name
                    email
                  }
                  status
                  signedAt
                  rejectionReason
                  rejectedAt
                  realSignerName
                }
              }
              documentSigners(documentId: $documentId) {
                userId
                orderPosition
                user {
                  id
                  name
                  email
                }
                signature {
                  id
                  status
                  signedAt
                  rejectedAt
                }
              }
            }
          `,
          variables: {
            documentId: documentId
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.data && response.data.data.document) {
        const doc = response.data.data.document;
        const signers = response.data.data.documentSigners || [];

        // Verificar que el usuario esté cargado
        if (!user || !user.id) {
          console.error('❌ Usuario no está autenticado');
          setError('Debes iniciar sesión para ver este documento');
          return;
        }

        // Buscar la información del firmante actual
        const currentUserSigner = signers.find(s => s.userId === user.id);

        // Determinar el estado del documento respecto al usuario
        let documentState = 'viewer'; // Por defecto, solo visor
        let canSignOrReject = false;

        if (currentUserSigner && currentUserSigner.signature) {
          const sigStatus = currentUserSigner.signature.status;

          if (sigStatus === 'pending') {
            // Verificar si es el turno del usuario
            // El usuario puede firmar si todos los anteriores ya firmaron
            const previousSigners = signers.filter(
              s => s.orderPosition < currentUserSigner.orderPosition
            );

            const allPreviousSigned = previousSigners.every(
              s => s.signature && s.signature.status === 'signed'
            );

            if (allPreviousSigned) {
              documentState = 'pending';
              canSignOrReject = true;
            } else {
              documentState = 'waiting'; // Esperando turno
              canSignOrReject = false;
            }
          } else if (sigStatus === 'signed') {
            documentState = 'signed';
            canSignOrReject = false;
          } else if (sigStatus === 'rejected') {
            documentState = 'rejected';
            canSignOrReject = false;
          }
        }

        console.log(`📄 Estado del documento para ${user.name}: ${documentState}`);
        console.log(`   - Usuario: ${user.name} (${user.id})`);
        console.log(`   - Documento: ${doc.title} (${doc.id})`);
        console.log(`   - Posición de firma: ${currentUserSigner ? currentUserSigner.orderPosition : 'N/A'}`);
        console.log(`   - Estado de firma: ${currentUserSigner?.signature?.status || 'Sin firma asignada'}`);
        console.log(`   - Puede firmar/rechazar: ${canSignOrReject ? 'SÍ' : 'NO'}`);
        console.log(`   - Firmantes anteriores:`, signers.filter(s => s.orderPosition < (currentUserSigner?.orderPosition || 0)).map(s => ({ name: s.user.name, status: s.signature?.status })));

        // Si el documento se abrió desde URL y el usuario está esperando su turno,
        // mostrar la pantalla de "Aún no es tu turno"
        if (documentState === 'waiting') {
          console.log('⏸️ MOSTRANDO PANTALLA DE ESPERA - No es el turno del usuario');
          console.log('⏸️ setShowWaitingTurnScreen(true)');
          setShowWaitingTurnScreen(true);
          setIsCheckingDocumentFromUrl(false);
          setActiveTab('pending'); // Asegurar que esté en pending
          // NO limpiar la URL aquí - se limpiará cuando el usuario cierre el modal
        } else {
          // Abrir el documento con el estado determinado
          console.log('✅ Abriendo documento desde URL con estado:', documentState);
          handleViewDocument(doc, canSignOrReject);
          setIsCheckingDocumentFromUrl(false);
          // Limpiar la URL después de abrir el documento
          setTimeout(() => {
            window.history.replaceState({}, '', '/');
          }, 100);
        }
      } else {
        console.error('❌ Documento no encontrado');
        setError('El documento solicitado no existe o no tienes acceso a él');
        setIsCheckingDocumentFromUrl(false);
      }
    } catch (error) {
      console.error('❌ Error al cargar documento desde URL:', error);
      setError('Error al cargar el documento');
      setIsCheckingDocumentFromUrl(false);
    }
  };

  // Cambiar el título de la página cuando se abre el visor de PDF
  useEffect(() => {
    if (viewingDocument) {
      const desiredTitle = viewingDocument.title || 'Visor de Documentos';
      document.title = desiredTitle;

      // Forzar el título cada segundo para evitar que el PDF interno lo sobrescriba
      const intervalId = setInterval(() => {
        if (document.title !== desiredTitle) {
          document.title = desiredTitle;
        }
      }, 100);

      return () => clearInterval(intervalId);
    } else {
      document.title = 'DocuPrex';
    }
  }, [viewingDocument]);

  // Bloquear scroll del body cuando hay un modal abierto
  useEffect(() => {
    const hasModalOpen = viewingDocument ||
                        showSignConfirm ||
                        showRejectConfirm ||
                        showRejectSuccess ||
                        showSignSuccess ||
                        showOrderError ||
                        showQuickSignConfirm ||
                        managingDocument ||
                        confirmDeleteOpen ||
                        rejectionReasonPopup ||
                        roleErrorPopup ||
                        showConsecutivoModal ||
                        showWaitingTurnScreen;

    if (hasModalOpen) {
      // Bloquear scroll simplemente con overflow hidden
      document.body.style.overflow = 'hidden';
    } else {
      // Restaurar scroll
      document.body.style.overflow = '';
    }

    // Cleanup al desmontar
    return () => {
      document.body.style.overflow = '';
    };
  }, [viewingDocument, showSignConfirm, showRejectConfirm, showRejectSuccess, showSignSuccess, showOrderError, showQuickSignConfirm, managingDocument, confirmDeleteOpen, rejectionReasonPopup]);

  // Cargar documentos pendientes al montar o cambiar de tab
  useEffect(() => {
    if (activeTab === 'pending') {
      loadPendingDocuments();
    }
  }, [activeTab]);

  // Cargar mis documentos al montar o cambiar de tab
  useEffect(() => {
    if (activeTab === 'my-documents') {
      loadMyDocuments();
    }
  }, [activeTab]);

  // Cargar documentos firmados al montar o cambiar de tab
  useEffect(() => {
    if (activeTab === 'signed') {
      loadSignedDocuments();
    }
  }, [activeTab]);

  // Cargar firmantes disponibles y tipos de documentos al montar o cambiar a tab upload
  useEffect(() => {
    if (activeTab === 'upload') {
      loadAvailableSigners();
      loadDocumentTypes();
    }
  }, [activeTab]);

  // Sincronizar estado del checkbox con la presencia del usuario en selectedSigners
  useEffect(() => {
    if (!user || !user.id) return;

    const userIsInSigners = selectedSigners.some(s =>
      (typeof s === 'object' ? s.userId : s) === user.id
    );

    setWillSignDocument(userIsInSigners);
  }, [selectedSigners, user]);

  // Auto-limpiar errores cuando se cumplen los requisitos
  useEffect(() => {
    if (!error) return; // Si no hay error, no hacer nada

    // Limpiar error de "adjunta al menos un archivo" cuando se adjuntan archivos
    if (error.includes('adjunta al menos un archivo')) {
      if (selectedFiles && selectedFiles.length > 0) {
        setError('');
      }
    }

    // Limpiar error de "selecciona al menos un firmante" cuando hay firmantes
    if (error.includes('selecciona al menos un firmante')) {
      if (selectedSigners && selectedSigners.length > 0) {
        setError('');
      }
    }

    // Limpiar error de roles FV cuando todos los firmantes tienen roles
    if (error.includes('todos los firmantes deben tener al menos 1 rol')) {
      if (selectedDocumentType && selectedDocumentType.code === 'FV') {
        const signersWithoutRoles = selectedSigners.filter(s => {
          if (typeof s === 'object') {
            const hasRoles = s.roleIds && s.roleIds.length > 0;
            return !hasRoles;
          }
          return true;
        });

        if (signersWithoutRoles.length === 0) {
          setError('');
        }
      }

      // Limpiar error de roles SA cuando todos los firmantes tienen roles
      if (selectedDocumentType && selectedDocumentType.code === 'SA') {
        const signersWithoutRoles = selectedSigners.filter(s => {
          if (typeof s === 'object') {
            const hasRole = s.roleId && s.roleId !== null;
            return !hasRole;
          }
          return true;
        });

        if (signersWithoutRoles.length === 0) {
          setError('');
        }
      }

      // Limpiar error de roles para documentos sin tipo específico cuando todos los firmantes tienen roles
      if (selectedDocumentType === null && documentTypeRoles && documentTypeRoles.length > 0) {
        const signersWithoutRoles = selectedSigners.filter(s => {
          if (typeof s === 'object') {
            const hasRole = s.roleId && s.roleId !== null;
            return !hasRole;
          }
          return true;
        });

        if (signersWithoutRoles.length === 0) {
          setError('');
        }
      }
    }
  }, [error, selectedFiles, documentTitle, selectedSigners, selectedDocumentType, documentTypeRoles]);

  // Cargar documentos rechazados al montar o cambiar de tab
  useEffect(() => {
    if (activeTab === 'rejected') {
      loadRejectedDocuments();
    }
  }, [activeTab]);

  // Detectar si hay un documento en la URL al cargar (formato: /documento/{id})
  useEffect(() => {
    // Esperar a que el usuario esté cargado antes de intentar cargar el documento
    if (!user) {
      console.log('⏳ Esperando a que el usuario se cargue...');
      return;
    }

    const checkAndLoadDocument = (path) => {
      // Evitar cargas duplicadas
      if (documentLoadedFromUrl) {
        return;
      }

      // Capturar UUID o cualquier ID (alfanumérico con guiones)
      const match = path.match(/\/documento\/([a-zA-Z0-9\-]+)/);

      if (match && match[1]) {
        const documentId = match[1];
        console.log(`📄 Documento detectado en URL: ${documentId}`);
        console.log(`👤 Usuario cargado: ${user.name} (${user.id})`);

        // Marcar que ya se cargó un documento para evitar duplicados
        setDocumentLoadedFromUrl(true);

        // Cargar el documento específico desde el backend
        loadDocumentFromUrl(documentId);

        // NO limpiar la URL aquí - se limpiará después de abrir el documento o modal
      }
    };

    // 1. Verificar si hay una URL guardada después del login
    const savedPath = sessionStorage.getItem('redirectAfterLogin');
    if (savedPath) {
      console.log('🔓 Restaurando URL guardada después del login:', savedPath);
      sessionStorage.removeItem('redirectAfterLogin');
      checkAndLoadDocument(savedPath);
    } else {
      // 2. Verificar la URL actual al montar
      const currentPath = window.location.pathname;
      checkAndLoadDocument(currentPath);
    }

    // 3. Escuchar cambios en la URL (para cuando el usuario hace clic en enlaces)
    const handlePopState = () => {
      // Resetear la bandera cuando el usuario navega manualmente
      setDocumentLoadedFromUrl(false);
      checkAndLoadDocument(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);

    // 4. Polling para detectar cambios en pathname (método de respaldo)
    const intervalId = setInterval(() => {
      const path = window.location.pathname;
      if (path.includes('/documento/') && !documentLoadedFromUrl) {
        checkAndLoadDocument(path);
      }
    }, 500);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      clearInterval(intervalId);
    };
  }, [user, documentLoadedFromUrl]); // Ejecutar cuando el usuario o la bandera cambien

  /**
   * Cargar documentos pendientes de firma desde GraphQL
   */
  const loadPendingDocuments = async () => {
    setLoadingPending(true);
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              pendingDocuments {
                id
                title
                description
                filePath
                uploadedBy {
                  name
                  email
                }
                documentType {
                  id
                  code
                  name
                }
                createdAt
                status
                signatures {
                  id
                  status
                  signedAt
                  rejectionReason
                  rejectedAt
                  roleName
                  orderPosition
                  realSignerName
                  signer {
                    id
                    name
                    email
                  }
                }
              }
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      setPendingDocuments(response.data.data.pendingDocuments || []);
    } catch (err) {
      console.error('Error al cargar documentos pendientes:', err);
      setError('Error al cargar documentos pendientes');
    } finally {
      setLoadingPending(false);
    }
  };

  /**
   * Cargar documentos firmados desde GraphQL
   */
  const loadSignedDocuments = async () => {
    setLoadingSigned(true);
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              signedDocuments {
                id
                title
                description
                filePath
                fileName
                fileSize
                documentType {
                  id
                  code
                  name
                }
                uploadedBy {
                  name
                  email
                }
                createdAt
                status
                signedAt
                signatureType
                signatures {
                  id
                  status
                  signedAt
                  rejectionReason
                  rejectedAt
                  roleName
                  orderPosition
                  realSignerName
                  signer {
                    id
                    name
                    email
                  }
                }
              }
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      setSignedDocuments(response.data.data.signedDocuments || []);
    } catch (err) {
      console.error('Error al cargar documentos firmados:', err);
      setError('Error al cargar documentos firmados');
    } finally {
      setLoadingSigned(false);
    }
  };

  /**
   * Cargar mis documentos desde GraphQL
   */
  const loadMyDocuments = async () => {
    setLoadingMy(true);
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              myDocuments {
                id
                title
                description
                fileName
                filePath
                fileSize
                status
                createdAt
                totalSigners
                signedCount
                pendingCount
                documentType {
                  id
                  code
                  name
                  roles {
                    id
                    roleName
                    roleCode
                    orderPosition
                  }
                }
                signatures {
                  id
                  signer {
                    id
                    name
                    email
                  }
                  status
                  rejectionReason
                  signedAt
                  roleName
                  orderPosition
                  realSignerName
                }
              }
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      setMyDocuments(response.data.data.myDocuments || []);
    } catch (err) {
      console.error('Error al cargar mis documentos:', err);
      setError('Error al cargar mis documentos');
    } finally {
      setLoadingMy(false);
    }
  };

  /**
   * Cargar usuarios disponibles como firmantes desde GraphQL
   */
  const loadAvailableSigners = async () => {
    setLoadingSigners(true);
    try {
      const token = localStorage.getItem('token');

      // Si no hay token, no intentar cargar
      if (!token) {
        console.warn('No hay token disponible para cargar firmantes');
        return;
      }

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              availableSigners {
                id
                name
                email
                role
              }
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        const error = response.data.errors[0];
        // Si el error es de autenticación, silenciar el error pero no cargar datos
        if (isAuthError(error)) {
          console.warn('Token inválido o expirado al cargar firmantes');
          setAvailableSigners([]);
          return;
        }
        throw new Error(error.message);
      }

      setAvailableSigners(response.data.data.availableSigners || []);
    } catch (err) {
      console.error('Error al cargar firmantes:', err);
      // Silenciar errores de autenticación para evitar mostrar errores al usuario
      if (isAuthError(err)) {
        setAvailableSigners([]);
      } else {
        setError('Error al cargar firmantes disponibles');
      }
    } finally {
      setLoadingSigners(false);
    }
  };

  /**
   * Cargar tipos de documentos desde GraphQL
   */
  const loadDocumentTypes = async () => {
    setLoadingDocumentTypes(true);
    try {
      const token = localStorage.getItem('token');

      if (!token) {
        console.warn('No hay token disponible para cargar tipos de documentos');
        return;
      }

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              documentTypes {
                id
                name
                code
                description
                prefix
                roles {
                  id
                  roleName
                  roleCode
                  orderPosition
                  isRequired
                  description
                }
              }
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        const error = response.data.errors[0];
        if (isAuthError(error)) {
          console.warn('Token inválido o expirado al cargar tipos de documentos');
          setDocumentTypes([]);
          return;
        }
        throw new Error(error.message);
      }

      setDocumentTypes(response.data.data.documentTypes || []);
    } catch (err) {
      console.error('Error al cargar tipos de documentos:', err);
      if (isAuthError(err)) {
        setDocumentTypes([]);
      } else {
        setError('Error al cargar tipos de documentos');
      }
    } finally {
      setLoadingDocumentTypes(false);
    }
  };

  /**
   * Cargar documentos rechazados desde GraphQL
   */
  const loadRejectedDocuments = async () => {
    setLoadingRejected(true);
    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query {
              rejectedByMeDocuments {
                id
                title
                description
                fileName
                filePath
                fileSize
                status
                createdAt
                documentType {
                  id
                  code
                  name
                }
                uploadedBy {
                  id
                  name
                  email
                }
                signatures {
                  id
                  status
                  rejectionReason
                  rejectedAt
                  roleName
                  orderPosition
                  realSignerName
                  signer {
                    id
                    name
                    email
                  }
                }
              }
              rejectedByOthersDocuments {
                id
                title
                description
                fileName
                filePath
                fileSize
                status
                createdAt
                documentType {
                  id
                  code
                  name
                }
                uploadedBy {
                  id
                  name
                  email
                }
                signatures {
                  id
                  status
                  rejectionReason
                  rejectedAt
                  roleName
                  orderPosition
                  realSignerName
                  signer {
                    id
                    name
                    email
                  }
                }
              }
            }
          `
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      setRejectedByMe(response.data.data.rejectedByMeDocuments || []);
      setRejectedByOthers(response.data.data.rejectedByOthersDocuments || []);
    } catch (err) {
      console.error('Error al cargar documentos rechazados:', err);
      setError('Error al cargar documentos rechazados');
    } finally {
      setLoadingRejected(false);
    }
  };

  const validateFile = (file) => {
    if (file.type !== 'application/pdf') {
      setError('Solo se permiten archivos PDF');
      return false;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError('El archivo es demasiado grande. máximo 10MB');
      return false;
    }

    return true;
  };

  const validateFiles = (files) => {
    const valid = [];
    for (const f of files) {
      if (!validateFile(f)) return null;
      valid.push(f);
    }
    return valid;
  };

  /**
   * Alternar selección de un firmante
   */
  const toggleSigner = (signerId) => {
    setSelectedSigners(prev => {
      const isAlreadySelected = prev.some(s =>
        typeof s === 'object' ? s.userId === signerId : s === signerId
      );

      if (isAlreadySelected) {
        return prev.filter(s =>
          typeof s === 'object' ? s.userId !== signerId : s !== signerId
        );
      } else {
        const newSigner = { userId: signerId, roleId: null, roleName: null };
        // Si el firmante es el usuario actual, agregarlo de primero
        if (user && user.id === signerId) {
          return [newSigner, ...prev];
        }
        // Si el usuario actual ya está en la lista, agregarlo después del usuario
        const currentUserInList = prev.some(s =>
          typeof s === 'object' ? s.userId === user.id : s === user.id
        );
        if (user && currentUserInList) {
          const withoutUser = prev.filter(s =>
            typeof s === 'object' ? s.userId !== user.id : s !== user.id
          );
          const currentUserItem = prev.find(s =>
            typeof s === 'object' ? s.userId === user.id : s === user.id
          );
          return [currentUserItem, ...withoutUser, newSigner];
        }
        // Si no, agregarlo al final
        return [...prev, newSigner];
      }
    });
  };

  /**
   * Seleccionar todos los firmantes
   */
  const selectAllSigners = () => {
    setSelectedSigners(availableSigners.map(s => ({ userId: s.id, roleId: null, roleName: null })));
  };

  /**
   * Deseleccionar todos los firmantes
   */
  const clearSelectedSigners = () => {
    setSelectedSigners([]);
  };

  /**
   * Mover firmante hacia arriba en el orden
   */
  const moveSignerUp = (index) => {
    if (index === 0) return; // Ya está al inicio
    setSelectedSigners(prev => {
      const newOrder = [...prev];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      return newOrder;
    });
  };

  /**
   * Mover firmante hacia abajo en el orden
   */
  const moveSignerDown = (index) => {
    setSelectedSigners(prev => {
      if (index === prev.length - 1) return prev; // Ya está al final
      const newOrder = [...prev];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      return newOrder;
    });
  };

  /**
   * Eliminar firmante de la lista seleccionada
   */
  const removeSignerFromSelected = (signerId) => {
    setSelectedSigners(prev => prev.filter(s =>
      typeof s === 'object' ? s.userId !== signerId : s !== signerId
    ));
  };

  /**
   * Actualizar el rol asignado a un firmante
   * Soporta múltiples roles para tipo FV (Legalización de Facturas)
   */
  const updateSignerRole = (signerId, roleId, roleName) => {
    const isFV = selectedDocumentType && selectedDocumentType.code === 'FV';

    setSelectedSigners(prev => prev.map(s => {
      const userId = typeof s === 'object' ? s.userId : s;
      if (userId === signerId) {
        // Para tipo FV: soportar múltiples roles (hasta 3)
        if (isFV) {
          const currentObj = typeof s === 'object' ? s : { userId: signerId, roleIds: [], roleNames: [] };
          const roleIds = currentObj.roleIds || [];
          const roleNames = currentObj.roleNames || [];

          // Toggle del rol: si ya está, quitarlo; si no, agregarlo
          const roleIndex = roleIds.indexOf(roleId);
          if (roleIndex >= 0) {
            // Quitar el rol
            return {
              userId: signerId,
              roleIds: roleIds.filter((_, i) => i !== roleIndex),
              roleNames: roleNames.filter((_, i) => i !== roleIndex)
            };
          } else {
            // Agregar el rol (máximo 3)
            if (roleIds.length >= 3) {
              setRoleErrorPopup({ message: 'Un firmante no puede tener más de 3 roles' });
              return s;
            }
            return {
              userId: signerId,
              roleIds: [...roleIds, roleId],
              roleNames: [...roleNames, roleName]
            };
          }
        } else {
          // Para otros tipos (SA): un solo rol
          // Si se está quitando el rol (roleId null), mantener como objeto con roleId: null
          if (!roleId) {
            return {
              userId: signerId,
              roleId: null,
              roleName: null
            };
          }
          // Asignar o actualizar rol
          return {
            userId: signerId,
            roleId: roleId,
            roleName: roleName
          };
        }
      }
      return s;
    }));
  };

  /**
   * Manejar toggle de "Yo voy a firmar este documento"
   */
  const handleWillSignToggle = (checked) => {
    setWillSignDocument(checked);

    if (!user || !user.id) return;

    if (checked) {
      // Agregar al usuario actual como firmante
      // Si el documento es tipo SA (Solicitud de Anticipo), asignar rol de Solicitante
      if (selectedDocumentType && selectedDocumentType.code === 'SA') {
        // Buscar el rol "Solicitante" en los roles del tipo de documento
        const solicitanteRole = documentTypeRoles.find(role =>
          role.roleCode === 'SOLICITANTE' || role.roleName === 'Solicitante'
        );

        if (solicitanteRole) {
          // Agregar con rol de Solicitante
          setSelectedSigners(prev => [{
            userId: user.id,
            roleId: solicitanteRole.id,
            roleName: solicitanteRole.roleName
          }, ...prev]);
        } else {
          // Agregar sin rol si no se encuentra el rol (no debería pasar)
          setSelectedSigners(prev => [{
            userId: user.id,
            roleId: null,
            roleName: null
          }, ...prev]);
        }
      } else {
        // Para otros tipos de documentos, agregar sin rol
        setSelectedSigners(prev => [{
          userId: user.id,
          roleId: null,
          roleName: null
        }, ...prev]);
      }
    } else {
      // Quitar al usuario actual de la lista de firmantes
      setSelectedSigners(prev => prev.filter(s =>
        (typeof s === 'object' ? s.userId : s) !== user.id
      ));
    }
  };

  /**
   * Alternar filtro de tipo de documento
   */
  const toggleDocTypeFilter = (section, typeCode) => {
    const setters = {
      'pending': setPendingDocsTypeFilter,
      'my': setMyDocsTypeFilter,
      'signed': setSignedDocsTypeFilter,
      'rejected': setRejectedDocsTypeFilter
    };

    const setter = setters[section];
    if (setter) {
      setter(prev => {
        if (prev.includes(typeCode)) {
          return prev.filter(t => t !== typeCode);
        } else {
          return [...prev, typeCode];
        }
      });
    }
  };

  /**
   * Manejar inicio de arrastre de firmante
   */
  const handleDragStartSigner = (e, index) => {
    const signerItem = selectedSigners[index];
    const signerId = typeof signerItem === 'object' ? signerItem.userId : signerItem;
    // Prevenir que el usuario actual sea arrastrado
    if (user && user.id === signerId) {
      e.preventDefault();
      return;
    }
    setDraggedSignerIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  /**
   * Manejar arrastre sobre firmante
   */
  const handleDragOverSigner = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Establecer el índice sobre el que estamos arrastrando para el efecto visual
    setDragOverSignerIndex(index);
  };

  /**
   * Manejar drop de firmante
   */
  const handleDropSigner = (e, dropIndex) => {
    e.preventDefault();

    if (draggedSignerIndex === null || draggedSignerIndex === dropIndex) {
      setDraggedSignerIndex(null);
      setDragOverSignerIndex(null);
      return;
    }

    // Prevenir que cualquier firmante sea arrastrado a la posición 0 si el usuario actual está ahí
    const firstSignerItem = selectedSigners[0];
    const firstSignerId = typeof firstSignerItem === 'object' ? firstSignerItem.userId : firstSignerItem;
    if (user && firstSignerId === user.id && dropIndex === 0) {
      setDraggedSignerIndex(null);
      setDragOverSignerIndex(null);
      return;
    }

    setSelectedSigners(prev => {
      const newOrder = [...prev];
      const draggedItem = newOrder[draggedSignerIndex];
      const draggedUserId = typeof draggedItem === 'object' ? draggedItem.userId : draggedItem;

      // Prevenir que se mueva el usuario actual
      if (user && draggedUserId === user.id) {
        return prev;
      }

      newOrder.splice(draggedSignerIndex, 1);

      // Si el usuario está en posición 0, no permitir que nadie vaya antes
      if (user && newOrder[0] === user.id && dropIndex === 0) {
        newOrder.splice(1, 0, draggedItem);
      } else {
        newOrder.splice(dropIndex, 0, draggedItem);
      }

      return newOrder;
    });

    setDraggedSignerIndex(null);
    setDragOverSignerIndex(null);
  };

  /**
   * Manejar fin de arrastre de firmante
   */
  const handleDragEndSigner = () => {
    setDraggedSignerIndex(null);
    setDragOverSignerIndex(null);
  };

  /**
   * Filtrar firmantes para la vista de subir documento
   * Excluye al usuario actual ya que solo puede agregarse mediante el botón "Yo voy a firmar este documento"
   * Busca cada palabra del término de búsqueda por separado
   */
  const getFilteredSignersForUpload = () => {
    // Filtrar para excluir al usuario actual
    const signersWithoutCurrentUser = availableSigners.filter(signer =>
      !user || signer.id !== user.id
    );

    if (!searchTermUpload.trim()) {
      return signersWithoutCurrentUser;
    }

    // Dividir el término de búsqueda en palabras
    const searchWords = searchTermUpload.toLowerCase().trim().split(/\s+/);

    return signersWithoutCurrentUser.filter(signer => {
      const name = signer.name.toLowerCase();
      const email = signer.email.toLowerCase();

      // Todas las palabras deben encontrarse en el nombre o email
      return searchWords.every(word =>
        name.includes(word) || email.includes(word)
      );
    });
  };

  /**
   * Filtrar firmantes para el modal de mis documentos
   * Busca cada palabra del término de búsqueda por separado
   */
  const getFilteredSignersForModal = (candidates) => {
    if (!searchTermModal.trim()) {
      return candidates;
    }

    // Dividir el término de búsqueda en palabras
    const searchWords = searchTermModal.toLowerCase().trim().split(/\s+/);

    return candidates.filter(signer => {
      const name = signer.name.toLowerCase();
      const email = signer.email.toLowerCase();

      // Todas las palabras deben encontrarse en el nombre o email
      return searchWords.every(word =>
        name.includes(word) || email.includes(word)
      );
    });
  };

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validar máximo 20 archivos
    const currentCount = selectedFiles.length;
    const newCount = currentCount + files.length;
    if (newCount > 20) {
      setError(`Máximo 20 archivos permitidos. Ya tienes ${currentCount} archivo(s) seleccionado(s).`);
      return;
    }

    const valid = validateFiles(files);
    if (!valid) return;
    const merge = (current, incoming) => {
      const map = new Map((current || []).map(f => [f.name + ':' + f.size, true]));
      const result = [...(current || [])];
      for (const f of incoming) {
        const k = f.name + ':' + f.size;
        if (!map.has(k)) {
          // Validar que no se exceda el límite
          if (result.length < 20) {
            result.push(f);
            map.set(k, true);
          }
        }
      }
      return result;
    };
    setSelectedFiles(prev => merge(prev, valid));
    setSelectedFile(prev => prev || valid[0]);
    setError('');
    setUploadSuccess(false);
  };

  // Drag & Drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) {
      // Validar máximo 20 archivos
      const currentCount = selectedFiles.length;
      const newCount = currentCount + files.length;
      if (newCount > 20) {
        setError(`Máximo 20 archivos permitidos. Ya tienes ${currentCount} archivo(s) seleccionado(s).`);
        return;
      }

      const valid = validateFiles(files);
      if (!valid) return;
      const merge = (current, incoming) => {
        const map = new Map((current || []).map(f => [f.name + ':' + f.size, true]));
        const result = [...(current || [])];
        for (const f of incoming) {
          const k = f.name + ':' + f.size;
          if (!map.has(k)) {
            // Validar que no se exceda el límite
            if (result.length < 20) {
              result.push(f);
              map.set(k, true);
            }
          }
        }
        return result;
      };
      setSelectedFiles(prev => merge(prev, valid));
      setSelectedFile(prev => prev || valid[0]);
      setError('');
      setUploadSuccess(false);
    }
  };

  /**
   * Eliminar un archivo de la lista
   */
  const removeFile = (index) => {
    setSelectedFiles(prev => {
      const newFiles = [...prev];
      newFiles.splice(index, 1);
      return newFiles;
    });

    // Limpiar el input file para permitir seleccionar el mismo archivo nuevamente
    const fileInput = document.getElementById('file-input-zapsign');
    if (fileInput) fileInput.value = '';

    // Si no quedan archivos, limpiar también selectedFile
    if (selectedFiles.length === 1) {
      setSelectedFile(null);
    }
  };

  /**
   * Limpiar todos los archivos
   */
  const clearAllFiles = () => {
    setSelectedFile(null);
    setSelectedFiles([]);
    const fileInput = document.getElementById('file-input-zapsign');
    if (fileInput) fileInput.value = '';
  };

  /**
   * Manejar el inicio del drag para reordenar archivos
   */
  const handleFileDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('dragging');
  };

  /**
   * Manejar el drag over para reordenar archivos
   */
  const handleFileDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (draggedIndex === null || draggedIndex === index) return;

    // Reordenar los archivos
    setSelectedFiles(prev => {
      const newFiles = [...prev];
      const draggedFile = newFiles[draggedIndex];
      newFiles.splice(draggedIndex, 1);
      newFiles.splice(index, 0, draggedFile);
      return newFiles;
    });

    setDraggedIndex(index);
  };

  /**
   * Manejar el fin del drag
   */
  const handleFileDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    setDraggedIndex(null);
  };

  /**
   * Handles the document upload process with validation, signer assignment, and auto-signing
   *
   * Triggered when user submits the upload form. Validates file selection and signers,
   * uploads document(s) to the server, assigns signers with their roles, and automatically
   * signs the document if the current user is in the signer list.
   *
   * @param {Event} e - Form submission event
   * @returns {Promise<void>}
   *
   * @throws {Error} If upload fails or signer assignment fails
   *
   * Business rules:
   * - At least one file and one signer required
   * - For FV document types, roles must be validated before upload (validated in handleNext)
   * - For SA document types, uploader is automatically assigned as "Solicitante" role
   * - Supports single file, multiple files, or unified PDF upload
   * - Auto-signs if current user is in signer list
   *
   * Side effects:
   * - Calls API_UPLOAD_URL, API_UPLOAD_UNIFIED_URL, or API_UPLOAD_MULTI_URL
   * - Assigns signers via GraphQL mutation
   * - Auto-signs via signDocument mutation if applicable
   * - Resets form state on success
   * - Reloads "My Documents" list
   * - Shows success message for 5 seconds
   */
  const handleUpload = async (e) => {
    e.preventDefault();

    if (((selectedFiles?.length || 0) === 0 && !selectedFile)) {
      setError('Por favor adjunta al menos un archivo');
      return;
    }

    if (selectedSigners.length === 0) {
      setError('Por favor selecciona al menos un firmante');
      return;
    }

    // Nota: La validación de roles FV ahora se hace en handleNext (paso 1 -> 2)
    // ya no es necesario validar aquí porque no se puede llegar al paso 3 sin roles

    setUploading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      // Crear FormData para subir el/los archivo(s)
      const formData = new FormData();
      const filesToSend = (selectedFiles && selectedFiles.length > 0) ? selectedFiles : (selectedFile ? [selectedFile] : []);
      if (filesToSend.length === 0) {
        setError('Selecciona al menos un PDF');
        setUploading(false);
        return;
      }
      // Nombre del conjunto (opcional)
      if (documentTitle && documentTitle.trim()) {
        formData.append('groupTitle', documentTitle.trim());
      }
      // Enviar como múltiples si hay más de uno
      if (filesToSend.length > 1) {
        for (const f of filesToSend) formData.append('files', f);
      } else {
        formData.append('file', filesToSend[0]);
      }
      // Ya no usamos 'title' como nombre del documento cuando hay múltiples,
      // el backend usará el nombre real del archivo como título y 'groupTitle' para agrupar.
      const finalTitle = selectedDocumentType
        ? `${selectedDocumentType.prefix} ${documentTitle.trim()}`
        : documentTitle.trim();
      formData.append('title', finalTitle);
      if (documentDescription.trim()) {
        formData.append('description', documentDescription.trim());
      }
      if (selectedDocumentType) {
        formData.append('documentTypeId', selectedDocumentType.id);
      }

      // Determinar endpoint según número de archivos y opción de unificar
      let endpoint;
      if (filesToSend.length === 1) {
        endpoint = API_UPLOAD_URL;
      } else {
        // Si hay múltiples archivos y la opción de unificar está activada
        endpoint = unifyPDFs ? API_UPLOAD_UNIFIED_URL : API_UPLOAD_MULTI_URL;
      }
      const uploadResponse = await axios.post(endpoint, formData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      if (uploadResponse.data.success && (uploadResponse.data.document || uploadResponse.data.documents)) {
        const documents = uploadResponse.data.documents || [uploadResponse.data.document];

        // Asignar firmantes a cada documento creado
        for (const doc of documents) {
          // Preparar signerAssignments según si son objetos o IDs simples
          const signerAssignments = selectedSigners.map(s => {
            if (typeof s === 'object') {
              return {
                userId: s.userId,
                // Campos singulares (legacy - para SA)
                roleId: s.roleId || null,
                roleName: s.roleName || null,
                // Campos arrays (nuevo - para FV)
                roleIds: s.roleIds || null,
                roleNames: s.roleNames || null
              };
            } else {
              return {
                userId: s,
                roleId: null,
                roleName: null,
                roleIds: null,
                roleNames: null
              };
            }
          });

          const assignResponse = await axios.post(
            API_URL,
            {
              query: `
                mutation AssignSigners($documentId: ID!, $signerAssignments: [SignerAssignmentInput!]!) {
                  assignSigners(documentId: $documentId, signerAssignments: $signerAssignments)
                }
              `,
              variables: {
                documentId: doc.id,
                signerAssignments
              }
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (assignResponse.data.errors) {
            throw new Error(assignResponse.data.errors[0].message);
          }

          // Autofirma: Si el usuario actual está en la lista de firmantes, firmar automáticamente
          const userInSigners = selectedSigners.some(s =>
            typeof s === 'object' ? s.userId === user.id : s === user.id
          );
          if (user && user.id && userInSigners) {
            try {
              const signResponse = await axios.post(
                API_URL,
                {
                  query: `
                    mutation SignDocument($documentId: ID!, $signatureData: String!) {
                      signDocument(documentId: $documentId, signatureData: $signatureData) {
                        id
                        status
                        signedAt
                      }
                    }
                  `,
                  variables: {
                    documentId: doc.id,
                    signatureData: `Autofirmado por ${user.name || user.email} el ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`
                  }
                },
                { headers: { Authorization: `Bearer ${token}` } }
              );

              if (signResponse.data.errors) {
                console.error('Error en autofirma:', signResponse.data.errors);
              } else {
                console.log('✅ Documento autofirmado exitosamente:', doc.id);
              }
            } catch (signError) {
              console.error('Error al autofirmar documento:', signError);
              // No lanzamos el error para no interrumpir el flujo
            }
          }
        }

        // Mostrar animación de carga
        setShowCreationLoader(true);

        // Después de 3 segundos (duración de la animación), ocultar loader y mostrar éxito
        setTimeout(() => {
          setShowCreationLoader(false);
          setUploadSuccess(true);
          setSelectedFile(null);
          setSelectedFiles([]);
          setDocumentTitle('');
          setDocumentDescription('');
          setSelectedSigners([]);
          setActiveStep(0); // Volver al primer paso del stepper
          setActiveTab('upload'); // Volver al tab de subir documento

          // Limpiar el input file
          const fileInput = document.getElementById('file-input');
          if (fileInput) fileInput.value = '';

          // Recargar mis documentos
          loadMyDocuments();

          // Ocultar mensaje de éxito después de 5 segundos
          setTimeout(() => setUploadSuccess(false), 5000);
        }, 3000);
      } else {
        throw new Error(uploadResponse.data.message || 'Error al subir el documento');
      }
    } catch (err) {
      console.error('Error en subida:', err);
      setError(
        err.response?.data?.message ||
        err.message ||
        'Error al subir el documento. Por favor intenta nuevamente.'
      );
    } finally {
      setUploading(false);
    }
  };

  /**
   * Firmar documento REAL usando GraphQL
   */
  /**
   * Verifica si el usuario actual es "Negociaciones"
   */
  const isNegociacionesUser = () => {
    return user && (user.name === 'Negociaciones' || user.email === 'negociaciones@prexxa.com');
  };

  /**
   * Maneja el inicio del proceso de firma
   * Si es usuario Negociaciones, muestra modal de selección primero
   */
  const initiateSignDocument = (docId) => {
    if (isNegociacionesUser()) {
      // Guardar la acción pendiente y mostrar modal
      setPendingDocumentAction({ type: 'sign', docId });
      setRealSignerAction('firmar');
      setShowRealSignerModal(true);
    } else {
      // Firmar directamente
      handleSignDocument(docId);
    }
  };

  /**
   * Firma el documento (función interna, llamada después del modal si es necesario)
   */
  const handleSignDocument = async (docId, realSigner = null) => {
    // Prevenir múltiples clicks
    if (signing) {
      console.warn('Ya se está procesando una firma');
      return;
    }

    try {
      setSigning(true);
      const token = localStorage.getItem('token');

      // Construir signatureData incluyendo el nombre real si es usuario Negociaciones
      let signatureData = `Firmado por ${user.name || user.email}`;
      if (realSigner) {
        signatureData += ` (${realSigner})`;
      }
      signatureData += ` el ${new Date().toISOString()}`;

      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation SignDocument($documentId: ID!, $signatureData: String!, $consecutivo: String, $realSignerName: String) {
              signDocument(documentId: $documentId, signatureData: $signatureData, consecutivo: $consecutivo, realSignerName: $realSignerName) {
                id
                status
                signedAt
                consecutivo
                realSignerName
              }
            }
          `,
          variables: {
            documentId: docId,
            signatureData: signatureData,
            consecutivo: consecutivo || null,
            realSignerName: realSigner || null
          }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      // Mostrar popup de éxito
      setShowSignSuccess(true);

      // Limpiar consecutivo después de firmar
      setConsecutivo('');

      // Recargar ambas listas: pendientes y firmados
      await loadPendingDocuments();
      await loadSignedDocuments();
    } catch (err) {
      console.error('Error al firmar:', err);
      // Mostrar modal de error
      setOrderErrorMessage(err.message || 'Error al firmar el documento');
      setShowOrderError(true);
    } finally {
      setSigning(false);
    }
  };

  /**
   * Maneja el inicio del proceso de rechazo
   * Si es usuario Negociaciones, muestra modal de selección primero
   */
  const initiateRejectDocument = (docId, reason) => {
    if (isNegociacionesUser()) {
      // Guardar la acción pendiente y mostrar modal
      setPendingDocumentAction({ type: 'reject', docId, reason });
      setRealSignerAction('rechazar');
      setShowRealSignerModal(true);
    } else {
      // Rechazar directamente
      handleRejectDocument(docId, reason);
    }
  };

  /**
   * Maneja la confirmación del modal de selección de firmante real
   */
  const handleRealSignerConfirm = (signerName) => {
    setRealSignerName(signerName);

    if (pendingDocumentAction) {
      if (pendingDocumentAction.type === 'sign') {
        // Ejecutar firma con el nombre real
        handleSignDocument(pendingDocumentAction.docId, signerName);
      } else if (pendingDocumentAction.type === 'reject') {
        // Ejecutar rechazo con el nombre real
        handleRejectDocument(pendingDocumentAction.docId, pendingDocumentAction.reason, signerName);
      }
      // Limpiar acción pendiente
      setPendingDocumentAction(null);
    }
  };

  /**
   * Rechazar documento con razón (función interna, llamada después del modal si es necesario)
   */
  const handleRejectDocument = async (docId, reason, realSigner = null) => {
    // Prevenir múltiples clicks
    if (rejecting) {
      console.warn('Ya se está procesando un rechazo');
      return;
    }

    try {
      setRejecting(true);
      const token = localStorage.getItem('token');

      // Agregar información del firmante real si es usuario Negociaciones
      let finalReason = reason || '';
      if (realSigner) {
        finalReason = `${finalReason}\n\n[Rechazado por: ${realSigner}]`;
      }

      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation RejectDocument($documentId: ID!, $reason: String, $realSignerName: String) {
              rejectDocument(documentId: $documentId, reason: $reason, realSignerName: $realSignerName)
            }
          `,
          variables: {
            documentId: docId,
            reason: finalReason,
            realSignerName: realSigner || null
          }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      // Mostrar popup de éxito
      setShowRejectSuccess(true);

      // Recargar documentos pendientes
      await loadPendingDocuments();
    } catch (err) {
      console.error('Error al rechazar documento:', err);
      // Mostrar modal de error
      setOrderErrorMessage(err.message || 'Error al rechazar el documento');
      setShowOrderError(true);
    } finally {
      setRejecting(false);
    }
  };

  /**
   * Handles notification click to navigate to the related document and appropriate tab
   *
   * Triggered when user clicks on a notification in the notification dropdown. Fetches
   * the related document, determines the correct tab based on notification type, and
   * opens the document viewer.
   *
   * @param {Object} notification - Notification object containing type, documentId, and metadata
   * @param {string} notification.type - Type of notification (signature_request, document_signed, document_rejected, document_deleted)
   * @param {string} notification.documentId - ID of the related document
   * @param {string} notification.documentTitle - Title of the document
   * @returns {Promise<void>}
   *
   * @throws {Error} If document fetch fails
   *
   * Business rules:
   * - 'signature_request' -> navigates to 'pending' tab
   * - 'document_signed' -> navigates to 'my-documents' (if user is creator) or 'signed' tab
   * - 'document_rejected' or 'document_rejected_by_other' -> navigates to 'rejected' tab
   * - 'document_deleted' -> shows error notification and returns
   *
   * Side effects:
   * - Fetches full document data via GraphQL query
   * - Changes active tab based on notification type
   * - Opens document viewer with handleViewDocument
   * - May reload pending documents if navigating to pending tab
   */
  const handleNotificationClick = async (notification) => {
    try {
      // Si la notificación es de documento eliminado, mostrar mensaje informativo
      if (notification.type === 'document_deleted') {
        showNotif('Documento eliminado', `El documento "${notification.documentTitle}" ha sido eliminado y ya no está disponible.`, 'error');
        return;
      }

      const token = localStorage.getItem('token');

      // Query the document directly by ID
      const response = await axios.post(
        API_URL,
        {
          query: `
            query GetDocument($id: ID!) {
              document(id: $id) {
                id
                title
                description
                fileName
                filePath
                fileSize
                mimeType
                status
                uploadedBy {
                  id
                  name
                  email
                }
                uploadedById
                createdAt
                updatedAt
                completedAt
                totalSigners
                signedCount
                pendingCount
                signatures {
                  id
                  signer {
                    id
                    name
                    email
                  }
                  status
                  signedAt
                  rejectedAt
                  rejectionReason
                  realSignerName
                }
              }
              documentSigners(documentId: $id) {
                userId
                orderPosition
                user {
                  id
                  name
                  email
                }
                signature {
                  id
                  status
                  signedAt
                  rejectedAt
                }
              }
            }
          `,
          variables: { id: notification.documentId }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        console.error('GraphQL errors:', response.data.errors);
        throw new Error(response.data.errors[0].message);
      }

      const doc = response.data.data.document;
      const signers = response.data.data.documentSigners || [];

      if (!doc) {
        console.error('Documento no encontrado');
        showNotif('Documento no disponible', `El documento "${notification.documentTitle}" ya no está disponible. Es posible que haya sido eliminado.`, 'error');
        return;
      }

      // Determinar la pestaña y el estado isPending según el tipo de notificación
      let targetTab = 'my-documents';
      let isPending = false;
      let isWaiting = false;

      if (notification.type === 'signature_request') {
        // Solicitud de firma -> verificar estado real de la firma
        targetTab = 'pending';

        // Buscar la información del firmante actual
        const currentUserSigner = signers.find(s => s.userId === user?.id);

        if (currentUserSigner && currentUserSigner.signature) {
          const sigStatus = currentUserSigner.signature.status;

          if (sigStatus === 'pending') {
            // Verificar si es el turno del usuario
            // El usuario puede firmar si todos los anteriores ya firmaron
            const previousSigners = signers.filter(
              s => s.orderPosition < currentUserSigner.orderPosition
            );

            const allPreviousSigned = previousSigners.every(
              s => s.signature && s.signature.status === 'signed'
            );

            if (allPreviousSigned) {
              isPending = true; // Puede firmar/rechazar
              isWaiting = false;
            } else {
              isPending = false; // No puede firmar aún
              isWaiting = true; // Esperando turno
            }
          } else if (sigStatus === 'signed') {
            // Ya firmó este documento
            isPending = false;
            isWaiting = false;
            // Cambiar a pestaña de firmados
            targetTab = 'signed';
          } else if (sigStatus === 'rejected') {
            // Ya rechazó este documento
            isPending = false;
            isWaiting = false;
            // Cambiar a pestaña de rechazados
            targetTab = 'rejected';
          }
        } else {
          // El usuario no es firmante de este documento (no debería ocurrir)
          isPending = false;
          isWaiting = false;
        }
      } else if (notification.type === 'document_signed') {
        // Documento firmado -> puede estar en "mis documentos" o "firmados"
        // Verificar si el usuario actual es el creador
        const currentUserId = user?.id;
        if (doc.uploadedById === currentUserId) {
          targetTab = 'my-documents';
        } else {
          targetTab = 'signed';
        }
      } else if (notification.type === 'document_rejected' || notification.type === 'document_rejected_by_other') {
        // Documento rechazado -> pestaña de rechazados
        targetTab = 'rejected';
      }

      // Cambiar a la pestaña correspondiente y abrir el documento
      setActiveTab(targetTab);

      // Usar setTimeout para dar tiempo a que la interfaz actualice la pestaña
      setTimeout(() => {
        handleViewDocument(doc, isPending, isWaiting);
      }, 100);

      // Opcionalmente, recargar la lista correspondiente en segundo plano
      // para mantener la UI actualizada
      if (targetTab === 'pending' && !loadingPending) {
        loadPendingDocuments();
      } else if (targetTab === 'my-documents' && !loadingMy) {
        loadMyDocuments();
      } else if (targetTab === 'signed' && !loadingSigned) {
        loadSignedDocuments();
      } else if (targetTab === 'rejected' && !loadingRejected) {
        loadRejectedDocuments();
      }

    } catch (error) {
      console.error('Error al abrir documento desde notificación:', error);
      if (error.response) {
        console.error('Error response data:', error.response.data);
        console.error('Error response status:', error.response.status);
      }
    }
  };

  const handleCloseViewer = () => {
    setViewingDocument(null);
    setIsViewingPending(false);
    setIsWaitingTurn(false);
    setShowSignConfirm(false);
    setShowRejectConfirm(false);
    setRejectReason('');
    setRejectError('');
    setShowDescription(false);
  };

  const handleOpenSignConfirm = () => {
    setShowSignConfirm(true);
  };

  const handleCancelSign = () => {
    setShowSignConfirm(false);
    setConsecutivo(''); // Limpiar consecutivo al cancelar
  };

  const handleConfirmSign = async () => {
    if (viewingDocument) {
      initiateSignDocument(viewingDocument.id);
      setShowSignConfirm(false);
      // No cerrar el viewer aquí, dejar que el usuario cierre el popup de éxito
    }
  };

  const handleSaveConsecutivo = () => {
    // Guardar el consecutivo temporal al campo permanente
    setConsecutivo(tempConsecutivo);
    setShowConsecutivoModal(false);
  };

  const handleCancelConsecutivo = () => {
    // Restaurar el valor guardado y descartar cambios temporales
    setTempConsecutivo(consecutivo);
    setShowConsecutivoModal(false);
  };

  const handleOpenRejectConfirm = () => {
    setShowRejectConfirm(true);
    setRejectReason('');
    setRejectError('');
  };

  const handleCancelReject = () => {
    setShowRejectConfirm(false);
    setRejectReason('');
    setRejectError('');
  };

  const handleRejectReasonChange = (e) => {
    const value = e.target.value;
    setRejectReason(value);
    if (value.length >= 5) {
      setRejectError('');
    }
  };

  const handleConfirmReject = async () => {
    if (rejectReason.trim().length < 5) {
      setRejectError('Debes proporcionar una razón de al menos 5 caracteres');
      return;
    }

    if (viewingDocument) {
      initiateRejectDocument(viewingDocument.id, rejectReason.trim());
      // Limpiar estados del modal de rechazo
      setShowRejectConfirm(false);
      setRejectReason('');
      setRejectError('');
      // No cerrar el viewer aquí, dejar que el usuario cierre el popup de éxito
    }
  };

  /**
   * Abrir modal de confirmación de firma rápida
   */
  const handleOpenQuickSignConfirm = (doc) => {
    setDocumentToSign(doc);
    setShowQuickSignConfirm(true);
  };

  /**
   * Cancelar firma rápida
   */
  const handleCancelQuickSign = () => {
    setShowQuickSignConfirm(false);
    setDocumentToSign(null);
  };

  /**
   * Confirmar firma rápida
   */
  const handleConfirmQuickSign = async () => {
    if (documentToSign) {
      initiateSignDocument(documentToSign.id);
      setShowQuickSignConfirm(false);
      setDocumentToSign(null);
    }
  };

  /**
   * Eliminar documento con confirmación
   */
  const handleDeleteDocument = (docId, docTitle) => {
    setDeleteDocId(docId);
    setDeleteDocTitle(docTitle || '');
    setConfirmDeleteOpen(true);
  };

  const confirmDeleteDocument = async () => {
    if (!deleteDocId) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation DeleteDocument($id: ID!) {
              deleteDocument(id: $id)
            }
          `,
          variables: { id: deleteDocId }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }
      setConfirmDeleteOpen(false);
      // Si el visor muestra este doc, cerrarlo
      if (viewingDocument && viewingDocument.id === deleteDocId) {
        setViewingDocument(null);
      }
      setDeleteDocId(null);
      setDeleteDocTitle('');
      await loadMyDocuments();
    } catch (err) {
      console.error('Error al eliminar documento:', err);
      showNotif('Error', err.message || 'No se pudo eliminar el documento', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const cancelDeleteDocument = () => {
    setConfirmDeleteOpen(false);
    setDeleteDocId(null);
    setDeleteDocTitle('');
  };

  /**
   * Gestionar firmantes de un documento
   */
  const handleManageSigners = async (doc) => {
    setManagingDocument(doc);
    setLoadingDocumentSigners(true);
    setModalSelectedSigners([]);
    // Limpiar estado de selección de roles para FV
    setPendingSignerForRoles(null);
    setSelectedRolesForNewSigner([]);
    setSearchNewSigner('');
    if (availableSigners.length === 0) {
      try { await loadAvailableSigners(); } catch {}
    }

    try {
      const token = localStorage.getItem('token');

      const response = await axios.post(
        API_URL,
        {
          query: `
            query GetDocumentSigners($documentId: ID!) {
              documentSigners(documentId: $documentId) {
                userId
                orderPosition
                roleName
                roleNames
                user {
                  id
                  name
                  email
                }
                signature {
                  id
                  status
                  signedAt
                  rejectedAt
                  rejectionReason
                  realSignerName
                  createdAt
                }
              }
            }
          `,
          variables: {
            documentId: doc.id
          }
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      // Transformar los datos para que sea compatible con el resto del código
      const signers = (response.data.data.documentSigners || []).map(ds => ({
        id: ds.signature?.id || `temp-${ds.userId}`,
        signer: ds.user,
        orderPosition: ds.orderPosition,
        roleName: ds.roleName,
        roleNames: ds.roleNames || [],
        status: ds.signature?.status || 'pending',
        signedAt: ds.signature?.signedAt,
        rejectedAt: ds.signature?.rejectedAt,
        rejectionReason: ds.signature?.rejectionReason,
        realSignerName: ds.signature?.realSignerName,
        createdAt: ds.signature?.createdAt || new Date().toISOString()
      })).sort((a, b) => a.orderPosition - b.orderPosition);

      setDocumentSigners(signers);
    } catch (err) {
      console.error('Error al cargar firmantes:', err);
      showNotif('Error', 'No se pudo cargar la información de firmantes', 'error');
      setManagingDocument(null);
    } finally {
      setLoadingDocumentSigners(false);
    }
  };

  const handleCloseSignersModal = () => {
    setManagingDocument(null);
    setDocumentSigners([]);
    setModalSelectedSigners([]);
    // Limpiar estado de selección de roles para FV
    setPendingSignerForRoles(null);
    setSelectedRolesForNewSigner([]);
    setSearchNewSigner('');
  };

  // Selección para modal de gestión de firmantes
  const toggleModalSigner = (signerId) => {
    setModalSelectedSigners(prev => prev.includes(signerId)
      ? prev.filter(id => id !== signerId)
      : [...prev, signerId]
    );
  };

  const selectAllModalSigners = (candidates) => {
    setModalSelectedSigners(candidates.map(s => s.id));
  };

  const clearModalSelectedSigners = () => setModalSelectedSigners([]);

  /**
   * Adds multiple selected signers to a document in bulk
   *
   * Triggered when user clicks "Add Selected" after selecting multiple signers from
   * the available signers list in the manage signers modal. Assigns all selected users
   * as signers and auto-signs if the current user is among them.
   *
   * @returns {Promise<void>}
   *
   * @throws {Error} If signer assignment mutation fails
   *
   * Business rules:
   * - Only active if document is being managed and signers are selected
   * - Adds all selected signers in a single batch operation
   * - Auto-signs document if current user is in the selected list
   *
   * Side effects:
   * - Calls assignSigners GraphQL mutation with array of user IDs
   * - Auto-signs via signDocument mutation if current user included
   * - Refreshes document signer list via handleManageSigners
   * - Reloads "My Documents" list
   * - Clears modal selections on success
   * - Shows error notification on failure
   */
  const handleAddSignersToDocument = async () => {
    if (!managingDocument || modalSelectedSigners.length === 0) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation AssignSigners($documentId: ID!, $userIds: [ID!]!) {
              assignSigners(documentId: $documentId, userIds: $userIds)
            }
          `,
          variables: {
            documentId: managingDocument.id,
            userIds: modalSelectedSigners
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      // Autofirma: Si el usuario actual está en la lista de firmantes agregados, firmar automáticamente
      if (user && user.id && modalSelectedSigners.includes(user.id)) {
        try {
          const signResponse = await axios.post(
            API_URL,
            {
              query: `
                mutation SignDocument($documentId: ID!, $signatureData: String!) {
                  signDocument(documentId: $documentId, signatureData: $signatureData) {
                    id
                    status
                    signedAt
                  }
                }
              `,
              variables: {
                documentId: managingDocument.id,
                signatureData: `Autofirmado por ${user.name || user.email} el ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`
              }
            },
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (signResponse.data.errors) {
            console.error('Error en autofirma:', signResponse.data.errors);
          } else {
            console.log('✅ Documento autofirmado exitosamente:', managingDocument.id);
          }
        } catch (signError) {
          console.error('Error al autofirmar documento:', signError);
          // No lanzamos el error para no interrumpir el flujo
        }
      }

      // Refrescar lista de firmantes del documento
      setLoadingDocumentSigners(true);
      const refresh = await axios.post(
        API_URL,
        {
          query: `
            query GetSignatures($documentId: ID!) {
              signatures(documentId: $documentId) {
                id
                signer { id name email }
                status
                signedAt
                createdAt
                rejectionReason
                realSignerName
                roleName
                orderPosition
              }
            }
          `,
          variables: { documentId: managingDocument.id }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!refresh.data.errors) {
        setDocumentSigners(refresh.data.data.signatures || []);
      }
      setModalSelectedSigners([]);
      setLoadingDocumentSigners(false);

      // Actualizar lista de mis documentos para reflejar conteo
      try { await loadMyDocuments(); } catch {}
    } catch (err) {
      console.error('Error al asignar firmantes:', err);
      showNotif('Error', err.message || 'No se pudo asignar los firmantes', 'error');
    }
  };

  /**
   * Initiates the process to remove a signer from a document
   *
   * Triggered when user clicks the remove button next to a signer in the manage signers
   * modal. Validates removal constraints and opens a confirmation modal with appropriate
   * warning if removing the last pending signer from a partially signed document.
   *
   * @param {string} signerId - ID of the signer to remove
   * @returns {void}
   *
   * Business rules:
   * - Validates that document is being managed and signer exists
   * - Special warning if removing last pending signer when others have already signed
   * - Removal would change document status if last pending signer removed
   *
   * Side effects:
   * - Opens confirmation modal with signer details
   * - Sets isLastPending flag if this removal would affect document completion
   * - Actual removal happens in confirmRemoveSignerAction after user confirms
   */
  // Eliminar firmante
  const handleRemoveSigner = (signerId) => {
    if (!managingDocument) return;

    // Confirmar eliminación
    const signature = documentSigners.find(s => s.signer.id === signerId);
    if (!signature) return;

    // Verificar si este es el último firmante pendiente y hay firmantes que ya firmaron
    const pendingSigners = documentSigners.filter(s => s.status === 'pending');
    const signedSigners = documentSigners.filter(s => s.status === 'signed');

    const isLastPending = pendingSigners.length === 1 && pendingSigners[0].signer.id === signerId;
    const hasSignedSigners = signedSigners.length > 0;

    // Mostrar modal de confirmación con advertencia si corresponde
    setConfirmRemoveSignerModal({
      signerId,
      signerName: signature.signer.name || signature.signer.email,
      isLastPending: isLastPending && hasSignedSigners
    });
  };

  // Confirmar eliminación de firmante
  const confirmRemoveSignerAction = async () => {
    if (!confirmRemoveSignerModal) return;

    const { signerId } = confirmRemoveSignerModal;
    setRemovingSignerLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation RemoveSigner($documentId: ID!, $userId: ID!) {
              removeSigner(documentId: $documentId, userId: $userId)
            }
          `,
          variables: {
            documentId: managingDocument.id,
            userId: signerId
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      // Refrescar lista de firmantes del documento
      setLoadingDocumentSigners(true);
      const refresh = await axios.post(
        API_URL,
        {
          query: `
            query GetDocumentSigners($documentId: ID!) {
              documentSigners(documentId: $documentId) {
                userId
                orderPosition
                roleName
                roleNames
                user {
                  id
                  name
                  email
                }
                signature {
                  id
                  status
                  signedAt
                  rejectedAt
                  rejectionReason
                  createdAt
                }
              }
            }
          `,
          variables: { documentId: managingDocument.id }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (refresh.data.errors) {
        throw new Error(refresh.data.errors[0].message);
      }

      // Transformar los datos
      const signers = (refresh.data.data.documentSigners || []).map(ds => ({
        id: ds.signature?.id || `temp-${ds.userId}`,
        signer: ds.user,
        orderPosition: ds.orderPosition,
        status: ds.signature?.status || 'pending',
        signedAt: ds.signature?.signedAt,
        rejectedAt: ds.signature?.rejectedAt,
        rejectionReason: ds.signature?.rejectionReason,
        createdAt: ds.signature?.createdAt || new Date().toISOString()
      })).sort((a, b) => a.orderPosition - b.orderPosition);

      setDocumentSigners(signers);
      setLoadingDocumentSigners(false);

      // Recargar la lista de documentos
      await loadMyDocuments();

      // Cerrar el modal después de éxito
      setConfirmRemoveSignerModal(null);
    } catch (err) {
      console.error('Error al eliminar firmante:', err);
      showNotif('Error', err.message || 'No se pudo eliminar el firmante', 'error');
      setLoadingDocumentSigners(false);
    } finally {
      setRemovingSignerLoading(false);
    }
  };

  // Drag and Drop handlers para modal de firmantes
  const handleSignerDragStart = (e, index) => {
    setDraggedSignerIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleSignerDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Establecer el índice sobre el que estamos arrastrando para el efecto visual
    setDragOverSignerIndex(index);
  };

  const handleSignerDrop = (e, dropIndex) => {
    e.preventDefault();

    if (draggedSignerIndex === null || draggedSignerIndex === dropIndex) {
      setDraggedSignerIndex(null);
      setDragOverSignerIndex(null);
      return;
    }

    const draggedSigner = documentSigners[draggedSignerIndex];
    const targetSigner = documentSigners[dropIndex];

    // REGLA 1: Los firmantes que ya firmaron o rechazaron NO se pueden mover EN ABSOLUTO
    if (draggedSigner.status === 'signed' || draggedSigner.status === 'rejected') {
      setInvalidPositionModal(true);
      setDraggedSignerIndex(null);
      setDragOverSignerIndex(null);
      return;
    }

    // REGLA 2: Los firmantes PENDIENTES solo pueden moverse DESPUÉS de todos los que ya firmaron/rechazaron
    // Encontrar el índice del último firmante firmado/rechazado
    let lastSignedOrRejectedIndex = -1;
    for (let i = 0; i < documentSigners.length; i++) {
      if (documentSigners[i].status === 'signed' || documentSigners[i].status === 'rejected') {
        lastSignedOrRejectedIndex = i;
      }
    }

    // Si hay firmantes firmados/rechazados y intentamos mover antes o en su zona
    if (lastSignedOrRejectedIndex >= 0 && dropIndex <= lastSignedOrRejectedIndex) {
      setInvalidPositionModal(true);
      setDraggedSignerIndex(null);
      setDragOverSignerIndex(null);
      return;
    }

    // Crear nueva lista reordenada
    const newSigners = [...documentSigners];
    newSigners.splice(draggedSignerIndex, 1);
    newSigners.splice(dropIndex, 0, draggedSigner);

    // Actualizar los orderPosition para reflejar el nuevo orden
    const updatedSigners = newSigners.map((signer, index) => ({
      ...signer,
      orderPosition: index + 1
    }));

    setDocumentSigners(updatedSigners);
    setDraggedSignerIndex(null);
    setDragOverSignerIndex(null);
  };

  const handleSignerDragEnd = () => {
    setDraggedSignerIndex(null);
    setDragOverSignerIndex(null);
  };

  /**
   * Saves the new signing order after user reorders signers via drag-and-drop
   *
   * Triggered when user clicks "Save Order" button after reordering signers in the
   * manage signers modal. Updates the signing sequence on the server and refreshes
   * the document list.
   *
   * @returns {Promise<void>}
   *
   * @throws {Error} If reordering mutation fails
   *
   * Business rules:
   * - Only active if a document is being managed and not currently saving
   * - Signing order determines the sequence in which users must sign
   * - Changes are persisted via GraphQL reorderSigners mutation
   *
   * Side effects:
   * - Calls reorderSigners GraphQL mutation with new order array
   * - Refreshes managingDocument data via handleManageSigners
   * - Reloads "My Documents" list
   * - Shows success modal on completion
   * - Shows error notification on failure
   */
  // Guardar el nuevo orden en el servidor
  const handleSaveOrder = async () => {
    if (!managingDocument || savingOrder) return;

    try {
      setSavingOrder(true);
      const token = localStorage.getItem('token');
      const newOrder = documentSigners.map(signer => signer.signer.id);

      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation ReorderSigners($documentId: ID!, $newOrder: [ID!]!) {
              reorderSigners(documentId: $documentId, newOrder: $newOrder)
            }
          `,
          variables: {
            documentId: managingDocument.id,
            newOrder
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      // Refrescar los datos
      await handleManageSigners(managingDocument);
      await loadMyDocuments();

      // Cerrar el modal de gestión de firmantes
      setManagingDocument(null);

      // Mostrar notificación de éxito
      showNotif('Éxito', 'Orden de firmantes guardado correctamente', 'success');
    } catch (err) {
      console.error('Error al reordenar firmantes:', err);
      showNotif('Error', err.message || 'No se pudo reordenar los firmantes', 'error');
    } finally {
      setSavingOrder(false);
    }
  };

  /**
   * Adds a single signer to a document with optional role assignment
   *
   * Triggered when user adds a signer from the available signers list in the manage
   * signers modal. For FV (Factura de Venta) documents, prompts for role selection
   * before adding. For other document types, adds signer directly.
   *
   * @param {string} userId - ID of the user to add as signer
   * @param {Object|null} rolesData - Optional role data for FV documents
   * @param {Array<string>} rolesData.roleIds - Array of role IDs
   * @param {Array<string>} rolesData.roleNames - Array of role names
   * @returns {Promise<void>}
   *
   * @throws {Error} If signer assignment mutation fails
   *
   * Business rules:
   * - For FV documents without rolesData: opens role selection modal instead of adding
   * - For FV documents with rolesData: adds signer with specified roles
   * - For non-FV documents: adds signer without role requirements
   * - Prevents adding if already processing a signer addition
   *
   * Side effects:
   * - For FV without roles: sets pendingSignerForRoles and opens role modal
   * - For valid additions: calls assignSigners GraphQL mutation
   * - Refreshes document signer list via handleManageSigners
   * - Reloads "My Documents" list
   * - Clears modal search and selections on success
   * - Shows error notification on failure
   */
  // Función para agregar un nuevo firmante
  const handleAddSingleSigner = async (userId, rolesData = null) => {
    if (!managingDocument || addingSignerId) return;

    // Si es FV y no se han proporcionado roles, abrir selector de roles
    const isFV = managingDocument.documentType?.code === 'FV';
    if (isFV && !rolesData) {
      const signer = availableSigners.find(s => s.id === userId);
      if (signer) {
        setPendingSignerForRoles({ userId, name: signer.name, email: signer.email });
        setSelectedRolesForNewSigner([]);
        setSearchNewSigner(''); // Limpiar búsqueda para ocultar el dropdown
      }
      return;
    }

    setAddingSignerId(userId);

    try {
      const token = localStorage.getItem('token');

      // Preparar signerAssignment con roles si es FV
      const signerAssignment = { userId };
      if (isFV && rolesData) {
        signerAssignment.roleIds = rolesData.roleIds;
        signerAssignment.roleNames = rolesData.roleNames;
      }

      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation AssignSigners($documentId: ID!, $signerAssignments: [SignerAssignmentInput!]!) {
              assignSigners(documentId: $documentId, signerAssignments: $signerAssignments)
            }
          `,
          variables: {
            documentId: managingDocument.id,
            signerAssignments: [signerAssignment]
          }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      // Refrescar los datos
      await handleManageSigners(managingDocument);
      await loadMyDocuments();
      setSearchNewSigner('');

      // Limpiar estado de selector de roles
      setPendingSignerForRoles(null);
      setSelectedRolesForNewSigner([]);
    } catch (err) {
      console.error('Error al agregar firmante:', err);
      setErrorModalData({
        title: 'Error',
        message: err.message || 'No se pudo agregar el firmante'
      });
    } finally {
      setAddingSignerId(null);
    }
  };

  // Toggle de rol para nuevo firmante (FV)
  const toggleRoleForNewSigner = (roleId, roleName) => {
    setSelectedRolesForNewSigner(prev => {
      const index = prev.findIndex(r => r.roleId === roleId);
      if (index >= 0) {
        // Quitar el rol
        return prev.filter((_, i) => i !== index);
      } else {
        // Agregar el rol (máximo 3)
        if (prev.length >= 3) {
          setRoleErrorPopup({ message: 'Un firmante no puede tener más de 3 roles' });
          return prev;
        }
        return [...prev, { roleId, roleName }];
      }
    });
  };

  // Confirmar adición de firmante con roles (FV)
  const confirmAddSignerWithRoles = async () => {
    if (!pendingSignerForRoles) return;

    const roleIds = selectedRolesForNewSigner.map(r => r.roleId);
    const roleNames = selectedRolesForNewSigner.map(r => r.roleName);

    await handleAddSingleSigner(pendingSignerForRoles.userId, {
      roleIds,
      roleNames
    });
  };

  // Actualizar preferencias de notificaciones por correo
  const handleUpdateEmailNotifications = async (enabled) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        API_URL,
        {
          query: `
            mutation UpdateEmailNotifications($enabled: Boolean!) {
              updateEmailNotifications(enabled: $enabled) {
                id
                emailNotifications
              }
            }
          `,
          variables: { enabled }
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      setEmailNotifications(enabled);
    } catch (err) {
      console.error('Error al actualizar notificaciones:', err);
    }
  };

  // getDocumentUrl ahora se importa desde config/api.js

  // Conversión robusta para fechas que vengan en distintos formatos
  const toDateSafe = (value) => {
    if (value === null || value === undefined) return null;
    try {
      if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : value;
      }
      if (typeof value === 'number') {
        // segundos vs milisegundos
        const ms = value < 1e12 ? value * 1000 : value;
        const dNum = new Date(ms);
        return isNaN(dNum.getTime()) ? null : dNum;
      }
      let str = String(value).trim();
      if (!str) return null;
      // Epoch en string
      if (/^\d+$/.test(str)) {
        const num = parseInt(str, 10);
        const ms = str.length === 10 ? num * 1000 : num;
        const dEpoch = new Date(ms);
        return isNaN(dEpoch.getTime()) ? null : dEpoch;
      }
      // Normalizar 'YYYY-MM-DD HH:mm:ss(.SSS)(Â±ZZ)' a ISO
      if (str.includes(' ') && !str.includes('T')) {
        str = str.replace(' ', 'T');
      }
      // Si tiene fecha y hora sin zona (no Z ni offset), asumir UTC
      if (str.includes('T') && !/[Zz]|[\+\-]\d{2}:?\d{2}$/.test(str)) {
        str += 'Z';
      }
      // Solo fecha sin hora
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        str += 'T00:00:00Z';
      }
      let d = new Date(str);
      if (isNaN(d.getTime())) {
        // último intento: Date con cadena original
        d = new Date(String(value));
      }
      return isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  };

  const formatDate = (dateInput) => {
    const date = toDateSafe(dateInput);
    if (!date) return '-';
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Bogota'
    }).format(date);
  };

  const formatDateTime = (dateInput) => {
    const date = toDateSafe(dateInput);
    if (!date) return '-';
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Bogota'
    }).format(date);
  };

  const formatFileSize = (bytes) => {
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  };

  /**
   * Obtiene las iniciales de un nombre (primera letra del nombre y apellido)
   */
  const getInitials = (name, email) => {
    if (!name && !email) return 'U';

    const displayName = name || email;
    const parts = displayName.trim().split(/\s+/);

    if (parts.length >= 2) {
      // Tiene nombre y apellido
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    } else {
      // Solo tiene una palabra, usar las primeras 2 letras
      return displayName.substring(0, 2).toUpperCase();
    }
  };

  // Si se está verificando el documento desde URL, mostrar pantalla de carga
  if (isCheckingDocumentFromUrl) {
    return (
      <div className="waiting-turn-fullscreen-overlay">
        <div className="waiting-turn-modal">
          <div className="waiting-turn-content">
            <img src={clockImage} alt="Verificando documento" className="waiting-turn-icon" />
            <h2 className="waiting-turn-title">Verificando documento...</h2>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-background">
        <div className="gradient-circle circle-1"></div>
        <div className="gradient-circle circle-2"></div>
        <div className="gradient-circle circle-3"></div>
      </div>

      <div className="dashboard-content">
        <div className="ds-shell">
          {/* Left Sidebar (visual only) */}
          <aside className="ds-aside">
            <div className="ds-aside-header">
              <div className="logo-container">
                <PyramidLoader />
                <span className="ds-brand-text">docuprex.</span>
              </div>
            </div>
            <nav className="ds-side-nav">
              <button className={`ds-nav-item ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>
                <svg className="ds-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Subir documento
              </button>
              <button className={`ds-nav-item ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
                <svg className="ds-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 6V12L16 14M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Pendiente de firma
              </button>
              <button className={`ds-nav-item ${activeTab === 'signed' ? 'active' : ''}`} onClick={() => setActiveTab('signed')}>
                <svg className="ds-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 11L12 14L22 4M21 12V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Documentos firmados
              </button>
              <button className={`ds-nav-item ${activeTab === 'my-documents' ? 'active' : ''}`} onClick={() => setActiveTab('my-documents')}>
                <svg className="ds-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 7V17C3 17.5304 3.21071 18.0391 3.58579 18.4142C3.96086 18.7893 4.46957 19 5 19H19C19.5304 19 20.0391 18.7893 20.4142 18.4142C20.7893 18.0391 21 17.5304 21 17V9C21 8.46957 20.7893 7.96086 20.4142 7.58579C20.0391 7.21071 19.5304 7 19 7H13L11 4H5C4.46957 4 3.96086 4.21071 3.58579 4.58579C3.21071 4.96086 3 5.46957 3 6V7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mis documentos
              </button>
              <button className={`ds-nav-item ${activeTab === 'rejected' ? 'active' : ''}`} onClick={() => setActiveTab('rejected')}>
                <svg className="ds-nav-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Rechazados
                
              </button>
            </nav>
          </aside>

          <div className="ds-content">
        {/* Header */}
        <header className="dashboard-header">
          <div className="header-right">
            <Notifications onNotificationClick={handleNotificationClick} />

            <div style={{ position: 'relative' }}>
              <button
                className="notifications-bell-button"
                onClick={() => setShowSettings(!showSettings)}
                title="Configuración"
                aria-label="Configuración"
                onMouseEnter={() => setIsSettingsBtnHovered(true)}
                onMouseLeave={() => setIsSettingsBtnHovered(false)}
              >
                <Settings isAnimating={isSettingsBtnHovered} size={24} strokeWidth={2} />
              </button>

              {/* Dropdown de Configuración */}
              {showSettings && (
                <>
                  <div
                    onClick={() => setShowSettings(false)}
                    style={{
                      position: 'fixed',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      zIndex: 999
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      width: '320px',
                      background: 'white',
                      borderRadius: '8px',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                      border: '1px solid #e5e7eb',
                      padding: '16px',
                      zIndex: 1000,
                      animation: 'slideDown 0.2s ease-out'
                    }}
                  >
                    <div style={{ marginBottom: '12px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 4px 0', color: '#111827' }}>
                        Configuración
                      </h3>
                      <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                        Gestiona tus preferencias
                      </p>
                    </div>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 0',
                      borderTop: '1px solid #f3f4f6'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '500', marginBottom: '2px', fontSize: '14px', color: '#374151' }}>
                          Notificaciones por correo
                        </div>
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                          Recibir correos sobre documentos
                        </div>
                      </div>
                      <label style={{
                        position: 'relative',
                        display: 'inline-block',
                        width: '44px',
                        height: '24px',
                        cursor: 'pointer',
                        flexShrink: 0,
                        marginLeft: '12px'
                      }}>
                        <input
                          type="checkbox"
                          checked={emailNotifications}
                          onChange={(e) => handleUpdateEmailNotifications(e.target.checked)}
                          style={{ opacity: 0, width: 0, height: 0 }}
                        />
                        <span style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          backgroundColor: emailNotifications ? '#3b82f6' : '#d1d5db',
                          borderRadius: '24px',
                          transition: '0.3s'
                        }}>
                          <span style={{
                            position: 'absolute',
                            content: '',
                            height: '18px',
                            width: '18px',
                            left: emailNotifications ? '23px' : '3px',
                            bottom: '3px',
                            backgroundColor: 'white',
                            borderRadius: '50%',
                            transition: '0.3s',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                          }} />
                        </span>
                      </label>
                    </div>

                    <button
                      className="credits-button-magic"
                      onClick={() => {
                        developerIndexRef.current = 0;
                        setSelectedDeveloper(true);
                        setShowSettings(false);
                      }}
                    >
                      <div className="blur-layer-credits">
                        <div className="rotating-gradient-credits"></div>
                      </div>

                      <div className="gradient-layer-credits">
                        <div className="rotating-gradient-credits"></div>
                      </div>

                      <div className="inner-bg-credits"></div>

                      <div className="button-content-credits">
                        <span className="icon-credits">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                          </svg>
                        </span>
                        <span className="label-credits">Ver créditos</span>
                      </div>
                    </button>
                  </div>
                  <style>{`
                    @keyframes slideDown {
                      from {
                        opacity: 0;
                        transform: translateY(-10px);
                      }
                      to {
                        opacity: 1;
                        transform: translateY(0);
                      }
                    }
                    @keyframes slideInFade {
                      from {
                        opacity: 0;
                        transform: translateX(30px);
                      }
                      to {
                        opacity: 1;
                        transform: translateX(0);
                      }
                    }
                    @keyframes slideOutFade {
                      from {
                        opacity: 1;
                        transform: translateX(0);
                      }
                      to {
                        opacity: 0;
                        transform: translateX(-30px);
                      }
                    }

                    /* Credits Button Subtle Animation */
                    .credits-button-magic {
                      background: white;
                      border: 1px solid #e5e7eb;
                      border-radius: 8px;
                      cursor: pointer;
                      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                      font-size: 14px;
                      font-weight: 500;
                      line-height: 1.25em;
                      width: 100%;
                      margin-top: 12px;
                      padding: 12px;
                      position: relative;
                      color: #374151;
                      overflow: hidden;
                      transition: transform 0.15s ease, background-color 0.2s ease;
                    }

                    .credits-button-magic:hover {
                      background-color: #f9fafb;
                    }

                    .credits-button-magic:active {
                      transform: scale(0.97);
                    }

                    .blur-layer-credits {
                      display: none;
                    }

                    .gradient-layer-credits {
                      position: absolute;
                      inset: -1px;
                      border-radius: 9px;
                      overflow: hidden;
                      pointer-events: none;
                      opacity: 0;
                      transition: opacity 0.3s ease;
                    }

                    .credits-button-magic:hover .gradient-layer-credits {
                      opacity: 0.35;
                    }

                    .rotating-gradient-credits {
                      position: absolute;
                      width: 200%;
                      height: 200%;
                      top: -50%;
                      left: -50%;
                      background: conic-gradient(
                        from 0deg,
                        transparent 0deg,
                        rgba(139, 92, 246, 0.4) 90deg,
                        rgba(59, 130, 246, 0.4) 180deg,
                        rgba(16, 185, 129, 0.4) 270deg,
                        transparent 360deg
                      );
                      animation: rotate-gradient-credits 4s linear infinite;
                    }

                    @keyframes rotate-gradient-credits {
                      from {
                        transform: rotate(0deg);
                      }
                      to {
                        transform: rotate(360deg);
                      }
                    }

                    .inner-bg-credits {
                      position: absolute;
                      inset: 1px;
                      border-radius: 7px;
                      background: white;
                      z-index: 1;
                    }

                    .credits-button-magic:hover .inner-bg-credits {
                      background: #f9fafb;
                    }

                    .button-content-credits {
                      position: relative;
                      z-index: 2;
                      display: flex;
                      gap: 8px;
                      align-items: center;
                      justify-content: center;
                    }

                    .icon-credits {
                      width: 16px;
                      height: 16px;
                      display: flex;
                    }

                    .icon-credits svg {
                      width: 100%;
                      height: 100%;
                      stroke: currentColor;
                    }

                    .label-credits {
                      font-size: 14px;
                      line-height: 1.25em;
                    }
                  `}</style>
                </>
              )}
            </div>

            <div className="user-info">
              <div className="user-avatar">
                {getInitials(user?.name, user?.email)}
              </div>
              <div className="user-details">
                <span className="user-name">{user?.name || user?.email}</span>
                <span className="user-role">{user?.role || 'Usuario'}</span>
              </div>
            </div>

            <LogoutButton onClick={onLogout} />
          </div>
        </header>

        {/* Main Content */}
        <main className="dashboard-main">
          {/* Navigation Tabs */}
          <div className="tabs-container">
            <button
              className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
              onClick={() => setActiveTab('upload')}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Subir Documento
            </button>
            <button
              className={`tab ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Pendientes de Firma
            </button>
            <button
              className={`tab ${activeTab === 'signed' ? 'active' : ''}`}
              onClick={() => setActiveTab('signed')}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Documentos Firmados
            </button>
            <button
              className={`tab ${activeTab === 'my-documents' ? 'active' : ''}`}
              onClick={() => setActiveTab('my-documents')}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Mis Documentos
            </button>
            <button
              className={`tab ${activeTab === 'rejected' ? 'active' : ''}`}
              onClick={() => setActiveTab('rejected')}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Rechazados
              {!loadingRejected && (rejectedByMe.length + rejectedByOthers.length) > 0 && (
                <span className="badge badge-danger">{rejectedByMe.length + rejectedByOthers.length}</span>
              )}
            </button>
          </div>

          {/* Upload Section - Rediseñado estilo ZapSign */}
          {activeTab === 'upload' && (
            <div className="section upload-section-zapsign">
              {/* Stepper Horizontal Personalizado - 3 Pasos */}
              <div className="firmapro-stepper">
                <div className="firmapro-stepper-items">
                  <div className="firmapro-stepper-item">
                    <div className={`stepper-number ${activeStep >= 0 ? 'active' : ''}`}>1</div>
                    <span className={`stepper-label ${activeStep >= 0 ? 'active' : ''}`}>Cargar documentos</span>
                  </div>
                  <div className="stepper-line"></div>
                  <div className="firmapro-stepper-item">
                    <div className={`stepper-number ${activeStep >= 1 ? 'active' : ''}`}>2</div>
                    <span className={`stepper-label ${activeStep >= 1 ? 'active' : ''}`}>Añadir firmantes</span>
                  </div>
                  <div className="stepper-line"></div>
                  <div className="firmapro-stepper-item">
                    <div className={`stepper-number ${activeStep >= 2 ? 'active' : ''}`}>3</div>
                    <span className={`stepper-label ${activeStep >= 2 ? 'active' : ''}`}>Enviar</span>
                  </div>
                </div>
              </div>

              {/* Content Card */}
              <div className="zapsign-content-card">
                {activeStep !== 1 && (
                  <div className="zapsign-header">
                    <div className="header-content">
                      <div>
                        <h2 className="zapsign-title">Nuevo documento</h2>
                        <p className="zapsign-subtitle">Completa los detalles y sube tu archivo para firmar.</p>
                      </div>
                      <button type="button" className="help-button" onClick={() => setShowHelpModal(true)}>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M9.09 9C9.3251 8.33167 9.78915 7.76811 10.4 7.40913C11.0108 7.05016 11.7289 6.91894 12.4272 7.03871C13.1255 7.15849 13.7588 7.52152 14.2151 8.06353C14.6713 8.60553 14.9211 9.29152 14.92 10C14.92 12 11.92 13 11.92 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M12 17H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <span>Necesito ayuda</span>
                      </button>
                    </div>
                  </div>
                )}

                <form onSubmit={(e) => e.preventDefault()} className="zapsign-upload-form">
                  {/* Mensajes de estado */}
                  {uploadSuccess && (
                    <div className="success-message">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>Documento subido exitosamente</span>
                    </div>
                  )}

                  {error && activeStep !== 1 && (
                    <div className="error-message">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <span>{error}</span>
                    </div>
                  )}

                  {/* Paso 0: Cargar documentos */}
                  {activeStep === 0 && (
                    <>
                      <div className="form-group">
                        <label htmlFor="document-type">
                          Tipo de documento <span>(opcional)</span>
                        </label>
                        <DocumentTypeSelector
                          documentTypes={documentTypes}
                          selectedDocumentType={selectedDocumentType}
                          onDocumentTypeChange={(type) => {
                            setSelectedDocumentType(type);
                            setDocumentTypeRoles(type?.roles || []);
                            setSelectedSigners([]);
                          }}
                          disabled={uploading || loadingDocumentTypes}
                        />
                      </div>

                      {/* Cuando es Legalización de Facturas, mostrar solo el buscador */}
                      {selectedDocumentType?.code === 'FV' ? (
                        <FacturaSearch
                          onFacturaSelect={(factura) => {
                            setDocumentTitle(`${factura.proveedor} - ${factura.numero_factura}`);
                            console.log('Factura seleccionada:', factura);
                          }}
                        />
                      ) : (
                        <>
                          <div className="form-group">
                        <label htmlFor="document-title">
                          Título del documento
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {selectedDocumentType && (
                            <span style={{
                              padding: '0.5rem 1rem',
                              backgroundColor: '#f3f4f6',
                              border: '1px solid #d1d5db',
                              borderRadius: '0.375rem',
                              fontWeight: '600',
                              color: '#374151',
                              whiteSpace: 'nowrap'
                            }}>
                              {selectedDocumentType.prefix}
                            </span>
                          )}
                          <input
                            type="text"
                            id="document-title"
                            value={documentTitle}
                            onChange={(e) => setDocumentTitle(e.target.value)}
                            placeholder={selectedDocumentType?.code === 'FV' ? "Concepto de la factura..." : selectedDocumentType ? "Concepto del anticipo..." : "Concepto del documento..."}
                            className="form-input"
                            style={{ flex: 1 }}
                            disabled={uploading}
                            required
                          />
                        </div>
                      </div>

                      <div className="form-group">
                        <label htmlFor="document-description">
                          Descripción <span>(opcional)</span>
                        </label>
                        <textarea
                          id="document-description"
                          value={documentDescription}
                          onChange={(e) => setDocumentDescription(e.target.value)}
                          placeholder={
                            !selectedDocumentType
                              ? "Describe brevemente el documento..."
                              : selectedDocumentType?.code === 'FV'
                                ? "Describe brevemente la factura..."
                                : selectedDocumentType?.code === 'SA'
                                  ? "Describe brevemente la solicitud de anticipo..."
                                  : "Describe brevemente el documento..."
                          }
                          className="form-input form-textarea"
                          rows="3"
                          disabled={uploading}
                        />
                      </div>

                      {/* Sección: ¿Qué documento se firmará? */}
                      <div className="zapsign-section">
                    <h3 className="section-question">¿Qué documento se firmará?</h3>

                    <div
                      className={`zapsign-upload-area ${isDragging ? 'dragging' : ''} ${(selectedFiles && selectedFiles.length > 0) ? 'has-files' : ''}`}
                      onDragEnter={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                    >
                      <input
                        type="file"
                        id="file-input-zapsign"
                        onChange={(e) => handleFileChange(e)}
                        multiple
                        accept=".pdf,application/pdf"
                        className="file-input-hidden"
                        disabled={uploading}
                      />

                      {!selectedFiles || selectedFiles.length === 0 ? (
                        <label htmlFor="file-input-zapsign" className="zapsign-upload-label">
                          <div className="upload-icon-minimal">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M21 15V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V15M17 8L12 3M12 3L7 8M12 3V15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <div className="upload-text-container">
                            <p className="upload-text-main">
                              <span className="upload-link">Haz clic para subir</span>
                              <span className="upload-text-normal"> o arrastra y suelta</span>
                            </p>
                            <p className="upload-text-hint">Solo PDF hasta 10MB</p>
                          </div>
                        </label>
                      ) : (
                        <div className="file-list-minimal">
                          {selectedFiles.map((file, index) => (
                            <div
                              key={`${file.name}-${index}`}
                              className="file-item-minimal"
                              draggable={!uploading}
                              onDragStart={(e) => handleFileDragStart(e, index)}
                              onDragOver={(e) => handleFileDragOver(e, index)}
                              onDragEnd={handleFileDragEnd}
                            >
                              <div className="file-item-left">
                                <div className="file-icon-minimal">
                                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                    <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </div>
                                <div className="file-info-minimal">
                                  <p className="file-name-minimal">{file.name}</p>
                                  <p className="file-size-minimal">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="file-delete-minimal"
                                onClick={() => removeFile(index)}
                                disabled={uploading}
                                title="Eliminar archivo"
                              >
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Botón para agregar más archivos - minimalista */}
                    {(selectedFiles.length > 0 || selectedFile) && selectedFiles.length < 20 && (
                      <div className="add-more-files-container">
                        <button
                          type="button"
                          className="add-more-files-btn"
                          onClick={() => { const el = document.getElementById('file-input-zapsign'); if (el) el.click(); }}
                          disabled={uploading}
                        >
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 4v16m8-8H4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                          Agregar más archivos
                        </button>
                      </div>
                    )}
                      </div>
                        </>
                      )}
                    </>
                  )}

                  {/* Paso 1: Añadir firmantes */}
                  {activeStep === 1 && (
                    <>
                      {loadingSigners ? (
                        <div className="signers-loading">
                          <Loader size="small" />
                          <span>Cargando firmantes...</span>
                        </div>
                      ) : (
                        <div className="signers-single-column">
                          {/* Header de la sección */}
                          <div className="signers-header">
                            <h2 className="signers-main-title">Añadir firmantes</h2>
                            <p className="signers-subtitle">
                              Selecciona los usuarios que deben firmar este documento. El orden es importante.
                            </p>
                          </div>

                          {/* Mensaje de error específico para este paso */}
                          {error && (
                            <div className="error-message">
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <span>{error}</span>
                            </div>
                          )}

                          {/* Switch: Voy a firmar este documento */}
                          <div
                            onClick={() => !uploading && handleWillSignToggle(!willSignDocument)}
                            style={{
                              marginBottom: '1.5rem',
                              padding: '1rem',
                              backgroundColor: '#fafafa',
                              borderRadius: '0.5rem',
                              border: '1px solid #e2e8f0',
                              cursor: uploading ? 'not-allowed' : 'pointer',
                              transition: 'background-color 0.2s ease'
                            }}
                            onMouseEnter={(e) => !uploading && (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#fafafa'}
                          >
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              userSelect: 'none',
                              pointerEvents: 'none'
                            }}>
                              <div style={{ flex: 1 }}>
                                <span style={{
                                  fontSize: '0.9375rem',
                                  fontWeight: '500',
                                  color: '#1e293b'
                                }}>
                                  Voy a firmar este documento
                                </span>
                                {selectedDocumentType && selectedDocumentType.code === 'SA' && (
                                  <span style={{
                                    display: 'block',
                                    marginTop: '0.25rem',
                                    fontSize: '0.8125rem',
                                    color: '#64748b'
                                  }}>
                                    Se te asignará automáticamente el rol de Solicitante
                                  </span>
                                )}
                              </div>
                              {/* Switch Toggle */}
                              <div
                                style={{
                                  position: 'relative',
                                  width: '48px',
                                  height: '24px',
                                  backgroundColor: willSignDocument ? '#3b82f6' : '#cbd5e1',
                                  borderRadius: '12px',
                                  transition: 'background-color 0.3s ease',
                                  opacity: uploading ? 0.5 : 1,
                                  flexShrink: 0
                                }}
                              >
                                <div style={{
                                  position: 'absolute',
                                  top: '2px',
                                  left: willSignDocument ? '26px' : '2px',
                                  width: '20px',
                                  height: '20px',
                                  backgroundColor: 'white',
                                  borderRadius: '50%',
                                  transition: 'left 0.3s ease',
                                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)'
                                }} />
                              </div>
                            </div>
                          </div>

                          {/* Sección de usuarios disponibles */}
                          <div className="available-signers-section">
                            <h3 className="section-label">Usuarios disponibles</h3>

                            {/* Buscador con autocomplete */}
                            <div className="search-wrapper">
                              <svg className="search-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <input
                                type="text"
                                className="search-input-modern"
                                placeholder="Buscar por nombre o correo"
                                value={searchTermUpload}
                                onChange={(e) => setSearchTermUpload(e.target.value)}
                                disabled={uploading}
                              />
                              {searchTermUpload && (
                                <button
                                  className="search-clear-modern"
                                  onClick={() => setSearchTermUpload('')}
                                  type="button"
                                  aria-label="Limpiar búsqueda"
                                >
                                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </button>
                              )}

                              {/* Dropdown de resultados - solo se muestra cuando hay búsqueda */}
                              {searchTermUpload && searchTermUpload.trim().length > 0 && (
                                <div className="autocomplete-dropdown">
                                  {(() => {
                                    const filteredSigners = getFilteredSignersForUpload().filter(
                                      s => !selectedSigners.some(ss =>
                                        typeof ss === 'object' ? ss.userId === s.id : ss === s.id
                                      )
                                    );

                                    if (filteredSigners.length === 0) {
                                      return (
                                        <div className="dropdown-empty">
                                          <p>No se encontraron resultados para "{searchTermUpload}"</p>
                                        </div>
                                      );
                                    }

                                    return filteredSigners.map(signer => (
                                      <div
                                        key={signer.id}
                                        className="dropdown-item"
                                        onClick={() => {
                                          if (!uploading) {
                                            toggleSigner(signer.id);
                                            setSearchTermUpload(''); // Limpiar búsqueda después de agregar
                                          }
                                        }}
                                      >
                                        <div className="signer-avatar-circle">
                                          {getInitials(signer.name, signer.email)}
                                        </div>
                                        <div className="signer-info-modern">
                                          <p className="signer-name-modern">
                                            {signer.name}
                                            {user && user.id === signer.id && (
                                              <span className="you-tag">Tú</span>
                                            )}
                                          </p>
                                          <p className="signer-email-modern">{signer.email}</p>
                                        </div>
                                        <div className="add-indicator">
                                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                          </svg>
                                        </div>
                                      </div>
                                    ));
                                  })()}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Sección de firmantes seleccionados */}
                          {selectedSigners.length > 0 && (
                            <div className="selected-signers-section">
                              <div className="selected-header">
                                <h3 className="section-label">Firmantes seleccionados</h3>
                                <span className="signers-count">
                                  {selectedSigners.length} {selectedSigners.length === 1 ? 'firmante' : 'firmantes'}
                                </span>
                              </div>

                              <div className="selected-signers-container">
                                {selectedSigners.map((signerItem, index) => {
                                  const signerId = typeof signerItem === 'object' ? signerItem.userId : signerItem;
                                  const signer = availableSigners.find(s => s.id === signerId);
                                  if (!signer) return null;

                                  const isCurrentUser = user && user.id === signerId;
                                  const canDrag = !uploading && !isCurrentUser;

                                  return (
                                    <div
                                      key={signerId}
                                      className={`selected-signer-card ${draggedSignerIndex === index ? 'dragging' : ''} ${dragOverSignerIndex === index && draggedSignerIndex !== index ? 'drag-over' : ''} ${isCurrentUser ? 'locked' : ''}`}
                                      draggable={canDrag}
                                      onDragStart={(e) => handleDragStartSigner(e, index)}
                                      onDragOver={(e) => handleDragOverSigner(e, index)}
                                      onDrop={(e) => handleDropSigner(e, index)}
                                      onDragEnd={handleDragEndSigner}
                                    >
                                      <div className="signer-order-badge">
                                        {index + 1}
                                      </div>

                                      <div className="signer-avatar-circle">
                                        {getInitials(signer.name, signer.email)}
                                      </div>

                                      <div className="signer-info-modern flex-grow">
                                        <p className="signer-name-modern">
                                          {signer.name}
                                          {(() => {
                                            const signerObj = selectedSigners.find(s =>
                                              typeof s === 'object' ? s.userId === signerId : s === signerId
                                            );

                                            // Soportar múltiples roles para FV
                                            if (typeof signerObj === 'object' && signerObj.roleNames && signerObj.roleNames.length > 0) {
                                              const rolesText = signerObj.roleNames.join(' / ');
                                              return (
                                                <span style={{ fontWeight: '400', color: '#374151' }}> - {rolesText}</span>
                                              );
                                            }

                                            // Fallback a rol singular para SA
                                            const roleName = typeof signerObj === 'object' ? signerObj.roleName : null;
                                            return roleName ? (
                                              <span style={{ fontWeight: '400', color: '#374151' }}> - {roleName}</span>
                                            ) : null;
                                          })()}
                                          {isCurrentUser && <span className="you-tag">Tú</span>}
                                        </p>
                                        <p className="signer-email-modern">{signer.email}</p>
                                      </div>

                                      {/* Selector de rol cuando hay tipo de documento - Botón dropdown */}
                                      {selectedDocumentType && documentTypeRoles.length > 0 && (
                                        <button
                                          type="button"
                                          className="role-dropdown-btn"
                                          onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();

                                            if (openRoleDropdown === signerId) {
                                              // Cerrar si ya está abierto
                                              setOpenRoleDropdown(null);
                                            } else {
                                              // Calcular posición y abrir
                                              const rect = e.currentTarget.getBoundingClientRect();
                                              setRoleDropdownPosition({
                                                top: rect.bottom + 4,
                                                left: rect.right - 240
                                              });
                                              setOpenRoleDropdown(signerId);
                                            }
                                          }}
                                          disabled={uploading}
                                            style={{
                                              padding: '0.5rem',
                                              border: '1px solid #d1d5db',
                                              borderRadius: '0.375rem',
                                              backgroundColor: 'white',
                                              cursor: 'pointer',
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              transition: 'all 0.15s',
                                              width: '36px',
                                              height: '36px',
                                              pointerEvents: 'auto',
                                              position: 'relative',
                                              zIndex: 10
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                                          >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ color: '#6b7280', pointerEvents: 'none' }}>
                                              <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                            </svg>
                                          </button>
                                      )}

                                      <button
                                        type="button"
                                        className="remove-btn-modern"
                                        onClick={() => removeSignerFromSelected(signerId)}
                                        disabled={uploading}
                                        title="Quitar firmante"
                                        aria-label={`Quitar a ${signer.name}`}
                                      >
                                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>

                              <div className="info-box-modern">
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <p>Los firmantes deben firmar en orden secuencial según el número asignado.</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Paso 2: Enviar documento */}
                  {activeStep === 2 && (
                    <>
                      <div className="zapsign-section">
                        <h3 className="section-question">Resumen del envío</h3>

                        <div className="summary-card">
                          {/* 1. Título */}
                          {documentTitle && (
                            <div className="summary-item">
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="summary-icon">
                                <path d="M7 8H17M7 12H17M7 16H12M3 6C3 4.89543 3.89543 4 5 4H19C20.1046 4 21 4.89543 21 6V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18V6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <div>
                                <h4>Título</h4>
                                <p>{documentTitle}</p>
                              </div>
                            </div>
                          )}

                          {/* 2. Tipo de documento */}
                          {selectedDocumentType && (
                            <div className="summary-item">
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="summary-icon">
                                <path d="M7 21H17C18.1046 21 19 20.1046 19 19V9.41421C19 9.149 18.8946 8.89464 18.7071 8.70711L13.2929 3.29289C13.1054 3.10536 12.851 3 12.5858 3H7C5.89543 3 5 3.89543 5 5V19C5 20.1046 5.89543 21 7 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M9 7H10M9 11H15M9 15H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                              <div>
                                <h4>Tipo de documento</h4>
                                <p>{selectedDocumentType.name}</p>
                              </div>
                            </div>
                          )}

                          {/* 3. Firmantes */}
                          <div className="summary-item">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="summary-icon">
                              <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.3503 17.623 3.8507 18.1676 4.55231C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45769C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <div>
                              <h4>Firmantes</h4>
                              <p>{selectedSigners?.length || 0} persona{(selectedSigners?.length || 0) !== 1 ? 's' : ''} seleccionada{(selectedSigners?.length || 0) !== 1 ? 's' : ''}</p>
                            </div>
                          </div>

                          {/* 4. Documentos */}
                          <div className="summary-item">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="summary-icon">
                              <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <div>
                              <h4>Documentos</h4>
                              <p>{selectedFiles?.length || 0} archivo{(selectedFiles?.length || 0) !== 1 ? 's' : ''} seleccionado{(selectedFiles?.length || 0) !== 1 ? 's' : ''}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                </form>

                {/* Footer con botones de navegación */}
                <div className="form-footer">
                  <button
                    type="button"
                    className="footer-btn-back"
                    disabled={activeStep === 0}
                    onClick={handleBack}
                  >
                    Atrás
                  </button>

                  {activeStep < steps.length - 1 ? (
                    <button
                      type="button"
                      className="footer-btn-continue"
                      onClick={handleNext}
                      disabled={!canProceedToNextStep()}
                    >
                      Continuar
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="footer-btn-continue"
                      onClick={handleUpload}
                      disabled={uploading || !canProceedToNextStep()}
                    >
                      {uploading ? 'Enviando...' : 'Enviar Documento'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Pending Documents Section - Minimal */}
          {activeTab === 'pending' && (
            <div className="section my-documents-section-clean">
              <div className="section-header-minimal">
                <div>
                  <h2 className="section-title-minimal">Pendientes de Firma</h2>
                  <p className="section-subtitle-minimal">
                    {(() => {
                      const filteredCount = pendingDocuments.filter(doc => {
                        const matchesSearch = doc.title.toLowerCase().includes(pendingDocsSearchTerm.toLowerCase());
                        const matchesType = pendingDocsTypeFilter.length === 0 ||
                          pendingDocsTypeFilter.includes(doc.documentType?.code) ||
                          (pendingDocsTypeFilter.includes('NONE') && !doc.documentType?.code);
                        return matchesSearch && matchesType;
                      }).length;
                      return `${filteredCount} documento${filteredCount !== 1 ? 's' : ''} esperando tu firma`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Filtros */}
              {pendingDocuments.length > 0 && (
                <div className="my-docs-filters">
                  <div className="filter-search">
                    <svg className="search-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <input
                      type="text"
                      className="filter-search-input"
                      placeholder="Buscar por nombre de documento..."
                      value={pendingDocsSearchTerm}
                      onChange={(e) => setPendingDocsSearchTerm(e.target.value)}
                    />
                    {pendingDocsSearchTerm && (
                      <button
                        className="clear-search-btn"
                        onClick={() => setPendingDocsSearchTerm('')}
                        title="Limpiar búsqueda"
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Botón de filtro por tipo de documento */}
                  <div style={{ position: 'relative' }}>
                    <button
                      className={`filter-type-btn ${pendingDocsTypeFilter.length > 0 ? 'active' : ''}`}
                      onClick={() => setShowTypeFilterDropdown(showTypeFilterDropdown === 'pending' ? null : 'pending')}
                      title="Filtrar por tipo de documento"
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 12H18M3 6H21M9 18H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    {/* Dropdown de filtros */}
                    {showTypeFilterDropdown === 'pending' && (
                      <div className="type-filter-dropdown">
                        <div className="type-filter-header">
                          <span>Tipo de documento</span>
                          {pendingDocsTypeFilter.length > 0 && (
                            <button
                              className="clear-all-filters-btn"
                              onClick={() => setPendingDocsTypeFilter([])}
                            >
                              Limpiar
                            </button>
                          )}
                        </div>
                        <div className="type-filter-options">
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={pendingDocsTypeFilter.includes('NONE')}
                              onChange={() => toggleDocTypeFilter('pending', 'NONE')}
                            />
                            <span>Sin tipo específico</span>
                          </label>
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={pendingDocsTypeFilter.includes('SA')}
                              onChange={() => toggleDocTypeFilter('pending', 'SA')}
                            />
                            <span>Solicitudes de Anticipo</span>
                          </label>
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={pendingDocsTypeFilter.includes('FV')}
                              onChange={() => toggleDocTypeFilter('pending', 'FV')}
                            />
                            <span>Legalización de Facturas</span>
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {loadingPending ? (
                <div className="loading-state-minimal">
                  <Loader size="medium" />
                  <p>Cargando documentos...</p>
                </div>
              ) : pendingDocuments.length === 0 ? (
                <div className="empty-state-minimal">
                  <div className="empty-icon-minimal">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3 className="empty-title-minimal">No hay documentos pendientes</h3>
                  <p className="empty-text-minimal">Todos tus documentos han sido firmados</p>
                </div>
              ) : (
                (() => {
                  // Filtrar documentos por búsqueda y tipo
                  const filteredDocs = pendingDocuments.filter(doc => {
                    const matchesSearch = doc.title.toLowerCase().includes(pendingDocsSearchTerm.toLowerCase());
                    const matchesType = pendingDocsTypeFilter.length === 0 ||
                      pendingDocsTypeFilter.includes(doc.documentType?.code) ||
                      (pendingDocsTypeFilter.includes('NONE') && !doc.documentType?.code);
                    return matchesSearch && matchesType;
                  });

                  if (filteredDocs.length === 0) {
                    return (
                      <div className="empty-state-minimal">
                        <div className="empty-icon-minimal">
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <h3 className="empty-title-minimal">No se encontraron documentos</h3>
                        <p className="empty-text-minimal">
                          No hay documentos que coincidan con "{pendingDocsSearchTerm}"
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="my-docs-grid-clean">
                      {filteredDocs.map((doc) => {
                    const getStatusConfig = (status, signatures = []) => {
                      const hasRejection = signatures.some(sig => sig.status === 'rejected');
                      const allSigned = signatures.length > 0 && signatures.every(sig => sig.status === 'signed');

                      if (hasRejection) {
                        return { label: 'Rechazado', color: '#991B1B', bg: '#FEE2E2' };
                      } else if (allSigned) {
                        return { label: 'Firmado', color: '#065F46', bg: '#D1FAE5' };
                      } else {
                        return { label: 'En curso', color: '#92400E', bg: '#FEF3C7' };
                      }
                    };

                    const signatures = doc.signatures || [];
                    const statusConfig = getStatusConfig(doc.status, signatures);

                    return (
                      <div key={doc.id} className="my-doc-card-reference">
                        <div className="doc-content-wrapper">
                          <div className="doc-header-row">
                            <h3 className="doc-title-reference">{doc.title}</h3>
                            <div
                              className="status-badge-clean"
                              style={{
                                color: statusConfig.color,
                                backgroundColor: statusConfig.bg,
                                cursor: statusConfig.label === 'Rechazado' && signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason) ? 'pointer' : 'default',
                                transition: 'all 0.2s ease'
                              }}
                              onClick={() => {
                                if (statusConfig.label === 'Rechazado') {
                                  const rejectedSignature = signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason);
                                  if (rejectedSignature) {
                                    setRejectionReasonPopup({
                                      title: doc.title,
                                      rejectedBy: rejectedSignature.signer?.name || rejectedSignature.signer?.email,
                                      reason: rejectedSignature.rejectionReason,
                                      rejectedAt: rejectedSignature.rejectedAt
                                    });
                                  }
                                }
                              }}
                              onMouseEnter={(e) => {
                                if (statusConfig.label === 'Rechazado' && signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason)) {
                                  e.target.style.opacity = '0.8';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (statusConfig.label === 'Rechazado') {
                                  e.target.style.opacity = '1';
                                }
                              }}
                              title={statusConfig.label === 'Rechazado' && signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason) ? 'Ver razón del rechazo' : ''}
                            >
                              {statusConfig.label}
                            </div>
                          </div>

                          <div className="doc-meta-row">
                            <span className="doc-created-text">
                              Creado el {formatDateTime(doc.createdAt)} por {doc.uploadedBy?.name || doc.uploadedBy?.email || 'Desconocido'}
                            </span>
                          </div>

                          

                          <div className="doc-signers-row">
                            {(expandedSigners[doc.id] ? signatures : signatures.slice(0, 3)).map((sig) => {
                              const getSignerStatusColor = (status) => {
                                if (status === 'signed') return '#10B981';
                                if (status === 'rejected') return '#EF4444';
                                return '#F59E0B';
                              };

                              const getSignerStatusText = (status) => {
                                if (status === 'signed') return 'Firmado';
                                if (status === 'rejected') return 'Rechazado';
                                return 'Pendiente';
                              };

                              return (
                                <div key={sig.id} className="signer-item-horizontal" title={getSignerStatusText(sig.status)}>
                                  <span
                                    className="signer-dot"
                                    style={{ backgroundColor: getSignerStatusColor(sig.status) }}
                                  ></span>
                                  <span className="signer-name">
                                    {sig.signer?.name || sig.signer?.email}
                                    {sig.roleName && <span style={{ fontWeight: '400', color: '#6B7280' }}> - {sig.roleName}</span>}
                                  </span>
                                </div>
                              );
                            })}
                            {signatures.length > 3 && (
                              <button
                                className="btn-ver-todos"
                                onClick={() => setExpandedSigners({
                                  ...expandedSigners,
                                  [doc.id]: !expandedSigners[doc.id]
                                })}
                              >
                                {expandedSigners[doc.id] ? '- ver menos' : '+ ver todos'}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="doc-actions-clean">
                          <button
                            className="btn-action-clean"
                            onClick={async () => {
                              // Hacer query para obtener información de firmantes con orderPosition
                              try {
                                const token = localStorage.getItem('token');
                                const response = await axios.post(
                                  API_URL,
                                  {
                                    query: `
                                      query GetDocumentSigners($documentId: ID!) {
                                        documentSigners(documentId: $documentId) {
                                          userId
                                          orderPosition
                                          signature {
                                            status
                                          }
                                        }
                                      }
                                    `,
                                    variables: { documentId: doc.id }
                                  },
                                  {
                                    headers: {
                                      'Authorization': `Bearer ${token}`,
                                      'Content-Type': 'application/json',
                                    },
                                  }
                                );

                                const signers = response.data?.data?.documentSigners || [];
                                const currentUserSigner = signers.find(s => s.userId === user.id);
                                let isWaiting = false;

                                if (currentUserSigner && currentUserSigner.signature?.status === 'pending') {
                                  const previousSigners = signers.filter(
                                    s => s.orderPosition < currentUserSigner.orderPosition
                                  );
                                  const allPreviousSigned = previousSigners.every(
                                    s => s.signature && s.signature.status === 'signed'
                                  );
                                  isWaiting = !allPreviousSigned;
                                }

                                handleViewDocument(doc, true, isWaiting);
                              } catch (error) {
                                console.error('Error al verificar orden de firma:', error);
                                // Si hay error, abrir el documento de todos modos
                                handleViewDocument(doc, true, false);
                              }
                            }}
                            title="Ver documento"
                            style={{marginTop: '-1.5vw'}}
                          >
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                  );
                })()
              )}
            </div>
          )}

          {/* Signed Documents Section - Minimal */}
          {activeTab === 'signed' && (
            <div className="section my-documents-section-clean">
              <div className="section-header-minimal">
                <div>
                  <h2 className="section-title-minimal">Documentos Firmados</h2>
                  <p className="section-subtitle-minimal">
                    {(() => {
                      const filteredCount = signedDocuments.filter(doc => {
                        const matchesSearch = doc.title.toLowerCase().includes(signedDocsSearchTerm.toLowerCase());
                        const matchesStatus = signedDocsStatusFilter === 'all' ||
                                             (signedDocsStatusFilter === 'pending' && (doc.status === 'pending' || doc.status === 'in_progress')) ||
                                             doc.status === signedDocsStatusFilter;
                        const matchesType = signedDocsTypeFilter.length === 0 ||
                          signedDocsTypeFilter.includes(doc.documentType?.code) ||
                          (signedDocsTypeFilter.includes('NONE') && !doc.documentType?.code);
                        return matchesSearch && matchesStatus && matchesType;
                      }).length;
                      return `${filteredCount} documento${filteredCount !== 1 ? 's' : ''}`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Filtros */}
              {signedDocuments.length > 0 && (
                <div className="my-docs-filters">
                  <div className="filter-search">
                    <svg className="search-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <input
                      type="text"
                      className="filter-search-input"
                      placeholder="Buscar por nombre de documento..."
                      value={signedDocsSearchTerm}
                      onChange={(e) => setSignedDocsSearchTerm(e.target.value)}
                    />
                    {signedDocsSearchTerm && (
                      <button
                        className="clear-search-btn"
                        onClick={() => setSignedDocsSearchTerm('')}
                        title="Limpiar búsqueda"
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="filter-status-group">
                    <button
                      className={`filter-status-btn ${signedDocsStatusFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setSignedDocsStatusFilter('all')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Todos
                    </button>
                    <button
                      className={`filter-status-btn filter-status-btn-completed ${signedDocsStatusFilter === 'completed' ? 'active' : ''}`}
                      onClick={() => setSignedDocsStatusFilter('completed')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Firmados
                    </button>
                    <button
                      className={`filter-status-btn filter-status-btn-pending ${signedDocsStatusFilter === 'pending' ? 'active' : ''}`}
                      onClick={() => setSignedDocsStatusFilter('pending')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      En curso
                    </button>

                    {/* Botón de filtro por tipo de documento */}
                    <div style={{ position: 'relative' }}>
                      <button
                        className={`filter-type-btn ${signedDocsTypeFilter.length > 0 ? 'active' : ''}`}
                        onClick={() => setShowTypeFilterDropdown(showTypeFilterDropdown === 'signed' ? null : 'signed')}
                        title="Filtrar por tipo de documento"
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6 12H18M3 6H21M9 18H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>

                      {/* Dropdown de filtros */}
                      {showTypeFilterDropdown === 'signed' && (
                      <div className="type-filter-dropdown">
                        <div className="type-filter-header">
                          <span>Tipo de documento</span>
                          {signedDocsTypeFilter.length > 0 && (
                            <button
                              className="clear-all-filters-btn"
                              onClick={() => setSignedDocsTypeFilter([])}
                            >
                              Limpiar
                            </button>
                          )}
                        </div>
                        <div className="type-filter-options">
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={signedDocsTypeFilter.includes('NONE')}
                              onChange={() => toggleDocTypeFilter('signed', 'NONE')}
                            />
                            <span>Sin tipo específico</span>
                          </label>
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={signedDocsTypeFilter.includes('SA')}
                              onChange={() => toggleDocTypeFilter('signed', 'SA')}
                            />
                            <span>Solicitudes de Anticipo</span>
                          </label>
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={signedDocsTypeFilter.includes('FV')}
                              onChange={() => toggleDocTypeFilter('signed', 'FV')}
                            />
                            <span>Legalización de Facturas</span>
                          </label>
                        </div>
                      </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {loadingSigned ? (
                <div className="loading-state-minimal">
                  <Loader size="medium" />
                  <p>Cargando documentos...</p>
                </div>
              ) : signedDocuments.length === 0 ? (
                <div className="empty-state-minimal">
                  <div className="empty-icon-minimal">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3 className="empty-title-minimal">No hay documentos firmados</h3>
                  <p className="empty-text-minimal">Los documentos que firmes aparecerán aquí</p>
                </div>
              ) : (
                (() => {
                  // Filtrar documentos
                  const filteredDocs = signedDocuments.filter(doc => {
                    // Filtro por búsqueda de texto
                    const matchesSearch = doc.title.toLowerCase().includes(signedDocsSearchTerm.toLowerCase());

                    // Filtro por estado
                    const matchesStatus = signedDocsStatusFilter === 'all' ||
                                         (signedDocsStatusFilter === 'pending' && (doc.status === 'pending' || doc.status === 'in_progress')) ||
                                         doc.status === signedDocsStatusFilter;

                    // Filtro por tipo de documento
                    const matchesType = signedDocsTypeFilter.length === 0 ||
                      signedDocsTypeFilter.includes(doc.documentType?.code) ||
                      (signedDocsTypeFilter.includes('NONE') && !doc.documentType?.code);

                    return matchesSearch && matchesStatus && matchesType;
                  });

                  // Si no hay resultados después del filtrado
                  if (filteredDocs.length === 0) {
                    return (
                      <div className="empty-state-minimal">
                        <div className="empty-icon-minimal">
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <h3 className="empty-title-minimal">No se encontraron documentos</h3>
                        <p className="empty-text-minimal">
                          {signedDocsSearchTerm
                            ? `No hay documentos que coincidan con "${signedDocsSearchTerm}"`
                            : 'No hay documentos con el estado seleccionado'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="my-docs-grid-clean">
                      {filteredDocs.map((doc) => {
                    const getStatusConfig = (status) => {
                      const statusMap = {
                        pending: { label: 'En curso', color: '#92400E', bg: '#FEF3C7' },
                        in_progress: { label: 'En curso', color: '#92400E', bg: '#FEF3C7' },
                        completed: { label: 'Firmado', color: '#065F46', bg: '#D1FAE5'},
                        rejected: { label: 'Rechazado', color: '#991B1B', bg: '#FEE2E2' }
                      };
                      return statusMap[status] || statusMap.completed;
                    };

                    const statusConfig = getStatusConfig(doc.status);
                    const signatures = doc.signatures || [];

                    return (
                      <div key={doc.id} className="my-doc-card-reference">
                        <div className="doc-content-wrapper">
                          <div className="doc-header-row">
                            <h3 className="doc-title-reference">{doc.title}</h3>
                            <div
                              className="status-badge-clean"
                              style={{
                                color: statusConfig.color,
                                backgroundColor: statusConfig.bg,
                                cursor: statusConfig.label === 'Rechazado' && signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason) ? 'pointer' : 'default',
                                transition: 'all 0.2s ease'
                              }}
                              onClick={() => {
                                if (statusConfig.label === 'Rechazado') {
                                  const rejectedSignature = signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason);
                                  if (rejectedSignature) {
                                    setRejectionReasonPopup({
                                      title: doc.title,
                                      rejectedBy: rejectedSignature.signer?.name || rejectedSignature.signer?.email,
                                      reason: rejectedSignature.rejectionReason,
                                      rejectedAt: rejectedSignature.rejectedAt
                                    });
                                  }
                                }
                              }}
                              onMouseEnter={(e) => {
                                if (statusConfig.label === 'Rechazado' && signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason)) {
                                  e.target.style.opacity = '0.8';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (statusConfig.label === 'Rechazado') {
                                  e.target.style.opacity = '1';
                                }
                              }}
                              title={statusConfig.label === 'Rechazado' && signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason) ? 'Ver razón del rechazo' : ''}
                            >
                              {statusConfig.label}
                            </div>
                          </div>

                          <div className="doc-meta-row">
                            <span className="doc-created-text">
                              Creado el {formatDateTime(doc.createdAt)} por {doc.uploadedBy?.name || doc.uploadedBy?.email || 'Desconocido'}
                            </span>
                          </div>

                          

                          <div className="doc-signers-row">
                            {(expandedSigners[doc.id] ? signatures : signatures.slice(0, 3)).map((sig) => {
                              const getSignerStatusColor = (status) => {
                                if (status === 'signed') return '#10B981';
                                if (status === 'rejected') return '#EF4444';
                                return '#F59E0B';
                              };

                              const getSignerStatusText = (status) => {
                                if (status === 'signed') return 'Firmado';
                                if (status === 'rejected') return 'Rechazado';
                                return 'Pendiente';
                              };

                              return (
                                <div key={sig.id} className="signer-item-horizontal" title={getSignerStatusText(sig.status)}>
                                  <span
                                    className="signer-dot"
                                    style={{ backgroundColor: getSignerStatusColor(sig.status) }}
                                  ></span>
                                  <span className="signer-name">
                                    {sig.signer?.name || sig.signer?.email}
                                    {sig.roleName && <span style={{ fontWeight: '400', color: '#6B7280' }}> - {sig.roleName}</span>}
                                  </span>
                                </div>
                              );
                            })}
                            {signatures.length > 3 && (
                              <button
                                className="btn-ver-todos"
                                onClick={() => setExpandedSigners({
                                  ...expandedSigners,
                                  [doc.id]: !expandedSigners[doc.id]
                                })}
                              >
                                {expandedSigners[doc.id] ? '- ver menos' : '+ ver todos'}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="doc-actions-clean">
                          <button
                            className="btn-action-clean"
                            onClick={() => handleViewDocument(doc)}
                            title="Ver documento"
                            style={{marginTop: '-1.5vw'}}
                          >
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                  );
                })()
              )}
            </div>
          )}

          {/* My Documents Section - Rediseñado */}
          {activeTab === 'my-documents' && (
            <div className="section my-documents-section-clean">
              <div className="section-header-minimal">
                <div>
                  <h2 className="section-title-minimal">Mis Documentos</h2>
                  <p className="section-subtitle-minimal">
                    {(() => {
                      const filteredCount = myDocuments.filter(doc => {
                        const matchesSearch = doc.title.toLowerCase().includes(myDocsSearchTerm.toLowerCase());
                        const matchesStatus = myDocsStatusFilter === 'all' ||
                                             (myDocsStatusFilter === 'pending' && (doc.status === 'pending' || doc.status === 'in_progress')) ||
                                             doc.status === myDocsStatusFilter;
                        const matchesType = myDocsTypeFilter.length === 0 ||
                          myDocsTypeFilter.includes(doc.documentType?.code) ||
                          (myDocsTypeFilter.includes('NONE') && !doc.documentType?.code);
                        return matchesSearch && matchesStatus && matchesType;
                      }).length;
                      return (
                        <>
                          <CountUp
                            from={0}
                            to={filteredCount}
                            duration={0.8}
                            direction="up"
                          />
                          {` documento${filteredCount !== 1 ? 's' : ''}`}
                        </>
                      );
                    })()}
                  </p>
                </div>
              </div>

              {/* Filtros */}
              {myDocuments.length > 0 && (
                <div className="my-docs-filters">
                  <div className="filter-search">
                    <svg className="search-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <input
                      type="text"
                      className="filter-search-input"
                      placeholder="Buscar por nombre de documento..."
                      value={myDocsSearchTerm}
                      onChange={(e) => setMyDocsSearchTerm(e.target.value)}
                    />
                    {myDocsSearchTerm && (
                      <button
                        className="clear-search-btn"
                        onClick={() => setMyDocsSearchTerm('')}
                        title="Limpiar búsqueda"
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="filter-status-group">
                    <button
                      className={`filter-status-btn ${myDocsStatusFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setMyDocsStatusFilter('all')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Todos
                    </button>
                    <button
                      className={`filter-status-btn filter-status-btn-completed ${myDocsStatusFilter === 'completed' ? 'active' : ''}`}
                      onClick={() => setMyDocsStatusFilter('completed')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12 C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Firmados
                    </button>
                    <button
                      className={`filter-status-btn filter-status-btn-pending ${myDocsStatusFilter === 'pending' ? 'active' : ''}`}
                      onClick={() => setMyDocsStatusFilter('pending')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      En curso
                    </button>
                    <button
                      className={`filter-status-btn filter-status-btn-rejected ${myDocsStatusFilter === 'rejected' ? 'active' : ''}`}
                      onClick={() => setMyDocsStatusFilter('rejected')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Rechazados
                    </button>

                    {/* Botón de filtro por tipo de documento */}
                    <div style={{ position: 'relative' }}>
                      <button
                        className={`filter-type-btn ${myDocsTypeFilter.length > 0 ? 'active' : ''}`}
                        onClick={() => setShowTypeFilterDropdown(showTypeFilterDropdown === 'my' ? null : 'my')}
                        title="Filtrar por tipo de documento"
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6 12H18M3 6H21M9 18H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>

                      {/* Dropdown de filtros */}
                      {showTypeFilterDropdown === 'my' && (
                      <div className="type-filter-dropdown">
                        <div className="type-filter-header">
                          <span>Tipo de documento</span>
                          {myDocsTypeFilter.length > 0 && (
                            <button
                              className="clear-all-filters-btn"
                              onClick={() => setMyDocsTypeFilter([])}
                            >
                              Limpiar
                            </button>
                          )}
                        </div>
                        <div className="type-filter-options">
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={myDocsTypeFilter.includes('NONE')}
                              onChange={() => toggleDocTypeFilter('my', 'NONE')}
                            />
                            <span>Sin tipo específico</span>
                          </label>
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={myDocsTypeFilter.includes('SA')}
                              onChange={() => toggleDocTypeFilter('my', 'SA')}
                            />
                            <span>Solicitudes de Anticipo</span>
                          </label>
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={myDocsTypeFilter.includes('FV')}
                              onChange={() => toggleDocTypeFilter('my', 'FV')}
                            />
                            <span>Legalización de Facturas</span>
                          </label>
                        </div>
                      </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {loadingMy ? (
                <div className="loading-state-minimal">
                  <Loader size="medium" />
                  <p>Cargando documentos...</p>
                </div>
              ) : myDocuments.length === 0 ? (
                <div className="empty-state-minimal">
                  <div className="empty-icon-minimal">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3 className="empty-title-minimal">No tienes documentos</h3>
                  <p className="empty-text-minimal">Comienza subiendo tu primer documento</p>
                </div>
              ) : (
                <>
                  {(() => {
                    // Filtrar documentos
                    const filteredDocs = myDocuments.filter(doc => {
                      // Filtro por búsqueda de texto
                      const matchesSearch = doc.title.toLowerCase().includes(myDocsSearchTerm.toLowerCase());

                      // Filtro por estado
                      const matchesStatus = myDocsStatusFilter === 'all' ||
                                           (myDocsStatusFilter === 'pending' && (doc.status === 'pending' || doc.status === 'in_progress')) ||
                                           doc.status === myDocsStatusFilter;

                      // Filtro por tipo de documento
                      const matchesType = myDocsTypeFilter.length === 0 ||
                        myDocsTypeFilter.includes(doc.documentType?.code) ||
                        (myDocsTypeFilter.includes('NONE') && !doc.documentType?.code);

                      return matchesSearch && matchesStatus && matchesType;
                    });

                    // Si no hay resultados después del filtrado
                    if (filteredDocs.length === 0) {
                      return (
                        <div className="empty-state-minimal">
                          <div className="empty-icon-minimal">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </div>
                          <h3 className="empty-title-minimal">No se encontraron documentos</h3>
                          <p className="empty-text-minimal">
                            {myDocsSearchTerm
                              ? `No hay documentos que coincidan con "${myDocsSearchTerm}"`
                              : 'No hay documentos con el estado seleccionado'}
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="my-docs-grid-clean">
                        {filteredDocs.map((doc) => {
                      const getStatusConfig = (status) => {
                        const statusMap = {
                          pending: { label: 'En curso', color: '#92400E', bg: '#FEF3C7' },
                          in_progress: { label: 'En curso', color: '#92400E', bg: '#FEF3C7' },
                          completed: { label: 'Firmado', color: '#065F46', bg: '#D1FAE5'},
                          rejected: { label: 'Rechazado', color: '#991B1B', bg: '#FEE2E2' },
                          archived: { label: 'Archivado', color: '#374151', bg: '#F3F4F6' }
                        };
                        return statusMap[status] || statusMap.pending;
                      };

                      const statusConfig = getStatusConfig(doc.status);
                      const signatures = doc.signatures || [];

                      return (
                        <div key={doc.id} className="my-doc-card-reference">
                          {/* Layout completo: título arriba, fecha abajo, firmantes horizontales */}
                          <div className="doc-content-wrapper">
                            <div className="doc-header-row">
                              <h3 className="doc-title-reference">{doc.title}</h3>

                              <div
                                className="status-badge-clean"
                                style={{
                                  color: statusConfig.color,
                                  backgroundColor: statusConfig.bg,
                                  cursor: statusConfig.label === 'Rechazado' && signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason) ? 'pointer' : 'default',
                                  transition: 'all 0.2s ease'
                                }}
                                onClick={() => {
                                  if (statusConfig.label === 'Rechazado') {
                                    const rejectedSignature = signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason);
                                    if (rejectedSignature) {
                                      setRejectionReasonPopup({
                                        title: doc.title,
                                        rejectedBy: rejectedSignature.signer?.name || rejectedSignature.signer?.email,
                                        reason: rejectedSignature.rejectionReason,
                                        rejectedAt: rejectedSignature.rejectedAt
                                      });
                                    }
                                  }
                                }}
                                onMouseEnter={(e) => {
                                  if (statusConfig.label === 'Rechazado' && signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason)) {
                                    e.target.style.opacity = '0.8';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (statusConfig.label === 'Rechazado') {
                                    e.target.style.opacity = '1';
                                  }
                                }}
                                title={statusConfig.label === 'Rechazado' && signatures.find(sig => sig.status === 'rejected' && sig.rejectionReason) ? 'Ver razón del rechazo' : ''}
                              >
                                {statusConfig.label}
                              </div>
                            </div>

                            <div className="doc-meta-row">
                              <span className="doc-created-text">Creado el {formatDateTime(doc.createdAt)}</span>
                            </div>

                            <div className="doc-signers-row">
                              {(expandedSigners[doc.id] ? signatures : signatures.slice(0, 3)).map((sig) => {
                                const getSignerStatusColor = (status) => {
                                  if (status === 'signed') return '#10B981';
                                  if (status === 'rejected') return '#EF4444';
                                  return '#F59E0B';
                                };

                                const getSignerStatusText = (status) => {
                                  if (status === 'signed') return 'Firmado';
                                  if (status === 'rejected') return 'Rechazado';
                                  return 'Pendiente';
                                };

                                return (
                                  <div key={sig.id} className="signer-item-horizontal" title={getSignerStatusText(sig.status)}>
                                    <span
                                      className="signer-dot"
                                      style={{ backgroundColor: getSignerStatusColor(sig.status) }}
                                    ></span>
                                    <span className="signer-name">
                                      {sig.signer.name || sig.signer.email}
                                      {sig.roleName && <span style={{ fontWeight: '400', color: '#6B7280' }}> - {sig.roleName}</span>}
                                    </span>
                                  </div>
                                );
                              })}
                              {signatures.length > 3 && (
                                <button
                                  className="btn-ver-todos"
                                  onClick={() => setExpandedSigners({
                                    ...expandedSigners,
                                    [doc.id]: !expandedSigners[doc.id]
                                  })}
                                >
                                  {expandedSigners[doc.id] ? '- ver menos' : '+ ver todos'}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Botones de acción */}
                          <div className="doc-actions-clean">
                            <button
                              className="btn-action-clean"
                              onClick={() => handleViewDocument(doc)}
                              title="Ver documento"
                              style={{marginTop: '-1.5vw'}}
                            >
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            <button
                              className={`btn-action-clean ${(doc.status === 'completed' || doc.status === 'rejected' || doc.documentType?.code === 'SA') ? 'disabled' : ''}`}
                              onClick={() => !(doc.status === 'completed' || doc.status === 'rejected' || doc.documentType?.code === 'SA') && handleManageSigners(doc)}
                              title={
                                doc.status === 'completed'
                                  ? 'El documento está completado, no se pueden agregar firmantes'
                                  : doc.status === 'rejected'
                                    ? 'El documento está rechazado, no se pueden modificar los firmantes'
                                    : doc.documentType?.code === 'SA'
                                      ? 'No se pueden modificar los firmantes de Solicitudes de Anticipo'
                                      : 'Gestionar firmantes'
                              }
                              style={{
                                marginTop: '-1.5vw',
                                opacity: (doc.status === 'completed' || doc.status === 'rejected' || doc.documentType?.code === 'SA') ? 0.5 : 1,
                                cursor: (doc.status === 'completed' || doc.status === 'rejected' || doc.documentType?.code === 'SA') ? 'not-allowed' : 'pointer'
                              }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45768C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                            <button
                              className="btn-action-clean"
                              onClick={() => handleDeleteDocument(doc.id, doc.title)}
                              title="Eliminar documento"
                              style={{marginTop: '-1.5vw'}}
                            >
                              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3 6H5H21M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                    );
                        })}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )}

          {/* Rejected Documents Section */}
          {activeTab === 'rejected' && (
            <div className="section my-documents-section-clean">
              <div className="section-header-minimal">
                <div>
                  <h2 className="section-title-minimal">Documentos Rechazados</h2>
                  <p className="section-subtitle-minimal">
                    {(() => {
                      const allRejected = [...rejectedByMe, ...rejectedByOthers];
                      const filteredCount = allRejected.filter(doc => {
                        const matchesSearch = doc.title.toLowerCase().includes(rejectedDocsSearchTerm.toLowerCase());
                        const matchesFilter = rejectedDocsFilter === 'all' ||
                                            (rejectedDocsFilter === 'byMe' && rejectedByMe.some(d => d.id === doc.id)) ||
                                            (rejectedDocsFilter === 'byOthers' && rejectedByOthers.some(d => d.id === doc.id));
                        const matchesType = rejectedDocsTypeFilter.length === 0 ||
                          rejectedDocsTypeFilter.includes(doc.documentType?.code) ||
                          (rejectedDocsTypeFilter.includes('NONE') && !doc.documentType?.code);
                        return matchesSearch && matchesFilter && matchesType;
                      }).length;
                      return `${filteredCount} documento${filteredCount !== 1 ? 's' : ''} rechazado${filteredCount !== 1 ? 's' : ''}`;
                    })()}
                  </p>
                </div>
              </div>

              {/* Filtros */}
              {(rejectedByMe.length > 0 || rejectedByOthers.length > 0) && (
                <div className="my-docs-filters">
                  <div className="filter-search">
                    <svg className="search-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <input
                      type="text"
                      className="filter-search-input"
                      placeholder="Buscar por nombre de documento..."
                      value={rejectedDocsSearchTerm}
                      onChange={(e) => setRejectedDocsSearchTerm(e.target.value)}
                    />
                    {rejectedDocsSearchTerm && (
                      <button
                        className="clear-search-btn"
                        onClick={() => setRejectedDocsSearchTerm('')}
                        title="Limpiar búsqueda"
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    )}
                  </div>

                  <div className="filter-status-group">
                    <button
                      className={`filter-status-btn ${rejectedDocsFilter === 'all' ? 'active' : ''}`}
                      onClick={() => setRejectedDocsFilter('all')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Todos
                    </button>
                    <button
                      className={`filter-status-btn filter-status-btn-rejected ${rejectedDocsFilter === 'byMe' ? 'active' : ''}`}
                      onClick={() => setRejectedDocsFilter('byMe')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Rechazados por mí
                    </button>
                    <button
                      className={`filter-status-btn filter-status-btn-rejected ${rejectedDocsFilter === 'byOthers' ? 'active' : ''}`}
                      onClick={() => setRejectedDocsFilter('byOthers')}
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M17 21V19C17 17.9391 16.5786 16.9217 15.8284 16.1716C15.0783 15.4214 14.0609 15 13 15H5C3.93913 15 2.92172 15.4214 2.17157 16.1716C1.42143 16.9217 1 17.9391 1 19V21M23 21V19C22.9993 18.1137 22.7044 17.2528 22.1614 16.5523C21.6184 15.8519 20.8581 15.3516 20 15.13M16 3.13C16.8604 3.35031 17.623 3.85071 18.1676 4.55232C18.7122 5.25392 19.0078 6.11683 19.0078 7.005C19.0078 7.89317 18.7122 8.75608 18.1676 9.45768C17.623 10.1593 16.8604 10.6597 16 10.88M13 7C13 9.20914 11.2091 11 9 11C6.79086 11 5 9.20914 5 7C5 4.79086 6.79086 3 9 3C11.2091 3 13 4.79086 13 7Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Rechazados por otros
                    </button>

                    {/* Botón de filtro por tipo de documento */}
                    <div style={{ position: 'relative' }}>
                      <button
                        className={`filter-type-btn ${rejectedDocsTypeFilter.length > 0 ? 'active' : ''}`}
                        onClick={() => setShowTypeFilterDropdown(showTypeFilterDropdown === 'rejected' ? null : 'rejected')}
                        title="Filtrar por tipo de documento"
                      >
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M6 12H18M3 6H21M9 18H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>

                      {/* Dropdown de filtros */}
                      {showTypeFilterDropdown === 'rejected' && (
                      <div className="type-filter-dropdown">
                        <div className="type-filter-header">
                          <span>Tipo de documento</span>
                          {rejectedDocsTypeFilter.length > 0 && (
                            <button
                              className="clear-all-filters-btn"
                              onClick={() => setRejectedDocsTypeFilter([])}
                            >
                              Limpiar
                            </button>
                          )}
                        </div>
                        <div className="type-filter-options">
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={rejectedDocsTypeFilter.includes('NONE')}
                              onChange={() => toggleDocTypeFilter('rejected', 'NONE')}
                            />
                            <span>Sin tipo específico</span>
                          </label>
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={rejectedDocsTypeFilter.includes('SA')}
                              onChange={() => toggleDocTypeFilter('rejected', 'SA')}
                            />
                            <span>Solicitudes de Anticipo</span>
                          </label>
                          <label className="type-filter-option">
                            <input
                              type="checkbox"
                              checked={rejectedDocsTypeFilter.includes('FV')}
                              onChange={() => toggleDocTypeFilter('rejected', 'FV')}
                            />
                            <span>Legalización de Facturas</span>
                          </label>
                        </div>
                      </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {loadingRejected ? (
                <div className="loading-state-minimal">
                  <Loader size="medium" />
                  <p>Cargando documentos rechazados...</p>
                </div>
              ) : (rejectedByMe.length === 0 && rejectedByOthers.length === 0) ? (
                <div className="empty-state-minimal">
                  <div className="empty-icon-minimal">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <h3 className="empty-title-minimal">No hay documentos rechazados</h3>
                  <p className="empty-text-minimal">No tienes documentos rechazados</p>
                </div>
              ) : (
                (() => {
                  // Combinar ambas listas y agregar una propiedad para identificar el origen
                  const allRejected = [
                    ...rejectedByMe.map(doc => ({ ...doc, rejectedBy: 'me' })),
                    ...rejectedByOthers.map(doc => ({ ...doc, rejectedBy: 'others' }))
                  ];

                  // Filtrar por búsqueda, filtro y tipo
                  const filteredDocs = allRejected.filter(doc => {
                    const matchesSearch = doc.title.toLowerCase().includes(rejectedDocsSearchTerm.toLowerCase());
                    const matchesFilter = rejectedDocsFilter === 'all' ||
                                        (rejectedDocsFilter === 'byMe' && doc.rejectedBy === 'me') ||
                                        (rejectedDocsFilter === 'byOthers' && doc.rejectedBy === 'others');
                    const matchesType = rejectedDocsTypeFilter.length === 0 ||
                      rejectedDocsTypeFilter.includes(doc.documentType?.code) ||
                      (rejectedDocsTypeFilter.includes('NONE') && !doc.documentType?.code);
                    return matchesSearch && matchesFilter && matchesType;
                  });

                  if (filteredDocs.length === 0) {
                    return (
                      <div className="empty-state-minimal">
                        <div className="empty-icon-minimal">
                          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                        <h3 className="empty-title-minimal">No se encontraron documentos</h3>
                        <p className="empty-text-minimal">
                          {rejectedDocsSearchTerm
                            ? `No hay documentos que coincidan con "${rejectedDocsSearchTerm}"`
                            : 'No hay documentos con el filtro seleccionado'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="my-docs-grid-clean">
                      {filteredDocs.map(doc => {
                        const rejection = doc.signatures?.find(sig => sig.status === 'rejected');
                        const isRejectedByMe = doc.rejectedBy === 'me';

                        const signatures = doc.signatures || [];

                        return (
                          <div key={doc.id} className="my-doc-card-reference">
                            <div className="doc-content-wrapper">
                              <div className="doc-header-row">
                                <h3 className="doc-title-reference">{doc.title}</h3>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {/* Badge clickeable para ver razón de rechazo */}
                                  <div
                                    className="status-badge-clean"
                                    style={{
                                      color: '#991B1B',
                                      backgroundColor: '#FEE2E2',
                                      cursor: rejection?.rejectionReason ? 'pointer' : 'default',
                                      transition: 'all 0.2s ease'
                                    }}
                                    onClick={() => {
                                      if (rejection?.rejectionReason) {
                                        setRejectionReasonPopup({
                                          title: doc.title,
                                          rejectedBy: isRejectedByMe ? 'Tú' : (rejection.signer?.name || rejection.signer?.email),
                                          reason: rejection.rejectionReason,
                                          rejectedAt: rejection.rejectedAt
                                        });
                                      }
                                    }}
                                    onMouseEnter={(e) => {
                                      if (rejection?.rejectionReason) {
                                        e.target.style.backgroundColor = '#FEE2E2';
                                        e.target.style.opacity = '0.8';
                                      }
                                    }}
                                    onMouseLeave={(e) => {
                                      if (rejection?.rejectionReason) {
                                        e.target.style.opacity = '1';
                                      }
                                    }}
                                    title={rejection?.rejectionReason ? 'Ver razón del rechazo' : ''}
                                  >
                                    Rechazado
                                  </div>
                                </div>
                              </div>

                              <div className="doc-meta-row">
                                <span className="doc-created-text">
                                  Creado el {formatDateTime(doc.createdAt)} por {doc.uploadedBy?.name || doc.uploadedBy?.email || 'Desconocido'}
                                </span>
                              </div>

                              <div className="doc-signers-row">
                                {(expandedSigners[doc.id] ? signatures : signatures.slice(0, 3)).map((sig) => {
                                  const getSignerStatusColor = (status) => {
                                    if (status === 'signed') return '#10B981';
                                    if (status === 'rejected') return '#EF4444';
                                    return '#F59E0B';
                                  };

                                  const getSignerStatusText = (status) => {
                                    if (status === 'signed') return 'Firmado';
                                    if (status === 'rejected') return 'Rechazado';
                                    return 'Pendiente';
                                  };

                                  return (
                                    <div key={sig.id} className="signer-item-horizontal" title={getSignerStatusText(sig.status)}>
                                      <span
                                        className="signer-dot"
                                        style={{ backgroundColor: getSignerStatusColor(sig.status) }}
                                      ></span>
                                      <span className="signer-name">{sig.signer.name || sig.signer.email}</span>
                                    </div>
                                  );
                                })}
                                {signatures.length > 3 && (
                                  <button
                                    className="btn-ver-todos"
                                    onClick={() => setExpandedSigners({
                                      ...expandedSigners,
                                      [doc.id]: !expandedSigners[doc.id]
                                    })}
                                  >
                                    {expandedSigners[doc.id] ? '- ver menos' : '+ ver todos'}
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Botones de acción */}
                            <div className="doc-actions-clean">
                              <button
                                className="btn-action-clean"
                                onClick={() => handleViewDocument(doc)}
                                title="Ver documento"
                                style={{marginTop: '-1.5vw'}}
                              >
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M1 12C1 12 5 4 12 4C19 4 23 12 23 12C23 12 19 20 12 20C5 20 1 12 1 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  <path d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              )}
            </div>
          )}
        </main>
          </div>{/* /.ds-content */}
        </div>{/* /.ds-shell */}
      </div>

      {/* PDF Viewer Modal - Diseño Minimalista */}
      {viewingDocument && (
        <div className="pdf-viewer-minimal-overlay">
          {/* Header Minimalista */}
          <div className="pdf-viewer-minimal-header">
            <div className="pdf-viewer-header-left">
              <button className="pdf-viewer-back-btn" onClick={handleCloseViewer}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M19 12H5M5 12L12 19M5 12L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Volver
              </button>
              <div className="pdf-viewer-title">
                <h2>{viewingDocument.title}</h2>
                {viewingDocument.description && (
                  <button
                    className="pdf-viewer-description-btn"
                    onClick={() => setShowDescription(!showDescription)}
                    title={showDescription ? "Ocultar descripción" : "Ver descripción"}
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                )}
              </div>
            </div>
            <div className="pdf-viewer-header-right">
              {isViewingPending && !isWaitingTurn && (
                <>
                  {/* Botón Consecutivo (solo para FV) */}
                  {viewingDocument && viewingDocument.documentType && viewingDocument.documentType.code === 'FV' && (
                    <button
                      className="pdf-viewer-action-btn consecutivo"
                      onClick={() => {
                        setTempConsecutivo(consecutivo);
                        setShowConsecutivoModal(true);
                      }}
                      title="Agregar consecutivo"
                    >
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 5H7C6.46957 5 5.96086 5.21071 5.58579 5.58579C5.21071 5.96086 5 6.46957 5 7V19C5 19.5304 5.21071 20.0391 5.58579 20.4142C5.96086 20.7893 6.46957 21 7 21H17C17.5304 21 18.0391 20.7893 18.4142 20.4142C18.7893 20.0391 19 19.5304 19 19V7C19 6.46957 18.7893 5.96086 18.4142 5.58579C18.0391 5.21071 17.5304 5 17 5H15M9 5C9 5.53043 9.21071 6.03914 9.58579 6.41421C9.96086 6.78929 10.4696 7 11 7H13C13.5304 7 14.0391 6.78929 14.4142 6.41421C14.7893 6.03914 15 5.53043 15 5M9 5C9 4.46957 9.21071 3.96086 9.58579 3.58579C9.96086 3.21071 10.4696 3 11 3H13C13.5304 3 14.0391 3.21071 14.4142 3.58579C14.7893 3.96086 15 4.46957 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      Consecutivo
                    </button>
                  )}
                  <button className={`pdf-viewer-action-btn pdf-sign-btn ${showSignConfirm || (showRealSignerModal && realSignerAction === 'firmar') ? 'active' : ''}`} onClick={handleOpenSignConfirm}>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Firmar
                  </button>
                  <button className={`pdf-viewer-action-btn pdf-reject-btn ${showRejectConfirm || (showRealSignerModal && realSignerAction === 'rechazar') ? 'active' : ''}`} onClick={handleOpenRejectConfirm}>
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    Rechazar
                  </button>
                </>
              )}
              {isViewingPending && isWaitingTurn && (
                <div className="pdf-viewer-waiting-message">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width: '20px', height: '20px'}}>
                    <path d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Aún no es tu turno de firmar. Hay otras personas que deben firmarlo antes que tú.</span>
                </div>
              )}
              <a
                href={getDownloadUrl(viewingDocument.id)}
                className="pdf-viewer-action-btn download"
                title="Descargar"
                target="_blank"
                rel="noopener noreferrer"
                onMouseEnter={() => setIsDownloadBtnHovered(true)}
                onMouseLeave={() => setIsDownloadBtnHovered(false)}
              >
                <Download isAnimating={isDownloadBtnHovered} size={20} strokeWidth={2} />
              </a>
              <button
                className="pdf-viewer-action-btn close"
                onClick={handleCloseViewer}
                title="Cerrar"
                onMouseEnter={() => setIsCloseBtnHovered(true)}
                onMouseLeave={() => setIsCloseBtnHovered(false)}
              >
                <Close isAnimating={isCloseBtnHovered} size={20} strokeWidth={2} />
              </button>
            </div>
          </div>

          {/* Popup de descripción */}
          {showDescription && viewingDocument.description && (
            <div className="pdf-description-popup">
              <div className="pdf-description-content">
                <div className="pdf-description-header">
                  <h4>Descripción</h4>
                  <button
                    className="pdf-description-close"
                    onClick={() => setShowDescription(false)}
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>
                </div>
                <p className="pdf-description-text">{viewingDocument.description}</p>
              </div>
            </div>
          )}

          {/* Contenedor del PDF */}
          <div className="pdf-viewer-minimal-body">
            <object
              data={getViewUrl(viewingDocument.id)}
              type="application/pdf"
              className="pdf-viewer-minimal-iframe"
              title={viewingDocument.title}
            >
              <embed
                src={getViewUrl(viewingDocument.id)}
                type="application/pdf"
                className="pdf-viewer-minimal-iframe"
                title={viewingDocument.title}
              />
              <div className="pdf-fallback-minimal">
                <div className="fallback-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M14 2V8H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <p className="fallback-title">No se puede mostrar el PDF en este navegador</p>
                <a
                  href={getDownloadUrl(viewingDocument.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fallback-download-btn"
                  onMouseEnter={() => setIsDownloadBtnHovered(true)}
                  onMouseLeave={() => setIsDownloadBtnHovered(false)}
                >
                  <Download isAnimating={isDownloadBtnHovered} size={20} strokeWidth={2} />
                  Descargar PDF
                </a>
              </div>
            </object>
          </div>

          {/* Popup de Confirmación de Firma - Minimalista */}
          {showSignConfirm && (
            <div className="sign-confirm-overlay" onClick={handleCancelSign}>
              <div className="sign-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="sign-confirm-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M11 5H6C5.46957 5 4.96086 5.21071 4.58579 5.58579C4.21071 5.96086 4 6.46957 4 7V19C4 19.5304 4.21071 20.0391 4.58579 20.4142C4.96086 20.7893 5.46957 21 6 21H18C18.5304 21 19.0391 20.7893 19.4142 20.4142C19.7893 20.0391 20 19.5304 20 19V14M18.5 2.5C18.8978 2.1022 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.1022 21.5 2.5C21.8978 2.8978 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.1022 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="sign-confirm-title">Confirmar firma</h3>
                <p className="sign-confirm-message">
                  ¿Estás seguro de que deseas firmar este documento? Esta acción no se puede deshacer.
                </p>
                <div className="sign-confirm-actions">
                  <button
                    className="sign-confirm-btn cancel"
                    onClick={handleCancelSign}
                    disabled={signing}
                  >
                    Cancelar
                  </button>
                  <button
                    className="sign-confirm-btn confirm"
                    onClick={handleConfirmSign}
                    disabled={signing}
                  >
                    {signing ? 'Firmando...' : 'Firmar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Popup de Rechazo de Documento - Minimalista */}
          {showRejectConfirm && (
            <div className="sign-confirm-overlay" onClick={handleCancelReject}>
              <div className="reject-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="reject-confirm-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="reject-confirm-title">Rechazar Documento</h3>
                <p className="reject-confirm-message">
                  Por favor, explica la razón del rechazo. Esta información será visible para todos los involucrados.
                </p>
                <div className="reject-reason-container">
                  <textarea
                    className="reject-reason-input"
                    placeholder="Explica la razón del rechazo..."
                    value={rejectReason}
                    onChange={handleRejectReasonChange}
                    rows="4"
                    maxLength="500"
                  />
                  {rejectError && (
                    <div className="reject-error-message">
                      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      {rejectError}
                    </div>
                  )}
                </div>
                <div className="reject-confirm-actions">
                  <button
                    className="reject-confirm-btn cancel"
                    onClick={handleCancelReject}
                    disabled={rejecting}
                  >
                    Cancelar
                  </button>
                  <button
                    className="reject-confirm-btn confirm"
                    onClick={handleConfirmReject}
                    disabled={rejectReason.trim().length < 5 || rejecting}
                  >
                    {rejecting ? 'Rechazando...' : 'Rechazar'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Popup de Éxito al Rechazar */}
          {showRejectSuccess && (
            <div className="sign-confirm-overlay" onClick={() => {
              setShowRejectSuccess(false);
              handleCloseViewer();
            }}>
              <div className="sign-confirm-modal success-modal reject-success" onClick={(e) => e.stopPropagation()}>
                <div className="sign-confirm-icon success">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="sign-confirm-title">Documento rechazado</h3>
                <p className="sign-confirm-message">El documento ha sido rechazado exitosamente. Los involucrados han sido notificados.</p>
                <div className="sign-confirm-actions">
                  <button
                    className="sign-confirm-btn confirm full-width"
                    onClick={() => {
                      setShowRejectSuccess(false);
                      handleCloseViewer();
                    }}
                  >
                    Listo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Popup de Éxito al Firmar */}
          {showSignSuccess && (
            <div className="sign-confirm-overlay" onClick={() => {
              setShowSignSuccess(false);
              handleCloseViewer();
            }}>
              <div className="sign-confirm-modal success-modal sign-success" onClick={(e) => e.stopPropagation()}>
                <div className="sign-confirm-icon success">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="sign-confirm-title">Documento firmado</h3>
                <p className="sign-confirm-message">El documento ha sido firmado exitosamente. Los involucrados han sido notificados.</p>
                <div className="sign-confirm-actions">
                  <button
                    className="sign-confirm-btn confirm full-width"
                    onClick={() => {
                      setShowSignSuccess(false);
                      handleCloseViewer();
                    }}
                  >
                    Listo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Consecutivo (solo para FV) */}
          {showConsecutivoModal && (
            <div className="sign-confirm-overlay" onClick={handleCancelConsecutivo}>
              <div className="sign-confirm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="sign-confirm-icon consecutivo-icon">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 5H7C6.46957 5 5.96086 5.21071 5.58579 5.58579C5.21071 5.96086 5 6.46957 5 7V19C5 19.5304 5.21071 20.0391 5.58579 20.4142C5.96086 20.7893 6.46957 21 7 21H17C17.5304 21 18.0391 20.7893 18.4142 20.4142C18.7893 20.0391 19 19.5304 19 19V7C19 6.46957 18.7893 5.96086 18.4142 5.58579C18.0391 5.21071 17.5304 5 17 5H15M9 5C9 5.53043 9.21071 6.03914 9.58579 6.41421C9.96086 6.78929 10.4696 7 11 7H13C13.5304 7 14.0391 6.78929 14.4142 6.41421C14.7893 6.03914 15 5.53043 15 5M9 5C9 4.46957 9.21071 3.96086 9.58579 3.58579C9.96086 3.21071 10.4696 3 11 3H13C13.5304 3 14.0391 3.21071 14.4142 3.58579C14.7893 3.96086 15 4.46957 15 5M12 12H15M12 16H15M9 12H9.01M9 16H9.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="sign-confirm-title">Consecutivo de factura</h3>
                <p className="sign-confirm-message">
                  Ingresa el consecutivo de esta factura si aplica. Este campo es opcional y se guardará con tu firma.
                </p>
                <div className="reject-reason-container">
                  <input
                    type="text"
                    className="reject-reason-input consecutivo-input"
                    value={tempConsecutivo}
                    onChange={(e) => setTempConsecutivo(e.target.value)}
                    maxLength="100"
                  />
                </div>
                <div className="sign-confirm-actions">
                  <button
                    className="sign-confirm-btn cancel"
                    onClick={handleCancelConsecutivo}
                  >
                    Cancelar
                  </button>
                  <button
                    className="sign-confirm-btn confirm consecutivo-btn"
                    onClick={handleSaveConsecutivo}
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Popup de Error de Firma/Rechazo */}
          {showOrderError && (
            <div className="sign-confirm-overlay" onClick={() => {
              setShowOrderError(false);
              setOrderErrorMessage('');
            }}>
              <div className="sign-confirm-modal error-modal order-error" onClick={(e) => e.stopPropagation()}>
                <div className="sign-confirm-icon error">
                  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <h3 className="sign-confirm-title">
                  {orderErrorMessage.includes('esperar') ? 'No se puede continuar aún' : 'Error'}
                </h3>
                <p className="sign-confirm-message">{orderErrorMessage}</p>
                <div className="sign-confirm-actions">
                  <button
                    className="sign-confirm-btn confirm full-width"
                    onClick={() => {
                      setShowOrderError(false);
                      setOrderErrorMessage('');
                    }}
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Modal de Detalles del Desarrollador */}
      {selectedDeveloper && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100%',
            height: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10002,
            backgroundColor: '#000000',
            overflow: 'hidden'
          }}
        >
          <BalatroBackground
            isRotate={false}
            mouseInteraction={true}
            pixelFilter={700}
            blur={true}
            opacity={0.85}
          />

          <div
            style={{
              position: 'relative',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '32px',
              padding: '40px',
              maxWidth: '500px',
              width: '90%',
              overflow: 'hidden'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedDeveloper(null)}
              style={{
                position: 'absolute',
                top: '20px',
                right: '20px',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
                zIndex: 20
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6L6 18M6 6L18 18" />
              </svg>
            </button>

            <button
              onClick={switchDeveloper}
              style={{
                position: 'absolute',
                top: '215px',
                right: '20px',
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: 'none',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.3s ease',
                zIndex: 20
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                e.currentTarget.style.transform = 'scale(1.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>

            <div
              ref={containerRef}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '32px',
                opacity: 1,
                transform: 'translateX(0)',
                transition: 'opacity 0.4s ease-out, transform 0.4s ease-out'
              }}
            >
              <div
                style={{
                  position: 'relative',
                  width: '350px',
                  height: '350px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '6px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 80px rgba(255, 255, 255, 0.1)',
                  transition: 'transform 0.4s ease, box-shadow 0.4s ease'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 25px 80px rgba(0, 0, 0, 0.5), 0 0 100px rgba(255, 255, 255, 0.15)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.4), 0 0 80px rgba(255, 255, 255, 0.1)';
                }}
              >
                <img
                  ref={avatarRef}
                  src={developers[0].photo}
                  alt={developers[0].name}
                  loading="eager"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    objectPosition: 'center'
                  }}
                />
              </div>

              <div
                style={{
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                <h2
                  ref={nameRef}
                  style={{
                    margin: 0,
                    fontSize: '32px',
                    fontWeight: '700',
                    color: '#ffffff',
                    letterSpacing: '0.5px',
                    textShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                >
                  {developers[0].name}
                </h2>
                <p
                  ref={roleRef}
                  style={{
                    margin: 0,
                    fontSize: '18px',
                    fontWeight: '400',
                    color: 'rgba(255, 255, 255, 0.7)',
                    letterSpacing: '0.5px',
                    textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                >
                  {developers[0].role}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Gestión de Firmantes */}
      {managingDocument && (
        <div className="modal-overlay" onClick={handleCloseSignersModal}>
          <div className="signers-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="signers-modal-header">
              <div>
                <h2>Gestión de Firmantes</h2>
                <p className="modal-subtitle">{managingDocument.title}</p>
              </div>
              <button className="modal-close-button" onClick={handleCloseSignersModal}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            <div className="signers-modal-body">
              {loadingDocumentSigners ? (
                <div className="loading-state-modern">
                  <div className="spinner-modern"></div>
                  <p>Cargando firmantes...</p>
                </div>
              ) : documentSigners.length === 0 ? (
                <div className="empty-state-modern">
                  <p>No hay firmantes asignados a este documento</p>
                </div>
              ) : (
                <>
                  {/* Buscador para agregar firmantes - Solo si el documento no está completado */}
                  {(managingDocument.status !== 'completed' && managingDocument.status !== 'rejected') && (
                    <div style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #e5e7eb' }}>
                      <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>
                        Agregar nuevo firmante
                      </h3>

                      {/* Buscador con dropdown estilo paso 1 */}
                      <div className="search-wrapper">
                        <svg className="search-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <input
                          type="text"
                          className="search-input-modern"
                          placeholder="Buscar por nombre o correo"
                          value={searchNewSigner}
                          onChange={(e) => setSearchNewSigner(e.target.value)}
                        />
                        {searchNewSigner && (
                          <button
                            className="search-clear-modern"
                            onClick={() => setSearchNewSigner('')}
                            type="button"
                            aria-label="Limpiar búsqueda"
                          >
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        )}

                        {/* Dropdown de resultados - solo se muestra cuando hay búsqueda */}
                        {searchNewSigner && searchNewSigner.trim().length > 0 && (
                          <div className="autocomplete-dropdown">
                            {(() => {
                              const existingIds = new Set(documentSigners.map(s => s.signer?.id).filter(Boolean));
                              // Dividir el término de búsqueda en palabras
                              const searchWords = searchNewSigner.toLowerCase().trim().split(/\s+/);
                              const filteredSigners = availableSigners.filter(s => {
                                if (existingIds.has(s.id)) return false;
                                const name = (s.name || '').toLowerCase();
                                const email = (s.email || '').toLowerCase();
                                // Todas las palabras deben encontrarse en el nombre o email
                                return searchWords.every(word =>
                                  name.includes(word) || email.includes(word)
                                );
                              });

                              if (filteredSigners.length === 0) {
                                return (
                                  <div className="dropdown-empty">
                                    <p>No se encontraron resultados para "{searchNewSigner}"</p>
                                  </div>
                                );
                              }

                              return filteredSigners.map(signer => {
                                const isAdding = addingSignerId === signer.id;
                                return (
                                  <div
                                    key={signer.id}
                                    className="dropdown-item"
                                    onClick={() => {
                                      if (!isAdding) {
                                        handleAddSingleSigner(signer.id);
                                        // NO limpiar búsqueda - mantener el dropdown abierto
                                      }
                                    }}
                                    style={{
                                      opacity: isAdding ? 0.5 : 1,
                                      pointerEvents: isAdding ? 'none' : 'auto',
                                      transition: 'opacity 0.3s ease'
                                    }}
                                  >
                                    <div className="signer-avatar-circle">
                                      {getInitials(signer.name, signer.email)}
                                    </div>
                                    <div className="signer-info-modern">
                                      <p className="signer-name-modern">
                                        {signer.name || 'Usuario'}
                                        {user && user.id === signer.id && (
                                          <span className="you-tag">Tú</span>
                                        )}
                                      </p>
                                      <p className="signer-email-modern">{signer.email}</p>
                                    </div>
                                    {isAdding ? (
                                      <div style={{
                                        width: '20px',
                                        height: '20px',
                                        border: '2px solid #10b981',
                                        borderTopColor: 'transparent',
                                        borderRadius: '50%',
                                        animation: 'spin 0.6s linear infinite'
                                      }}></div>
                                    ) : (
                                      <div className="add-indicator">
                                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                        </svg>
                                      </div>
                                    )}
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Modal de selección de roles para nuevo firmante (solo FV) */}
                  {pendingSignerForRoles && managingDocument.documentType?.code === 'FV' && (
                    <div style={{
                      marginBottom: '20px',
                      padding: '16px',
                      backgroundColor: '#f9fafb',
                      border: '2px solid #9CA3AF',
                      borderRadius: '8px'
                    }}>
                      <div style={{ marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '14px', fontWeight: '600', color: '#374151' }}>
                          Asignar roles a: {pendingSignerForRoles.name}
                        </h3>
                        <button
                          onClick={() => {
                            setPendingSignerForRoles(null);
                            setSelectedRolesForNewSigner([]);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: '#6b7280',
                            padding: '4px'
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>

                      <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                        Selecciona hasta 3 roles. Los roles marcados como "Único" solo pueden asignarse a un firmante.
                      </p>

                      {/* Lista de roles con checkboxes */}
                      <div style={{ marginBottom: '12px' }}>
                        {managingDocument.documentType?.roles?.map((role) => {
                          const isSelected = selectedRolesForNewSigner.some(r => r.roleId === role.id);
                          const exclusiveRoleCodes = ['RESPONSABLE_NEGOCIACIONES', 'AREA_FINANCIERA', 'CAUSACION'];
                          const isExclusiveRole = exclusiveRoleCodes.includes(role.roleCode);

                          // Verificar si el rol exclusivo ya está asignado
                          const isRoleTaken = isExclusiveRole && documentSigners.some(ds => {
                            const roleNames = ds.roleNames || (ds.roleName ? [ds.roleName] : []);
                            return roleNames.includes(role.roleName);
                          });

                          return (
                            <button
                              key={role.id}
                              onClick={() => {
                                if (!isRoleTaken) {
                                  toggleRoleForNewSigner(role.id, role.roleName);
                                }
                              }}
                              disabled={isRoleTaken}
                              style={{
                                width: '100%',
                                padding: '10px 12px',
                                marginBottom: '8px',
                                backgroundColor: isSelected ? '#F3F4F6' : (isRoleTaken ? '#f9fafb' : 'white'),
                                border: isSelected ? '2px solid #6B7280' : '1px solid #d1d5db',
                                borderRadius: '6px',
                                cursor: isRoleTaken ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                opacity: isRoleTaken ? 0.6 : 1,
                                transition: 'all 0.15s'
                              }}
                            >
                              {/* Checkbox */}
                              <div style={{
                                width: '18px',
                                height: '18px',
                                border: '2px solid ' + (isSelected ? '#6B7280' : '#d1d5db'),
                                borderRadius: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: isSelected ? '#6B7280' : 'white',
                                flexShrink: 0
                              }}>
                                {isSelected && (
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                )}
                              </div>

                              <span style={{ flex: 1, textAlign: 'left', fontSize: '14px', color: isSelected ? '#374151' : '#374151', fontWeight: isSelected ? '600' : '400' }}>
                                {role.roleName}
                              </span>

                              {/* Badge de rol exclusivo */}
                              {isExclusiveRole && !isRoleTaken && (
                                <span style={{
                                  fontSize: '11px',
                                  color: '#667eea',
                                  fontWeight: '500',
                                  backgroundColor: '#eff2fd',
                                  padding: '2px 8px',
                                  borderRadius: '4px'
                                }}>
                                  Único
                                </span>
                              )}

                              {isRoleTaken && (
                                <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                                  (Asignado)
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Botones de acción */}
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setPendingSignerForRoles(null);
                            setSelectedRolesForNewSigner([]);
                          }}
                          style={{
                            padding: '8px 16px',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            backgroundColor: 'white',
                            color: '#374151',
                            fontSize: '14px',
                            cursor: 'pointer',
                            fontWeight: '500'
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={confirmAddSignerWithRoles}
                          disabled={addingSignerId || selectedRolesForNewSigner.length === 0}
                          style={{
                            padding: '8px 16px',
                            border: 'none',
                            borderRadius: '6px',
                            backgroundColor: (addingSignerId || selectedRolesForNewSigner.length === 0) ? '#9ca3af' : '#6B7280',
                            color: 'white',
                            fontSize: '14px',
                            cursor: (addingSignerId || selectedRolesForNewSigner.length === 0) ? 'not-allowed' : 'pointer',
                            fontWeight: '500'
                          }}
                        >
                          {addingSignerId ? 'Agregando...' : `Agregar${selectedRolesForNewSigner.length > 0 ? ` (${selectedRolesForNewSigner.length} ${selectedRolesForNewSigner.length === 1 ? 'rol' : 'roles'})` : ' (selecciona al menos 1 rol)'}`}
                        </button>
                      </div>
                    </div>
                  )}

                  <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: '#374151' }}>
                    Firmantes del documento {managingDocument.status !== 'completed' && '(Arrastra para reordenar)'}
                  </h3>

                  <div className="signers-list-modal">
                    {documentSigners.map((signature, index) => (
                      <div
                        key={signature.id}
                        className={`selected-signer-card ${draggedSignerIndex === index ? 'dragging' : ''} ${dragOverSignerIndex === index && draggedSignerIndex !== index ? 'drag-over' : ''}`}
                        draggable={managingDocument.status !== 'completed' && (signature.status === 'pending' || signature.status === 'signed')}
                        onDragStart={(e) => handleSignerDragStart(e, index)}
                        onDragOver={(e) => handleSignerDragOver(e, index)}
                        onDrop={(e) => handleSignerDrop(e, index)}
                        onDragEnd={handleSignerDragEnd}
                      >
                        <div className="signer-order-badge">
                          {signature.orderPosition || (index + 1)}
                        </div>

                        <div className="signer-avatar-circle">
                          {getInitials(signature.signer?.name, signature.signer?.email)}
                        </div>

                        <div className="signer-info-modern flex-grow">
                          <p className="signer-name-modern">
                            {signature.signer?.name || 'Usuario'}
                            {signature.realSignerName && <span style={{ fontWeight: '500', color: '#10B981' }}> ({signature.realSignerName})</span>}
                            {signature.roleName && <span style={{ fontWeight: '400', color: '#6B7280' }}> - {signature.roleName}</span>}
                          </p>
                          <p className="signer-email-modern">{signature.signer?.email || 'N/A'}</p>
                          {signature.status === 'rejected' && signature.rejectionReason && (
                            <p className="signer-rejection-reason">Razón: {signature.rejectionReason}</p>
                          )}
                        </div>
                        <div className="signer-status-badge-modal">
                          {signature.status === 'signed' && (
                            <span className="status-signed">
                              Firmado
                            </span>
                          )}
                          {signature.status === 'pending' && (
                            <span className="status-pending">
                              Pendiente
                            </span>
                          )}
                          {signature.status === 'rejected' && (
                            <span className="status-rejected">
                              Rechazado
                            </span>
                          )}
                        </div>
                        {/* Botón de eliminar - Solo para firmantes pendientes, placeholder para otros */}
                        {signature.status === 'pending' && managingDocument.status !== 'completed' ? (
                          <button
                            className="btn-remove-signer"
                            onClick={() => handleRemoveSigner(signature.signer.id)}
                            disabled={documentSigners.length <= 1}
                            title={documentSigners.length <= 1 ? 'No se puede eliminar el único firmante' : 'Eliminar firmante'}
                          >
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <path d="M3 6H5H21M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                        ) : (
                          <div className="btn-remove-signer-placeholder"></div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Mensaje informativo si el documento está completado */}
                  {managingDocument.status === 'completed' && (
                    <div className="info-message-completed" style={{
                      marginTop: '16px',
                      padding: '12px 16px',
                      background: '#F0FDF4',
                      border: '1.5px solid #86EFAC',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px'
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                      <p style={{ margin: 0, fontSize: '14px', color: '#166534', fontWeight: '500' }}>
                        Este documento ha sido firmado completamente. No se pueden agregar más firmantes.
                      </p>
                    </div>
                  )}

                </>
              )}
            </div>

            <div className="signers-modal-footer">
              <button className="btn-close-modal" onClick={handleCloseSignersModal}>
                Cerrar
              </button>
              {managingDocument.status !== 'completed' && managingDocument.status !== 'rejected' && documentSigners.length > 0 && (
                <button
                  className="btn-save-signers-order"
                  onClick={handleSaveOrder}
                  disabled={savingOrder}
                  style={{
                    backgroundColor: '#6B7280',
                    color: 'white',
                    minWidth: '160px',
                    transform: 'none',
                    transition: 'opacity 0.2s ease'
                  }}
                >
                  {savingOrder ? 'Guardando...' : 'Guardar Orden'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Modal de confirmación de eliminación - Minimalista */}
      {confirmDeleteOpen && (
        <div className="delete-modal-overlay" onClick={cancelDeleteDocument}>
          <div className="delete-modal-minimal" onClick={(e) => e.stopPropagation()}>
            {/* Icono de basura circular */}
            <div className="delete-icon-circle">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6H5H21M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* Título y descripción */}
            <h2 className="delete-modal-title">Eliminar Documento</h2>
            <p className="delete-modal-description">
              ¿Estás seguro que deseas eliminar este documento? Esta acción no se puede deshacer.
            </p>

            {/* Botones */}
            <div className="delete-modal-buttons">
              <button
                className="delete-btn-cancel"
                onClick={cancelDeleteDocument}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button
                className="delete-btn-confirm"
                onClick={confirmDeleteDocument}
                disabled={deleting}
                style={{background:"#fee2e2"}}
                >
                {deleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de posición inválida */}
      {invalidPositionModal && (
        <div className="delete-modal-overlay" onClick={() => setInvalidPositionModal(false)}>
          <div className="delete-modal-minimal" onClick={(e) => e.stopPropagation()}>
            {/* Icono de alerta circular */}
            <div className="delete-icon-circle" style={{backgroundColor: '#fef2f2'}}>
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{color: '#ef4444'}}>
                <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* Título y descripción */}
            <h2 className="delete-modal-title">Posición no válida</h2>
            <p className="delete-modal-description">
              Solo puedes reordenar firmantes pendientes entre sí.
            </p>

            {/* Botón único */}
            <div className="delete-modal-buttons">
              <button
                className="delete-btn-confirm"
                onClick={() => setInvalidPositionModal(false)}
                style={{
                  background: '#6B7280',
                  color: 'white',
                  width: '100%'
                }}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup para mostrar razón de rechazo */}
      {rejectionReasonPopup && (
        <div className="rejection-popup-overlay" onClick={() => setRejectionReasonPopup(null)}>
          <div className="rejection-popup-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rejection-popup-header">
              <h3 className="rejection-popup-title">Razón del rechazo</h3>
              <button className="rejection-popup-close" onClick={() => setRejectionReasonPopup(null)}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            <div className="rejection-popup-body">
              <div className="rejection-popup-info">
                <p className="rejection-popup-label">Documento:</p>
                <p className="rejection-popup-value">{rejectionReasonPopup.title}</p>
              </div>
              <div className="rejection-popup-info">
                <p className="rejection-popup-label">Rechazado por:</p>
                <p className="rejection-popup-value">{rejectionReasonPopup.rejectedBy}</p>
              </div>
              {rejectionReasonPopup.rejectedAt && (
                <div className="rejection-popup-info">
                  <p className="rejection-popup-label">Fecha:</p>
                  <p className="rejection-popup-value">{formatDateTime(rejectionReasonPopup.rejectedAt)}</p>
                </div>
              )}
              <div className="rejection-popup-reason">
                <p className="rejection-popup-label">Justificación:</p>
                <div className="rejection-popup-reason-box">
                  {rejectionReasonPopup.reason}
                </div>
              </div>
            </div>
            <div className="rejection-popup-footer">
              <button className="btn-close-rejection" onClick={() => setRejectionReasonPopup(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de firma rápida */}
      {showQuickSignConfirm && documentToSign && (
        <div className="sign-confirm-overlay" onClick={handleCancelQuickSign}>
          <div className="sign-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sign-confirm-icon">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M11 5H6C5.46957 5 4.96086 5.21071 4.58579 5.58579C4.21071 5.96086 4 6.46957 4 7V19C4 19.5304 4.21071 20.0391 4.58579 20.4142C4.96086 20.7893 5.46957 21 6 21H18C18.5304 21 19.0391 20.7893 19.4142 20.4142C19.7893 20.0391 20 19.5304 20 19V14M18.5 2.5C18.8978 2.1022 19.4374 1.87868 20 1.87868C20.5626 1.87868 21.1022 2.1022 21.5 2.5C21.8978 2.8978 22.1213 3.43739 22.1213 4C22.1213 4.56261 21.8978 5.1022 21.5 5.5L12 15L8 16L9 12L18.5 2.5Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="sign-confirm-title">Confirmar firma</h3>
            <p className="sign-confirm-message">
              ¿Estás seguro de que deseas firmar el documento "<strong>{documentToSign.title}</strong>"?
            </p>
            <p className="sign-confirm-message" style={{fontSize: '0.85rem', marginTop: '0.5rem', opacity: 0.8}}>
              Esta acción no se puede deshacer.
            </p>
            <div className="sign-confirm-actions">
              <button
                className="sign-confirm-btn cancel"
                onClick={handleCancelQuickSign}
                disabled={signing}
              >
                Cancelar
              </button>
              <button
                className="sign-confirm-btn confirm"
                onClick={handleConfirmQuickSign}
                disabled={signing}
              >
                {signing ? 'Firmando...' : 'Firmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pantalla de "Aún no es tu turno de firmar" - PANTALLA COMPLETA */}
      {showWaitingTurnScreen && (
        <div className="waiting-turn-fullscreen-overlay">
          <div className="waiting-turn-modal">
            <div className="waiting-turn-content">
              <img src={clockImage} alt="Reloj de espera" className="waiting-turn-icon" />
              <h2 className="waiting-turn-title">Aún no es tu turno de firmar</h2>
              <p className="waiting-turn-message">
                El documento no está disponible para que lo firmes porque hay otras personas que deben firmarlo antes que tú.
              </p>
              <p className="waiting-turn-submessage">
                No te preocupes, te notificaremos cuando sea tu turno.
              </p>
              <div className="waiting-turn-actions">
                <button
                  className="waiting-turn-btn"
                  onClick={() => {
                    console.log('🚪 Cerrando pantalla de espera (botón Entendido)');
                    setShowWaitingTurnScreen(false);
                    setActiveTab('pending');
                    window.history.replaceState({}, '', '/');
                  }}
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de notificación elegante */}
      {showNotification && (
        <div className="notification-modal-overlay" onClick={() => setShowNotification(false)}>
          <div className="notification-modal" onClick={(e) => e.stopPropagation()}>
            <div className={`modal-alert-icon ${notificationData.type}`}>
              {notificationData.type === 'info' && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {notificationData.type === 'success' && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {notificationData.type === 'warning' && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18C1.64537 18.3024 1.55295 18.6453 1.55199 18.9945C1.55103 19.3437 1.64156 19.6871 1.81443 19.9905C1.98731 20.2939 2.23676 20.5467 2.53789 20.7239C2.83903 20.9011 3.18167 20.9962 3.53 21H20.47C20.8183 20.9962 21.161 20.9011 21.4621 20.7239C21.7632 20.5467 22.0127 20.2939 22.1856 19.9905C22.3584 19.6871 22.449 19.3437 22.448 18.9945C22.447 18.6453 22.3546 18.3024 22.18 18L13.71 3.86C13.5317 3.56611 13.2807 3.32312 12.9812 3.15448C12.6817 2.98585 12.3437 2.89725 12 2.89725C11.6563 2.89725 11.3183 2.98585 11.0188 3.15448C10.7193 3.32312 10.4683 3.56611 10.29 3.86Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
              {notificationData.type === 'error' && (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <h3 className="modal-alert-title">{notificationData.title}</h3>
            <p className="modal-alert-message">{notificationData.message}</p>
            <button className={`modal-alert-button ${notificationData.type}`} onClick={() => setShowNotification(false)}>
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación de firmante */}
      {confirmRemoveSignerModal && (
        <div className="delete-modal-overlay" onClick={() => setConfirmRemoveSignerModal(null)}>
          <div className="delete-modal-minimal" onClick={(e) => e.stopPropagation()}>
            {/* Icono circular - triángulo de advertencia o basura */}
            <div className="delete-icon-circle">
              {confirmRemoveSignerModal.isLastPending ? (
                // Triángulo de advertencia
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 9V13M12 17H12.01M10.29 3.86L1.82 18C1.64537 18.3024 1.55296 18.6453 1.55199 18.9945C1.55101 19.3437 1.64151 19.6871 1.81445 19.9905C1.98738 20.2939 2.23675 20.5467 2.53773 20.7239C2.83871 20.901 3.18082 20.9962 3.53 21H20.47C20.8192 20.9962 21.1613 20.901 21.4623 20.7239C21.7633 20.5467 22.0126 20.2939 22.1856 19.9905C22.3585 19.6871 22.449 19.3437 22.448 18.9945C22.447 18.6453 22.3546 18.3024 22.18 18L13.71 3.86C13.5317 3.56611 13.2807 3.32312 12.9812 3.15448C12.6817 2.98585 12.3437 2.89725 12 2.89725C11.6563 2.89725 11.3183 2.98585 11.0188 3.15448C10.7193 3.32312 10.4683 3.56611 10.29 3.86Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                // Icono de basura
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6H5H21M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>

            {/* Título y descripción */}
            <h2 className="delete-modal-title">
              {confirmRemoveSignerModal.isLastPending ? 'Advertencia' : 'Eliminar Firmante'}
            </h2>
            <p className="delete-modal-description">
              {confirmRemoveSignerModal.isLastPending ? (
                <>
                  Este es el último firmante pendiente. Al eliminarlo, el documento se marcará como completado automáticamente y <strong>NO podrás</strong> agregar más firmantes.
                </>
              ) : (
                '¿Estás seguro que deseas eliminar este firmante? Esta acción no se puede deshacer.'
              )}
            </p>

            {/* Botones */}
            <div className="delete-modal-buttons">
              <button
                className="delete-btn-cancel"
                onClick={() => setConfirmRemoveSignerModal(null)}
                disabled={removingSignerLoading}
              >
                Cancelar
              </button>
              <button
                className="delete-btn-confirm"
                onClick={confirmRemoveSignerAction}
                style={{background: confirmRemoveSignerModal.isLastPending ? "#EF4444" : "#fee2e2"}}
                disabled={removingSignerLoading}
              >
                {removingSignerLoading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de error para agregar firmantes */}
      {errorModalData && (
        <div className="delete-modal-overlay" onClick={() => setErrorModalData(null)}>
          <div className="delete-modal-minimal" onClick={(e) => e.stopPropagation()}>
            {/* Icono de error circular */}
            <div className="delete-icon-circle">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            {/* Título y descripción */}
            <h2 className="delete-modal-title">{errorModalData.title}</h2>
            <p className="delete-modal-description">
              {errorModalData.message}
            </p>

            {/* Botón */}
            <div className="delete-modal-buttons">
              <button
                className="delete-btn-confirm"
                onClick={() => setErrorModalData(null)}
                style={{background:"#6366F1", width: "100%"}}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup de error de roles (máximo 3 roles) */}
      {roleErrorPopup && (
        <div className="rejection-popup-overlay" onClick={() => setRoleErrorPopup(null)}>
          <div
            className="rejection-popup-modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '450px',
              borderRadius: '12px',
              padding: '0',
              textAlign: 'center'
            }}
          >
            {/* Icono circular rojo */}
            <div style={{
              paddingTop: '40px',
              paddingBottom: '24px',
              display: 'flex',
              justifyContent: 'center'
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                backgroundColor: '#FEE2E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>

            {/* Título */}
            <h2 style={{
              fontSize: '20px',
              fontWeight: '600',
              color: '#111827',
              margin: '0 0 12px 0',
              padding: '0 32px'
            }}>
              Error de validación
            </h2>

            {/* Mensaje */}
            <p style={{
              fontSize: '15px',
              color: '#6B7280',
              lineHeight: '1.5',
              margin: '0 0 32px 0',
              padding: '0 32px'
            }}>
              {roleErrorPopup.message}
            </p>

            {/* Botón */}
            <div style={{
              padding: '0 32px 32px 32px'
            }}>
              <button
                onClick={() => setRoleErrorPopup(null)}
                style={{
                  width: '100%',
                  backgroundColor: '#DC2626',
                  color: 'white',
                  border: 'none',
                  padding: '14px 24px',
                  borderRadius: '8px',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#B91C1C'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#DC2626'}
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal: Dropdown de roles (renderizado fuera del contenedor para evitar overflow) */}
      {openRoleDropdown && createPortal(
        <div
          className="role-dropdown-overlay"
          onClick={() => setOpenRoleDropdown(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9998,
            backgroundColor: 'transparent'
          }}
        >
          <div
            className="role-dropdown-menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${roleDropdownPosition.top}px`,
              left: `${roleDropdownPosition.left}px`,
              minWidth: '240px',
              backgroundColor: 'white',
              border: '1px solid #d1d5db',
              borderRadius: '0.5rem',
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
              zIndex: 9999,
              padding: '0.5rem'
            }}
          >
            {(() => {
              // Encontrar el firmante actual
              const signerObj = selectedSigners.find(s =>
                (typeof s === 'object' ? s.userId : s) === openRoleDropdown
              );

              const isFV = selectedDocumentType && selectedDocumentType.code === 'FV';
              const currentRoleId = typeof signerObj === 'object' ? signerObj.roleId : null;
              const currentRoleIds = (typeof signerObj === 'object' && signerObj.roleIds) ? signerObj.roleIds : [];

              return (
                <>
                  {/* Opción para quitar rol (solo para tipo SA - un solo rol) */}
                  {!isFV && currentRoleId && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          updateSignerRole(openRoleDropdown, null, null);
                          setOpenRoleDropdown(null);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          textAlign: 'left',
                          backgroundColor: 'white',
                          border: 'none',
                          borderRadius: '0.375rem',
                          cursor: 'pointer',
                          fontSize: '0.875rem',
                          color: '#dc2626',
                          fontWeight: '500',
                          marginBottom: '0.5rem',
                          transition: 'background-color 0.15s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#fef2f2'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                      >
                        Quitar rol
                      </button>

                      <div style={{
                        height: '1px',
                        backgroundColor: '#e5e7eb',
                        margin: '0.5rem 0'
                      }} />
                    </>
                  )}

                  {/* Encabezado para tipo FV */}
                  {isFV && (
                    <div style={{
                      padding: '0.5rem 0.75rem',
                      fontSize: '0.75rem',
                      color: '#6b7280',
                      fontWeight: '400',
                      marginBottom: '0.5rem',
                      lineHeight: '1.4'
                    }}>
                      Selecciona hasta 3 roles<br/>
                      <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                        Los roles marcados como "Único" solo pueden asignarse a un firmante
                      </span>
                    </div>
                  )}

                  {/* Lista de roles disponibles */}
                  {documentTypeRoles.map((role) => {
                    // Para tipo FV: verificar si el rol está en el array
                    // Para otros tipos: verificar si es el rol actual
                    const isSelected = isFV
                      ? currentRoleIds.includes(role.id)
                      : currentRoleId === role.id;

                    // Roles exclusivos para FV (solo un firmante puede tenerlos)
                    const exclusiveRoleCodes = ['RESPONSABLE_NEGOCIACIONES', 'AREA_FINANCIERA', 'CAUSACION'];
                    const isExclusiveRole = isFV && exclusiveRoleCodes.includes(role.roleCode);

                    // Para tipo SA: Verificar si este rol ya está asignado a otro firmante
                    // Para tipo FV: Solo verificar para roles exclusivos
                    const isRoleTaken = selectedSigners.some(s => {
                      const otherSignerId = typeof s === 'object' ? s.userId : s;

                      if (isFV) {
                        // Para FV: solo bloquear roles exclusivos que otro firmante ya tiene
                        if (!isExclusiveRole) return false; // Los compartibles nunca están "ocupados"

                        const otherRoleIds = typeof s === 'object' && s.roleIds ? s.roleIds : [];
                        return otherSignerId !== openRoleDropdown && otherRoleIds.includes(role.id);
                      } else {
                        // Para SA: todos los roles son exclusivos
                        const otherRoleId = typeof s === 'object' ? s.roleId : null;
                        return otherSignerId !== openRoleDropdown && otherRoleId === role.id;
                      }
                    });

                    return (
                      <button
                        key={role.id}
                        type="button"
                        onClick={() => {
                          if (!isRoleTaken) {
                            updateSignerRole(openRoleDropdown, role.id, role.roleName);
                            // Para SA cerrar el dropdown, para FV dejarlo abierto
                            if (!isFV) {
                              setOpenRoleDropdown(null);
                            }
                          }
                        }}
                        disabled={isRoleTaken}
                        style={{
                          width: '100%',
                          padding: '0.625rem 0.75rem',
                          textAlign: 'left',
                          backgroundColor: isSelected ? '#eef2ff' : (isRoleTaken ? '#f9fafb' : 'white'),
                          border: 'none',
                          borderRadius: '0.375rem',
                          cursor: isRoleTaken ? 'not-allowed' : 'pointer',
                          fontSize: '0.875rem',
                          color: isSelected ? '#374151' : (isRoleTaken ? '#9ca3af' : '#374151'),
                          fontWeight: isSelected ? '600' : '400',
                          marginBottom: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'background-color 0.15s',
                          opacity: isRoleTaken ? 0.6 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected && !isRoleTaken) e.currentTarget.style.backgroundColor = '#f9fafb';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected && !isRoleTaken) e.currentTarget.style.backgroundColor = 'white';
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {/* Checkbox para tipo FV */}
                          {isFV && (
                            <div style={{
                              width: '16px',
                              height: '16px',
                              border: '2px solid ' + (isSelected ? '#6B7280' : '#d1d5db'),
                              borderRadius: '0.25rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: isSelected ? '#6B7280' : 'white',
                              transition: 'all 0.15s'
                            }}>
                              {isSelected && (
                                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                              )}
                            </div>
                          )}
                          {role.roleName}
                          {/* Indicador de rol exclusivo para FV */}
                          {isFV && isExclusiveRole && !isRoleTaken && (
                            <span style={{
                              fontSize: '0.75rem',
                              color: '#667eea',
                              fontWeight: '500',
                              backgroundColor: '#eff2fd',
                              padding: '0.125rem 0.375rem',
                              borderRadius: '0.25rem'
                            }}>
                              Único
                            </span>
                          )}
                          {isRoleTaken && (
                            <span style={{
                              fontSize: '0.75rem',
                              color: '#9ca3af',
                              fontWeight: '400'
                            }}>
                              (Asignado)
                            </span>
                          )}
                        </span>
                        {isSelected && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5 13L9 17L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </div>,
        document.body
      )}

      {/* Loader de creación de documento */}
      {showCreationLoader && <DocumentCreationLoader />}

      {/* Modal de ayuda */}
      <HelpModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />

      {/* Modal de selección de firmante real (usuario Negociaciones) */}
      <RealSignerModal
        isOpen={showRealSignerModal}
        onClose={() => {
          setShowRealSignerModal(false);
          setPendingDocumentAction(null);
        }}
        onConfirm={handleRealSignerConfirm}
        action={realSignerAction}
      />

    </div>
  );
}

export default Dashboard;