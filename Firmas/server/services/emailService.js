const nodemailer = require('nodemailer');
require('dotenv').config();

// Configuración del transporter de nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === 'true', // true para puerto 465, false para otros puertos
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false // Para servidores con certificados autofirmados
  }
});

// Verificar la conexión SMTP al iniciar
transporter.verify(function (error, success) {
  if (error) {
    console.error('❌ Error al conectar con el servidor SMTP:', error);
  } else {
    console.log('✅ Servidor SMTP listo para enviar correos');
  }
});

/**
 * Envía un correo electrónico
 * @param {Object} options - Opciones del correo
 * @param {string} options.to - Email del destinatario
 * @param {string} options.subject - Asunto del correo
 * @param {string} options.html - Contenido HTML del correo
 * @param {string} options.text - Contenido en texto plano (opcional)
 */
async function sendEmail({ to, subject, html, text }) {
  try {
    const mailOptions = {
      from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
      to,
      subject,
      html,
      text: text || '', // Texto plano como alternativa
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✉️  Correo enviado:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error al enviar correo:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Notifica a un firmante que ha sido asignado a un documento
 * @param {Object} params - Parámetros de la notificación
 * @param {string} params.email - Email del firmante
 * @param {string} params.nombreFirmante - Nombre del firmante
 * @param {string} params.nombreDocumento - Nombre del documento
 * @param {number} params.documentoId - ID del documento
 * @param {string} params.creadorDocumento - Nombre del creador del documento
 */
async function notificarAsignacionFirmante({
  email,
  nombreFirmante,
  nombreDocumento,
  documentoId,
  creadorDocumento
}) {
  const frontendUrl = 'http://192.168.0.30:5173';
  const documentoUrl = `${frontendUrl}/documento/${documentoId}`;

  const subject = '📝 Has sido asignado como firmante de un documento';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .header {
            background-color: #4F46E5;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: white;
            padding: 30px;
            border-radius: 0 0 5px 5px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #4F46E5;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .info {
            background-color: #f0f0f0;
            padding: 15px;
            border-left: 4px solid #4F46E5;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📝 DocuPrex - Solicitud de Firma</h1>
          </div>
          <div class="content">
            <p>Hola <strong>${nombreFirmante}</strong>,</p>

            <p>Has sido asignado como firmante de un documento en el sistema DocuPrex.</p>

            <div class="info">
              <p><strong>Documento:</strong> ${nombreDocumento}</p>
              <p><strong>Solicitado por:</strong> ${creadorDocumento}</p>
            </div>

            <p>Por favor, revisa y firma el documento haciendo clic en el siguiente botón:</p>

            <div style="text-align: center;">
              <a href="${documentoUrl}" class="button">Ver y Firmar Documento</a>
            </div>

            <p>También puedes copiar y pegar el siguiente enlace en tu navegador:</p>
            <p style="word-break: break-all; color: #4F46E5;">${documentoUrl}</p>

            <p style="margin-top: 30px; color: #666;">
              Si tienes alguna pregunta, por favor contacta con el solicitante del documento.
            </p>
          </div>
          <div class="footer">
            <p>Este es un correo automático, por favor no responder.</p>
            <p>&copy; ${new Date().getFullYear()} DocuPrex - Sistema de Firmas Digitales</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Hola ${nombreFirmante},

Has sido asignado como firmante de un documento en el sistema DocuPrex.

Documento: ${nombreDocumento}
Solicitado por: ${creadorDocumento}

Para revisar y firmar el documento, visita el siguiente enlace:
${documentoUrl}

Si tienes alguna pregunta, por favor contacta con el solicitante del documento.

Este es un correo automático, por favor no responder.
© ${new Date().getFullYear()} DocuPrex - Sistema de Firmas Digitales
  `;

  return await sendEmail({ to: email, subject, html, text });
}

/**
 * Notifica que un documento ha sido firmado completamente
 * @param {Object} params - Parámetros de la notificación
 * @param {Array} params.emails - Lista de emails a notificar
 * @param {string} params.nombreDocumento - Nombre del documento
 * @param {number} params.documentoId - ID del documento
 * @param {string} params.urlDescarga - URL para descargar el documento
 */
async function notificarDocumentoFirmadoCompleto({
  emails,
  nombreDocumento,
  documentoId,
  urlDescarga
}) {
  const frontendUrl = 'http://192.168.0.30:5173';
  const documentoUrl = `${frontendUrl}/documento/${documentoId}`;

  const subject = '✅ Documento firmado completamente';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .header {
            background-color: #10B981;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: white;
            padding: 30px;
            border-radius: 0 0 5px 5px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 10px 5px;
          }
          .button-primary {
            background-color: #10B981;
          }
          .button-secondary {
            background-color: #6366F1;
          }
          .info {
            background-color: #f0f9ff;
            padding: 15px;
            border-left: 4px solid #10B981;
            margin: 20px 0;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✅ Documento Firmado Completamente</h1>
          </div>
          <div class="content">
            <p>Estimado usuario,</p>

            <p>Te informamos que el siguiente documento ha sido <strong>firmado completamente</strong> por todas las partes involucradas.</p>

            <div class="info">
              <p><strong>Documento:</strong> ${nombreDocumento}</p>
              <p><strong>Estado:</strong> ✅ Completado</p>
              <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>
            </div>

            <p>Ya puedes descargar el documento firmado:</p>

            <div style="text-align: center;">
              <a href="${urlDescarga}" class="button button-primary">📥 Descargar Documento</a>
              <a href="${documentoUrl}" class="button button-secondary">👁️ Ver Detalles</a>
            </div>

            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              <strong>Nota:</strong> El documento descargado contiene todas las firmas digitales aplicadas.
            </p>
          </div>
          <div class="footer">
            <p>Este es un correo automático, por favor no responder.</p>
            <p>&copy; ${new Date().getFullYear()} DocuPrex - Sistema de Firmas Digitales</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Estimado usuario,

Te informamos que el siguiente documento ha sido firmado completamente por todas las partes involucradas.

Documento: ${nombreDocumento}
Estado: Completado
Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}

Descargar documento: ${urlDescarga}
Ver detalles: ${documentoUrl}

Nota: El documento descargado contiene todas las firmas digitales aplicadas.

Este es un correo automático, por favor no responder.
© ${new Date().getFullYear()} DocuPrex - Sistema de Firmas Digitales
  `;

  // Enviar correo a todos los emails
  const promises = emails.map(email =>
    sendEmail({ to: email, subject, html, text })
  );

  return await Promise.all(promises);
}

/**
 * Notifica que un documento ha sido rechazado
 * @param {Object} params - Parámetros de la notificación
 * @param {Array} params.emails - Lista de emails a notificar
 * @param {string} params.nombreDocumento - Nombre del documento
 * @param {number} params.documentoId - ID del documento
 * @param {string} params.rechazadoPor - Nombre de quien rechazó
 * @param {string} params.motivoRechazo - Motivo del rechazo
 */
async function notificarDocumentoRechazado({
  emails,
  nombreDocumento,
  documentoId,
  rechazadoPor,
  motivoRechazo
}) {
  const frontendUrl = 'http://192.168.0.30:5173';
  const documentoUrl = `${frontendUrl}/documento/${documentoId}`;

  const subject = '❌ Documento rechazado';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f9f9f9;
          }
          .header {
            background-color: #EF4444;
            color: white;
            padding: 20px;
            text-align: center;
            border-radius: 5px 5px 0 0;
          }
          .content {
            background-color: white;
            padding: 30px;
            border-radius: 0 0 5px 5px;
          }
          .button {
            display: inline-block;
            padding: 12px 24px;
            background-color: #6366F1;
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin: 20px 0;
          }
          .info {
            background-color: #FEF2F2;
            padding: 15px;
            border-left: 4px solid #EF4444;
            margin: 20px 0;
          }
          .motivo {
            background-color: #F9FAFB;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            font-style: italic;
          }
          .footer {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>❌ Documento Rechazado</h1>
          </div>
          <div class="content">
            <p>Estimado usuario,</p>

            <p>Te informamos que el siguiente documento ha sido <strong>rechazado</strong>.</p>

            <div class="info">
              <p><strong>Documento:</strong> ${nombreDocumento}</p>
              <p><strong>Rechazado por:</strong> ${rechazadoPor}</p>
              <p><strong>Fecha:</strong> ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</p>
            </div>

            ${motivoRechazo ? `
            <p><strong>Motivo del rechazo:</strong></p>
            <div class="motivo">
              ${motivoRechazo}
            </div>
            ` : ''}

            <p>Puedes ver los detalles del documento haciendo clic en el siguiente botón:</p>

            <div style="text-align: center;">
              <a href="${documentoUrl}" class="button">Ver Detalles del Documento</a>
            </div>

            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              <strong>Nota:</strong> Es posible que necesites revisar el documento y realizar las correcciones necesarias antes de solicitar nuevamente las firmas.
            </p>
          </div>
          <div class="footer">
            <p>Este es un correo automático, por favor no responder.</p>
            <p>&copy; ${new Date().getFullYear()} DocuPrex - Sistema de Firmas Digitales</p>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = `
Estimado usuario,

Te informamos que el siguiente documento ha sido rechazado.

Documento: ${nombreDocumento}
Rechazado por: ${rechazadoPor}
Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}

${motivoRechazo ? `Motivo del rechazo: ${motivoRechazo}` : ''}

Ver detalles del documento: ${documentoUrl}

Nota: Es posible que necesites revisar el documento y realizar las correcciones necesarias antes de solicitar nuevamente las firmas.

Este es un correo automático, por favor no responder.
© ${new Date().getFullYear()} DocuPrex - Sistema de Firmas Digitales
  `;

  // Enviar correo a todos los emails
  const promises = emails.map(email =>
    sendEmail({ to: email, subject, html, text })
  );

  return await Promise.all(promises);
}

module.exports = {
  sendEmail,
  notificarAsignacionFirmante,
  notificarDocumentoFirmadoCompleto,
  notificarDocumentoRechazado
};
