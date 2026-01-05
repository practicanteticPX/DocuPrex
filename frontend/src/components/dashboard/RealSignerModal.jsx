import { useState } from 'react';
import graphqlClient from '../../api/client';
import './RealSignerModal.css';

const VERIFY_CEDULA = `
  query VerifyNegotiationSignerCedula($name: String!, $lastFourDigits: String!) {
    verifyNegotiationSignerCedula(name: $name, lastFourDigits: $lastFourDigits) {
      valid
      message
    }
  }
`;

/**
 * Modal para que el usuario "Negociaciones" seleccione quién es la persona real que está firmando
 */
function RealSignerModal({ isOpen, onClose, onConfirm, action = 'firmar' }) {
  const [selectedSigner, setSelectedSigner] = useState('');
  const [cedulaDigits, setCedulaDigits] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: seleccionar firmante, 2: ingresar cédula
  const [loading, setLoading] = useState(false);

  // Lista de personas que usan el usuario Negociaciones
  const availableSigners = [
    'Carolina Martinez',
    'Valentina Arroyave',
    'Manuela Correa',
    'Luisa Velez',
    'Sebastian Pinto'
  ];

  const handleSelectSigner = () => {
    if (!selectedSigner) {
      setError('Por favor selecciona quién está firmando');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleConfirm = async () => {
    const digits = cedulaDigits.join('');
    console.log('🔍 Frontend - Dígitos array:', cedulaDigits);
    console.log('🔍 Frontend - Dígitos unidos:', digits);
    console.log('🔍 Frontend - Nombre:', selectedSigner);

    if (!digits || digits.length !== 4) {
      setError('Por favor ingresa los 4 dígitos de la cédula');
      return;
    }

    try {
      setLoading(true);
      console.log('📤 Enviando query con:', { name: selectedSigner, lastFourDigits: digits });
      const data = await graphqlClient.query(VERIFY_CEDULA, {
        name: selectedSigner,
        lastFourDigits: digits
      });
      console.log('📥 Respuesta recibida:', data);

      if (data.verifyNegotiationSignerCedula.valid) {
        onConfirm(selectedSigner);
        handleClose();
      } else {
        setError(data.verifyNegotiationSignerCedula.message || 'Los últimos 4 dígitos no coinciden');
      }
    } catch (err) {
      setError('Error al verificar la cédula');
      console.error('Error verificando cédula:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep(1);
    setCedulaDigits(['', '', '', '']);
    setError('');
  };

  const handleClose = () => {
    setSelectedSigner('');
    setCedulaDigits(['', '', '', '']);
    setError('');
    setStep(1);
    onClose();
  };

  const handleDigitChange = (index, value) => {
    // Solo permitir números
    if (value && !/^\d$/.test(value)) return;

    const newDigits = [...cedulaDigits];
    newDigits[index] = value;
    setCedulaDigits(newDigits);
    setError('');

    // Auto-focus al siguiente input si se ingresó un dígito
    if (value && index < 3) {
      const nextInput = document.getElementById(`digit-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleDigitKeyDown = (index, e) => {
    // Permitir retroceso al input anterior
    if (e.key === 'Backspace' && !cedulaDigits[index] && index > 0) {
      const prevInput = document.getElementById(`digit-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="real-signer-modal-overlay">
      <div className={`real-signer-modal-content real-signer-modal-${action}`}>
        <div className="real-signer-modal-header">
          <div className="real-signer-header-content">
            {step === 1 ? (
              <>
                <h2>¿Quién {action === 'firmar' ? 'firma' : 'rechaza'} este documento?</h2>
                <p className="real-signer-instruction">
                  Selecciona el nombre de la persona que está realizando esta acción
                </p>
              </>
            ) : (
              <>
                <h2>Verificación de identidad</h2>
                <p className="real-signer-instruction">
                  Ingresa los últimos 4 dígitos de la cédula de <strong>{selectedSigner}</strong>
                </p>
              </>
            )}
          </div>
          <button className="real-signer-modal-close" onClick={handleClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="real-signer-modal-body">
          {step === 1 ? (
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
          ) : (
            <div className="real-signer-cedula-input">
              <div className="cedula-digits-container">
                {[0, 1, 2, 3].map((index) => (
                  <input
                    key={index}
                    id={`digit-${index}`}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength="1"
                    value={cedulaDigits[index]}
                    onChange={(e) => handleDigitChange(index, e.target.value)}
                    onKeyDown={(e) => handleDigitKeyDown(index, e)}
                    autoFocus={index === 0}
                    className="cedula-digit-input"
                  />
                ))}
              </div>
              <p className="cedula-hint">Ingresa los últimos 4 dígitos de la cédula</p>
            </div>
          )}

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
          {step === 2 && (
            <button className="real-signer-btn-back" onClick={handleBack}>
              ← Volver
            </button>
          )}
          <button className="real-signer-btn-cancel" onClick={handleClose}>
            Cancelar
          </button>
          <button
            className={`real-signer-btn-confirm real-signer-btn-${action}`}
            onClick={step === 1 ? handleSelectSigner : handleConfirm}
            disabled={step === 1 ? !selectedSigner : cedulaDigits.join('').length !== 4 || loading}
          >
            {loading ? 'Verificando...' : (step === 1 ? 'Continuar' : (action === 'firmar' ? 'Firmar documento' : 'Rechazar documento'))}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RealSignerModal;
