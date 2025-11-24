import { useState } from 'react';
import './RealSignerModal.css';

/**
 * Modal para que el usuario "Negociaciones" seleccione quién es la persona real que está firmando
 */
function RealSignerModal({ isOpen, onClose, onConfirm, action = 'firmar' }) {
  const [selectedSigner, setSelectedSigner] = useState('');
  const [error, setError] = useState('');

  // Lista de personas que usan el usuario Negociaciones
  const availableSigners = [
    'Carolina Martinez',
    'Valentina Arroyave',
    'Manuela Correa',
    'Luisa Velez',
    'Sebastian Pinto'
  ];

  const handleConfirm = () => {
    if (!selectedSigner) {
      setError('Por favor selecciona quién está firmando');
      return;
    }

    onConfirm(selectedSigner);
    handleClose();
  };

  const handleClose = () => {
    setSelectedSigner('');
    setError('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="real-signer-modal-overlay" onClick={handleClose}>
      <div className={`real-signer-modal-content real-signer-modal-${action}`} onClick={(e) => e.stopPropagation()}>
        <div className="real-signer-modal-header">
          <div className="real-signer-header-content">
            <h2>¿Quién {action === 'firmar' ? 'firma' : 'rechaza'} este documento?</h2>
            <p className="real-signer-instruction">
              Selecciona el nombre de la persona que está realizando esta acción
            </p>
          </div>
          <button className="real-signer-modal-close" onClick={handleClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="real-signer-modal-body">

          <div className="real-signer-list">
            {availableSigners.map((signer) => (
              <label key={signer} className="real-signer-option">
                <input
                  type="radio"
                  name="signer"
                  value={signer}
                  checked={selectedSigner === signer}
                  onChange={(e) => {
                    setSelectedSigner(e.target.value);
                    setError('');
                  }}
                />
                <span className="real-signer-radio"></span>
                <span className="real-signer-name">{signer}</span>
              </label>
            ))}
          </div>

          {error && (
            <div className="real-signer-error">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="real-signer-modal-footer">
          <button className="real-signer-btn-cancel" onClick={handleClose}>
            Cancelar
          </button>
          <button
            className={`real-signer-btn-confirm real-signer-btn-${action}`}
            onClick={handleConfirm}
            disabled={!selectedSigner}
          >
            {action === 'firmar' ? 'Firmar documento' : 'Rechazar documento'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RealSignerModal;
