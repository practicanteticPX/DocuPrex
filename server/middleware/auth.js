/**
 * Middleware de autenticación
 *
 * Verifica el token JWT en las peticiones y extrae la información del usuario
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';

/**
 * Middleware para autenticar requests con JWT
 */
function authenticateToken(req, res, next) {
    // Obtener el token del header Authorization
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            error: 'Acceso denegado. No se proporcionó token de autenticación.'
        });
    }

    try {
        // Verificar y decodificar el token
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({
            error: 'Token inválido o expirado.'
        });
    }
}

/**
 * Middleware para verificar que el usuario sea administrador
 */
function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: 'Acceso denegado. Usuario no autenticado.'
        });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({
            error: 'Acceso denegado. Se requieren permisos de administrador.'
        });
    }

    next();
}

module.exports = {
    authenticateToken,
    requireAdmin
};
