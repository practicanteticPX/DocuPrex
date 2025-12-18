const { gql } = require('apollo-server-express');

const typeDefs = gql`
  scalar Upload

  type User {
    id: Int!
    name: String!
    email: String!
    role: String!
    adUsername: String
    isActive: Boolean!
    emailNotifications: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type Document {
    id: Int!
    title: String!
    description: String
    fileName: String!
    filePath: String!
    fileSize: Int!
    mimeType: String!
    status: String!
    uploadedBy: User!
    uploadedById: Int!
    documentType: DocumentType
    documentTypeId: Int
    consecutivo: String
    templateData: String
    createdAt: String!
    updatedAt: String!
    completedAt: String
    # Campos calculados
    totalSigners: Int
    signedCount: Int
    pendingCount: Int
    signatures: [Signature!]
    # Campos de firma (solo disponibles en signedDocuments)
    signedAt: String
    signatureType: String
    # Retención
    retention: DocumentRetention
  }

  type Signature {
    id: ID!
    document: Document
    documentId: Int
    signer: User
    signerId: Int
    signatureData: String
    signatureType: String
    ipAddress: String
    userAgent: String
    status: String!
    rejectionReason: String
    rejectedAt: String
    signedAt: String
    consecutivo: String
    realSignerName: String
    createdAt: String
    updatedAt: String
    roleName: String
    roleNames: [String!]
    roleCode: String
    orderPosition: Int
    # Campos para grupos de causación
    isCausacionGroup: Boolean
    grupoCodigo: String
    grupoNombre: String
  }

  type DocumentSigner {
    userId: Int!
    orderPosition: Int!
    isRequired: Boolean!
    user: User!
    signature: Signature
    assignedRoleId: Int
    roleName: String
    # Nuevos campos para múltiples roles
    assignedRoleIds: [Int!]
    roleNames: [String!]
  }

  type DocumentType {
    id: Int!
    name: String!
    code: String!
    description: String
    prefix: String!
    isActive: Boolean!
    roles: [DocumentTypeRole!]
    createdAt: String!
    updatedAt: String!
  }

  type DocumentTypeRole {
    id: Int!
    documentTypeId: Int!
    roleName: String!
    roleCode: String!
    orderPosition: Int!
    isRequired: Boolean!
    description: String
    createdAt: String!
  }

  type Notification {
    id: Int!
    user: User!
    userId: Int!
    type: String!
    document: Document
    documentId: Int!
    actor: User
    actorId: Int
    documentTitle: String!
    isRead: Boolean!
    createdAt: String!
    updatedAt: String!
  }

  type UploadResponse {
    success: Boolean!
    message: String!
    document: Document
  }

  type UpdateFacturaTemplateResponse {
    success: Boolean!
    message: String!
    document: Document
  }

  input SignerAssignmentInput {
    userId: Int
    # Campos legacy (mantener compatibilidad)
    roleId: Int
    roleName: String
    # Nuevos campos para múltiples roles
    roleIds: [Int!]
    roleNames: [String!]
    # Campos para grupos de causación
    isCausacionGroup: Boolean
    grupoCodigo: String
  }

  type NegotiationSigner {
    id: Int!
    name: String!
    active: Boolean!
  }

  type VerifyCedulaResponse {
    valid: Boolean!
    message: String
  }

  type CausacionGrupo {
    id: Int!
    codigo: String!
    nombre: String!
    descripcion: String
    activo: Boolean!
    roleCode: String
    miembros: [CausacionIntegrante!]!
  }

  type CausacionIntegrante {
    id: Int!
    grupoId: Int!
    userId: Int!
    user: User!
    cargo: String
    activo: Boolean!
  }

  type DocumentRetention {
    id: Int!
    documentId: Int!
    retainedBy: User!
    retainedById: Int!
    retentionPercentage: Int!
    retentionReason: String!
    retainedAt: String!
    releasedAt: String
    releasedBy: User
    releasedById: Int
  }

  type Query {
    # Usuarios
    me: User
    users: [User!]!
    user(id: Int!): User
    availableSigners: [User!]!

    # Documentos
    documents: [Document!]!
    document(id: Int!): Document
    myDocuments: [Document!]!
    pendingDocuments: [Document!]!
    signedDocuments: [Document!]!
    rejectedByMeDocuments: [Document!]!
    rejectedByOthersDocuments: [Document!]!
    retainedDocuments: [Document!]!
    documentsByStatus(status: String!): [Document!]!

    # Tipos de Documentos
    documentTypes: [DocumentType!]!
    documentType(id: Int!): DocumentType
    documentTypeRoles(documentTypeId: Int!): [DocumentTypeRole!]!

    # Firmas
    signatures(documentId: Int!): [Signature!]!
    documentSigners(documentId: Int!): [DocumentSigner!]!
    mySignatures: [Signature!]!

    # Notificaciones
    notifications: [Notification!]!
    unreadNotificationsCount: Int!

    # Firmantes de Negociaciones
    negotiationSigners: [NegotiationSigner!]!
    verifyNegotiationSignerCedula(name: String!, lastFourDigits: String!): VerifyCedulaResponse!

    # Grupos de Causación
    causacionGrupos: [CausacionGrupo!]!
    causacionGrupo(codigo: String!): CausacionGrupo
  }

  type Mutation {
    # Autenticación
    login(email: String!, password: String!): AuthPayload!
    register(name: String!, email: String!, password: String!): AuthPayload!

    # Usuarios
    updateUser(id: Int!, name: String, email: String): User!
    deleteUser(id: Int!): Boolean!
    updateEmailNotifications(enabled: Boolean!): User!

    # Documentos
    uploadDocument(title: String!, description: String, documentTypeId: Int): UploadResponse!
    updateDocument(id: Int!, title: String, description: String, status: String, documentTypeId: Int): Document!
    deleteDocument(id: Int!): Boolean!
    assignSigners(documentId: Int!, signerAssignments: [SignerAssignmentInput!]!): Boolean!
    removeSigner(documentId: Int!, userId: Int!): Boolean!
    reorderSigners(documentId: Int!, newOrder: [Int!]!): Boolean!
    updateFacturaTemplate(documentId: Int!, templateData: String!): UpdateFacturaTemplateResponse!

    # Firmas
    signDocument(documentId: Int!, signatureData: String!, consecutivo: String, realSignerName: String, retentionPercentage: Int, retentionReason: String): Signature!
    rejectDocument(documentId: Int!, reason: String, realSignerName: String): Boolean!

    # Retenciones
    retainDocument(documentId: Int!, retentionPercentage: Int!, retentionReason: String!): DocumentRetention!
    releaseDocument(documentId: Int!): Boolean!

    # Notificaciones
    markNotificationAsRead(notificationId: Int!): Notification!
    markAllNotificationsAsRead: Boolean!
  }
`;

module.exports = typeDefs;
