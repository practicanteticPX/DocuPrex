const { query } = require('../database/db');
const { notificarAsignacionFirmante } = require('./emailService');

/**
 * Envía recordatorios a firmantes que tienen firmas pendientes por más de 2 días
 * Solo envía recordatorios a firmantes que están en su turno de firmar
 */
async function sendPendingSignatureReminders() {
  try {
    console.log('📧 Verificando firmas pendientes para enviar recordatorios...');

    // Buscar todas las firmas pendientes con más de 2 días de antigüedad
    // Solo incluir firmas donde el usuario esté habilitado para firmar (es su turno)
    const pendingSignaturesResult = await query(
      `SELECT
        s.id as signature_id,
        s.document_id,
        s.signer_id,
        s.created_at,
        s.reminder_sent_at,
        u.name as signer_name,
        u.email as signer_email,
        u.email_notifications,
        d.title as document_title,
        d.uploaded_by,
        uploader.name as uploader_name,
        dt.code as document_type_code,
        -- Verificar si es el turno del firmante (no hay firmas pendientes con orderPosition menor)
        CASE
          WHEN NOT EXISTS (
            SELECT 1 FROM document_signers ds2
            JOIN signatures s2 ON ds2.user_id = s2.signer_id AND ds2.document_id = s2.document_id
            WHERE ds2.document_id = s.document_id
            AND s2.status = 'pending'
            AND ds2.order_position < (
              SELECT order_position FROM document_signers
              WHERE document_id = s.document_id AND user_id = s.signer_id
            )
          ) THEN true
          ELSE false
        END as is_current_turn
      FROM signatures s
      JOIN users u ON s.signer_id = u.id
      JOIN documents d ON s.document_id = d.id
      JOIN users uploader ON d.uploaded_by = uploader.id
      LEFT JOIN document_types dt ON d.document_type_id = dt.id
      WHERE s.status = 'pending'
        AND d.status = 'pending'
        AND s.created_at < NOW() - INTERVAL '2 days'
        AND u.email_notifications = true
        AND u.is_active = true
        -- Solo enviar recordatorio si no se ha enviado nunca O si el último fue hace más de 2 días
        AND (
          s.reminder_sent_at IS NULL
          OR s.reminder_sent_at < NOW() - INTERVAL '2 days'
        )
      ORDER BY s.created_at ASC`,
      []
    );

    const pendingSignatures = pendingSignaturesResult.rows;

    if (pendingSignatures.length === 0) {
      console.log('✅ No hay firmas pendientes que requieran recordatorio');
      return { sent: 0, failed: 0 };
    }

    console.log(`📬 Encontradas ${pendingSignatures.length} firmas pendientes que requieren recordatorio`);

    let sentCount = 0;
    let failedCount = 0;

    // Enviar recordatorios
    for (const signature of pendingSignatures) {
      // Solo enviar si es el turno actual del firmante
      if (!signature.is_current_turn) {
        console.log(`⏭️  Saltando recordatorio para ${signature.signer_name} - no es su turno aún`);
        continue;
      }

      try {
        // Calcular días desde la asignación
        const daysSinceAssignment = Math.floor(
          (new Date() - new Date(signature.created_at)) / (1000 * 60 * 60 * 24)
        );

        console.log(`📤 Enviando recordatorio a ${signature.signer_name} (${signature.signer_email})`);
        console.log(`   Documento: "${signature.document_title}"`);
        console.log(`   Días pendientes: ${daysSinceAssignment}`);

        // Enviar el mismo correo que se envía en la asignación inicial
        const result = await notificarAsignacionFirmante({
          email: signature.signer_email,
          nombreFirmante: signature.signer_name,
          nombreDocumento: signature.document_title,
          documentoId: signature.document_id,
          creadorDocumento: signature.uploader_name,
          tipoDocumento: signature.document_type_code === 'FV' ? 'factura' : signature.document_type_code === 'SA' ? 'anticipo' : 'documento'
        });

        if (result.success) {
          // Actualizar el timestamp del último recordatorio enviado
          await query(
            `UPDATE signatures
             SET reminder_sent_at = NOW()
             WHERE id = $1`,
            [signature.signature_id]
          );

          sentCount++;
          console.log(`✅ Recordatorio enviado exitosamente a ${signature.signer_email}`);
        } else {
          failedCount++;
          console.error(`❌ Error al enviar recordatorio a ${signature.signer_email}:`, result.error);
        }
      } catch (error) {
        failedCount++;
        console.error(`❌ Error al procesar recordatorio para ${signature.signer_email}:`, error.message);
      }
    }

    console.log(`\n📊 Resumen de recordatorios:`);
    console.log(`   ✅ Enviados: ${sentCount}`);
    console.log(`   ❌ Fallidos: ${failedCount}`);
    console.log(`   ⏭️  Saltados (no es su turno): ${pendingSignatures.length - sentCount - failedCount}`);

    return { sent: sentCount, failed: failedCount };
  } catch (error) {
    console.error('❌ Error general al enviar recordatorios:', error);
    throw error;
  }
}

/**
 * Inicia el servicio de recordatorios automáticos
 * Ejecuta la verificación cada 24 horas (a las 9:00 AM)
 */
function startReminderService() {
  // Calcular milisegundos hasta las 9:00 AM del próximo día
  const now = new Date();
  const nextRun = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + (now.getHours() >= 9 ? 1 : 0), // Si ya pasaron las 9 AM, programar para mañana
    9, // 9:00 AM
    0, // 0 minutos
    0 // 0 segundos
  );

  const msUntilNextRun = nextRun.getTime() - now.getTime();

  console.log(`⏰ Próximo envío de recordatorios programado para: ${nextRun.toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`);

  // Programar la primera ejecución
  setTimeout(() => {
    // Ejecutar inmediatamente
    sendPendingSignatureReminders().catch(err => {
      console.error('Error al ejecutar recordatorios programados:', err);
    });

    // Luego ejecutar cada 24 horas
    setInterval(() => {
      sendPendingSignatureReminders().catch(err => {
        console.error('Error al ejecutar recordatorios programados:', err);
      });
    }, 24 * 60 * 60 * 1000); // 24 horas
  }, msUntilNextRun);
}

module.exports = {
  sendPendingSignatureReminders,
  startReminderService
};
