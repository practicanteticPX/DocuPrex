import { useState, useEffect, useRef } from 'react';
import './DocumentTypeSelector.css';

/**
 * DocumentTypeSelector - Dropdown component for selecting document types
 *
 * Allows users to choose between predefined document types or no specific type.
 * Selected state is indicated by background color rather than checkmarks for
 * cleaner UX.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Array<Object>} props.documentTypes - Array of available document types
 * @param {Object|null} props.selectedDocumentType - Currently selected document type or null
 * @param {Function} props.onDocumentTypeChange - Callback fired when selection changes
 * @param {boolean} [props.disabled=false] - Whether the selector is disabled
 *
 * @example
 * ```jsx
 * <DocumentTypeSelector
 *   documentTypes={[{id: 1, name: 'Invoice', description: 'Invoice type', roles: []}]}
 *   selectedDocumentType={null}
 *   onDocumentTypeChange={(type) => setSelectedType(type)}
 *   disabled={false}
 * />
 * ```
 */
const DocumentTypeSelector = ({
  documentTypes,
  selectedDocumentType,
  onDocumentTypeChange,
  disabled = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
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
          {selectedDocumentType ? selectedDocumentType.name : 'Sin tipo específico'}
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
          {/* Default option: No specific type */}
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

          {/* Document type options */}
          {documentTypes
            .sort((a, b) => {
              // Ordenar: SA primero, luego FV
              const order = { 'SA': 1, 'FV': 2 };
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
