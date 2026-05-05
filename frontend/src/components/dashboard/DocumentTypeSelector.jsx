import { useState, useEffect, useRef } from 'react';
import './DocumentTypeSelector.css';

/**
 * DocumentTypeSelector - Dropdown component for selecting document types.
 *
 * The "no specific type" option can be disabled with allowNoSpecificType=false.
 * To re-enable uploads without type, pass true from the parent.
 */
const DocumentTypeSelector = ({
  documentTypes,
  selectedDocumentType,
  onDocumentTypeChange,
  disabled = false,
  allowNoSpecificType = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target) && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelectType = (type) => {
    onDocumentTypeChange(type);
    setIsOpen(false);
  };

  const handleToggleDropdown = () => {
    if (!disabled) {
      setIsOpen(!isOpen);
    }
  };

  return (
    <div className="doc-type-selector" ref={dropdownRef}>
      <button
        type="button"
        className="doc-type-selector__trigger"
        onClick={handleToggleDropdown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className="doc-type-selector__value">
          {selectedDocumentType
            ? selectedDocumentType.name
            : allowNoSpecificType
              ? 'Sin tipo específico'
              : 'Selecciona un tipo de documento'}
        </span>
        <svg
          className={`doc-type-selector__arrow ${isOpen ? 'doc-type-selector__arrow--open' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <polyline
            points="6 9 12 15 18 9"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <ul className="doc-type-selector__dropdown" role="listbox">
          {allowNoSpecificType && (
            <li
              className={`doc-type-selector__option ${!selectedDocumentType ? 'doc-type-selector__option--selected' : ''}`}
              onClick={() => handleSelectType(null)}
              role="option"
              aria-selected={!selectedDocumentType}
            >
              <div className="doc-type-selector__option-content">
                <p className="doc-type-selector__option-name">Sin tipo específico</p>
                <p className="doc-type-selector__option-description">
                  Documento sin plantilla predefinida
                </p>
              </div>
            </li>
          )}

          {documentTypes
            .filter((type) => type.code !== 'FV')
            .sort((a, b) => {
              const order = { SA: 1, FV: 2 };
              return (order[a.code] || 999) - (order[b.code] || 999);
            })
            .map((type) => (
              <li
                key={type.id}
                className={`doc-type-selector__option ${selectedDocumentType?.id === type.id ? 'doc-type-selector__option--selected' : ''}`}
                onClick={() => handleSelectType(type)}
                role="option"
                aria-selected={selectedDocumentType?.id === type.id}
              >
                <div className="doc-type-selector__option-content">
                  <p className="doc-type-selector__option-name">{type.name}</p>
                </div>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};

export default DocumentTypeSelector;
