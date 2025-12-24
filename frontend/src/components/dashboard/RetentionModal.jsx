import { useState, useEffect } from 'react';
import './RetentionModal.css';

/**
 * Modal para retención de facturas FV por responsables de centro de costos
 */
function RetentionModal({ isOpen, onClose, onConfirm, availableCostCenters = [] }) {
  const [wantsRetention, setWantsRetention] = useState(null); // null, true, false
  const [selectedCentroIndex, setSelectedCentroIndex] = useState(null);
  const [percentage, setPercentage] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: pregunta Sí/No, 2: detalles de retención

  // Auto-seleccionar centro si solo hay uno
  useEffect(() => {
    if (availableCostCenters.length === 1) {
      setSelectedCentroIndex(availableCostCenters[0].index);
    }
  }, [availableCostCenters]);

  const handleWantsRetentionChange = (value) => {
    setWantsRetention(value);
    setError('');
    if (value === true) {
      setStep(2);
    }
  };

  const handleConfirm = () => {
    if (wantsRetention === null) {
      setError('Por favor selecciona una opción');
      return;
    }

    if (wantsRetention === false) {
      // Firmar sin retener
      onConfirm(false);
      handleClose();
      return;
    }

    // Validaciones para retención
    if (availableCostCenters.length > 1 && selectedCentroIndex === null) {
      setError('Debes seleccionar un centro de costo');
      return;
    }

    if (!percentage || percentage === '') {
      setError('Debes ingresar el porcentaje de retención');
      return;
    }

    if (!reason || reason.trim() === '') {
      setError('Debes ingresar el motivo de la retención');
      return;
    }

    const percentageNum = parseInt(percentage);
    const selectedCentro = availableCostCenters.find(c => c.index === selectedCentroIndex);
    const maxPercentage = selectedCentro ? selectedCentro.porcentaje : 100;

    if (percentageNum < 1 || percentageNum > maxPercentage) {
      setError(`El porcentaje debe estar entre 1 y ${maxPercentage}% (máximo asignado a este centro)`);
      return;
    }

    // Confirmar retención
    onConfirm(true, percentageNum, reason.trim(), selectedCentroIndex);
    handleClose();
  };

  const handleBack = () => {
    setStep(1);
    setWantsRetention(null);
    setPercentage('');
    setReason('');
    setError('');
  };

  const handleClose = () => {
    setWantsRetention(null);
    setSelectedCentroIndex(availableCostCenters.length === 1 ? availableCostCenters[0].index : null);
    setPercentage('');
    setReason('');
    setError('');
    setStep(1);
    onClose();
  };

  if (!isOpen) return null;

  const selectedCentro = availableCostCenters.find(c => c.index === selectedCentroIndex);
  const maxPercentage = selectedCentro ? selectedCentro.porcentaje : 100;

  return (
    <div className="retention-modal-overlay" onClick={handleClose}>
      <div className="retention-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="retention-modal-header">
          <div className="retention-header-content">
            {step === 1 ? (
              <>
                <h2>Retención de Factura</h2>
                <p className="retention-instruction">
                  ¿Deseas retener esta factura antes de firmarla?
                </p>
              </>
            ) : (
              <>
                <h2>Detalles de la Retención</h2>
                <p className="retention-instruction">
                  Completa la información sobre la retención de la factura
                </p>
              </>
            )}
          </div>
          <button className="retention-modal-close" onClick={handleClose}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        <div className="retention-modal-body">
          {step === 1 ? (
            <div className="retention-choice-list">
              <label className="retention-choice-option">
                <input
                  type="radio"
                  name="retention-choice"
                  value="no"
                  checked={wantsRetention === false}
                  onChange={() => handleWantsRetentionChange(false)}
                />
                <span className="retention-radio"></span>
                <div className="retention-choice-content">
                  <span className="retention-choice-title">No retener</span>
                  <span className="retention-choice-subtitle">Firmar el documento sin retención</span>
                </div>
              </label>

              <label className="retention-choice-option">
                <input
                  type="radio"
                  name="retention-choice"
                  value="yes"
                  checked={wantsRetention === true}
                  onChange={() => handleWantsRetentionChange(true)}
                />
                <span className="retention-radio"></span>
                <div className="retention-choice-content">
                  <span className="retention-choice-title">Retener factura</span>
                  <span className="retention-choice-subtitle">Especificar porcentaje y motivo de retención</span>
                </div>
              </label>
            </div>
          ) : (
            <div className="retention-details-form">
              {/* Selector de centro de costo */}
              {availableCostCenters.length > 1 && (
                <div className="retention-form-field">
                  <label className="retention-field-label">Centro de Costo</label>
                  <select
                    className="retention-select"
                    value={selectedCentroIndex !== null ? selectedCentroIndex : ''}
                    onChange={(e) => {
                      const value = e.target.value !== '' ? parseInt(e.target.value) : null;
                      setSelectedCentroIndex(value);
                      setPercentage(''); // Reset percentage cuando cambia el centro
                      setError('');
                    }}
                  >
                    <option value="">-- Selecciona un centro de costo --</option>
                    {availableCostCenters.map((centro) => (
                      <option key={centro.index} value={centro.index}>
                        {centro.nombre} (Máx: {centro.porcentaje}%)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Info del centro cuando solo hay uno */}
              {availableCostCenters.length === 1 && (
                <div className="retention-info-box">
                  <div className="retention-info-icon">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="retention-info-text">
                    <strong>{availableCostCenters[0].nombre}</strong>
                    <span>Porcentaje máximo: {availableCostCenters[0].porcentaje}%</span>
                  </div>
                </div>
              )}

              {/* Campo de porcentaje */}
              <div className="retention-form-field">
                <label className="retention-field-label">
                  Porcentaje de Retención (1-{maxPercentage}%)
                </label>
                <div className="retention-input-wrapper">
                  <input
                    type="number"
                    min="1"
                    max={maxPercentage}
                    className="retention-input"
                    placeholder={`Ej: ${Math.min(50, maxPercentage)}`}
                    value={percentage}
                    onChange={(e) => {
                      setPercentage(e.target.value);
                      setError('');
                    }}
                  />
                  <span className="retention-input-suffix">%</span>
                </div>
              </div>

              {/* Campo de motivo */}
              <div className="retention-form-field">
                <label className="retention-field-label">Motivo de la Retención</label>
                <textarea
                  className="retention-textarea"
                  rows={4}
                  placeholder="Describe brevemente por qué se retiene esta factura..."
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    setError('');
                  }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="retention-error">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="retention-modal-footer">
          {step === 2 && (
            <button className="retention-btn-back" onClick={handleBack}>
              ← Volver
            </button>
          )}
          <button className="retention-btn-cancel" onClick={handleClose}>
            Cancelar
          </button>
          <button
            className={`retention-btn-confirm ${wantsRetention === false ? 'retention-btn-no-retention' : 'retention-btn-retention'}`}
            onClick={handleConfirm}
            disabled={wantsRetention === null || (step === 2 && (!percentage || !reason))}
          >
            {step === 1
              ? (wantsRetention === false ? 'Firmar sin retener' : 'Continuar')
              : 'Firmar y retener'
            }
          </button>
        </div>
      </div>
    </div>
  );
}

export default RetentionModal;
