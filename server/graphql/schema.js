const { gql } = require('apollo-server-express');

const typeDefs = gql`
  scalar Upload

  type User {
    id: ID!
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
    id: ID!
    title: String!
    description: String
    fileName: String!
    filePath: String!
    fileSize: Int!
    mimeType: String!
    status: String!
    uploadedBy: User!
    uploadedById: ID!
    documentType: DocumentType
    documentTypeId: ID
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
  }

  type Signature {
    id: ID!
    document: Document
    documentId: ID
    signer: User
    signerId: ID
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
    orderPosition: Int
  }

  type DocumentSigner {
    userId: ID!
    orderPosition: Int!
    isRequired: Boolean!
    user: User!
    signature: Signature
    assignedRoleId: ID
    roleName: String
    # Nuevos campos para múltiples roles
    assignedRoleIds: [ID!]
    roleNames: [String!]
  }

  type DocumentType {
    id: ID!
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
    id: ID!
    documentTypeId: ID!
    roleName: String!
    roleCode: String!
    orderPosition: Int!
    isRequired: Boolean!
    description: String
    createdAt: String!
  }

  type Notification {
    id: ID!
    user: User!
    userId: ID!
    type: String!
    document: Document
    documentId: ID!
    actor: User
    actorId: ID
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

  input SignerAssignmentInput {
    userId: ID!
    # Campos legacy (mantener compatibilidad)
    roleId: ID
    roleName: String
    # Nuevos campos para múltiples roles
    roleIds: [ID!]
    roleNames: [String!]
  }

  type Query {
    # Usuarios
    me: User
    users: [User!]!
    user(id: ID!): User
    availableSigners: [User!]!

    # Documentos
    documents: [Document!]!
    document(id: ID!): Document
    myDocuments: [Document!]!
    pendingDocuments: [Document!]!
    signedDocuments: [Document!]!
    rejectedByMeDocuments: [Document!]!
    rejectedByOthersDocuments: [Document!]!
    documentsByStatus(status: String!): [Document!]!

    # Tipos de Documentos
    documentTypes: [DocumentType!]!
    documentType(id: ID!): DocumentType
    documentTypeRoles(documentTypeId: ID!): [DocumentTypeRole!]!

    # Firmas
    signatures(documentId: ID!): [Signature!]!
    documentSigners(documentId: ID!): [DocumentSigner!]!
    mySignatures: [Signature!]!

    # Notificaciones
    notifications: [Notification!]!
    unreadNotificationsCount: Int!
  }

  type Mutation {
    # Autenticación
    login(email: String!, password: String!): AuthPayload!
    register(name: String!, email: String!, password: String!): AuthPayload!

    # Usuarios
    updateUser(id: ID!, name: String, email: String): User!
    deleteUser(id: ID!): Boolean!
    updateEmailNotifications(enabled: Boolean!): User!

    # Documentos
    uploadDocument(title: String!, description: String, documentTypeId: ID): UploadResponse!
    updateDocument(id: ID!, title: String, description: String, status: String, documentTypeId: ID): Document!
    deleteDocument(id: ID!): Boolean!
    assignSigners(documentId: ID!, signerAssignments: [SignerAssignmentInput!]!): Boolean!
    removeSigner(documentId: ID!, userId: ID!): Boolean!
    reorderSigners(documentId: ID!, newOrder: [ID!]!): Boolean!

    # Firmas
    signDocument(documentId: ID!, signatureData: String!, consecutivo: String, realSignerName: String): Signature!
    rejectDocument(documentId: ID!, reason: String, realSignerName: String): Boolean!

    # Notificaciones
    markNotificationAsRead(notificationId: ID!): Notification!
    markAllNotificationsAsRead: Boolean!
  }
`;

module.exports = typeDefs;
