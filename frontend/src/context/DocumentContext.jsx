import { createContext, useState, useCallback, useContext } from 'react';
import { AuthContext } from './AuthContext';
import { DOCUMENT_STATUS, ERROR_MESSAGES } from '../utils/constants';
import { getErrorMessage } from '../utils/helpers';

/**
 * Context para manejo de documentos
 * Proporciona estado y funciones relacionadas con documentos
 */
export const DocumentContext = createContext();

export const DocumentProvider = ({ children }) => {
  const { token, handleAuthError } = useContext(AuthContext);

  // Estado de documentos
  const [pendingDocuments, setPendingDocuments] = useState([]);
  const [signedDocuments, setSignedDocuments] = useState([]);
  const [myDocuments, setMyDocuments] = useState([]);
  const [rejectedByMe, setRejectedByMe] = useState([]);
  const [rejectedByOthers, setRejectedByOthers] = useState([]);
  const [viewingDocument, setViewingDocument] = useState(null);

  // Estado de carga
  const [loadingPending, setLoadingPending] = useState(false);
  const [loadingSigned, setLoadingSigned] = useState(false);
  const [loadingMy, setLoadingMy] = useState(false);
  const [loadingRejected, setLoadingRejected] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Estado de errores
  const [error, setError] = useState(null);

  // Estado de tipos de documento
  const [documentTypes, setDocumentTypes] = useState([]);
  const [selectedDocumentType, setSelectedDocumentType] = useState(null);

  /**
   * Realiza una consulta GraphQL
   */
  const graphqlQuery = useCallback(async (query, variables = {}) => {
    try {
      const response = await fetch(import.meta.env.VITE_API_URL || 'http://192.168.0.30:5001/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ query, variables })
      });

      const result = await response.json();

      if (result.errors) {
        const error = result.errors[0];

        // Manejar error de autenticación
        if (handleAuthError(error)) {
          throw new Error(ERROR_MESSAGES.AUTH_ERROR);
        }

        throw new Error(getErrorMessage(error));
      }

      return result.data;
    } catch (err) {
      throw err;
    }
  }, [token, handleAuthError]);

  /**
   * Carga documentos pendientes
   */
  const fetchPendingDocuments = useCallback(async () => {
    try {
      setLoadingPending(true);
      setError(null);

      const data = await graphqlQuery(`
        query {
          pendingDocuments {
            id
            title
            description
            file_name
            file_path
            status
            created_at
            uploaded_by
            uploader_name
            document_type_code
            my_signature_status
            my_order_position
            current_required_position
            signers {
              id
              name
              order_position
              status
              signed_at
              role_code
              role_name
            }
          }
        }
      `);

      setPendingDocuments(data.pendingDocuments || []);
      return data.pendingDocuments;
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Error fetching pending documents:', err);
      return [];
    } finally {
      setLoadingPending(false);
    }
  }, [graphqlQuery]);

  /**
   * Carga documentos firmados
   */
  const fetchSignedDocuments = useCallback(async () => {
    try {
      setLoadingSigned(true);
      setError(null);

      const data = await graphqlQuery(`
        query {
          signedDocuments {
            id
            title
            description
            file_name
            status
            created_at
            uploaded_by
            uploader_name
            document_type_code
            signers {
              id
              name
              status
              signed_at
              role_code
              role_name
            }
          }
        }
      `);

      setSignedDocuments(data.signedDocuments || []);
      return data.signedDocuments;
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Error fetching signed documents:', err);
      return [];
    } finally {
      setLoadingSigned(false);
    }
  }, [graphqlQuery]);

  /**
   * Carga mis documentos
   */
  const fetchMyDocuments = useCallback(async () => {
    try {
      setLoadingMy(true);
      setError(null);

      const data = await graphqlQuery(`
        query {
          myDocuments {
            id
            title
            description
            file_name
            status
            created_at
            document_type_code
            signers {
              id
              name
              order_position
              status
              signed_at
              role_code
              role_name
            }
          }
        }
      `);

      setMyDocuments(data.myDocuments || []);
      return data.myDocuments;
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Error fetching my documents:', err);
      return [];
    } finally {
      setLoadingMy(false);
    }
  }, [graphqlQuery]);

  /**
   * Carga documentos rechazados por mí
   */
  const fetchRejectedByMe = useCallback(async () => {
    try {
      setLoadingRejected(true);
      setError(null);

      const data = await graphqlQuery(`
        query {
          rejectedByMeDocuments {
            id
            title
            description
            file_name
            status
            created_at
            uploaded_by
            uploader_name
            rejection_reason
            rejected_at
            document_type_code
            signers {
              id
              name
              status
              role_code
              role_name
            }
          }
        }
      `);

      setRejectedByMe(data.rejectedByMeDocuments || []);
      return data.rejectedByMeDocuments;
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Error fetching rejected by me documents:', err);
      return [];
    } finally {
      setLoadingRejected(false);
    }
  }, [graphqlQuery]);

  /**
   * Carga documentos rechazados por otros
   */
  const fetchRejectedByOthers = useCallback(async () => {
    try {
      setLoadingRejected(true);
      setError(null);

      const data = await graphqlQuery(`
        query {
          rejectedByOthersDocuments {
            id
            title
            description
            file_name
            status
            created_at
            document_type_code
            rejector_name
            rejection_reason
            rejected_at
            signers {
              id
              name
              status
              rejection_reason
              role_code
              role_name
            }
          }
        }
      `);

      setRejectedByOthers(data.rejectedByOthersDocuments || []);
      return data.rejectedByOthersDocuments;
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      console.error('Error fetching rejected by others documents:', err);
      return [];
    } finally {
      setLoadingRejected(false);
    }
  }, [graphqlQuery]);

  /**
   * Carga tipos de documentos
   */
  const fetchDocumentTypes = useCallback(async () => {
    try {
      const data = await graphqlQuery(`
        query {
          documentTypes {
            id
            name
            code
            prefix
          }
        }
      `);

      setDocumentTypes(data.documentTypes || []);
      return data.documentTypes;
    } catch (err) {
      console.error('Error fetching document types:', err);
      return [];
    }
  }, [graphqlQuery]);

  /**
   * Firma un documento
   */
  const signDocument = useCallback(async (documentId, consecutivo = null) => {
    try {
      const data = await graphqlQuery(`
        mutation SignDocument($documentId: ID!, $consecutivo: String) {
          signDocument(documentId: $documentId, consecutivo: $consecutivo) {
            id
            status
          }
        }
      `, { documentId, consecutivo });

      // Actualizar listas de documentos
      await fetchPendingDocuments();
      await fetchSignedDocuments();

      return { success: true, document: data.signDocument };
    } catch (err) {
      const errorMessage = getErrorMessage(err, ERROR_MESSAGES.SIGNATURE_FAILED);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [graphqlQuery, fetchPendingDocuments, fetchSignedDocuments]);

  /**
   * Rechaza un documento
   */
  const rejectDocument = useCallback(async (documentId, reason) => {
    try {
      const data = await graphqlQuery(`
        mutation RejectDocument($documentId: ID!, $reason: String!) {
          rejectDocument(documentId: $documentId, reason: $reason) {
            id
            status
          }
        }
      `, { documentId, reason });

      // Actualizar listas de documentos
      await fetchPendingDocuments();
      await fetchRejectedByMe();

      return { success: true, document: data.rejectDocument };
    } catch (err) {
      const errorMessage = getErrorMessage(err, ERROR_MESSAGES.REJECTION_FAILED);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [graphqlQuery, fetchPendingDocuments, fetchRejectedByMe]);

  /**
   * Asigna firmantes a un documento
   */
  const assignSigners = useCallback(async (documentId, signers) => {
    try {
      const data = await graphqlQuery(`
        mutation AssignSigners($documentId: ID!, $signers: [SignerInput!]!) {
          assignSigners(documentId: $documentId, signers: $signers) {
            id
            status
          }
        }
      `, {
        documentId,
        signers: signers.map(s => ({
          userId: s.userId || s.id,
          order: s.order || s.order_position,
          roleCode: s.roleCode || s.role_code
        }))
      });

      // Actualizar lista de mis documentos
      await fetchMyDocuments();

      return { success: true, document: data.assignSigners };
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  }, [graphqlQuery, fetchMyDocuments]);

  /**
   * Establece el documento que se está viendo
   */
  const setDocumentViewing = useCallback((document) => {
    setViewingDocument(document);
  }, []);

  /**
   * Limpia el error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Refresca todas las listas de documentos
   */
  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchPendingDocuments(),
      fetchSignedDocuments(),
      fetchMyDocuments(),
      fetchRejectedByMe(),
      fetchRejectedByOthers(),
      fetchDocumentTypes()
    ]);
  }, [
    fetchPendingDocuments,
    fetchSignedDocuments,
    fetchMyDocuments,
    fetchRejectedByMe,
    fetchRejectedByOthers,
    fetchDocumentTypes
  ]);

  const value = {
    // Estado de documentos
    pendingDocuments,
    signedDocuments,
    myDocuments,
    rejectedByMe,
    rejectedByOthers,
    viewingDocument,
    documentTypes,
    selectedDocumentType,

    // Estado de carga
    loadingPending,
    loadingSigned,
    loadingMy,
    loadingRejected,
    uploading,

    // Estado de errores
    error,

    // Funciones de fetch
    fetchPendingDocuments,
    fetchSignedDocuments,
    fetchMyDocuments,
    fetchRejectedByMe,
    fetchRejectedByOthers,
    fetchDocumentTypes,

    // Acciones
    signDocument,
    rejectDocument,
    assignSigners,
    setDocumentViewing,
    setSelectedDocumentType,
    setUploading,

    // Utilidades
    clearError,
    refreshAll
  };

  return (
    <DocumentContext.Provider value={value}>
      {children}
    </DocumentContext.Provider>
  );
};
