import './ReleaseModal.css';

/**
 * Modal para confirmar la liberación de una factura retenida
 */
function ReleaseModal({ isOpen, onClose, onConfirm, loading = false }) {
  if (!isOpen) return null;

  return (
    <div className="release-modal-overlay" onClick={onClose}>
      <div className="release-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="release-modal-icon">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 11V7C8 5.93913 8.42143 4.92172 9.17157 4.17157C9.92172 3.42143 10.9391 3 12 3C13.0609 3 14.0783 3.42143 14.8284 4.17157C15.5786 4.92172 16 5.93913 16 7V8M5 11H19C20.1046 11 21 11.8954 21 13V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V13C3 11.8954 3.89543 11 5 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="12" cy="15" r="1.5" fill="currentColor"/>
            <path d="M12 16.5V18.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>
        <h2 className="release-modal-title">Liberar Factura Retenida</h2>
        <p className="release-modal-message">¿Estás seguro de que deseas liberar esta factura retenida?</p>
        <div className="release-modal-actions">
          <button
            className="release-btn-cancel"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            className="release-btn-confirm"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'Liberando...' : 'Sí, liberar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReleaseModal;
