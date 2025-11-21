/**
 * Sistema de Logs en PDF
 *
 * Genera archivos PDF con registros de actividad en lenguaje natural
 * Sin IDs técnicos, solo texto legible
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// Directorio donde se guardarán los logs
const logsDir = path.join(__dirname, '..', 'logs');

// Asegurarse de que la carpeta logs existe
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
  console.log('📁 Carpeta de logs creada');
}

/**
 * Formatea la fecha y hora en formato legible
 * Zona horaria: America/Bogota (Colombia)
 */
function formatDateTime(date) {
  // Convertir a hora de Bogotá (UTC-5)
  const d = new Date(date);
  const bogotaTime = new Date(d.toLocaleString('en-US', { timeZone: 'America/Bogota' }));

  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const day = bogotaTime.getDate();
  const month = months[bogotaTime.getMonth()];
  const year = bogotaTime.getFullYear();
  const hours = String(bogotaTime.getHours()).padStart(2, '0');
  const minutes = String(bogotaTime.getMinutes()).padStart(2, '0');
  const seconds = String(bogotaTime.getSeconds()).padStart(2, '0');

  return `${day} de ${month} de ${year} a las ${hours}:${minutes}:${seconds}`;
}

/**
 * Obtiene el nombre del archivo de log del día actual
 * Zona horaria: America/Bogota (Colombia)
 */
function getTodayLogFileName() {
  const now = new Date();
  const bogotaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));

  const year = bogotaTime.getFullYear();
  const month = String(bogotaTime.getMonth() + 1).padStart(2, '0');
  const day = String(bogotaTime.getDate()).padStart(2, '0');

  return `log_${year}-${month}-${day}.txt`;
}

/**
 * Escribe un log en formato texto (para luego convertir a PDF)
 */
function writeLog(message) {
  const logFile = path.join(logsDir, getTodayLogFileName());
  const timestamp = formatDateTime(new Date());
  const logEntry = `[${timestamp}] ${message}\n`;

  fs.appendFileSync(logFile, logEntry, 'utf8');
}

/**
 * Genera un PDF con los logs del día
 */
async function generateDailyPDF(date = new Date()) {
  return new Promise((resolve, reject) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    const txtFile = path.join(logsDir, `log_${year}-${month}-${day}.txt`);
    const pdfFile = path.join(logsDir, `log_${year}-${month}-${day}.pdf`);

    // Verificar si existe el archivo de texto
    if (!fs.existsSync(txtFile)) {
      return reject(new Error('No hay logs para esta fecha'));
    }

    // Leer el contenido del archivo
    const content = fs.readFileSync(txtFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() !== '');

    // Crear el PDF
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 }
    });

    const stream = fs.createWriteStream(pdfFile);
    doc.pipe(stream);

    // Título del documento
    doc.fontSize(20)
       .font('Helvetica-Bold')
       .text('Registro de Actividad', { align: 'center' });

    doc.moveDown(0.5);
    doc.fontSize(12)
       .font('Helvetica')
       .text(`${day} de ${getMonthName(parseInt(month))} de ${year}`, { align: 'center' });

    doc.moveDown(1);

    // Línea divisoria
    doc.moveTo(50, doc.y)
       .lineTo(545, doc.y)
       .stroke();

    doc.moveDown(1);

    // Escribir cada línea de log
    doc.fontSize(10).font('Helvetica');

    lines.forEach((line, index) => {
      // Verificar si hay espacio suficiente, sino crear nueva página
      if (doc.y > 700) {
        doc.addPage();
        doc.fontSize(10).font('Helvetica');
      }

      doc.text(line, {
        align: 'left',
        lineGap: 5
      });
    });

    // Pie de página
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.fontSize(8)
         .font('Helvetica')
         .text(
           `Página ${i + 1} de ${pageCount} - DocuPrex © ${year}`,
           50,
           750,
           { align: 'center' }
         );
    }

    doc.end();

    stream.on('finish', () => {
      console.log(`✅ PDF de logs generado: ${pdfFile}`);
      resolve(pdfFile);
    });

    stream.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Obtiene el nombre del mes en español
 */
function getMonthName(monthNum) {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return months[monthNum - 1];
}

/**
 * FUNCIONES DE LOGGING EN LENGUAJE NATURAL
 */

// Autenticación
function logLogin(userName) {
  writeLog(`${userName} inició sesión`);
}

function logLoginFailed(email) {
  writeLog(`Intento fallido de inicio de sesión para ${email}`);
}

function logLogout(userName) {
  writeLog(`${userName} cerró sesión`);
}

// Documentos
function logDocumentCreated(userName, documentTitle) {
  writeLog(`${userName} creó el documento "${documentTitle}"`);
}

function logDocumentModified(userName, documentTitle) {
  writeLog(`${userName} modificó el documento "${documentTitle}"`);
}

function logDocumentDeleted(userName, documentTitle) {
  writeLog(`${userName} eliminó el documento "${documentTitle}"`);
}

function logDocumentDownloaded(userName, documentTitle) {
  writeLog(`${userName} descargó el documento "${documentTitle}"`);
}

function logDocumentViewed(userName, documentTitle) {
  writeLog(`${userName} visualizó el documento "${documentTitle}"`);
}

function logDocumentArchived(userName, documentTitle) {
  writeLog(`${userName} archivó el documento "${documentTitle}"`);
}

// Firmas
function logDocumentSigned(userName, documentTitle) {
  writeLog(`${userName} firmó el documento "${documentTitle}"`);
}

function logDocumentRejected(userName, documentTitle, reason) {
  const reasonText = reason ? ` con la razón: "${reason}"` : '';
  writeLog(`${userName} rechazó el documento "${documentTitle}"${reasonText}`);
}

// Asignaciones
function logSignerAssigned(assignerName, signerName, documentTitle, role) {
  const roleText = role ? ` como ${role}` : '';
  writeLog(`${assignerName} asignó a ${signerName}${roleText} para firmar el documento "${documentTitle}"`);
}

function logSignerRemoved(removerName, signerName, documentTitle) {
  writeLog(`${removerName} removió a ${signerName} de los firmantes del documento "${documentTitle}"`);
}

// Usuarios
function logUserCreated(adminName, newUserName, newUserEmail) {
  writeLog(`${adminName} creó la cuenta de usuario para ${newUserName} (${newUserEmail})`);
}

function logUserModified(adminName, userName, changes) {
  writeLog(`${adminName} modificó la cuenta de ${userName}: ${changes}`);
}

function logUserActivated(adminName, userName) {
  writeLog(`${adminName} activó la cuenta de ${userName}`);
}

function logUserDeactivated(adminName, userName) {
  writeLog(`${adminName} desactivó la cuenta de ${userName}`);
}

// Notificaciones
function logNotificationSent(recipientName, notificationType) {
  const types = {
    'signature_request': 'solicitud de firma',
    'document_signed': 'documento firmado',
    'document_completed': 'documento completado',
    'document_rejected': 'documento rechazado'
  };
  const typeText = types[notificationType] || notificationType;
  writeLog(`Se envió una notificación de ${typeText} a ${recipientName}`);
}

/**
 * Genera el PDF del día actual al final del día (útil para ejecutar en cron)
 */
async function generateTodayPDF() {
  try {
    const pdfPath = await generateDailyPDF();
    console.log(`✅ PDF de hoy generado: ${pdfPath}`);
    return pdfPath;
  } catch (error) {
    console.error('❌ Error al generar PDF de hoy:', error.message);
    throw error;
  }
}

/**
 * Lista todos los PDFs de logs disponibles
 */
function listLogPDFs() {
  const files = fs.readdirSync(logsDir);
  return files
    .filter(file => file.endsWith('.pdf'))
    .map(file => ({
      fileName: file,
      fullPath: path.join(logsDir, file),
      date: file.replace('log_', '').replace('.pdf', '')
    }))
    .sort((a, b) => b.date.localeCompare(a.date)); // Más recientes primero
}

/**
 * Obtiene el PDF de una fecha específica
 */
function getLogPDF(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  const pdfFile = path.join(logsDir, `log_${year}-${month}-${day}.pdf`);

  if (fs.existsSync(pdfFile)) {
    return pdfFile;
  }

  // Si no existe el PDF, intentar generarlo desde el txt
  return generateDailyPDF(date);
}

module.exports = {
  // Funciones de logging
  logLogin,
  logLoginFailed,
  logLogout,
  logDocumentCreated,
  logDocumentModified,
  logDocumentDeleted,
  logDocumentDownloaded,
  logDocumentViewed,
  logDocumentArchived,
  logDocumentSigned,
  logDocumentRejected,
  logSignerAssigned,
  logSignerRemoved,
  logUserCreated,
  logUserModified,
  logUserActivated,
  logUserDeactivated,
  logNotificationSent,

  // Funciones de gestión de PDFs
  generateDailyPDF,
  generateTodayPDF,
  listLogPDFs,
  getLogPDF,
  logsDir
};
