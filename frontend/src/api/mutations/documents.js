/**
 * Mutations GraphQL para documentos
 * Contiene todas las mutaciones relacionadas con documentos
 */

/**
 * Sube un documento (Note: Esto se hace por REST API, pero incluimos por completitud)
 */
export const UPLOAD_DOCUMENT = `
  mutation UploadDocument($file: Upload!, $title: String!, $description: String, $documentTypeId: ID) {
    uploadDocument(file: $file, title: $title, description: $description, documentTypeId: $documentTypeId) {
      id
      title
      description
      file_name
      status
      created_at
    }
  }
`;

/**
 * Asigna firmantes a un documento
 */
export const ASSIGN_SIGNERS = `
  mutation AssignSigners($documentId: ID!, $signers: [SignerInput!]!) {
    assignSigners(documentId: $documentId, signers: $signers) {
      id
      status
      signers {
        id
        name
        order_position
        status
        role_code
        role_name
      }
    }
  }
`;

/**
 * Firma un documento
 */
export const SIGN_DOCUMENT = `
  mutation SignDocument($documentId: ID!, $consecutivo: String) {
    signDocument(documentId: $documentId, consecutivo: $consecutivo) {
      id
      status
      signers {
        id
        status
        signed_at
        consecutivo
      }
    }
  }
`;

/**
 * Rechaza un documento
 */
export const REJECT_DOCUMENT = `
  mutation RejectDocument($documentId: ID!, $reason: String!) {
    rejectDocument(documentId: $documentId, reason: $reason) {
      id
      status
      signers {
        id
        status
        rejected_at
        rejection_reason
      }
    }
  }
`;

/**
 * Actualiza un documento
 */
export const UPDATE_DOCUMENT = `
  mutation UpdateDocument($id: ID!, $title: String, $description: String) {
    updateDocument(id: $id, title: $title, description: $description) {
      id
      title
      description
    }
  }
`;

/**
 * Elimina un documento
 */
export const DELETE_DOCUMENT = `
  mutation DeleteDocument($id: ID!) {
    deleteDocument(id: $id)
  }
`;

/**
 * Archiva un documento
 */
export const ARCHIVE_DOCUMENT = `
  mutation ArchiveDocument($id: ID!) {
    archiveDocument(id: $id) {
      id
      status
    }
  }
`;

/**
 * Actualiza el orden de los firmantes
 */
export const UPDATE_SIGNERS_ORDER = `
  mutation UpdateSignersOrder($documentId: ID!, $signers: [SignerOrderInput!]!) {
    updateSignersOrder(documentId: $documentId, signers: $signers) {
      id
      signers {
        id
        order_position
      }
    }
  }
`;

/**
 * Remueve un firmante de un documento
 */
export const REMOVE_SIGNER = `
  mutation RemoveSigner($documentId: ID!, $signerId: ID!) {
    removeSigner(documentId: $documentId, signerId: $signerId) {
      id
      signers {
        id
        name
      }
    }
  }
`;

/**
 * Crea un tipo de documento
 */
export const CREATE_DOCUMENT_TYPE = `
  mutation CreateDocumentType($name: String!, $code: String!, $prefix: String!) {
    createDocumentType(name: $name, code: $code, prefix: $prefix) {
      id
      name
      code
      prefix
    }
  }
`;

/**
 * Actualiza un tipo de documento
 */
export const UPDATE_DOCUMENT_TYPE = `
  mutation UpdateDocumentType($id: ID!, $name: String, $code: String, $prefix: String) {
    updateDocumentType(id: $id, name: $name, code: $code, prefix: $prefix) {
      id
      name
      code
      prefix
    }
  }
`;

/**
 * Elimina un tipo de documento
 */
export const DELETE_DOCUMENT_TYPE = `
  mutation DeleteDocumentType($id: ID!) {
    deleteDocumentType(id: $id)
  }
`;
