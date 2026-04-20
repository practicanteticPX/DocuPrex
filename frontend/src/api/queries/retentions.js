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
        signedAt
        roleCode
        roleName
        roleNames
        roleCodes
      }
    }
  }
`;

/**
 * Mutation para retener un documento (llamada independiente, NO integrada en firma)
 */
export const RETAIN_DOCUMENT = `
  mutation RetainDocument($documentId: ID!, $retentionPercentage: Int!, $retentionReason: String!) {
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
  mutation ReleaseDocument($documentId: ID!) {
    releaseDocument(documentId: $documentId)
  }
`;
