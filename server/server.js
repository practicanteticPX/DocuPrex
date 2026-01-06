const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const http = require('http');
const { Server: SocketIO } = require('socket.io');
require('dotenv').config();

const serverConfig = require('./config/server');
const websocketService = require('./services/websocket');
const { typeDefs, resolvers } = require('./graphql');
const uploadRoutes = require('./routes/upload');
const logsRoutes = require('./routes/logs');
const facturasRoutes = require('./routes/facturas');
const pdfLogger = require('./utils/pdfLogger');
const { startCleanupService } = require('./services/notificationCleanup');
const { startDocumentCleanupService } = require('./services/documentCleanup');
const { startReminderService } = require('./services/signatureReminders');
const { startSessionCleanupService } = require('./services/sessionCleanup');
const { query } = require('./database/db');
const resourceCache = require('./utils/resourceCache');

const JWT_SECRET = serverConfig.jwtSecret;
const PORT = serverConfig.port;

// Timestamp de inicio del servidor - usado para detectar reinicios
const SERVER_START_TIME = Date.now();

// Función para obtener el usuario del token
const getUserFromToken = (token) => {
  try {
    if (!token) {
      console.log('⚠️ getUserFromToken: No token provided');
      return null;
    }
    console.log('🔑 getUserFromToken: Token recibido (primeros 20 chars):', token.substring(0, 20) + '...');
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ getUserFromToken: Token válido para usuario:', decoded.username);
    return decoded;
  } catch (error) {
    console.error('❌ getUserFromToken: Error verificando token:', error.message);
    if (error.name === 'TokenExpiredError') {
      console.error('⏰ Token expirado en:', error.expiredAt);
    } else if (error.name === 'JsonWebTokenError') {
      console.error('🚫 Token inválido o malformado');
    }
    return null;
  }
};

// Rate limiter DESHABILITADO para producción con 40 usuarios activos
// Si necesitas protección contra ataques DDoS, implementa rate limiting a nivel de firewall/nginx

async function startServer() {
  const app = express();

  // Trust proxy - Necesario para detectar el protocolo real detrás de Nginx Proxy Manager
  // Esto permite que req.protocol devuelva 'https' cuando NPM usa SSL
  app.set('trust proxy', true);

  // Middleware de seguridad - Ajustado para soportar HTTP y HTTPS
  app.use(helmet({
    contentSecurityPolicy: false, // Deshabilitar CSP para permitir iframes y PDFs
    crossOriginEmbedderPolicy: false, // Permitir que los PDFs se embeden
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Permitir recursos cross-origin
    crossOriginOpenerPolicy: false, // Deshabilitar COOP para desarrollo sin HTTPS
    strictTransportSecurity: false, // Deshabilitar HSTS para permitir HTTP y HTTPS
    frameguard: false // Deshabilitar X-Frame-Options para permitir iframes
  }));

  // CORS con múltiples orígenes
  app.use(cors({
    origin: function (origin, callback) {
      // Permitir requests sin origin (como mobile apps o curl)
      if (!origin) return callback(null, true);

      if (serverConfig.corsOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log('⚠️  Origen bloqueado por CORS:', origin);
        callback(null, true); // En desarrollo, permitir todos los orígenes
      }
    },
    credentials: true,
  }));

  // Configurar express.json para manejar correctamente UTF-8
  app.use(express.json({
    charset: 'utf-8',
    verify: (req, res, buf, encoding) => {
      // Asegurar que el buffer se interprete como UTF-8
      if (buf && buf.length) {
        req.rawBody = buf.toString('utf8');
      }
    }
  }));

  // Middleware adicional para asegurar UTF-8 en requests
  app.use((req, res, next) => {
    if (req.headers['content-type']?.includes('application/json')) {
      req.headers['content-type'] = 'application/json; charset=utf-8';
    }
    next();
  });

  // Servir archivos estáticos de la carpeta uploads con headers apropiados para PDFs
  // IMPORTANTE: Esto debe ir ANTES del middleware de UTF-8 para que no se sobrescriban los headers
  app.use('/uploads', (req, res, next) => {
    // Permitir que los PDFs se muestren en iframes del frontend
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    // No establecer Content-Type aquí, express.static lo manejará correctamente
    next();
  }, express.static(path.join(__dirname, 'uploads')));

  // Middleware para forzar UTF-8 solo en respuestas JSON (NO en archivos estáticos)
  app.use((req, res, next) => {
    // Solo aplicar UTF-8 si la ruta no es /uploads (archivos estáticos)
    if (!req.path.startsWith('/uploads')) {
      const originalJson = res.json;
      res.json = function(data) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return originalJson.call(this, data);
      };
    }
    next();
  });

  // Rutas REST para subida de archivos
  app.use('/api', uploadRoutes);

  // Rutas REST para logs en TXT/PDF
  app.use('/api/logs', logsRoutes);

  // Rutas REST para facturas
  app.use('/api/facturas', facturasRoutes);

  // Ruta para visualizar documentos con el nombre correcto
  app.get('/api/view/:documentId', async (req, res) => {
    try {
      const { documentId } = req.params;

      // Buscar el documento en la base de datos
      const result = await query('SELECT id, title, file_path FROM documents WHERE id = $1', [documentId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Documento no encontrado' });
      }

      const document = result.rows[0];
      const filePath = document.file_path;
      const title = document.title || 'documento';

      // Construir la ruta completa del archivo
      let fullPath;
      if (filePath.startsWith('/app/uploads/')) {
        fullPath = path.join(__dirname, 'uploads', filePath.replace('/app/uploads/', ''));
      } else if (filePath.startsWith('uploads/')) {
        fullPath = path.join(__dirname, filePath);
      } else {
        fullPath = path.join(__dirname, 'uploads', filePath);
      }

      // Sanitizar el nombre del archivo para evitar caracteres problemáticos
      const sanitizedTitle = title
        .replace(/[<>:"/\\|?*]/g, '_') // Reemplazar caracteres inválidos en nombres de archivos
        .substring(0, 200); // Limitar longitud del nombre

      // Configurar headers para visualización inline
      res.setHeader('Content-Disposition', `inline; filename="${sanitizedTitle}.pdf"`);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');

      // Enviar el archivo
      res.sendFile(fullPath, (err) => {
        if (err) {
          console.error('Error al enviar archivo:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error al visualizar el documento' });
          }
        }
      });
    } catch (error) {
      console.error('Error en ruta de visualización:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Ruta para descargar documentos con el nombre correcto
  app.get('/api/download/:documentId', async (req, res) => {
    try {
      const { documentId } = req.params;

      // Obtener usuario del token si existe
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      const user = getUserFromToken(token);

      // Buscar el documento en la base de datos
      const result = await query('SELECT id, title, file_path FROM documents WHERE id = $1', [documentId]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Documento no encontrado' });
      }

      const document = result.rows[0];
      const filePath = document.file_path;
      const title = document.title || 'documento';

      // Registrar descarga en logs
      if (user && user.name) {
        pdfLogger.logDocumentDownloaded(user.name, title);
      }

      // Construir la ruta completa del archivo
      let fullPath;
      if (filePath.startsWith('/app/uploads/')) {
        fullPath = path.join(__dirname, 'uploads', filePath.replace('/app/uploads/', ''));
      } else if (filePath.startsWith('uploads/')) {
        fullPath = path.join(__dirname, filePath);
      } else {
        fullPath = path.join(__dirname, 'uploads', filePath);
      }

      // Sanitizar el nombre del archivo para evitar caracteres problemáticos
      const sanitizedTitle = title
        .replace(/[<>:"/\\|?*]/g, '_') // Reemplazar caracteres inválidos en nombres de archivos
        .substring(0, 200); // Limitar longitud del nombre

      // Configurar headers para descarga
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizedTitle}.pdf"`);
      res.setHeader('Content-Type', 'application/pdf');

      // Enviar el archivo
      res.sendFile(fullPath, (err) => {
        if (err) {
          console.error('Error al enviar archivo:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Error al descargar el documento' });
          }
        }
      });
    } catch (error) {
      console.error('Error en ruta de descarga:', error);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Endpoint de health check - devuelve el timestamp de inicio del servidor
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      serverStartTime: SERVER_START_TIME,
      uptime: Date.now() - SERVER_START_TIME,
      timestamp: Date.now()
    });
  });

  // Crear servidor Apollo
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      // Obtener token del header
      const authHeader = req.headers.authorization;
      console.log('🌐 Apollo Context: Authorization header:', authHeader ? `${authHeader.substring(0, 30)}...` : 'MISSING');

      const token = authHeader?.replace('Bearer ', '') || '';

      // Obtener IP del cliente
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'IP desconocida';

      // Si no hay token, retornar sin usuario
      if (!token) {
        console.warn('⚠️ Apollo Context: No hay token en la request');
        return { user: null, req, ipAddress };
      }

      // PASO 1: Verificar JWT (verificación básica de firma y expiración)
      const userFromToken = getUserFromToken(token);
      if (!userFromToken) {
        console.warn('⚠️ Apollo Context: Token JWT inválido o expirado');
        return { user: null, req, ipAddress };
      }

      // PASO 2: Validar sesión en BD (FUENTE DE VERDAD para las 8 horas)
      // Esta es la validación OBLIGATORIA que no se puede manipular desde el cliente
      const { validateSession } = require('./utils/sessionManager');
      const session = await validateSession(token);

      if (!session) {
        console.warn(`⚠️ Apollo Context: Sesión expirada o inválida para usuario ${userFromToken.name} (ID: ${userFromToken.id})`);
        console.warn('⏰ Razón: Han pasado 8 horas desde el login O la sesión fue cerrada');
        return { user: null, req, ipAddress };
      }

      // PASO 3: Sesión válida (JWT válido + menos de 8h desde login en BD)
      console.log(`✅ Apollo Context: Usuario autenticado - ${userFromToken.name} (ID: ${userFromToken.id}, Session: ${session.id})`);
      return { user: userFromToken, req, ipAddress };
    },
    formatError: (error) => {
      console.error('GraphQL Error:', error);
      return {
        message: error.message,
        path: error.path,
      };
    },
  });

  // Iniciar Apollo Server
  await server.start();

  // Rate limiter removido para soportar 40 usuarios activos sin limitaciones

  // Aplicar middleware de Apollo a Express
  server.applyMiddleware({
    app,
    path: '/graphql',
    cors: false, // Ya manejamos CORS arriba
  });

  // Ruta de health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      services: {
        graphql: true,
        activeDirectory: !!process.env.AD_HOSTNAME
      }
    });
  });

  // Crear servidor HTTP (necesario para Socket.IO)
  const httpServer = http.createServer(app);

  // Inicializar Socket.IO con CORS y configuración para 30+ usuarios concurrentes
  const io = new SocketIO(httpServer, {
    cors: {
      origin: "*",
      methods: ['GET', 'POST'],
      credentials: false
    },
    transports: ['websocket', 'polling'],
    // Configuración para soportar 30+ conexiones simultáneas
    maxHttpBufferSize: 1e7, // 10MB buffer para mensajes grandes
    pingTimeout: 60000, // 60s timeout antes de considerar conexión muerta
    pingInterval: 25000, // 25s entre pings de keep-alive
    connectTimeout: 45000, // 45s timeout para establecer conexión
    upgradeTimeout: 30000, // 30s timeout para upgrade a WebSocket
    allowUpgrades: true, // Permitir upgrade de polling a WebSocket
    perMessageDeflate: true, // Comprimir mensajes para reducir bandwidth
    httpCompression: true // Comprimir respuestas HTTP
  });

  // Inicializar servicio WebSocket
  websocketService.initialize(io);

  // Iniciar servidor HTTP (en vez de app.listen)
  httpServer.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en ${serverConfig.backendUrl}`);
    console.log(`📊 GraphQL disponible en ${serverConfig.backendUrl}${server.graphqlPath}`);
    console.log(`🔌 WebSocket disponible en ${serverConfig.backendUrl}`);
    console.log(`🔐 Autenticación Active Directory configurada`);
    console.log(`   - Host: ${process.env.AD_HOSTNAME || 'No configurado'}`);
    console.log(`   - Protocol: ${process.env.AD_PROTOCOL || 'ldap'}`);
    console.log(`   - Base DN: ${process.env.AD_BASE_DN || 'No configurado'}`);
    console.log(`💾 Base de datos: ${process.env.DATABASE_URL ? 'PostgreSQL conectado' : 'No configurado'}`);

    // Inicializar caché de recursos estáticos (fuentes y logos)
    resourceCache.initialize();

    // Iniciar servicio de limpieza automática de notificaciones
    startCleanupService();
    console.log(`🧹 Servicio de limpieza de notificaciones iniciado (cada 24h a las 2:00 AM)`);

    // Iniciar servicio de limpieza automática de documentos antiguos
    startDocumentCleanupService();
    console.log(`🗑️  Servicio de limpieza de documentos antiguos iniciado (cada 24h a las 3:00 AM)`);

    // Iniciar servicio de recordatorios de firmas pendientes
    startReminderService();
    console.log(`📧 Servicio de recordatorios de firmas iniciado (cada 24h a las 9:00 AM)`);

    // Iniciar servicio de limpieza de sesiones expiradas
    startSessionCleanupService();
  });
}

// Iniciar el servidor
startServer().catch((error) => {
  console.error('Error al iniciar el servidor:', error);
  process.exit(1);
});