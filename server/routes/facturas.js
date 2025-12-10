const express = require('express');
const router = express.Router();
const { queryFacturas } = require('../database/facturas-db');
const { queryCuentas } = require('../database/cuentas-db');

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

    console.log('📋 Factura encontrada:', JSON.stringify(facturaData, null, 2));
    console.log('📅 fecha_factura:', facturaData.fecha_factura);
    console.log('📅 fecha_entrega:', facturaData.fecha_entrega);

    const response = {
      numero_control: facturaData.numero_control,
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

    console.log(`✅ Factura ${numeroControl} marcada como en_proceso`);

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

    console.log(`✅ Factura ${numeroControl} desmarcada de en_proceso`);

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
 * GET /api/facturas/grupos-causacion/:grupo
 * Obtiene todos los miembros de un grupo de causación (financiera o logistica)
 * Busca por coincidencia de nombres en T_Personas
 */
router.get('/grupos-causacion/:grupo', async (req, res) => {
  try {
    const { grupo } = req.params;

    if (!grupo || (grupo !== 'financiera' && grupo !== 'logistica')) {
      return res.status(400).json({
        success: false,
        message: 'El grupo debe ser "financiera" o "logistica"'
      });
    }

    // Nombres específicos para cada grupo
    let nombresBuscados = [];
    let nombreGrupo = '';

    if (grupo === 'financiera') {
      nombreGrupo = 'CAUSACION FINANCIERA';
      nombresBuscados = [
        'Riaño Moncayo Luis Carlos',
        'Martinez Arias Angelica Johana'
      ];
    } else if (grupo === 'logistica') {
      nombreGrupo = 'CAUSACION LOGISTICA';
      nombresBuscados = [
        'Gonzalez Marin Mariana',
        'Montealegre Castaño Jheison Stiven',
        'Gonzalez Parra Angel Gabriel'
      ];
    }

    // Buscar personas que coincidan con los nombres exactamente
    const result = await queryFacturas(
      `SELECT DISTINCT
        "nombre" as nombre,
        "cargo" as cargo
       FROM crud_facturas."T_Personas"
       WHERE ${nombresBuscados.map((_, i) => `TRIM("nombre") = $${i + 1}`).join(' OR ')}
       ORDER BY "nombre" ASC`,
      nombresBuscados
    );

    console.log(`🔍 Buscando grupo ${nombreGrupo}, encontrados: ${result.rows.length} miembros`);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No se encontraron miembros del grupo ${nombreGrupo}. Buscados: ${nombresBuscados.join(', ')}`,
        nombresBuscados
      });
    }

    // Agregar email null a cada miembro (T_Personas no tiene email)
    const dataWithEmail = result.rows.map(row => ({
      nombre: row.nombre,
      cargo: row.cargo,
      email: null
    }));

    return res.status(200).json({
      success: true,
      data: dataWithEmail,
      grupo: nombreGrupo
    });
  } catch (error) {
    console.error('❌ Error obteniendo grupo de causación:', error);
    return res.status(500).json({
      success: false,
      message: 'Error interno al obtener grupo de causación',
      error: error.message
    });
  }
});

module.exports = router;
