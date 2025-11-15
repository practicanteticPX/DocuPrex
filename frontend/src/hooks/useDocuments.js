import { useContext } from 'react';
import { DocumentContext } from '../context/DocumentContext';

/**
 * Hook personalizado para usar el DocumentContext
 * Proporciona acceso a todas las funciones y estado de documentos
 *
 * @example
 * const { pendingDocuments, fetchPendingDocuments, signDocument } = useDocuments();
 */
export const useDocuments = () => {
  const context = useContext(DocumentContext);

  if (!context) {
    throw new Error('useDocuments must be used within a DocumentProvider');
  }

  return context;
};
