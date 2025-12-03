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
      `SELECT
        "Cuenta" as cuenta,
        "NombreCuenta" as nombre_cuenta,
        "NombreResp" as nombre_responsable,
        "Cargo" as cargo
       FROM public."T_Master_Responsable_Cuenta"
       ORDER BY "Cuenta" ASC`,
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
