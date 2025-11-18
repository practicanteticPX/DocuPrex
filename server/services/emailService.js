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

  const subject = 'Solicitud de Firma';

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Firma pendiente</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          width: 100%;
          background-color: #f3f4f6;
          font-family: 'Poppins', Arial, sans-serif;
        }
        .container {
          width: 100%;
          max-width: 448px;
          margin: 0 auto;
          background-color: #ffffff;
        }
        .content {
          padding: 32px;
          text-align: center;
        }
        h1 {
          margin-top: 0; 
          margin-bottom: 8px;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 20px;
          font-weight: 600;
          color: #1f2937;
        }
        p {
          margin: 0;
          margin-bottom: 32px;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 16px;
          color: #6b7280;
        }
        .button-link {
          display: inline-block;
          color: #ffffff;
          text-decoration: none;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 16px;
          font-weight: 600;
          padding: 12px 24px;
          border-radius: 8px;
        }
        .footer {
          padding: 24px 0;
          text-align: center;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 12px;
          color: #6b7280;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; width: 100%; background-color: #f3f4f6;">
      
      <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6" style="width: 100%; background-color: #f3f4f6;">
        
        <tr>
          <td style="height: 64px; font-size: 0; line-height: 0;">&nbsp;</td>
        </tr>
        
        <tr>
          <td align="center">
            <table class="container" role="presentation" width="448" align="center" style="width: 100%; max-width: 448px; margin: 0 auto; background-color: #ffffff;" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="content" style="padding: 32px; text-align: center;">
                  
                  <h1 style="margin-top: 0; margin-bottom: 8px; font-family: 'Poppins', Arial, sans-serif; font-size: 20px; font-weight: 600; color: #1f2937;">
                    Firma pendiente
                  </h1>
                  
                  <p style="margin: 0; margin-bottom: 32px; font-family: 'Poppins', Arial, sans-serif; font-size: 16px; color: #6b7280;">
                    <span style="font-weight: 500; color: #374151;">${creadorDocumento}</span> te ha enviado el documento "<span style="font-weight: 500; color: #374151;">${nombreDocumento}</span>" para que lo firmes.
                  </p>
                  
                  <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                    <tr>
                      <td align="center" bgcolor="#00A7FF" style="background-color: #00A7FF; border-radius: 8px;">
                        <a href="${documentoUrl}" target="_blank" class="button-link" style="display: inline-block; text-decoration: none; font-family: 'Poppins', Arial, sans-serif; font-size: 16px; font-weight: 600; padding: 12px 24px; border: 1px solid #00A7FF; border-radius: 8px;">
                          
                          <span style="color: #ffffff; text-decoration: none;">
                            Ver Documento
                          </span>
                          </a>
                      </td>
                    </tr>
                  </table>
                  
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
        <tr>
          <td align="center">
            <table role="presentation" width="448" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 100%; max-width: 448px; margin: 0 auto;">
              <tr>
                <td class="footer" style="padding: 24px 0; text-align: center; font-family: 'Poppins', Arial, sans-serif; font-size: 12px; color: #6b7280;">
                  <p style="margin: 0;">&copy; ${new Date().getFullYear()} DocuPrex&reg; - Powered by Prexxa TIC</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
        <tr>
          <td style="height: 64px; font-size: 0; line-height: 0;">&nbsp;</td>
        </tr>

      </table>
        
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

  const subject = 'Documento Completado';

  const html = `  
        <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Documento Completado</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          width: 100%;
          background-color: #f3f4f6;
          font-family: 'Poppins', Arial, sans-serif;
        }
        .container {
          width: 100%;
          max-width: 448px;
          margin: 0 auto;
          background-color: #ffffff;
        }
        .content {
          padding: 32px;
          text-align: center;
        }
        h1 {
          margin-top: 0; 
          margin-bottom: 8px;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 20px;
          font-weight: 600;
          color: #1f2937;
        }
        p {
          margin: 0;
          margin-bottom: 32px;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 16px;
          color: #6b7280;
        }
        .button-link {
          display: inline-block;
          text-decoration: none;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 16px;
          font-weight: 600;
          padding: 12px 24px;
          border-radius: 8px;
        }
        .footer {
          padding: 24px 0;
          text-align: center;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 12px;
          color: #6b7280;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; width: 100%; background-color: #f3f4f6;">
      
      <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6" style="width: 100%; background-color: #f3f4f6;">
        
        <tr>
          <td style="height: 64px; font-size: 0; line-height: 0;">&nbsp;</td>
        </tr>
        
        <tr>
          <td align="center">
            <table class="container" role="presentation" width="448" align="center" style="width: 100%; max-width: 448px; margin: 0 auto; background-color: #ffffff;" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="content" style="padding: 32px; text-align: center;">
                  
                  <h1 style="margin-top: 0; margin-bottom: 8px; font-family: 'Poppins', Arial, sans-serif; font-size: 20px; font-weight: 600; color: #1f2937;">
                    Documento completado
                  </h1>
                  
                  <p style="margin: 0; margin-bottom: 32px; font-family: 'Poppins', Arial, sans-serif; font-size: 16px; color: #6b7280;">
                    El documento "<span style="font-weight: 500; color: #374151;">${nombreDocumento}</span>" ha sido firmado por todas las partes.
                  </p>
                  
                  <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                    <tr>
                      <td align="center" bgcolor="#10B981" style="background-color: #10B981; border-radius: 8px;">
                        <a href="${documentoUrl}" target="_blank" class="button-link" style="display: inline-block; text-decoration: none; font-family: 'Poppins', Arial, sans-serif; font-size: 16px; font-weight: 600; padding: 12px 24px; border: 1px solid #10B981; border-radius: 8px;">
                          <span style="color: #ffffff; text-decoration: none;">
                            Ver Documento
                          </span>
                        </a>
                      </td>
                    </tr>
                  </table>
                  
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
        <tr>
          <td align="center">
            <table role="presentation" width="448" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 100%; max-width: 448px; margin: 0 auto;">
              <tr>
                <td class="footer" style="padding: 24px 0; text-align: center; font-family: 'Poppins', Arial, sans-serif; font-size: 12px; color: #6b7280;">
                  <p style="margin: 0;">&copy; ${new Date().getFullYear()} DocuPrex&reg; - Powered by Prexxa TIC</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
        <tr>
          <td style="height: 64px; font-size: 0; line-height: 0;">&nbsp;</td>
        </tr>

      </table>

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

  const subject = 'Documento rechazado';

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="X-UA-Compatible" content="IE=edge">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Documento Rechazado</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          width: 100%;
          background-color: #f3f4f6;
          font-family: 'Poppins', Arial, sans-serif;
        }
        .container {
          width: 100%;
          max-width: 448px;
          margin: 0 auto;
          background-color: #ffffff;
        }
        .content {
          padding: 32px;
          text-align: center;
        }
        h1 {
          margin-top: 0; 
          margin-bottom: 8px;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 20px;
          font-weight: 600;
          color: #1f2937;
        }
        p {
          margin: 0;
          margin-bottom: 32px;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 16px;
          color: #6b7280;
        }
        .button-link {
          display: inline-block;
          color: #ffffff;
          text-decoration: none;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 16px;
          font-weight: 600;
          padding: 12px 24px;
          border-radius: 8px;
        }
        .footer {
          padding: 24px 0;
          text-align: center;
          font-family: 'Poppins', Arial, sans-serif;
          font-size: 12px;
          color: #6b7280;
        }
      </style>
    </head>
    <body style="margin: 0; padding: 0; width: 100%; background-color: #f3f4f6;">
      
      <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f3f4f6" style="width: 100%; background-color: #f3f4f6;">
        
        <tr>
          <td style="height: 64px; font-size: 0; line-height: 0;">&nbsp;</td>
        </tr>
        
        <tr>
          <td align="center">
            <table class="container" role="presentation" width="448" align="center" style="width: 100%; max-width: 448px; margin: 0 auto; background-color: #ffffff;" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="content" style="padding: 32px; text-align: center;">
                  
                  <h1 style="margin-top: 0; margin-bottom: 8px; font-family: 'Poppins', Arial, sans-serif; font-size: 20px; font-weight: 600; color: #1f2937;">
                    Documento rechazado
                  </h1>
                  
                  <p style="margin: 0; margin-bottom: 32px; font-family: 'Poppins', Arial, sans-serif; font-size: 16px; color: #6b7280;">
                    <span style="font-weight: 500; color: #374151;">${rechazadoPor}</span> ha rechazado el documento "<span style="font-weight: 500; color: #374151;">${nombreDocumento}</span>".
                  </p>
                  
                  <div style="margin-bottom: 32px; text-align: left; background-color: #fef2f2; padding: 12px 16px;">
                    <p style="margin: 0; font-family: 'Poppins', Arial, sans-serif; font-size: 15px; color: #374151; margin-bottom: 4px; font-weight: 600;">Motivo del rechazo:</p>
                    <p style="margin: 0; font-family: 'Poppins', Arial, sans-serif; font-size: 15px; color: #6b7280; font-style: italic;">${motivoRechazo}</p>
                  </div>


                  <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="center" style="margin: 0 auto;">
                    <tr>
                      <td align="center" bgcolor="#EF4444" style="background-color: #EF4444; border-radius: 8px;">
                        <a href="${documentoUrl}" target="_blank" class="button-link" style="display: inline-block; text-decoration: none; font-family: 'Poppins', Arial, sans-serif; font-size: 16px; font-weight: 600; padding: 12px 24px; border: 1px solid #EF4444; border-radius: 8px;">
                          <span style="color: #ffffff; text-decoration: none;">
                            Ver Detalles
                          </span>
                        </a>
                      </td>
                    </tr>
                  </table>
                
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
        <tr>
          <td align="center">
            <table role="presentation" width="448" border="0" cellspacing="0" cellpadding="0" align="center" style="width: 100%; max-width: 448px; margin: 0 auto;">
              <tr>
                <td class="footer" style="padding: 24px 0; text-align: center; font-family: 'Poppins', Arial, sans-serif; font-size: 12px; color: #6b7280;">
                  <p style="margin: 0;">&copy; ${new Date().getFullYear()} DocuPrex&reg; - Powered by Prexxa TIC</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        
        <tr>
          <td style="height: 64px; font-size: 0; line-height: 0;">&nbsp;</td>
        </tr>

      </table>

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
