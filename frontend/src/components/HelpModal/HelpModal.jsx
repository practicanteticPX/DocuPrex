import { useEffect } from 'react';
import './HelpModal.css';

/**
 * Modal de ayuda con instrucciones paso a paso para subir documentos
 * @param {Object} props - Propiedades del componente
 * @param {boolean} props.isOpen - Estado de apertura del modal
 * @param {Function} props.onClose - Función para cerrar el modal
 */
const HelpModal = ({ isOpen, onClose }) => {
  // Cerrar con tecla ESC
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="help-modal-overlay" onClick={onClose}>
      <div className="help-modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="help-modal-header">
          <div className="help-modal-title-section">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="help-icon">
              <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M9.09 9C9.3251 8.33167 9.78915 7.76811 10.4 7.40913C11.0108 7.05016 11.7289 6.91894 12.4272 7.03871C13.1255 7.15849 13.7588 7.52152 14.2151 8.06353C14.6713 8.60553 14.9211 9.29152 14.92 10C14.92 12 11.92 13 11.92 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M12 17H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <div>
              <h2>Guía para subir documentos</h2>
              <p>Sigue estos pasos para enviar tu documento a firmar</p>
            </div>
          </div>
          <button className="help-modal-close" onClick={onClose} aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="help-modal-body">
          <div className="help-step">
            <div className="help-step-number">1</div>
            <div className="help-step-content">
              <h3>Selecciona el tipo de documento</h3>
              <p>Elige la categoría que mejor describa tu documento. Al seleccionar un tipo, verás sus iniciales (por ejemplo: <strong>SA</strong> para Solicitud de Anticipos, <strong>FV</strong> para Legalización de Facturas).</p>
              <div className="help-note">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Cada tipo de documento tiene roles específicos que se asignarán a los firmantes</span>
              </div>
            </div>
          </div>

          <div className="help-step">
            <div className="help-step-number">2</div>
            <div className="help-step-content">
              <h3>Ingresa un título descriptivo</h3>
              <p>Escribe un nombre claro que identifique el documento. Por ejemplo: "Venta de Cajas de Cartón Corrugado - Cliente Alimentos SA" o "Orden de Compra Empaques Plásticos Febrero 2024".</p>
            </div>
          </div>

          <div className="help-step">
            <div className="help-step-number">3</div>
            <div className="help-step-content">
              <h3>Sube tu archivo PDF</h3>
              <p>Haz clic en el área de carga o arrastra tu archivo. Solo se aceptan archivos en formato PDF.</p>
              <div className="help-note">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Solo archivos PDF • Máximo 20 archivos por grupo • Tamaño máximo: 10 MB por archivo</span>
              </div>
            </div>
          </div>

          <div className="help-step">
            <div className="help-step-number">4</div>
            <div className="help-step-content">
              <h3>Añade firmantes</h3>
              <p>Busca a los firmantes por su nombre o correo electrónico y selecciónalos de la lista. Cada firmante debe tener:</p>
              <ul className="help-list">
                <li><strong>Un rol asignado</strong> según el tipo de documento seleccionado</li>
                <li><strong>Una posición en la jerarquía</strong> de firmas</li>
              </ul>
            </div>
          </div>

          <div className="help-step">
            <div className="help-step-number">5</div>
            <div className="help-step-content">
              <h3>Establece el orden de firma</h3>
              <p>Organiza los firmantes en el orden deseado. Esto es importante porque:</p>
              <ul className="help-list">
                <li>Los firmantes solo pueden firmar o rechazar cuando su anterior en la jerarquía haya completado su acción</li>
                <li>El orden determina el flujo de aprobación del documento</li>
                <li>Nadie puede firmar fuera de turno</li>
              </ul>
              <div className="help-note">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>No se agregan campos de firma manualmente, solo se asignan roles</span>
              </div>
            </div>
          </div>

          <div className="help-step">
            <div className="help-step-number">6</div>
            <div className="help-step-content">
              <h3>Envía el documento</h3>
              <p>Revisa toda la información, el orden de firmantes y los roles asignados. Al hacer clic en "Enviar", los firmantes recibirán un correo electrónico para firmar en el orden establecido.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="help-modal-footer">
          <button className="help-modal-button" onClick={onClose}>
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
