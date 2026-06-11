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
    realSignerName: String
  }

  type AuthPayload {
    token: String!
    user: User!
  }

  type UserSession {
    id: ID!
    userId: ID!
    userName: String!
    userEmail: String!
    loginTime: String!
    isActive: Boolean!
    hoursElapsed: Float!
    hoursRemaining: Float!
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
    consecutivo: String
    metadata: String
    templateData: String
    createdAt: String!
    updatedAt: String!
    completedAt: String
    payableStatus: String
    paidAt: String
    paidBy: User
    advancePaymentStatus: String
    advancePaidAt: String
    advancePaidBy: User
    # Campos calculados
    totalSigners: Int
    signedCount: Int
    pendingCount: Int
    signatures: [Signature!]
    # Campos de firma (solo disponibles en signedDocuments)
    signedAt: String
    signatureType: String
    # Retenciones (array de retenciones por centro de costo)
    retentionData: [DocumentRetentionItem!]
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
    roleNames: [String!]
    roleCode: String
    roleCodes: [String!]
    orderPosition: Int
    # Campos para grupos de causación
    isCausacionGroup: Boolean
    grupoCodigo: String
    grupoNombre: String
    members: [GroupMember!]
  }

  type GroupMember {
    userId: ID!
    activo: Boolean!
    userName: String!
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
    isCausacionGroup: Boolean
    grupoCodigo: String
    grupoNombre: String
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

  type TestFactura {
    numeroControl: String!
    numeroFactura: String!
    cia: String!
    proveedor: String!
    fechaFactura: String!
    fechaEntrega: String!
  }

  type TestFacturaResponse {
    success: Boolean!
    message: String!
    factura: TestFactura
  }

  type UpdateFacturaTemplateResponse {
    success: Boolean!
    message: String!
    document: Document
  }

  input SignerAssignmentInput {
    userId: ID
    # Campos legacy (mantener compatibilidad)
    roleId: ID
    roleName: String
    # Nuevos campos para múltiples roles
    roleIds: [ID!]
    roleNames: [String!]
    # Campos para grupos de causación
    isCausacionGroup: Boolean
    grupoCodigo: String
  }

  type NegotiationSigner {
    id: ID!
    name: String!
    active: Boolean!
  }

  type VerifyNegotiationSignerResponse {
    valid: Boolean!
    message: String
  }

  type CausacionGrupo {
    id: ID!
    codigo: String!
    nombre: String!
    descripcion: String
    activo: Boolean!
    roleCode: String
    miembros: [CausacionIntegrante!]!
  }

  type CausacionIntegrante {
    id: ID!
    grupoId: ID!
    userId: ID!
    user: User!
    cargo: String
    activo: Boolean!
  }

  type DocumentRetentionItem {
    userId: String!
    userName: String!
    centroCostoIndex: Int!
    motivo: String!
    porcentajeRetenido: Int!
    fechaRetencion: String!
    activa: Boolean!
  }

  type DocumentRetention {
    success: Boolean!
    message: String
    retentions: [DocumentRetentionItem!]!
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
    payableInvoices: [Document!]!
    rejectedByMeDocuments: [Document!]!
    rejectedByOthersDocuments: [Document!]!
    retainedDocuments: [Document!]!
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

    # Firmantes de Negociaciones
    negotiationSigners: [NegotiationSigner!]!
    verifyNegotiationSignerPassword(name: String!, password: String!): VerifyNegotiationSignerResponse!

    # Grupos de Causación
    causacionGrupos: [CausacionGrupo!]!
    causacionGrupo(codigo: String!): CausacionGrupo

    # Sesiones Activas (solo para administradores)
    activeSessions: [UserSession!]!
  }

  type Mutation {
    # Autenticación
    login(email: String!, password: String!): AuthPayload!
    register(name: String!, email: String!, password: String!): AuthPayload!
    logout: Boolean!

    # Usuarios
    updateUser(id: ID!, name: String, email: String): User!
    deleteUser(id: ID!): Boolean!
    updateEmailNotifications(enabled: Boolean!): User!

    # Documentos
    uploadDocument(title: String!, description: String, documentTypeId: ID): UploadResponse!
    createCausacionTestFactura: TestFacturaResponse!
    createCausacionTestDocument(templateData: String!): UploadResponse!
    updateDocument(id: ID!, title: String, description: String, status: String, documentTypeId: ID): Document!
    deleteDocument(id: ID!): Boolean!
    assignSigners(documentId: ID!, signerAssignments: [SignerAssignmentInput!]!): Boolean!
    updateFacturaTemplate(documentId: ID!, templateData: String!): UpdateFacturaTemplateResponse!
    updatePayableInvoiceStatus(documentId: ID!, paymentStatus: String!): Document!
    updateTreasuryAdvancePaymentStatus(documentId: ID!, paymentStatus: String!): Document!

    # Firmas
    signDocument(documentId: ID!, signatureData: String!, consecutivo: String, realSignerName: String, retentions: String, causacionData: String, assetData: String): Signature!
    rejectDocument(documentId: ID!, reason: String, realSignerName: String): Boolean!

    # Retenciones
    retainDocument(documentId: ID!, centroCostoIndex: Int!, retentionPercentage: Int!, retentionReason: String!): DocumentRetention!
    releaseDocument(documentId: ID!, centroCostoIndex: Int!): Boolean!

    # Notificaciones
    markNotificationAsRead(notificationId: ID!): Notification!
    markAllNotificationsAsRead: Boolean!

    # Sesiones (solo para administradores)
    closeUserSession(sessionId: ID!): Boolean!
  }
`;

module.exports = typeDefs;
