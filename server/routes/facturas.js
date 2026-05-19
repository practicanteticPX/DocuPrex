const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const { queryFacturas } = require('../database/facturas-db');
const { queryCuentas } = require('../database/cuentas-db');
const { query } = require('../database/db');
const { getUserUploadDir, normalizeFileName } = require('../utils/fileUpload');
const websocketService = require('../services/websocket');
const { notificarFacturaCorregida } = require('../services/emailService');
const { updateSignersPage } = require('../utils/pdfCoverPage');

const DOCUPREX_INGEST_TOKEN = process.env.DOCUPREX_INGEST_TOKEN || '';

/**
 * GET /api/facturas/cuentas-contables
 * Obtiene todas las cuentas contables disponibles
 */
router.get('/cuentas-contables', async (req, res) => {
  try {
    const result = await queryCuentas(
      `SELECT DISTINCT ON ("Cuenta")
        "Cuenta" as cuenta,
        "NombreCuenta" as nombre_cuenta,
        "NombreResp" as nombre_responsable,
        "Cargo" as cargo
       FROM public."T_Master_Responsable_Cuenta"
       WHERE "Activa" = true
       ORDER BY "Cuenta" ASC, "Cia" ASC`,
      []
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron cuentas contables'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo cuentas contables:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al obtener cuentas contables',
      error: error.message
    });
  }
});

/**
 * GET /api/facturas/centros-costos
 * Obtiene todos los centros de costos disponibles
 */
router.get('/centros-costos', async (req, res) => {
  try {
    const result = await queryCuentas(
      `SELECT
        "CCN4" as codigo,
        "nombreCCN4" as nombre,
        "nombreResponsable" as responsable
       FROM public.v_centros_costos
       WHERE "activoCCN4" = true
         AND "nombreResponsable" IS NOT NULL
       ORDER BY "CCN4" ASC`,
      []
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron centros de costos'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo centros de costos:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al obtener centros de costos',
      error: error.message
    });
  }
});

/**
 * GET /api/facturas/negociadores
 * Obtiene todos los negociadores disponibles desde SERV_QPREX.crud_facturas.T_Negociadores
 */
router.get('/negociadores', async (req, res) => {
  try {
    const result = await queryFacturas(
      `SELECT
        "negociador" as negociador,
        "cargo" as cargo
       FROM crud_facturas."T_Negociadores"
       ORDER BY "negociador" ASC`,
      []
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontraron negociadores'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('❌ Error obteniendo negociadores:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al obtener negociadores',
      error: error.message
    });
  }
});

/**
 * GET /api/facturas/validar-responsable/:nombre
 * Valida el nombre del responsable en T_Personas (SERV_QPREX.crud_facturas) y obtiene su cargo
 */
router.get('/validar-responsable/:nombre', async (req, res) => {
  try {
    const { nombre } = req.params;

    if (!nombre || nombre.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El nombre del responsable es requerido'
      });
    }

    const result = await queryFacturas(
      `SELECT
        "nombre" as nombre,
        "cargo" as cargo
       FROM crud_facturas."T_Personas"
       WHERE UPPER(TRIM("nombre")) = UPPER(TRIM($1))
       LIMIT 1`,
      [nombre]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró información del responsable en T_Personas'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error validando responsable:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al validar responsable',
      error: error.message
    });
  }
});

/**
 * GET /api/facturas/search/:numeroControl
 * Busca una factura por consecutivo (coincidencia exacta)
 * Excluye facturas que estén en proceso o finalizadas
 */
router.get('/search/:numeroControl', async (req, res) => {
  try {
    const { numeroControl } = req.params;

    if (!numeroControl || numeroControl.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El consecutivo es requerido'
      });
    }

    const result = await queryFacturas(
      `SELECT
        numero_control,
        cia,
        proveedor,
        numero_factura,
        fecha_factura,
        fecha_entrega,
        en_proceso,
        finalizado
       FROM crud_facturas."T_Facturas"
       WHERE numero_control = $1
       LIMIT 1`,
      [numeroControl.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró ninguna factura con ese consecutivo'
      });
    }

    const facturaData = result.rows[0];

    if (facturaData.en_proceso) {
      return res.status(409).json({
        success: false,
        message: 'Esta factura ya tiene un documento en proceso. No se pueden crear documentos duplicados.'
      });
    }

    if (facturaData.finalizado) {
      return res.status(409).json({
        success: false,
        message: 'Esta factura ya fue procesada y finalizada. No se pueden crear nuevos documentos.'
      });
    }

    const response = {
      numero_control: facturaData.numero_control,
      cia: facturaData.cia,
      proveedor: facturaData.proveedor,
      numero_factura: facturaData.numero_factura,
      fecha_factura: facturaData.fecha_factura,
      fecha_entrega: facturaData.fecha_entrega
    };

    console.log('📤 Enviando respuesta:', JSON.stringify(response, null, 2));

    return res.status(200).json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('❌ Error buscando factura:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al buscar la factura'
    });
  }
});

/**
 * POST /api/facturas/marcar-en-proceso/:numeroControl
 * Marca una factura como en proceso cuando se crea un documento
 */
router.post('/marcar-en-proceso/:numeroControl', async (req, res) => {
  try {
    const { numeroControl } = req.params;

    if (!numeroControl || numeroControl.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El consecutivo es requerido'
      });
    }

    const result = await queryFacturas(
      `UPDATE crud_facturas."T_Facturas"
       SET en_proceso = TRUE
       WHERE numero_control = $1
       RETURNING numero_control, en_proceso`,
      [numeroControl.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró la factura para actualizar'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Factura marcada como en proceso exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error marcando factura en proceso:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al marcar factura en proceso',
      error: error.message
    });
  }
});

/**
 * POST /api/facturas/marcar-finalizado/:numeroControl
 * Marca una factura como finalizada cuando todos los firmantes firman
 */
router.post('/marcar-finalizado/:numeroControl', async (req, res) => {
  try {
    const { numeroControl } = req.params;

    if (!numeroControl || numeroControl.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El consecutivo es requerido'
      });
    }

    const result = await queryFacturas(
      `UPDATE crud_facturas."T_Facturas"
       SET en_proceso = FALSE, finalizado = TRUE
       WHERE numero_control = $1
       RETURNING numero_control, en_proceso, finalizado`,
      [numeroControl.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró la factura para actualizar'
      });
    }

    console.log(`✅ Factura ${numeroControl} marcada como finalizada`);

    return res.status(200).json({
      success: true,
      message: 'Factura marcada como finalizada exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error marcando factura como finalizada:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al marcar factura como finalizada',
      error: error.message
    });
  }
});

/**
 * POST /api/facturas/desmarcar-en-proceso/:numeroControl
 * Desmarca una factura de en_proceso cuando se elimina el documento
 */
router.post('/desmarcar-en-proceso/:numeroControl', async (req, res) => {
  try {
    const { numeroControl } = req.params;

    if (!numeroControl || numeroControl.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El consecutivo es requerido'
      });
    }

    const result = await queryFacturas(
      `UPDATE crud_facturas."T_Facturas"
       SET en_proceso = FALSE, causado = FALSE, finalizado = FALSE,
           rechazada = FALSE, corregida = FALSE
       WHERE numero_control = $1
       RETURNING numero_control, en_proceso, causado, finalizado, rechazada, corregida`,
      [numeroControl.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró la factura para actualizar'
      });
    }

    // console.log(`✅ Factura ${numeroControl} desmarcada de en_proceso`);

    return res.status(200).json({
      success: true,
      message: 'Factura desmarcada de en proceso exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error desmarcando factura de en_proceso:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al desmarcar factura de en_proceso',
      error: error.message
    });
  }
});

/**
 * POST /api/facturas/marcar-rechazada/:numeroControl
 * Marca una factura como rechazada cuando se rechaza el documento en DocuPrex
 */
router.post('/marcar-rechazada/:numeroControl', async (req, res) => {
  try {
    const { numeroControl } = req.params;

    if (!numeroControl || numeroControl.trim() === '') {
      return res.status(400).json({ success: false, message: 'El consecutivo es requerido' });
    }

    const result = await queryFacturas(
      `UPDATE crud_facturas."T_Facturas"
       SET en_proceso = FALSE, rechazada = TRUE, corregida = FALSE
       WHERE numero_control = $1
       RETURNING numero_control, en_proceso, rechazada, corregida`,
      [numeroControl.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No se encontró la factura' });
    }

    console.log(`✅ Factura ${numeroControl} marcada como rechazada`);
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error marcando factura como rechazada:', error);
    return res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
});

/**
 * POST /api/facturas/marcar-corregida/:numeroControl
 * Marca una factura como corregida y resetea la firma rechazada en DocuPrex para que el
 * rechazante pueda volver a firmar. Acepta { documentId, notasCorreccion } en el body.
 */
router.post('/marcar-corregida/:numeroControl', async (req, res) => {
  try {
    const { numeroControl } = req.params;
    const { documentId, notasCorreccion } = req.body || {};

    if (!numeroControl || numeroControl.trim() === '') {
      return res.status(400).json({ success: false, message: 'El consecutivo es requerido' });
    }

    const result = await queryFacturas(
      `UPDATE crud_facturas."T_Facturas"
       SET corregida = TRUE, rechazada = FALSE
       WHERE numero_control = $1
       RETURNING numero_control, rechazada, corregida`,
      [numeroControl.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No se encontró la factura' });
    }

    // Si se proporcionó documentId, actualizar DocuPrex: resetear firma rechazada y notificar
    if (documentId) {
      try {
        const rejectedSigResult = await query(
          `SELECT s.id, s.signer_id, u.email, u.name
           FROM signatures s
           JOIN users u ON u.id = s.signer_id
           WHERE s.document_id = $1 AND s.status = 'rejected'
           LIMIT 1`,
          [documentId]
        );

        if (rejectedSigResult.rows.length > 0) {
          const rejector = rejectedSigResult.rows[0];

          await query(
            `UPDATE signatures
             SET status = 'pending', signed_at = NULL, rejected_at = NULL,
                 rejection_reason = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE document_id = $1 AND signer_id = $2 AND status = 'rejected'`,
            [documentId, rejector.signer_id]
          );

          await query(
            `UPDATE documents
             SET status = 'in_progress', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [documentId]
          );

          const notesPayload = {
            corregida: true,
            notasCorreccion: notasCorreccion || '',
            fechaCorreccion: new Date().toISOString()
          };
          await query(
            `UPDATE documents
             SET metadata = metadata || $2::jsonb, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [documentId, JSON.stringify(notesPayload)]
          );

          const docResult = await query(`SELECT title FROM documents WHERE id = $1`, [documentId]);
          const docTitle = docResult.rows[0]?.title || '';

          const notifResult = await query(
            `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
             VALUES ($1, 'invoice_corrected', $2, NULL, $3)
             RETURNING id`,
            [rejector.signer_id, documentId, docTitle]
          );

          if (notifResult.rows.length > 0) {
            websocketService.emitNotificationCreated(rejector.signer_id, {
              id: notifResult.rows[0].id,
              type: 'invoice_corrected',
              document_id: documentId,
              actor_id: null,
              document_title: docTitle,
              actor: null
            });
          }

          websocketService.emitDocumentUpdated(documentId, 'updated', {
            documentTitle: docTitle,
            status: 'in_progress'
          });

          // Email al rechazante notificando que el creador corrigió
          notificarFacturaCorregida({
            email: rejector.email,
            nombreRechazante: rejector.name,
            nombreDocumento: docTitle,
            documentoId: documentId,
            notasCorreccion: notasCorreccion || ''
          }).catch(emailErr => {
            console.error('❌ Error enviando email de corrección al rechazante:', emailErr.message);
          });

          // Regenerar página de firmantes para quitar la marca de agua "RECHAZADO"
          try {
            const docFileResult = await query(
              `SELECT d.file_path, d.file_name, d.title, d.created_at, d.uploaded_by, d.document_type_id,
                      u.name as uploader_name,
                      dt.name as document_type_name
               FROM documents d
               LEFT JOIN users u ON u.id = d.uploaded_by
               LEFT JOIN document_types dt ON dt.id = d.document_type_id
               WHERE d.id = $1`,
              [documentId]
            );

            if (docFileResult.rows.length > 0) {
              const docFile = docFileResult.rows[0];
              const pdfPath = path.join(__dirname, '..', docFile.file_path);

              const signersResult = await query(
                `SELECT
                  ds.user_id, ds.order_position, ds.role_name, ds.role_names,
                  ds.is_causacion_group, ds.grupo_codigo,
                  u.name as user_name, u.email,
                  cg.nombre as grupo_nombre,
                  COALESCE(s.status, 'pending') as status,
                  s.signed_at, s.rejected_at, s.rejection_reason,
                  signer_user.email as signer_email
                 FROM document_signers ds
                 LEFT JOIN users u ON ds.user_id = u.id
                 LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
                 LEFT JOIN signatures s ON (
                   (ds.is_causacion_group = false AND s.document_id = ds.document_id AND s.signer_id = ds.user_id) OR
                   (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.signer_id IN (
                     SELECT ci.user_id FROM causacion_integrantes ci
                     JOIN causacion_grupos cg2 ON ci.grupo_id = cg2.id
                     WHERE cg2.codigo = ds.grupo_codigo
                   ))
                 )
                 LEFT JOIN users signer_user ON s.signer_id = signer_user.id
                 WHERE ds.document_id = $1
                 ORDER BY ds.order_position ASC`,
                [documentId]
              );

              const signers = signersResult.rows.map(row => ({
                name: row.is_causacion_group
                  ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación')
                  : (row.user_name || 'Sin nombre'),
                email: row.signer_email || row.email,
                order_position: row.order_position,
                role_name: row.role_name,
                role_names: row.role_names,
                status: row.status,
                signed_at: row.signed_at,
                rejected_at: row.rejected_at,
                rejection_reason: row.rejection_reason,
                is_causacion_group: row.is_causacion_group,
                grupo_codigo: row.grupo_codigo
              }));

              const documentInfo = {
                title: docFile.title,
                fileName: docFile.file_name,
                createdAt: docFile.created_at,
                uploadedBy: docFile.uploader_name,
                documentTypeName: docFile.document_type_name
              };

              await updateSignersPage(pdfPath, signers, documentInfo);
              console.log(`✅ Página de firmantes regenerada sin marca RECHAZADO para doc ${documentId}`);
            }
          } catch (pdfErr) {
            console.error('❌ Error regenerando página de firmantes tras corrección:', pdfErr.message);
          }

          console.log(`✅ Firma rechazada reseteada → pending para ${rejector.name} (${rejector.email})`);
        }
      } catch (docuprexErr) {
        console.error('❌ Error actualizando DocuPrex para corrección:', docuprexErr);
      }
    }

    console.log(`✅ Factura ${numeroControl} marcada como corregida`);
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error marcando factura como corregida:', error);
    return res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
});

/**
 * POST /api/facturas/aprobar-correccion/:numeroControl
 * Vuelve la factura a en_proceso cuando el que rechazó aprueba la corrección
 */
router.post('/aprobar-correccion/:numeroControl', async (req, res) => {
  try {
    const { numeroControl } = req.params;

    if (!numeroControl || numeroControl.trim() === '') {
      return res.status(400).json({ success: false, message: 'El consecutivo es requerido' });
    }

    const result = await queryFacturas(
      `UPDATE crud_facturas."T_Facturas"
       SET en_proceso = TRUE, rechazada = FALSE, corregida = FALSE
       WHERE numero_control = $1
       RETURNING numero_control, en_proceso, rechazada, corregida`,
      [numeroControl.trim()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No se encontró la factura' });
    }

    console.log(`✅ Factura ${numeroControl} aprobada corrección → en_proceso`);
    return res.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('❌ Error aprobando corrección:', error);
    return res.status(500).json({ success: false, message: 'Error interno', error: error.message });
  }
});

/**
 * POST /api/facturas/marcar-causado/:numeroControl
 * Marca una factura como causada cuando el grupo de causación firma
 */
router.post('/marcar-causado/:numeroControl', async (req, res) => {
  try {
    const { numeroControl } = req.params;
    const { numeroCausacion, observacionesCausacion, causadoPor } = req.body || {};

    if (!numeroControl || numeroControl.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'El consecutivo es requerido'
      });
    }

    const result = await queryFacturas(
      `UPDATE crud_facturas."T_Facturas"
       SET causado = TRUE,
           fecha_causacion = COALESCE(fecha_causacion, CURRENT_DATE),
           numero_causacion = COALESCE($2, numero_causacion),
           observaciones_causacion = COALESCE($3, observaciones_causacion),
           causado_por = COALESCE($4, causado_por)
       WHERE numero_control = $1
       RETURNING numero_control, causado, fecha_causacion, numero_causacion, observaciones_causacion, causado_por`,
      [
        numeroControl.trim(),
        numeroCausacion ? String(numeroCausacion).trim() : null,
        observacionesCausacion ? String(observacionesCausacion).trim() : null,
        causadoPor ? String(causadoPor).trim() : null
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró la factura para actualizar'
      });
    }

    console.log(`✅ Factura ${numeroControl} marcada como causada`);

    return res.status(200).json({
      success: true,
      message: 'Factura marcada como causada exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Error marcando factura como causada:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al marcar factura como causada',
      error: error.message
    });
  }
});

/**
 * GET /api/facturas/usuario-negociaciones
 * Obtiene el usuario NEGOCIACIONES de la tabla users (DocuPrex)
 */
router.get('/usuario-negociaciones', async (req, res) => {
  try {
    // Buscar en la tabla users de PostgreSQL (DocuPrex)
    const { query } = require('../database/db');

    const result = await query(
      `SELECT name, email, role
       FROM users
       WHERE UPPER(TRIM(name)) = 'NEGOCIACIONES'
       LIMIT 1`,
      []
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No se encontró el usuario NEGOCIACIONES en la base de datos'
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        nombre: result.rows[0].name,
        cargo: result.rows[0].role || 'Usuario del sistema',
        email: result.rows[0].email
      }
    });
  } catch (error) {
    console.error('❌ Error obteniendo usuario NEGOCIACIONES:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al obtener usuario NEGOCIACIONES',
      error: error.message
    });
  }
});

/**
 * POST /api/facturas/ingest-from-facturacion
 * Crea un documento FV directamente en DocuPrex para el usuario definido en "Entregado a"
 */
router.post('/ingest-from-facturacion', async (req, res) => {
  try {
    const providedToken = req.headers['x-docuprex-ingest-token'];

    if (!DOCUPREX_INGEST_TOKEN || providedToken !== DOCUPREX_INGEST_TOKEN) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado para ingresar facturas en DocuPrex'
      });
    }

    const {
      numeroControl,
      cia,
      proveedor,
      numeroFactura,
      fechaFactura,
      fechaEntrega,
      entregadaA,
      entregadaAEmail,
      pdfBase64,
      originalFileName,
      mimeType
    } = req.body || {};

    if (!numeroControl || !entregadaAEmail || !pdfBase64) {
      return res.status(400).json({
        success: false,
        message: 'numeroControl, entregadaAEmail y pdfBase64 son requeridos'
      });
    }

    const userResult = await query(
      `SELECT id, name, email
       FROM users
       WHERE LOWER(email) = LOWER($1)
       LIMIT 1`,
      [entregadaAEmail]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No se encontró en DocuPrex el usuario con correo ${entregadaAEmail}`
      });
    }

    const fvTypeResult = await query(
      `SELECT id, name, code, prefix
       FROM document_types
       WHERE code = 'FV'
       LIMIT 1`
    );

    if (fvTypeResult.rows.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'No se encontró el tipo de documento FV en DocuPrex'
      });
    }

    const targetUser = userResult.rows[0];
    const fvType = fvTypeResult.rows[0];
    const fileBuffer = Buffer.from(pdfBase64, 'base64');

    const existingDocResult = await query(
      `SELECT id
       FROM documents
       WHERE consecutivo = $1
         AND uploaded_by = $2
         AND document_type_id = $3
         AND status != 'archived'
       LIMIT 1`,
      [String(numeroControl), targetUser.id, fvType.id]
    );

    if (existingDocResult.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: `La factura ${numeroControl} ya existe en DocuPrex para ${targetUser.email}`
      });
    }

    const templateData = {
      source: 'facturacion',
      ingestionSource: 'facturacion',
      consecutivo: String(numeroControl),
      cia: cia || '',
      proveedor: proveedor || '',
      numeroFactura: numeroFactura || '',
      fechaFactura: fechaFactura || '',
      fechaRecepcion: fechaEntrega || '',
      legalizaAnticipo: false,
      checklistRevision: {
        fechaEmision: false,
        fechaVencimiento: false,
        cantidades: false,
        precioUnitario: false,
        fletes: false,
        valoresTotales: false,
        descuentosTotales: false
      },
      nombreNegociador: '',
      cargoNegociador: '',
      grupoCausacion: '',
      observaciones: '',
      filasControl: [
        {
          id: 1,
          noCuentaContable: '',
          respCuentaContable: '',
          cargoCuentaContable: '',
          nombreCuentaContable: '',
          centroCostos: '',
          respCentroCostos: '',
          cargoCentroCostos: '',
          porcentaje: ''
        }
      ],
      totalPorcentaje: 0,
      firmantes: []
    };

    const targetDir = getUserUploadDir(targetUser.name);
    const safeOriginalName = normalizeFileName(originalFileName || `factura_${numeroControl}.pdf`);
    const ext = path.extname(safeOriginalName) || '.pdf';
    const baseName = path.basename(safeOriginalName, ext);

    let finalFileName = `${baseName}${ext}`;
    let counter = 1;

    while (true) {
      try {
        await fs.access(path.join(targetDir, finalFileName));
        finalFileName = `${baseName} (${counter})${ext}`;
        counter++;
      } catch {
        break;
      }
    }

    const finalPath = path.join(targetDir, finalFileName);
    await fs.writeFile(finalPath, fileBuffer);

    const backupDir = path.join(__dirname, '..', 'uploads', 'originals');
    await fs.mkdir(backupDir, { recursive: true });

    const backupFileName = `${Date.now()}_facturacion_${finalFileName}`;
    const backupFullPath = path.join(backupDir, backupFileName);
    await fs.copyFile(finalPath, backupFullPath);

    const relativePath = `uploads/${path.basename(targetDir)}/${finalFileName}`;
    const relativeBackupPath = `uploads/originals/${backupFileName}`;
    const proveedorNormalizado = String(proveedor || '').trim().replace(/\s+/g, ' ');
    const numeroFacturaNormalizado = String(numeroFactura || '').trim().replace(/\s+/g, ' ');
    const docTitle = proveedorNormalizado && numeroFacturaNormalizado
      ? `FV - ${proveedorNormalizado} - ${numeroFacturaNormalizado}`
      : `${fvType.prefix || 'FV - '}${numeroControl}`.trim();

    const insertResult = await query(
      `INSERT INTO documents (
        title,
        description,
        file_name,
        file_path,
        file_size,
        mime_type,
        status,
        uploaded_by,
        document_type_id,
        consecutivo,
        metadata,
        original_pdf_backup
      ) VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7, $8, $9, $10, $11)
      RETURNING id, title, uploaded_by, created_at`,
      [
        docTitle,
        `Factura radicada desde Recepción de Facturas para ${entregadaA || targetUser.name}`,
        finalFileName,
        relativePath,
        fileBuffer.length,
        mimeType || 'application/pdf',
        targetUser.id,
        fvType.id,
        String(numeroControl),
        templateData,
        JSON.stringify([relativeBackupPath])
      ]
    );

    const notificationResult = await query(
      `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
       SELECT $1, 'invoice_assigned', $2, NULL, $3
       WHERE NOT EXISTS (
         SELECT 1
         FROM notifications
         WHERE user_id = $1
           AND type = 'invoice_assigned'
           AND document_id = $2
       )
       RETURNING id`,
      [targetUser.id, insertResult.rows[0].id, insertResult.rows[0].title]
    );

    if (notificationResult.rows.length > 0) {
      websocketService.emitNotificationCreated(targetUser.id, {
        id: notificationResult.rows[0].id,
        type: 'invoice_assigned',
        document_id: insertResult.rows[0].id,
        actor_id: null,
        document_title: insertResult.rows[0].title,
        actor: null
      });
    }

    websocketService.emitDocumentUpdated(insertResult.rows[0].id, 'created', {
      documentTitle: insertResult.rows[0].title,
      uploadedBy: targetUser.id,
      documentTypeCode: fvType.code
    });

    return res.status(200).json({
      success: true,
      message: 'Factura ingresada en DocuPrex exitosamente',
      data: {
        documentId: insertResult.rows[0].id,
        title: insertResult.rows[0].title,
        uploadedBy: targetUser.email
      }
    });
  } catch (error) {
    console.error('❌ Error ingresando factura desde facturación a DocuPrex:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al ingresar la factura en DocuPrex',
      error: error.message
    });
  }
});

module.exports = router;
