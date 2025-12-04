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
        fecha_entrega
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

module.exports = router;
