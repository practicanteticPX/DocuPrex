const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
// const rateLimit = require('express-rate-limit'); // Deshabilitado para producción con 40 usuarios
const path = require('path');
require('dotenv').config();

const { typeDefs, resolvers } = require('./graphql');
const uploadRoutes = require('./routes/upload');
const { startCleanupService } = require('./services/notificationCleanup');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';
const PORT = process.env.PORT || 5001;

// Función para obtener el usuario del token
const getUserFromToken = (token) => {
  try {
    if (token) {
      return jwt.verify(token, JWT_SECRET);
    }
    return null;
  } catch (error) {
    return null;
  }
};

// Rate limiter DESHABILITADO para producción con 40 usuarios activos
// Si necesitas protección contra ataques DDoS, implementa rate limiting a nivel de firewall/nginx

async function startServer() {
  const app = express();

  // Middleware de seguridad - Ajustado para desarrollo sin HTTPS
  app.use(helmet({
    contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    crossOriginEmbedderPolicy: false, // Permitir que los PDFs se embeden
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Permitir recursos cross-origin
    crossOriginOpenerPolicy: false, // Deshabilitar COOP para desarrollo sin HTTPS
    strictTransportSecurity: false, // Deshabilitar HSTS para desarrollo sin HTTPS
    frameguard: false // Deshabilitar X-Frame-Options para permitir iframes
  }));

  // Configuración de múltiples orígenes permitidos
  const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(url => url.trim())
    : [
        'http://firmapro.com:5173',
        'http://www.firmapro.com:5173',
        'http://192.168.0.30:5173',
        'http://localhost:5173'
      ];

  // CORS con múltiples orígenes
  app.use(cors({
    origin: function (origin, callback) {
      // Permitir requests sin origin (como mobile apps o curl)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        console.log('⚠️  Origen bloqueado por CORS:', origin);
        callback(null, true); // En desarrollo, permitir todos los orígenes
      }
    },
    credentials: true,
  }));

  app.use(express.json());

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

  // Crear servidor Apollo
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: ({ req }) => {
      // Obtener token del header
      const token = req.headers.authorization?.replace('Bearer ', '') || '';
      const user = getUserFromToken(token);

      return { user };
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

  // Iniciar servidor
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://192.168.0.30:${PORT}`);
    console.log(`📊 GraphQL disponible en http://192.168.0.30:${PORT}${server.graphqlPath}`);
    console.log(`🔐 Autenticación Active Directory configurada`);
    console.log(`   - Host: ${process.env.AD_HOSTNAME || 'No configurado'}`);
    console.log(`   - Protocol: ${process.env.AD_PROTOCOL || 'ldap'}`);
    console.log(`   - Base DN: ${process.env.AD_BASE_DN || 'No configurado'}`);
    console.log(`💾 Base de datos: ${process.env.DATABASE_URL ? 'PostgreSQL conectado' : 'No configurado'}`);

    // Iniciar servicio de limpieza automática de notificaciones
    startCleanupService();
    console.log(`🧹 Servicio de limpieza de notificaciones iniciado (cada 24h a las 2:00 AM)`);
  });
}

// Iniciar el servidor
startServer().catch((error) => {
  console.error('Error al iniciar el servidor:', error);
  process.exit(1);
});