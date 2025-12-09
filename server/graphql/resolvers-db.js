const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { query } = require('../database/db');
const { authenticateUser } = require('../services/ldap');
const { addCoverPageWithSigners, updateSignersPage } = require('../utils/pdfCoverPage');
const {
  notificarAsignacionFirmante,
  notificarDocumentoFirmadoCompleto,
  notificarDocumentoRechazado
} = require('../services/emailService');
const pdfLogger = require('../utils/pdfLogger');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';

const resolvers = {
  Query: {
    me: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(
        'SELECT * FROM users WHERE id = $1',
        [user.id]
      );

      return result.rows[0];
    },

    users: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.role !== 'admin') throw new Error('No autorizado');

      const result = await query('SELECT * FROM users ORDER BY created_at DESC');
      return result.rows;
    },

    user: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0];
    },

    documents: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT d.*, u.name as uploaded_by_name, u.email as uploaded_by_email
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        ORDER BY d.created_at DESC
      `);

      return result.rows;
    },

    document: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT d.*, u.name as uploaded_by_name, u.email as uploaded_by_email
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        WHERE d.id = $1
      `, [id]);

      return result.rows[0];
    },

    myDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          d.*,
          dt.name as document_type_name,
          dt.code as document_type_code,
          COUNT(DISTINCT ds.user_id) as total_signers,
          COUNT(DISTINCT CASE WHEN s.status = 'signed' THEN s.signer_id END) as signed_count,
          COUNT(DISTINCT CASE WHEN s.status = 'pending' THEN s.signer_id END) as pending_count
        FROM documents d
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        LEFT JOIN document_signers ds ON d.id = ds.document_id
        LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
        WHERE d.uploaded_by = $1
        GROUP BY d.id, dt.name, dt.code
        ORDER BY d.created_at DESC
      `, [user.id]);

      return result.rows;
    },

    pendingDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          COALESCE(s.status, 'pending') as signature_status,
          ds.order_position,
          CASE
            WHEN ds.order_position > 1 THEN (
              SELECT COUNT(*)
              FROM document_signers ds_prev
              LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id AND ds_prev.user_id = s_prev.signer_id
              WHERE ds_prev.document_id = d.id
                AND ds_prev.order_position < ds.order_position
                AND COALESCE(s_prev.status, 'pending') != 'signed'
            )
            ELSE 0
          END as pending_previous_signers,
          CASE
            WHEN ds.order_position > 1 THEN (
              SELECT u_prev.name
              FROM document_signers ds_prev
              JOIN users u_prev ON ds_prev.user_id = u_prev.id
              WHERE ds_prev.document_id = d.id
                AND ds_prev.order_position = ds.order_position - 1
              LIMIT 1
            )
            ELSE NULL
          END as previous_signer_name
        FROM document_signers ds
        JOIN documents d ON ds.document_id = d.id
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
        WHERE ds.user_id = $1
          AND COALESCE(s.status, 'pending') = 'pending'
          AND d.status NOT IN ('completed', 'archived', 'rejected')
          AND NOT EXISTS (
            -- Excluir si algún firmante anterior ha rechazado
            SELECT 1
            FROM document_signers ds_prev
            LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id AND ds_prev.user_id = s_prev.signer_id
            WHERE ds_prev.document_id = d.id
              AND ds_prev.order_position < ds.order_position
              AND COALESCE(s_prev.status, 'pending') = 'rejected'
          )
        ORDER BY d.created_at DESC
      `, [user.id]);

      return result.rows;
    },

    signedDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          s.signed_at,
          s.signature_type
        FROM signatures s
        JOIN documents d ON s.document_id = d.id
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        WHERE s.signer_id = $1
          AND s.status = 'signed'
          AND d.uploaded_by != $1
        ORDER BY s.signed_at DESC
      `, [user.id]);

      return result.rows;
    },

    rejectedByMeDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT DISTINCT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          s.rejection_reason,
          s.rejected_at,
          s.signed_at,
          s.created_at,
          COALESCE(s.rejected_at, s.signed_at, s.created_at) as sort_date
        FROM documents d
        JOIN signatures s ON d.id = s.document_id
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        WHERE s.signer_id = $1
          AND s.status = 'rejected'
        ORDER BY sort_date DESC
      `, [user.id]);

      return result.rows;
    },

    rejectedByOthersDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT DISTINCT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          rejector_sig.rejection_reason,
          rejector_sig.rejected_at,
          rejector_sig.signed_at,
          rejector_sig.created_at,
          rejector_user.id as rejected_by_id,
          rejector_user.name as rejected_by_name,
          rejector_user.email as rejected_by_email,
          COALESCE(rejector_sig.rejected_at, rejector_sig.signed_at, rejector_sig.created_at) as sort_date
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        -- Mi firma (debe existir y yo NO soy quien rechazó)
        JOIN signatures my_sig ON d.id = my_sig.document_id
          AND my_sig.signer_id = $1
        -- La firma del que rechazó (alguien más, no yo)
        JOIN signatures rejector_sig ON d.id = rejector_sig.document_id
          AND rejector_sig.status = 'rejected'
          AND rejector_sig.signer_id != $1
        -- Usuario que rechazó
        JOIN users rejector_user ON rejector_sig.signer_id = rejector_user.id
        WHERE d.status = 'rejected'
          AND d.uploaded_by != $1  -- Excluir documentos que YO creé
        ORDER BY sort_date DESC
      `, [user.id]);

      return result.rows;
    },

    documentsByStatus: async (_, { status }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT d.*, u.name as uploaded_by_name, u.email as uploaded_by_email
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        WHERE d.status = $1
        ORDER BY d.created_at DESC
      `, [status]);

      return result.rows;
    },

    signatures: async (_, { documentId }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          s.*,
          u.name as signer_name,
          u.email as signer_email,
          ds.role_name as role_name,
          ds.role_names as role_names,
          ds.order_position as order_position
        FROM signatures s
        JOIN users u ON s.signer_id = u.id
        LEFT JOIN document_signers ds ON ds.document_id = s.document_id AND ds.user_id = s.signer_id
        WHERE s.document_id = $1
        ORDER BY COALESCE(ds.order_position, s.created_at::integer) ASC
      `, [documentId]);

      return result.rows;
    },

    documentSigners: async (_, { documentId }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          ds.user_id as "userId",
          ds.order_position as "orderPosition",
          ds.is_required as "isRequired",
          ds.assigned_role_id as "assignedRoleId",
          ds.role_name as "roleName",
          ds.assigned_role_ids as "assignedRoleIds",
          ds.role_names as "roleNames",
          u.id as user_id,
          u.name as user_name,
          u.email as user_email,
          s.id as signature_id,
          s.status as signature_status,
          s.signed_at as signature_signed_at,
          s.rejected_at as signature_rejected_at,
          s.rejection_reason as signature_rejection_reason,
          s.consecutivo as signature_consecutivo,
          s.real_signer_name as signature_real_signer_name,
          s.created_at as signature_created_at
        FROM document_signers ds
        LEFT JOIN users u ON ds.user_id = u.id
        LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
        WHERE ds.document_id = $1
        ORDER BY ds.order_position ASC
      `, [documentId]);

      return result.rows.map(row => ({
        userId: row.userId,
        orderPosition: row.orderPosition,
        isRequired: row.isRequired,
        assignedRoleId: row.assignedRoleId,
        roleName: row.roleName,
        assignedRoleIds: row.assignedRoleIds || [],
        roleNames: row.roleNames || [],
        user: {
          id: row.user_id,
          name: row.user_name,
          email: row.user_email
        },
        signature: (row.signature_id && row.signature_status) ? {
          id: row.signature_id,
          status: row.signature_status,
          signedAt: row.signature_signed_at || null,
          rejectedAt: row.signature_rejected_at || null,
          rejectionReason: row.signature_rejection_reason || null,
          consecutivo: row.signature_consecutivo || null,
          realSignerName: row.signature_real_signer_name || null,
          createdAt: row.signature_created_at || null
        } : null
      }));
    },

    mySignatures: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT s.*, d.title as document_title
        FROM signatures s
        JOIN documents d ON s.document_id = d.id
        WHERE s.signer_id = $1
        ORDER BY s.created_at DESC
      `, [user.id]);

      return result.rows;
    },

    notifications: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT *
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `, [user.id]);

      return result.rows;
    },

    unreadNotificationsCount: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT COUNT(*) as count
        FROM notifications
        WHERE user_id = $1 AND is_read = FALSE
      `, [user.id]);

      return parseInt(result.rows[0].count) || 0;
    },

    negotiationSigners: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT id, name, active
        FROM negotiation_signers
        WHERE active = true
        ORDER BY name ASC
      `);

      return result.rows;
    },

    verifyNegotiationSignerCedula: async (_, { name, lastFourDigits }, { user }) => {
      if (!user) throw new Error('No autenticado');

      console.log('🔍 Verificando cédula para:', name);
      console.log('🔢 Últimos 4 dígitos recibidos:', lastFourDigits, 'Tipo:', typeof lastFourDigits);
      console.log('👤 Usuario:', user.name);

      // Buscar el firmante en la base de datos
      const result = await query(`
        SELECT cedula
        FROM negotiation_signers
        WHERE name = $1 AND active = true
      `, [name]);

      if (result.rows.length === 0) {
        console.log('❌ Firmante no encontrado:', name);
        return {
          valid: false,
          message: 'Firmante no encontrado en la base de datos'
        };
      }

      const fullCedula = result.rows[0].cedula;
      const lastFour = fullCedula.slice(-4);

      console.log('💳 Cédula completa en BD:', fullCedula);
      console.log('🔢 Últimos 4 en BD:', lastFour);
      console.log('🔢 Últimos 4 recibidos:', lastFourDigits);
      console.log('✅ ¿Coinciden?', lastFour === lastFourDigits);

      if (lastFour === lastFourDigits) {
        console.log('✅ Verificación exitosa');
        return {
          valid: true,
          message: 'Cédula verificada correctamente'
        };
      } else {
        console.log('❌ No coinciden');
        return {
          valid: false,
          message: 'Los últimos 4 dígitos no coinciden'
        };
      }
    },

    availableSigners: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      // Incluir al usuario actual para permitir autofirma
      // Excluir usuarios que no están en el directorio activo (por ejemplo, Administrador con email admin@prexxa.local)
      const result = await query(`
        SELECT id, name, email, role
        FROM users
        WHERE email != 'admin@prexxa.local'
        ORDER BY
          CASE WHEN id = $1 THEN 0 ELSE 1 END,
          name ASC
      `, [user.id]);

      return result.rows;
    },

    documentTypes: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT * FROM document_types
        WHERE is_active = true
        ORDER BY name ASC
      `);

      return result.rows;
    },

    documentType: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT * FROM document_types WHERE id = $1
      `, [id]);

      return result.rows[0];
    },

    documentTypeRoles: async (_, { documentTypeId }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT * FROM document_type_roles
        WHERE document_type_id = $1
        ORDER BY order_position ASC
      `, [documentTypeId]);

      return result.rows;
    },
  },

  Mutation: {
    /**
     * Authenticates a user using local credentials or Active Directory (LDAP)
     *
     * BUSINESS RULE: Local authentication takes precedence over LDAP. If a user has a local
     * password_hash, LDAP authentication is skipped entirely.
     * BUSINESS RULE: LDAP users are automatically created in the database on first login.
     * BUSINESS RULE: Existing LDAP users have their name and email synchronized from AD on each login.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {string} args.email - User's email address or username
     * @param {string} args.password - User's password
     * @returns {Promise<{token: string, user: Object}>} JWT token and user object
     * @throws {Error} When credentials are invalid or authentication fails
     */
    login: async (_, { email, password }, { ipAddress }) => {
      try {
        const localUserResult = await query(
          'SELECT * FROM users WHERE email = $1 AND password_hash IS NOT NULL',
          [email]
        );

        if (localUserResult.rows.length > 0) {
          const localUser = localUserResult.rows[0];
          const validPassword = await bcrypt.compare(password, localUser.password_hash);

          if (validPassword) {
            console.log('✓ Usuario local autenticado:', localUser.email);

            const token = jwt.sign(
              { id: localUser.id, email: localUser.email, role: localUser.role },
              JWT_SECRET,
              { expiresIn: process.env.JWT_EXPIRES || '8h' }
            );

            // Registrar login en logs
            pdfLogger.logLogin(localUser.name);

            return { token, user: localUser };
          }
          // Si la contraseña no es válida, lanzar error inmediatamente
          throw new Error('Usuario o contraseña inválidos');
        }

        // Extraer username del email
        const username = email.includes('@') ? email.split('@')[0] : email;

        console.log('🔍 Intentando autenticar usuario:', username);
        console.log('🔍 Username length:', username.length);
        console.log('🔍 Username charCodes:', [...username].map(c => c.charCodeAt(0)));

        const ldapUser = await authenticateUser(username, password);

        let result = await query(
          'SELECT * FROM users WHERE email = $1 OR ad_username = $2',
          [ldapUser.email, ldapUser.username]
        );

        let user = result.rows[0];

        if (!user) {
          const insertResult = await query(
            `INSERT INTO users (name, email, ad_username, role, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [ldapUser.name, ldapUser.email, ldapUser.username, 'user', true]
          );
          user = insertResult.rows[0];
          console.log('✓ Nuevo usuario creado desde AD:', user.ad_username);
        } else {
          const updateResult = await query(
            'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *',
            [ldapUser.name, ldapUser.email, user.id]
          );
          user = updateResult.rows[0];
          console.log('✓ Usuario existente autenticado desde AD:', user.ad_username);
        }

        const token = jwt.sign(
          { id: user.id, email: user.email, role: user.role },
          JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES || '8h' }
        );

        // Registrar login en logs
        pdfLogger.logLogin(user.name);

        return { token, user };
      } catch (error) {
        console.error('❌ Error en login:', error.message);
        throw new Error('Usuario o contraseña inválidos');
      }
    },

    /**
     * Registers a new local user with email and password
     *
     * BUSINESS RULE: Email must be unique across all users.
     * BUSINESS RULE: Password is hashed with bcrypt (10 rounds) before storage.
     * BUSINESS RULE: New users default to 'user' role and active status.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {string} args.name - User's full name
     * @param {string} args.email - User's email address (must be unique)
     * @param {string} args.password - User's password (will be hashed)
     * @returns {Promise<{token: string, user: Object}>} JWT token and user object
     * @throws {Error} When email is already registered
     */
    register: async (_, { name, email, password }) => {
      const existingUser = await query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('El email ya está registrado');
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await query(
        `INSERT INTO users (name, email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [name, email, hashedPassword, 'user', true]
      );

      const user = result.rows[0];
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES || '8h' }
      );

      return { token, user };
    },

    updateUser: async (_, { id, name, email }, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.id !== id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      const result = await query(
        'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING *',
        [name, email, id]
      );

      return result.rows[0];
    },

    deleteUser: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.role !== 'admin') throw new Error('No autorizado');

      await query('DELETE FROM users WHERE id = $1', [id]);
      return true;
    },

    updateEmailNotifications: async (_, { enabled }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(
        'UPDATE users SET email_notifications = $1 WHERE id = $2 RETURNING *',
        [enabled, user.id]
      );

      return result.rows[0];
    },

    uploadDocument: async (_, { title, description }, { user }) => {
      if (!user) throw new Error('No autenticado');

      // Esta mutation se usa desde GraphQL directo, pero normalmente
      // el archivo se sube por el endpoint REST /api/upload
      return {
        success: false,
        message: 'Use el endpoint /api/upload para subir archivos',
        document: null
      };
    },

    /**
     * Updates document metadata (title, description, or status)
     *
     * BUSINESS RULE: Only document owner or admin can update documents.
     * BUSINESS RULE: Null values are ignored (COALESCE preserves existing values).
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.id - ID of the document
     * @param {string} [args.title] - New title (optional)
     * @param {string} [args.description] - New description (optional)
     * @param {string} [args.status] - New status (optional)
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<Object>} Updated document object
     * @throws {Error} When unauthorized or document not found
     */
    updateDocument: async (_, { id, title, description, status }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docResult = await query('SELECT * FROM documents WHERE id = $1', [id]);
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];
      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      const result = await query(
        `UPDATE documents
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            status = COALESCE($3, status)
        WHERE id = $4
        RETURNING *`,
        [title, description, status, id]
      );

      return result.rows[0];
    },

    /**
     * Assigns signers to a document with role assignments and sequential ordering
     *
     * BUSINESS RULE: Document owner is ALWAYS placed first in signing order when they add themselves.
     * BUSINESS RULE: Maximum of 3 roles can be assigned to any single signer.
     * BUSINESS RULE: Cannot add signers to completed documents.
     * BUSINESS RULE: When owner adds themselves to existing signers, all positions shift down by 1.
     * BUSINESS RULE: Only the FIRST signer receives email notification (sequential workflow).
     * BUSINESS RULE: Supports both legacy (singular) and new (array) role assignment formats.
     *
     * Sequential ordering notes:
     * - New signers are appended to the end of existing signers
     * - Owner insertion at position 1 causes automatic position increment for existing signers
     * - Positions are 1-indexed
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.documentId - ID of the document
     * @param {Array<Object>} args.signerAssignments - Array of signer assignments
     * @param {number} args.signerAssignments[].userId - ID of user to assign
     * @param {Array<number>} [args.signerAssignments[].roleIds] - Array of role IDs (max 3)
     * @param {Array<string>} [args.signerAssignments[].roleNames] - Array of role names (max 3)
     * @param {number} [args.signerAssignments[].roleId] - Legacy: single role ID
     * @param {string} [args.signerAssignments[].roleName] - Legacy: single role name
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<boolean>} True if assignment succeeds
     * @throws {Error} When unauthorized, document not found, completed, or role limit exceeded
     */
    assignSigners: async (_, { documentId, signerAssignments }, { user }) => {
      const userIds = signerAssignments.map(sa => sa.userId);
      if (!user) throw new Error('No autenticado');

      const docResult = await query('SELECT * FROM documents WHERE id = $1', [documentId]);
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];
      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      if (doc.status === 'completed') {
        throw new Error('No se pueden agregar firmantes a un documento que ya ha sido firmado completamente');
      }

      const existingSignersResult = await query(
        'SELECT user_id, order_position, role_name, role_names FROM document_signers WHERE document_id = $1 ORDER BY order_position ASC',
        [documentId]
      );

      // Función helper para normalizar roles (soportar legacy y nuevo formato)
      const normalizeRoles = (assignment) => {
        let roleIds = assignment.roleIds || [];
        let roleNames = assignment.roleNames || [];

        // Fallback a formato legacy (singular)
        if (roleIds.length === 0 && assignment.roleId) {
          roleIds = [assignment.roleId];
        }
        if (roleNames.length === 0 && assignment.roleName) {
          roleNames = [assignment.roleName];
        }

        return { roleIds, roleNames };
      };

      for (const assignment of signerAssignments) {
        const { roleIds, roleNames } = normalizeRoles(assignment);

        if (roleIds.length > 3 || roleNames.length > 3) {
          throw new Error('Un firmante no puede tener más de 3 roles asignados');
        }
      }

      const hasExistingSigners = existingSignersResult.rows.length > 0;
      const isOwner = doc.uploaded_by === user.id;
      const ownerInNewSigners = userIds.includes(user.id);

      if (hasExistingSigners && isOwner && ownerInNewSigners) {
        console.log(`👤 Propietario agregándose como firmante - reorganizando posiciones...`);

        await query(
          `UPDATE document_signers
           SET order_position = order_position + 1
           WHERE document_id = $1`,
          [documentId]
        );

        const ownerAssignment = signerAssignments.find(sa => sa.userId === user.id);
        const ownerRoles = ownerAssignment ? normalizeRoles(ownerAssignment) : { roleIds: [], roleNames: [] };

        await query(
          `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
           VALUES ($1, $2, 1, $3, $4, $5, $6::integer[], $7::text[])
           ON CONFLICT (document_id, user_id) DO NOTHING`,
          [
            documentId,
            user.id,
            true,
            ownerRoles.roleIds[0] || null, // Mantener compatibilidad legacy
            ownerRoles.roleNames[0] || null, // Mantener compatibilidad legacy
            ownerRoles.roleIds,
            ownerRoles.roleNames
          ]
        );

        // Auto-firmar al propietario cuando se agrega en posición 1
        await query(
          `INSERT INTO signatures (document_id, signer_id, status, signature_type, signed_at)
           VALUES ($1, $2, 'signed', 'digital', CURRENT_TIMESTAMP)
           ON CONFLICT (document_id, signer_id) DO UPDATE
           SET status = 'signed', signed_at = CURRENT_TIMESTAMP`,
          [documentId, user.id]
        );
        console.log(`✅ Auto-firma aplicada al propietario (posición 1)`);

        const otherUserIds = userIds.filter(id => id !== user.id);
        const maxPosition = existingSignersResult.rows.length + 1; // +1 porque el propietario ya está en posición 1

        for (let i = 0; i < otherUserIds.length; i++) {
          const assignment = signerAssignments.find(sa => sa.userId === otherUserIds[i]);
          const roles = assignment ? normalizeRoles(assignment) : { roleIds: [], roleNames: [] };

          await query(
            `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
             VALUES ($1, $2, $3, $4, $5, $6, $7::integer[], $8::text[])
             ON CONFLICT (document_id, user_id) DO NOTHING`,
            [
              documentId,
              otherUserIds[i],
              maxPosition + i,
              true,
              roles.roleIds[0] || null,
              roles.roleNames[0] || null,
              roles.roleIds,
              roles.roleNames
            ]
          );

          await query(
            `INSERT INTO signatures (document_id, signer_id, status, signature_type)
             VALUES ($1, $2, 'pending', 'digital')
             ON CONFLICT (document_id, signer_id) DO NOTHING`,
            [documentId, otherUserIds[i]]
          );
        }
      } else if (hasExistingSigners) {
        const maxPosition = Math.max(...existingSignersResult.rows.map(r => r.order_position));

        for (let i = 0; i < userIds.length; i++) {
          const assignment = signerAssignments.find(sa => sa.userId === userIds[i]);
          const roles = assignment ? normalizeRoles(assignment) : { roleIds: [], roleNames: [] };

          await query(
            `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
             VALUES ($1, $2, $3, $4, $5, $6, $7::integer[], $8::text[])
             ON CONFLICT (document_id, user_id) DO NOTHING`,
            [
              documentId,
              userIds[i],
              maxPosition + i + 1,
              true,
              roles.roleIds[0] || null,
              roles.roleNames[0] || null,
              roles.roleIds,
              roles.roleNames
            ]
          );

          await query(
            `INSERT INTO signatures (document_id, signer_id, status, signature_type)
             VALUES ($1, $2, 'pending', 'digital')
             ON CONFLICT (document_id, signer_id) DO NOTHING`,
            [documentId, userIds[i]]
          );
        }
      } else {
        // No hay firmantes existentes - primera asignación
        let startPosition = 1;

        if (isOwner && ownerInNewSigners) {
          const ownerAssignment = signerAssignments.find(sa => sa.userId === user.id);
          const ownerRoles = ownerAssignment ? normalizeRoles(ownerAssignment) : { roleIds: [], roleNames: [] };

          await query(
            `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
             VALUES ($1, $2, 1, $3, $4, $5, $6::integer[], $7::text[])`,
            [
              documentId,
              user.id,
              true,
              ownerRoles.roleIds[0] || null,
              ownerRoles.roleNames[0] || null,
              ownerRoles.roleIds,
              ownerRoles.roleNames
            ]
          );

          // Auto-firmar al propietario cuando se agrega en posición 1
          await query(
            `INSERT INTO signatures (document_id, signer_id, status, signature_type, signed_at)
             VALUES ($1, $2, 'signed', 'digital', CURRENT_TIMESTAMP)`,
            [documentId, user.id]
          );
          console.log(`✅ Auto-firma aplicada al propietario (posición 1)`);

          startPosition = 2;
        }

        const otherUserIds = ownerInNewSigners ? userIds.filter(id => id !== user.id) : userIds;
        for (let i = 0; i < otherUserIds.length; i++) {
          const assignment = signerAssignments.find(sa => sa.userId === otherUserIds[i]);
          const roles = assignment ? normalizeRoles(assignment) : { roleIds: [], roleNames: [] };

          await query(
            `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
             VALUES ($1, $2, $3, $4, $5, $6, $7::integer[], $8::text[])`,
            [
              documentId,
              otherUserIds[i],
              startPosition + i,
              true,
              roles.roleIds[0] || null,
              roles.roleNames[0] || null,
              roles.roleIds,
              roles.roleNames
            ]
          );

          await query(
            `INSERT INTO signatures (document_id, signer_id, status, signature_type)
             VALUES ($1, $2, 'pending', 'digital')`,
            [documentId, otherUserIds[i]]
          );
        }
      }

      const statusResult = await query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) as signed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM signatures
        WHERE document_id = $1`,
        [documentId]
      );

      const stats = statusResult.rows[0];
      const total = parseInt(stats.total);
      const signed = parseInt(stats.signed);
      const pending = parseInt(stats.pending);
      const rejected = parseInt(stats.rejected);

      let newStatus = 'pending';

      if (rejected > 0) {
        // Si hay alguna firma rechazada, el documento está rechazado
        newStatus = 'rejected';
      } else if (total > 0 && signed === total) {
        // Si todas las firmas están completas, el documento está completado
        newStatus = 'completed';
      } else if (signed > 0 && signed < total) {
        // Si hay algunas firmas pero no todas, está en progreso
        newStatus = 'in_progress';
      } else if (pending > 0 && signed === 0) {
        // Si hay firmas pendientes pero ninguna firmada, está pendiente
        newStatus = 'pending';
      }

      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        [newStatus, documentId]
      );

      // ========== CREAR NOTIFICACIONES Y ENVIAR EMAILS A FIRMANTES ==========
      try {
        const docResult = await query(
          'SELECT d.title, u.name as creator_name FROM documents d JOIN users u ON d.uploaded_by = u.id WHERE d.id = $1',
          [documentId]
        );

        if (docResult.rows.length > 0) {
          const docTitle = docResult.rows[0].title;
          const creatorName = docResult.rows[0].creator_name;

          // Determinar el PRIMER firmante en ORDEN de firma (no en array de IDs)
          const firstSignerResult = await query(
            `SELECT ds.user_id
             FROM document_signers ds
             LEFT JOIN signatures s ON ds.document_id = s.document_id AND ds.user_id = s.signer_id
             WHERE ds.document_id = $1 AND COALESCE(s.status, 'pending') = 'pending'
             ORDER BY ds.order_position ASC
             LIMIT 1`,
            [documentId]
          );

          // NOTIFICACIÓN INTERNA Y EMAIL: Solo crear para el PRIMER firmante PENDIENTE
          // IMPORTANTE: NO notificar si el primer firmante es quien está creando el documento (se autofirmará)
          if (firstSignerResult.rows.length > 0) {
            const firstSignerId = firstSignerResult.rows[0].user_id;

            // Solo crear notificación si el primer firmante NO es el usuario actual (quien crea el documento)
            // Si es el mismo usuario, se autofirmará y el siguiente recibirá la notificación
            if (firstSignerId !== user.id) {
              // Usar INSERT ... WHERE NOT EXISTS para evitar duplicados (no requiere constraint)
              const insertResult = await query(
                `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                 SELECT $1::integer, $2::varchar, $3::integer, $4::integer, $5::varchar
                 WHERE NOT EXISTS (
                   SELECT 1 FROM notifications
                   WHERE user_id = $1::integer AND type = $2::varchar AND document_id = $3::integer
                 )
                 RETURNING id`,
                [firstSignerId, 'signature_request', documentId, user.id, docTitle]
              );

              // Solo enviar email si la notificación fue realmente insertada (no existía antes)
              if (insertResult.rows.length > 0) {
                console.log(`✅ Notificación creada para primer firmante pendiente (user_id: ${firstSignerId})`);

                try {
                  const signerResult = await query('SELECT name, email, email_notifications FROM users WHERE id = $1', [firstSignerId]);
                  if (signerResult.rows.length > 0) {
                    const signer = signerResult.rows[0];
                    if (signer.email_notifications) {
                      await notificarAsignacionFirmante({
                        email: signer.email,
                        nombreFirmante: signer.name,
                        nombreDocumento: docTitle,
                        documentoId: documentId,
                        creadorDocumento: creatorName
                      });
                      console.log(`📧 Correo enviado al primer firmante: ${signer.email}`);
                    } else {
                      console.log(`⏭️ Notificaciones desactivadas para: ${signer.email}`);
                    }
                  }
                } catch (emailError) {
                  console.error(`Error al enviar correo al primer firmante:`, emailError);
                }
              } else if (insertResult.rows.length === 0) {
                console.log(`⏭️ Notificación ya existía para user_id ${firstSignerId}, no se envía email duplicado`);
              }
            } else {
              console.log(`⏭️ Primer firmante es el creador del documento (user_id: ${firstSignerId}), se autofirmará sin notificación`);
            }
          }
        }
      } catch (notifError) {
        console.error('Error al crear notificaciones de firmantes:', notifError);
        // No lanzamos el error para que no falle la asignación
      }

      // ========== REGISTRAR ASIGNACIONES EN LOGS ==========
      try {
        // Obtener nombre del usuario que asigna
        const assignerResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
        if (assignerResult.rows.length === 0) {
          throw new Error('Usuario asignador no encontrado');
        }
        const assignerName = assignerResult.rows[0].name;

        const docTitleResult = await query('SELECT title FROM documents WHERE id = $1', [documentId]);
        if (docTitleResult.rows.length > 0) {
          const documentTitle = docTitleResult.rows[0].title;

          // Registrar cada asignación
          for (const assignment of signerAssignments) {
            const signerResult = await query('SELECT name FROM users WHERE id = $1', [assignment.userId]);
            if (signerResult.rows.length > 0) {
              const signerName = signerResult.rows[0].name;

              // Obtener nombres de roles
              let roleText = null;
              if (assignment.roleIds && assignment.roleIds.length > 0) {
                const rolesResult = await query(
                  'SELECT role_name FROM document_type_roles WHERE id = ANY($1)',
                  [assignment.roleIds]
                );
                if (rolesResult.rows.length > 0) {
                  roleText = rolesResult.rows.map(r => r.role_name).join(', ');
                }
              }

              pdfLogger.logSignerAssigned(assignerName, signerName, documentTitle, roleText);
            }
          }
        }
      } catch (logError) {
        console.error('Error al registrar logs de asignación:', logError);
        // No lanzar error para que no falle la asignación
      }

      // ========== GENERAR O ACTUALIZAR PÁGINA DE PORTADA ==========
      try {
        if (hasExistingSigners) {
          console.log(`🔄 Actualizando página de portada para documento ${documentId}...`);
        } else {
          console.log(`📋 Generando página de portada para documento ${documentId}...`);
        }

        const docInfoResult = await query(
          `SELECT d.*, u.name as uploader_name, dt.name as document_type_name
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length === 0) {
          throw new Error('Documento no encontrado');
        }

        const docInfo = docInfoResult.rows[0];

        const signersResult = await query(
          `SELECT u.id, u.name, u.email, ds.order_position, ds.role_name, ds.role_names,
                  COALESCE(s.status, 'pending') as status,
                  s.signed_at,
                  s.rejected_at,
                  s.rejection_reason,
                  s.consecutivo,
                  s.real_signer_name
          FROM document_signers ds
          JOIN users u ON ds.user_id = u.id
          LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
          WHERE ds.document_id = $1
          ORDER BY ds.order_position ASC`,
          [documentId]
        );

        const signers = signersResult.rows;

        if (signers.length === 0) {
          console.log('⚠️ No hay firmantes asignados, saltando generación de portada');
          return true;
        }

        // Construir la ruta completa al archivo PDF
        // file_path ya incluye "uploads/" en su valor
        const pdfPath = path.join(__dirname, '..', docInfo.file_path);

        console.log(`📂 Ruta del PDF: ${pdfPath}`);

        // Preparar información del documento para la portada
        const documentInfo = {
          title: docInfo.title,
          fileName: docInfo.file_name,
          createdAt: docInfo.created_at,
          uploadedBy: docInfo.uploader_name || 'Sistema',
          documentTypeName: docInfo.document_type_name || null
        };

        // Si ya existían firmantes, actualizar la página; si no, crear nueva
        if (hasExistingSigners) {
          await updateSignersPage(pdfPath, signers, documentInfo);
          console.log('✅ Página de portada actualizada exitosamente');
        } else {
          await addCoverPageWithSigners(pdfPath, signers, documentInfo);
          console.log('✅ Página de portada generada exitosamente');
        }
      } catch (coverError) {
        console.error('❌ Error al generar/actualizar página de portada:', coverError);
        // No lanzamos el error para que no falle la asignación de firmantes
        // Solo registramos el error en los logs
      }

      return true;
    },

    /**
     * Removes a signer from a document and reorders remaining signers
     *
     * BUSINESS RULE: Cannot remove signers from completed documents.
     * BUSINESS RULE: Cannot remove signer who has already signed the document.
     * BUSINESS RULE: Document must have at least one signer at all times.
     * BUSINESS RULE: After removal, all signers with higher positions shift down by 1.
     * BUSINESS RULE: If removed signer was current in sequence, next signer is notified.
     *
     * Edge case: If the removed signer had pending signature and there were signed signers
     * before them, the next pending signer is automatically notified.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.documentId - ID of the document
     * @param {number} args.userId - ID of signer to remove
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user (must be owner or admin)
     * @returns {Promise<boolean>} True if removal succeeds
     * @throws {Error} When unauthorized, signer not found, already signed, or last signer
     */
    removeSigner: async (_, { documentId, userId }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docResult = await query('SELECT * FROM documents WHERE id = $1', [documentId]);
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];

      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado para eliminar firmantes de este documento');
      }

      if (doc.status === 'completed') {
        throw new Error('No se pueden eliminar firmantes de un documento que ya ha sido firmado completamente');
      }

      const countResult = await query(
        'SELECT COUNT(*) as total FROM document_signers WHERE document_id = $1',
        [documentId]
      );
      const totalSigners = parseInt(countResult.rows[0].total);

      if (totalSigners <= 1) {
        throw new Error('No se puede eliminar el único firmante del documento. Un documento debe tener al menos un firmante.');
      }

      const signatureResult = await query(
        'SELECT status FROM signatures WHERE document_id = $1 AND signer_id = $2',
        [documentId, userId]
      );

      if (signatureResult.rows.length === 0) {
        throw new Error('El usuario no está asignado como firmante de este documento');
      }

      const signatureStatus = signatureResult.rows[0].status;

      if (signatureStatus === 'signed') {
        throw new Error('No se puede eliminar un firmante que ya ha firmado el documento');
      }

      const positionResult = await query(
        'SELECT order_position FROM document_signers WHERE document_id = $1 AND user_id = $2',
        [documentId, userId]
      );

      if (positionResult.rows.length === 0) {
        throw new Error('El firmante no está asignado a este documento');
      }

      const removedPosition = positionResult.rows[0].order_position;

      await query(
        'DELETE FROM document_signers WHERE document_id = $1 AND user_id = $2',
        [documentId, userId]
      );

      await query(
        'DELETE FROM signatures WHERE document_id = $1 AND signer_id = $2',
        [documentId, userId]
      );

      await query(
        `UPDATE document_signers
         SET order_position = order_position - 1
         WHERE document_id = $1 AND order_position > $2`,
        [documentId, removedPosition]
      );

      try {
        await query(
          `DELETE FROM notifications
           WHERE document_id = $1 AND user_id = $2 AND type = 'signature_request'`,
          [documentId, userId]
        );
        console.log(`🗑️ Notificación de firma eliminada para el usuario`);
      } catch (notifError) {
        console.error('Error al eliminar notificación:', notifError);
      }

      const statusResult = await query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) as signed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM signatures
        WHERE document_id = $1`,
        [documentId]
      );

      const stats = statusResult.rows[0];
      const total = parseInt(stats.total);
      const signed = parseInt(stats.signed);
      const pending = parseInt(stats.pending);
      const rejected = parseInt(stats.rejected);

      let newStatus = 'pending';

      if (rejected > 0) {
        newStatus = 'rejected';
      } else if (total > 0 && signed === total) {
        newStatus = 'completed';
      } else if (signed > 0 && signed < total) {
        newStatus = 'in_progress';
      } else if (pending > 0 && signed === 0) {
        newStatus = 'pending';
      }

      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        [newStatus, documentId]
      );

      // Si el firmante eliminado era el que debía firmar ahora, notificar al siguiente
      if (signatureStatus === 'pending' && signed > 0) {
        try {
          const nextSignerResult = await query(
            `SELECT u.id, u.name, u.email, u.email_notifications, ds.order_position
             FROM document_signers ds
             JOIN users u ON ds.user_id = u.id
             LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
             WHERE ds.document_id = $1 AND s.status = 'pending'
             ORDER BY ds.order_position ASC
             LIMIT 1`,
            [documentId]
          );

          if (nextSignerResult.rows.length > 0) {
            const nextSigner = nextSignerResult.rows[0];
            const nextPosition = nextSigner.order_position;

            const previousSignedResult = await query(
              `SELECT COUNT(*) as count
               FROM document_signers ds
               LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
               WHERE ds.document_id = $1
               AND ds.order_position < $2
               AND s.status = 'signed'`,
              [documentId, nextPosition]
            );

            const previousCount = parseInt(previousSignedResult.rows[0].count);
            const expectedPreviousCount = nextPosition - 1;

            // Si todos los anteriores han firmado, es el turno de este firmante
            if (previousCount === expectedPreviousCount) {
              const existingNotif = await query(
                `SELECT id FROM notifications
                 WHERE document_id = $1 AND user_id = $2 AND type = 'signature_request'`,
                [documentId, nextSigner.id]
              );

              if (existingNotif.rows.length === 0) {
                const docTitle = doc.title;
                await query(
                  `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [nextSigner.id, 'signature_request', documentId, user.id, docTitle]
                );

                if (nextSigner.email_notifications) {
                  try {
                    await notificarAsignacionFirmante({
                      email: nextSigner.email,
                      nombreFirmante: nextSigner.name,
                      nombreDocumento: docTitle,
                      documentoId: documentId,
                      creadorDocumento: user.name
                    });
                    console.log(`📧 Correo enviado al siguiente firmante: ${nextSigner.email}`);
                  } catch (emailError) {
                    console.error('Error al enviar correo al siguiente firmante:', emailError);
                  }
                } else {
                  console.log(`⏭️ Notificaciones desactivadas para: ${nextSigner.email}`);
                }
              }
            }
          }
        } catch (notifError) {
          console.error('Error al notificar al siguiente firmante:', notifError);
        }
      }

      try {
        console.log(`📋 Actualizando página de portada del documento ${documentId}...`);

        const docInfoResult = await query(
          `SELECT d.*, u.name as uploader_name, dt.name as document_type_name
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length > 0) {
          const docInfo = docInfoResult.rows[0];

          const signersResult = await query(
            `SELECT u.id, u.name, u.email, ds.order_position, ds.role_name, ds.role_names,
                    COALESCE(s.status, 'pending') as status,
                    s.signed_at,
                    s.rejected_at,
                    s.rejection_reason,
                    s.consecutivo,
                    s.real_signer_name
            FROM document_signers ds
            JOIN users u ON ds.user_id = u.id
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows;

          if (signers.length > 0) {
            const pdfPath = path.join(__dirname, '..', docInfo.file_path);

            const documentInfo = {
              title: docInfo.title,
              fileName: docInfo.file_name,
              createdAt: docInfo.created_at,
              uploadedBy: docInfo.uploader_name || 'Sistema',
              documentTypeName: docInfo.document_type_name || null
            };

            await updateSignersPage(pdfPath, signers, documentInfo);
            console.log('✅ Página de portada actualizada exitosamente');
          }
        }
      } catch (coverError) {
        console.error('❌ Error al actualizar página de portada:', coverError);
      }

      return true;
    },

    /**
     * Reorders signers in a document's signing sequence
     *
     * BUSINESS RULE: Cannot reorder signers in completed documents.
     * BUSINESS RULE: Cannot move signed/rejected signers BEFORE their current position.
     * BUSINESS RULE: New order must contain exactly the same user IDs as current signers.
     * BUSINESS RULE: Signers who lose their turn have notifications removed.
     * BUSINESS RULE: Signers who gain their turn receive new notifications and emails.
     *
     * Sequential ordering validation:
     * - A signer is "in turn" only if ALL previous signers have signed
     * - Moving a signed signer forward is allowed (doesn't affect completed signature)
     * - Moving a signed signer backward is prohibited (would break sequence integrity)
     *
     * Notification management:
     * - Previous "in turn" signers are compared with new "in turn" signers
     * - Only signers who transition from "not in turn" to "in turn" get notified
     * - Signers who transition from "in turn" to "not in turn" have notifications deleted
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.documentId - ID of the document
     * @param {Array<number>} args.newOrder - Array of user IDs in desired order
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user (must be owner or admin)
     * @returns {Promise<boolean>} True if reordering succeeds
     * @throws {Error} When unauthorized, completed, invalid order, or moving signed signer backward
     */
    reorderSigners: async (_, { documentId, newOrder }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docResult = await query('SELECT * FROM documents WHERE id = $1', [documentId]);
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];

      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado para reordenar firmantes de este documento');
      }

      if (doc.status === 'completed') {
        throw new Error('No se pueden reordenar firmantes de un documento completado');
      }

      const signersResult = await query(
        `SELECT ds.user_id, ds.order_position, s.status, u.name, u.email, u.email_notifications
         FROM document_signers ds
         LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
         LEFT JOIN users u ON u.id = ds.user_id
         WHERE ds.document_id = $1
         ORDER BY ds.order_position ASC`,
        [documentId]
      );

      const currentSigners = signersResult.rows;

      // Validar que el newOrder contenga exactamente los mismos user_ids
      const currentUserIds = new Set(currentSigners.map(s => s.user_id));
      const newOrderUserIds = new Set(newOrder);

      if (currentUserIds.size !== newOrderUserIds.size ||
          ![...currentUserIds].every(id => newOrderUserIds.has(id))) {
        throw new Error('El nuevo orden debe contener exactamente los mismos firmantes');
      }

      // Validar que no se muevan firmantes que ya firmaron o rechazaron antes de sus posiciones actuales
      const signersMap = new Map(currentSigners.map(s => [s.user_id, s]));

      for (let i = 0; i < newOrder.length; i++) {
        const userId = newOrder[i];
        const signer = signersMap.get(userId);
        const oldPosition = signer.order_position;
        const newPosition = i + 1; // Las posiciones empiezan en 1

        if ((signer.status === 'signed' || signer.status === 'rejected') && newPosition < oldPosition) {
          throw new Error(`No se puede mover a ${signer.name || signer.email} antes de su posición actual porque ya ha ${signer.status === 'signed' ? 'firmado' : 'rechazado'}`);
        }
      }

      // Obtener firmantes que estaban en turno de firmar ANTES del reordenamiento
      const previousInTurnResult = await query(
        `SELECT ds.user_id, u.name, u.email, u.email_notifications
         FROM document_signers ds
         LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
         LEFT JOIN users u ON u.id = ds.user_id
         WHERE ds.document_id = $1 AND s.status = 'pending'
         ORDER BY ds.order_position ASC`,
        [documentId]
      );

      const previousInTurn = [];
      for (const signer of previousInTurnResult.rows) {
        const previousSignedCount = await query(
          `SELECT COUNT(*) as count
           FROM document_signers ds
           LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
           WHERE ds.document_id = $1
           AND ds.order_position < (SELECT order_position FROM document_signers WHERE document_id = $1 AND user_id = $2)
           AND s.status = 'signed'`,
          [documentId, signer.user_id]
        );

        const expectedPreviousCount = (await query(
          'SELECT order_position FROM document_signers WHERE document_id = $1 AND user_id = $2',
          [documentId, signer.user_id]
        )).rows[0].order_position - 1;

        if (parseInt(previousSignedCount.rows[0].count) === expectedPreviousCount) {
          previousInTurn.push(signer.user_id);
        }
      }

      for (let i = 0; i < newOrder.length; i++) {
        const userId = newOrder[i];
        const newPosition = i + 1;

        await query(
          `UPDATE document_signers
           SET order_position = $1
           WHERE document_id = $2 AND user_id = $3`,
          [newPosition, documentId, userId]
        );
      }

      // Obtener firmantes que están en turno DESPUÉS del reordenamiento
      const newInTurnResult = await query(
        `SELECT ds.user_id, u.name, u.email, u.email_notifications, ds.order_position
         FROM document_signers ds
         LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
         LEFT JOIN users u ON u.id = ds.user_id
         WHERE ds.document_id = $1 AND s.status = 'pending'
         ORDER BY ds.order_position ASC`,
        [documentId]
      );

      const newInTurn = [];
      for (const signer of newInTurnResult.rows) {
        const previousSignedCount = await query(
          `SELECT COUNT(*) as count
           FROM document_signers ds
           LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
           WHERE ds.document_id = $1
           AND ds.order_position < $2
           AND s.status = 'signed'`,
          [documentId, signer.order_position]
        );

        const expectedPreviousCount = signer.order_position - 1;
        const actualPreviousCount = parseInt(previousSignedCount.rows[0].count);

        console.log(`🔍 Verificando turno para ${signer.name} (posición ${signer.order_position}): ${actualPreviousCount} de ${expectedPreviousCount} anteriores firmados`);

        if (actualPreviousCount === expectedPreviousCount) {
          newInTurn.push(signer.user_id);
          console.log(`✅ ${signer.name} está en turno de firmar`);
        } else {
          console.log(`⏸️ ${signer.name} debe esperar a que firmen ${expectedPreviousCount - actualPreviousCount} firmante(s) anterior(es)`);
        }
      }

      // Eliminar notificaciones de los que YA NO están en turno
      const usersToRemoveNotifications = previousInTurn.filter(userId => !newInTurn.includes(userId));

      console.log(`📊 Resumen de cambios de turno:`);
      console.log(`   - Usuarios que estaban en turno ANTES: [${previousInTurn.join(', ')}]`);
      console.log(`   - Usuarios que están en turno AHORA: [${newInTurn.join(', ')}]`);
      console.log(`   - Notificaciones a eliminar: [${usersToRemoveNotifications.join(', ')}]`);

      for (const userId of usersToRemoveNotifications) {
        const userInfo = await query('SELECT name FROM users WHERE id = $1', [userId]);
        const userName = userInfo.rows.length > 0 ? userInfo.rows[0].name : userId;

        await query(
          `DELETE FROM notifications
           WHERE document_id = $1 AND user_id = $2 AND type = 'signature_request'`,
          [documentId, userId]
        );
        console.log(`🗑️ Notificación eliminada para ${userName} (ya no está en turno)`);
      }

      const docInfoForNotif = await query(
        'SELECT title, uploaded_by FROM documents WHERE id = $1',
        [documentId]
      );
      const docTitle = docInfoForNotif.rows.length > 0 ? docInfoForNotif.rows[0].title : 'Documento';
      const docCreatorId = docInfoForNotif.rows.length > 0 ? docInfoForNotif.rows[0].uploaded_by : user.id;

      for (const userId of newInTurn) {
        const signerInfo = newInTurnResult.rows.find(s => s.user_id === userId);

        const existingNotif = await query(
          `SELECT id FROM notifications
           WHERE document_id = $1 AND user_id = $2 AND type = 'signature_request'`,
          [documentId, userId]
        );

        if (existingNotif.rows.length === 0) {
          await query(
            `INSERT INTO notifications (user_id, document_id, type, actor_id, document_title, created_at)
             VALUES ($1, $2, 'signature_request', $3, $4, NOW())`,
            [userId, documentId, docCreatorId, docTitle]
          );

          const signerName = signerInfo ? signerInfo.name : userId;
          console.log(`✅ Notificación creada para ${signerName} (posición ${signerInfo ? signerInfo.order_position : '?'}) - ahora está en turno`);

          if (signerInfo && signerInfo.email_notifications) {
            try {
              const creatorResult = await query('SELECT name FROM users WHERE id = $1', [docCreatorId]);
              const creatorName = creatorResult.rows.length > 0 ? creatorResult.rows[0].name : 'Administrador';

              await notificarAsignacionFirmante({
                email: signerInfo.email,
                nombreFirmante: signerInfo.name,
                nombreDocumento: docTitle,
                documentoId: documentId,
                creadorDocumento: creatorName
              });
              console.log(`📧 Email enviado a ${signerInfo.name} (${signerInfo.email})`);
            } catch (emailError) {
              console.error(`❌ Error al enviar email a ${signerInfo.name}:`, emailError.message);
            }
          } else {
            const reason = signerInfo && !signerInfo.email_notifications ? 'notificaciones desactivadas' : 'sin info de firmante';
            console.log(`⏭️ Email NO enviado a ${signerName} (${reason})`);
          }
        } else {
          const signerName = signerInfo ? signerInfo.name : userId;
          console.log(`ℹ️ ${signerName} ya tiene notificación (continúa en turno sin cambios)`);
        }
      }

      try {
        const docInfo = await query(
          `SELECT d.*, u.name as uploader_name, dt.name as document_type_name
           FROM documents d
           LEFT JOIN users u ON d.uploaded_by = u.id
           LEFT JOIN document_types dt ON d.document_type_id = dt.id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docInfo.rows.length > 0) {
          const signersResult = await query(
            `SELECT u.id, u.name, u.email, ds.order_position, ds.role_name, ds.role_names, s.status, s.signed_at, s.rejected_at, s.rejection_reason, s.consecutivo, s.real_signer_name
             FROM document_signers ds
             JOIN users u ON ds.user_id = u.id
             LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
             WHERE ds.document_id = $1
             ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows;

          if (signers.length > 0) {
            const pdfPath = path.join(__dirname, '..', docInfo.rows[0].file_path);

            const documentInfo = {
              title: docInfo.rows[0].title,
              fileName: docInfo.rows[0].file_name,
              createdAt: docInfo.rows[0].created_at,
              uploadedBy: docInfo.rows[0].uploader_name || 'Sistema',
              documentTypeName: docInfo.rows[0].document_type_name || null
            };

            await updateSignersPage(pdfPath, signers, documentInfo);
            console.log('✅ Página de informe actualizada después de reordenar');
          }
        }
      } catch (coverError) {
        console.error('❌ Error al actualizar página de portada:', coverError);
      }

      return true;
    },

    /**
     * Deletes a document and its associated file from the file system
     *
     * BUSINESS RULE: Only document owner or admin can delete documents.
     * BUSINESS RULE: All notifications related to the document are deleted (cascade).
     * BUSINESS RULE: Physical PDF file is deleted from uploads directory.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.id - ID of the document to delete
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<boolean>} True if deletion succeeds
     * @throws {Error} When unauthorized or document not found
     */
    deleteDocument: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docResult = await query('SELECT * FROM documents WHERE id = $1', [id]);
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];
      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      // ========== ELIMINAR TODAS LAS NOTIFICACIONES DEL DOCUMENTO ==========
      try {
        await query(
          `DELETE FROM notifications WHERE document_id = $1`,
          [id]
        );

        console.log(`🗑️ Todas las notificaciones del documento eliminadas`);
      } catch (notifError) {
        console.error('Error al eliminar notificaciones:', notifError);
        // No lanzamos el error para que no falle la eliminación
      }

      const fs = require('fs');
      const path = require('path');
      // file_path ya incluye 'uploads/', así que lo quitamos para construir la ruta correcta
      const relativePath = doc.file_path.replace(/^uploads\//, '');
      const filePath = path.join(__dirname, '..', 'uploads', relativePath);

      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🗑️ Archivo eliminado: ${filePath}`);
        }
      } catch (err) {
        console.error('Error al eliminar archivo:', err);
      }

      await query('DELETE FROM documents WHERE id = $1', [id]);

      // Registrar eliminación en logs
      try {
        const deleterResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
        if (deleterResult.rows.length > 0) {
          const deleterName = deleterResult.rows[0].name;
          pdfLogger.logDocumentDeleted(deleterName, doc.title);
        }
      } catch (logError) {
        console.error('Error al registrar log de eliminación:', logError);
      }

      return true;
    },

    /**
     * Rejects a document with a reason, halting the signing workflow
     *
     * BUSINESS RULE: Signer must be next in sequential order to reject (same as signing).
     * BUSINESS RULE: If not first signer, previous signer MUST have signed before rejection is allowed.
     * BUSINESS RULE: Document status changes to 'rejected' immediately on any rejection.
     * BUSINESS RULE: All pending signature_request notifications are deleted (workflow halted).
     * BUSINESS RULE: Document creator receives rejection notification and email.
     * BUSINESS RULE: Rejector does NOT receive notification (they initiated the action).
     *
     * Sequential validation:
     * - First signer (position 1) can reject immediately
     * - Subsequent signers can only reject after previous signer has signed
     * - This prevents out-of-order rejections that would violate workflow
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.documentId - ID of the document
     * @param {string} [args.reason] - Reason for rejection (optional)
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user (must be assigned signer)
     * @returns {Promise<boolean>} True if rejection succeeds
     * @throws {Error} When unauthorized, not in sequence, or not assigned to document
     */
    rejectDocument: async (_, { documentId, reason, realSignerName }, { user }) => {
      if (!user) throw new Error('No autenticado');

      // Validar orden secuencial - el usuario debe ser el siguiente en la fila para rechazar
      const orderCheck = await query(
        `SELECT ds.order_position, ds.user_id
        FROM document_signers ds
        WHERE ds.document_id = $1 AND ds.user_id = $2`,
        [documentId, user.id]
      );

      if (orderCheck.rows.length === 0) {
        throw new Error('No estás asignado a este documento');
      }

      const currentOrder = orderCheck.rows[0].order_position;

      // Si no es el primer firmante, validar que el anterior haya firmado
      if (currentOrder > 1) {
        const previousSignerCheck = await query(
          `SELECT s.status, u.name as signer_name
          FROM document_signers ds
          JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
          JOIN users u ON u.id = ds.user_id
          WHERE ds.document_id = $1 AND ds.order_position = $2`,
          [documentId, currentOrder - 1]
        );

        if (previousSignerCheck.rows.length === 0) {
          throw new Error('Error al verificar el orden de firma');
        }

        const previousSigner = previousSignerCheck.rows[0];

        if (previousSigner.status !== 'signed') {
          throw new Error(`Solo puedes rechazar cuando ${previousSigner.signer_name} haya firmado primero (Firmante #${currentOrder - 1})`);
        }
      }

      const now = new Date().toISOString();

      await query(
        'UPDATE signatures SET status = $1, rejection_reason = $2, rejected_at = $3, signed_at = $3, real_signer_name = $4 WHERE document_id = $5 AND signer_id = $6',
        ['rejected', reason || '', now, realSignerName || null, documentId, user.id]
      );

      const statusResult = await query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) as signed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM signatures
        WHERE document_id = $1`,
        [documentId]
      );

      const stats = statusResult.rows[0];
      const total = parseInt(stats.total);
      const signed = parseInt(stats.signed);
      const rejected = parseInt(stats.rejected);

      let newStatus = 'pending';

      if (rejected > 0) {
        // Si hay alguna firma rechazada, el documento está rechazado
        newStatus = 'rejected';
      } else if (total > 0 && signed === total) {
        // Si todas las firmas están completas, el documento está completado
        newStatus = 'completed';
      } else if (signed > 0 && signed < total) {
        // Si hay algunas firmas pero no todas, está en progreso
        newStatus = 'in_progress';
      }

      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        [newStatus, documentId]
      );

      // ========== GESTIONAR NOTIFICACIONES INTERNAS Y EMAILS ==========
      try {
        // 1. Eliminar TODAS las notificaciones de signature_request del documento
        // ya que el documento fue rechazado y nadie más necesita firmar
        await query(
          `DELETE FROM notifications
           WHERE document_id = $1
           AND type = 'signature_request'`,
          [documentId]
        );

        const docResult = await query(
          'SELECT title, uploaded_by FROM documents WHERE id = $1',
          [documentId]
        );

        if (docResult.rows.length > 0) {
          const doc = docResult.rows[0];

          const rejectorResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
          const rejectorName = rejectorResult.rows.length > 0 ? rejectorResult.rows[0].name : 'Usuario';

          // Registrar rechazo en logs
          pdfLogger.logDocumentRejected(rejectorName, doc.title, reason || 'Sin razón especificada');

          // 2. Crear notificación interna para el creador (si no es quien rechazó)
          if (doc.uploaded_by !== user.id) {
            await query(
              `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
               VALUES ($1, $2, $3, $4, $5)`,
              [doc.uploaded_by, 'document_rejected', documentId, user.id, doc.title]
            );
          }

          // 3. Enviar correo de rechazo SOLO al creador del documento (si no es quien rechazó)
          if (doc.uploaded_by !== user.id) {
            try {
              const creatorResult = await query('SELECT email, name, email_notifications FROM users WHERE id = $1', [doc.uploaded_by]);

              if (creatorResult.rows.length > 0) {
                const creator = creatorResult.rows[0];

                if (creator.email_notifications) {
                  console.log('📧 Documento rechazado, enviando correo al creador...');

                  await notificarDocumentoRechazado({
                    emails: [creator.email],
                    nombreDocumento: doc.title,
                    documentoId: documentId,
                    rechazadoPor: rejectorName,
                    motivoRechazo: reason || 'Sin motivo especificado'
                  });

                  console.log(`✅ Correo de rechazo enviado al creador: ${creator.email}`);
                } else {
                  console.log(`⏭️ Notificaciones desactivadas para el creador: ${creator.email}`);
                }
              }
            } catch (emailError) {
              console.error('Error al enviar correo de rechazo:', emailError);
              // No lanzamos el error para que no falle el rechazo
            }
          }
        }
      } catch (notifError) {
        console.error('Error al crear notificaciones de rechazo:', notifError);
        // No lanzamos el error para que no falle el rechazo
      }

      // ========== ACTUALIZAR PÁGINA DE FIRMANTES ==========
      try {
        console.log(`📋 Actualizando página de firmantes para documento ${documentId}...`);

        const docInfoResult = await query(
          `SELECT d.*, u.name as uploader_name, dt.name as document_type_name
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length > 0) {
          const docInfo = docInfoResult.rows[0];

          const signersResult = await query(
            `SELECT u.id, u.name, u.email, ds.order_position, ds.role_name, ds.role_names,
                    COALESCE(s.status, 'pending') as status,
                    s.signed_at,
                    s.rejected_at,
                    s.rejection_reason,
                    s.consecutivo,
                    s.real_signer_name
            FROM document_signers ds
            JOIN users u ON ds.user_id = u.id
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows;
          const pdfPath = path.join(__dirname, '..', docInfo.file_path);

          const documentInfo = {
            title: docInfo.title,
            fileName: docInfo.file_name,
            createdAt: docInfo.created_at,
            uploadedBy: docInfo.uploader_name || 'Sistema',
            documentTypeName: docInfo.document_type_name || null
          };

          await updateSignersPage(pdfPath, signers, documentInfo);

          console.log('✅ Página de firmantes actualizada después de rechazar');
        }
      } catch (updateError) {
        console.error('❌ Error al actualizar página de firmantes:', updateError);
        // No lanzamos el error para que no falle el rechazo
      }

      return true;
    },

    /**
     * Signs a document with digital signature data and optional consecutive number
     *
     * BUSINESS RULE: Document OWNER can sign at ANY position, bypassing sequential order.
     * BUSINESS RULE: Non-owners MUST wait for previous signer to complete before signing.
     * BUSINESS RULE: When document is completed, creator receives notification and email.
     * BUSINESS RULE: If not completed, NEXT signer in sequence is automatically notified.
     * BUSINESS RULE: Current signer's signature_request notification is deleted after signing.
     * BUSINESS RULE: Document status becomes 'completed' when all signers have signed.
     *
     * Sequential validation (NON-OWNERS ONLY):
     * - First signer (position 1) can sign immediately
     * - Subsequent signers must wait for signer at (position - 1) to complete
     * - Owner exception: Owner can sign regardless of position to approve their own documents
     *
     * Status transitions:
     * - pending → in_progress (after first signature)
     * - in_progress → completed (after last signature)
     * - Any state → rejected (if rejection count > 0)
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.documentId - ID of the document
     * @param {string} args.signatureData - Base64 signature image data
     * @param {string} [args.consecutivo] - Optional consecutive/tracking number
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user (must be assigned signer)
     * @returns {Promise<Object>} Signature record
     * @throws {Error} When unauthorized, not in sequence (non-owner), or not assigned to document
     */
    signDocument: async (_, { documentId, signatureData, consecutivo, realSignerName }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docOwnerCheck = await query(
        'SELECT uploaded_by FROM documents WHERE id = $1',
        [documentId]
      );

      if (docOwnerCheck.rows.length === 0) {
        throw new Error('Documento no encontrado');
      }

      const isOwner = docOwnerCheck.rows[0].uploaded_by === user.id;

      // Validar orden secuencial de firma
      const orderCheck = await query(
        `SELECT ds.order_position, ds.user_id
        FROM document_signers ds
        WHERE ds.document_id = $1 AND ds.user_id = $2`,
        [documentId, user.id]
      );

      if (orderCheck.rows.length === 0) {
        throw new Error('No estás asignado para firmar este documento');
      }

      const currentOrder = orderCheck.rows[0].order_position;

      // EXCEPCIÓN: Si el usuario es el propietario del documento, puede firmar sin importar el orden
      if (currentOrder > 1 && !isOwner) {
        const previousSignerCheck = await query(
          `SELECT s.status, u.name as signer_name
          FROM document_signers ds
          JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
          JOIN users u ON u.id = ds.user_id
          WHERE ds.document_id = $1 AND ds.order_position = $2`,
          [documentId, currentOrder - 1]
        );

        if (previousSignerCheck.rows.length === 0) {
          throw new Error('Error al verificar el orden de firma');
        }

        const previousSigner = previousSignerCheck.rows[0];

        if (previousSigner.status !== 'signed') {
          throw new Error(`Debes esperar a que ${previousSigner.signer_name} firme el documento primero (Firmante #${currentOrder - 1})`);
        }
      }

      const existingSignature = await query(
        `SELECT * FROM signatures WHERE document_id = $1 AND signer_id = $2`,
        [documentId, user.id]
      );

      let result;
      if (existingSignature.rows.length > 0) {
        result = await query(
          `UPDATE signatures
          SET status = 'signed',
              signature_data = $1,
              consecutivo = $2,
              real_signer_name = $3,
              signed_at = CURRENT_TIMESTAMP
          WHERE document_id = $4 AND signer_id = $5
          RETURNING *`,
          [signatureData, consecutivo || null, realSignerName || null, documentId, user.id]
        );
      } else {
        result = await query(
          `INSERT INTO signatures (document_id, signer_id, status, signature_data, signature_type, consecutivo, real_signer_name, signed_at)
          VALUES ($1, $2, 'signed', $3, 'digital', $4, $5, CURRENT_TIMESTAMP)
          RETURNING *`,
          [documentId, user.id, signatureData, consecutivo || null, realSignerName || null]
        );
      }

      if (result.rows.length === 0) {
        throw new Error('Error al registrar la firma');
      }

      const statusResult = await query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) as signed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM signatures
        WHERE document_id = $1`,
        [documentId]
      );

      const stats = statusResult.rows[0];
      const total = parseInt(stats.total);
      const signed = parseInt(stats.signed);
      const pending = parseInt(stats.pending);
      const rejected = parseInt(stats.rejected);

      let newStatus = 'pending';
      let shouldSetCompletedAt = false;

      if (rejected > 0) {
        // Si hay alguna firma rechazada, el documento está rechazado
        newStatus = 'rejected';
      } else if (total > 0 && signed === total) {
        // Si todas las firmas están completas, el documento está completado
        newStatus = 'completed';
        shouldSetCompletedAt = true;
      } else if (signed > 0 && signed < total) {
        // Si hay algunas firmas pero no todas, está en progreso
        newStatus = 'in_progress';
      } else if (pending > 0 && signed === 0) {
        // Si hay firmas pendientes pero ninguna firmada, está pendiente
        newStatus = 'pending';
      }

      if (shouldSetCompletedAt) {
        await query(
          'UPDATE documents SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newStatus, documentId]
        );
      } else {
        await query(
          'UPDATE documents SET status = $1 WHERE id = $2',
          [newStatus, documentId]
        );
      }

      // ========== GESTIONAR NOTIFICACIONES INTERNAS ==========
      try {
        const docResult = await query(
          'SELECT title, uploaded_by, file_path FROM documents WHERE id = $1',
          [documentId]
        );

        if (docResult.rows.length > 0) {
          const doc = docResult.rows[0];

          // Obtener el nombre del usuario que firma
          const signerResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
          if (signerResult.rows.length > 0) {
            const signerName = signerResult.rows[0].name;
            // Registrar TODAS las firmas
            pdfLogger.logDocumentSigned(signerName, doc.title);
          }

          // 1. Eliminar la notificación de signature_request del usuario que acaba de firmar
          await query(
            `DELETE FROM notifications
             WHERE document_id = $1
             AND user_id = $2
             AND type = 'signature_request'`,
            [documentId, user.id]
          );

          // 2. Notificar al creador del documento que alguien firmó (si no es quien firmó)
          if (doc.uploaded_by !== user.id) {
            await query(
              `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
               VALUES ($1, $2, $3, $4, $5)`,
              [doc.uploaded_by, 'document_signed', documentId, user.id, doc.title]
            );
          }

          // 3. Si el documento NO está completado, notificar al siguiente firmante en la fila
          if (newStatus !== 'completed') {
            const nextSignerResult = await query(
              `SELECT ds.user_id, u.name, u.email, u.email_notifications
               FROM document_signers ds
               JOIN users u ON ds.user_id = u.id
               LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
               WHERE ds.document_id = $1
               AND ds.order_position = $2
               AND COALESCE(s.status, 'pending') = 'pending'`,
              [documentId, currentOrder + 1]
            );

            if (nextSignerResult.rows.length > 0) {
              const nextSigner = nextSignerResult.rows[0];

              // Usar INSERT ... WHERE NOT EXISTS para evitar duplicados (no requiere constraint)
              const insertResult = await query(
                `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                 SELECT $1::integer, $2::varchar, $3::integer, $4::integer, $5::varchar
                 WHERE NOT EXISTS (
                   SELECT 1 FROM notifications
                   WHERE user_id = $1::integer AND type = $2::varchar AND document_id = $3::integer
                 )
                 RETURNING id`,
                [nextSigner.user_id, 'signature_request', documentId, doc.uploaded_by, doc.title]
              );

              // Solo enviar email si la notificación fue realmente insertada (no existía antes)
              if (insertResult.rows.length > 0) {
                console.log(`✅ Notificación creada para siguiente firmante (user_id: ${nextSigner.user_id})`);
              } else {
                console.log(`⏭️ Notificación ya existía para user_id ${nextSigner.user_id}, no se envía email duplicado`);
              }

              // Solo enviar email si no existía la notificación (evita emails duplicados)
              if (insertResult.rows.length > 0 && nextSigner.email_notifications) {
                try {
                  const creatorResult = await query('SELECT name FROM users WHERE id = $1', [doc.uploaded_by]);
                  const creatorName = creatorResult.rows.length > 0 ? creatorResult.rows[0].name : 'Administrador';

                  await notificarAsignacionFirmante({
                    email: nextSigner.email,
                    nombreFirmante: nextSigner.name,
                    nombreDocumento: doc.title,
                    documentoId: documentId,
                    creadorDocumento: creatorName
                  });
                  console.log(`📧 Correo enviado al siguiente firmante: ${nextSigner.email}`);
                } catch (emailError) {
                  console.error(`Error al enviar correo al siguiente firmante:`, emailError);
                }
              } else {
                console.log(`⏭️ Email no enviado porque notificaciones están desactivadas para: ${nextSigner.email}`);
              }
            }
          }

          // 4. Si el documento fue COMPLETADO, gestionar notificaciones especiales
          if (newStatus === 'completed') {
            // ya que ahora tendrá una notificación de documento completado
            await query(
              `DELETE FROM notifications
               WHERE document_id = $1
               AND user_id = $2
               AND type = 'document_signed'`,
              [documentId, doc.uploaded_by]
            );

            await query(
              `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
               VALUES ($1, $2, $3, $4, $5)`,
              [doc.uploaded_by, 'document_completed', documentId, user.id, doc.title]
            );
          }

          // ========== ENVIAR CORREO AL CREADOR SI DOCUMENTO COMPLETADO ==========
          if (newStatus === 'completed') {
            try {
              const creatorResult = await query(
                `SELECT email, name, email_notifications FROM users WHERE id = $1`,
                [doc.uploaded_by]
              );

              if (creatorResult.rows.length > 0) {
                const creator = creatorResult.rows[0];

                if (creator.email_notifications) {
                  console.log('📧 Documento completamente firmado, enviando correo al creador...');

                  // Construir URL de descarga usando la ruta de la API
                  const urlDescarga = `http://192.168.0.30:5001/api/download/${documentId}`;

                  await notificarDocumentoFirmadoCompleto({
                    emails: [creator.email],
                    nombreDocumento: doc.title,
                    documentoId: documentId,
                    urlDescarga
                  });

                  console.log(`✅ Correo de documento completado enviado al creador: ${creator.email}`);
                } else {
                  console.log(`⏭️ Notificaciones desactivadas para el creador: ${creator.email}`);
                }
              }
            } catch (emailError) {
              console.error('Error al enviar correo de documento completado:', emailError);
              // No lanzamos el error para que no falle la firma
            }
          }
        }
      } catch (notifError) {
        console.error('Error al crear notificaciones de firma:', notifError);
        // No lanzamos el error para que no falle la firma
      }

      // ========== ACTUALIZAR PÁGINA DE FIRMANTES ==========
      try {
        console.log(`📋 Actualizando página de firmantes para documento ${documentId}...`);

        const docInfoResult = await query(
          `SELECT d.*, u.name as uploader_name, dt.name as document_type_name
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length > 0) {
          const docInfo = docInfoResult.rows[0];

          const signersResult = await query(
            `SELECT u.id, u.name, u.email, ds.order_position, ds.role_name, ds.role_names,
                    COALESCE(s.status, 'pending') as status,
                    s.signed_at,
                    s.rejected_at,
                    s.rejection_reason,
                    s.consecutivo,
                    s.real_signer_name
            FROM document_signers ds
            JOIN users u ON ds.user_id = u.id
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows;
          const pdfPath = path.join(__dirname, '..', docInfo.file_path);

          const documentInfo = {
            title: docInfo.title,
            fileName: docInfo.file_name,
            createdAt: docInfo.created_at,
            uploadedBy: docInfo.uploader_name || 'Sistema',
            documentTypeName: docInfo.document_type_name || null
          };

          await updateSignersPage(pdfPath, signers, documentInfo);

          console.log('✅ Página de firmantes actualizada después de firmar');
        }
      } catch (updateError) {
        console.error('❌ Error al actualizar página de firmantes:', updateError);
        // No lanzamos el error para que no falle la firma
      }

      return result.rows[0];
    },

    /**
     * Marks a single notification as read
     *
     * BUSINESS RULE: Users can only mark their own notifications as read.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.notificationId - ID of the notification
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<Object>} Updated notification object
     * @throws {Error} When notification not found or not owned by user
     */
    markNotificationAsRead: async (_, { notificationId }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(
        'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
        [notificationId, user.id]
      );

      if (result.rows.length === 0) {
        throw new Error('Notificación no encontrada');
      }

      return result.rows[0];
    },

    /**
     * Marks all unread notifications as read for the current user
     *
     * BUSINESS RULE: Only affects notifications owned by the authenticated user.
     * BUSINESS RULE: Only updates notifications where is_read = FALSE.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} __ - Arguments (unused)
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<boolean>} True if update succeeds
     * @throws {Error} When not authenticated
     */
    markAllNotificationsAsRead: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      await query(
        'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
        [user.id]
      );

      return true;
    },
  },

  // Resolvers para campos anidados
  Document: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    fileName: (parent) => parent.file_name,
    filePath: (parent) => parent.file_path,
    fileSize: (parent) => parent.file_size,
    mimeType: (parent) => parent.mime_type,
    uploadedById: (parent) => parent.uploaded_by,
    documentTypeId: (parent) => parent.document_type_id,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
    completedAt: (parent) => parent.completed_at,
    // Campos presentes solo en signedDocuments
    signedAt: (parent) => parent.signed_at,
    signatureType: (parent) => parent.signature_type,

    documentType: async (parent) => {
      if (!parent.document_type_id) return null;

      // Si ya tenemos los datos del tipo de documento en el parent (de un JOIN), usarlos directamente
      if (parent.document_type_code || parent.document_type_name) {
        return {
          id: parent.document_type_id,
          code: parent.document_type_code,
          name: parent.document_type_name
        };
      }

      // Si no, hacer la consulta
      const result = await query('SELECT * FROM document_types WHERE id = $1', [parent.document_type_id]);
      return result.rows[0] || null;
    },

    uploadedBy: async (parent) => {
      // Si ya tenemos los datos del usuario en el parent (de un JOIN), usarlos directamente
      if (parent.uploaded_by_name || parent.uploaded_by_email) {
        return {
          id: parent.uploaded_by,
          name: parent.uploaded_by_name,
          email: parent.uploaded_by_email
        };
      }
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.uploaded_by]);
      return result.rows[0];
    },
    signatures: async (parent) => {
      const result = await query(`
        SELECT s.*, ds.order_position
        FROM signatures s
        LEFT JOIN document_signers ds ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
        WHERE s.document_id = $1
        ORDER BY ds.order_position ASC
      `, [parent.id]);
      return result.rows;
    },
    totalSigners: (parent) => parent.total_signers || 0,
    signedCount: (parent) => parent.signed_count || 0,
    pendingCount: (parent) => parent.pending_count || 0,
  },

  Signature: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    documentId: (parent) => parent.document_id,
    signerId: (parent) => parent.signer_id,
    signatureData: (parent) => parent.signature_data,
    signatureType: (parent) => parent.signature_type,
    ipAddress: (parent) => parent.ip_address,
    userAgent: (parent) => parent.user_agent,
    rejectionReason: (parent) => parent.rejection_reason,
    rejectedAt: (parent) => parent.rejected_at,
    signedAt: (parent) => parent.signed_at,
    realSignerName: (parent) => parent.real_signer_name,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,

    document: async (parent) => {
      const result = await query('SELECT * FROM documents WHERE id = $1', [parent.document_id]);
      return result.rows[0];
    },
    signer: async (parent) => {
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.signer_id]);
      return result.rows[0];
    },
  },

  User: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    adUsername: (parent) => parent.ad_username || null,
    isActive: (parent) => parent.is_active !== undefined ? parent.is_active : true,
    emailNotifications: (parent) => parent.email_notifications !== undefined ? parent.email_notifications : true,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
  },

  Notification: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    userId: (parent) => parent.user_id,
    documentId: (parent) => parent.document_id,
    actorId: (parent) => parent.actor_id,
    documentTitle: (parent) => parent.document_title,
    isRead: (parent) => parent.is_read,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,

    user: async (parent) => {
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.user_id]);
      return result.rows[0];
    },
    document: async (parent) => {
      const result = await query('SELECT * FROM documents WHERE id = $1', [parent.document_id]);
      return result.rows[0] || null;
    },
    actor: async (parent) => {
      if (!parent.actor_id) return null;
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.actor_id]);
      return result.rows[0];
    },
  },

  DocumentType: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    isActive: (parent) => parent.is_active,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,

    roles: async (parent) => {
      const result = await query(`
        SELECT * FROM document_type_roles
        WHERE document_type_id = $1
        ORDER BY order_position ASC
      `, [parent.id]);
      return result.rows;
    },
  },

  DocumentTypeRole: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    documentTypeId: (parent) => parent.document_type_id,
    roleName: (parent) => parent.role_name,
    roleCode: (parent) => parent.role_code,
    orderPosition: (parent) => parent.order_position,
    isRequired: (parent) => parent.is_required,
    createdAt: (parent) => parent.created_at,
  },
};

module.exports = resolvers;
