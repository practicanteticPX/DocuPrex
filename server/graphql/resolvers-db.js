const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs').promises;
const { query, pool } = require('../database/db');
const { authenticateUser } = require('../services/ldap');
const { addCoverPageWithSigners, updateSignersPage } = require('../utils/pdfCoverPage');
const {
  notificarAsignacionFirmante,
  notificarDocumentoFirmadoCompleto,
  notificarDocumentoRechazado
} = require('../services/emailService');
const pdfLogger = require('../utils/pdfLogger');
const { generateFacturaTemplatePDF } = require('../utils/pdfFacturaTemplate');
const { mergePDFs, cleanupTempFiles } = require('../utils/pdfMerger');
const serverConfig = require('../config/server');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';

/**
 * Helper: Obtener firmas de un documento tipo FV
 * Retorna un objeto con el mapeo: { 'nombre_persona': 'nombre_firmante' }
 * Usa el templateData para hacer matching correcto de nombres
 */
async function obtenerFirmasDocumento(documentId, templateData = null) {
  try {
    // Si no se pasa templateData, obtenerlo del documento
    if (!templateData) {
      const docResult = await query(
        'SELECT metadata FROM documents WHERE id = $1',
        [documentId]
      );
      if (docResult.rows.length > 0 && docResult.rows[0].metadata) {
        templateData = typeof docResult.rows[0].metadata === 'string'
          ? JSON.parse(docResult.rows[0].metadata)
          : docResult.rows[0].metadata;
      }
    }

    const result = await query(
      `SELECT
        ds.user_id,
        u.name as user_name,
        u.email,
        s.real_signer_name,
        s.status as signature_status
       FROM document_signers ds
       JOIN users u ON u.id = ds.user_id
       LEFT JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ds.user_id
       WHERE ds.document_id = $1
         AND ds.is_causacion_group = FALSE
         AND s.status = 'signed'
       ORDER BY ds.order_position ASC`,
      [documentId]
    );

    const firmas = {};

    // Helper para normalizar nombres
    const normalizarNombre = (nombre) => {
      if (!nombre) return '';
      return nombre.trim().toUpperCase().replace(/\s+/g, ' ');
    };

    // Helper para verificar si dos nombres coinciden
    const nombresCoinciden = (nombre1, nombre2) => {
      const n1 = normalizarNombre(nombre1);
      const n2 = normalizarNombre(nombre2);

      if (n1 === n2) return true;

      const words1 = n1.split(' ').filter(w => w.length > 2);
      const words2 = n2.split(' ').filter(w => w.length > 2);

      let matchCount = 0;
      words1.forEach(w1 => {
        if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
          matchCount++;
        }
      });

      return matchCount >= 2;
    };

    // Para cada firmante que ha firmado
    result.rows.forEach(row => {
      // Usar SIEMPRE el nombre de la tabla users (ej: "Juliet Acevedo")
      const nombreFirmante = row.user_name;

      // Agregar por nombre de usuario directo
      firmas[row.user_name] = nombreFirmante;

      // Si tenemos templateData, buscar coincidencias
      if (templateData) {
        // Verificar si es el negociador
        if (templateData.nombreNegociador && nombresCoinciden(row.user_name, templateData.nombreNegociador)) {
          firmas[templateData.nombreNegociador] = nombreFirmante;
        }

        // Verificar en las filas de control
        if (templateData.filasControl && Array.isArray(templateData.filasControl)) {
          templateData.filasControl.forEach(fila => {
            // Responsable de Cuenta Contable
            if (fila.respCuentaContable && nombresCoinciden(row.user_name, fila.respCuentaContable)) {
              firmas[fila.respCuentaContable] = nombreFirmante;
            }

            // Responsable de Centro de Costos
            if (fila.respCentroCostos && nombresCoinciden(row.user_name, fila.respCentroCostos)) {
              firmas[fila.respCentroCostos] = nombreFirmante;
            }
          });
        }
      }
    });

    console.log(`📝 Firmas encontradas para documento ${documentId}:`, Object.keys(firmas).length);
    console.log(`📋 Keys de firmas:`, Object.keys(firmas));
    return firmas;
  } catch (error) {
    console.error('❌ Error al obtener firmas:', error);
    return {};
  }
}

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

      // Obtener grupos de causación del usuario
      const userGroups = await query(`
        SELECT cg.codigo
        FROM causacion_integrantes ci
        JOIN causacion_grupos cg ON ci.grupo_id = cg.id
        WHERE ci.user_id = $1 AND ci.activo = true
      `, [user.id]);

      const grupoCodigos = userGroups.rows.map(g => g.codigo);
      console.log(`🔍 pendingDocuments para user ${user.id} (${user.name}), grupos:`, grupoCodigos);

      try {
      const result = await query(`
        SELECT DISTINCT ON (d.id)
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          'pending' as signature_status,
          ds.order_position,
          ds.is_causacion_group,
          ds.grupo_codigo,
          CASE
            WHEN ds.order_position > 1 THEN (
              SELECT COUNT(*)
              FROM document_signers ds_prev
              LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id
                AND (
                  (ds_prev.is_causacion_group = false AND ds_prev.user_id = s_prev.signer_id)
                  OR
                  (ds_prev.is_causacion_group = true AND s_prev.signer_id IN (
                    SELECT ci.user_id FROM causacion_integrantes ci
                    JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                    WHERE cg.codigo = ds_prev.grupo_codigo AND ci.activo = true
                  ))
                )
              WHERE ds_prev.document_id = d.id
                AND ds_prev.order_position < ds.order_position
                AND COALESCE(s_prev.status, 'pending') != 'signed'
            )
            ELSE 0
          END as pending_previous_signers,
          CASE
            WHEN ds.order_position > 1 THEN (
              SELECT COALESCE(cg_prev.nombre, u_prev.name)
              FROM document_signers ds_prev
              LEFT JOIN users u_prev ON ds_prev.user_id = u_prev.id
              LEFT JOIN causacion_grupos cg_prev ON ds_prev.grupo_codigo = cg_prev.codigo
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
        WHERE (
          -- Caso 1: Usuario asignado directamente
          (ds.is_causacion_group = false AND ds.user_id = $1)
          OR
          -- Caso 2: Usuario es miembro de un grupo de causación asignado
          (ds.is_causacion_group = true AND ds.grupo_codigo = ANY($2))
        )
          AND d.status NOT IN ('completed', 'archived', 'rejected')
          -- Verificar que NO haya firmado ya (ni el usuario ni su grupo)
          AND NOT EXISTS (
            SELECT 1 FROM signatures s
            WHERE s.document_id = d.id
            AND (
              (ds.is_causacion_group = false AND s.signer_id = $1 AND s.status IN ('signed', 'rejected'))
              OR
              (ds.is_causacion_group = true AND s.status IN ('signed', 'rejected') AND s.signer_id IN (
                SELECT ci.user_id FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
              ))
            )
          )
          -- Excluir si algún firmante anterior ha rechazado
          AND NOT EXISTS (
            SELECT 1
            FROM document_signers ds_prev
            LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id
              AND (
                (ds_prev.is_causacion_group = false AND ds_prev.user_id = s_prev.signer_id)
                OR
                (ds_prev.is_causacion_group = true AND s_prev.signer_id IN (
                  SELECT ci.user_id FROM causacion_integrantes ci
                  JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                  WHERE cg.codigo = ds_prev.grupo_codigo AND ci.activo = true
                ))
              )
            WHERE ds_prev.document_id = d.id
              AND ds_prev.order_position < ds.order_position
              AND s_prev.status = 'rejected'
          )
        ORDER BY d.id, d.created_at DESC
      `, [user.id, grupoCodigos]);

      console.log(`📋 pendingDocuments encontrados: ${result.rows.length}`, result.rows.map(r => ({ id: r.id, title: r.title })));
      return result.rows;
      } catch (err) {
        console.error('❌ Error en pendingDocuments query:', err.message);
        throw err;
      }
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
          ds.is_causacion_group as "isCausacionGroup",
          ds.grupo_codigo as "grupoCodigo",
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

      const expandedSigners = [];

      for (const row of result.rows) {
        if (row.isCausacionGroup && row.grupoCodigo) {
          // Expandir grupo de causación en sus miembros
          const membersResult = await query(`
            SELECT
              ci.user_id,
              u.id,
              u.name,
              u.email,
              s.id as signature_id,
              s.status as signature_status,
              s.signed_at as signature_signed_at,
              s.rejected_at as signature_rejected_at,
              s.rejection_reason as signature_rejection_reason,
              s.consecutivo as signature_consecutivo,
              s.real_signer_name as signature_real_signer_name,
              s.created_at as signature_created_at
            FROM causacion_integrantes ci
            LEFT JOIN users u ON ci.user_id = u.id
            LEFT JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            LEFT JOIN signatures s ON s.document_id = $1 AND s.signer_id = ci.user_id
            WHERE cg.codigo = $2 AND ci.activo = true
          `, [documentId, row.grupoCodigo]);

          for (const member of membersResult.rows) {
            expandedSigners.push({
              userId: member.user_id,
              orderPosition: row.orderPosition,
              isRequired: row.isRequired,
              assignedRoleId: row.assignedRoleId,
              roleName: row.roleName,
              assignedRoleIds: row.assignedRoleIds || [],
              roleNames: row.roleNames || [],
              user: {
                id: member.id,
                name: member.name,
                email: member.email
              },
              signature: (member.signature_id && member.signature_status) ? {
                id: member.signature_id,
                status: member.signature_status,
                signedAt: member.signature_signed_at || null,
                rejectedAt: member.signature_rejected_at || null,
                rejectionReason: member.signature_rejection_reason || null,
                consecutivo: member.signature_consecutivo || null,
                realSignerName: member.signature_real_signer_name || null,
                createdAt: member.signature_created_at || null
              } : null
            });
          }
        } else {
          // Firmante individual
          expandedSigners.push({
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
          });
        }
      }

      return expandedSigners;
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

    causacionGrupos: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT id, codigo, nombre, descripcion, activo, role_code as "roleCode"
        FROM causacion_grupos
        WHERE activo = true
        ORDER BY nombre ASC
      `);

      return result.rows;
    },

    causacionGrupo: async (_, { codigo }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT id, codigo, nombre, descripcion, activo, role_code as "roleCode"
        FROM causacion_grupos
        WHERE codigo = $1 AND activo = true
      `, [codigo]);

      if (result.rows.length === 0) {
        throw new Error('Grupo de causación no encontrado');
      }

      return result.rows[0];
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
      // Separar assignments en usuarios normales y grupos de causación
      const userAssignments = signerAssignments.filter(sa => !sa.isCausacionGroup && sa.userId !== null && sa.userId !== undefined);
      const grupoCausacionAssignments = signerAssignments.filter(sa => sa.isCausacionGroup && sa.grupoCodigo);
      const userIds = userAssignments.map(sa => sa.userId);

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

      for (const assignment of userAssignments) {
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

        const ownerAssignment = userAssignments.find(sa => sa.userId === user.id);
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
          const assignment = userAssignments.find(sa => sa.userId === otherUserIds[i]);
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
          const assignment = userAssignments.find(sa => sa.userId === userIds[i]);
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
          const ownerAssignment = userAssignments.find(sa => sa.userId === user.id);
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
          const assignment = userAssignments.find(sa => sa.userId === otherUserIds[i]);
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

      // ========== AGREGAR GRUPOS DE CAUSACIÓN (si existen) ==========
      if (grupoCausacionAssignments.length > 0) {
        // Obtener la máxima posición actual de firmantes
        const maxPosResult = await query(
          'SELECT COALESCE(MAX(order_position), 0) as max_pos FROM document_signers WHERE document_id = $1',
          [documentId]
        );
        let currentMaxPos = parseInt(maxPosResult.rows[0].max_pos) || 0;

        for (const grupoAssignment of grupoCausacionAssignments) {
          const { roleIds, roleNames } = normalizeRoles(grupoAssignment);
          currentMaxPos++;

          console.log(`📋 Agregando grupo de causación: ${grupoAssignment.grupoCodigo} en posición ${currentMaxPos}`);

          await query(
            `INSERT INTO document_signers (
              document_id, user_id, order_position, is_required,
              assigned_role_id, role_name, assigned_role_ids, role_names,
              is_causacion_group, grupo_codigo
            )
            VALUES ($1, NULL, $2, TRUE, $3, $4, $5::integer[], $6::text[], TRUE, $7)`,
            [
              documentId,
              currentMaxPos,
              roleIds[0] || null,
              roleNames[0] || null,
              roleIds,
              roleNames,
              grupoAssignment.grupoCodigo
            ]
          );

          console.log(`✅ Grupo ${grupoAssignment.grupoCodigo} agregado en posición ${currentMaxPos}`);
        }
      }

      // Contar estado basado en document_signers (incluye grupos de causación)
      const signersCountResult = await query(
        `SELECT COUNT(*) as total FROM document_signers WHERE document_id = $1`,
        [documentId]
      );
      const totalSigners = parseInt(signersCountResult.rows[0].total);

      // Contar firmados: usuarios normales + grupos de causación con al menos un miembro que firmó
      const signedResult = await query(`
        SELECT COUNT(DISTINCT ds.id) as signed
        FROM document_signers ds
        LEFT JOIN signatures s ON (
          (ds.is_causacion_group = false AND s.document_id = ds.document_id AND s.signer_id = ds.user_id AND s.status = 'signed')
          OR
          (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.status = 'signed' AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
          ))
        )
        WHERE ds.document_id = $1 AND s.id IS NOT NULL
      `, [documentId]);
      const signed = parseInt(signedResult.rows[0].signed || 0);

      // Contar rechazados
      const rejectedResult = await query(`
        SELECT COUNT(DISTINCT ds.id) as rejected
        FROM document_signers ds
        LEFT JOIN signatures s ON (
          (ds.is_causacion_group = false AND s.document_id = ds.document_id AND s.signer_id = ds.user_id AND s.status = 'rejected')
          OR
          (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.status = 'rejected' AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
          ))
        )
        WHERE ds.document_id = $1 AND s.id IS NOT NULL
      `, [documentId]);
      const rejected = parseInt(rejectedResult.rows[0].rejected || 0);

      const pending = totalSigners - signed - rejected;
      const total = totalSigners;

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

          // Determinar el PRIMER firmante en ORDEN de firma (puede ser usuario o grupo de causación)
          const firstSignerResult = await query(
            `SELECT ds.user_id, ds.is_causacion_group, ds.grupo_codigo
             FROM document_signers ds
             WHERE ds.document_id = $1
             ORDER BY ds.order_position ASC
             LIMIT 1`,
            [documentId]
          );

          if (firstSignerResult.rows.length > 0) {
            const firstSigner = firstSignerResult.rows[0];

            if (firstSigner.is_causacion_group && firstSigner.grupo_codigo) {
              // ========== GRUPO DE CAUSACIÓN: Notificar a TODOS los miembros ==========
              console.log(`📋 Primer firmante es grupo de causación: ${firstSigner.grupo_codigo}`);

              const membersResult = await query(`
                SELECT u.id, u.name, u.email, u.email_notifications
                FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                JOIN users u ON ci.user_id = u.id
                WHERE cg.codigo = $1 AND ci.activo = true
              `, [firstSigner.grupo_codigo]);

              console.log(`👥 Grupo ${firstSigner.grupo_codigo} tiene ${membersResult.rows.length} miembros activos`);

              for (const member of membersResult.rows) {
                // No notificar al creador del documento
                if (member.id === user.id) {
                  console.log(`⏭️ Miembro ${member.name} es el creador, se omite notificación`);
                  continue;
                }

                // Crear notificación interna
                const insertResult = await query(
                  `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                   SELECT $1::integer, $2::varchar, $3::integer, $4::integer, $5::varchar
                   WHERE NOT EXISTS (
                     SELECT 1 FROM notifications
                     WHERE user_id = $1::integer AND type = $2::varchar AND document_id = $3::integer
                   )
                   RETURNING id`,
                  [member.id, 'signature_request', documentId, user.id, docTitle]
                );

                if (insertResult.rows.length > 0) {
                  console.log(`✅ Notificación creada para miembro del grupo: ${member.name}`);

                  // Enviar email solo si tiene notificaciones activadas
                  if (member.email_notifications) {
                    try {
                      await notificarAsignacionFirmante({
                        email: member.email,
                        nombreFirmante: member.name,
                        nombreDocumento: docTitle,
                        documentoId: documentId,
                        creadorDocumento: creatorName
                      });
                      console.log(`📧 Correo enviado a miembro del grupo: ${member.email}`);
                    } catch (emailError) {
                      console.error(`Error al enviar correo a ${member.email}:`, emailError);
                    }
                  } else {
                    console.log(`⏭️ Notificaciones email desactivadas para: ${member.email}`);
                  }
                }
              }
            } else if (firstSigner.user_id) {
              // ========== USUARIO NORMAL: Notificar solo a ese usuario ==========
              const firstSignerId = firstSigner.user_id;

              if (firstSignerId !== user.id) {
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
                }
              } else {
                console.log(`⏭️ Primer firmante es el creador del documento (user_id: ${firstSignerId}), se autofirmará sin notificación`);
              }
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

          // Registrar cada asignación (solo usuarios válidos, no grupos)
          for (const assignment of userAssignments) {
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
          `SELECT d.*, u.name as uploader_name, dt.name as document_type_name, dt.code as document_type_code
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
          `SELECT
            u.id,
            COALESCE(u.name, cg.nombre) as name,
            u.email,
            ds.order_position,
            ds.role_name,
            ds.role_names,
            ds.is_causacion_group,
            ds.grupo_codigo,
            cg.nombre as grupo_nombre,
            COALESCE(s.status, 'pending') as status,
            s.signed_at,
            s.rejected_at,
            s.rejection_reason,
            s.consecutivo,
            COALESCE(s.real_signer_name, signer_user.name) as real_signer_name,
            signer_user.email as signer_email
          FROM document_signers ds
          LEFT JOIN users u ON ds.user_id = u.id
          LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
          LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
            (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
            (ds.is_causacion_group = true AND s.signer_id IN (
              SELECT ci.user_id
              FROM causacion_integrantes ci
              JOIN causacion_grupos cg2 ON ci.grupo_id = cg2.id
              WHERE cg2.codigo = ds.grupo_codigo AND ci.activo = true
            ))
          )
          LEFT JOIN users signer_user ON s.signer_id = signer_user.id
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
        let pdfPath = path.join(__dirname, '..', docInfo.file_path);

        console.log(`📂 Ruta del PDF: ${pdfPath}`);

        // ========== GENERAR PDF DEL TEMPLATE DE FACTURA SI APLICA ==========
        const isFVDocument = docInfo.document_type_code === 'FV';
        const hasMetadata = docInfo.metadata && typeof docInfo.metadata === 'object' && Object.keys(docInfo.metadata).length > 0;

        if (isFVDocument && hasMetadata && !hasExistingSigners) {
          try {
            console.log('📋 Documento FV con metadata detectado, generando PDF de plantilla...');

            const templateData = typeof docInfo.metadata === 'string'
              ? JSON.parse(docInfo.metadata)
              : docInfo.metadata;

            const templatePdfBuffer = await generateFacturaTemplatePDF(templateData);

            const templatePdfPath = pdfPath.replace('.pdf', '_template.pdf');
            await fs.writeFile(templatePdfPath, templatePdfBuffer);

            console.log(`✅ PDF de plantilla generado: ${templatePdfPath}`);

            const originalPdfPath = pdfPath;
            const mergedPdfPath = pdfPath.replace('.pdf', '_merged.pdf');

            // Los backups ya se hicieron al subir los archivos, aquí solo fusionamos
            console.log(`📋 Fusionando plantilla con documento original...`);
            await mergePDFs([templatePdfPath, originalPdfPath], mergedPdfPath);

            console.log(`✅ PDFs fusionados: ${mergedPdfPath}`);

            await fs.unlink(originalPdfPath);
            await fs.rename(mergedPdfPath, originalPdfPath);
            await cleanupTempFiles([templatePdfPath]);

            console.log(`✅ PDF original reemplazado con PDF fusionado`);

            pdfPath = originalPdfPath;
          } catch (templateError) {
            console.error('❌ Error al generar/fusionar PDF de plantilla:', templateError);
          }
        }

        // Preparar información del documento para la portada
        let cia = null;
        console.log('🔍 Metadata type:', typeof docInfo.metadata);
        console.log('🔍 Metadata value:', docInfo.metadata);

        if (docInfo.metadata && typeof docInfo.metadata === 'object') {
          cia = docInfo.metadata.cia || null;
          console.log('📦 CIA extraída de metadata (objeto):', cia);
        } else if (docInfo.metadata && typeof docInfo.metadata === 'string') {
          try {
            const parsedMetadata = JSON.parse(docInfo.metadata);
            cia = parsedMetadata.cia || null;
            console.log('📦 CIA extraída de metadata (string parseado):', cia);
          } catch (e) {
            console.warn('⚠️ No se pudo parsear metadata como JSON');
          }
        }

        const documentInfo = {
          title: docInfo.title,
          fileName: docInfo.file_name,
          createdAt: docInfo.created_at,
          uploadedBy: docInfo.uploader_name || 'Sistema',
          documentTypeName: docInfo.document_type_name || null,
          cia: cia
        };

        console.log('🏢 CIA para PDF (assignSigners):', cia);
        console.log('📄 Document Info completo:', documentInfo);

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

      // Recalcular estado basado en document_signers (incluye grupos de causación)
      const stSignersCount = await query(
        `SELECT COUNT(*) as total FROM document_signers WHERE document_id = $1`,
        [documentId]
      );
      const stTotal = parseInt(stSignersCount.rows[0].total);

      // Contar firmados: usuarios normales + grupos de causación con al menos un miembro que firmó
      const stSignedRes = await query(`
        SELECT COUNT(DISTINCT ds.id) as signed
        FROM document_signers ds
        LEFT JOIN signatures s ON (
          (ds.is_causacion_group = false AND s.document_id = ds.document_id AND s.signer_id = ds.user_id AND s.status = 'signed')
          OR
          (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.status = 'signed' AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
          ))
        )
        WHERE ds.document_id = $1 AND s.id IS NOT NULL
      `, [documentId]);
      const stSigned = parseInt(stSignedRes.rows[0].signed || 0);

      // Contar rechazados
      const stRejRes = await query(`
        SELECT COUNT(DISTINCT ds.id) as rejected
        FROM document_signers ds
        LEFT JOIN signatures s ON (
          (ds.is_causacion_group = false AND s.document_id = ds.document_id AND s.signer_id = ds.user_id AND s.status = 'rejected')
          OR
          (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.status = 'rejected' AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
          ))
        )
        WHERE ds.document_id = $1 AND s.id IS NOT NULL
      `, [documentId]);
      const stRejected = parseInt(stRejRes.rows[0].rejected || 0);

      const stPending = stTotal - stSigned - stRejected;

      let newStatus = 'pending';

      if (stRejected > 0) {
        newStatus = 'rejected';
      } else if (stTotal > 0 && stSigned === stTotal) {
        newStatus = 'completed';
      } else if (stSigned > 0 && stSigned < stTotal) {
        newStatus = 'in_progress';
      } else if (stPending > 0 && stSigned === 0) {
        newStatus = 'pending';
      }

      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        [newStatus, documentId]
      );

      // Si el firmante eliminado era el que debía firmar ahora, notificar al siguiente
      if (signatureStatus === 'pending' && stSigned > 0) {
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
            `SELECT
                ds.user_id,
                ds.order_position,
                ds.role_name,
                ds.role_names,
                ds.is_causacion_group,
                ds.grupo_codigo,
                u.name as user_name,
                cg.nombre as grupo_nombre,
                u.email,
                COALESCE(s.status, 'pending') as status,
                s.signed_at,
                s.rejected_at,
                s.rejection_reason,
                s.consecutivo,
                COALESCE(s.real_signer_name, signer_user.name) as real_signer_name,
                signer_user.email as signer_email
            FROM document_signers ds
            LEFT JOIN users u ON ds.user_id = u.id
            LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
              (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
              (ds.is_causacion_group = true AND s.signer_id IN (
                SELECT ci.user_id
                FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = ds.grupo_codigo
              ))
            )
            LEFT JOIN users signer_user ON s.signer_id = signer_user.id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows.map(row => {
            const name = row.is_causacion_group
              ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación')
              : (row.user_name || 'Sin nombre');

            return {
              name: name,
              email: row.signer_email || row.email,
              order_position: row.order_position,
              role_name: row.role_name,
              role_names: row.role_names,
              status: row.status,
              signed_at: row.signed_at,
              rejected_at: row.rejected_at,
              rejection_reason: row.rejection_reason,
              consecutivo: row.consecutivo,
              is_causacion_group: row.is_causacion_group,
              grupo_codigo: row.grupo_codigo,
              real_signer_name: row.real_signer_name
            };
          });

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
            `SELECT
              u.id,
              COALESCE(u.name, cg.nombre) as name,
              u.email,
              ds.order_position,
              ds.role_name,
              ds.role_names,
              ds.is_causacion_group,
              ds.grupo_codigo,
              cg.nombre as grupo_nombre,
              COALESCE(s.status, 'pending') as status,
              s.signed_at,
              s.rejected_at,
              s.rejection_reason,
              s.consecutivo,
              COALESCE(s.real_signer_name, signer_user.name) as real_signer_name,
              signer_user.email as signer_email
             FROM document_signers ds
             LEFT JOIN users u ON ds.user_id = u.id
             LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
             LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
               (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
               (ds.is_causacion_group = true AND s.signer_id IN (
                 SELECT ci.user_id
                 FROM causacion_integrantes ci
                 JOIN causacion_grupos cg2 ON ci.grupo_id = cg2.id
                 WHERE cg2.codigo = ds.grupo_codigo AND ci.activo = true
               ))
             )
             LEFT JOIN users signer_user ON s.signer_id = signer_user.id
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

      // ========== ELIMINAR ARCHIVOS DE BACKUP ORIGINALES ==========
      if (doc.original_pdf_backup) {
        try {
          const backupPaths = JSON.parse(doc.original_pdf_backup);
          console.log(`🗑️ Eliminando ${backupPaths.length} archivo(s) de backup...`);

          for (let i = 0; i < backupPaths.length; i++) {
            const backupRelativePath = backupPaths[i].replace(/^uploads\//, '');
            const backupFullPath = path.join(__dirname, '..', 'uploads', backupRelativePath);

            try {
              if (fs.existsSync(backupFullPath)) {
                fs.unlinkSync(backupFullPath);
                console.log(`   ✅ Backup ${i + 1}/${backupPaths.length} eliminado: ${path.basename(backupFullPath)}`);
              } else {
                console.log(`   ⚠️ Backup ${i + 1}/${backupPaths.length} no encontrado: ${path.basename(backupFullPath)}`);
              }
            } catch (backupErr) {
              console.error(`   ❌ Error al eliminar backup ${i + 1}:`, backupErr.message);
            }
          }

          console.log(`✅ Backups eliminados exitosamente`);
        } catch (parseError) {
          console.error('⚠️ Error al parsear backups para eliminar:', parseError.message);
        }
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

      // ========== DESMARCAR FACTURA SI ES TIPO FV ==========
      try {
        const docTypeResult = await query(
          `SELECT dt.code
           FROM document_types dt
           WHERE dt.id = $1`,
          [doc.document_type_id]
        );

        if (docTypeResult.rows.length > 0) {
          const docType = docTypeResult.rows[0];

          // Solo procesar si es un documento de tipo FV y tiene consecutivo
          if (docType.code === 'FV' && doc.consecutivo) {
            const axios = require('axios');
            const backendHost = serverConfig.backendUrl;

            try {
              await axios.post(
                `${backendHost}/api/facturas/desmarcar-en-proceso/${doc.consecutivo}`,
                {},
                { headers: { 'Content-Type': 'application/json' } }
              );
              console.log(`✅ Factura ${doc.consecutivo} desmarcada (documento eliminado)`);
            } catch (desmarcarError) {
              console.error(`❌ Error al desmarcar factura:`, desmarcarError.message);
            }
          }
        }
      } catch (facturaError) {
        console.error('❌ Error al actualizar estados de factura:', facturaError);
        // No lanzamos el error para que no falle la eliminación
      }

      return true;
    },

    /**
     * Actualiza la plantilla de factura de un documento existente
     * BUSINESS RULE: Solo el creador puede editar
     * BUSINESS RULE: Solo si nadie más ha firmado (autofirma no cuenta)
     * WORKFLOW:
     * 1. Verificar permisos
     * 2. Actualizar templateData en BD
     * 3. Regenerar PDF con Puppeteer
     * 4. Actualizar firmantes (añadir/eliminar según cambios)
     * 5. Enviar notificaciones a nuevos firmantes
     * 6. Eliminar notificaciones de firmantes eliminados
     */
    updateFacturaTemplate: async (_, { documentId, templateData }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Verificar que el documento existe y el usuario es el creador
        const docResult = await client.query(
          'SELECT * FROM documents WHERE id = $1',
          [documentId]
        );

        if (docResult.rows.length === 0) {
          throw new Error('Documento no encontrado');
        }

        const doc = docResult.rows[0];

        if (doc.uploaded_by !== user.id) {
          throw new Error('Solo el creador del documento puede editar la planilla');
        }

        // Verificar que nadie más ha firmado
        const signaturesResult = await client.query(
          `SELECT s.* FROM signatures s
           WHERE s.document_id = $1 AND s.status = 'signed' AND s.signer_id != $2`,
          [documentId, user.id]
        );

        if (signaturesResult.rows.length > 0) {
          throw new Error('No puedes editar la planilla porque ya hay firmas de otros usuarios');
        }

        // Parsear templateData
        const parsedTemplateData = JSON.parse(templateData);
        console.log('📝 Actualizando template para documento:', documentId);

        // Actualizar metadata (templateData) en la BD
        // metadata es JSONB, así que pasamos el objeto parseado
        await client.query(
          'UPDATE documents SET metadata = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [parsedTemplateData, documentId]
        );

        // Obtener firmas actuales del documento
        const firmasActuales = await obtenerFirmasDocumento(documentId, parsedTemplateData);

        // Regenerar PDF con Puppeteer
        console.log('🔄 Regenerando PDF con nueva plantilla...');
        const pdfBuffer = await generateFacturaTemplatePDF(parsedTemplateData, firmasActuales);

        // Guardar planilla en archivo temporal
        const fs = require('fs').promises;
        const path = require('path');
        const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
        await fs.mkdir(tempDir, { recursive: true });
        const tempPlanillaPath = path.join(tempDir, `planilla_${documentId}_${Date.now()}.pdf`);
        await fs.writeFile(tempPlanillaPath, pdfBuffer);
        console.log('✅ Planilla PDF generada:', tempPlanillaPath);

        // Obtener ruta del PDF actual del documento (donde se guardará el resultado)
        const relativePath = doc.file_path.replace(/^uploads\//, '');
        const currentPdfPath = path.join(__dirname, '..', 'uploads', relativePath);

        // Verificar si existe backup(s) del PDF original
        console.log(`🔍 Verificando backups del PDF original para documento ${documentId}...`);
        console.log(`🔍 Campo original_pdf_backup en BD: ${doc.original_pdf_backup || 'NULL'}`);

        let backupFilePaths = [];
        if (doc.original_pdf_backup) {
          try {
            // Parsear el campo como JSON array
            const backupPathsArray = JSON.parse(doc.original_pdf_backup);
            console.log(`📦 Encontrados ${backupPathsArray.length} archivo(s) de backup`);

            // Verificar que cada archivo existe
            for (let i = 0; i < backupPathsArray.length; i++) {
              const relPath = backupPathsArray[i];
              const backupRelativePath = relPath.replace(/^uploads\//, '');
              const backupFullPath = path.join(__dirname, '..', 'uploads', backupRelativePath);

              try {
                await fs.access(backupFullPath);
                const backupStats = await fs.stat(backupFullPath);

                // Contar páginas del backup
                const { PDFDocument: PDFDoc } = require('pdf-lib');
                const backupBytes = await fs.readFile(backupFullPath);
                const backupPdfDoc = await PDFDoc.load(backupBytes);
                const backupPages = backupPdfDoc.getPageCount();

                console.log(`   ✅ Backup ${i + 1}/${backupPathsArray.length}:`);
                console.log(`      - Archivo: ${path.basename(backupFullPath)}`);
                console.log(`      - Tamaño: ${Math.round(backupStats.size / 1024)} KB`);
                console.log(`      - Páginas: ${backupPages}`);

                backupFilePaths.push(backupFullPath);
              } catch (err) {
                console.error(`   ❌ Error accediendo al backup ${i + 1}: ${err.message}`);
              }
            }
          } catch (parseError) {
            console.error(`❌ Error parseando backups: ${parseError.message}`);
            console.warn('⚠️ No se pudieron cargar los backups, usando PDF actual');
            backupFilePaths = [currentPdfPath];
          }
        } else {
          // No hay backup, usar el PDF actual (fallback para documentos antiguos)
          console.warn('⚠️ No hay backups disponibles en BD, usando PDF actual (puede contener planilla vieja)');
          backupFilePaths = [currentPdfPath];
        }

        // Fusionar: Plantilla nueva + TODOS los PDFs originales individuales
        const { mergePDFs } = require('../utils/pdfMerger');
        const tempMergedPath = path.join(tempDir, `merged_${documentId}_${Date.now()}.pdf`);

        // Construir array de archivos a fusionar: [plantilla, backup1, backup2, ...]
        const filesToMerge = [tempPlanillaPath, ...backupFilePaths];

        console.log(`📋 Fusionando ${filesToMerge.length} PDFs:`);
        console.log(`   1. Plantilla nueva: ${path.basename(tempPlanillaPath)}`);
        for (let i = 0; i < backupFilePaths.length; i++) {
          console.log(`   ${i + 2}. PDF original ${i + 1}: ${path.basename(backupFilePaths[i])}`);
        }
        console.log(`   → Resultado temporal: ${tempMergedPath}`);

        // Fusionar todos los archivos
        const mergeResult = await mergePDFs(filesToMerge, tempMergedPath);

        if (!mergeResult.success) {
          throw new Error(`Error al fusionar PDFs: ${mergeResult.error || 'Error desconocido'}`);
        }

        // Verificar tamaño del resultado
        const mergedStats = await fs.stat(tempMergedPath);
        console.log(`✅ PDFs fusionados correctamente (${Math.round(mergedStats.size / 1024)} KB)`);

        // DEBUG: Ver estructura completa de templateData para firmantes
        console.log('🔍 DEBUG - parsedTemplateData.firmantes:', parsedTemplateData.firmantes);
        console.log('🔍 DEBUG - parsedTemplateData keys:', Object.keys(parsedTemplateData));

        // Procesar firmantes de la nueva plantilla
        const newFirmantes = parsedTemplateData.firmantes || [];
        console.log(`📋 Firmantes en la nueva plantilla (${newFirmantes.length}):`,
          newFirmantes.map(f => `${f.nombre || f.name || 'SIN_NOMBRE'} (${f.email || 'SIN_EMAIL'})`).join(', '));

        // Separar usuarios normales y grupos de causación (IGUAL QUE assignSigners)
        const userFirmantes = newFirmantes.filter(f => !f.grupoCodigo);
        const grupoFirmantes = newFirmantes.filter(f => f.grupoCodigo);

        console.log(`📊 Usuarios: ${userFirmantes.length}, Grupos de causación: ${grupoFirmantes.length}`);

        // Obtener firmantes actuales (usuarios) de document_signers
        const currentUsersQuery = await client.query(
          'SELECT user_id FROM document_signers WHERE document_id = $1 AND user_id IS NOT NULL',
          [documentId]
        );
        const currentUserIds = new Set(currentUsersQuery.rows.map(s => s.user_id));

        // Obtener usuarios de los nuevos firmantes
        // Separar firmantes con email y sin email
        const firmantesConEmail = userFirmantes.filter(f => f.email && !f.email.includes('SIN_EMAIL'));
        const firmantesSinEmail = userFirmantes.filter(f => !f.email || f.email.includes('SIN_EMAIL'));

        console.log(`📊 Firmantes con email: ${firmantesConEmail.length}, sin email: ${firmantesSinEmail.length}`);

        // Buscar por email
        const emailsToSearch = firmantesConEmail.map(f => f.email).filter(Boolean);
        let usersByEmail = [];
        if (emailsToSearch.length > 0) {
          const emailResult = await client.query(
            'SELECT id, email, name FROM users WHERE email = ANY($1)',
            [emailsToSearch]
          );
          usersByEmail = emailResult.rows;
        }

        // Buscar por nombre con matching flexible (ignorar grupos de causación que empiezan con '[')
        const firmantesPorBuscar = firmantesSinEmail.filter(f => f.name && !f.name.startsWith('['));
        let usersByName = [];

        if (firmantesPorBuscar.length > 0) {
          console.log(`🔍 Buscando ${firmantesPorBuscar.length} firmantes por nombre...`);

          // Obtener todos los usuarios de la base de datos para hacer matching flexible
          const allUsersResult = await client.query(
            'SELECT id, email, name FROM users WHERE email IS NOT NULL'
          );
          const allUsers = allUsersResult.rows;
          console.log(`📊 Total usuarios en BD: ${allUsers.length}`);

          // Función de matching flexible - COPIADA EXACTAMENTE de Dashboard.jsx
          const findUserByNameMatch = (fullName, usersList) => {
            if (!fullName || !usersList || usersList.length === 0) return null;

            // Normalizar el nombre completo: uppercase y separar por palabras
            const searchWords = fullName.trim().toUpperCase().split(/\s+/).filter(w => w.length > 0);

            console.log(`  🔎 Buscando: "${fullName}" → Words: [${searchWords.join(', ')}]`);

            if (searchWords.length === 0) return null;

            // Buscar usuario que tenga coincidencia de al menos 2 palabras (nombre + apellido)
            const matched = usersList.find(user => {
              if (!user.name) return false;

              const userWords = user.name.trim().toUpperCase().split(/\s+/).filter(w => w.length > 0);

              if (userWords.length === 0) return false;

              // Contar cuántas palabras del nombre de búsqueda están en el nombre del usuario
              let matchCount = 0;
              searchWords.forEach(searchWord => {
                if (userWords.some(userWord =>
                  userWord === searchWord ||
                  userWord.startsWith(searchWord) ||
                  searchWord.startsWith(userWord)
                )) {
                  matchCount++;
                }
              });

              const hasMatch = matchCount >= 2 || (userWords.length === 1 && matchCount >= 1);

              if (hasMatch) {
                console.log(`    ✅ MATCH: "${user.name}" (matchCount: ${matchCount}/${searchWords.length}, userWords: [${userWords.join(', ')}])`);
              }

              // Requerir al menos 2 coincidencias (nombre + apellido)
              // O si el usuario tiene solo 1 palabra, que esa palabra coincida
              return hasMatch;
            });

            if (!matched) {
              console.log(`    ❌ No se encontró match`);
            }

            return matched || null;
          };

          // Buscar cada firmante con matching flexible
          for (const firmante of firmantesPorBuscar) {
            console.log(`\n🔍 Procesando firmante: "${firmante.name}"`);
            const matchedUser = findUserByNameMatch(firmante.name, allUsers);
            if (matchedUser) {
              usersByName.push(matchedUser);
              console.log(`✅ Match encontrado: "${firmante.name}" → "${matchedUser.name}" (ID: ${matchedUser.id})`);
            } else {
              console.log(`❌ NO se encontró match para: "${firmante.name}"`);
            }
          }
        }

        // Combinar resultados en un mapa unificado
        const newSignersMap = new Map();

        // Agregar usuarios encontrados por email
        usersByEmail.forEach(u => {
          newSignersMap.set(`email:${u.email}`, u.id);
        });

        // Agregar usuarios encontrados por nombre (usando el nombre ORIGINAL del template)
        firmantesPorBuscar.forEach((firmante, idx) => {
          if (usersByName[idx]) {
            newSignersMap.set(`name:${firmante.name}`, usersByName[idx].id);
          }
        });

        console.log(`👥 Usuarios encontrados (${usersByEmail.length + usersByName.length}):`,
          [...usersByEmail, ...usersByName].map(u => `${u.name} (${u.email})`).join(', '));

        // Identificar firmantes a añadir y eliminar
        const newSignerIds = new Set();
        for (const firmante of newFirmantes) {
          // Buscar primero por email, luego por nombre
          let userId = null;
          if (firmante.email && !firmante.email.includes('SIN_EMAIL')) {
            userId = newSignersMap.get(`email:${firmante.email}`);
          }
          if (!userId && firmante.name && !firmante.name.startsWith('[')) {
            userId = newSignersMap.get(`name:${firmante.name}`);
          }

          if (userId) {
            newSignerIds.add(userId);
          } else if (!firmante.name.startsWith('[')) {
            // Solo advertir si no es un grupo de causación
            console.warn(`⚠️ No se encontró usuario para: ${firmante.name} (${firmante.email || 'SIN_EMAIL'})`);
          }
        }

        // Firmantes (usuarios) a eliminar, añadir y mantener
        const signersToRemove = [...currentUserIds].filter(id => !newSignerIds.has(id));
        const signersToAdd = [...newSignerIds].filter(id => !currentUserIds.has(id));
        const signersToKeep = [...newSignerIds].filter(id => currentUserIds.has(id));

        console.log(`📊 Análisis de cambios en firmantes (usuarios):`);
        console.log(`  ✅ Mantener: ${signersToKeep.length} usuarios`);
        console.log(`  ➕ Añadir: ${signersToAdd.length} usuarios`);
        console.log(`  🗑️  Eliminar: ${signersToRemove.length} usuarios`);

        // Grupos de causación: eliminar todos y recrear (más simple y seguro)
        await client.query(
          'DELETE FROM document_signers WHERE document_id = $1 AND is_causacion_group = TRUE',
          [documentId]
        );
        console.log(`🗑️ Eliminados todos los grupos de causación (se recrearán)`);

        // Eliminar usuarios que ya no están
        if (signersToRemove.length > 0) {
          // Eliminar de document_signers
          await client.query(
            'DELETE FROM document_signers WHERE document_id = $1 AND user_id = ANY($2)',
            [documentId, signersToRemove]
          );

          // Eliminar de signatures (en cascada por FK, pero explícito es mejor)
          await client.query(
            'DELETE FROM signatures WHERE document_id = $1 AND signer_id = ANY($2)',
            [documentId, signersToRemove]
          );

          // Eliminar notificaciones de esos firmantes
          await client.query(
            'DELETE FROM notifications WHERE document_id = $1 AND user_id = ANY($2)',
            [documentId, signersToRemove]
          );

          console.log(`🗑️ Eliminados ${signersToRemove.length} usuarios`);
        }

        // ========== PROCESAR FIRMANTES (usuarios y grupos) EN ORDEN ==========
        // Procesar TODOS los firmantes (usuarios + grupos) en el orden que vienen
        for (let i = 0; i < newFirmantes.length; i++) {
          const firmante = newFirmantes[i];
          const orderPosition = i + 1;

          // Función helper para normalizar roles (igual que assignSigners)
          const normalizeRoles = (firmante) => {
            let roleNames = [];

            // role puede ser un array o un string
            if (Array.isArray(firmante.role)) {
              roleNames = firmante.role;
            } else if (typeof firmante.role === 'string') {
              roleNames = [firmante.role];
            }

            // Fallback a cargo si no hay role
            if (roleNames.length === 0 && firmante.cargo) {
              roleNames = [firmante.cargo];
            }

            return { roleNames };
          };

          // ========== GRUPO DE CAUSACIÓN ==========
          if (firmante.grupoCodigo) {
            const { roleNames } = normalizeRoles(firmante);

            console.log(`📋 Agregando grupo de causación: ${firmante.grupoCodigo} en posición ${orderPosition}`);

            await client.query(
              `INSERT INTO document_signers (
                document_id, user_id, order_position, is_required,
                role_name, role_names,
                is_causacion_group, grupo_codigo
              )
              VALUES ($1, NULL, $2, TRUE, $3, $4::text[], TRUE, $5)`,
              [
                documentId,
                orderPosition,
                roleNames[0] || null, // Legacy singular
                roleNames,
                firmante.grupoCodigo
              ]
            );

            console.log(`✅ Grupo ${firmante.grupoCodigo} agregado`);
            continue;
          }

          // ========== USUARIO NORMAL ==========
          // Buscar userId primero por email, luego por nombre
          let userId = null;
          if (firmante.email && !firmante.email.includes('SIN_EMAIL')) {
            userId = newSignersMap.get(`email:${firmante.email}`);
          }
          if (!userId && firmante.name) {
            userId = newSignersMap.get(`name:${firmante.name}`);
          }

          if (!userId) {
            console.warn(`⚠️ No se encontró usuario para: ${firmante.name}`);
            continue;
          }

          const { roleNames } = normalizeRoles(firmante);

          if (signersToAdd.includes(userId)) {
            // ========== FIRMANTE NUEVO: Añadir y notificar ==========
            // Insertar en document_signers (estrategia UPDATE primero, luego INSERT)
            const updateResult = await client.query(
              `UPDATE document_signers
               SET order_position = $1, role_name = $2, role_names = $3::text[]
               WHERE document_id = $4 AND user_id = $5`,
              [orderPosition, roleNames[0] || null, roleNames, documentId, userId]
            );

            // Si no existía, insertar nuevo registro
            if (updateResult.rowCount === 0) {
              await client.query(
                `INSERT INTO document_signers (document_id, user_id, order_position, is_required, role_name, role_names)
                 VALUES ($1, $2, $3, true, $4, $5::text[])`,
                [documentId, userId, orderPosition, roleNames[0] || null, roleNames]
              );
            }

            // Insertar en signatures
            await client.query(
              `INSERT INTO signatures (document_id, signer_id, status)
               VALUES ($1, $2, 'pending')
               ON CONFLICT (document_id, signer_id) DO NOTHING`,
              [documentId, userId]
            );

            // Crear notificación (solo para firmantes NUEVOS)
            await client.query(
              `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
               SELECT $1::integer, $2::varchar, $3::integer, $4::integer, $5::varchar
               WHERE NOT EXISTS (
                 SELECT 1 FROM notifications
                 WHERE user_id = $1::integer AND type = $2::varchar AND document_id = $3::integer
               )`,
              [userId, 'signature_request', documentId, user.id, doc.title]
            );

            // Enviar correo SOLO si tiene email_notifications = true
            try {
              const userResult = await client.query(
                'SELECT name, email, email_notifications FROM users WHERE id = $1',
                [userId]
              );
              if (userResult.rows.length > 0) {
                const signerUser = userResult.rows[0];
                if (signerUser.email_notifications) {
                  await notificarAsignacionFirmante(
                    signerUser.email,
                    signerUser.name,
                    doc.title,
                    user.name
                  );
                  console.log(`📧 Correo enviado a: ${signerUser.email} (firmante NUEVO)`);
                } else {
                  console.log(`⏭️ Notificaciones desactivadas para: ${signerUser.email}`);
                }
              }
            } catch (emailError) {
              console.error('Error enviando correo:', emailError);
            }

            console.log(`➕ Añadido firmante NUEVO: ${firmante.name}`);
          } else {
            // ========== FIRMANTE EXISTENTE: Solo actualizar posición/rol (SIN notificar) ==========
            await client.query(
              `UPDATE document_signers
               SET order_position = $1, role_name = $2, role_names = $3::text[]
               WHERE document_id = $4 AND user_id = $5`,
              [orderPosition, roleNames[0] || null, roleNames, documentId, userId]
            );
            console.log(`🔄 Actualizado firmante existente: ${firmante.name} - Posición: ${orderPosition}, Roles: [${roleNames.join(', ')}]`);
          }
        }

        // Verificar firmantes finales (usuarios + grupos)
        const finalSignersResult = await client.query(
          `SELECT
            ds.user_id,
            ds.is_causacion_group,
            ds.grupo_codigo,
            u.name as user_name,
            u.email,
            ds.order_position,
            ds.role_name,
            ds.role_names
           FROM document_signers ds
           LEFT JOIN users u ON u.id = ds.user_id
           WHERE ds.document_id = $1
           ORDER BY ds.order_position ASC`,
          [documentId]
        );
        console.log(`✅ Firmantes finales (${finalSignersResult.rows.length}):`);
        finalSignersResult.rows.forEach(s => {
          if (s.is_causacion_group) {
            console.log(`  #${s.order_position}: [GRUPO] ${s.grupo_codigo} - Roles: ${s.role_names ? s.role_names.join(', ') : s.role_name}`);
          } else {
            console.log(`  #${s.order_position}: ${s.user_name} - Roles: ${s.role_names ? s.role_names.join(', ') : s.role_name}`);
          }
        });

        // Obtener todos los firmantes actualizados para la portada
        const signersForCover = await client.query(
          `SELECT
            ds.document_id,
            ds.user_id,
            ds.order_position,
            ds.role_name,
            ds.role_names,
            ds.is_causacion_group,
            ds.grupo_codigo,
            u.name as user_name,
            u.email,
            COALESCE(s.status, 'pending') as status,
            s.signed_at,
            s.rejected_at,
            s.rejection_reason,
            s.consecutivo,
            s.real_signer_name,
            signer_user.email as signer_email
          FROM document_signers ds
          LEFT JOIN users u ON ds.user_id = u.id
          LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
            (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
            (ds.is_causacion_group = true AND s.signer_id IN (
              SELECT ci.user_id
              FROM causacion_integrantes ci
              JOIN causacion_grupos cg ON ci.grupo_id = cg.id
              WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
            ))
          )
          LEFT JOIN users signer_user ON s.signer_id = signer_user.id
          WHERE ds.document_id = $1
          ORDER BY ds.order_position ASC`,
          [documentId]
        );

        const signers = signersForCover.rows.map(row => ({
          name: row.is_causacion_group ? row.grupo_codigo : row.user_name,
          email: row.email,
          order_position: row.order_position,
          role_name: row.role_name,
          role_names: row.role_names,
          status: row.status,
          is_causacion_group: row.is_causacion_group,
          grupo_codigo: row.grupo_codigo
        }));

        // Preparar información del documento para la portada
        const documentInfo = {
          title: doc.title,
          fileName: doc.file_name,
          createdAt: doc.created_at,
          uploadedBy: user.name,
          documentTypeName: 'Factura',
          cia: parsedTemplateData.cia || null
        };

        console.log('🏢 CIA para PDF:', documentInfo.cia);

        // Agregar informe de firmantes al final (el PDF fusionado NO tiene informe todavía)
        console.log('📋 Agregando informe de firmantes al PDF fusionado...');
        const { addCoverPageWithSigners } = require('../utils/pdfCoverPage');
        await addCoverPageWithSigners(tempMergedPath, signers, documentInfo);
        console.log('✅ Informe de firmantes agregado correctamente');

        // Reemplazar el archivo original con el fusionado
        await fs.copyFile(tempMergedPath, currentPdfPath);
        console.log('✅ Archivo del documento reemplazado correctamente');

        // 5. Limpiar archivos temporales
        console.log('🧹 Limpiando archivos temporales...');
        try {
          await fs.unlink(tempPlanillaPath);
          await fs.unlink(tempMergedPath);
          console.log('✅ Archivos temporales eliminados');
        } catch (cleanupError) {
          console.warn('⚠️ No se pudieron eliminar algunos archivos temporales:', cleanupError.message);
        }

        await client.query('COMMIT');

        console.log('✅ Plantilla actualizada exitosamente');

        return {
          success: true,
          message: 'Plantilla actualizada correctamente',
          document: {
            id: documentId,
            templateData: templateData
          }
        };

      } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error actualizando plantilla:', error);
        throw error;
      } finally {
        client.release();
      }
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
            `SELECT
                ds.user_id,
                ds.order_position,
                ds.role_name,
                ds.role_names,
                ds.is_causacion_group,
                ds.grupo_codigo,
                u.name as user_name,
                cg.nombre as grupo_nombre,
                u.email,
                COALESCE(s.status, 'pending') as status,
                s.signed_at,
                s.rejected_at,
                s.rejection_reason,
                s.consecutivo,
                COALESCE(s.real_signer_name, signer_user.name) as real_signer_name,
                signer_user.email as signer_email
            FROM document_signers ds
            LEFT JOIN users u ON ds.user_id = u.id
            LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
              (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
              (ds.is_causacion_group = true AND s.signer_id IN (
                SELECT ci.user_id
                FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = ds.grupo_codigo
              ))
            )
            LEFT JOIN users signer_user ON s.signer_id = signer_user.id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows.map(row => {
            const name = row.is_causacion_group
              ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación')
              : (row.user_name || 'Sin nombre');

            return {
              name: name,
              email: row.signer_email || row.email,
              order_position: row.order_position,
              role_name: row.role_name,
              role_names: row.role_names,
              status: row.status,
              signed_at: row.signed_at,
              rejected_at: row.rejected_at,
              rejection_reason: row.rejection_reason,
              consecutivo: row.consecutivo,
              is_causacion_group: row.is_causacion_group,
              grupo_codigo: row.grupo_codigo,
              real_signer_name: row.real_signer_name
            };
          });
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

      // ========== DESMARCAR FACTURA SI ES TIPO FV ==========
      try {
        const docTypeResult = await query(
          `SELECT dt.code, d.consecutivo
           FROM documents d
           LEFT JOIN document_types dt ON d.document_type_id = dt.id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docTypeResult.rows.length > 0) {
          const docData = docTypeResult.rows[0];

          // Solo procesar si es un documento de tipo FV y tiene consecutivo
          if (docData.code === 'FV' && docData.consecutivo) {
            const axios = require('axios');
            const backendHost = serverConfig.backendUrl;

            try {
              await axios.post(
                `${backendHost}/api/facturas/desmarcar-en-proceso/${docData.consecutivo}`,
                {},
                { headers: { 'Content-Type': 'application/json' } }
              );
              console.log(`✅ Factura ${docData.consecutivo} desmarcada (documento rechazado)`);
            } catch (desmarcarError) {
              console.error(`❌ Error al desmarcar factura:`, desmarcarError.message);
            }
          }
        }
      } catch (facturaError) {
        console.error('❌ Error al actualizar estados de factura:', facturaError);
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

      // Validar orden secuencial de firma - primero buscar asignación directa
      let orderCheck = await query(
        `SELECT ds.order_position, ds.user_id, ds.is_causacion_group, ds.grupo_codigo
        FROM document_signers ds
        WHERE ds.document_id = $1 AND ds.user_id = $2`,
        [documentId, user.id]
      );

      let isCausacionGroupMember = false;
      let grupoCodigo = null;

      // Si no está directamente asignado, verificar si pertenece a un grupo de causación
      if (orderCheck.rows.length === 0) {
        const groupCheck = await query(`
          SELECT ds.order_position, ds.grupo_codigo, cg.nombre as grupo_nombre
          FROM document_signers ds
          JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
          JOIN causacion_integrantes ci ON ci.grupo_id = cg.id
          WHERE ds.document_id = $1
            AND ds.is_causacion_group = true
            AND ci.user_id = $2
            AND ci.activo = true
        `, [documentId, user.id]);

        if (groupCheck.rows.length === 0) {
          throw new Error('No estás asignado para firmar este documento');
        }

        // Verificar que nadie del grupo haya firmado ya
        grupoCodigo = groupCheck.rows[0].grupo_codigo;
        const existingGroupSignature = await query(`
          SELECT s.id, u.name as signer_name
          FROM signatures s
          JOIN users u ON s.signer_id = u.id
          WHERE s.document_id = $1
            AND s.status = 'signed'
            AND s.signer_id IN (
              SELECT ci.user_id
              FROM causacion_integrantes ci
              JOIN causacion_grupos cg ON ci.grupo_id = cg.id
              WHERE cg.codigo = $2 AND ci.activo = true
            )
        `, [documentId, grupoCodigo]);

        if (existingGroupSignature.rows.length > 0) {
          throw new Error(`El grupo ya fue firmado por ${existingGroupSignature.rows[0].signer_name}`);
        }

        isCausacionGroupMember = true;
        orderCheck = { rows: [{ order_position: groupCheck.rows[0].order_position, grupo_codigo: grupoCodigo }] };
        console.log(`👥 Usuario ${user.name} firmando como miembro del grupo ${grupoCodigo}`);
      }

      const currentOrder = orderCheck.rows[0].order_position;

      // EXCEPCIÓN: Si el usuario es el propietario del documento, puede firmar sin importar el orden
      if (currentOrder > 1 && !isOwner) {
        // Obtener información del firmante anterior (puede ser usuario o grupo de causación)
        const previousSignerInfo = await query(
          `SELECT ds.user_id, ds.is_causacion_group, ds.grupo_codigo, cg.nombre as grupo_nombre
           FROM document_signers ds
           LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
           WHERE ds.document_id = $1 AND ds.order_position = $2`,
          [documentId, currentOrder - 1]
        );

        if (previousSignerInfo.rows.length === 0) {
          throw new Error('Error al verificar el orden de firma');
        }

        const prevInfo = previousSignerInfo.rows[0];
        let previousSigned = false;
        let previousName = '';

        if (prevInfo.is_causacion_group) {
          // Firmante anterior es un grupo - verificar si algún miembro firmó
          const groupSigCheck = await query(`
            SELECT s.status, u.name as signer_name
            FROM signatures s
            JOIN users u ON s.signer_id = u.id
            WHERE s.document_id = $1
              AND s.status = 'signed'
              AND s.signer_id IN (
                SELECT ci.user_id
                FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = $2 AND ci.activo = true
              )
          `, [documentId, prevInfo.grupo_codigo]);

          previousSigned = groupSigCheck.rows.length > 0;
          previousName = prevInfo.grupo_nombre || prevInfo.grupo_codigo;
        } else {
          // Firmante anterior es un usuario normal
          const userSigCheck = await query(
            `SELECT s.status, u.name as signer_name
             FROM signatures s
             JOIN users u ON s.signer_id = u.id
             WHERE s.document_id = $1 AND s.signer_id = $2 AND s.status = 'signed'`,
            [documentId, prevInfo.user_id]
          );

          previousSigned = userSigCheck.rows.length > 0;
          const userInfo = await query('SELECT name FROM users WHERE id = $1', [prevInfo.user_id]);
          previousName = userInfo.rows[0]?.name || 'Usuario anterior';
        }

        if (!previousSigned) {
          throw new Error(`Debes esperar a que ${previousName} firme el documento primero (Firmante #${currentOrder - 1})`);
        }
      }

      // Para grupos de causación, siempre guardar el nombre del firmante real
      const effectiveRealSignerName = isCausacionGroupMember ? user.name : (realSignerName || null);

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
          [signatureData, consecutivo || null, effectiveRealSignerName, documentId, user.id]
        );
      } else {
        result = await query(
          `INSERT INTO signatures (document_id, signer_id, status, signature_data, signature_type, consecutivo, real_signer_name, signed_at)
          VALUES ($1, $2, 'signed', $3, 'digital', $4, $5, CURRENT_TIMESTAMP)
          RETURNING *`,
          [documentId, user.id, signatureData, consecutivo || null, effectiveRealSignerName]
        );
      }

      if (result.rows.length === 0) {
        throw new Error('Error al registrar la firma');
      }

      // ========== LOS BACKUPS NUNCA SE ELIMINAN ==========
      // Los archivos originales deben mantenerse SIEMPRE
      // Solo se eliminan cuando se elimina el documento completo (en deleteDocument)
      console.log('📦 Los backups de PDFs originales se mantienen intactos');

      // Contar estado basado en document_signers (incluye grupos de causación)
      const signersCountResult = await query(
        `SELECT COUNT(*) as total FROM document_signers WHERE document_id = $1`,
        [documentId]
      );
      const totalSigners = parseInt(signersCountResult.rows[0].total);

      // Contar firmados: usuarios normales + grupos de causación con al menos un miembro que firmó
      const signedResult = await query(`
        SELECT COUNT(DISTINCT ds.id) as signed
        FROM document_signers ds
        LEFT JOIN signatures s ON (
          (ds.is_causacion_group = false AND s.document_id = ds.document_id AND s.signer_id = ds.user_id AND s.status = 'signed')
          OR
          (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.status = 'signed' AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
          ))
        )
        WHERE ds.document_id = $1 AND s.id IS NOT NULL
      `, [documentId]);
      const signed = parseInt(signedResult.rows[0].signed || 0);

      // Contar rechazados
      const rejectedResult = await query(`
        SELECT COUNT(DISTINCT ds.id) as rejected
        FROM document_signers ds
        LEFT JOIN signatures s ON (
          (ds.is_causacion_group = false AND s.document_id = ds.document_id AND s.signer_id = ds.user_id AND s.status = 'rejected')
          OR
          (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.status = 'rejected' AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
          ))
        )
        WHERE ds.document_id = $1 AND s.id IS NOT NULL
      `, [documentId]);
      const rejected = parseInt(rejectedResult.rows[0].rejected || 0);

      const pending = totalSigners - signed - rejected;
      const total = totalSigners;

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

      // ========== REGENERAR PLANTILLA FV CON FIRMAS ACTUALIZADAS ==========
      try {
        const docInfoResult = await query(
          `SELECT d.id, d.title, d.metadata, d.file_path, d.file_name, d.created_at, d.original_pdf_backup, dt.code as document_type_code
           FROM documents d
           LEFT JOIN document_types dt ON d.document_type_id = dt.id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length > 0) {
          const docInfo = docInfoResult.rows[0];
          const isFVDocument = docInfo.document_type_code === 'FV';
          const hasMetadata = docInfo.metadata && typeof docInfo.metadata === 'object' && Object.keys(docInfo.metadata).length > 0;

          if (isFVDocument && hasMetadata) {
            console.log('📋 Regenerando plantilla FV con firmas actualizadas...');

            const templateData = typeof docInfo.metadata === 'string'
              ? JSON.parse(docInfo.metadata)
              : docInfo.metadata;

            // Obtener firmas actuales
            const firmasActuales = await obtenerFirmasDocumento(documentId, templateData);

            // Regenerar plantilla con firmas
            const templatePdfBuffer = await generateFacturaTemplatePDF(templateData, firmasActuales);

            // Guardar en archivo temporal
            const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
            await fs.mkdir(tempDir, { recursive: true });
            const tempPlanillaPath = path.join(tempDir, `planilla_${documentId}_${Date.now()}.pdf`);
            await fs.writeFile(tempPlanillaPath, templatePdfBuffer);

            // Obtener ruta del PDF actual
            const relativePath = docInfo.file_path.replace(/^uploads\//, '');
            const currentPdfPath = path.join(__dirname, '..', 'uploads', relativePath);

            // Verificar backups
            let backupFilePaths = [];
            if (docInfo.original_pdf_backup) {
              try {
                const backupPathsArray = JSON.parse(docInfo.original_pdf_backup);
                console.log(`📦 Cargando ${backupPathsArray.length} archivo(s) de backup...`);

                for (let i = 0; i < backupPathsArray.length; i++) {
                  const relPath = backupPathsArray[i];
                  const backupRelativePath = relPath.replace(/^uploads\//, '');
                  const backupFullPath = path.join(__dirname, '..', 'uploads', backupRelativePath);

                  try {
                    await fs.access(backupFullPath);
                    backupFilePaths.push(backupFullPath);
                    console.log(`   ✅ Backup ${i + 1}/${backupPathsArray.length}: ${path.basename(backupFullPath)}`);
                  } catch (accessError) {
                    console.error(`   ❌ Backup ${i + 1}/${backupPathsArray.length} NO ENCONTRADO: ${backupFullPath}`);
                  }
                }

                if (backupFilePaths.length === 0) {
                  console.error('❌ CRÍTICO: No se encontró ningún backup de PDF original');
                } else {
                  console.log(`✅ ${backupFilePaths.length} de ${backupPathsArray.length} backups cargados exitosamente`);
                }
              } catch (error) {
                console.error('❌ Error al cargar backups:', error.message);
                backupFilePaths = [];
              }
            } else {
              console.warn('⚠️ No hay backups registrados para este documento');
            }

            // Fusionar: plantilla + backups
            const tempMergedPath = path.join(tempDir, `merged_${documentId}_${Date.now()}.pdf`);
            const filesToMerge = [tempPlanillaPath, ...backupFilePaths];
            await mergePDFs(filesToMerge, tempMergedPath);

            // Agregar informe de firmantes
            const signersForCover = await query(
              `SELECT
                ds.user_id,
                ds.order_position,
                ds.role_name,
                ds.role_names,
                ds.is_causacion_group,
                ds.grupo_codigo,
                u.name as user_name,
                cg.nombre as grupo_nombre,
                u.email,
                COALESCE(s.status, 'pending') as status,
                s.signed_at,
                s.rejected_at,
                s.rejection_reason,
                s.consecutivo,
                COALESCE(s.real_signer_name, signer_user.name) as real_signer_name,
                signer_user.email as signer_email
               FROM document_signers ds
               LEFT JOIN users u ON ds.user_id = u.id
               LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
               LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
                 (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
                 (ds.is_causacion_group = true AND s.signer_id IN (
                   SELECT ci.user_id
                   FROM causacion_integrantes ci
                   JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                   WHERE cg.codigo = ds.grupo_codigo
                 ))
               )
               LEFT JOIN users signer_user ON s.signer_id = signer_user.id
               WHERE ds.document_id = $1
               ORDER BY ds.order_position ASC`,
              [documentId]
            );

            const signers = signersForCover.rows.map(row => {
              // Para grupos de causación, siempre usar el nombre del grupo (o código como fallback)
              const name = row.is_causacion_group
                ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación')
                : (row.user_name || 'Sin nombre');

              return {
                name: name,
                email: row.signer_email || row.email,
                order_position: row.order_position,
                role_name: row.role_name,
                role_names: row.role_names,
                status: row.status,
                signed_at: row.signed_at,
                rejected_at: row.rejected_at,
                rejection_reason: row.rejection_reason,
                consecutivo: row.consecutivo,
                is_causacion_group: row.is_causacion_group,
                grupo_codigo: row.grupo_codigo,
                real_signer_name: row.real_signer_name
              };
            });

            const documentInfoForCover = {
              title: docInfo.title || 'Factura',
              fileName: docInfo.file_name || '',
              createdAt: docInfo.created_at,
              uploadedBy: 'Sistema',
              documentTypeName: 'Factura'
            };

            await addCoverPageWithSigners(tempMergedPath, signers, documentInfoForCover);

            // Reemplazar archivo original
            await fs.copyFile(tempMergedPath, currentPdfPath);

            // Limpiar temporales
            await fs.unlink(tempPlanillaPath);
            await fs.unlink(tempMergedPath);

            console.log('✅ Plantilla FV regenerada con firmas actualizadas');
          }
        }
      } catch (regenerateError) {
        console.error('❌ Error al regenerar plantilla FV:', regenerateError);
        // No lanzamos error para no interrumpir el flujo de firma
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
            // Verificar si el siguiente es usuario normal o grupo de causación
            const nextSignerInfo = await query(
              `SELECT ds.user_id, ds.is_causacion_group, ds.grupo_codigo
               FROM document_signers ds
               WHERE ds.document_id = $1 AND ds.order_position = $2`,
              [documentId, currentOrder + 1]
            );

            if (nextSignerInfo.rows.length > 0) {
              const nextInfo = nextSignerInfo.rows[0];
              const creatorResult = await query('SELECT name FROM users WHERE id = $1', [doc.uploaded_by]);
              const creatorName = creatorResult.rows.length > 0 ? creatorResult.rows[0].name : 'Administrador';

              if (nextInfo.is_causacion_group && nextInfo.grupo_codigo) {
                // ========== SIGUIENTE ES GRUPO DE CAUSACIÓN: Notificar a TODOS ==========
                console.log(`📋 Siguiente firmante es grupo de causación: ${nextInfo.grupo_codigo}`);

                const membersResult = await query(`
                  SELECT u.id, u.name, u.email, u.email_notifications
                  FROM causacion_integrantes ci
                  JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                  JOIN users u ON ci.user_id = u.id
                  WHERE cg.codigo = $1 AND ci.activo = true
                `, [nextInfo.grupo_codigo]);

                for (const member of membersResult.rows) {
                  const insertResult = await query(
                    `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                     SELECT $1::integer, $2::varchar, $3::integer, $4::integer, $5::varchar
                     WHERE NOT EXISTS (
                       SELECT 1 FROM notifications
                       WHERE user_id = $1::integer AND type = $2::varchar AND document_id = $3::integer
                     )
                     RETURNING id`,
                    [member.id, 'signature_request', documentId, doc.uploaded_by, doc.title]
                  );

                  if (insertResult.rows.length > 0 && member.email_notifications) {
                    try {
                      await notificarAsignacionFirmante({
                        email: member.email,
                        nombreFirmante: member.name,
                        nombreDocumento: doc.title,
                        documentoId: documentId,
                        creadorDocumento: creatorName
                      });
                      console.log(`📧 Correo enviado a miembro del grupo: ${member.email}`);
                    } catch (emailError) {
                      console.error(`Error al enviar correo a ${member.email}:`, emailError);
                    }
                  }
                }
              } else if (nextInfo.user_id) {
                // ========== SIGUIENTE ES USUARIO NORMAL ==========
                const nextSignerResult = await query(
                  `SELECT u.id, u.name, u.email, u.email_notifications
                   FROM users u WHERE u.id = $1`,
                  [nextInfo.user_id]
                );

                if (nextSignerResult.rows.length > 0) {
                  const nextSigner = nextSignerResult.rows[0];

                  const insertResult = await query(
                    `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                     SELECT $1::integer, $2::varchar, $3::integer, $4::integer, $5::varchar
                     WHERE NOT EXISTS (
                       SELECT 1 FROM notifications
                       WHERE user_id = $1::integer AND type = $2::varchar AND document_id = $3::integer
                     )
                     RETURNING id`,
                    [nextSigner.id, 'signature_request', documentId, doc.uploaded_by, doc.title]
                  );

                  if (insertResult.rows.length > 0) {
                    console.log(`✅ Notificación creada para siguiente firmante: ${nextSigner.name}`);

                    if (nextSigner.email_notifications) {
                      try {
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
                    }
                  }
                }
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
                  const urlDescarga = `${serverConfig.backendUrl}/api/download/${documentId}`;

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
            `SELECT
                ds.user_id,
                ds.order_position,
                ds.role_name,
                ds.role_names,
                ds.is_causacion_group,
                ds.grupo_codigo,
                u.name as user_name,
                cg.nombre as grupo_nombre,
                u.email,
                COALESCE(s.status, 'pending') as status,
                s.signed_at,
                s.rejected_at,
                s.rejection_reason,
                s.consecutivo,
                COALESCE(s.real_signer_name, signer_user.name) as real_signer_name,
                signer_user.email as signer_email
            FROM document_signers ds
            LEFT JOIN users u ON ds.user_id = u.id
            LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
              (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
              (ds.is_causacion_group = true AND s.signer_id IN (
                SELECT ci.user_id
                FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = ds.grupo_codigo
              ))
            )
            LEFT JOIN users signer_user ON s.signer_id = signer_user.id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows.map(row => {
            const name = row.is_causacion_group
              ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación')
              : (row.user_name || 'Sin nombre');

            return {
              name: name,
              email: row.signer_email || row.email,
              order_position: row.order_position,
              role_name: row.role_name,
              role_names: row.role_names,
              status: row.status,
              signed_at: row.signed_at,
              rejected_at: row.rejected_at,
              rejection_reason: row.rejection_reason,
              consecutivo: row.consecutivo,
              is_causacion_group: row.is_causacion_group,
              grupo_codigo: row.grupo_codigo,
              real_signer_name: row.real_signer_name
            };
          });
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

      // ========== ACTUALIZAR ESTADOS DE FACTURA (si aplica) ==========
      try {
        const docTypeResult = await query(
          `SELECT dt.code, d.consecutivo
           FROM documents d
           LEFT JOIN document_types dt ON d.document_type_id = dt.id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docTypeResult.rows.length > 0) {
          const docData = docTypeResult.rows[0];

          // Solo procesar si es un documento de tipo FV y tiene consecutivo
          if (docData.code === 'FV' && docData.consecutivo) {
            const axios = require('axios');
            const backendHost = serverConfig.backendUrl;

            // 1. Verificar si el firmante actual pertenece al grupo de Causación
            const signerRoleResult = await query(
              `SELECT ds.role_name, ds.role_names
               FROM document_signers ds
               WHERE ds.document_id = $1 AND ds.user_id = $2`,
              [documentId, user.id]
            );

            if (signerRoleResult.rows.length > 0) {
              const signerData = signerRoleResult.rows[0];

              // Obtener todos los roles del firmante (manejo de múltiples roles para FV)
              let signerRoles = [];
              if (signerData.role_names) {
                try {
                  signerRoles = JSON.parse(signerData.role_names);
                } catch (e) {
                  signerRoles = [signerData.role_name];
                }
              } else if (signerData.role_name) {
                signerRoles = [signerData.role_name];
              }

              // Verificar si alguno de sus roles es de Causación
              const isCausacionRole = signerRoles.some(role =>
                role && (role.includes('CAUSACION') || role.includes('Causación'))
              );

              // Si es del grupo de causación, marcar la factura como causada
              if (isCausacionRole) {
                try {
                  await axios.post(
                    `${backendHost}/api/facturas/marcar-causado/${docData.consecutivo}`,
                    {},
                    { headers: { 'Content-Type': 'application/json' } }
                  );
                  console.log(`✅ Factura ${docData.consecutivo} marcada como causada (firmó grupo de causación)`);
                } catch (causError) {
                  console.error(`❌ Error al marcar factura como causada:`, causError.message);
                }
              }
            }

            // 2. Si el documento está completado, marcar la factura como finalizada
            if (newStatus === 'completed') {
              try {
                await axios.post(
                  `${backendHost}/api/facturas/marcar-finalizado/${docData.consecutivo}`,
                  {},
                  { headers: { 'Content-Type': 'application/json' } }
                );
                console.log(`✅ Factura ${docData.consecutivo} marcada como finalizada (documento completado)`);
              } catch (finError) {
                console.error(`❌ Error al marcar factura como finalizada:`, finError.message);
              }
            }
          }
        }
      } catch (facturaError) {
        console.error('❌ Error al actualizar estados de factura:', facturaError);
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

    // Mapeo de metadata (BD) a templateData (GraphQL)
    // metadata es JSONB en PostgreSQL, el driver pg lo devuelve como objeto
    // El schema GraphQL espera String, así que stringify
    templateData: (parent) => {
      if (!parent.metadata) return null;

      // Si metadata ya es un objeto (JSONB), stringificarlo
      if (typeof parent.metadata === 'object') {
        return JSON.stringify(parent.metadata);
      }

      // Si por alguna razón es string, devolverlo tal cual
      return parent.metadata;
    },

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
      // Obtener TODOS los firmantes asignados (incluyendo grupos de causación)
      const signersResult = await query(`
        SELECT
          ds.id as ds_id,
          ds.user_id,
          ds.order_position,
          ds.role_name,
          ds.role_names,
          ds.is_causacion_group,
          ds.grupo_codigo,
          u.name as user_name,
          u.email as user_email,
          cg.nombre as grupo_nombre
        FROM document_signers ds
        LEFT JOIN users u ON ds.user_id = u.id
        LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
        WHERE ds.document_id = $1
        ORDER BY ds.order_position ASC
      `, [parent.id]);

      const results = [];

      for (const signer of signersResult.rows) {
        if (signer.is_causacion_group) {
          // Es un grupo de causación - buscar si algún miembro firmó
          const groupSignature = await query(`
            SELECT s.*, u.name as signer_name, u.email as signer_email
            FROM signatures s
            JOIN users u ON s.signer_id = u.id
            WHERE s.document_id = $1
              AND s.signer_id IN (
                SELECT ci.user_id
                FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = $2 AND ci.activo = true
              )
            LIMIT 1
          `, [parent.id, signer.grupo_codigo]);

          if (groupSignature.rows.length > 0) {
            // Grupo ya firmó - usar datos de la firma
            const sig = groupSignature.rows[0];
            results.push({
              id: sig.id,
              document_id: sig.document_id,
              signer_id: sig.signer_id,
              status: sig.status,
              signature_data: sig.signature_data,
              signed_at: sig.signed_at,
              rejected_at: sig.rejected_at,
              rejection_reason: sig.rejection_reason,
              real_signer_name: sig.signer_name,
              order_position: signer.order_position,
              role_name: signer.role_name,
              role_names: signer.role_names,
              is_causacion_group: true,
              grupo_codigo: signer.grupo_codigo,
              grupo_nombre: signer.grupo_nombre,
              // Para el resolver Signature.signer
              _signer_name: sig.signer_name,
              _signer_email: sig.signer_email
            });
          } else {
            // Grupo pendiente - crear entrada virtual
            results.push({
              id: `group_${signer.ds_id}`,
              document_id: parent.id,
              signer_id: null,
              status: 'pending',
              signature_data: null,
              signed_at: null,
              rejected_at: null,
              rejection_reason: null,
              real_signer_name: null,
              order_position: signer.order_position,
              role_name: signer.role_name,
              role_names: signer.role_names,
              is_causacion_group: true,
              grupo_codigo: signer.grupo_codigo,
              grupo_nombre: signer.grupo_nombre,
              // Para el resolver Signature.signer - nombre del grupo
              _signer_name: signer.grupo_nombre,
              _signer_email: null,
              _is_group_pending: true
            });
          }
        } else {
          // Firmante normal - buscar su firma
          const userSignature = await query(`
            SELECT s.*
            FROM signatures s
            WHERE s.document_id = $1 AND s.signer_id = $2
          `, [parent.id, signer.user_id]);

          if (userSignature.rows.length > 0) {
            const sig = userSignature.rows[0];
            results.push({
              ...sig,
              order_position: signer.order_position,
              role_name: signer.role_name,
              role_names: signer.role_names,
              is_causacion_group: false,
              _signer_name: signer.user_name,
              _signer_email: signer.user_email
            });
          } else {
            // Usuario pendiente - crear entrada virtual
            results.push({
              id: `pending_${signer.ds_id}`,
              document_id: parent.id,
              signer_id: signer.user_id,
              status: 'pending',
              signature_data: null,
              signed_at: null,
              rejected_at: null,
              rejection_reason: null,
              order_position: signer.order_position,
              role_name: signer.role_name,
              role_names: signer.role_names,
              is_causacion_group: false,
              _signer_name: signer.user_name,
              _signer_email: signer.user_email
            });
          }
        }
      }

      return results;
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

    // Campos de document_signers (traídos por JOIN)
    orderPosition: (parent) => parent.order_position,
    roleName: (parent) => {
      // Si hay role_names array, devolver el primero
      if (parent.role_names && parent.role_names.length > 0) {
        return parent.role_names[0];
      }
      // Fallback a role_name singular
      return parent.role_name || null;
    },
    roleNames: (parent) => {
      // Devolver array de roles
      if (parent.role_names && Array.isArray(parent.role_names) && parent.role_names.length > 0) {
        return parent.role_names;
      }
      // Fallback a role_name singular como array
      if (parent.role_name) {
        return [parent.role_name];
      }
      return [];
    },
    roleCode: (parent) => parent.role_code || null,
    isCausacionGroup: (parent) => parent.is_causacion_group || false,
    grupoCodigo: (parent) => parent.grupo_codigo || null,
    grupoNombre: (parent) => parent.grupo_nombre || null,

    document: async (parent) => {
      const result = await query('SELECT * FROM documents WHERE id = $1', [parent.document_id]);
      return result.rows[0];
    },
    signer: async (parent) => {
      // Si tenemos datos precargados del resolver Document.signatures, usarlos
      if (parent._signer_name !== undefined) {
        // Para grupos pendientes sin signer_id, usar ID ficticio negativo
        let signerId = parent.signer_id;
        let signerEmail = parent._signer_email;
        if (!signerId && parent.grupo_codigo) {
          // IDs ficticios: financiera = -1, logistica = -2
          signerId = parent.grupo_codigo === 'financiera' ? -1 : -2;
          // Email placeholder para grupos (requerido por schema User.email: String!)
          signerEmail = `${parent.grupo_codigo}@grupo.causacion`;
        }
        return {
          id: signerId,
          name: parent._signer_name,
          email: signerEmail || 'sin-email@placeholder.local'
        };
      }
      // Fallback a query normal
      if (!parent.signer_id) return null;
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.signer_id]);
      return result.rows[0];
    },
    // Nuevos campos para grupos de causación
    isCausacionGroup: (parent) => parent.is_causacion_group || false,
    grupoCodigo: (parent) => parent.grupo_codigo || null,
    grupoNombre: (parent) => parent.grupo_nombre || null,
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

  CausacionGrupo: {
    miembros: async (parent) => {
      const result = await query(`
        SELECT id, grupo_id, user_id, cargo, activo
        FROM causacion_integrantes
        WHERE grupo_id = $1 AND activo = true
        ORDER BY id ASC
      `, [parent.id]);
      return result.rows;
    },
  },

  CausacionIntegrante: {
    grupoId: (parent) => parent.grupo_id,
    userId: (parent) => parent.user_id,

    user: async (parent) => {
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.user_id]);
      return result.rows[0];
    },
  },
};

module.exports = resolvers;
