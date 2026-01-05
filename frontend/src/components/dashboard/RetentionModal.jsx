import { useState, useEffect } from 'react';
import './RetentionModal.css';

/**
 * Modal para retención de facturas FV por responsables de centro de costos
 * Soporta retención de múltiples centros de costos independientemente
 */
function RetentionModal({ isOpen, onClose, onConfirm, availableCostCenters = [] }) {
  const [wantsRetention, setWantsRetention] = useState(null);
  const [retentions, setRetentions] = useState({});
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (availableCostCenters.length > 0) {
      const initialRetentions = {};
      availableCostCenters.forEach(centro => {
        initialRetentions[centro.index] = {
          selected: false,
          percentage: '',
          reason: ''
        };
      });
      setRetentions(initialRetentions);
    }
  }, [availableCostCenters]);

  const handleWantsRetentionChange = (value) => {
    setWantsRetention(value);
    setError('');
    if (value === true) {
      setStep(2);
    }
  };

  const toggleCentroSelection = (centroIndex) => {
    setRetentions(prev => ({
      ...prev,
      [centroIndex]: {
        ...prev[centroIndex],
        selected: !prev[centroIndex].selected
      }
    }));
    setError('');
  };

  const updateRetentionData = (centroIndex, field, value) => {
    // Si es el campo de porcentaje, validar y limitar
    if (field === 'percentage') {
      const centro = availableCostCenters.find(c => c.index === centroIndex);
      const maxPercentage = centro ? centro.porcentaje : 100;

      // Permitir campo vacío para que el usuario pueda borrar
      if (value === '') {
        setRetentions(prev => ({
          ...prev,
          [centroIndex]: {
            ...prev[centroIndex],
            [field]: ''
          }
        }));
        return;
      }

      // Convertir a número y validar
      const numValue = parseInt(value);

      // Si es inválido, no actualizar
      if (isNaN(numValue)) {
        return;
      }

      // Limitar al máximo permitido
      const limitedValue = Math.min(Math.max(0, numValue), maxPercentage);

      setRetentions(prev => ({
        ...prev,
        [centroIndex]: {
          ...prev[centroIndex],
          [field]: limitedValue.toString()
        }
      }));
    } else {
      // Para otros campos, actualizar normalmente
      setRetentions(prev => ({
        ...prev,
        [centroIndex]: {
          ...prev[centroIndex],
          [field]: value
        }
      }));
    }
    setError('');
  };

  const handleConfirm = () => {
    if (wantsRetention === null) {
      setError('Por favor selecciona una opción');
      return;
    }

    if (wantsRetention === false) {
      // Firmar sin retener
      onConfirm(false, []);
      handleClose();
      return;
    }

    // Validar que al menos un centro esté seleccionado
    const selectedRetentions = Object.entries(retentions)
      .filter(([_, data]) => data.selected)
      .map(([index, data]) => ({
        centroCostoIndex: parseInt(index),
        percentage: data.percentage,
        reason: data.reason
      }));

    if (selectedRetentions.length === 0) {
      setError('Debes seleccionar al menos un centro de costo para retener');
      return;
    }

    // Validar cada retención seleccionada
    for (const retention of selectedRetentions) {
      const centro = availableCostCenters.find(c => c.index === retention.centroCostoIndex);

      if (!retention.percentage || retention.percentage === '') {
        setError(`Debes ingresar el porcentaje de retención para ${centro.nombre}`);
        return;
      }

      if (!retention.reason || retention.reason.trim() === '') {
        setError(`Debes ingresar el motivo de retención para ${centro.nombre}`);
        return;
      }

      const percentageNum = parseInt(retention.percentage);
      const maxPercentage = centro.porcentaje;

      if (percentageNum < 1 || percentageNum > maxPercentage) {
        setError(`El porcentaje para ${centro.nombre} debe estar entre 1 y ${maxPercentage}%`);
        return;
      }

      // Actualizar con el valor numérico
      retention.percentage = percentageNum;
      retention.reason = retention.reason.trim();
    }

    // Confirmar retenciones múltiples
    onConfirm(true, selectedRetentions);
    handleClose();
  };

  const handleBack = () => {
    setStep(1);
    setWantsRetention(null);
    setError('');
  };

  const handleClose = () => {
    setWantsRetention(null);
    const initialRetentions = {};
    availableCostCenters.forEach(centro => {
      initialRetentions[centro.index] = {
        selected: false,
        percentage: '',
        reason: ''
      };
    });
    setRetentions(initialRetentions);
    setError('');
    setStep(1);
    onClose();
  };

  if (!isOpen) return null;

  const selectedCount = Object.values(retentions).filter(r => r.selected).length;

  // Helper para determinar si un porcentaje es inválido
  const isPercentageInvalid = (centroIndex, percentage) => {
    if (!percentage || percentage === '') return false;
    const centro = availableCostCenters.find(c => c.index === centroIndex);
    if (!centro) return false;
    const numValue = parseInt(percentage);
    return numValue < 1 || numValue > centro.porcentaje;
  };

  return (
    <div className="retention-modal-overlay">
      <div className="retention-modal-content">
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
                  Selecciona los centros de costo que deseas retener ({selectedCount} seleccionado{selectedCount !== 1 ? 's' : ''})
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
            <div className="retention-multiple-centers">
              {availableCostCenters.map((centro) => {
                const retentionData = retentions[centro.index] || { selected: false, percentage: '', reason: '' };

                return (
                  <div key={centro.index} className={`retention-centro-card ${retentionData.selected ? 'selected' : ''}`}>
                    {/* Header con checkbox */}
                    <div className="retention-centro-header">
                      <label className="retention-centro-checkbox-label">
                        <input
                          type="checkbox"
                          checked={retentionData.selected}
                          onChange={() => toggleCentroSelection(centro.index)}
                          className="retention-centro-checkbox"
                        />
                        <span className="retention-centro-checkbox-custom"></span>
                        <div className="retention-centro-info">
                          <strong className="retention-centro-name">{centro.nombre}</strong>
                          <span className="retention-centro-max">Máximo: {centro.porcentaje}%</span>
                        </div>
                      </label>
                    </div>

                    {/* Campos de porcentaje y motivo (solo si está seleccionado) */}
                    {retentionData.selected && (
                      <div className="retention-centro-fields">
                        <div className="retention-form-field">
                          <label className="retention-field-label">
                            Porcentaje (1-{centro.porcentaje}%)
                          </label>
                          <div className="retention-input-wrapper">
                            <input
                              type="number"
                              min="1"
                              max={centro.porcentaje}
                              className={`retention-input ${isPercentageInvalid(centro.index, retentionData.percentage) ? 'invalid' : ''}`}
                              placeholder={`Ej: ${Math.min(50, centro.porcentaje)}`}
                              value={retentionData.percentage}
                              onChange={(e) => updateRetentionData(centro.index, 'percentage', e.target.value)}
                            />
                            <span className="retention-input-suffix">%</span>
                          </div>
                        </div>

                        <div className="retention-form-field">
                          <label className="retention-field-label">Motivo</label>
                          <textarea
                            className="retention-textarea"
                            rows={3}
                            placeholder="Motivo de la retención..."
                            value={retentionData.reason}
                            onChange={(e) => updateRetentionData(centro.index, 'reason', e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
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
            disabled={wantsRetention === null}
          >
            {step === 1
              ? (wantsRetention === false ? 'Firmar sin retener' : 'Continuar')
              : `Firmar${selectedCount > 0 ? ` y retener (${selectedCount})` : ''}`
            }
          </button>
        </div>
      </div>
    </div>
  );
}

export default RetentionModal;
