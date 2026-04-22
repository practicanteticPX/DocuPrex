const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const { queryFacturas } = require('../database/facturas-db');
const { queryCuentas } = require('../database/cuentas-db');
const { query } = require('../database/db');
const { getUserUploadDir, normalizeFileName } = require('../utils/fileUpload');
const websocketService = require('../services/websocket');

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
    const result = await queryFacturas(
      `SELECT
        "Cia_CC" as codigo,
        "Responsable" as responsable
       FROM crud_facturas."T_CentrosCostos"
       ORDER BY "Cia_CC" ASC`,
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
       SET en_proceso = FALSE, causado = FALSE, finalizado = FALSE
       WHERE numero_control = $1
       RETURNING numero_control, en_proceso, causado, finalizado`,
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
 * POST /api/facturas/marcar-causado/:numeroControl
 * Marca una factura como causada cuando el grupo de causación firma
 */
router.post('/marcar-causado/:numeroControl', async (req, res) => {
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
       SET causado = TRUE
       WHERE numero_control = $1
       RETURNING numero_control, causado`,
      [numeroControl.trim()]
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
