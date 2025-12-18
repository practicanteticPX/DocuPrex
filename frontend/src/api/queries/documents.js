/**
 * Queries GraphQL para documentos
 * Contiene todas las consultas relacionadas con documentos
 */

/**
 * Fragment común de documento
 */
export const DOCUMENT_FRAGMENT = `
  fragment DocumentFields on Document {
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
  }
`;

/**
 * Fragment de firmante
 */
export const SIGNER_FRAGMENT = `
  fragment SignerFields on Signer {
    id
    name
    email
    order_position
    status
    signed_at
    rejected_at
    rejection_reason
    role_code
    role_name
    role_names
    consecutivo
  }
`;

/**
 * Obtiene documentos pendientes de firma
 */
export const GET_PENDING_DOCUMENTS = `
  query GetPendingDocuments {
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
      signatures {
        id
        signer {
          name
          email
        }
        order_position
        status
        signed_at
        role_code
        role_name
        role_names
      }
    }
  }
`;

/**
 * Obtiene documentos firmados
 */
export const GET_SIGNED_DOCUMENTS = `
  query GetSignedDocuments {
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
      signatures {
        id
        signer {
          name
          email
        }
        status
        signed_at
        role_code
        role_name
        role_names
        consecutivo
      }
    }
  }
`;

/**
 * Obtiene mis documentos
 */
export const GET_MY_DOCUMENTS = `
  query GetMyDocuments {
    myDocuments {
      id
      title
      description
      file_name
      status
      created_at
      document_type_code
      signatures {
        id
        signer {
          name
          email
        }
        order_position
        status
        signed_at
        rejected_at
        rejection_reason
        role_code
        role_name
        role_names
        consecutivo
      }
    }
  }
`;

/**
 * Obtiene documentos rechazados por mí
 */
export const GET_REJECTED_BY_ME_DOCUMENTS = `
  query GetRejectedByMeDocuments {
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
      signatures {
        id
        signer {
          name
          email
        }
        status
        role_code
        role_name
        role_names
      }
    }
  }
`;

/**
 * Obtiene documentos rechazados por otros
 */
export const GET_REJECTED_BY_OTHERS_DOCUMENTS = `
  query GetRejectedByOthersDocuments {
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
      signatures {
        id
        signer {
          name
          email
        }
        status
        rejection_reason
        role_code
        role_name
        role_names
      }
    }
  }
`;

/**
 * Obtiene un documento por ID
 */
export const GET_DOCUMENT_BY_ID = `
  query GetDocumentById($id: Int!) {
    document(id: $id) {
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
      signatures {
        id
        signer {
          name
          email
        }
        order_position
        status
        signed_at
        rejected_at
        rejection_reason
        role_code
        role_name
        role_names
        consecutivo
      }
    }
  }
`;

/**
 * Obtiene todos los documentos (admin)
 */
export const GET_ALL_DOCUMENTS = `
  query GetAllDocuments {
    documents {
      id
      title
      description
      file_name
      status
      created_at
      uploaded_by
      uploader_name
      document_type_code
      signatures {
        id
        signer {
          name
          email
        }
        status
        signed_at
        role_code
        role_name
        role_names
      }
    }
  }
`;

/**
 * Obtiene tipos de documentos
 */
export const GET_DOCUMENT_TYPES = `
  query GetDocumentTypes {
    documentTypes {
      id
      name
      code
      prefix
    }
  }
`;

/**
 * Obtiene roles por tipo de documento
 */
export const GET_DOCUMENT_TYPE_ROLES = `
  query GetDocumentTypeRoles($documentTypeId: Int!) {
    documentTypeRoles(documentTypeId: $documentTypeId) {
      id
      document_type_id
      role_name
      role_code
      order_position
    }
  }
`;

/**
 * Busca documentos
 */
export const SEARCH_DOCUMENTS = `
  query SearchDocuments($searchTerm: String!, $status: String) {
    searchDocuments(searchTerm: $searchTerm, status: $status) {
      id
      title
      description
      file_name
      status
      created_at
      uploaded_by
      uploader_name
      document_type_code
    }
  }
`;
