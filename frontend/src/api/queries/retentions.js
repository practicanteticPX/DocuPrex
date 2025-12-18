/**
 * Queries y Mutations GraphQL para retenciones de facturas
 */

/**
 * Query para obtener documentos retenidos
 */
export const GET_RETAINED_DOCUMENTS = `
  query GetRetainedDocuments {
    retainedDocuments {
      id
      title
      description
      file_name
      status
      created_at
      uploaded_by
      uploader_name
      document_type_code
      retention {
        id
        retentionPercentage
        retentionReason
        retainedAt
        retainedBy {
          id
          name
          email
        }
      }
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
 * Mutation para retener un documento (llamada independiente, NO integrada en firma)
 */
export const RETAIN_DOCUMENT = `
  mutation RetainDocument($documentId: Int!, $retentionPercentage: Int!, $retentionReason: String!) {
    retainDocument(documentId: $documentId, retentionPercentage: $retentionPercentage, retentionReason: $retentionReason) {
      id
      documentId
      retentionPercentage
      retentionReason
      retainedAt
      retainedBy {
        id
        name
        email
      }
    }
  }
`;

/**
 * Mutation para liberar un documento retenido
 */
export const RELEASE_DOCUMENT = `
  mutation ReleaseDocument($documentId: Int!) {
    releaseDocument(documentId: $documentId)
  }
`;
