import { useEffect, useState } from 'react';
import graphqlClient from '../../api/client';
import './RealSignerModal.css';

const GET_NEGOTIATION_SIGNERS = `
  query GetNegotiationSigners {
    negotiationSigners {
      id
      name
      active
    }
  }
`;

const VERIFY_PASSWORD = `
  query VerifyNegotiationSignerPassword($name: String!, $password: String!) {
    verifyNegotiationSignerPassword(name: $name, password: $password) {
      valid
      message
    }
  }
`;

function RealSignerModal({ isOpen, onClose, onConfirm, action = 'firmar' }) {
  const [selectedSigner, setSelectedSigner] = useState('');
  const [password, setPassword] = useState('');
  const [passwordInputReady, setPasswordInputReady] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: seleccionar firmante, 2: autenticar con AD
  const [loading, setLoading] = useState(false);
  const [availableSigners, setAvailableSigners] = useState([]);
  const [loadingSigners, setLoadingSigners] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;

    const loadNegotiationSigners = async () => {
      try {
        setLoadingSigners(true);
        setError('');

        const data = await graphqlClient.query(GET_NEGOTIATION_SIGNERS);
        if (!isMounted) return;

        const signers = (data.negotiationSigners || [])
          .filter(signer => signer.active !== false)
          .map(signer => signer.name)
          .filter(Boolean);

        setAvailableSigners(signers);
      } catch (err) {
        if (isMounted) {
          setAvailableSigners([]);
          setError('No se pudo cargar la lista de firmantes de Negociaciones');
        }
        console.error('Error cargando firmantes de Negociaciones:', err);
      } finally {
        if (isMounted) {
          setLoadingSigners(false);
        }
      }
    };

    loadNegotiationSigners();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  const handleSelectSigner = () => {
    if (!selectedSigner) {
      setError('Por favor selecciona quien esta firmando');
      return;
    }
    setError('');
    setStep(2);
  };

  const handleConfirm = async () => {
    if (!password) {
      setError('Por favor ingresa la contraseña del integrante seleccionado');
      return;
    }

    try {
      setLoading(true);
      const data = await graphqlClient.query(VERIFY_PASSWORD, {
        name: selectedSigner,
        password
      });

      if (data.verifyNegotiationSignerPassword.valid) {
        onConfirm(selectedSigner);
        handleClose();
      } else {
        setError(data.verifyNegotiationSignerPassword.message || 'No se pudo verificar la identidad');
      }
    } catch (err) {
      setError('Error al verificar la contraseña');
      console.error('Error verificando contraseña:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep(1);
    setPassword('');
    setPasswordInputReady(false);
    setError('');
  };

  const handleClose = () => {
    setSelectedSigner('');
    setPassword('');
    setPasswordInputReady(false);
    setError('');
    setStep(1);
    onClose();
  };
  if (!isOpen) return null;

  return (
    <div className="real-signer-modal-overlay">
      <div className={`real-signer-modal-content real-signer-modal-${action}`}>
        <div className="real-signer-modal-header">
          <div className="real-signer-header-content">
            {step === 1 ? (
              <>
                <h2>Quien {action === 'firmar' ? 'firma' : 'rechaza'} este documento?</h2>
                <p className="real-signer-instruction">
                  Selecciona el nombre de la persona que esta realizando esta accion
                </p>
              </>
            ) : (
              <>
                <h2>Verificacion de identidad</h2>
                <p className="real-signer-instruction">
                  Ingresa la contraseña de Directorio Activo de <strong>{selectedSigner}</strong>
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
              {loadingSigners ? (
                <div className="real-signer-loading">Cargando firmantes...</div>
              ) : availableSigners.length === 0 ? (
                <div className="real-signer-loading">No hay firmantes de Negociaciones activos</div>
              ) : availableSigners.map((signer) => (
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
            <div className="real-signer-password-input">
              <label className="real-signer-password-label" htmlFor="real-signer-password">
                Contraseña
              </label>
              <input
                type="text"
                name="negotiation-verification-user"
                value={selectedSigner}
                autoComplete="username"
                readOnly
                tabIndex="-1"
                className="real-signer-autofill-decoy"
              />
              <input
                id="real-signer-password"
                name={`negotiation-ad-verification-${selectedSigner.replace(/\W+/g, '-').toLowerCase()}`}
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError('');
                }}
                onFocus={() => setPasswordInputReady(true)}
                onMouseDown={() => setPasswordInputReady(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && password && !loading) {
                    handleConfirm();
                  }
                }}
                readOnly={!passwordInputReady}
                className="real-signer-password-field"
                autoComplete="new-password"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
              />
              <p className="real-signer-password-hint">Usa la contraseña del integrante seleccionado, no la de la cuenta Negociaciones.</p>
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
              Volver
            </button>
          )}
          <button className="real-signer-btn-cancel" onClick={handleClose}>
            Cancelar
          </button>
          <button
            className={`real-signer-btn-confirm real-signer-btn-${action}`}
            onClick={step === 1 ? handleSelectSigner : handleConfirm}
            disabled={step === 1 ? (!selectedSigner || loadingSigners) : !password || loading}
          >
            {loading ? 'Verificando...' : (step === 1 ? 'Continuar' : (action === 'firmar' ? 'Firmar documento' : 'Rechazar documento'))}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RealSignerModal;
