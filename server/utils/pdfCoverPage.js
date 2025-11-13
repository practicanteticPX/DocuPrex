const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

/**
 * Genera una página de información de firmantes al final del PDF
 * Diseño moderno y limpio inspirado en la imagen de referencia
 * @param {string} pdfPath - Ruta al PDF original
 * @param {Array} signers - Array de firmantes con {name, email, order_position, status}
 * @param {Object} documentInfo - Información del documento {title, fileName, createdAt, uploadedBy}
 * @returns {Promise<Buffer>} PDF con página de información agregada
 */
async function addCoverPageWithSigners(pdfPath, signers, documentInfo) {
  try {
    console.log(`📄 Agregando página de información de firmantes a: ${path.basename(pdfPath)}`);

    // Leer el PDF original
    const existingPdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });

    // Cargar fuentes
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Constantes de página
    const width = 595.28;
    const height = 841.89;
    const margin = 60;

    // Ordenar firmantes por order_position PRIMERO para usar en marca de agua
    const sortedSigners = [...signers].sort((a, b) => a.order_position - b.order_position);

    // Crear la primera página de firmantes
    let coverPage = pdfDoc.addPage([width, height]); // A4 en puntos
    let yPosition = height - 70;

    // ========== FONDO BLANCO LIMPIO ==========
    coverPage.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(1, 1, 1), // Fondo blanco
    });

    // ========== MARCA DE AGUA DE FONDO (ESTADO GENERAL DEL DOCUMENTO) ==========
    // Determinar el estado general del documento basado en los firmantes
    let documentStatus = 'PENDIENTE';
    let allSigned = sortedSigners.length > 0 && sortedSigners.every(s => s.status === 'signed');
    let anyRejected = sortedSigners.some(s => s.status === 'rejected');

    if (anyRejected) {
      documentStatus = 'RECHAZADO';
    } else if (allSigned) {
      documentStatus = 'FIRMADO';
    }

    // Dibujar marca de agua rotada y con transparencia
    const watermarkText = documentStatus;
    const watermarkSize = 120;
    const watermarkWidth = fontBold.widthOfTextAtSize(watermarkText, watermarkSize);

    // Color de la marca de agua según estado
    let watermarkColor = rgb(0.95, 0.95, 0.95); // Gris muy claro para PENDIENTE
    if (documentStatus === 'FIRMADO') {
      watermarkColor = rgb(0.88, 0.98, 0.92); // Verde muy claro
    } else if (documentStatus === 'RECHAZADO') {
      watermarkColor = rgb(0.98, 0.88, 0.88); // Rojo muy claro
    }

    // Dibujar marca de agua centrada y rotada 45 grados
    coverPage.drawText(watermarkText, {
      x: (width - watermarkWidth * 0.7) / 2,
      y: height / 2 - 60,
      size: watermarkSize,
      font: fontBold,
      color: watermarkColor,
      rotate: { angle: -45, type: 'degrees' },
      opacity: 0.15,
    });

    // ========== TÍTULO PRINCIPAL - ESTILO ZAPSIGN ==========
    const titleText = 'Informe de Firmas';
    coverPage.drawText(titleText, {
      x: margin,
      y: yPosition,
      size: 16,
      font: fontBold,
      color: rgb(0.05, 0.05, 0.05),
    });

    yPosition -= 8;

    // Fecha y hora de actualización (formato UTC-0500)
    const generatedDate = new Date().toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const dateText = `Fechas y horas en UTC-0500 (America/Bogota)\nÚltima actualización en ${generatedDate}`;
    coverPage.drawText(dateText, {
      x: margin,
      y: yPosition,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
      lineHeight: 12,
    });

    yPosition -= 35;

    // ========== INFORMACIÓN DEL DOCUMENTO - ESTILO ZAPSIGN (SIN CAJA) ==========
    // Estado del documento
    coverPage.drawText('Estado:', {
      x: margin,
      y: yPosition,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });

    yPosition -= 16;

    let statusColor = rgb(0.5, 0.5, 0.5); // Gris para pendiente
    if (documentStatus === 'FIRMADO') {
      statusColor = rgb(0.13, 0.59, 0.25); // Verde
    } else if (documentStatus === 'RECHAZADO') {
      statusColor = rgb(0.8, 0.1, 0.1); // Rojo
    }

    coverPage.drawText(documentStatus, {
      x: margin,
      y: yPosition,
      size: 10,
      font: fontRegular,
      color: statusColor,
    });

    yPosition -= 25;

    // Documento (nombre del archivo)
    coverPage.drawText('Documento:', {
      x: margin,
      y: yPosition,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });

    yPosition -= 16;

    const docFileName = documentInfo.fileName || documentInfo.title || 'Sin nombre';
    const maxFileNameLength = 60;
    const displayFileName = docFileName.length > maxFileNameLength
      ? docFileName.substring(0, maxFileNameLength) + '...'
      : docFileName;

    coverPage.drawText(displayFileName, {
      x: margin,
      y: yPosition,
      size: 10,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });

    yPosition -= 25;

    // Fecha de creación
    coverPage.drawText('Fecha de creación:', {
      x: margin,
      y: yPosition,
      size: 9,
      font: fontBold,
      color: rgb(0.3, 0.3, 0.3),
    });

    yPosition -= 16;

    const createdDate = documentInfo.createdAt
      ? new Date(documentInfo.createdAt).toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false
        })
      : 'No disponible';

    coverPage.drawText(createdDate, {
      x: margin,
      y: yPosition,
      size: 10,
      font: fontRegular,
      color: rgb(0.15, 0.15, 0.15),
    });

    yPosition -= 25;

    // Rechazado por / Acción realizada por (si aplica)
    const rejectedSigner = sortedSigners.find(s => s.status === 'rejected');
    if (rejectedSigner) {
      coverPage.drawText('Rechazado por:', {
        x: margin,
        y: yPosition,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
      });

      yPosition -= 16;

      const rejectedByEmail = rejectedSigner.email || 'negociaciones@prexxa.com.co';
      coverPage.drawText(rejectedByEmail, {
        x: margin,
        y: yPosition,
        size: 10,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });

      yPosition -= 25;

      // Fecha de rechazo
      if (rejectedSigner.rejected_at) {
        coverPage.drawText('Fecha/hora de rechazo:', {
          x: margin,
          y: yPosition,
          size: 9,
          font: fontBold,
          color: rgb(0.3, 0.3, 0.3),
        });

        yPosition -= 16;

        const rejectedDate = new Date(rejectedSigner.rejected_at).toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });

        coverPage.drawText(rejectedDate, {
          x: margin,
          y: yPosition,
          size: 10,
          font: fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        });

        yPosition -= 25;
      }

      // Motivo del rechazo
      if (rejectedSigner.rejection_reason) {
        coverPage.drawText('Motivo:', {
          x: margin,
          y: yPosition,
          size: 9,
          font: fontBold,
          color: rgb(0.3, 0.3, 0.3),
        });

        yPosition -= 16;

        const reason = rejectedSigner.rejection_reason;
        const maxReasonLength = 80;
        const displayReason = reason.length > maxReasonLength
          ? reason.substring(0, maxReasonLength) + '...'
          : reason;

        coverPage.drawText(displayReason, {
          x: margin,
          y: yPosition,
          size: 10,
          font: fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        });

        yPosition -= 25;
      }
    }

    yPosition -= 10;

    // ========== FIRMANTES - ESTILO ZAPSIGN ==========
    // Título de la sección
    const signedCount = sortedSigners.filter(s => s.status === 'signed').length;
    const totalSigners = sortedSigners.length;

    coverPage.drawText('Firmas', {
      x: margin,
      y: yPosition,
      size: 12,
      font: fontBold,
      color: rgb(0.05, 0.05, 0.05),
    });

    // Contador de firmas (ej: "2 de 3 Firmas")
    const counterText = `${signedCount} de ${totalSigners} Firmas`;
    const counterWidth = fontRegular.widthOfTextAtSize(counterText, 9);
    coverPage.drawText(counterText, {
      x: width - margin - counterWidth,
      y: yPosition + 2,
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });

    yPosition -= 25;

    // Variable para la página actual (sortedSigners ya fue declarado arriba)
    let currentPage = coverPage;
    let signersInCurrentPage = 0; // Contador de firmantes en la página actual
    const MAX_SIGNERS_PER_PAGE = 3; // Máximo 3 firmantes por página para más espacio
    let totalSignerPages = 1; // Contador de páginas de firmantes creadas

    // Dibujar cada firmante en estilo ZapSign (limpio y minimalista)
    for (let i = 0; i < sortedSigners.length; i++) {
      const signer = sortedSigners[i];

      // Crear nueva página si ya hay 3 firmantes en la página actual
      if (signersInCurrentPage >= MAX_SIGNERS_PER_PAGE) {
        const newPage = pdfDoc.addPage([width, height]);
        currentPage = newPage;
        yPosition = height - margin;
        signersInCurrentPage = 0;
        totalSignerPages++; // Incrementar el contador de páginas

        // Aplicar fondo blanco a la nueva página
        newPage.drawRectangle({
          x: 0,
          y: 0,
          width: width,
          height: height,
          color: rgb(1, 1, 1),
        });

        // Agregar también la marca de agua a las nuevas páginas
        newPage.drawText(watermarkText, {
          x: (width - watermarkWidth * 0.7) / 2,
          y: height / 2 - 60,
          size: watermarkSize,
          font: fontBold,
          color: watermarkColor,
          rotate: { angle: -45, type: 'degrees' },
          opacity: 0.15,
        });
      }

      // Línea separadora entre firmantes (muy sutil)
      if (i > 0) {
        currentPage.drawRectangle({
          x: margin,
          y: yPosition + 5,
          width: width - (margin * 2),
          height: 0.5,
          color: rgb(0.9, 0.9, 0.9),
        });
        yPosition -= 10;
      }

      // Badge de estado inline con el nombre
      let statusText = 'Firma pendiente';
      let statusBadgeColor = rgb(0.95, 0.95, 0.95); // Gris claro

      if (signer.status === 'signed') {
        statusText = 'Firmado';
        statusBadgeColor = rgb(0.82, 0.95, 0.84); // Verde claro ZapSign
      } else if (signer.status === 'rejected') {
        statusText = 'Rechazado';
        statusBadgeColor = rgb(0.98, 0.85, 0.85); // Rojo claro
      }

      // Dibujar badge de estado (redondeado pequeño)
      const badgePadding = 8;
      const badgeTextWidth = fontBold.widthOfTextAtSize(statusText, 8);
      const badgeWidth = badgeTextWidth + (badgePadding * 2);
      const badgeHeight = 16;
      const badgeRadius = badgeHeight / 2;
      const badgeX = margin;
      const badgeY = yPosition - 2;

      // Rectángulo central del badge
      currentPage.drawRectangle({
        x: badgeX + badgeRadius,
        y: badgeY - badgeHeight / 2,
        width: badgeWidth - (badgeRadius * 2),
        height: badgeHeight,
        color: statusBadgeColor,
      });

      // Círculos de los extremos
      currentPage.drawCircle({
        x: badgeX + badgeRadius,
        y: badgeY,
        size: badgeRadius,
        color: statusBadgeColor,
      });

      currentPage.drawCircle({
        x: badgeX + badgeWidth - badgeRadius,
        y: badgeY,
        size: badgeRadius,
        color: statusBadgeColor,
      });

      // Texto del badge
      let statusTextColor = rgb(0.3, 0.3, 0.3);
      if (signer.status === 'signed') {
        statusTextColor = rgb(0.13, 0.59, 0.25);
      } else if (signer.status === 'rejected') {
        statusTextColor = rgb(0.8, 0.1, 0.1);
      }

      currentPage.drawText(statusText, {
        x: badgeX + badgePadding,
        y: badgeY - 2.5,
        size: 8,
        font: fontBold,
        color: statusTextColor,
      });

      yPosition -= 25;

      // Nombre del firmante (en mayúsculas, estilo ZapSign)
      const signerName = (signer.name || 'Sin nombre').toUpperCase();
      const maxNameLength = 50;
      const displayName = signerName.length > maxNameLength
        ? signerName.substring(0, maxNameLength) + '...'
        : signerName;

      currentPage.drawText(displayName, {
        x: margin,
        y: yPosition,
        size: 10,
        font: fontBold,
        color: rgb(0.05, 0.05, 0.05),
      });

      yPosition -= 18;

      // Fecha y hora de firma/rechazo (si existe)
      let dateTimeText = '';
      if (signer.status === 'signed' && signer.signed_at) {
        const signedDate = new Date(signer.signed_at);
        dateTimeText = `Fecha y hora de firma: ${signedDate.toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })}`;
      } else if (signer.status === 'rejected' && signer.rejected_at) {
        const rejectedDate = new Date(signer.rejected_at);
        dateTimeText = `Fecha y hora de rechazo: ${rejectedDate.toLocaleString('es-CO', {
          timeZone: 'America/Bogota',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })}`;
      }

      if (dateTimeText) {
        currentPage.drawText(dateTimeText, {
          x: margin,
          y: yPosition,
          size: 9,
          font: fontRegular,
          color: rgb(0.4, 0.4, 0.4),
        });
        yPosition -= 18;
      }

      // Puntos de autenticación (título)
      currentPage.drawText('Puntos de autenticación:', {
        x: margin,
        y: yPosition,
        size: 9,
        font: fontBold,
        color: rgb(0.3, 0.3, 0.3),
      });

      yPosition -= 16;

      // Email (único punto de autenticación que mostramos según tus instrucciones)
      const signerEmail = signer.email || 'No disponible';
      currentPage.drawText(`Correo electrónico: ${signerEmail}`, {
        x: margin,
        y: yPosition,
        size: 9,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      });

      yPosition -= 30; // Espaciado entre firmantes
      signersInCurrentPage++; // Incrementar el contador de firmantes en la página
    }

    // ========== FOOTER MINIMALISTA (SIN CAJA) ==========
    // Eliminado según diseño ZapSign - más limpio y minimalista

    // Guardar en metadatos el número de páginas de firmantes para futuras actualizaciones
    try {
      // Usar el nombre del archivo original del PDF (sin extensión) como título visible
      const fileName = documentInfo.fileName || documentInfo.title || 'Documento';
      // Remover el timestamp y número aleatorio del nombre del archivo
      // Patrón: "nombre-1762877271658-951648300.pdf" -> "nombre.pdf"
      // Busca: -[números]-[números].pdf al final del nombre
      const fileNameClean = fileName.replace(/-\d+-\d+\.pdf$/i, '.pdf');
      // Remover extensión .pdf si existe
      const fileNameWithoutExt = fileNameClean.replace(/\.pdf$/i, '');
      // Establecer el título del PDF (sin mostrar SignerPages, solo guardarlo internamente como Subject)
      pdfDoc.setTitle(fileNameWithoutExt);
      // Guardar el contador de páginas en Subject para uso interno
      pdfDoc.setSubject(`SignerPages:${totalSignerPages}`);
    } catch (err) {
      console.log('⚠️  No se pudieron guardar metadatos (no crítico)');
    }

    // Guardar el PDF modificado
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytes);

    console.log(`✅ ${totalSignerPages} página(s) de firmantes agregada(s) exitosamente`);

    return pdfBytes;
  } catch (error) {
    console.error('❌ Error al agregar página de firmantes:', error);
    throw error;
  }
}

/**
 * Actualiza las páginas de firmantes del PDF con los estados actualizados
 * Elimina TODAS las páginas de firmantes anteriores y genera nuevas
 * @param {string} pdfPath - Ruta al PDF
 * @param {Array} signers - Array de firmantes con {name, email, order_position, status}
 * @param {Object} documentInfo - Información del documento
 */
async function updateSignersPage(pdfPath, signers, documentInfo) {
  try {
    console.log(`🔄 Actualizando páginas de firmantes en: ${path.basename(pdfPath)}`);

    // Leer el PDF existente
    const existingPdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });

    let pageCount = pdfDoc.getPageCount();

    // Leer metadatos para saber cuántas páginas de firmantes hay
    // Si no existen metadatos, asumimos que hay 1 página de firmantes
    let signerPagesToRemove = 1;

    try {
      // Primero intentar leer desde Subject (nuevo método)
      const subject = pdfDoc.getSubject();
      if (subject && subject.includes('SignerPages:')) {
        const match = subject.match(/SignerPages:(\d+)/);
        if (match && match[1]) {
          signerPagesToRemove = parseInt(match[1], 10);
        }
      } else {
        // Fallback: intentar leer desde Title (método antiguo) por compatibilidad
        const metadata = pdfDoc.getTitle();
        if (metadata && metadata.includes('SignerPages:')) {
          const match = metadata.match(/SignerPages:(\d+)/);
          if (match && match[1]) {
            signerPagesToRemove = parseInt(match[1], 10);
          }
        }
      }
    } catch (err) {
      console.log('⚠️  No se pudieron leer metadatos, asumiendo 1 página de firmantes');
    }

    // Eliminar las páginas de firmantes al final del documento
    let pagesToRemove = 0;
    for (let i = 0; i < signerPagesToRemove && pageCount > 1; i++) {
      try {
        pdfDoc.removePage(pageCount - 1);
        pageCount--;
        pagesToRemove++;
      } catch (err) {
        console.log(`⚠️  No se pudo eliminar la página ${i + 1}`);
        break;
      }
    }

    if (pagesToRemove > 0) {
      console.log(`🗑️  ${pagesToRemove} página(s) de firmantes eliminada(s)`);
    }

    // Guardar el PDF sin las páginas de firmantes
    const pdfBytesWithoutSigners = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytesWithoutSigners);

    // Ahora agregar las nuevas páginas con estados actualizados
    await addCoverPageWithSigners(pdfPath, signers, documentInfo);

    console.log(`✅ Páginas de firmantes actualizadas exitosamente`);
  } catch (error) {
    console.error('❌ Error al actualizar páginas de firmantes:', error);
    throw error;
  }
}

module.exports = {
  addCoverPageWithSigners,
  updateSignersPage,
};
