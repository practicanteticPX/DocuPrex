const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs').promises;
const path = require('path');

/**
 * Genera una página de información de firmantes al final del PDF
 * Diseño moderno y limpio inspirado en la imagen de referencia
 * @param {string} pdfPath - Ruta al PDF original
 * @param {Array} signers - Array de firmantes con {name, email, order_position, status}
 * @param {Object} documentInfo - Información del documento {title, createdAt, uploadedBy}
 * @returns {Promise<Buffer>} PDF con página de información agregada
 */
async function addCoverPageWithSigners(pdfPath, signers, documentInfo) {
  try {
    console.log(`📄 Agregando página de información de firmantes a: ${path.basename(pdfPath)}`);

    // Leer el PDF original
    const existingPdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });

    // Crear una nueva página AL FINAL del documento
    const coverPage = pdfDoc.addPage([595.28, 841.89]); // A4 en puntos

    // Cargar fuentes
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const { width, height } = coverPage.getSize();
    const margin = 60;
    let yPosition = height - 70;

    // ========== FONDO GRIS CLARO PARA TODO ==========
    coverPage.drawRectangle({
      x: 0,
      y: 0,
      width: width,
      height: height,
      color: rgb(0.97, 0.97, 0.97), // Fondo gris muy claro
    });

    // ========== TÍTULO PRINCIPAL ==========
    const titleText = 'Informe de Firmas Digitales';
    const titleWidth = fontBold.widthOfTextAtSize(titleText, 22);
    coverPage.drawText(titleText, {
      x: (width - titleWidth) / 2,
      y: yPosition,
      size: 22,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });

    yPosition -= 25;

    // Fecha de generación
    const generatedDate = new Date().toLocaleString('es-ES', {
      timeZone: 'America/Bogota',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const dateText = `Generado el: ${generatedDate}`;
    const dateWidth = fontRegular.widthOfTextAtSize(dateText, 9);
    coverPage.drawText(dateText, {
      x: (width - dateWidth) / 2,
      y: yPosition,
      size: 9,
      font: fontRegular,
      color: rgb(0.55, 0.55, 0.55),
    });

    yPosition -= 40;

    // ========== INFORMACIÓN DEL DOCUMENTO (CAJA) ==========
    const boxHeight = 110;
    const boxY = yPosition - boxHeight;
    const boxWidth = width - (margin * 2);
    const boxRadius = 6;

    // Fondo de la caja blanco con bordes redondeados
    // Rectángulo principal
    coverPage.drawRectangle({
      x: margin + boxRadius,
      y: boxY,
      width: boxWidth - (boxRadius * 2),
      height: boxHeight,
      color: rgb(1, 1, 1),
    });

    // Tiras laterales para completar el ancho
    coverPage.drawRectangle({
      x: margin,
      y: boxY + boxRadius,
      width: boxWidth,
      height: boxHeight - (boxRadius * 2),
      color: rgb(1, 1, 1),
    });

    // Círculos en las esquinas para bordes redondeados
    const boxCorners = [
      { x: margin + boxRadius, y: boxY + boxRadius },
      { x: margin + boxWidth - boxRadius, y: boxY + boxRadius },
      { x: margin + boxRadius, y: boxY + boxHeight - boxRadius },
      { x: margin + boxWidth - boxRadius, y: boxY + boxHeight - boxRadius },
    ];

    boxCorners.forEach(corner => {
      coverPage.drawCircle({
        x: corner.x,
        y: corner.y,
        size: boxRadius,
        color: rgb(1, 1, 1),
      });
    });

    // Borde de la caja
    coverPage.drawRectangle({
      x: margin,
      y: boxY,
      width: boxWidth,
      height: boxHeight,
      borderColor: rgb(0.85, 0.85, 0.85),
      borderWidth: 1,
      color: rgb(1, 1, 1, 0), // Transparente
    });

    // Título de la sección
    coverPage.drawText('Información del Documento', {
      x: margin + 15,
      y: yPosition - 20,
      size: 14,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });

    yPosition -= 45;

    // Layout de 3 columnas para la información
    const col1X = margin + 15;
    const col2X = margin + 175;
    const col3X = margin + 340;

    // Columna 1: Título
    coverPage.drawText('Título', {
      x: col1X,
      y: yPosition,
      size: 9,
      font: fontRegular,
      color: rgb(0.55, 0.55, 0.55),
    });

    yPosition -= 17;

    const docTitleText = documentInfo.title || 'Sin título';
    const maxTitleLength = 20;
    const displayTitle = docTitleText.length > maxTitleLength
      ? docTitleText.substring(0, maxTitleLength) + '...'
      : docTitleText;

    coverPage.drawText(displayTitle, {
      x: col1X,
      y: yPosition,
      size: 11,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });

    // Columna 2: Creado por
    yPosition += 17;

    coverPage.drawText('Creado por', {
      x: col2X,
      y: yPosition,
      size: 9,
      font: fontRegular,
      color: rgb(0.55, 0.55, 0.55),
    });

    yPosition -= 17;

    const uploadedBy = documentInfo.uploadedBy || 'Sistema';
    const maxNameLength = 18;
    const displayUploadedBy = uploadedBy.length > maxNameLength
      ? uploadedBy.substring(0, maxNameLength) + '...'
      : uploadedBy;

    coverPage.drawText(displayUploadedBy, {
      x: col2X,
      y: yPosition,
      size: 11,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });

    // Columna 3: Fecha de Creación
    yPosition += 17;

    coverPage.drawText('Fecha de Creación', {
      x: col3X,
      y: yPosition,
      size: 9,
      font: fontRegular,
      color: rgb(0.55, 0.55, 0.55),
    });

    yPosition -= 17;

    const createdDate = documentInfo.createdAt
      ? new Date(documentInfo.createdAt).toLocaleString('es-ES', {
          timeZone: 'America/Bogota',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      : new Date().toLocaleString('es-ES', { timeZone: 'America/Bogota' });

    coverPage.drawText(createdDate, {
      x: col3X,
      y: yPosition,
      size: 11,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });

    yPosition = boxY - 35;

    // ========== FIRMANTES ASIGNADOS ==========
    coverPage.drawText('Firmantes Asignados', {
      x: margin + 15,
      y: yPosition,
      size: 14,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.12),
    });

    yPosition -= 30;

    // Ordenar firmantes por order_position
    const sortedSigners = [...signers].sort((a, b) => a.order_position - b.order_position);

    // Dibujar cada firmante en cajas individuales
    for (let i = 0; i < sortedSigners.length; i++) {
      const signer = sortedSigners[i];

      // Si no hay espacio suficiente, agregar nueva página
      if (yPosition < 130) {
        const newPage = pdfDoc.addPage([595.28, 841.89]);
        yPosition = newPage.getSize().height - margin;

        // Aplicar fondo gris a la nueva página
        newPage.drawRectangle({
          x: 0,
          y: 0,
          width: width,
          height: height,
          color: rgb(0.97, 0.97, 0.97),
        });
      }

      const cardHeight = 65;
      const cardY = yPosition - cardHeight;
      const cardWidth = width - (margin * 2);
      const cardRadius = 6;

      // Fondo de la tarjeta del firmante con bordes redondeados
      // Rectángulo principal horizontal
      coverPage.drawRectangle({
        x: margin + cardRadius,
        y: cardY,
        width: cardWidth - (cardRadius * 2),
        height: cardHeight,
        color: rgb(1, 1, 1),
      });

      // Rectángulo principal vertical
      coverPage.drawRectangle({
        x: margin,
        y: cardY + cardRadius,
        width: cardWidth,
        height: cardHeight - (cardRadius * 2),
        color: rgb(1, 1, 1),
      });

      // Círculos en las esquinas para bordes redondeados
      const cardCorners = [
        { x: margin + cardRadius, y: cardY + cardRadius },
        { x: margin + cardWidth - cardRadius, y: cardY + cardRadius },
        { x: margin + cardRadius, y: cardY + cardHeight - cardRadius },
        { x: margin + cardWidth - cardRadius, y: cardY + cardHeight - cardRadius },
      ];

      cardCorners.forEach(corner => {
        coverPage.drawCircle({
          x: corner.x,
          y: corner.y,
          size: cardRadius,
          color: rgb(1, 1, 1),
        });
      });

      // Borde de la tarjeta
      coverPage.drawRectangle({
        x: margin,
        y: cardY,
        width: cardWidth,
        height: cardHeight,
        borderColor: rgb(0.88, 0.88, 0.88),
        borderWidth: 1,
        color: rgb(1, 1, 1, 0), // Transparente
      });

      // Avatar circular con número
      const avatarSize = 40;
      const avatarX = margin + 28;
      const avatarY = yPosition - (cardHeight / 2);

      // Círculo de fondo del avatar
      coverPage.drawCircle({
        x: avatarX,
        y: avatarY,
        size: avatarSize / 2,
        color: rgb(0.31, 0.47, 0.96), // Azul #4F78F6
      });

      // Número del firmante
      const orderNum = signer.order_position.toString();
      const numWidth = fontBold.widthOfTextAtSize(orderNum, 16);
      coverPage.drawText(orderNum, {
        x: avatarX - (numWidth / 2),
        y: avatarY - 6,
        size: 16,
        font: fontBold,
        color: rgb(1, 1, 1),
      });

      // Información del firmante (a la derecha del avatar)
      const infoX = avatarX + 35;
      const infoY = yPosition - 23;

      // Nombre del firmante
      const signerName = signer.name || 'Sin nombre';
      const maxNameLength = 30;
      const displayName = signerName.length > maxNameLength
        ? signerName.substring(0, maxNameLength) + '...'
        : signerName;

      coverPage.drawText(displayName, {
        x: infoX,
        y: infoY,
        size: 11,
        font: fontBold,
        color: rgb(0.12, 0.12, 0.12),
      });

      // Email del firmante
      const signerEmail = signer.email || '';
      const maxEmailLength = 35;
      const displayEmail = signerEmail.length > maxEmailLength
        ? signerEmail.substring(0, maxEmailLength) + '...'
        : signerEmail;

      coverPage.drawText(displayEmail, {
        x: infoX,
        y: infoY - 16,
        size: 9,
        font: fontRegular,
        color: rgb(0.55, 0.55, 0.55),
      });

      // Badge de estado (a la derecha)
      let statusText = 'PENDIENTE';
      let statusBgColor = rgb(1, 0.97, 0.86); // Amarillo claro más suave #FFF7DC
      let statusTextColor = rgb(0.68, 0.49, 0.02); // Amarillo oscuro más profesional
      let showCheckCircle = false;
      let showXCircle = false;
      let showClockCircle = true;
      let dateTimeText = '';

      if (signer.status === 'signed') {
        statusText = 'FIRMADO';
        statusBgColor = rgb(0.83, 0.98, 0.89); // Verde claro más suave #D4FADE
        statusTextColor = rgb(0.04, 0.58, 0.31); // Verde oscuro más profesional
        showCheckCircle = true;
        showClockCircle = false;

        // Fecha y hora de firma
        if (signer.signed_at) {
          const signedDate = new Date(signer.signed_at);
          dateTimeText = signedDate.toLocaleString('es-ES', {
            timeZone: 'America/Bogota',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
        }
      } else if (signer.status === 'rejected') {
        statusText = 'RECHAZADO';
        statusBgColor = rgb(1, 0.91, 0.91); // Rojo claro más suave #FFE8E8
        statusTextColor = rgb(0.78, 0.09, 0.09); // Rojo oscuro más profesional
        showXCircle = true;
        showClockCircle = false;

        // Fecha y hora de rechazo
        if (signer.rejected_at) {
          const rejectedDate = new Date(signer.rejected_at);
          dateTimeText = rejectedDate.toLocaleString('es-ES', {
            timeZone: 'America/Bogota',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          });
        }
      }

      // Badge redondeado para el estado (pill shape)
      const badgeX = width - margin - 105;
      const badgeY = yPosition - 23;
      const badgeWidth = 90;
      const badgeHeight = 22;
      const badgeRadius = badgeHeight / 2; // Radio = mitad de la altura para forma de píldora

      // Rectángulo central del badge
      coverPage.drawRectangle({
        x: badgeX + badgeRadius,
        y: badgeY - badgeHeight / 2,
        width: badgeWidth - (badgeRadius * 2),
        height: badgeHeight,
        color: statusBgColor,
      });

      // Círculo izquierdo del badge (forma de píldora)
      coverPage.drawCircle({
        x: badgeX + badgeRadius,
        y: badgeY,
        size: badgeRadius,
        color: statusBgColor,
      });

      // Círculo derecho del badge (forma de píldora)
      coverPage.drawCircle({
        x: badgeX + badgeWidth - badgeRadius,
        y: badgeY,
        size: badgeRadius,
        color: statusBgColor,
      });

      // Dibujar icono a la izquierda del texto
      const iconX = badgeX + 13;
      const iconY = badgeY;

      if (showCheckCircle) {
        // Círculo verde con check
        coverPage.drawCircle({
          x: iconX,
          y: iconY,
          size: 5,
          borderColor: statusTextColor,
          borderWidth: 1.6,
        });
        // Check mark
        coverPage.drawLine({
          start: { x: iconX - 2, y: iconY - 0.2 },
          end: { x: iconX - 0.7, y: iconY - 1.8 },
          thickness: 1.6,
          color: statusTextColor,
        });
        coverPage.drawLine({
          start: { x: iconX - 0.7, y: iconY - 1.8 },
          end: { x: iconX + 2.3, y: iconY + 2 },
          thickness: 1.6,
          color: statusTextColor,
        });
      } else if (showXCircle) {
        // Círculo rojo con X
        coverPage.drawCircle({
          x: iconX,
          y: iconY,
          size: 5,
          borderColor: statusTextColor,
          borderWidth: 1.6,
        });
        // X
        coverPage.drawLine({
          start: { x: iconX - 2.5, y: iconY - 2.5 },
          end: { x: iconX + 2.5, y: iconY + 2.5 },
          thickness: 1.6,
          color: statusTextColor,
        });
        coverPage.drawLine({
          start: { x: iconX + 2.5, y: iconY - 2.5 },
          end: { x: iconX - 2.5, y: iconY + 2.5 },
          thickness: 1.6,
          color: statusTextColor,
        });
      } else if (showClockCircle) {
        // Círculo amarillo con reloj
        coverPage.drawCircle({
          x: iconX,
          y: iconY,
          size: 5,
          borderColor: statusTextColor,
          borderWidth: 1.6,
        });
        // Manecillas del reloj
        coverPage.drawLine({
          start: { x: iconX, y: iconY },
          end: { x: iconX, y: iconY + 3 },
          thickness: 1.3,
          color: statusTextColor,
        });
        coverPage.drawLine({
          start: { x: iconX, y: iconY },
          end: { x: iconX + 2.1, y: iconY + 1.1 },
          thickness: 1.3,
          color: statusTextColor,
        });
      }

      // Texto del estado (a la derecha del icono)
      const textX = iconX + 12;
      coverPage.drawText(statusText, {
        x: textX,
        y: badgeY - 3,
        size: 9,
        font: fontBold,
        color: statusTextColor,
      });

      // Fecha/hora debajo del badge (alineado a la derecha)
      if (dateTimeText) {
        const dateWidth = fontRegular.widthOfTextAtSize(dateTimeText, 7.5);
        coverPage.drawText(dateTimeText, {
          x: badgeX + badgeWidth - dateWidth,
          y: badgeY - 20,
          size: 7.5,
          font: fontRegular,
          color: rgb(0.55, 0.55, 0.55),
        });
      }

      yPosition -= cardHeight + 12; // Espaciado entre tarjetas
    }

    // ========== NOTA IMPORTANTE (FOOTER) ==========
    const footerY = 80;
    const footerHeight = 55;
    const footerWidth = width - (margin * 2);
    const footerRadius = 6;

    // Fondo de la nota con bordes redondeados
    // Rectángulo principal horizontal
    coverPage.drawRectangle({
      x: margin + footerRadius,
      y: footerY,
      width: footerWidth - (footerRadius * 2),
      height: footerHeight,
      color: rgb(1, 1, 1),
    });

    // Rectángulo principal vertical
    coverPage.drawRectangle({
      x: margin,
      y: footerY + footerRadius,
      width: footerWidth,
      height: footerHeight - (footerRadius * 2),
      color: rgb(1, 1, 1),
    });

    // Círculos en las esquinas para bordes redondeados
    const footerCorners = [
      { x: margin + footerRadius, y: footerY + footerRadius },
      { x: margin + footerWidth - footerRadius, y: footerY + footerRadius },
      { x: margin + footerRadius, y: footerY + footerHeight - footerRadius },
      { x: margin + footerWidth - footerRadius, y: footerY + footerHeight - footerRadius },
    ];

    footerCorners.forEach(corner => {
      coverPage.drawCircle({
        x: corner.x,
        y: corner.y,
        size: footerRadius,
        color: rgb(1, 1, 1),
      });
    });

    // Borde del footer
    coverPage.drawRectangle({
      x: margin,
      y: footerY,
      width: footerWidth,
      height: footerHeight,
      borderColor: rgb(0.88, 0.88, 0.88),
      borderWidth: 1,
      color: rgb(1, 1, 1, 0), // Transparente
    });

    // Icono de información (círculo gris)
    const iconX = margin + 18;
    const iconY = footerY + footerHeight / 2;

    coverPage.drawCircle({
      x: iconX,
      y: iconY,
      size: 11,
      color: rgb(0.68, 0.68, 0.68),
    });

    // Letra 'i' en el círculo
    const iWidth = fontBold.widthOfTextAtSize('i', 13);
    coverPage.drawText('i', {
      x: iconX - (iWidth / 2),
      y: iconY - 4.5,
      size: 13,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    // Texto de la nota
    const textX = iconX + 23;

    coverPage.drawText('IMPORTANTE: Este documento requiere firma secuencial.', {
      x: textX,
      y: iconY + 7,
      size: 10,
      font: fontBold,
      color: rgb(0.15, 0.15, 0.15),
    });

    coverPage.drawText('Cada firmante debe esperar a que el anterior complete su firma.', {
      x: textX,
      y: iconY - 7,
      size: 9,
      font: fontRegular,
      color: rgb(0.55, 0.55, 0.55),
    });

    // Guardar el PDF modificado
    const pdfBytes = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytes);

    console.log(`✅ Página de firmantes agregada exitosamente`);

    return pdfBytes;
  } catch (error) {
    console.error('❌ Error al agregar página de firmantes:', error);
    throw error;
  }
}

/**
 * Actualiza la última página del PDF con los estados actualizados de firmantes
 * @param {string} pdfPath - Ruta al PDF
 * @param {Array} signers - Array de firmantes con {name, email, order_position, status}
 * @param {Object} documentInfo - Información del documento
 */
async function updateSignersPage(pdfPath, signers, documentInfo) {
  try {
    console.log(`🔄 Actualizando página de firmantes en: ${path.basename(pdfPath)}`);

    // Leer el PDF existente
    const existingPdfBytes = await fs.readFile(pdfPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes, { ignoreEncryption: true });

    const pageCount = pdfDoc.getPageCount();

    // Eliminar la última página (la hoja de firmantes anterior)
    if (pageCount > 1) {
      pdfDoc.removePage(pageCount - 1);
      console.log(`🗑️  Página anterior eliminada`);
    }

    // Guardar el PDF sin la última página
    const pdfBytesWithoutLast = await pdfDoc.save();
    await fs.writeFile(pdfPath, pdfBytesWithoutLast);

    // Ahora agregar la nueva página con estados actualizados
    await addCoverPageWithSigners(pdfPath, signers, documentInfo);

    console.log(`✅ Página de firmantes actualizada exitosamente`);
  } catch (error) {
    console.error('❌ Error al actualizar página de firmantes:', error);
    throw error;
  }
}

module.exports = {
  addCoverPageWithSigners,
  updateSignersPage,
};
