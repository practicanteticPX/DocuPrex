const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs').promises;
const { query, pool } = require('../database/db');
const { queryFacturas } = require('../database/facturas-db');
const { authenticateUser, getAllUsers } = require('../services/ldap');
const { addCoverPageWithSigners, updateSignersPage } = require('../utils/pdfCoverPage');
const {
  sendEmail,
  buildDocuPrexEmailTemplate,
  notificarAsignacionFirmante,
  notificarDocumentoFirmadoCompleto,
  notificarDocumentoRechazado
} = require('../services/emailService');
const pdfLogger = require('../utils/pdfLogger');
const { generateFacturaTemplatePDF } = require('../utils/pdfFacturaTemplate');
const { mergePDFs, cleanupTempFiles } = require('../utils/pdfMerger');
const { addStampToPdf } = require('../utils/pdfStamp');
const serverConfig = require('../config/server');
const { moveToCausado } = require('../services/facturaFileService');
const websocketService = require('../services/websocket');
const { createSession, validateSession, closeSession } = require('../utils/sessionManager');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-secreto-super-seguro-cambiar-en-produccion';
let signaturesHasConsecutivoColumn = null;
let signaturesHasRealSignerNameColumn = null;
let signaturesHasDocumentSignerIdColumn = null;
let negotiationSignersTableExists = null;
let availableSignersLastSyncAt = 0;
let availableSignersSyncPromise = null;
const AVAILABLE_SIGNERS_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const CAUSACION_TEST_USER_EMAILS = new Set([
  'j.bustamante@prexxa.com.co',
  'practicantetic@prexxa.com.co'
]);

const normalizeTestText = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLowerCase();

const isCausacionTestUser = (user) => {
  if (!user) return false;

  const email = normalizeTestText(user.email);
  const username = normalizeTestText(user.username);
  const name = normalizeTestText(user.name);

  return CAUSACION_TEST_USER_EMAILS.has(email)
    || username === 'j.bustamante'
    || name === 'jesus bustamante';
};

const isCausacionTestDocument = (doc) => {
  if (!doc || doc.document_type_code !== 'FV') return false;

  const testText = [
    doc.title,
    doc.file_name,
    doc.description,
    doc.metadata
  ].map(normalizeTestText).join(' ');

  return testText.includes('prueba') || testText.includes('test');
};

async function checkSignaturesHasConsecutivoColumn() {
  if (signaturesHasConsecutivoColumn !== null) {
    return signaturesHasConsecutivoColumn;
  }

  try {
    const result = await query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'signatures'
         AND column_name = 'consecutivo'
       LIMIT 1`
    );

    signaturesHasConsecutivoColumn = result.rows.length > 0;
  } catch (error) {
    console.error('Error verificando columna signatures.consecutivo:', error);
    signaturesHasConsecutivoColumn = false;
  }

  return signaturesHasConsecutivoColumn;
}

async function checkSignaturesHasRealSignerNameColumn() {
  if (signaturesHasRealSignerNameColumn !== null) {
    return signaturesHasRealSignerNameColumn;
  }

  try {
    const result = await query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'signatures'
         AND column_name = 'real_signer_name'
       LIMIT 1`
    );

    signaturesHasRealSignerNameColumn = result.rows.length > 0;
  } catch (error) {
    console.error('Error verificando columna signatures.real_signer_name:', error);
    signaturesHasRealSignerNameColumn = false;
  }

  return signaturesHasRealSignerNameColumn;
}

async function checkSignaturesHasDocumentSignerIdColumn() {
  if (signaturesHasDocumentSignerIdColumn !== null) {
    return signaturesHasDocumentSignerIdColumn;
  }

  try {
    const result = await query(
      `SELECT 1
       FROM information_schema.columns
       WHERE table_name = 'signatures'
         AND column_name = 'document_signer_id'
       LIMIT 1`
    );

    signaturesHasDocumentSignerIdColumn = result.rows.length > 0;
  } catch (error) {
    console.error('Error verificando columna signatures.document_signer_id:', error);
    signaturesHasDocumentSignerIdColumn = false;
  }

  return signaturesHasDocumentSignerIdColumn;
}

/**
 * Returns a strict document_signer_id constraint only when the column exists, empty string otherwise.
 * This prevents personal signatures from being counted as causacion group signatures.
 */
async function getCausacionSignerIdConstraint(sigAlias = 's', dsAlias = 'ds') {
  const hasColumn = await checkSignaturesHasDocumentSignerIdColumn();
  return hasColumn
    ? ` AND ${sigAlias}.document_signer_id = ${dsAlias}.id`
    : '';
}

async function getSignatureJoinCondition(signatureAlias = 's', signerAlias = 'ds') {
  const hasDocumentSignerIdColumn = await checkSignaturesHasDocumentSignerIdColumn();

  if (!hasDocumentSignerIdColumn) {
    return `${signatureAlias}.document_id = ${signerAlias}.document_id AND ${signatureAlias}.signer_id = ${signerAlias}.user_id`;
  }

  return `(
    ${signatureAlias}.document_signer_id = ${signerAlias}.id
    OR (
      ${signatureAlias}.document_signer_id IS NULL
      AND ${signatureAlias}.document_id = ${signerAlias}.document_id
      AND ${signatureAlias}.signer_id = ${signerAlias}.user_id
    )
  )`;
}

async function backfillSignatureDocumentSignerIds(dbClient, documentId, signerId) {
  const hasDocumentSignerIdColumn = await checkSignaturesHasDocumentSignerIdColumn();
  if (!hasDocumentSignerIdColumn) {
    return;
  }

  const [signersResult, signaturesResult] = await Promise.all([
    dbClient(
      `SELECT id
       FROM document_signers
       WHERE document_id = $1 AND user_id = $2
       ORDER BY order_position ASC, id ASC`,
      [documentId, signerId]
    ),
    dbClient(
      `SELECT id, document_signer_id
       FROM signatures
       WHERE document_id = $1 AND signer_id = $2
       ORDER BY created_at ASC, id ASC`,
      [documentId, signerId]
    )
  ]);

  if (signersResult.rows.length === 0 || signaturesResult.rows.length === 0) {
    return;
  }

  const signerIdsInOrder = signersResult.rows.map(row => row.id);
  const usedSignerIds = new Set(signaturesResult.rows.map(row => row.document_signer_id).filter(Boolean));

  for (const signatureRow of signaturesResult.rows) {
    if (signatureRow.document_signer_id) {
      continue;
    }

    const nextSignerId = signerIdsInOrder.find(id => !usedSignerIds.has(id));
    if (!nextSignerId) {
      break;
    }

    await dbClient(
      `UPDATE signatures
       SET document_signer_id = $1
       WHERE id = $2`,
      [nextSignerId, signatureRow.id]
    );

    usedSignerIds.add(nextSignerId);
  }
}

function isNegociacionesSharedUser(user) {
  if (!user) return false;

  const normalizedName = (user.name || '').trim().toLowerCase();
  const normalizedEmail = (user.email || '').trim().toLowerCase();

  return normalizedName === 'negociaciones'
    || normalizedEmail === 'negociaciones@prexxa.com.co'
    || normalizedEmail === 'negociaciones@prexxa.com';
}

function normalizeForRoleMatch(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizePersonNameForMatch(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getRoleListFromSignerRow(row = {}) {
  if (Array.isArray(row.role_names) && row.role_names.length > 0) {
    return row.role_names.filter(Boolean);
  }

  return [row.role_name].filter(Boolean);
}

function hasRoleContaining(row, roleKey) {
  const normalizedRoleKey = normalizeForRoleMatch(roleKey);
  return getRoleListFromSignerRow(row).some(role => normalizeForRoleMatch(role).includes(normalizedRoleKey));
}

async function getNegociacionesSharedUser() {
  const result = await query(
    `SELECT id, name, email
     FROM users
     WHERE LOWER(TRIM(name)) = 'negociaciones'
        OR LOWER(TRIM(email)) IN ('negociaciones@prexxa.com.co', 'negociaciones@prexxa.com')
     ORDER BY id ASC
     LIMIT 1`
  );

  return result.rows[0] || null;
}

async function userBelongsToNegotiationSigners(user) {
  if (!user?.name) {
    return false;
  }

  const hasNegotiationSignersTable = await checkNegotiationSignersTableExists();
  if (!hasNegotiationSignersTable) {
    return false;
  }

  const normalizedUserName = normalizePersonNameForMatch(user.name);
  const result = await query(
    `SELECT name
     FROM negotiation_signers
     WHERE active = true`
  );

  return result.rows.some(row => normalizePersonNameForMatch(row.name) === normalizedUserName);
}

async function ensurePayableInvoicesTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS payable_invoices (
      id SERIAL PRIMARY KEY,
      document_id UUID NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      paid_at TIMESTAMP,
      paid_by UUID REFERENCES users(id) ON DELETE SET NULL,
      creator_notified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    ALTER TABLE payable_invoices
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  `);

  await query(`
    ALTER TABLE payable_invoices
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP
  `);

  await query(`
    ALTER TABLE payable_invoices
    ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES users(id) ON DELETE SET NULL
  `);

  await query(`
    ALTER TABLE payable_invoices
    ADD COLUMN IF NOT EXISTS creator_notified_at TIMESTAMP
  `);

  await query(`
    ALTER TABLE payable_invoices
    DROP CONSTRAINT IF EXISTS payable_invoices_document_id_key
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payable_invoices_document_user
    ON payable_invoices(document_id, user_id)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_payable_invoices_user_id
    ON payable_invoices(user_id)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_payable_invoices_created_at
    ON payable_invoices(created_at DESC)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_payable_invoices_payment_status
    ON payable_invoices(payment_status)
  `);
}

async function ensureTreasuryAdvancePaymentsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS treasury_advance_payments (
      id SERIAL PRIMARY KEY,
      document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      paid_at TIMESTAMP,
      paid_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    ALTER TABLE treasury_advance_payments
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending'
  `);

  await query(`
    ALTER TABLE treasury_advance_payments
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP
  `);

  await query(`
    ALTER TABLE treasury_advance_payments
    ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES users(id) ON DELETE SET NULL
  `);

  await query(`
    ALTER TABLE treasury_advance_payments
    ADD COLUMN IF NOT EXISTS creator_notified_at TIMESTAMP
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_treasury_advance_payments_document_user
    ON treasury_advance_payments(document_id, user_id)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_treasury_advance_payments_user_id
    ON treasury_advance_payments(user_id)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_treasury_advance_payments_status
    ON treasury_advance_payments(payment_status)
  `);
}

async function getMonicaBustamanteUser() {
  const result = await query(
    `SELECT id, name, email
     FROM users
     WHERE LOWER(TRIM(email)) = 'm.bustamante@prexxa.com.co'
        OR LOWER(TRIM(name)) = 'monica bustamante'
     ORDER BY CASE WHEN LOWER(TRIM(email)) = 'm.bustamante@prexxa.com.co' THEN 0 ELSE 1 END
     LIMIT 1`
  );

  return result.rows[0] || null;
}

async function getPayableInvoiceUsers() {
  const result = await query(
    `SELECT id, name, email
     FROM users
     WHERE LOWER(TRIM(email)) IN ('m.bustamante@prexxa.com.co', 'practicantetic@prexxa.com.co', 'j.bustamante@prexxa.com.co')
        OR LOWER(TRIM(name)) IN ('monica bustamante', 'jesus bustamante', 'jesús bustamante')
     ORDER BY
       CASE
         WHEN LOWER(TRIM(email)) = 'm.bustamante@prexxa.com.co' THEN 0
         WHEN LOWER(TRIM(name)) = 'monica bustamante' THEN 1
         WHEN LOWER(TRIM(email)) IN ('practicantetic@prexxa.com.co', 'j.bustamante@prexxa.com.co') THEN 2
         ELSE 3
       END`
  );

  const seen = new Set();
  return result.rows.filter(payableUser => {
    const id = String(payableUser.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function isPayableInvoiceUser(userId) {
  const payableUsers = await getPayableInvoiceUsers();
  return payableUsers.some(payableUser => String(payableUser.id) === String(userId));
}

async function notifyTreasuryAdvancePaidCreator({ documentId, actorUserId }) {
  const docResult = await query(
    `SELECT
       d.id,
       d.title,
       d.uploaded_by,
       creator.name as creator_name,
       creator.email as creator_email,
       creator.email_notifications,
       actor.name as actor_name
     FROM documents d
     JOIN users creator ON creator.id = d.uploaded_by
     LEFT JOIN users actor ON actor.id = $2::uuid
     WHERE d.id = $1`,
    [documentId, actorUserId]
  );

  const doc = docResult.rows[0];
  if (!doc?.uploaded_by) {
    return false;
  }

  if (String(doc.uploaded_by) === String(actorUserId) && !isCausacionTestUser({
    id: actorUserId,
    name: doc.creator_name,
    email: doc.creator_email
  })) {
    return false;
  }

  const notificationResult = await query(
    `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
     SELECT $1::uuid, 'treasury_advance_paid', $2::uuid, $3::uuid, $4::varchar
     WHERE NOT EXISTS (
       SELECT 1 FROM notifications
       WHERE user_id = $1::uuid
         AND type = 'treasury_advance_paid'
         AND document_id = $2::uuid
     )
     RETURNING id`,
    [doc.uploaded_by, documentId, actorUserId, doc.title]
  );

  if (notificationResult.rows.length > 0) {
    websocketService.emitNotificationCreated(doc.uploaded_by, {
      id: notificationResult.rows[0].id,
      type: 'treasury_advance_paid',
      document_id: documentId,
      actor_id: actorUserId,
      document_title: doc.title
    });
  }

  if (!doc.email_notifications) {
    return;
  }

  const documentoUrl = `${serverConfig.frontendUrl}/documento/${documentId}`;
  await sendEmail({
    to: doc.creator_email,
    subject: 'Anticipo pagado',
    html: buildDocuPrexEmailTemplate({
      title: 'Anticipo pagado',
      message: `El anticipo "<span style="font-weight:500;color:#374151;">${doc.title}</span>" fue marcado como pagado por ${doc.actor_name || 'Tesorería'}.`,
      buttonUrl: documentoUrl,
      buttonText: 'Ver Documento'
    }),
    text: `Hola ${doc.creator_name || ''},\n\nEl anticipo "${doc.title}" fue marcado como pagado por ${doc.actor_name || 'Tesorería'}.\n\nVer documento: ${documentoUrl}\n\nEste es un correo automático, por favor no responder.`
  });
}

async function notifyPayableInvoicePaidCreator({ documentId, actorUserId }) {
  const docResult = await query(
    `SELECT
       d.id,
       d.title,
       d.uploaded_by,
       creator.name as creator_name,
       creator.email as creator_email,
       creator.email_notifications,
       actor.name as actor_name
     FROM documents d
     JOIN users creator ON creator.id = d.uploaded_by
     LEFT JOIN users actor ON actor.id = $2::uuid
     WHERE d.id = $1`,
    [documentId, actorUserId]
  );

  const doc = docResult.rows[0];
  if (!doc?.uploaded_by) {
    return false;
  }

  if (String(doc.uploaded_by) === String(actorUserId) && !isCausacionTestUser({
    id: actorUserId,
    name: doc.creator_name,
    email: doc.creator_email
  })) {
    return false;
  }

  const notificationResult = await query(
    `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
     SELECT $1::uuid, 'payable_invoice_paid', $2::uuid, $3::uuid, $4::varchar
     WHERE NOT EXISTS (
       SELECT 1 FROM notifications
       WHERE user_id = $1::uuid
         AND type = 'payable_invoice_paid'
         AND document_id = $2::uuid
     )
     RETURNING id`,
    [doc.uploaded_by, documentId, actorUserId, doc.title]
  );

  if (notificationResult.rows.length === 0) {
    return false;
  }

  websocketService.emitNotificationCreated(doc.uploaded_by, {
    id: notificationResult.rows[0].id,
    type: 'payable_invoice_paid',
    document_id: documentId,
    actor_id: actorUserId,
    document_title: doc.title
  });

  if (!doc.email_notifications) {
    return true;
  }

  const documentoUrl = `${serverConfig.frontendUrl}/documento/${documentId}`;
  await sendEmail({
    to: doc.creator_email,
    subject: 'Factura pagada',
    html: buildDocuPrexEmailTemplate({
      title: 'Factura pagada',
      message: `La factura "<span style="font-weight:500;color:#374151;">${doc.title}</span>" fue marcada como pagada por ${doc.actor_name || 'Tesorer?a'}.`,
      buttonUrl: documentoUrl,
      buttonText: 'Ver Documento'
    }),
    text: `Hola ${doc.creator_name || ''},\n\nLa factura "${doc.title}" fue marcada como Pagada por ${doc.actor_name || 'Tesorer?a'}.\n\nVer documento: ${documentoUrl}\n\nEste es un correo autom?tico, por favor no responder.`
  });

  return true;
}

async function assignCompletedInvoiceToPayables(documentId, actorUserId = null) {
  await ensurePayableInvoicesTable();

  const payableUsers = await getPayableInvoiceUsers();
  if (payableUsers.length === 0) {
    console.warn(`No se encontraron usuarios para asignar factura por pagar del documento ${documentId}`);
    return null;
  }

  const docResult = await query(
    `SELECT d.id, d.title, d.status, dt.code as document_type_code
     FROM documents d
     LEFT JOIN document_types dt ON d.document_type_id = dt.id
     WHERE d.id = $1`,
    [documentId]
  );

  const doc = docResult.rows[0];
  if (!doc || doc.document_type_code !== 'FV' || doc.status !== 'completed') {
    return null;
  }

  const insertedRows = [];

  for (const payableUser of payableUsers) {
    const insertResult = await query(
      `INSERT INTO payable_invoices (document_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (document_id, user_id) DO UPDATE SET
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [documentId, payableUser.id]
    );

    if (insertResult.rows[0]) {
      insertedRows.push(insertResult.rows[0]);
    }

    const notificationResult = await query(
      `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
       SELECT $1::uuid, 'payable_invoice', $2::uuid, $3::uuid, $4::varchar
       WHERE NOT EXISTS (
         SELECT 1 FROM notifications
         WHERE user_id = $1::uuid
           AND type = 'payable_invoice'
           AND document_id = $2::uuid
       )
       RETURNING id`,
      [payableUser.id, documentId, actorUserId, doc.title]
    );

    if (notificationResult.rows.length > 0) {
      websocketService.emitNotificationCreated(payableUser.id, {
        id: notificationResult.rows[0].id,
        type: 'payable_invoice',
        document_id: documentId,
        actor_id: actorUserId,
        document_title: doc.title
      });
    }
  }

  console.log(`Factura FV completada enviada a Facturas por pagar: ${doc.title}`);
  return insertedRows[0] || null;
}

async function getNegociacionesSharedUserIds(user, realSignerName = null) {
  const userIds = [user.id];

  if (!realSignerName) {
    return userIds;
  }

  const shouldResolveSharedAccount = isNegociacionesSharedUser(user)
    || (typeof realSignerName === 'string' && realSignerName.trim().length > 0);

  if (!shouldResolveSharedAccount) {
    return userIds;
  }

  const result = await query(
    `SELECT id
     FROM users
     WHERE LOWER(name) = 'negociaciones'
        OR LOWER(email) IN ('negociaciones@prexxa.com.co', 'negociaciones@prexxa.com')
     ORDER BY id ASC`
  );

  result.rows.forEach(row => {
    if (row.id !== null && row.id !== undefined && !userIds.includes(row.id)) {
      userIds.push(row.id);
    }
  });

  return userIds;
}

async function getSignatureColumnSelects() {
  const hasConsecutivoColumn = await checkSignaturesHasConsecutivoColumn();
  const hasRealSignerNameColumn = await checkSignaturesHasRealSignerNameColumn();

  return {
    hasConsecutivoColumn,
    hasRealSignerNameColumn,
    consecutivoSelect: hasConsecutivoColumn ? 's.consecutivo' : 'NULL as consecutivo',
    realSignerNameSelect: hasRealSignerNameColumn ? 's.real_signer_name' : 'NULL as real_signer_name',
    signerNameSelect: hasRealSignerNameColumn
      ? 'COALESCE(s.real_signer_name, signer_user.name) as real_signer_name'
      : 'signer_user.name as real_signer_name'
  };
}

async function checkNegotiationSignersTableExists() {
  if (negotiationSignersTableExists !== null) {
    return negotiationSignersTableExists;
  }

  try {
    const result = await query(
      `SELECT 1
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = 'negotiation_signers'
       LIMIT 1`
    );

    negotiationSignersTableExists = result.rows.length > 0;
  } catch (error) {
    console.error('Error verificando tabla negotiation_signers:', error);
    negotiationSignersTableExists = false;
  }

  return negotiationSignersTableExists;
}

async function syncAvailableSignersFromActiveDirectoryIfNeeded(force = false) {
  const now = Date.now();

  if (!force && availableSignersLastSyncAt && (now - availableSignersLastSyncAt) < AVAILABLE_SIGNERS_SYNC_INTERVAL_MS) {
    return;
  }

  if (availableSignersSyncPromise) {
    return availableSignersSyncPromise;
  }

  availableSignersSyncPromise = (async () => {
    try {
      const adUsers = await getAllUsers();

      if (!Array.isArray(adUsers) || adUsers.length === 0) {
        availableSignersLastSyncAt = Date.now();
        return;
      }

      for (const adUser of adUsers) {
        if (!adUser.email || !adUser.username || !adUser.name) {
          continue;
        }

        const existingUser = await query(
          'SELECT id FROM users WHERE email = $1 OR ad_username = $2 LIMIT 1',
          [adUser.email, adUser.username]
        );

        if (existingUser.rows.length > 0) {
          await query(
            `UPDATE users
             SET name = $1,
                 email = $2,
                 ad_username = $3,
                 is_active = true,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $4`,
            [adUser.name, adUser.email, adUser.username, existingUser.rows[0].id]
          );
        } else {
          await query(
            `INSERT INTO users (name, email, ad_username, role, is_active, email_notifications)
             VALUES ($1, $2, $3, 'user', true, true)`,
            [adUser.name, adUser.email, adUser.username]
          );
        }
      }

      availableSignersLastSyncAt = Date.now();
    } catch (error) {
      console.error('Error sincronizando usuarios disponibles desde Active Directory:', error.message);
    } finally {
      availableSignersSyncPromise = null;
    }
  })();

  return availableSignersSyncPromise;
}

/**
 * Helper: Verificar si un documento está completamente firmado
 * @param {number} documentId - ID del documento
 * @returns {Promise<boolean>} true si todas las firmas están completas
 */
async function checkIfDocumentFullySigned(documentId) {
  try {
    const csConstraint = await getCausacionSignerIdConstraint();
    const result = await query(
      `SELECT
        COUNT(*) as total_signers,
        COUNT(s.id) FILTER (WHERE s.status = 'signed') as signed_count
       FROM document_signers ds
       LEFT JOIN signatures s ON s.document_id = ds.document_id
         AND ((ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
              (ds.is_causacion_group = true AND s.signer_id IN (
                SELECT ci.user_id FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = ds.grupo_codigo
              )${csConstraint}))
       WHERE ds.document_id = $1`,
      [documentId]
    );

    if (result.rows.length === 0) return false;

    const { total_signers, signed_count } = result.rows[0];
    return parseInt(total_signers) > 0 && parseInt(total_signers) === parseInt(signed_count);
  } catch (error) {
    console.error('❌ Error al verificar si documento está completamente firmado:', error);
    return false;
  }
}

/**
 * Helper: Verificar si un documento tiene retenciones activas
 * @param {number} documentId - ID del documento
 * @returns {Promise<boolean>} true si tiene retenciones activas
 */
async function checkIfDocumentHasActiveRetentions(documentId) {
  try {
    const result = await query(
      `SELECT retention_data FROM documents WHERE id = $1`,
      [documentId]
    );

    if (result.rows.length === 0) return false;

    const retentionData = result.rows[0].retention_data;
    if (!retentionData) return false;

    const retentions = typeof retentionData === 'string' ? JSON.parse(retentionData) : retentionData;
    const activeRetentions = retentions.filter(r => r.activa === true);

    return activeRetentions.length > 0;
  } catch (error) {
    console.error('❌ Error al verificar retenciones activas:', error);
    return false;
  }
}

/**
 * Helper: Eliminar archivos de backup de un documento
 * @param {number} documentId - ID del documento
 * @returns {Promise<number>} Número de backups eliminados
 */
async function cleanupDocumentBackups(documentId) {
  try {
    console.log(`🧹 [CLEANUP] Verificando backups para eliminar del documento ${documentId}...`);

    const result = await query(
      `SELECT original_pdf_backup FROM documents WHERE id = $1`,
      [documentId]
    );

    if (result.rows.length === 0 || !result.rows[0].original_pdf_backup) {
      console.log(`   ℹ️  Documento ${documentId} no tiene backups para eliminar`);
      return 0;
    }

    const backupPaths = JSON.parse(result.rows[0].original_pdf_backup);
    console.log(`   📦 Encontrados ${backupPaths.length} backup(s) para eliminar`);

    let deletedCount = 0;
    for (let i = 0; i < backupPaths.length; i++) {
      const relPath = backupPaths[i];
      const backupRelativePath = relPath.replace(/^uploads\//, '');
      const fullBackupPath = path.join(__dirname, '..', 'uploads', backupRelativePath);

      try {
        await fs.unlink(fullBackupPath);
        deletedCount++;
        console.log(`      ✅ Backup ${i + 1}/${backupPaths.length} eliminado: ${path.basename(fullBackupPath)}`);
      } catch (fileErr) {
        console.warn(`      ⚠️  No se pudo eliminar backup ${i + 1}: ${fileErr.message}`);
      }
    }

    // Actualizar BD para marcar que ya no hay backups
    await query(
      `UPDATE documents SET original_pdf_backup = NULL WHERE id = $1`,
      [documentId]
    );

    console.log(`   ✅ ${deletedCount}/${backupPaths.length} backups eliminados del documento ${documentId}`);
    return deletedCount;
  } catch (error) {
    console.error('❌ Error al eliminar backups del documento:', error);
    return 0;
  }
}

/**
 * Helper: Verificar y limpiar backups si el documento está completo
 * Elimina backups solo si: está totalmente firmado Y no tiene retenciones activas
 * @param {number} documentId - ID del documento
 */
async function checkAndCleanupBackupsIfComplete(documentId) {
  try {
    const isFullySigned = await checkIfDocumentFullySigned(documentId);
    const hasActiveRetentions = await checkIfDocumentHasActiveRetentions(documentId);

    if (isFullySigned && !hasActiveRetentions) {
      console.log(`   ✅ Documento completo y sin retenciones → Eliminando backups...`);
      await cleanupDocumentBackups(documentId);
    } else {
      if (hasActiveRetentions) {
        console.log(`   ⏭️  Documento tiene retenciones activas → Manteniendo backups`);
      }
    }
  } catch (error) {
    console.error('❌ Error al verificar y limpiar backups:', error);
  }
}

/**
 * Helper: Obtener firmas de un documento tipo FV
 * Retorna un objeto con el mapeo: { 'nombre_persona': 'nombre_firmante' }
 * Usa el templateData para hacer matching correcto de nombres
 */
async function obtenerFirmasDocumento(documentId, templateData = null) {
  try {
    const { realSignerNameSelect } = await getSignatureColumnSelects();
    const signatureJoinCondition = await getSignatureJoinCondition('s', 'ds');
    const csConstraint = await getCausacionSignerIdConstraint();

    // Si no se pasa templateData, obtenerlo del documento
    if (!templateData) {
      const docResult = await query(
        'SELECT metadata FROM documents WHERE id = $1',
        [documentId]
      );
      if (docResult.rows.length > 0 && docResult.rows[0].metadata) {
        templateData = typeof docResult.rows[0].metadata === 'string'
          ? JSON.parse(docResult.rows[0].metadata)
          : docResult.rows[0].metadata;
      }
    }

    const result = await query(
      `SELECT
        ds.user_id,
        u.name as user_name,
        u.email,
        ${realSignerNameSelect},
       s.status as signature_status,
       ds.role_names,
       ds.role_name
       FROM document_signers ds
       JOIN users u ON u.id = ds.user_id
       LEFT JOIN signatures s ON ${signatureJoinCondition}
       WHERE ds.document_id = $1
         AND ds.is_causacion_group = FALSE
         AND s.status = 'signed'
       ORDER BY ds.order_position ASC`,
      [documentId]
    );

    const firmas = {};
    let firmaNegociaciones = null;
    let firmaCausacion = null;

    // Helper para normalizar nombres
    const normalizarNombre = (nombre) => {
      if (!nombre) return '';
      return nombre.trim().toUpperCase().replace(/\s+/g, ' ');
    };

    // Helper para verificar si dos nombres coinciden
    const nombresCoinciden = (nombre1, nombre2) => {
      const n1 = normalizarNombre(nombre1);
      const n2 = normalizarNombre(nombre2);

      if (n1 === n2) return true;

      const words1 = n1.split(' ').filter(w => w.length > 2);
      const words2 = n2.split(' ').filter(w => w.length > 2);

      let matchCount = 0;
      words1.forEach(w1 => {
        if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
          matchCount++;
        }
      });

      return matchCount >= 2;
    };

    // Para cada firmante que ha firmado
    result.rows.forEach(row => {
      // Usar real_signer_name si existe (usuario Negociaciones firmando por otro), si no usar user_name
      const nombreFirmante = row.real_signer_name || row.user_name;

      // Agregar por nombre de usuario directo
      firmas[row.user_name] = nombreFirmante;

      // Verificar roles para Negociaciones y Causación
      let roles = [];
      if (row.role_names) {
        roles = Array.isArray(row.role_names) ? row.role_names : [row.role_names];
      } else if (row.role_name) {
        roles = [row.role_name];
      }

      // Verificar si tiene rol de Negociaciones
      if (roles.some(role => role && (role.toUpperCase().includes('NEGOCIACION') || role.toUpperCase().includes('NEGOCIACIÓN')))) {
        if (!firmaNegociaciones) {
          firmaNegociaciones = nombreFirmante;
        }
      }

      // En FV, la firma de Causacion se llena solo desde el grupo de causacion.
      // No la inferimos desde roles de firmantes normales para evitar duplicados
      // visibles cuando un firmante de otra etapa comparte metadatos de rol.

      // Si tenemos templateData, buscar coincidencias
      if (templateData) {
        // Verificar si es el negociador
        if (templateData.nombreNegociador && nombresCoinciden(row.user_name, templateData.nombreNegociador)) {
          firmas[templateData.nombreNegociador] = nombreFirmante;
        }

        // Verificar en las filas de control
        if (templateData.filasControl && Array.isArray(templateData.filasControl)) {
          templateData.filasControl.forEach(fila => {
            // Responsable de Cuenta Contable
            if (fila.respCuentaContable && nombresCoinciden(row.user_name, fila.respCuentaContable)) {
              firmas[fila.respCuentaContable] = nombreFirmante;
            }

            // Responsable de Centro de Costos
            if (fila.respCentroCostos && nombresCoinciden(row.user_name, fila.respCentroCostos)) {
              firmas[fila.respCentroCostos] = nombreFirmante;
            }
          });
        }
      }
    });

    // ========== BUSCAR FIRMAS DE GRUPOS DE CAUSACIÓN ==========
    // Los grupos de causación se manejan aparte porque cualquier miembro puede firmar
    const causacionGroupResult = await query(
      `SELECT
        ${realSignerNameSelect},
        u.name as signer_name,
        ds.grupo_codigo,
        cg.nombre as grupo_nombre
       FROM document_signers ds
       JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
       JOIN causacion_integrantes ci ON ci.grupo_id = cg.id
       JOIN signatures s ON s.document_id = ds.document_id AND s.signer_id = ci.user_id${csConstraint}
       JOIN users u ON u.id = s.signer_id
       WHERE ds.document_id = $1
         AND ds.is_causacion_group = TRUE
         AND s.status = 'signed'
         AND ci.activo = true
       LIMIT 1`,
      [documentId]
    );

    // Si encontramos una firma de un miembro del grupo de causación
    if (causacionGroupResult.rows.length > 0) {
      const causacionRow = causacionGroupResult.rows[0];
      // Usar el nombre del usuario que firmó (siempre estará en real_signer_name para grupos)
      const nombreFirmanteCausacion = causacionRow.real_signer_name || causacionRow.signer_name;
      firmaCausacion = nombreFirmanteCausacion;
      console.log(`✅ Firma de causación encontrada: ${nombreFirmanteCausacion} (grupo: ${causacionRow.grupo_nombre})`);
    }

    // Agregar firmas especiales al objeto de firmas
    if (firmaNegociaciones) {
      firmas['_NEGOCIACIONES'] = firmaNegociaciones;
    }
    if (firmaCausacion) {
      firmas['_CAUSACION'] = firmaCausacion;
    }

    return firmas;
  } catch (error) {
    console.error('❌ Error al obtener firmas:', error);
    return {};
  }
}

const resolvers = {
  Query: {
    me: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(
        'SELECT * FROM users WHERE id = $1',
        [user.id]
      );

      return result.rows[0];
    },

    users: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.role !== 'admin') throw new Error('No autorizado');

      const result = await query('SELECT * FROM users ORDER BY created_at DESC');
      return result.rows;
    },

    user: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query('SELECT * FROM users WHERE id = $1', [id]);
      return result.rows[0];
    },

    documents: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT d.*, u.name as uploaded_by_name, u.email as uploaded_by_email
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        ORDER BY d.created_at DESC
      `);
      return result.rows;
    },

    document: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT d.*, u.name as uploaded_by_name, u.email as uploaded_by_email
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        WHERE d.id = $1
      `, [id]);

      return result.rows[0];
    },

    myDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          d.*,
          dt.name as document_type_name,
          dt.code as document_type_code,
          COUNT(DISTINCT ds.user_id) as total_signers,
          COUNT(DISTINCT CASE WHEN s.status = 'signed' THEN s.signer_id END) as signed_count,
          COUNT(DISTINCT CASE WHEN s.status = 'pending' THEN s.signer_id END) as pending_count
        FROM documents d
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        LEFT JOIN document_signers ds ON d.id = ds.document_id
        LEFT JOIN signatures s ON d.id = s.document_id AND ds.user_id = s.signer_id
        WHERE d.uploaded_by = $1
        GROUP BY d.id, dt.name, dt.code
        ORDER BY d.created_at DESC
      `, [user.id]);

      return result.rows;
    },

    pendingDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');
      const isTestSignatureUser = isCausacionTestUser(user);

      // Obtener grupos de causación del usuario
      const userGroups = await query(`
        SELECT cg.codigo
        FROM causacion_integrantes ci
        JOIN causacion_grupos cg ON ci.grupo_id = cg.id
        WHERE ci.user_id = $1 AND ci.activo = true
      `, [user.id]);

      const grupoCodigos = userGroups.rows.map(g => g.codigo);
      const csConstraint = await getCausacionSignerIdConstraint();
      const csPrevConstraint = await getCausacionSignerIdConstraint('s_prev', 'ds_prev');

      try {
      const result = await query(`
        SELECT DISTINCT ON (d.id)
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          'pending' as signature_status,
          ds.order_position,
          ds.is_causacion_group,
          ds.grupo_codigo,
          CASE
            WHEN ds.order_position > 1 THEN (
              SELECT COUNT(*)
              FROM document_signers ds_prev
              LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id
                AND (
                  (ds_prev.is_causacion_group = false AND ds_prev.user_id = s_prev.signer_id)
                  OR
                  ($3::boolean = true AND s_prev.document_signer_id = ds_prev.id)
                  OR
                  (ds_prev.is_causacion_group = true AND s_prev.signer_id IN (
                    SELECT ci.user_id FROM causacion_integrantes ci
                    JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                    WHERE cg.codigo = ds_prev.grupo_codigo AND ci.activo = true
                  )${csPrevConstraint})
                )
              WHERE ds_prev.document_id = d.id
                AND ds_prev.order_position < ds.order_position
                AND COALESCE(s_prev.status, 'pending') != 'signed'
            )
            ELSE 0
          END as pending_previous_signers,
          CASE
            WHEN ds.order_position > 1 THEN (
              SELECT COALESCE(cg_prev.nombre, u_prev.name)
              FROM document_signers ds_prev
              LEFT JOIN users u_prev ON ds_prev.user_id = u_prev.id
              LEFT JOIN causacion_grupos cg_prev ON ds_prev.grupo_codigo = cg_prev.codigo
              WHERE ds_prev.document_id = d.id
                AND ds_prev.order_position = ds.order_position - 1
              LIMIT 1
            )
            ELSE NULL
          END as previous_signer_name
        FROM document_signers ds
        JOIN documents d ON ds.document_id = d.id
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        WHERE (
          -- Caso 1: Usuario asignado directamente
          (ds.is_causacion_group = false AND ds.user_id = $1)
          OR
          -- Caso 2: Usuario es miembro de un grupo de causación asignado
          (ds.is_causacion_group = true AND ds.grupo_codigo = ANY($2))
          OR
          ($3::boolean = true
            AND dt.code = 'FV'
            AND (
              LOWER(COALESCE(d.title, '')) LIKE '%prueba%'
              OR LOWER(COALESCE(d.title, '')) LIKE '%test%'
              OR LOWER(COALESCE(d.file_name, '')) LIKE '%prueba%'
              OR LOWER(COALESCE(d.file_name, '')) LIKE '%test%'
              OR LOWER(COALESCE(d.description, '')) LIKE '%prueba%'
              OR LOWER(COALESCE(d.metadata::text, '')) LIKE '%prueba%'
            )
          )
        )
          AND d.status NOT IN ('completed', 'archived', 'rejected')
          -- Solo mostrar si ya es su turno real de firma
          AND NOT EXISTS (
            SELECT 1
            FROM document_signers ds_prev
            LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id
              AND (
                (ds_prev.is_causacion_group = false AND ds_prev.user_id = s_prev.signer_id)
                OR
                ($3::boolean = true AND s_prev.document_signer_id = ds_prev.id)
                OR
                (ds_prev.is_causacion_group = true AND s_prev.signer_id IN (
                  SELECT ci.user_id FROM causacion_integrantes ci
                  JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                  WHERE cg.codigo = ds_prev.grupo_codigo AND ci.activo = true
                )${csPrevConstraint})
              )
            WHERE ds_prev.document_id = d.id
              AND ds_prev.order_position < ds.order_position
              AND COALESCE(s_prev.status, 'pending') != 'signed'
          )
          -- Verificar que NO haya firmado ya (ni el usuario ni su grupo)
          AND NOT EXISTS (
            SELECT 1 FROM signatures s
            WHERE s.document_id = d.id
            AND (
              (ds.is_causacion_group = false AND s.signer_id = $1 AND s.status IN ('signed', 'rejected'))
              OR
              ($3::boolean = true AND s.document_signer_id = ds.id AND s.status IN ('signed', 'rejected'))
              OR
              (ds.is_causacion_group = true AND s.status IN ('signed', 'rejected') AND s.signer_id IN (
                SELECT ci.user_id FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
              )${csConstraint})
            )
          )
          -- Excluir si algún firmante anterior ha rechazado
          AND NOT EXISTS (
            SELECT 1
            FROM document_signers ds_prev
            LEFT JOIN signatures s_prev ON ds_prev.document_id = s_prev.document_id
              AND (
                (ds_prev.is_causacion_group = false AND ds_prev.user_id = s_prev.signer_id)
                OR
                ($3::boolean = true AND s_prev.document_signer_id = ds_prev.id)
                OR
                (ds_prev.is_causacion_group = true AND s_prev.signer_id IN (
                  SELECT ci.user_id FROM causacion_integrantes ci
                  JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                  WHERE cg.codigo = ds_prev.grupo_codigo AND ci.activo = true
                )${csPrevConstraint})
              )
            WHERE ds_prev.document_id = d.id
              AND ds_prev.order_position < ds.order_position
              AND s_prev.status = 'rejected'
          )
        ORDER BY d.id, ds.order_position ASC, d.created_at DESC
      `, [user.id, grupoCodigos, isTestSignatureUser]);

      return result.rows;
      } catch (err) {
        console.error('❌ Error en pendingDocuments query:', err.message);
        throw err;
      }
    },

    signedDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          s.signed_at,
          s.signature_type,
          s.signer_id as advance_payment_user_id,
          COALESCE(tap.payment_status, 'pending') as advance_payment_status,
          tap.paid_at as advance_paid_at,
          tap.paid_by as advance_paid_by,
          paid_user.name as advance_paid_by_name,
          paid_user.email as advance_paid_by_email
        FROM signatures s
        JOIN documents d ON s.document_id = d.id
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        LEFT JOIN treasury_advance_payments tap
          ON tap.document_id = d.id AND tap.user_id = s.signer_id
        LEFT JOIN users paid_user ON paid_user.id = tap.paid_by
        WHERE s.signer_id = $1
          AND s.status = 'signed'
          AND d.uploaded_by != $1
          -- Excluir documentos que el usuario tiene retenidos activamente
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(d.retention_data) AS retention
            WHERE (retention->>'userId')::text = $1::text
              AND (retention->>'activa')::boolean = true
          )
        ORDER BY s.signed_at DESC
      `, [user.id]);

      return result.rows;
    },

    payableInvoices: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      await ensurePayableInvoicesTable();

      if (!await isPayableInvoiceUser(user.id)) {
        return [];
      }

      const result = await query(`
        SELECT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          pi.created_at as payable_assigned_at,
          pi.payment_status as payable_status,
          pi.paid_at,
          pi.paid_by,
          paid_user.name as paid_by_name,
          paid_user.email as paid_by_email
        FROM payable_invoices pi
        JOIN documents d ON d.id = pi.document_id
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN users paid_user ON paid_user.id = pi.paid_by
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        WHERE pi.user_id = $1
        ORDER BY pi.created_at DESC
      `, [user.id]);

      return result.rows;
    },

    rejectedByMeDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT DISTINCT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          s.rejection_reason,
          s.rejected_at,
          s.signed_at,
          s.created_at,
          COALESCE(s.rejected_at, s.signed_at, s.created_at) as sort_date
        FROM documents d
        JOIN signatures s ON d.id = s.document_id
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        WHERE s.signer_id = $1
          AND s.status = 'rejected'
        ORDER BY sort_date DESC
      `, [user.id]);

      return result.rows;
    },

    rejectedByOthersDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT DISTINCT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          rejector_sig.rejection_reason,
          rejector_sig.rejected_at,
          rejector_sig.signed_at,
          rejector_sig.created_at,
          rejector_user.id as rejected_by_id,
          rejector_user.name as rejected_by_name,
          rejector_user.email as rejected_by_email,
          COALESCE(rejector_sig.rejected_at, rejector_sig.signed_at, rejector_sig.created_at) as sort_date
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        -- Mi firma (debe existir y yo NO soy quien rechazó)
        JOIN signatures my_sig ON d.id = my_sig.document_id
          AND my_sig.signer_id = $1
        -- La firma del que rechazó (alguien más, no yo)
        JOIN signatures rejector_sig ON d.id = rejector_sig.document_id
          AND rejector_sig.status = 'rejected'
          AND rejector_sig.signer_id != $1
        -- Usuario que rechazó
        JOIN users rejector_user ON rejector_sig.signer_id = rejector_user.id
        WHERE d.status = 'rejected'
          AND d.uploaded_by != $1  -- Excluir documentos que YO creé
        ORDER BY sort_date DESC
      `, [user.id]);

      return result.rows;
    },

    retainedDocuments: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT DISTINCT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        WHERE d.retention_data IS NOT NULL
          AND jsonb_array_length(d.retention_data) > 0
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(d.retention_data) AS retention
            WHERE (retention->>'userId')::text = $1::text
              AND (retention->>'activa')::boolean = true
          )
        ORDER BY d.created_at DESC
      `, [user.id]);

      return result.rows;
    },

    documentsByStatus: async (_, { status }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT d.*, u.name as uploaded_by_name, u.email as uploaded_by_email
        FROM documents d
        JOIN users u ON d.uploaded_by = u.id
        WHERE d.status = $1
        ORDER BY d.created_at DESC
      `, [status]);

      return result.rows;
    },

    signatures: async (_, { documentId }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT
          s.*,
          u.name as signer_name,
          u.email as signer_email,
          ds.role_name as role_name,
          ds.role_names as role_names,
          ds.order_position as order_position
        FROM signatures s
        JOIN users u ON s.signer_id = u.id
        LEFT JOIN document_signers ds ON ds.document_id = s.document_id AND ds.user_id = s.signer_id
        WHERE s.document_id = $1
        ORDER BY COALESCE(ds.order_position, s.created_at::integer) ASC
      `, [documentId]);

      return result.rows;
    },

    documentSigners: async (_, { documentId }, { user }) => {
      if (!user) throw new Error('No autenticado');
      const signatureJoinCondition = await getSignatureJoinCondition('s', 'ds');
      const { consecutivoSelect, realSignerNameSelect } = await getSignatureColumnSelects();
      const signatureConsecutivoSelect = consecutivoSelect.startsWith('NULL')
        ? 'NULL as signature_consecutivo'
        : `${consecutivoSelect} as signature_consecutivo`;
      const signatureRealSignerNameSelect = realSignerNameSelect.startsWith('NULL')
        ? 'NULL as signature_real_signer_name'
        : `${realSignerNameSelect} as signature_real_signer_name`;

      const result = await query(`
        SELECT
          ds.id as "documentSignerId",
          ds.user_id as "userId",
          ds.order_position as "orderPosition",
          ds.is_required as "isRequired",
          ds.assigned_role_id as "assignedRoleId",
          ds.role_name as "roleName",
          ds.assigned_role_ids as "assignedRoleIds",
          ds.role_names as "roleNames",
          ds.is_causacion_group as "isCausacionGroup",
          ds.grupo_codigo as "grupoCodigo",
          u.id as user_id,
          u.name as user_name,
          u.email as user_email,
          s.id as signature_id,
          s.status as signature_status,
          s.signed_at as signature_signed_at,
          s.rejected_at as signature_rejected_at,
          s.rejection_reason as signature_rejection_reason,
          ${signatureConsecutivoSelect},
          ${signatureRealSignerNameSelect},
          s.created_at as signature_created_at
        FROM document_signers ds
        LEFT JOIN users u ON ds.user_id = u.id
        LEFT JOIN signatures s ON ${signatureJoinCondition}
        WHERE ds.document_id = $1
        ORDER BY ds.order_position ASC
      `, [documentId]);

      const expandedSigners = [];

      // OPTIMIZED: Batch query para grupos de causación (N+1 query elimination)
      // Recolectar todos los códigos de grupo únicos
      const grupoCodigos = result.rows
        .filter(row => row.isCausacionGroup && row.grupoCodigo)
        .map(row => row.grupoCodigo);

      // Obtener todos los miembros de todos los grupos en una sola query
      let grupoMembersMap = {};
      if (grupoCodigos.length > 0) {
        const uniqueCodigos = [...new Set(grupoCodigos)];

        const allMembersResult = await query(`
          SELECT
            cg.codigo as grupo_codigo,
            ci.user_id,
            u.id,
            u.name,
            u.email,
            s.id as signature_id,
            s.status as signature_status,
            s.signed_at as signature_signed_at,
            s.rejected_at as signature_rejected_at,
            s.rejection_reason as signature_rejection_reason,
            NULL as signature_consecutivo,
            NULL as signature_real_signer_name,
            s.created_at as signature_created_at
          FROM causacion_integrantes ci
          LEFT JOIN users u ON ci.user_id = u.id
          LEFT JOIN causacion_grupos cg ON ci.grupo_id = cg.id
          LEFT JOIN signatures s ON s.document_id = $1 AND s.signer_id = ci.user_id
          WHERE cg.codigo = ANY($2) AND ci.activo = true
        `, [documentId, uniqueCodigos]);

        // Construir mapa: grupoCode -> [members]
        grupoMembersMap = allMembersResult.rows.reduce((map, member) => {
          if (!map[member.grupo_codigo]) {
            map[member.grupo_codigo] = [];
          }
          map[member.grupo_codigo].push(member);
          return map;
        }, {});
      }

      for (const row of result.rows) {
        if (row.isCausacionGroup && row.grupoCodigo) {
          // Expandir grupo de causación usando el mapa (sin query adicional)
          const members = grupoMembersMap[row.grupoCodigo] || [];

          for (const member of members) {
            expandedSigners.push({
              userId: member.user_id,
              orderPosition: row.orderPosition,
              isRequired: row.isRequired,
              assignedRoleId: row.assignedRoleId,
              roleName: row.roleName,
              assignedRoleIds: row.assignedRoleIds || [],
              roleNames: row.roleNames || [],
              user: {
                id: member.id,
                name: member.name,
                email: member.email
              },
              signature: (member.signature_id && member.signature_status) ? {
                id: member.signature_id,
                status: member.signature_status,
                signedAt: member.signature_signed_at || null,
                rejectedAt: member.signature_rejected_at || null,
                rejectionReason: member.signature_rejection_reason || null,
                consecutivo: member.signature_consecutivo || null,
                realSignerName: member.signature_real_signer_name || null,
                createdAt: member.signature_created_at || null
              } : null
            });
          }
        } else {
          // Firmante individual
          expandedSigners.push({
            userId: row.userId,
            orderPosition: row.orderPosition,
            isRequired: row.isRequired,
            assignedRoleId: row.assignedRoleId,
            roleName: row.roleName,
            assignedRoleIds: row.assignedRoleIds || [],
            roleNames: row.roleNames || [],
            user: {
              id: row.user_id,
              name: row.user_name,
              email: row.user_email
            },
            signature: (row.signature_id && row.signature_status) ? {
              id: row.signature_id,
              status: row.signature_status,
              signedAt: row.signature_signed_at || null,
              rejectedAt: row.signature_rejected_at || null,
              rejectionReason: row.signature_rejection_reason || null,
              consecutivo: row.signature_consecutivo || null,
              realSignerName: row.signature_real_signer_name || null,
              createdAt: row.signature_created_at || null
            } : null
          });
        }
      }

      return expandedSigners;
    },

    mySignatures: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT s.*, d.title as document_title
        FROM signatures s
        JOIN documents d ON s.document_id = d.id
        WHERE s.signer_id = $1
        ORDER BY s.created_at DESC
      `, [user.id]);

      return result.rows;
    },

    notifications: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT *
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
      `, [user.id]);

      return result.rows;
    },

    unreadNotificationsCount: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT COUNT(*) as count
        FROM notifications
        WHERE user_id = $1 AND is_read = FALSE
      `, [user.id]);

      return parseInt(result.rows[0].count) || 0;
    },

    negotiationSigners: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const hasNegotiationSignersTable = await checkNegotiationSignersTableExists();
      if (!hasNegotiationSignersTable) {
        console.warn('Tabla negotiation_signers no existe. Retornando lista vacia.');
        return [];
      }

      const result = await query(`
        SELECT id, name, active
        FROM negotiation_signers
        WHERE active = true
        ORDER BY name ASC
      `);

      return result.rows;
    },

    verifyNegotiationSignerCedula: async (_, { name, lastFourDigits }, { user }) => {
      if (!user) throw new Error('No autenticado');

      console.log('🔍 Verificando cédula para:', name);
      console.log('🔢 Últimos 4 dígitos recibidos:', lastFourDigits, 'Tipo:', typeof lastFourDigits);
      console.log('👤 Usuario:', user.name);

      const hasNegotiationSignersTable = await checkNegotiationSignersTableExists();
      if (!hasNegotiationSignersTable) {
        return {
          valid: false,
          message: 'La validacion de Negociaciones no esta configurada en esta base de datos. Falta crear la tabla negotiation_signers y cargar las cedulas autorizadas.'
        };
      }

      // Buscar el firmante en la base de datos
      const result = await query(`
        SELECT cedula
        FROM negotiation_signers
        WHERE name = $1 AND active = true
      `, [name]);

      if (result.rows.length === 0) {
        console.log('❌ Firmante no encontrado:', name);
        return {
          valid: false,
          message: 'Firmante no encontrado en la base de datos'
        };
      }

      const fullCedula = result.rows[0].cedula;
      const lastFour = fullCedula.slice(-4);

      console.log('💳 Cédula completa en BD:', fullCedula);
      console.log('🔢 Últimos 4 en BD:', lastFour);
      console.log('🔢 Últimos 4 recibidos:', lastFourDigits);
      console.log('✅ ¿Coinciden?', lastFour === lastFourDigits);

      if (lastFour === lastFourDigits) {
        console.log('✅ Verificación exitosa');
        return {
          valid: true,
          message: 'Cédula verificada correctamente'
        };
      } else {
        console.log('❌ No coinciden');
        return {
          valid: false,
          message: 'Los últimos 4 dígitos no coinciden'
        };
      }
    },

    causacionGrupos: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT id, codigo, nombre, descripcion, activo, role_code as "roleCode"
        FROM causacion_grupos
        WHERE activo = true
        ORDER BY nombre ASC
      `);

      // Groups marked as test (contain 'prueba' in name) are only visible to the test user
      if (isCausacionTestUser(user)) {
        return result.rows;
      }

      return result.rows.filter(g => !g.nombre.toLowerCase().includes('prueba'));
    },

    causacionGrupo: async (_, { codigo }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT id, codigo, nombre, descripcion, activo, role_code as "roleCode"
        FROM causacion_grupos
        WHERE codigo = $1 AND activo = true
      `, [codigo]);

      if (result.rows.length === 0) {
        throw new Error('Grupo de causación no encontrado');
      }

      return result.rows[0];
    },

    availableSigners: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');
      await syncAvailableSignersFromActiveDirectoryIfNeeded();

      // Incluir al usuario actual para permitir autofirma
      // Excluir usuarios que no están en el directorio activo (por ejemplo, Administrador con email admin@prexxa.local)
      const result = await query(`
        SELECT id, name, email, role
        FROM users
        WHERE email != 'admin@prexxa.local'
          AND is_active = true
        ORDER BY
          CASE WHEN id = $1 THEN 0 ELSE 1 END,
          name ASC
      `, [user.id]);

      return result.rows;
    },

    documentTypes: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT * FROM document_types
        WHERE is_active = true
        ORDER BY name ASC
      `);

      return result.rows;
    },

    documentType: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT * FROM document_types WHERE id = $1
      `, [id]);

      return result.rows[0];
    },

    documentTypeRoles: async (_, { documentTypeId }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(`
        SELECT * FROM document_type_roles
        WHERE document_type_id = $1
        ORDER BY order_position ASC
      `, [documentTypeId]);

      return result.rows;
    },

    /**
     * Active Sessions - Dashboard de sesiones activas
     * SEGURIDAD: Solo accesible para el administrador Esteban Zuluaga (e.zuluaga)
     */
    activeSessions: async (_, __, { user }) => {
      // Verificar autenticación
      if (!user) throw new Error('No autenticado');

      // SEGURIDAD: Solo el administrador Esteban Zuluaga puede ver sesiones activas
      const ADMIN_EMAIL = 'e.zuluaga@prexxa.com.co';
      if (user.email !== ADMIN_EMAIL && user.email !== 'e.zuluaga') {
        console.warn(`⚠️ Intento no autorizado de acceso a activeSessions por: ${user.email}`);
        throw new Error('No autorizado. Esta función es solo para administradores.');
      }

      try {
        const result = await query(`
          SELECT
            s.id,
            s.user_id,
            u.name as user_name,
            u.email as user_email,
            s.login_time,
            s.is_active,
            EXTRACT(EPOCH FROM (NOW() - s.login_time)) / 3600 as hours_elapsed
          FROM user_sessions s
          INNER JOIN users u ON u.id = s.user_id
          WHERE s.is_active = true
          ORDER BY s.login_time DESC
        `);

        // Calcular horas restantes para cada sesión
        const sessions = result.rows.map(session => {
          const hoursElapsed = parseFloat(session.hours_elapsed);
          const hoursRemaining = 8 - hoursElapsed;

          return {
            id: session.id,
            userId: session.user_id,
            userName: session.user_name,
            userEmail: session.user_email,
            loginTime: session.login_time.toISOString(),
            isActive: session.is_active,
            hoursElapsed: parseFloat(hoursElapsed.toFixed(2)),
            hoursRemaining: parseFloat(hoursRemaining.toFixed(2))
          };
        });

        // console.log(`📊 Admin ${user.email} consultó ${sessions.length} sesiones activas`);
        return sessions;
      } catch (error) {
        console.error('❌ Error obteniendo sesiones activas:', error);
        throw new Error('Error al obtener sesiones activas');
      }
    },
  },

  Mutation: {
    /**
     * Authenticates a user using local credentials or Active Directory (LDAP)
     *
     * BUSINESS RULE: Local authentication takes precedence over LDAP. If a user has a local
     * password_hash, LDAP authentication is skipped entirely.
     * BUSINESS RULE: LDAP users are automatically created in the database on first login.
     * BUSINESS RULE: Existing LDAP users have their name and email synchronized from AD on each login.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {string} args.email - User's email address or username
     * @param {string} args.password - User's password
     * @returns {Promise<{token: string, user: Object}>} JWT token and user object
     * @throws {Error} When credentials are invalid or authentication fails
     */
    login: async (_, { email, password }, { ipAddress }) => {
      try {
        const localUserResult = await query(
          'SELECT * FROM users WHERE email = $1 AND password_hash IS NOT NULL',
          [email]
        );

        if (localUserResult.rows.length > 0) {
          const localUser = localUserResult.rows[0];
          const validPassword = await bcrypt.compare(password, localUser.password_hash);

          if (validPassword) {
            // JWT con expiración de 8h (defensa en profundidad: JWT + BD)
            // Doble validación: JWT expira a las 8h Y BD valida login_time
            const token = jwt.sign(
              { id: localUser.id, email: localUser.email, name: localUser.name, role: localUser.role },
              JWT_SECRET,
              { expiresIn: process.env.JWT_EXPIRES || '8h' }
            );

            // Registrar login en logs
            pdfLogger.logLogin(localUser.name);

            // Crear sesión en BD (fuente de verdad para las 8 horas)
            await createSession(localUser.id, token);

            // // console.log(`✅ Usuario inició sesión: ${localUser.name}`);

            return { token, user: localUser };
          }
          // Si la contraseña no es válida, lanzar error inmediatamente
          throw new Error('Usuario o contraseña inválidos');
        }

        // Extraer username del email
        const username = email.includes('@') ? email.split('@')[0] : email;

        const ldapUser = await authenticateUser(username, password);

        let result = await query(
          'SELECT * FROM users WHERE email = $1 OR ad_username = $2',
          [ldapUser.email, ldapUser.username]
        );

        let user = result.rows[0];

        if (!user) {
          const insertResult = await query(
            `INSERT INTO users (name, email, ad_username, role, is_active)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [ldapUser.name, ldapUser.email, ldapUser.username, 'user', true]
          );
          user = insertResult.rows[0];
        } else {
          const updateResult = await query(
            'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *',
            [ldapUser.name, ldapUser.email, user.id]
          );
          user = updateResult.rows[0];
        }

        const token = jwt.sign(
          { id: user.id, email: user.email, name: user.name, role: user.role },
          JWT_SECRET,
          { expiresIn: process.env.JWT_EXPIRES || '8h' }
        );

        // Registrar login en logs
        pdfLogger.logLogin(user.name);

        // Crear sesión en BD (fuente de verdad para las 8 horas)
        await createSession(user.id, token);

        // // console.log(`✅ Usuario inició sesión: ${user.name}`);

        return { token, user };
      } catch (error) {
        console.error('❌ Error en login:', error.message);
        throw new Error('Usuario o contraseña inválidos');
      }
    },

    /**
     * Registers a new local user with email and password
     *
     * BUSINESS RULE: Email must be unique across all users.
     * BUSINESS RULE: Password is hashed with bcrypt (10 rounds) before storage.
     * BUSINESS RULE: New users default to 'user' role and active status.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {string} args.name - User's full name
     * @param {string} args.email - User's email address (must be unique)
     * @param {string} args.password - User's password (will be hashed)
     * @returns {Promise<{token: string, user: Object}>} JWT token and user object
     * @throws {Error} When email is already registered
     */
    register: async (_, { name, email, password }) => {
      const existingUser = await query(
        'SELECT * FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        throw new Error('El email ya está registrado');
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await query(
        `INSERT INTO users (name, email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`,
        [name, email, hashedPassword, 'user', true]
      );

      const user = result.rows[0];
      // JWT con expiración de 8h (defensa en profundidad: JWT + BD)
      // Doble validación: JWT expira a las 8h Y BD valida login_time
      const token = jwt.sign(
        { id: user.id, email: user.email, name: user.name, role: user.role },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES || '8h' }
      );

      // Crear sesión en BD (segunda capa de validación)
      await createSession(user.id, token);

      return { token, user };
    },

    /**
     * Logout - Cierra la sesión actual en la base de datos
     * IMPORTANTE: El frontend debe eliminar el token del localStorage
     * al recibir la confirmación de logout
     */
    logout: async (_, __, { req, user }) => {
      try {
        const authHeader = req.headers.authorization;
        const token = authHeader?.replace('Bearer ', '') || '';

        if (!token) {
          return false;
        }

        // Cerrar sesión en BD
        const closed = await closeSession(token);

        if (closed && user) {
          pdfLogger.logLogout(user.name);
          // // console.log(`✅ Usuario cerró sesión: ${user.name}`);
        }

        return closed;
      } catch (error) {
        console.error('❌ Error en logout:', error);
        return false;
      }
    },

    /**
     * Close User Session - Cierra remotamente la sesión de un usuario (Admin only)
     * SEGURIDAD: Solo el administrador (e.zuluaga@prexxa.com.co) puede ejecutar esta acción
     */
    closeUserSession: async (_, { sessionId }, { user }) => {
      try {
        // Validación 1: Usuario debe estar autenticado
        if (!user) {
          throw new Error('No autenticado');
        }

        // Validación 2: Solo el administrador puede cerrar sesiones remotamente
        const ADMIN_EMAIL = 'e.zuluaga@prexxa.com.co';
        if (user.email !== ADMIN_EMAIL && user.email !== 'e.zuluaga') {
          throw new Error('No autorizado. Esta función es solo para administradores.');
        }

        // Cerrar la sesión en la base de datos
        const result = await query(`
          UPDATE user_sessions
          SET is_active = false, logout_time = NOW(), updated_at = NOW()
          WHERE id = $1 AND is_active = true
          RETURNING id, user_id
        `, [sessionId]);

        if (result.rows.length > 0) {
          const closedSession = result.rows[0];

          // PASO 1: Forzar logout inmediato del usuario (WebSocket en tiempo real)
          websocketService.emitSessionClosed(closedSession.user_id, closedSession.id);

          // PASO 2: Notificar actualización del panel de sesiones al admin
          websocketService.emitSessionsUpdated({ action: 'session_closed', sessionId: closedSession.id });

          return true;
        } else {
          console.warn(`⚠️ No se encontró sesión activa con ID ${sessionId}`);
          return false;
        }
      } catch (error) {
        console.error('❌ Error cerrando sesión remota:', error);
        throw new Error(`Error al cerrar sesión: ${error.message}`);
      }
    },

    updateUser: async (_, { id, name, email }, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.id !== id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      const result = await query(
        'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING *',
        [name, email, id]
      );

      return result.rows[0];
    },

    deleteUser: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (user.role !== 'admin') throw new Error('No autorizado');

      await query('DELETE FROM users WHERE id = $1', [id]);
      return true;
    },

    updateEmailNotifications: async (_, { enabled }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(
        'UPDATE users SET email_notifications = $1 WHERE id = $2 RETURNING *',
        [enabled, user.id]
      );

      return result.rows[0];
    },

    uploadDocument: async (_, { title, description }, { user }) => {
      if (!user) throw new Error('No autenticado');

      // Esta mutation se usa desde GraphQL directo, pero normalmente
      // el archivo se sube por el endpoint REST /api/upload
      return {
        success: false,
        message: 'Use el endpoint /api/upload para subir archivos',
        document: null
      };
    },

    createCausacionTestFactura: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');
      if (!isCausacionTestUser(user)) {
        throw new Error('No autorizado');
      }

      const fvTypeResult = await query(
        `SELECT id FROM document_types WHERE code = 'FV' LIMIT 1`
      );

      if (fvTypeResult.rows.length === 0) {
        throw new Error('No existe el tipo documental FV');
      }

      const roleResult = await query(
        `SELECT id, role_name, role_code
         FROM document_type_roles
         WHERE document_type_id = $1
         ORDER BY order_position ASC`,
        [fvTypeResult.rows[0].id]
      );

      const findRole = (...keys) => roleResult.rows.find(role => {
        const text = normalizeForRoleMatch(`${role.role_name || ''} ${role.role_code || ''}`);
        return keys.some(key => text.includes(normalizeForRoleMatch(key)));
      });

      const negociadorRole = findRole('NEGOCIADOR') || {};
      const findRoleByCode = (...codes) => roleResult.rows.find(role => {
        const code = normalizeForRoleMatch(role.role_code || '');
        return codes.some(expectedCode => code === normalizeForRoleMatch(expectedCode));
      });

      const negociacionesRole = findRoleByCode('RESPONSABLE_NEGOCIACIONES') || findRole('NEGOCIACION') || {};
      const respCuentaRole = findRoleByCode('RESPONSABLE_CUENTA_CONTABLE') || findRole('RESP_CUENTA', 'CUENTA CONTABLE', 'CONTABLE') || {};
      const respCentroRole = findRoleByCode('RESPONSABLE_CENTRO_COSTOS') || findRole('RESP_CTRO_COST', 'CENTRO COSTO', 'CENTRO DE COSTO') || {};
      const causacionRole = findRole('CAUSACION', 'CAUSACIÓN') || {};

      const nextControlResult = await queryFacturas(
        `SELECT GREATEST(COALESCE(MAX(numero_control), 900000), 900000) + 1 AS next_control
         FROM crud_facturas."T_Facturas"`
      );
      const numeroControl = Number(nextControlResult.rows[0]?.next_control || Date.now().toString().slice(-6));
      const numeroFactura = `PR-${numeroControl}`;
      const today = new Date().toISOString().slice(0, 10);
      const jesusName = user.name || 'Jesus Bustamante';
      const testCuentaContable = '519595-JB';
      const testNombreCuenta = 'CUENTA CONTABLE PRUEBA JESUS BUSTAMANTE';
      const testCentroCosto = 'PX-JB-PRUEBA';
      const testNombreCentroCosto = 'CENTRO DE COSTOS PRUEBA JESUS BUSTAMANTE';

      await queryFacturas(
        `INSERT INTO crud_facturas."T_CentrosCostos" ("Cia_CC", "CentroCosto", "Responsable")
         SELECT $1::varchar, $2::varchar, $3::varchar
         WHERE NOT EXISTS (
           SELECT 1
           FROM crud_facturas."T_CentrosCostos"
           WHERE "Cia_CC" = $1::varchar
         )`,
        [testCentroCosto, testNombreCentroCosto, jesusName]
      );

      await queryFacturas(
        `INSERT INTO crud_facturas."T_Facturas" (
           numero_control, cia, cia_nit, nit, proveedor, numero_factura,
           fecha_radicado, fecha_factura, factura_credito, acuse_recibo_sci,
           entregada_a, fecha_entrega, en_proceso, finalizado, causado
         )
         VALUES ($1, 'PX', 'PX + 900000000-1', '900000000', 'PROVEEDOR PRUEBA CAUSACION', $2,
           CURRENT_DATE, CURRENT_DATE, false, false, $3, CURRENT_DATE, true, false, false)`,
        [numeroControl, numeroFactura, jesusName]
      );

      const templateData = {
        consecutivo: String(numeroControl),
        cia: 'PX',
        numeroFactura,
        proveedor: 'PROVEEDOR PRUEBA CAUSACION',
        fechaFactura: today,
        fechaRecepcion: today,
        legalizaAnticipo: false,
        checklistRevision: {
          facturaOriginal: true,
          ordenCompra: true,
          entradaAlmacen: true
        },
        nombreNegociador: jesusName,
        cargoNegociador: 'Entorno de pruebas',
        filasControl: [
          {
            noCuentaContable: testCuentaContable,
            respCuentaContable: jesusName,
            cargoCuentaContable: 'Responsable cuenta contable prueba',
            nombreCuentaContable: testNombreCuenta,
            centroCostos: testCentroCosto,
            respCentroCostos: jesusName,
            cargoCentroCostos: 'Responsable centro de costos prueba',
            concepto: 'Prueba de causacion autonoma',
            porcentaje: '100'
          }
        ],
        totalPorcentaje: 100,
        observaciones: 'Factura generada automaticamente para pruebas de causacion.'
      };

      const fileName = `FV_PRUEBA_CAUSACION_${numeroControl}.pdf`;
      const relativeDir = 'uploads/causacion_tests';
      const relativePath = `${relativeDir}/${fileName}`;
      const absoluteDir = path.join(__dirname, '..', relativeDir);
      const absolutePath = path.join(absoluteDir, fileName);

      await fs.mkdir(absoluteDir, { recursive: true });
      const pdfBuffer = await generateFacturaTemplatePDF(templateData, {}, false, []);
      await fs.writeFile(absolutePath, pdfBuffer);

      const documentResult = await query(
        `INSERT INTO documents (
           title, description, file_name, file_path, file_size, mime_type,
           uploaded_by, document_type_id, status, metadata, consecutivo
         )
         VALUES ($1, $2, $3, $4, $5, 'application/pdf', $6, $7, 'pending', $8, $9)
         RETURNING *`,
        [
          `FV - PRUEBA CAUSACION - ${numeroControl}`,
          'Documento generado automaticamente para pruebas de causacion.',
          fileName,
          relativePath,
          pdfBuffer.length,
          user.id,
          fvTypeResult.rows[0].id,
          templateData,
          String(numeroControl)
        ]
      );

      const documentId = documentResult.rows[0].id;
      const testCausacionGroupResult = await query(
        `INSERT INTO causacion_grupos (codigo, nombre, descripcion, activo)
         VALUES ('causacion_prueba_jesus', 'Causacion prueba Jesus Bustamante', 'Grupo de causacion exclusivo para pruebas autonomas de Jesus Bustamante', true)
         ON CONFLICT (codigo) DO UPDATE
         SET nombre = EXCLUDED.nombre,
             descripcion = EXCLUDED.descripcion,
             activo = true,
             updated_at = CURRENT_TIMESTAMP
         RETURNING id, codigo`
      );

      await query(
        `INSERT INTO causacion_integrantes (grupo_id, user_id, cargo, activo)
         VALUES ($1, $2, 'Causacion prueba', true)
         ON CONFLICT (grupo_id, user_id) DO UPDATE
         SET cargo = EXCLUDED.cargo,
             activo = true,
             updated_at = CURRENT_TIMESTAMP`,
        [testCausacionGroupResult.rows[0].id, user.id]
      );

      const testSignerUsers = [];
      for (const testUser of [
        { name: 'Prueba Negociador Docuprex', email: 'prueba.negociador@docuprex.test', adUsername: 'prueba.negociador' },
        { name: 'Prueba Negociaciones Docuprex', email: 'prueba.negociaciones@docuprex.test', adUsername: 'prueba.negociaciones' },
        { name: 'Prueba Cuenta Contable Docuprex', email: 'prueba.cuenta@docuprex.test', adUsername: 'prueba.cuenta' },
        { name: 'Prueba Responsable Centro Costos', email: 'prueba.respcc@docuprex.test', adUsername: 'prueba.respcc' },
        { name: 'Prueba Causacion Docuprex', email: 'prueba.causacion@docuprex.test', adUsername: 'prueba.causacion' }
      ]) {
        const testUserResult = await query(
          `INSERT INTO users (name, email, ad_username, role, is_active, email_notifications)
           VALUES ($1, $2, $3, 'user', true, false)
           ON CONFLICT (email) DO UPDATE
           SET name = EXCLUDED.name,
               ad_username = EXCLUDED.ad_username,
               is_active = true,
               email_notifications = false
           RETURNING id`,
          [testUser.name, testUser.email, testUser.adUsername]
        );
        testSignerUsers.push(testUserResult.rows[0].id);
      }

      const signerRows = [
        { order: 1, role: negociadorRole, roleName: negociadorRole.role_name || 'Negociador', userId: testSignerUsers[0], isGroup: false },
        { order: 2, role: negociacionesRole, roleName: negociacionesRole.role_name || 'Negociaciones', userId: testSignerUsers[1], isGroup: false },
        { order: 3, role: respCuentaRole, roleName: respCuentaRole.role_name || 'Responsable cuenta contable', userId: testSignerUsers[2], isGroup: false },
        { order: 4, role: respCentroRole, roleName: respCentroRole.role_name || 'Responsable centro de costos', userId: testSignerUsers[3], isGroup: false },
        { order: 5, role: causacionRole, roleName: causacionRole.role_name || 'Causación', userId: testSignerUsers[4], isGroup: true, grupoCodigo: testCausacionGroupResult.rows[0].codigo }
      ];

      for (const signer of signerRows) {
        const documentSignerResult = await query(
          `INSERT INTO document_signers (
             document_id, user_id, order_position, is_required,
             assigned_role_id, role_name, assigned_role_ids, role_names,
             is_causacion_group, grupo_codigo
           )
           VALUES ($1, $2, $3, TRUE, $4, $5, $6::uuid[], $7::text[], $8, $9)
           RETURNING id`,
          [
            documentId,
            signer.userId,
            signer.order,
            signer.role.id || null,
            signer.roleName,
            signer.role.id ? [signer.role.id] : [],
            [signer.roleName],
            Boolean(signer.isGroup),
            signer.grupoCodigo || null
          ]
        );

        await query(
          `INSERT INTO signatures (document_id, signer_id, document_signer_id, status, signature_type)
           VALUES ($1, $2, $3, 'pending', 'digital')`,
          [documentId, signer.userId, documentSignerResult.rows[0].id]
        );
      }

      return {
        success: true,
        message: 'Factura de prueba creada exitosamente',
        document: documentResult.rows[0]
      };
    },

    /**
     * Updates document metadata (title, description, or status)
     *
     * BUSINESS RULE: Only document owner or admin can update documents.
     * BUSINESS RULE: Null values are ignored (COALESCE preserves existing values).
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.id - ID of the document
     * @param {string} [args.title] - New title (optional)
     * @param {string} [args.description] - New description (optional)
     * @param {string} [args.status] - New status (optional)
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<Object>} Updated document object
     * @throws {Error} When unauthorized or document not found
     */
    updateDocument: async (_, { id, title, description, status }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docResult = await query('SELECT * FROM documents WHERE id = $1', [id]);
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];
      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      const result = await query(
        `UPDATE documents
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            status = COALESCE($3, status)
        WHERE id = $4
        RETURNING *`,
        [title, description, status, id]
      );

      return result.rows[0];
    },

    updatePayableInvoiceStatus: async (_, { documentId, paymentStatus }, { user }) => {
      if (!user) throw new Error('No autenticado');

      await ensurePayableInvoicesTable();

      if (!await isPayableInvoiceUser(user.id)) {
        throw new Error('No autorizado');
      }

      const normalizedStatus = String(paymentStatus || '').trim().toLowerCase();
      if (!['pending', 'paid'].includes(normalizedStatus)) {
        throw new Error('Estado de pago inválido');
      }

      const result = await query(
        `UPDATE payable_invoices
         SET payment_status = $1::varchar,
             paid_at = CASE WHEN $1::varchar = 'paid' THEN COALESCE(paid_at, CURRENT_TIMESTAMP) ELSE NULL END,
             paid_by = CASE WHEN $1::varchar = 'paid' THEN $4::uuid ELSE NULL END,
             updated_at = CURRENT_TIMESTAMP
         WHERE document_id = $2
           AND EXISTS (
             SELECT 1
             FROM payable_invoices current_pi
             WHERE current_pi.document_id = $2
               AND current_pi.user_id = $3::uuid
           )
         RETURNING *`,
        [normalizedStatus, documentId, user.id, user.id]
      );

      if (result.rows.length === 0) {
        throw new Error('Factura por pagar no encontrada');
      }

      const paidNotificationResult = normalizedStatus === 'paid'
        ? await query(
          `SELECT id
           FROM notifications
           WHERE document_id = $1
             AND type = 'payable_invoice_paid'
           LIMIT 1`,
          [documentId]
        )
        : { rows: [] };

      if (normalizedStatus === 'paid' && paidNotificationResult.rows.length === 0) {
        let notificationCreated = false;
        try {
          notificationCreated = await notifyPayableInvoicePaidCreator({ documentId, actorUserId: user.id });
        } catch (notifyError) {
          console.error('Error notificando factura pagada al creador:', notifyError);
        }

        if (notificationCreated) {
          await query(
            `UPDATE payable_invoices
             SET creator_notified_at = COALESCE(creator_notified_at, CURRENT_TIMESTAMP)
             WHERE document_id = $1
               AND user_id = $2::uuid`,
            [documentId, user.id]
          );
        }
      }

      websocketService.emitDocumentUpdated(documentId, 'payable_status_updated', {
        paymentStatus: normalizedStatus,
        userId: user.id
      });

      const docResult = await query(`
        SELECT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          pi.payment_status as payable_status,
          pi.paid_at,
          pi.paid_by,
          paid_user.name as paid_by_name,
          paid_user.email as paid_by_email
        FROM payable_invoices pi
        JOIN documents d ON d.id = pi.document_id
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN users paid_user ON paid_user.id = pi.paid_by
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        WHERE pi.document_id = $1
          AND pi.user_id = $2::uuid
      `, [documentId, user.id]);

      return docResult.rows[0];
    },

    updateTreasuryAdvancePaymentStatus: async (_, { documentId, paymentStatus }, { user }) => {
      if (!user) throw new Error('No autenticado');

      await ensureTreasuryAdvancePaymentsTable();

      if (!await isPayableInvoiceUser(user.id)) {
        throw new Error('No autorizado');
      }

      const normalizedStatus = String(paymentStatus || '').trim().toLowerCase();
      if (!['pending', 'paid'].includes(normalizedStatus)) {
        throw new Error('Estado de pago invalido');
      }

      const assignmentResult = await query(`
        SELECT ds.document_id, ds.user_id
        FROM document_signers ds
        JOIN documents d ON d.id = ds.document_id
        JOIN document_types dt ON d.document_type_id = dt.id
        JOIN signatures s ON s.document_id = ds.document_id
          AND s.signer_id = ds.user_id
          AND s.status = 'signed'
        WHERE ds.document_id = $1
          AND ds.user_id = $2::uuid
          AND dt.code = 'SA'
          AND (
            LOWER(COALESCE(ds.role_name, '')) LIKE '%tesorer%'
            OR EXISTS (
              SELECT 1
              FROM unnest(COALESCE(ds.role_names, ARRAY[]::text[])) AS role_name
              WHERE LOWER(role_name) LIKE '%tesorer%'
            )
          )
        LIMIT 1
      `, [documentId, user.id]);

      if (assignmentResult.rows.length === 0) {
        throw new Error('El estado de pago solo se puede cambiar despues de firmar el anticipo por Tesoreria');
      }

      const paymentResult = await query(
        `INSERT INTO treasury_advance_payments (
           document_id,
           user_id,
           payment_status,
           paid_at,
           paid_by,
           creator_notified_at,
           updated_at
         )
         VALUES (
           $1,
           $2::uuid,
           $3::varchar,
           CASE WHEN $3::varchar = 'paid' THEN CURRENT_TIMESTAMP ELSE NULL END,
           CASE WHEN $3::varchar = 'paid' THEN $2::uuid ELSE NULL END,
           NULL,
           CURRENT_TIMESTAMP
         )
         ON CONFLICT (document_id, user_id) DO UPDATE SET
           payment_status = EXCLUDED.payment_status,
           paid_at = CASE WHEN EXCLUDED.payment_status = 'paid' THEN COALESCE(treasury_advance_payments.paid_at, CURRENT_TIMESTAMP) ELSE NULL END,
           paid_by = CASE WHEN EXCLUDED.payment_status = 'paid' THEN $2::uuid ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [documentId, user.id, normalizedStatus]
      );

      const paymentRow = paymentResult.rows[0];
      if (normalizedStatus === 'paid' && !paymentRow.creator_notified_at) {
        try {
          await notifyTreasuryAdvancePaidCreator({ documentId, actorUserId: user.id });
        } catch (notifyError) {
          console.error('Error notificando anticipo pagado al creador:', notifyError);
        }

        await query(
          `UPDATE treasury_advance_payments
           SET creator_notified_at = COALESCE(creator_notified_at, CURRENT_TIMESTAMP)
           WHERE document_id = $1 AND user_id = $2::uuid`,
          [documentId, user.id]
        );
      }

      websocketService.emitDocumentUpdated(documentId, 'treasury_advance_payment_status_updated', {
        paymentStatus: normalizedStatus,
        userId: user.id
      });

      const docResult = await query(`
        SELECT DISTINCT
          d.*,
          u.name as uploaded_by_name,
          u.email as uploaded_by_email,
          dt.name as document_type_name,
          dt.code as document_type_code,
          ds.user_id as advance_payment_user_id,
          COALESCE(tap.payment_status, 'pending') as advance_payment_status,
          tap.paid_at as advance_paid_at,
          tap.paid_by as advance_paid_by,
          paid_user.name as advance_paid_by_name,
          paid_user.email as advance_paid_by_email
        FROM document_signers ds
        JOIN documents d ON d.id = ds.document_id
        JOIN users u ON d.uploaded_by = u.id
        LEFT JOIN document_types dt ON d.document_type_id = dt.id
        LEFT JOIN treasury_advance_payments tap
          ON tap.document_id = d.id AND tap.user_id = ds.user_id
        LEFT JOIN users paid_user ON paid_user.id = tap.paid_by
        WHERE ds.document_id = $1
          AND ds.user_id = $2::uuid
        LIMIT 1
      `, [documentId, user.id]);

      return docResult.rows[0];
    },

    /**
     * Assigns signers to a document with role assignments and sequential ordering
     *
     * BUSINESS RULE: Document owner is ALWAYS placed first in signing order when they add themselves.
     * BUSINESS RULE: Maximum of 3 roles can be assigned to any single signer.
     * BUSINESS RULE: Cannot add signers to completed documents.
     * BUSINESS RULE: When owner adds themselves to existing signers, all positions shift down by 1.
     * BUSINESS RULE: Only the FIRST signer receives email notification (sequential workflow).
     * BUSINESS RULE: Supports both legacy (singular) and new (array) role assignment formats.
     *
     * Sequential ordering notes:
     * - New signers are appended to the end of existing signers
     * - Owner insertion at position 1 causes automatic position increment for existing signers
     * - Positions are 1-indexed
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.documentId - ID of the document
     * @param {Array<Object>} args.signerAssignments - Array of signer assignments
     * @param {number} args.signerAssignments[].userId - ID of user to assign
     * @param {Array<number>} [args.signerAssignments[].roleIds] - Array of role IDs (max 3)
     * @param {Array<string>} [args.signerAssignments[].roleNames] - Array of role names (max 3)
     * @param {number} [args.signerAssignments[].roleId] - Legacy: single role ID
     * @param {string} [args.signerAssignments[].roleName] - Legacy: single role name
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<boolean>} True if assignment succeeds
     * @throws {Error} When unauthorized, document not found, completed, or role limit exceeded
     */
    assignSigners: async (_, { documentId, signerAssignments }, { user }) => {
      // Separar assignments en usuarios normales y grupos de causación
      const userAssignments = signerAssignments.filter(sa => !sa.isCausacionGroup && sa.userId !== null && sa.userId !== undefined);
      const grupoCausacionAssignments = signerAssignments.filter(sa => sa.isCausacionGroup && sa.grupoCodigo);
      const userIds = userAssignments.map(sa => sa.userId);

      if (!user) throw new Error('No autenticado');

      const docResult = await query(
        `SELECT d.*, dt.code as document_type_code
         FROM documents d
         LEFT JOIN document_types dt ON d.document_type_id = dt.id
         WHERE d.id = $1`,
        [documentId]
      );
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];
      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      if (doc.status === 'completed') {
        throw new Error('No se pueden agregar firmantes a un documento que ya ha sido firmado completamente');
      }

      const existingSignersResult = await query(
        'SELECT user_id, order_position, role_name, role_names FROM document_signers WHERE document_id = $1 ORDER BY order_position ASC',
        [documentId]
      );

      // Función helper para normalizar roles (soportar legacy y nuevo formato)
      const normalizeRoles = (assignment) => {
        let roleIds = assignment.roleIds || [];
        let roleNames = assignment.roleNames || [];

        // Fallback a formato legacy (singular)
        if (roleIds.length === 0 && assignment.roleId) {
          roleIds = [assignment.roleId];
        }
        if (roleNames.length === 0 && assignment.roleName) {
          roleNames = [assignment.roleName];
        }

        return { roleIds, roleNames };
      };

      for (const assignment of userAssignments) {
        const { roleIds, roleNames } = normalizeRoles(assignment);

        if (roleIds.length > 3 || roleNames.length > 3) {
          throw new Error('Un firmante no puede tener más de 3 roles asignados');
        }
      }

      const normalizeSARoleKey = (roleName) => String(roleName || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase();

      const getSARoleKey = (roleName) => {
        const raw = normalizeSARoleKey(roleName);

        if (raw.includes('solicit')) return 'solicitante';
        if (raw.includes('aprob')) return 'aprobador';
        if (raw.includes('financier') || (raw.includes('marcela') && raw.includes('arango'))) return 'financiera';
        if (raw.includes('negoci')) return 'negociaciones';
        if (raw.includes('gerencia')) return raw.includes('ejecut') ? 'gerencia_ejecutiva' : 'gerencia';
        if (raw.includes('tesorer')) return 'tesoreria';

        return raw;
      };

      if (doc.document_type_code === 'SA') {
        const assignedRoleKeys = new Set(
          userAssignments.flatMap(assignment => normalizeRoles(assignment).roleNames.map(getSARoleKey))
        );
        const requiredRoleKeys = ['solicitante', 'aprobador', 'financiera', 'tesoreria'];
        const missingRequiredRole = requiredRoleKeys.find(roleKey => !assignedRoleKeys.has(roleKey));

        if (missingRequiredRole) {
          const roleLabels = {
            solicitante: 'Solicitante',
            aprobador: 'Aprobador',
            financiera: 'Financiera',
            tesoreria: 'Tesoreria'
          };
          throw new Error(`Falta asignar el rol obligatorio ${roleLabels[missingRequiredRole]}`);
        }

        const financieraAssignment = userAssignments.find(assignment =>
          normalizeRoles(assignment).roleNames.some(roleName => getSARoleKey(roleName) === 'financiera')
        );

        const marcelaUserResult = await query(
          `SELECT id
           FROM users
           WHERE id = $1
             AND (
               LOWER(TRIM(name)) IN ('marcela arango', 'jesus bustamante', 'jesús bustamante')
               OR LOWER(TRIM(email)) IN ('m.arango@prexxa.com.co', 'j.bustamante@prexxa.com.co', 'practicantetic@prexxa.com.co')
             )
           LIMIT 1`,
          [financieraAssignment.userId]
        );

        if (marcelaUserResult.rows.length === 0) {
          throw new Error('El rol Financiera solo puede ser asignado a Marcela Arango o Jesus Bustamante');
        }

        const tesoreriaAssignment = userAssignments.find(assignment =>
          normalizeRoles(assignment).roleNames.some(roleName => getSARoleKey(roleName) === 'tesoreria')
        );

        const tesoreriaUserResult = await query(
          `SELECT id
           FROM users
           WHERE id = $1
             AND (
               LOWER(TRIM(name)) IN ('monica bustamante', 'jesus bustamante', 'jesús bustamante')
               OR LOWER(TRIM(email)) IN ('m.bustamante@prexxa.com.co', 'j.bustamante@prexxa.com.co', 'practicantetic@prexxa.com.co')
             )
           LIMIT 1`,
          [tesoreriaAssignment.userId]
        );

        if (tesoreriaUserResult.rows.length === 0) {
          throw new Error('El rol Tesoreria solo puede ser asignado a Monica Bustamante o Jesus Bustamante');
        }

        const roleOrderWeight = {
          solicitante: 1,
          aprobador: 2,
          negociaciones: 3,
          financiera: 4,
          gerencia: 5,
          gerencia_ejecutiva: 5,
          tesoreria: 6
        };
        const findRolePosition = (roleKey) => {
          const assignmentIndex = signerAssignments.findIndex(assignment =>
            normalizeRoles(assignment).roleNames.some(roleName => getSARoleKey(roleName) === roleKey)
          );

          if (assignmentIndex === -1) {
            return -1;
          }

          return assignmentIndex * 10 + (roleOrderWeight[roleKey] || 9);
        };
        const aprobadorPosition = findRolePosition('aprobador');
        const negociacionesPosition = findRolePosition('negociaciones');
        const financieraPosition = findRolePosition('financiera');
        const tesoreriaPosition = findRolePosition('tesoreria');

        if (aprobadorPosition !== -1 && financieraPosition <= aprobadorPosition) {
          throw new Error('Financiera debe firmar despues del Aprobador');
        }

        if (negociacionesPosition !== -1 && financieraPosition <= negociacionesPosition) {
          throw new Error('Financiera debe firmar despues de Negociaciones');
        }

        if (tesoreriaPosition !== -1 && tesoreriaPosition <= financieraPosition) {
          throw new Error('Tesoreria debe firmar despues de Financiera');
        }
      }

      const upsertSignerAssignment = async ({
        userId,
        orderPosition,
        roleIds = [],
        roleNames = [],
        isCausacionGroup = false,
        grupoCodigo = null
      }) => {
        const normalizedRoleIds = Array.from(new Set((roleIds || []).filter(Boolean)));
        const normalizedRoleNames = Array.from(new Set((roleNames || []).filter(Boolean)));

        await query(
          `INSERT INTO document_signers (
            document_id, user_id, order_position, is_required,
            assigned_role_id, role_name, assigned_role_ids, role_names,
            is_causacion_group, grupo_codigo
          )
          VALUES ($1, $2, $3, TRUE, $4, $5, $6::uuid[], $7::text[], $8, $9)
          ON CONFLICT (document_id, user_id)
          DO UPDATE SET
            order_position = EXCLUDED.order_position,
            assigned_role_id = EXCLUDED.assigned_role_id,
            role_name = EXCLUDED.role_name,
            assigned_role_ids = EXCLUDED.assigned_role_ids,
            role_names = EXCLUDED.role_names,
            is_causacion_group = document_signers.is_causacion_group OR EXCLUDED.is_causacion_group,
            grupo_codigo = COALESCE(document_signers.grupo_codigo, EXCLUDED.grupo_codigo)`,
          [
            documentId,
            userId,
            orderPosition,
            normalizedRoleIds[0] || null,
            normalizedRoleNames[0] || null,
            normalizedRoleIds,
            normalizedRoleNames,
            isCausacionGroup,
            grupoCodigo
          ]
        );
      };

      const hasExistingSigners = existingSignersResult.rows.length > 0;
      const isOwner = doc.uploaded_by === user.id;
      const ownerInNewSigners = userIds.includes(user.id);
      const isFacturaVenta = doc.document_type_code === 'FV';
      const reservedUserIds = new Set(userIds.filter(Boolean));
      const hasDocumentSignerIdColumn = await checkSignaturesHasDocumentSignerIdColumn();

      const refreshSignatureRequestsForCurrentOrder = async () => {
        const csConstraintForRefresh = await getCausacionSignerIdConstraint();

        const actionableSignersResult = await query(
          `SELECT
             ds.user_id,
             ds.order_position,
             ds.is_causacion_group,
             ds.grupo_codigo,
             CASE
               WHEN ds.is_causacion_group = FALSE THEN COALESCE((
                 SELECT s_direct.status
                 FROM signatures s_direct
                 WHERE s_direct.document_id = ds.document_id
                   AND (
                     ${hasDocumentSignerIdColumn
                       ? `(s_direct.document_signer_id = ds.id OR (s_direct.document_signer_id IS NULL AND s_direct.signer_id = ds.user_id))`
                       : `s_direct.signer_id = ds.user_id`}
                   )
                 ORDER BY s_direct.updated_at DESC NULLS LAST, s_direct.created_at DESC NULLS LAST
                 LIMIT 1
               ), 'pending')
               WHEN EXISTS (
                 SELECT 1
                 FROM signatures s_group
                 WHERE s_group.document_id = ds.document_id
                   AND s_group.status = 'rejected'
                   AND s_group.signer_id IN (
                     SELECT ci.user_id
                     FROM causacion_integrantes ci
                     JOIN causacion_grupos cg ON cg.id = ci.grupo_id
                     WHERE cg.codigo = ds.grupo_codigo
                       AND ci.activo = true
                   )${csConstraintForRefresh}
               ) THEN 'rejected'
               WHEN EXISTS (
                 SELECT 1
                 FROM signatures s_group
                 WHERE s_group.document_id = ds.document_id
                   AND s_group.status = 'signed'
                   AND s_group.signer_id IN (
                     SELECT ci.user_id
                     FROM causacion_integrantes ci
                     JOIN causacion_grupos cg ON cg.id = ci.grupo_id
                     WHERE cg.codigo = ds.grupo_codigo
                       AND ci.activo = true
                   )${csConstraintForRefresh}
               ) THEN 'signed'
               ELSE 'pending'
             END as signature_status
           FROM document_signers ds
           WHERE ds.document_id = $1
           ORDER BY ds.order_position ASC`,
          [documentId]
        );

        await query(
          `DELETE FROM notifications
           WHERE document_id = $1
             AND type = 'signature_request'`,
          [documentId]
        );
        websocketService.emitNotificationDeleted(documentId, null, null, 'signature_request');

        const pendingRows = actionableSignersResult.rows.filter(row => row.signature_status === 'pending');
        if (pendingRows.length === 0) {
          return;
        }

        const currentOrder = Math.min(...pendingRows.map(row => row.order_position));
        const activeRows = pendingRows.filter(row => row.order_position === currentOrder);

        for (const row of activeRows) {
          if (row.is_causacion_group && row.grupo_codigo) {
            const membersResult = await query(
              `SELECT u.id, u.name, u.email, u.email_notifications
               FROM causacion_integrantes ci
               JOIN causacion_grupos cg ON ci.grupo_id = cg.id
               JOIN users u ON u.id = ci.user_id
               WHERE cg.codigo = $1
                 AND ci.activo = true`,
              [row.grupo_codigo]
            );

            for (const member of membersResult.rows) {
              const insertResult = await query(
                `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                 VALUES ($1, 'signature_request', $2, $3, $4)
                 RETURNING id`,
                [member.id, documentId, user.id, doc.title]
              );

              websocketService.emitNotificationCreated(member.id, {
                id: insertResult.rows[0].id,
                type: 'signature_request',
                document_id: documentId,
                actor_id: user.id,
                document_title: doc.title,
                actor: {
                  id: user.id,
                  name: user.name,
                  email: user.email
                }
              });

              if (String(member.id) !== String(user.id) && member.email_notifications) {
                try {
                  await notificarAsignacionFirmante({
                    email: member.email,
                    nombreFirmante: member.name,
                    nombreDocumento: doc.title,
                    documentoId: documentId,
                    creadorDocumento: user.name,
                    tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                  });
                } catch (emailError) {
                  console.error(`Error al enviar correo a ${member.email}:`, emailError);
                }
              }
            }
          } else if (row.user_id) {
            const signerResult = await query(
              'SELECT id, name, email, email_notifications FROM users WHERE id = $1',
              [row.user_id]
            );

            if (signerResult.rows.length === 0) {
              continue;
            }

            const signer = signerResult.rows[0];
            const insertResult = await query(
              `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
               VALUES ($1, 'signature_request', $2, $3, $4)
               RETURNING id`,
              [signer.id, documentId, user.id, doc.title]
            );

            websocketService.emitNotificationCreated(signer.id, {
              id: insertResult.rows[0].id,
              type: 'signature_request',
              document_id: documentId,
              actor_id: user.id,
              document_title: doc.title,
              actor: {
                id: user.id,
                name: user.name,
                email: user.email
              }
            });

            if (String(signer.id) !== String(user.id) && signer.email_notifications) {
              try {
                await notificarAsignacionFirmante({
                  email: signer.email,
                  nombreFirmante: signer.name,
                  nombreDocumento: doc.title,
                  documentoId: documentId,
                  creadorDocumento: user.name,
                  tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                });
              } catch (emailError) {
                console.error(`Error al enviar correo a ${signer.email}:`, emailError);
              }
            }
          }
        }
      };

      console.log(`🔍 DEBUG: document_type_code='${doc.document_type_code}', isFacturaVenta=${isFacturaVenta}`);

      // ========== LÓGICA ESPECIAL PARA DOCUMENTOS FV ==========
      if (hasExistingSigners && !isFacturaVenta) {
        const signerStateJoinCondition = await getSignatureJoinCondition('s', 'ds');
        const currentSignerStateResult = await query(
          `SELECT
             ds.id,
             ds.user_id,
             ds.order_position,
             ds.assigned_role_id,
             ds.assigned_role_ids,
             ds.role_name,
             ds.role_names,
             ds.is_causacion_group,
             ds.grupo_codigo,
             COALESCE(s.status, 'pending') as signature_status
           FROM document_signers ds
           LEFT JOIN signatures s ON ${signerStateJoinCondition}
           WHERE ds.document_id = $1
           ORDER BY ds.order_position ASC`,
          [documentId]
        );

        const signedSignerRows = currentSignerStateResult.rows.filter(row => row.signature_status === 'signed');
        const isSADocument = doc.document_type_code === 'SA';
        const normalizeSARoleKey = (roleName) => String(roleName || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim()
          .toLowerCase();
        const protectedSignedRoleKeys = new Set();

        if (isSADocument) {
          signedSignerRows
            .filter(row => !row.is_causacion_group)
            .forEach(row => {
              const signedRoleNames = Array.isArray(row.role_names) && row.role_names.length > 0
                ? row.role_names
                : [row.role_name].filter(Boolean);

              signedRoleNames
                .map(normalizeSARoleKey)
                .filter(Boolean)
                .forEach(roleKey => protectedSignedRoleKeys.add(roleKey));
            });
        }
        const protectedSignedUserIds = new Set(
          signedSignerRows
            .filter(row =>
              !row.is_causacion_group &&
              row.user_id !== null &&
              row.user_id !== undefined
            )
            .map(row => row.user_id)
        );
        const protectedSignedGroupCodes = new Set(
          signedSignerRows
            .filter(row => row.is_causacion_group && row.grupo_codigo)
            .map(row => row.grupo_codigo)
        );

        const pendingSignerRows = currentSignerStateResult.rows.filter(row => row.signature_status !== 'signed');
        const currentPendingUserIds = new Set(
          pendingSignerRows
            .filter(row => !row.is_causacion_group && row.user_id !== null && row.user_id !== undefined)
            .map(row => row.user_id)
        );
        const currentPendingGroupCodes = new Set(
          pendingSignerRows
            .filter(row => row.is_causacion_group && row.grupo_codigo)
            .map(row => row.grupo_codigo)
        );

        const desiredAssignments = [];
        const desiredUserIds = new Set();
        const desiredGroupCodes = new Set();

        for (let i = 0; i < signerAssignments.length; i++) {
          const assignment = signerAssignments[i];
          const { roleIds, roleNames } = normalizeRoles(assignment);
          const orderPosition = i + 1;

          if (assignment.isCausacionGroup && assignment.grupoCodigo) {
            if (protectedSignedGroupCodes.has(assignment.grupoCodigo)) {
              continue;
            }

            const representativeResult = await query(
              `SELECT ci.user_id
               FROM causacion_integrantes ci
               JOIN causacion_grupos cg ON ci.grupo_id = cg.id
               WHERE cg.codigo = $1
                 AND ci.activo = true
                 AND ($3::boolean = true OR NOT (ci.user_id = ANY($2)))
               ORDER BY ci.created_at ASC NULLS LAST, ci.user_id ASC
               LIMIT 1`,
              [assignment.grupoCodigo, Array.from(reservedUserIds), assignment.grupoCodigo === 'causacion_prueba_jesus']
            );

            if (representativeResult.rows.length === 0) {
              throw new Error(`El grupo de causaciÃ³n ${assignment.grupoCodigo} no tiene integrantes activos disponibles porque sus miembros ya estÃ¡n asignados individualmente en este documento`);
            }

            const representativeUserId = representativeResult.rows[0].user_id;
            reservedUserIds.add(representativeUserId);
            desiredGroupCodes.add(assignment.grupoCodigo);
            desiredAssignments.push({
              userId: representativeUserId,
              orderPosition,
              roleIds,
              roleNames,
              isCausacionGroup: true,
              grupoCodigo: assignment.grupoCodigo
            });
            continue;
          }

          if (!assignment.userId || protectedSignedUserIds.has(assignment.userId)) {
            continue;
          }

          if (isSADocument && roleNames.some(roleName => protectedSignedRoleKeys.has(normalizeSARoleKey(roleName)))) {
            throw new Error('No se puede cambiar un rol que ya fue firmado en la Solicitud de Anticipo');
          }

          desiredUserIds.add(assignment.userId);
          desiredAssignments.push({
            userId: assignment.userId,
            orderPosition,
            roleIds,
            roleNames,
            isCausacionGroup: false,
            grupoCodigo: null
          });
        }

        const signersToRemove = [...currentPendingUserIds].filter(id => !desiredUserIds.has(id));
        const groupsToRemove = [...currentPendingGroupCodes].filter(code => !desiredGroupCodes.has(code));

        if (groupsToRemove.length > 0) {
          await query(
            `DELETE FROM document_signers
             WHERE document_id = $1
               AND is_causacion_group = TRUE
               AND grupo_codigo = ANY($2)`,
            [documentId, groupsToRemove]
          );
        }

        if (signersToRemove.length > 0) {
          await query(
            `DELETE FROM document_signers
             WHERE document_id = $1
               AND is_causacion_group = FALSE
               AND user_id = ANY($2)`,
            [documentId, signersToRemove]
          );

          await query(
            `DELETE FROM signatures
             WHERE document_id = $1
               AND signer_id = ANY($2)`,
            [documentId, signersToRemove]
          );
        }

        for (const assignment of desiredAssignments) {
          await upsertSignerAssignment(assignment);

          if (!assignment.isCausacionGroup) {
            await query(
              `INSERT INTO signatures (document_id, signer_id, status, signature_type)
               VALUES ($1, $2, 'pending', 'digital')
               ON CONFLICT (document_id, signer_id) DO NOTHING`,
              [documentId, assignment.userId]
            );
          }
        }

        await refreshSignatureRequestsForCurrentOrder();
      } else if (isFacturaVenta) {
        console.log(`📄 Documento FV detectado - respetando orden basado en roles`);

        // Para documentos FV, respetar el orden del array signerAssignments
        for (let i = 0; i < userAssignments.length; i++) {
          const assignment = userAssignments[i];
          const roles = normalizeRoles(assignment);
          const orderPosition = i + 1; // Usar índice + 1 como posición

          // Insertar firmante en su posición correcta según el array
          const insertedSignerResult = await query(
            `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
             VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8::text[])
             RETURNING id`,
            [
              documentId,
              assignment.userId,
              orderPosition,
              true,
              roles.roleIds[0] || null,
              roles.roleNames[0] || null,
              roles.roleIds,
              roles.roleNames
            ]
          );
          const documentSignerId = insertedSignerResult.rows[0]?.id || null;

          // Determinar si debe autofirmar: SOLO si es propietario Y está en posición 1 Y es Negociador
          const isThisUserOwner = assignment.userId === user.id;
          const isFirstPosition = orderPosition === 1;
          const isNegociador = roles.roleNames && roles.roleNames.includes('Negociador');

          if (isThisUserOwner && isFirstPosition && isNegociador) {
            // Autofirmar
            if (hasDocumentSignerIdColumn && documentSignerId) {
              await query(
                `INSERT INTO signatures (document_id, signer_id, document_signer_id, status, signature_type, signed_at)
                 VALUES ($1, $2, $3, 'signed', 'digital', CURRENT_TIMESTAMP)`,
                [documentId, user.id, documentSignerId]
              );
            } else {
              await query(
                `INSERT INTO signatures (document_id, signer_id, status, signature_type, signed_at)
                 VALUES ($1, $2, 'signed', 'digital', CURRENT_TIMESTAMP)`,
                [documentId, user.id]
              );
            }
          } else {
            // Pendiente
            if (hasDocumentSignerIdColumn && documentSignerId) {
              await query(
                `INSERT INTO signatures (document_id, signer_id, document_signer_id, status, signature_type)
                 VALUES ($1, $2, $3, 'pending', 'digital')`,
                [documentId, assignment.userId, documentSignerId]
              );
            } else {
              await query(
                `INSERT INTO signatures (document_id, signer_id, status, signature_type)
                 VALUES ($1, $2, 'pending', 'digital')`,
                [documentId, assignment.userId]
              );
            }
          }
        }

      } else {
        // ========== LÓGICA PARA OTROS TIPOS DE DOCUMENTOS (NO FV) ==========
        // Mantener comportamiento actual: propietario siempre primero

        if (hasExistingSigners && isOwner && ownerInNewSigners) {
          console.log(`👤 Propietario agregándose como firmante - reorganizando posiciones...`);

          await query(
            `UPDATE document_signers
             SET order_position = order_position + 1
             WHERE document_id = $1`,
            [documentId]
          );

          const ownerAssignment = userAssignments.find(sa => sa.userId === user.id);
          const ownerRoles = ownerAssignment ? normalizeRoles(ownerAssignment) : { roleIds: [], roleNames: [] };

          await query(
            `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
             VALUES ($1, $2, 1, $3, $4, $5, $6::uuid[], $7::text[])
             ON CONFLICT (document_id, user_id) DO NOTHING`,
            [
              documentId,
              user.id,
              true,
              ownerRoles.roleIds[0] || null,
              ownerRoles.roleNames[0] || null,
              ownerRoles.roleIds,
              ownerRoles.roleNames
            ]
          );
          // Para documentos no-FV, si el propietario queda primero debe quedar firmado.
          await query(
            `INSERT INTO signatures (document_id, signer_id, status, signature_type, signed_at)
             VALUES ($1, $2, 'signed', 'digital', CURRENT_TIMESTAMP)
             ON CONFLICT (document_id, signer_id) DO UPDATE
             SET status = 'signed', signed_at = CURRENT_TIMESTAMP`,
            [documentId, user.id]
          );
          console.log(`Auto-firma aplicada al propietario en posicion 1`);

          const otherUserIds = userIds.filter(id => id !== user.id);
          const maxPosition = existingSignersResult.rows.length + 1;

          for (let i = 0; i < otherUserIds.length; i++) {
            const assignment = userAssignments.find(sa => sa.userId === otherUserIds[i]);
            const roles = assignment ? normalizeRoles(assignment) : { roleIds: [], roleNames: [] };

            await query(
              `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
               VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8::text[])
               ON CONFLICT (document_id, user_id) DO NOTHING`,
              [
                documentId,
                otherUserIds[i],
                maxPosition + i,
                true,
                roles.roleIds[0] || null,
                roles.roleNames[0] || null,
                roles.roleIds,
                roles.roleNames
              ]
            );

            await query(
              `INSERT INTO signatures (document_id, signer_id, status, signature_type)
               VALUES ($1, $2, 'pending', 'digital')
               ON CONFLICT (document_id, signer_id) DO NOTHING`,
              [documentId, otherUserIds[i]]
            );
          }
        } else if (hasExistingSigners) {
          const maxPosition = Math.max(...existingSignersResult.rows.map(r => r.order_position));

          for (let i = 0; i < userIds.length; i++) {
            const assignment = userAssignments.find(sa => sa.userId === userIds[i]);
            const roles = assignment ? normalizeRoles(assignment) : { roleIds: [], roleNames: [] };

            await query(
              `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
               VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8::text[])
               ON CONFLICT (document_id, user_id) DO NOTHING`,
              [
                documentId,
                userIds[i],
                maxPosition + i + 1,
                true,
                roles.roleIds[0] || null,
                roles.roleNames[0] || null,
                roles.roleIds,
                roles.roleNames
              ]
            );

            await query(
              `INSERT INTO signatures (document_id, signer_id, status, signature_type)
               VALUES ($1, $2, 'pending', 'digital')
               ON CONFLICT (document_id, signer_id) DO NOTHING`,
              [documentId, userIds[i]]
            );
          }
        } else {
          // No hay firmantes existentes - primera asignación
          let startPosition = 1;

          if (isOwner && ownerInNewSigners) {
            const ownerAssignment = userAssignments.find(sa => sa.userId === user.id);
            const ownerRoles = ownerAssignment ? normalizeRoles(ownerAssignment) : { roleIds: [], roleNames: [] };

            await query(
              `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
               VALUES ($1, $2, 1, $3, $4, $5, $6::uuid[], $7::text[])`,
              [
                documentId,
                user.id,
                true,
                ownerRoles.roleIds[0] || null,
                ownerRoles.roleNames[0] || null,
                ownerRoles.roleIds,
                ownerRoles.roleNames
              ]
            );
            // Para documentos no-FV, si el propietario queda primero debe quedar firmado.
            await query(
              `INSERT INTO signatures (document_id, signer_id, status, signature_type, signed_at)
               VALUES ($1, $2, 'signed', 'digital', CURRENT_TIMESTAMP)`,
              [documentId, user.id]
            );
            console.log(`Auto-firma aplicada al propietario en posicion 1`);

            startPosition = 2;
          }

          const otherUserIds = ownerInNewSigners ? userIds.filter(id => id !== user.id) : userIds;
          for (let i = 0; i < otherUserIds.length; i++) {
            const assignment = userAssignments.find(sa => sa.userId === otherUserIds[i]);
            const roles = assignment ? normalizeRoles(assignment) : { roleIds: [], roleNames: [] };

            await query(
              `INSERT INTO document_signers (document_id, user_id, order_position, is_required, assigned_role_id, role_name, assigned_role_ids, role_names)
               VALUES ($1, $2, $3, $4, $5, $6, $7::uuid[], $8::text[])`,
              [
                documentId,
                otherUserIds[i],
                startPosition + i,
                true,
                roles.roleIds[0] || null,
                roles.roleNames[0] || null,
                roles.roleIds,
                roles.roleNames
              ]
            );

            await query(
              `INSERT INTO signatures (document_id, signer_id, status, signature_type)
               VALUES ($1, $2, 'pending', 'digital')`,
              [documentId, otherUserIds[i]]
            );
          }
        }
      }

      // ========== AGREGAR GRUPOS DE CAUSACIÓN (si existen) ==========
      if (grupoCausacionAssignments.length > 0) {
        // Obtener la máxima posición actual de firmantes
        const maxPosResult = await query(
          'SELECT COALESCE(MAX(order_position), 0) as max_pos FROM document_signers WHERE document_id = $1',
          [documentId]
        );
        let currentMaxPos = parseInt(maxPosResult.rows[0].max_pos) || 0;

        for (const grupoAssignment of grupoCausacionAssignments) {
          const { roleIds, roleNames } = normalizeRoles(grupoAssignment);
          currentMaxPos++;

          const representativeResult = await query(`
            SELECT ci.user_id
            FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = $1
              AND ci.activo = true
              AND ($3::boolean = true OR NOT (ci.user_id = ANY($2)))
            ORDER BY ci.created_at ASC NULLS LAST, ci.user_id ASC
            LIMIT 1
          `, [grupoAssignment.grupoCodigo, Array.from(reservedUserIds), grupoAssignment.grupoCodigo === 'causacion_prueba_jesus']);

          if (representativeResult.rows.length === 0) {
            throw new Error(`El grupo de causación ${grupoAssignment.grupoCodigo} no tiene integrantes activos disponibles porque sus miembros ya están asignados individualmente en este documento`);
          }

          const representativeUserId = representativeResult.rows[0].user_id;
          reservedUserIds.add(representativeUserId);

          // console.log(`📋 Agregando grupo de causación: ${grupoAssignment.grupoCodigo} en posición ${currentMaxPos}`);

          await query(
            `INSERT INTO document_signers (
              document_id, user_id, order_position, is_required,
              assigned_role_id, role_name, assigned_role_ids, role_names,
              is_causacion_group, grupo_codigo
            )
            VALUES ($1, $2, $3, TRUE, $4, $5, $6::uuid[], $7::text[], TRUE, $8)`,
            [
              documentId,
              representativeUserId,
              currentMaxPos,
              roleIds[0] || null,
              roleNames[0] || null,
              roleIds,
              roleNames,
              grupoAssignment.grupoCodigo
            ]
          );

          // console.log(`✅ Grupo ${grupoAssignment.grupoCodigo} agregado en posición ${currentMaxPos}`);
        }
      }

      // Refuerzo de autofirma para documentos no-FV:
      // si el creador quedó como firmante #1, debe quedar firmado aunque el frontend no alcance
      // a ejecutar la autofirma o falle silenciosamente.
      if (!isFacturaVenta && ownerInNewSigners) {
        const firstSignerResult = await query(
          `SELECT user_id
           FROM document_signers
           WHERE document_id = $1 AND order_position = 1 AND is_causacion_group = false`,
          [documentId]
        );

        if (firstSignerResult.rows.length > 0 && firstSignerResult.rows[0].user_id === user.id) {
          await query(
            `INSERT INTO signatures (document_id, signer_id, status, signature_type, signed_at)
             VALUES ($1, $2, 'signed', 'digital', CURRENT_TIMESTAMP)
             ON CONFLICT (document_id, signer_id) DO UPDATE
             SET status = 'signed', signed_at = CURRENT_TIMESTAMP`,
            [documentId, user.id]
          );
        }
      }

      // Contar estado basado en document_signers (incluye grupos de causación)
      const signersCountResult = await query(
        `SELECT COUNT(*) as total FROM document_signers WHERE document_id = $1`,
        [documentId]
      );
      const totalSigners = parseInt(signersCountResult.rows[0].total);
      const signatureJoinConditionForCounts = await getSignatureJoinCondition('s', 'ds');
      const csConstraint = await getCausacionSignerIdConstraint();

      // Contar firmados: usuarios normales + grupos de causación con al menos un miembro que firmó
      const signedResult = await query(`
        SELECT COUNT(DISTINCT ds.id) as signed
        FROM document_signers ds
        LEFT JOIN signatures s ON (
          (ds.is_causacion_group = false AND (${signatureJoinConditionForCounts}) AND s.status = 'signed')
          OR
          (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.status = 'signed' AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
          )${csConstraint})
        )
        WHERE ds.document_id = $1 AND s.id IS NOT NULL
      `, [documentId]);
      const signed = parseInt(signedResult.rows[0].signed || 0);

      // Contar rechazados
      const rejectedResult = await query(`
        SELECT COUNT(DISTINCT ds.id) as rejected
        FROM document_signers ds
        LEFT JOIN signatures s ON (
          (ds.is_causacion_group = false AND (${signatureJoinConditionForCounts}) AND s.status = 'rejected')
          OR
          (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.status = 'rejected' AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
          )${csConstraint})
        )
        WHERE ds.document_id = $1 AND s.id IS NOT NULL
      `, [documentId]);
      const rejected = parseInt(rejectedResult.rows[0].rejected || 0);

      const pending = totalSigners - signed - rejected;
      const total = totalSigners;

      let newStatus = 'pending';

      if (rejected > 0) {
        // Si hay alguna firma rechazada, el documento está rechazado
        newStatus = 'rejected';
      } else if (total > 0 && signed === total) {
        // Si todas las firmas están completas, el documento está completado
        newStatus = 'completed';
      } else if (signed > 0 && signed < total) {
        // Si hay algunas firmas pero no todas, está en progreso
        newStatus = 'in_progress';
      } else if (pending > 0 && signed === 0) {
        // Si hay firmas pendientes pero ninguna firmada, está pendiente
        newStatus = 'pending';
      }

      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        [newStatus, documentId]
      );

      // ========== CREAR NOTIFICACIONES Y ENVIAR EMAILS A FIRMANTES ==========
      if (!(hasExistingSigners && !isFacturaVenta)) try {
        const docResult = await query(
          'SELECT d.title, u.name as creator_name FROM documents d JOIN users u ON d.uploaded_by = u.id WHERE d.id = $1',
          [documentId]
        );

        if (docResult.rows.length > 0) {
          const docTitle = docResult.rows[0].title;
          const creatorName = docResult.rows[0].creator_name;

          // Determinar el PRIMER firmante pendiente en orden de firma
          const firstSignerResult = await query(
            `SELECT ds.user_id, ds.is_causacion_group, ds.grupo_codigo
             FROM document_signers ds
             WHERE ds.document_id = $1
               AND NOT EXISTS (
                 SELECT 1
                 FROM signatures s
                 WHERE s.document_id = ds.document_id
                   AND (
                     (ds.is_causacion_group = false AND s.signer_id = ds.user_id AND s.status IN ('signed', 'rejected'))
                     OR
                     (ds.is_causacion_group = true AND s.status IN ('signed', 'rejected') AND s.signer_id IN (
                       SELECT ci.user_id
                       FROM causacion_integrantes ci
                       JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                       WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
                     )${csConstraint})
                   )
               )
             ORDER BY ds.order_position ASC
             LIMIT 1`,
            [documentId]
          );

          if (firstSignerResult.rows.length > 0) {
            const firstSigner = firstSignerResult.rows[0];

            if (firstSigner.is_causacion_group && firstSigner.grupo_codigo) {
              // ========== GRUPO DE CAUSACIÓN: Notificar a TODOS los miembros ==========
              console.log(`📋 Primer firmante es grupo de causación: ${firstSigner.grupo_codigo}`);

              const membersResult = await query(`
                SELECT u.id, u.name, u.email, u.email_notifications
                FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                JOIN users u ON ci.user_id = u.id
                WHERE cg.codigo = $1 AND ci.activo = true
              `, [firstSigner.grupo_codigo]);

              console.log(`👥 Grupo ${firstSigner.grupo_codigo} tiene ${membersResult.rows.length} miembros activos`);

              for (const member of membersResult.rows) {
                // No notificar al creador del documento
                if (member.id === user.id) {
                  console.log(`⏭️ Miembro ${member.name} es el creador, se omite notificación`);
                  continue;
                }

                // Crear notificación interna
                const insertResult = await query(
                  `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                   SELECT $1, $2::varchar, $3, $4, $5::varchar
                   WHERE NOT EXISTS (
                     SELECT 1 FROM notifications
                     WHERE user_id = $1 AND type = $2::varchar AND document_id = $3
                   )
                   RETURNING id`,
                  [member.id, 'signature_request', documentId, user.id, docTitle]
                );

                if (insertResult.rows.length > 0) {
                  console.log(`✅ Notificación creada para miembro del grupo: ${member.name}`);

                  // Emitir evento WebSocket con información completa del actor
                  websocketService.emitNotificationCreated(member.id, {
                    id: insertResult.rows[0].id,
                    type: 'signature_request',
                    document_id: documentId,
                    actor_id: user.id,
                    document_title: docTitle,
                    actor: {
                      id: user.id,
                      name: user.name,
                      email: user.email
                    }
                  });

                  // Enviar email solo si tiene notificaciones activadas
                  if (member.email_notifications) {
                    try {
                      await notificarAsignacionFirmante({
                        email: member.email,
                        nombreFirmante: member.name,
                        nombreDocumento: docTitle,
                        documentoId: documentId,
                        creadorDocumento: creatorName,
                        tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                      });
                      console.log(`📧 Correo enviado a miembro del grupo: ${member.email}`);
                    } catch (emailError) {
                      console.error(`Error al enviar correo a ${member.email}:`, emailError);
                    }
                  } else {
                    console.log(`⏭️ Notificaciones email desactivadas para: ${member.email}`);
                  }
                }
              }
            } else if (firstSigner.user_id) {
              // ========== USUARIO NORMAL: Notificar solo a ese usuario ==========
              const firstSignerId = firstSigner.user_id;

              if (firstSignerId !== user.id) {
                const insertResult = await query(
                  `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                   SELECT $1, $2::varchar, $3, $4, $5::varchar
                   WHERE NOT EXISTS (
                     SELECT 1 FROM notifications
                     WHERE user_id = $1 AND type = $2::varchar AND document_id = $3
                   )
                   RETURNING id`,
                  [firstSignerId, 'signature_request', documentId, user.id, docTitle]
                );

                if (insertResult.rows.length > 0) {
                  // // console.log(`✅ Notificación creada para primer firmante pendiente (user_id: ${firstSignerId})`);

                  // Emitir evento WebSocket con información completa del actor
                  websocketService.emitNotificationCreated(firstSignerId, {
                    id: insertResult.rows[0].id,
                    type: 'signature_request',
                    document_id: documentId,
                    actor_id: user.id,
                    document_title: docTitle,
                    actor: {
                      id: user.id,
                      name: user.name,
                      email: user.email
                    }
                  });

                  try {
                    const signerResult = await query('SELECT name, email, email_notifications FROM users WHERE id = $1', [firstSignerId]);
                    if (signerResult.rows.length > 0) {
                      const signer = signerResult.rows[0];
                      if (signer.email_notifications) {
                        await notificarAsignacionFirmante({
                          email: signer.email,
                          nombreFirmante: signer.name,
                          nombreDocumento: docTitle,
                          documentoId: documentId,
                          creadorDocumento: creatorName,
                          tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                        });
                        console.log(`📧 Correo enviado al primer firmante: ${signer.email}`);
                      } else {
                        // // console.log(`⏭️ Notificaciones desactivadas para: ${signer.email}`);
                      }
                    }
                  } catch (emailError) {
                    console.error(`Error al enviar correo al primer firmante:`, emailError);
                  }
                }
              } else {
                // // console.log(`⏭️ Primer firmante es el creador del documento (user_id: ${firstSignerId}), se autofirmará sin notificación`);
              }
            }
          }
        }
      } catch (notifError) {
        console.error('Error al crear notificaciones de firmantes:', notifError);
        // No lanzamos el error para que no falle la asignación
      }

      // ========== REGISTRAR ASIGNACIONES EN LOGS ==========
      try {
        // Obtener nombre del usuario que asigna
        const assignerResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
        if (assignerResult.rows.length === 0) {
          throw new Error('Usuario asignador no encontrado');
        }
        const assignerName = assignerResult.rows[0].name;

        const docTitleResult = await query('SELECT title FROM documents WHERE id = $1', [documentId]);
        if (docTitleResult.rows.length > 0) {
          const documentTitle = docTitleResult.rows[0].title;

          // Registrar cada asignación (solo usuarios válidos, no grupos)
          for (const assignment of userAssignments) {
            const signerResult = await query('SELECT name FROM users WHERE id = $1', [assignment.userId]);
            if (signerResult.rows.length > 0) {
              const signerName = signerResult.rows[0].name;

              // Obtener nombres de roles
              let roleText = null;
              if (assignment.roleIds && assignment.roleIds.length > 0) {
                const rolesResult = await query(
                  'SELECT role_name FROM document_type_roles WHERE id = ANY($1)',
                  [assignment.roleIds]
                );
                if (rolesResult.rows.length > 0) {
                  roleText = rolesResult.rows.map(r => r.role_name).join(', ');
                }
              }

              pdfLogger.logSignerAssigned(assignerName, signerName, documentTitle, roleText);
            }
          }
        }
      } catch (logError) {
        console.error('Error al registrar logs de asignación:', logError);
        // No lanzar error para que no falle la asignación
      }

      // ========== GENERAR O ACTUALIZAR PÁGINA DE PORTADA ==========
      try {
        if (hasExistingSigners) {
          console.log(`🔄 Actualizando página de portada para documento ${documentId}...`);
        } else {
          // console.log(`📋 Generando página de portada para documento ${documentId}...`);
        }

        console.log(`🔍 assignSigners: Buscando documento ID=${documentId}...`);
        const docInfoResult = await query(
          `SELECT d.*, u.name as uploader_name, dt.name as document_type_name, dt.code as document_type_code
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          WHERE d.id = $1`,
          [documentId]
        );

        console.log(`   📊 Resultado de búsqueda: ${docInfoResult.rows.length} fila(s)`);
        if (docInfoResult.rows.length === 0) {
          console.error(`❌ assignSigners: Documento ID=${documentId} NO ENCONTRADO en la base de datos`);
          throw new Error('Documento no encontrado');
        }
        console.log(`✅ assignSigners: Documento ID=${documentId} encontrado - Título: "${docInfoResult.rows[0].title}"`);

        const docInfo = docInfoResult.rows[0];

        const signersResult = await query(
          `SELECT
            u.id,
            COALESCE(u.name, cg.nombre) as name,
            u.email,
            ds.order_position,
            ds.role_name,
            ds.role_names,
            ds.is_causacion_group,
            ds.grupo_codigo,
            cg.nombre as grupo_nombre,
            COALESCE(s.status, 'pending') as status,
            s.signed_at,
            s.rejected_at,
            s.rejection_reason,
            NULL as consecutivo,
            signer_user.name as real_signer_name,
            signer_user.email as signer_email,
            NULL as retention_percentage,
            NULL as retention_reason,
            NULL as retained_at
          FROM document_signers ds
          LEFT JOIN users u ON ds.user_id = u.id
          LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
          LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
            (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
            (ds.is_causacion_group = true AND s.signer_id IN (
              SELECT ci.user_id
              FROM causacion_integrantes ci
              JOIN causacion_grupos cg2 ON ci.grupo_id = cg2.id
              WHERE cg2.codigo = ds.grupo_codigo AND ci.activo = true
            )${csConstraint})
          )
          LEFT JOIN users signer_user ON s.signer_id = signer_user.id
          WHERE ds.document_id = $1
          ORDER BY ds.order_position ASC`,
          [documentId]
        );

        const signers = signersResult.rows;

        if (signers.length === 0) {
          console.log('⚠️ No hay firmantes asignados, saltando generación de portada');
          return true;
        }

        // Construir la ruta completa al archivo PDF
        // file_path ya incluye "uploads/" en su valor
        let pdfPath = path.join(__dirname, '..', docInfo.file_path);

        // console.log(`📂 Ruta del PDF: ${pdfPath}`);

        // ========== GENERAR PDF DEL TEMPLATE DE FACTURA SI APLICA ==========
        const isFVDocument = docInfo.document_type_code === 'FV';
        const hasMetadata = docInfo.metadata && typeof docInfo.metadata === 'object' && Object.keys(docInfo.metadata).length > 0;

        if (isFVDocument && hasMetadata && !hasExistingSigners) {
          try {
            console.log('📋 Documento FV con metadata detectado, generando PDF de plantilla...');

            const templateData = typeof docInfo.metadata === 'string'
              ? JSON.parse(docInfo.metadata)
              : docInfo.metadata;

            // Obtener retenciones activas del documento
            const retentionData = docInfo.retention_data
              ? (typeof docInfo.retention_data === 'string' ? JSON.parse(docInfo.retention_data) : docInfo.retention_data).filter(r => r.activa)
              : [];

            const templatePdfBuffer = await generateFacturaTemplatePDF(templateData, {}, false, retentionData);

            const templatePdfPath = pdfPath.replace('.pdf', '_template.pdf');
            await fs.writeFile(templatePdfPath, templatePdfBuffer);


            const originalPdfPath = pdfPath;
            const mergedPdfPath = pdfPath.replace('.pdf', '_merged.pdf');

            // Los backups ya se hicieron al subir los archivos, aquí solo fusionamos
            // console.log(`📋 Fusionando plantilla con documento original...`);
            await mergePDFs([templatePdfPath, originalPdfPath], mergedPdfPath);

            // console.log(`✅ PDFs fusionados: ${mergedPdfPath}`);

            await fs.unlink(originalPdfPath);
            await fs.rename(mergedPdfPath, originalPdfPath);
            await cleanupTempFiles([templatePdfPath]);

            // console.log(`✅ PDF original reemplazado con PDF fusionado`);

            pdfPath = originalPdfPath;
          } catch (templateError) {
            console.error('❌ Error al generar/fusionar PDF de plantilla:', templateError);
          }
        }

        // Preparar información del documento para la portada
        let cia = null;

        if (docInfo.metadata && typeof docInfo.metadata === 'object') {
          cia = docInfo.metadata.cia || null;
        } else if (docInfo.metadata && typeof docInfo.metadata === 'string') {
          try {
            const parsedMetadata = JSON.parse(docInfo.metadata);
            cia = parsedMetadata.cia || null;
          } catch (e) {
            console.warn('⚠️ No se pudo parsear metadata como JSON');
          }
        }

        const sentAtResult3 = await query(
          `SELECT MIN(created_at) as sent_at FROM document_signers WHERE document_id = $1`,
          [documentId]
        );

        const documentInfo = {
          title: docInfo.title,
          fileName: docInfo.file_name,
          createdAt: docInfo.created_at,
          sentAt: sentAtResult3.rows[0]?.sent_at || null,
          uploadedBy: docInfo.uploader_name || 'Sistema',
          documentTypeName: docInfo.document_type_name || null,
          cia: cia
        };

        // Si ya existían firmantes, actualizar la página; si no, crear nueva
        if (hasExistingSigners) {
          await updateSignersPage(pdfPath, signers, documentInfo);
        } else {
          await addCoverPageWithSigners(pdfPath, signers, documentInfo);
        }
      } catch (coverError) {
        console.error('❌ Error al generar/actualizar página de portada:', coverError);
        // No lanzamos el error para que no falle la asignación de firmantes
        // Solo registramos el error en los logs
      }

      // Emitir evento WebSocket para notificar a todos los clientes
      websocketService.emitDocumentUpdated(documentId, 'signers_assigned', {
        assignedBy: user.name,
        signerCount: signerAssignments.length
      });

      return true;
    },

    /**
     * Deletes a document and its associated file from the file system
     *
     * BUSINESS RULE: Only document owner or admin can delete documents.
     * BUSINESS RULE: All notifications related to the document are deleted (cascade).
     * BUSINESS RULE: Physical PDF file is deleted from uploads directory.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.id - ID of the document to delete
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<boolean>} True if deletion succeeds
     * @throws {Error} When unauthorized or document not found
     */
    deleteDocument: async (_, { id }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const docResult = await query('SELECT * FROM documents WHERE id = $1', [id]);
      if (docResult.rows.length === 0) throw new Error('Documento no encontrado');

      const doc = docResult.rows[0];
      if (doc.uploaded_by !== user.id && user.role !== 'admin') {
        throw new Error('No autorizado');
      }

      // ========== ELIMINAR TODAS LAS NOTIFICACIONES DEL DOCUMENTO ==========
      try {
        await query(
          `DELETE FROM notifications WHERE document_id = $1`,
          [id]
        );

        // console.log(`🗑️ Todas las notificaciones del documento eliminadas`);

        // Emitir evento WebSocket para eliminar notificaciones en frontend
        websocketService.emitNotificationDeleted(id, null);
      } catch (notifError) {
        console.error('Error al eliminar notificaciones:', notifError);
        // No lanzamos el error para que no falle la eliminación
      }

      const fs = require('fs');
      const path = require('path');
      // file_path ya incluye 'uploads/', así que lo quitamos para construir la ruta correcta
      const relativePath = doc.file_path.replace(/^uploads\//, '');
      const filePath = path.join(__dirname, '..', 'uploads', relativePath);

      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          // console.log(`🗑️ Archivo eliminado: ${filePath}`);
        }
      } catch (err) {
        console.error('Error al eliminar archivo:', err);
      }

      // ========== ELIMINAR ARCHIVOS DE BACKUP ORIGINALES ==========
      if (doc.original_pdf_backup) {
        try {
          const backupPaths = JSON.parse(doc.original_pdf_backup);
          // console.log(`🗑️ Eliminando ${backupPaths.length} archivo(s) de backup...`);

          for (let i = 0; i < backupPaths.length; i++) {
            const backupRelativePath = backupPaths[i].replace(/^uploads\//, '');
            const backupFullPath = path.join(__dirname, '..', 'uploads', backupRelativePath);

            try {
              if (fs.existsSync(backupFullPath)) {
                fs.unlinkSync(backupFullPath);
                // console.log(`   ✅ Backup ${i + 1}/${backupPaths.length} eliminado: ${path.basename(backupFullPath)}`);
              } else {
                console.log(`   ⚠️ Backup ${i + 1}/${backupPaths.length} no encontrado: ${path.basename(backupFullPath)}`);
              }
            } catch (backupErr) {
              console.error(`   ❌ Error al eliminar backup ${i + 1}:`, backupErr.message);
            }
          }

          // console.log(`✅ Backups eliminados exitosamente`);
        } catch (parseError) {
          console.error('⚠️ Error al parsear backups para eliminar:', parseError.message);
        }
      }

      await query('DELETE FROM documents WHERE id = $1', [id]);

      // Registrar eliminación en logs
      try {
        const deleterResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
        if (deleterResult.rows.length > 0) {
          const deleterName = deleterResult.rows[0].name;
          pdfLogger.logDocumentDeleted(deleterName, doc.title);
        }
      } catch (logError) {
        console.error('Error al registrar log de eliminación:', logError);
      }

      // ========== GESTIONAR ESTADO DE FACTURA SI ES TIPO FV ==========
      try {
        const docTypeResult = await query(
          `SELECT dt.code
           FROM document_types dt
           WHERE dt.id = $1`,
          [doc.document_type_id]
        );

        if (docTypeResult.rows.length > 0) {
          const docType = docTypeResult.rows[0];

          // Solo procesar si es un documento de tipo FV y tiene consecutivo
          if (docType.code === 'FV' && doc.consecutivo) {
            const axios = require('axios');
            const backendHost = serverConfig.backendUrl;

            // Verificar si alguien del grupo de causación ya firmó (documento causado)
            const causacionSignedResult = await query(
              `SELECT COUNT(*) as causacion_signed
               FROM document_signers ds
               JOIN signatures s ON s.document_id = ds.document_id AND s.status = 'signed'
               WHERE ds.document_id = $1
                 AND ds.is_causacion_group = true
                 AND s.signer_id IN (
                   SELECT ci.user_id
                   FROM causacion_integrantes ci
                   JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                   WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
                 )`,
              [id]
            );
            const causacionSigned = parseInt(causacionSignedResult.rows[0].causacion_signed || 0);

            // console.log(`🔍 [DELETE] Estado de causación:`);
            console.log(`   - Firmantes del grupo de causación: ${causacionSigned}`);

            // Si alguien del grupo de causación firmó, el documento ya está CAUSADO
            // No hacemos nada - la factura permanece causada
            if (causacionSigned > 0) {
              console.log(`ℹ️  Factura ${doc.consecutivo} ya está CAUSADA (grupo de causación firmó). No se modifica estado.`);
            } else {
              // Si nadie del grupo de causación firmó, desmarcar en-proceso
              try {
                await axios.post(
                  `${backendHost}/api/facturas/desmarcar-en-proceso/${doc.consecutivo}`,
                  {},
                  { headers: { 'Content-Type': 'application/json' } }
                );
                // console.log(`✅ Factura ${doc.consecutivo} desmarcada EN-PROCESO (documento eliminado antes de causación)`);
              } catch (desmarcarError) {
                console.error(`❌ Error al desmarcar factura:`, desmarcarError.message);
              }
            }
          }
        }
      } catch (facturaError) {
        console.error('❌ Error al actualizar estados de factura:', facturaError);
        // No lanzamos el error para que no falle la eliminación
      }

      // Emitir evento WebSocket para notificar a todos los clientes
      websocketService.emitDocumentDeleted(id, {
        deletedBy: user.name,
        title: doc.title
      });

      return true;
    },

    /**
     * Actualiza la plantilla de factura de un documento existente
     * BUSINESS RULE: Solo el creador puede editar
     * BUSINESS RULE: Solo si nadie más ha firmado (autofirma no cuenta)
     * WORKFLOW:
     * 1. Verificar permisos
     * 2. Actualizar templateData en BD
     * 3. Regenerar PDF con Puppeteer
     * 4. Actualizar firmantes (añadir/eliminar según cambios)
     * 5. Enviar notificaciones a nuevos firmantes
     * 6. Eliminar notificaciones de firmantes eliminados
     */
    updateFacturaTemplate: async (_, { documentId, templateData }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        // Verificar que el documento existe y el usuario es el creador
        const docResult = await client.query(
          `SELECT d.*, u.name as uploader_name, dt.name as document_type_name, dt.code as document_type_code
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docResult.rows.length === 0) {
          throw new Error('Documento no encontrado');
        }

        const doc = docResult.rows[0];

        if (doc.uploaded_by !== user.id) {
          throw new Error('Solo el creador del documento puede editar la planilla');
        }

        if (isCausacionTestDocument(doc)) {
          throw new Error('Las facturas de prueba de causación ya vienen con firmantes asignados y no se editan desde la planilla');
        }

        // Parsear templateData
        const parsedTemplateData = JSON.parse(templateData);
        const currentTemplateData = doc.metadata
          ? (typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata)
          : {};

        if (!parsedTemplateData.source && currentTemplateData.source) {
          parsedTemplateData.source = currentTemplateData.source;
        }

        if (!parsedTemplateData.ingestionSource && currentTemplateData.ingestionSource) {
          parsedTemplateData.ingestionSource = currentTemplateData.ingestionSource;
        }
        console.log('📝 Actualizando template para documento:', documentId);

        const obtenerFirmasDocumentoTx = async (docId, currentTemplateData = null) => {
          const firmasMap = {};
          const { realSignerNameSelect } = await getSignatureColumnSelects();

          const normalizarNombre = (nombre) => {
            if (!nombre) return '';
            return nombre.trim().toUpperCase().replace(/\s+/g, ' ');
          };

          const nombresCoinciden = (nombre1, nombre2) => {
            const n1 = normalizarNombre(nombre1);
            const n2 = normalizarNombre(nombre2);

            if (n1 === n2) return true;

            const words1 = n1.split(' ').filter(w => w.length > 2);
            const words2 = n2.split(' ').filter(w => w.length > 2);

            let matchCount = 0;
            words1.forEach(w1 => {
              if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
                matchCount++;
              }
            });

            return matchCount >= 2;
          };

          const signersResult = await client.query(
            `SELECT s.signer_id, s.status, ${realSignerNameSelect}, u.name
             FROM signatures s
             JOIN users u ON s.signer_id = u.id
             WHERE s.document_id = $1 AND s.status = 'signed'`,
            [docId]
          );

          signersResult.rows.forEach(signer => {
            const nombreFirmante = signer.real_signer_name || signer.name;

            if (currentTemplateData?.filasControl && Array.isArray(currentTemplateData.filasControl)) {
              currentTemplateData.filasControl.forEach(fila => {
                if (fila.respCuentaContable && nombresCoinciden(signer.name, fila.respCuentaContable)) {
                  firmasMap[fila.respCuentaContable] = nombreFirmante;
                }
                if (fila.respCentroCostos && nombresCoinciden(signer.name, fila.respCentroCostos)) {
                  firmasMap[fila.respCentroCostos] = nombreFirmante;
                }
              });
            }

            if (currentTemplateData?.nombreNegociador && nombresCoinciden(signer.name, currentTemplateData.nombreNegociador)) {
              firmasMap[currentTemplateData.nombreNegociador] = nombreFirmante;
            }
          });

          return firmasMap;
        };

        const normalizarNombreFirmante = (nombre) => {
          if (!nombre) return '';
          return nombre.trim().toUpperCase().replace(/\s+/g, ' ');
        };

        const nombresFirmantesCoinciden = (nombre1, nombre2) => {
          const n1 = normalizarNombreFirmante(nombre1);
          const n2 = normalizarNombreFirmante(nombre2);

          if (!n1 || !n2) return false;
          if (n1 === n2) return true;

          const words1 = n1.split(' ').filter(w => w.length > 2);
          const words2 = n2.split(' ').filter(w => w.length > 2);

          let matchCount = 0;
          words1.forEach(w1 => {
            if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
              matchCount++;
            }
          });

          return matchCount >= 2;
        };

        const signerStateJoinCondition = await getSignatureJoinCondition('s', 'ds');
        const currentSignerStateResult = await client.query(
          `SELECT
             ds.id,
             ds.user_id,
             ds.order_position,
             ds.role_name,
             ds.role_names,
             ds.is_causacion_group,
             ds.grupo_codigo,
             u.name as user_name,
             COALESCE(s.status, 'pending') as signature_status
           FROM document_signers ds
           LEFT JOIN users u ON u.id = ds.user_id
           LEFT JOIN signatures s ON ${signerStateJoinCondition}
           WHERE ds.document_id = $1
           ORDER BY ds.order_position ASC`,
          [documentId]
        );

        const signedSignerRows = currentSignerStateResult.rows.filter(row => row.signature_status === 'signed');
        const protectedSignedUserIds = new Set(
          signedSignerRows
            .filter(row => !row.is_causacion_group && row.user_id !== null && row.user_id !== undefined)
            .map(row => row.user_id)
        );
        const protectedSignedGroupCodes = new Set(
          signedSignerRows
            .filter(row => row.is_causacion_group && row.grupo_codigo)
            .map(row => row.grupo_codigo)
        );

        const isNegociadorRole = (roles = []) => roles.some(role => typeof role === 'string' && role.trim().toUpperCase().includes('NEGOCIADOR'));
        const isNegociacionesRole = (roles = []) => roles.some(role => typeof role === 'string' && role.trim().toUpperCase().includes('NEGOCIACION'));
        const isCentroCostosRole = (roles = []) => roles.some(role => typeof role === 'string' && role.trim().toUpperCase().includes('CENTRO'));
        const isCuentaContableRole = (roles = []) => roles.some(role => typeof role === 'string' && role.trim().toUpperCase().includes('CUENTA'));

        const signedNegociadorRow = signedSignerRows.find(row => isNegociadorRole(Array.isArray(row.role_names) ? row.role_names : [row.role_name]));
        const signedNegociacionesRow = signedSignerRows.find(row => isNegociacionesRole(Array.isArray(row.role_names) ? row.role_names : [row.role_name]));
        const signedCausacionRow = signedSignerRows.find(row => row.is_causacion_group && row.grupo_codigo);
        const signedResponsableNames = new Set(
          signedSignerRows
            .filter(row => !row.is_causacion_group && (isCentroCostosRole(Array.isArray(row.role_names) ? row.role_names : [row.role_name]) || isCuentaContableRole(Array.isArray(row.role_names) ? row.role_names : [row.role_name])))
            .map(row => normalizarNombreFirmante(row.user_name))
            .filter(Boolean)
        );

        const currentFirmantes = Array.isArray(currentTemplateData.firmantes) ? currentTemplateData.firmantes : [];
        const updatedFirmantes = Array.isArray(parsedTemplateData.firmantes) ? parsedTemplateData.firmantes : [];

        const isFirmanteLocked = (firmante) => {
          if (!firmante) return false;
          if (firmante.signingStageKey === 'NEGOCIADOR' && signedNegociadorRow) return true;
          if (firmante.signingStageKey === 'NEGOCIACIONES' && signedNegociacionesRow) return true;
          if ((firmante.signingStageKey === 'CAUSACION' || firmante.grupoCodigo) && signedCausacionRow) {
            return !firmante.grupoCodigo || firmante.grupoCodigo === signedCausacionRow.grupo_codigo;
          }

          if (firmante.grupoCodigo) {
            return protectedSignedGroupCodes.has(firmante.grupoCodigo);
          }

          return signedResponsableNames.has(normalizarNombreFirmante(firmante.name));
        };

        const pendingFirmantesQueue = updatedFirmantes.filter(firmante => !isFirmanteLocked(firmante));
        const mergedFirmantes = [];

        currentFirmantes.forEach(oldFirmante => {
          if (isFirmanteLocked(oldFirmante)) {
            mergedFirmantes.push(oldFirmante);
            return;
          }

          if (pendingFirmantesQueue.length > 0) {
            mergedFirmantes.push(pendingFirmantesQueue.shift());
          }
        });

        while (pendingFirmantesQueue.length > 0) {
          mergedFirmantes.push(pendingFirmantesQueue.shift());
        }

        parsedTemplateData.firmantes = mergedFirmantes;

        if (signedNegociadorRow) {
          parsedTemplateData.nombreNegociador = currentTemplateData.nombreNegociador;
          parsedTemplateData.cargoNegociador = currentTemplateData.cargoNegociador;
        }

        if (signedCausacionRow) {
          parsedTemplateData.grupoCausacion = currentTemplateData.grupoCausacion;
        }

        if (Array.isArray(parsedTemplateData.filasControl) && Array.isArray(currentTemplateData.filasControl)) {
          const mergedFilasControl = parsedTemplateData.filasControl.map(fila => ({ ...fila }));

          currentTemplateData.filasControl.forEach((oldFila, index) => {
            const targetFila = mergedFilasControl[index] || { ...oldFila };

            if (signedResponsableNames.has(normalizarNombreFirmante(oldFila.respCentroCostos))) {
              targetFila.respCentroCostos = oldFila.respCentroCostos;
              targetFila.cargoCentroCostos = oldFila.cargoCentroCostos;
            }

            if (signedResponsableNames.has(normalizarNombreFirmante(oldFila.respCuentaContable))) {
              targetFila.respCuentaContable = oldFila.respCuentaContable;
              targetFila.cargoCuentaContable = oldFila.cargoCuentaContable;
            }

            mergedFilasControl[index] = targetFila;
          });

          parsedTemplateData.filasControl = mergedFilasControl;
        }

        // Actualizar metadata (templateData) en la BD
        // metadata es JSONB, así que pasamos el objeto parseado
        await client.query(
          'UPDATE documents SET metadata = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [parsedTemplateData, documentId]
        );

        // Sincronizar observaciones de planilla a T_Facturas
        if (doc.consecutivo) {
          await queryFacturas(
            `UPDATE crud_facturas."T_Facturas"
             SET observaciones = $2
             WHERE numero_control = $1`,
            [String(doc.consecutivo).trim(), parsedTemplateData.observaciones || null]
          );
        }

        // Obtener firmas actuales del documento
        const firmasActuales = await obtenerFirmasDocumentoTx(documentId, parsedTemplateData);

        // Obtener retenciones activas del documento
        const retentionData = doc.retention_data
          ? (typeof doc.retention_data === 'string' ? JSON.parse(doc.retention_data) : doc.retention_data).filter(r => r.activa)
          : [];

        // Regenerar PDF con Puppeteer
        console.log('🔄 Regenerando PDF con nueva plantilla...');
        const pdfBuffer = await generateFacturaTemplatePDF(parsedTemplateData, firmasActuales, false, retentionData);

        // Guardar planilla en archivo temporal
        const fs = require('fs').promises;
        const path = require('path');
        const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
        await fs.mkdir(tempDir, { recursive: true });
        const tempPlanillaPath = path.join(tempDir, `planilla_${documentId}_${Date.now()}.pdf`);
        await fs.writeFile(tempPlanillaPath, pdfBuffer);
        console.log('✅ Planilla PDF generada:', tempPlanillaPath);

        // Obtener ruta del PDF actual del documento (donde se guardará el resultado)
        const relativePath = doc.file_path.replace(/^uploads\//, '');
        const currentPdfPath = path.join(__dirname, '..', 'uploads', relativePath);

        // Verificar si existe backup(s) del PDF original
        console.log(`🔍 Verificando backups del PDF original para documento ${documentId}...`);
        console.log(`🔍 Campo original_pdf_backup en BD: ${doc.original_pdf_backup || 'NULL'}`);

        let backupFilePaths = [];
        if (doc.original_pdf_backup) {
          try {
            // Parsear el campo como JSON array
            const backupPathsArray = JSON.parse(doc.original_pdf_backup);
            console.log(`📦 Encontrados ${backupPathsArray.length} archivo(s) de backup`);

            // Verificar que cada archivo existe
            for (let i = 0; i < backupPathsArray.length; i++) {
              const relPath = backupPathsArray[i];
              const backupRelativePath = relPath.replace(/^uploads\//, '');
              const backupFullPath = path.join(__dirname, '..', 'uploads', backupRelativePath);

              try {
                await fs.access(backupFullPath);
                const backupStats = await fs.stat(backupFullPath);

                // Contar páginas del backup
                const { PDFDocument: PDFDoc } = require('pdf-lib');
                const backupBytes = await fs.readFile(backupFullPath);
                const backupPdfDoc = await PDFDoc.load(backupBytes);
                const backupPages = backupPdfDoc.getPageCount();

                // console.log(`   ✅ Backup ${i + 1}/${backupPathsArray.length}:`);
                console.log(`      - Archivo: ${path.basename(backupFullPath)}`);
                console.log(`      - Tamaño: ${Math.round(backupStats.size / 1024)} KB`);
                console.log(`      - Páginas: ${backupPages}`);

                backupFilePaths.push(backupFullPath);
              } catch (err) {
                console.error(`   ❌ Error accediendo al backup ${i + 1}: ${err.message}`);
              }
            }
          } catch (parseError) {
            console.error(`❌ Error parseando backups: ${parseError.message}`);
            console.warn('⚠️ No se pudieron cargar los backups, usando PDF actual');
            backupFilePaths = [currentPdfPath];
          }
        } else {
          // No hay backup, usar el PDF actual (fallback para documentos antiguos)
          console.warn('⚠️ No hay backups disponibles en BD, usando PDF actual (puede contener planilla vieja)');
          backupFilePaths = [currentPdfPath];
        }

        // Fusionar: Plantilla nueva + TODOS los PDFs originales individuales
        const { mergePDFs } = require('../utils/pdfMerger');
        const tempMergedPath = path.join(tempDir, `merged_${documentId}_${Date.now()}.pdf`);

        // Construir array de archivos a fusionar: [plantilla, backup1, backup2, ...]
        const filesToMerge = [tempPlanillaPath, ...backupFilePaths];

        console.log(`📋 Fusionando ${filesToMerge.length} PDFs:`);
        console.log(`   1. Plantilla nueva: ${path.basename(tempPlanillaPath)}`);
        for (let i = 0; i < backupFilePaths.length; i++) {
          console.log(`   ${i + 2}. PDF original ${i + 1}: ${path.basename(backupFilePaths[i])}`);
        }
        console.log(`   → Resultado temporal: ${tempMergedPath}`);

        // Fusionar todos los archivos
        const mergeResult = await mergePDFs(filesToMerge, tempMergedPath);

        if (!mergeResult.success) {
          throw new Error(`Error al fusionar PDFs: ${mergeResult.error || 'Error desconocido'}`);
        }

        // Verificar tamaño del resultado
        const mergedStats = await fs.stat(tempMergedPath);
        console.log(`✅ PDFs fusionados correctamente (${Math.round(mergedStats.size / 1024)} KB)`);

        // DEBUG: Ver estructura completa de templateData para firmantes
        console.log('🔍 DEBUG - parsedTemplateData.firmantes:', parsedTemplateData.firmantes);
        console.log('🔍 DEBUG - parsedTemplateData keys:', Object.keys(parsedTemplateData));

        // Procesar firmantes de la plantilla protegida
        const newFirmantes = parsedTemplateData.firmantes || [];
        console.log(`📋 Firmantes en la nueva plantilla (${newFirmantes.length}):`,
          newFirmantes.map(f => `${f.nombre || f.name || 'SIN_NOMBRE'} (${f.email || 'SIN_EMAIL'})`).join(', '));

        // Separar usuarios normales y grupos de causación (IGUAL QUE assignSigners)
        const userFirmantes = newFirmantes.filter(f => !f.grupoCodigo);
        const grupoFirmantes = newFirmantes.filter(f => f.grupoCodigo);

        console.log(`📊 Usuarios: ${userFirmantes.length}, Grupos de causación: ${grupoFirmantes.length}`);

        // Obtener firmantes actuales pendientes (solo ellos se pueden cambiar)
        const pendingSignerRows = currentSignerStateResult.rows.filter(row => row.signature_status !== 'signed');
        const currentUserIds = new Set(
          pendingSignerRows
            .filter(row => !row.is_causacion_group && row.user_id !== null && row.user_id !== undefined)
            .map(row => row.user_id)
        );
        const currentPendingGroupCodes = new Set(
          pendingSignerRows
            .filter(row => row.is_causacion_group && row.grupo_codigo)
            .map(row => row.grupo_codigo)
        );

        // Obtener usuarios de los nuevos firmantes
        // Separar firmantes con email y sin email
        const firmantesConEmail = userFirmantes.filter(f => f.email && !f.email.includes('SIN_EMAIL'));
        const firmantesSinEmail = userFirmantes.filter(f => !f.email || f.email.includes('SIN_EMAIL'));

        console.log(`📊 Firmantes con email: ${firmantesConEmail.length}, sin email: ${firmantesSinEmail.length}`);

        // Buscar por email
        const emailsToSearch = firmantesConEmail.map(f => f.email).filter(Boolean);
        let usersByEmail = [];
        if (emailsToSearch.length > 0) {
          const emailResult = await client.query(
            'SELECT id, email, name FROM users WHERE email = ANY($1)',
            [emailsToSearch]
          );
          usersByEmail = emailResult.rows;
        }

        // Buscar por nombre con matching flexible (ignorar grupos de causación que empiezan con '[')
        const firmantesPorBuscar = firmantesSinEmail.filter(f => !f.grupoCodigo && f.name && !f.name.startsWith('['));
        let usersByName = [];

        if (firmantesPorBuscar.length > 0) {
          console.log(`🔍 Buscando ${firmantesPorBuscar.length} firmantes por nombre...`);

          // Obtener todos los usuarios de la base de datos para hacer matching flexible
          const allUsersResult = await client.query(
            'SELECT id, email, name FROM users WHERE email IS NOT NULL'
          );
          const allUsers = allUsersResult.rows;
          console.log(`📊 Total usuarios en BD: ${allUsers.length}`);

          // Función de matching flexible - COPIADA EXACTAMENTE de Dashboard.jsx
          const findUserByNameMatch = (fullName, usersList) => {
            if (!fullName || !usersList || usersList.length === 0) return null;

            // Normalizar el nombre completo: uppercase y separar por palabras
            const searchWords = fullName.trim().toUpperCase().split(/\s+/).filter(w => w.length > 0);

            console.log(`  🔎 Buscando: "${fullName}" → Words: [${searchWords.join(', ')}]`);

            if (searchWords.length === 0) return null;

            // Buscar usuario que tenga coincidencia de al menos 2 palabras (nombre + apellido)
            const matched = usersList.find(user => {
              if (!user.name) return false;

              const userWords = user.name.trim().toUpperCase().split(/\s+/).filter(w => w.length > 0);

              if (userWords.length === 0) return false;

              // Contar cuántas palabras del nombre de búsqueda están en el nombre del usuario
              let matchCount = 0;
              searchWords.forEach(searchWord => {
                if (userWords.some(userWord =>
                  userWord === searchWord ||
                  userWord.startsWith(searchWord) ||
                  searchWord.startsWith(userWord)
                )) {
                  matchCount++;
                }
              });

              const hasMatch = matchCount >= 2 || (userWords.length === 1 && matchCount >= 1);

              if (hasMatch) {
                console.log(`    ✅ MATCH: "${user.name}" (matchCount: ${matchCount}/${searchWords.length}, userWords: [${userWords.join(', ')}])`);
              }

              // Requerir al menos 2 coincidencias (nombre + apellido)
              // O si el usuario tiene solo 1 palabra, que esa palabra coincida
              return hasMatch;
            });

            if (!matched) {
              console.log(`    ❌ No se encontró match`);
            }

            return matched || null;
          };

          // Buscar cada firmante con matching flexible
          for (const firmante of firmantesPorBuscar) {
            console.log(`\n🔍 Procesando firmante: "${firmante.name}"`);
            const matchedUser = findUserByNameMatch(firmante.name, allUsers);
            if (matchedUser) {
              usersByName.push(matchedUser);
              console.log(`✅ Match encontrado: "${firmante.name}" → "${matchedUser.name}" (ID: ${matchedUser.id})`);
            } else {
              console.log(`❌ NO se encontró match para: "${firmante.name}"`);
            }
          }
        }

        // Combinar resultados en un mapa unificado
        const newSignersMap = new Map();

        // Agregar usuarios encontrados por email
        usersByEmail.forEach(u => {
          newSignersMap.set(`email:${u.email}`, u.id);
        });

        // Agregar usuarios encontrados por nombre (usando el nombre ORIGINAL del template)
        firmantesPorBuscar.forEach((firmante, idx) => {
          if (usersByName[idx]) {
            newSignersMap.set(`name:${firmante.name}`, usersByName[idx].id);
          }
        });

        console.log(`👥 Usuarios encontrados (${usersByEmail.length + usersByName.length}):`,
          [...usersByEmail, ...usersByName].map(u => `${u.name} (${u.email})`).join(', '));

        // Identificar firmantes a añadir y eliminar
        const newSignerIds = new Set();
        for (const firmante of newFirmantes) {
          if (firmante.grupoCodigo) {
            continue;
          }

          // Buscar primero por email, luego por nombre
          let userId = null;
          if (firmante.email && !firmante.email.includes('SIN_EMAIL')) {
            userId = newSignersMap.get(`email:${firmante.email}`);
          }
          if (!userId && firmante.name && !firmante.name.startsWith('[')) {
            userId = newSignersMap.get(`name:${firmante.name}`);
          }

          if (userId) {
            if (protectedSignedUserIds.has(userId)) {
              continue;
            }
            newSignerIds.add(userId);
          } else if (!firmante.name.startsWith('[')) {
            // Solo advertir si no es un grupo de causación
            console.warn(`⚠️ No se encontró usuario para: ${firmante.name} (${firmante.email || 'SIN_EMAIL'})`);
          }
        }

        const newPendingGroupCodes = new Set(
          grupoFirmantes
            .map(f => f.grupoCodigo)
            .filter(Boolean)
            .filter(codigo => !protectedSignedGroupCodes.has(codigo))
        );

        // Firmantes (usuarios) a eliminar, añadir y mantener
        const signersToRemove = [...currentUserIds].filter(id => !newSignerIds.has(id));
        const signersToAdd = [...newSignerIds].filter(id => !currentUserIds.has(id));
        const signersToKeep = [...newSignerIds].filter(id => currentUserIds.has(id));
        const groupsToRemove = [...currentPendingGroupCodes].filter(code => !newPendingGroupCodes.has(code));
        const reservedUserIds = new Set([...newSignerIds, ...protectedSignedUserIds]);

        console.log(`📊 Análisis de cambios en firmantes (usuarios):`);
        console.log(`  ✅ Mantener: ${signersToKeep.length} usuarios`);
        console.log(`  ➕ Añadir: ${signersToAdd.length} usuarios`);
        console.log(`  🗑️  Eliminar: ${signersToRemove.length} usuarios`);
        console.log(`  🧊 Protegidos por firma: ${protectedSignedUserIds.size} usuarios, ${protectedSignedGroupCodes.size} grupos`);

        // Grupos de causación pendientes: eliminar solo los que aún no han firmado
        if (groupsToRemove.length > 0) {
          await client.query(
            `DELETE FROM document_signers
             WHERE document_id = $1
               AND is_causacion_group = TRUE
               AND grupo_codigo = ANY($2)`,
            [documentId, groupsToRemove]
          );
          console.log(`🗑️ Eliminados ${groupsToRemove.length} grupo(s) de causación pendientes`);
        }

        // Eliminar usuarios que ya no están
        if (signersToRemove.length > 0) {
          // Eliminar de document_signers
          await client.query(
            'DELETE FROM document_signers WHERE document_id = $1 AND user_id = ANY($2) AND is_causacion_group = FALSE',
            [documentId, signersToRemove]
          );

          // Eliminar de signatures (en cascada por FK, pero explícito es mejor)
          await client.query(
            'DELETE FROM signatures WHERE document_id = $1 AND signer_id = ANY($2)',
            [documentId, signersToRemove]
          );

          // Eliminar notificaciones de esos firmantes
          await client.query(
            'DELETE FROM notifications WHERE document_id = $1 AND user_id = ANY($2)',
            [documentId, signersToRemove]
          );

          console.log(`🗑️ Eliminados ${signersToRemove.length} usuarios`);
        }

        // ========== PROCESAR FIRMANTES (usuarios y grupos) EN ORDEN ==========
        // Procesar TODOS los firmantes (usuarios + grupos) en el orden que vienen
        const upsertDocumentSigner = async ({
          userId,
          orderPosition,
          roleNames,
          isCausacionGroup = false,
          grupoCodigo = null
        }) => {
          const normalizedRoleNames = Array.from(new Set((roleNames || []).filter(Boolean)));
          const primaryRoleName = normalizedRoleNames[0] || null;

          await client.query(
            `INSERT INTO document_signers (
              document_id, user_id, order_position, is_required,
              role_name, role_names, is_causacion_group, grupo_codigo
            )
            VALUES ($1, $2, $3, TRUE, $4, $5::text[], $6, $7)
            ON CONFLICT (document_id, user_id)
            DO UPDATE SET
              order_position = EXCLUDED.order_position,
              role_name = EXCLUDED.role_name,
              role_names = EXCLUDED.role_names,
              is_causacion_group = document_signers.is_causacion_group OR EXCLUDED.is_causacion_group,
              grupo_codigo = COALESCE(document_signers.grupo_codigo, EXCLUDED.grupo_codigo)`,
            [
              documentId,
              userId,
              orderPosition,
              primaryRoleName,
              normalizedRoleNames,
              isCausacionGroup,
              grupoCodigo
            ]
          );
        };

        const notifiedNewSignerIds = new Set();
        const desiredUserAssignments = new Map();

        for (let i = 0; i < newFirmantes.length; i++) {
          const firmante = newFirmantes[i];
          const orderPosition = i + 1;

          // Función helper para normalizar roles (igual que assignSigners)
          const normalizeRoles = (firmante) => {
            let roleNames = [];

            // role puede ser un array o un string
            if (Array.isArray(firmante.role)) {
              roleNames = firmante.role;
            } else if (typeof firmante.role === 'string') {
              roleNames = [firmante.role];
            }

            // Fallback a cargo si no hay role
            if (roleNames.length === 0 && firmante.cargo) {
              roleNames = [firmante.cargo];
            }

            return { roleNames };
          };

          // ========== GRUPO DE CAUSACIÓN ==========
          if (firmante.grupoCodigo) {
            if (protectedSignedGroupCodes.has(firmante.grupoCodigo)) {
              console.log(`🧊 Grupo de causación firmado, se conserva sin cambios: ${firmante.grupoCodigo}`);
              continue;
            }

            const { roleNames } = normalizeRoles(firmante);

            const representativeResult = await client.query(`
              SELECT ci.user_id
              FROM causacion_integrantes ci
              JOIN causacion_grupos cg ON ci.grupo_id = cg.id
              WHERE cg.codigo = $1
                AND ci.activo = true
                AND ($3::boolean = true OR NOT (ci.user_id = ANY($2)))
              ORDER BY ci.created_at ASC NULLS LAST, ci.user_id ASC
              LIMIT 1
            `, [firmante.grupoCodigo, Array.from(reservedUserIds), firmante.grupoCodigo === 'causacion_prueba_jesus']);

            if (representativeResult.rows.length === 0) {
              throw new Error(`El grupo de causación ${firmante.grupoCodigo} no tiene integrantes activos disponibles porque sus miembros ya están asignados individualmente en este documento`);
            }

            const representativeUserId = representativeResult.rows[0].user_id;
            reservedUserIds.add(representativeUserId);

            // console.log(`📋 Agregando grupo de causación: ${firmante.grupoCodigo} en posición ${orderPosition}`);

            await upsertDocumentSigner({
              userId: representativeUserId,
              orderPosition,
              roleNames,
              isCausacionGroup: true,
              grupoCodigo: firmante.grupoCodigo
            });

            // console.log(`✅ Grupo ${firmante.grupoCodigo} agregado`);
            continue;
          }

          // ========== USUARIO NORMAL ==========
          // Buscar userId primero por email, luego por nombre
          let userId = null;
          if (firmante.email && !firmante.email.includes('SIN_EMAIL')) {
            userId = newSignersMap.get(`email:${firmante.email}`);
          }
          if (!userId && firmante.name) {
            userId = newSignersMap.get(`name:${firmante.name}`);
          }

          if (!userId) {
            console.warn(`⚠️ No se encontró usuario para: ${firmante.name}`);
            continue;
          }

          if (protectedSignedUserIds.has(userId)) {
            console.log(`🧊 Firmante ya firmado, se conserva sin cambios: ${firmante.name}`);
            continue;
          }

          const { roleNames } = normalizeRoles(firmante);

          const existingDesiredAssignment = desiredUserAssignments.get(userId);
          if (existingDesiredAssignment) {
            existingDesiredAssignment.orderPosition = Math.min(existingDesiredAssignment.orderPosition, orderPosition);
            existingDesiredAssignment.roleNames = Array.from(new Set([
              ...existingDesiredAssignment.roleNames,
              ...roleNames
            ].filter(Boolean)));
          } else {
            desiredUserAssignments.set(userId, {
              userId,
              orderPosition,
              roleNames: Array.from(new Set((roleNames || []).filter(Boolean))),
              firmanteName: firmante.name
            });
          }

          continue;
        }

        for (const assignment of Array.from(desiredUserAssignments.values()).sort((a, b) => a.orderPosition - b.orderPosition)) {
          const { userId, orderPosition, roleNames, firmanteName } = assignment;

          if (signersToAdd.includes(userId)) {
            // ========== FIRMANTE NUEVO: Añadir y notificar ==========
            await upsertDocumentSigner({
              userId,
              orderPosition,
              roleNames
            });

            // Insertar en signatures
            await client.query(
              `INSERT INTO signatures (document_id, signer_id, status)
               VALUES ($1, $2, 'pending')
               ON CONFLICT (document_id, signer_id) DO NOTHING`,
              [documentId, userId]
            );

            // Crear notificación (solo para firmantes NUEVOS)
            const shouldNotifyNewSigner = String(userId) !== String(user.id) && !notifiedNewSignerIds.has(String(userId));
            const notifResult = shouldNotifyNewSigner ? await client.query(
              `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
               SELECT $1, $2::varchar, $3, $4, $5::varchar
               WHERE NOT EXISTS (
                 SELECT 1 FROM notifications
                 WHERE user_id = $1 AND type = $2::varchar AND document_id = $3
               )
               RETURNING id`,
              [userId, 'signature_request', documentId, user.id, doc.title]
            ) : { rows: [] };

            // Emitir evento WebSocket si se creó la notificación
            if (notifResult.rows.length > 0) {
              websocketService.emitNotificationCreated(userId, {
                id: notifResult.rows[0].id,
                type: 'signature_request',
                document_id: documentId,
                actor_id: user.id,
                document_title: doc.title,
                actor: {
                  id: user.id,
                  name: user.name,
                  email: user.email
                }
              });
            }

            // Enviar correo SOLO si tiene email_notifications = true
            try {
              if (shouldNotifyNewSigner) {
                const userResult = await client.query(
                  'SELECT name, email, email_notifications FROM users WHERE id = $1',
                  [userId]
                );
                if (userResult.rows.length > 0) {
                  const signerUser = userResult.rows[0];
                  if (signerUser.email_notifications) {
                    await notificarAsignacionFirmante({
                      email: signerUser.email,
                      nombreFirmante: signerUser.name,
                      nombreDocumento: doc.title,
                      documentoId: documentId,
                      creadorDocumento: user.name,
                      tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                    });
                    console.log(`📧 Correo enviado a: ${signerUser.email} (firmante NUEVO)`);
                  }
                }
                notifiedNewSignerIds.add(String(userId));
              } else {
                console.log(`Omitiendo notificación para autoasignación de ${user.name}`);
              }
            } catch (emailError) {
              console.error('Error enviando correo:', emailError);
            }

            console.log(`➕ Añadido firmante NUEVO: ${firmanteName}`);
          } else {
            // ========== FIRMANTE EXISTENTE: Solo actualizar posición/rol (SIN notificar) ==========
            await upsertDocumentSigner({
              userId,
              orderPosition,
              roleNames
            });
            console.log(`🔄 Actualizado firmante existente: ${firmanteName} - Posición: ${orderPosition}, Roles: [${roleNames.join(', ')}]`);
          }
        }

        // Verificar firmantes finales (usuarios + grupos)
        const finalSignersResult = await client.query(
          `SELECT
            ds.user_id,
            ds.is_causacion_group,
            ds.grupo_codigo,
            u.name as user_name,
            u.email,
            ds.order_position,
            ds.role_name,
            ds.role_names
           FROM document_signers ds
           LEFT JOIN users u ON u.id = ds.user_id
           WHERE ds.document_id = $1
           ORDER BY ds.order_position ASC`,
          [documentId]
        );
        console.log(`✅ Firmantes finales (${finalSignersResult.rows.length}):`);
        finalSignersResult.rows.forEach(s => {
          if (s.is_causacion_group) {
            console.log(`  #${s.order_position}: [GRUPO] ${s.grupo_codigo} - Roles: ${s.role_names ? s.role_names.join(', ') : s.role_name}`);
          } else {
            console.log(`  #${s.order_position}: ${s.user_name} - Roles: ${s.role_names ? s.role_names.join(', ') : s.role_name}`);
          }
        });

        // ========== AUTOFIRMA FV: CREADOR COMO NEGOCIADOR EN PRIMERA POSICION ==========
        const firstSignerRow = finalSignersResult.rows.find(s => !s.is_causacion_group && s.order_position === 1);
        const firstSignerRoles = Array.isArray(firstSignerRow?.role_names)
          ? firstSignerRow.role_names
          : (firstSignerRow?.role_name ? [firstSignerRow.role_name] : []);
        const creatorAlreadySigned = signedSignerRows.some(row => !row.is_causacion_group && row.user_id === user.id);
        const creatorIsFirstNegociador = Boolean(firstSignerRow) &&
          firstSignerRow.user_id === user.id &&
          firstSignerRoles.some(role => typeof role === 'string' && role.trim().toUpperCase().includes('NEGOCIADOR'));

        if (creatorIsFirstNegociador) {
          console.log(`✅ Aplicando autofirma al creador ${user.name} como Negociador en posición 1`);

          await client.query(
            `INSERT INTO signatures (document_id, signer_id, status, signature_type, signed_at)
             VALUES ($1, $2, 'signed', 'digital', CURRENT_TIMESTAMP)
             ON CONFLICT (document_id, signer_id) DO UPDATE
             SET status = 'signed',
                 signature_type = 'digital',
                 signed_at = CURRENT_TIMESTAMP,
                 rejected_at = NULL,
                 rejection_reason = NULL,
                 updated_at = CURRENT_TIMESTAMP`,
            [documentId, user.id]
          );
        } else {
          // Si el creador sigue siendo firmante pero ya no es el Negociador inicial, revertir su autofirma.
          const creatorStillSigner = finalSignersResult.rows.some(s => !s.is_causacion_group && s.user_id === user.id);

          if (creatorStillSigner && !creatorAlreadySigned) {
            console.log(`ℹ️ Creador ${user.name} sigue como firmante pero ya no aplica autofirma de Negociador; dejando firma en pendiente`);

            await client.query(
              `UPDATE signatures
               SET status = 'pending',
                   signed_at = NULL,
                   rejected_at = NULL,
                   rejection_reason = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE document_id = $1
                 AND signer_id = $2`,
              [documentId, user.id]
            );
          }
        }

        const actionableSignersResult = await client.query(
          `SELECT
             ds.user_id,
             ds.order_position,
             ds.is_causacion_group,
             ds.grupo_codigo,
             CASE
               WHEN ds.is_causacion_group = FALSE THEN COALESCE((
                 SELECT s_direct.status
                 FROM signatures s_direct
                 WHERE s_direct.document_id = ds.document_id
                   AND s_direct.signer_id = ds.user_id
                 ORDER BY s_direct.updated_at DESC NULLS LAST, s_direct.created_at DESC NULLS LAST
                 LIMIT 1
               ), 'pending')
               WHEN EXISTS (
                 SELECT 1
                 FROM signatures s_group
                 JOIN causacion_integrantes ci ON ci.user_id = s_group.signer_id AND ci.activo = true
                 JOIN causacion_grupos cg ON cg.id = ci.grupo_id
                 WHERE s_group.document_id = ds.document_id
                   AND cg.codigo = ds.grupo_codigo
                   AND s_group.status = 'rejected'
               ) THEN 'rejected'
               WHEN EXISTS (
                 SELECT 1
                 FROM signatures s_group
                 JOIN causacion_integrantes ci ON ci.user_id = s_group.signer_id AND ci.activo = true
                 JOIN causacion_grupos cg ON cg.id = ci.grupo_id
                 WHERE s_group.document_id = ds.document_id
                   AND cg.codigo = ds.grupo_codigo
                   AND s_group.status = 'signed'
               ) THEN 'signed'
               ELSE 'pending'
             END as signature_status
           FROM document_signers ds
           WHERE ds.document_id = $1
           ORDER BY ds.order_position ASC`,
          [documentId]
        );

        await client.query(
          `DELETE FROM notifications
           WHERE document_id = $1
             AND type = 'signature_request'`,
          [documentId]
        );
        websocketService.emitNotificationDeleted(documentId, null, null, 'signature_request');

        const activePendingSignerRows = actionableSignersResult.rows.filter(row => row.signature_status === 'pending');
        if (activePendingSignerRows.length > 0) {
          const nextOrderPosition = Math.min(...activePendingSignerRows.map(row => row.order_position));
          const activeSignerRows = activePendingSignerRows.filter(row => row.order_position === nextOrderPosition);

          console.log(`Reasignando signature_request al turno activo #${nextOrderPosition} (${activeSignerRows.length} firmante(s))`);

          for (const signerRow of activeSignerRows) {
            if (signerRow.is_causacion_group && signerRow.grupo_codigo) {
              const membersResult = await client.query(
                `SELECT u.id, u.name, u.email, u.email_notifications
                 FROM causacion_integrantes ci
                 JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                 JOIN users u ON u.id = ci.user_id
                 WHERE cg.codigo = $1
                   AND ci.activo = true`,
                [signerRow.grupo_codigo]
              );

              for (const member of membersResult.rows) {
                const insertResult = await client.query(
                  `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                   VALUES ($1, 'signature_request', $2, $3, $4)
                   RETURNING id`,
                  [member.id, documentId, user.id, doc.title]
                );

                websocketService.emitNotificationCreated(member.id, {
                  id: insertResult.rows[0].id,
                  type: 'signature_request',
                  document_id: documentId,
                  actor_id: user.id,
                  document_title: doc.title,
                  actor: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                  }
                });

                if (String(member.id) !== String(user.id) && member.email_notifications) {
                  try {
                    await notificarAsignacionFirmante({
                      email: member.email,
                      nombreFirmante: member.name,
                      nombreDocumento: doc.title,
                      documentoId: documentId,
                      creadorDocumento: user.name,
                      tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                    });
                  } catch (emailError) {
                    console.error(`Error enviando correo a miembro de causacion ${member.email}:`, emailError);
                  }
                }
              }
            } else if (signerRow.user_id) {
              const signerUserResult = await client.query(
                'SELECT id, name, email, email_notifications FROM users WHERE id = $1',
                [signerRow.user_id]
              );

              if (signerUserResult.rows.length > 0) {
                const signerUser = signerUserResult.rows[0];
                const insertResult = await client.query(
                  `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                   VALUES ($1, 'signature_request', $2, $3, $4)
                   RETURNING id`,
                  [signerUser.id, documentId, user.id, doc.title]
                );

                websocketService.emitNotificationCreated(signerUser.id, {
                  id: insertResult.rows[0].id,
                  type: 'signature_request',
                  document_id: documentId,
                  actor_id: user.id,
                  document_title: doc.title,
                  actor: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                  }
                });

                if (String(signerUser.id) !== String(user.id) && signerUser.email_notifications) {
                  try {
                    await notificarAsignacionFirmante({
                      email: signerUser.email,
                      nombreFirmante: signerUser.name,
                      nombreDocumento: doc.title,
                      documentoId: documentId,
                      creadorDocumento: user.name,
                      tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                    });
                  } catch (emailError) {
                    console.error(`Error enviando correo a firmante activo ${signerUser.email}:`, emailError);
                  }
                }
              }
            }
          }
        }

        // Regenerar la planilla con el estado final de firmas luego de actualizar firmantes/autofirma.
        const firmasActualizadas = await obtenerFirmasDocumentoTx(documentId, parsedTemplateData);
        const pdfBufferFinal = await generateFacturaTemplatePDF(parsedTemplateData, firmasActualizadas, false, retentionData);
        await fs.writeFile(tempPlanillaPath, pdfBufferFinal);

        const mergeResultFinal = await mergePDFs(filesToMerge, tempMergedPath);
        if (!mergeResultFinal.success) {
          throw new Error(`Error al fusionar PDFs con firmas actualizadas: ${mergeResultFinal.error || 'Error desconocido'}`);
        }

        const { consecutivoSelect, realSignerNameSelect } = await getSignatureColumnSelects();
        const signatureJoinCondition = await getSignatureJoinCondition('s', 'ds');
        const csConstraint = await getCausacionSignerIdConstraint();

        // Obtener todos los firmantes actualizados para la portada
        const signersForCover = await client.query(
          `SELECT
            ds.document_id,
            ds.user_id,
            ds.order_position,
            ds.role_name,
            ds.role_names,
            ds.is_causacion_group,
            ds.grupo_codigo,
            u.name as user_name,
            u.email,
            COALESCE(s.status, 'pending') as status,
            s.signed_at,
            s.rejected_at,
            s.rejection_reason,
            ${consecutivoSelect},
            ${realSignerNameSelect},
            signer_user.email as signer_email
          FROM document_signers ds
          LEFT JOIN users u ON ds.user_id = u.id
          LEFT JOIN signatures s ON (
            (ds.is_causacion_group = false AND ${signatureJoinCondition}) OR
            (ds.is_causacion_group = true AND s.signer_id IN (
              SELECT ci.user_id
              FROM causacion_integrantes ci
              JOIN causacion_grupos cg ON ci.grupo_id = cg.id
              WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
            )${csConstraint})
          )
          LEFT JOIN users signer_user ON s.signer_id = signer_user.id
          WHERE ds.document_id = $1
          ORDER BY ds.order_position ASC`,
          [documentId]
        );

        const signers = signersForCover.rows.map(row => ({
          name: row.is_causacion_group ? row.grupo_codigo : row.user_name,
          email: row.email,
          order_position: row.order_position,
          role_name: row.role_name,
          role_names: row.role_names,
          status: row.status,
          is_causacion_group: row.is_causacion_group,
          grupo_codigo: row.grupo_codigo
        }));

        // Preparar información del documento para la portada
        const sentAtResult4 = await query(
          `SELECT MIN(created_at) as sent_at FROM document_signers WHERE document_id = $1`,
          [documentId]
        );

        const documentInfo = {
          title: doc.title,
          fileName: doc.file_name,
          createdAt: doc.created_at,
          sentAt: sentAtResult4.rows[0]?.sent_at || null,
          uploadedBy: doc.uploader_name || user.name,
          documentTypeName: doc.document_type_name || 'Factura',
          cia: parsedTemplateData.cia || null
        };

        // Agregar informe de firmantes al final (el PDF fusionado NO tiene informe todavía)
        const { addCoverPageWithSigners } = require('../utils/pdfCoverPage');
        await addCoverPageWithSigners(tempMergedPath, signers, documentInfo);

        // Reemplazar el archivo original con el fusionado
        await fs.copyFile(tempMergedPath, currentPdfPath);
        console.log('✅ Archivo del documento reemplazado correctamente');

        // 5. Limpiar archivos temporales
        console.log('🧹 Limpiando archivos temporales...');
        try {
          await fs.unlink(tempPlanillaPath);
          await fs.unlink(tempMergedPath);
          console.log('✅ Archivos temporales eliminados');
        } catch (cleanupError) {
          console.warn('⚠️ No se pudieron eliminar algunos archivos temporales:', cleanupError.message);
        }

        await client.query('COMMIT');

        console.log('✅ Plantilla actualizada exitosamente');

        // Emitir evento WebSocket para notificar a todos los clientes
        websocketService.emitDocumentUpdated(documentId, 'template_updated', {
          updatedBy: user.name
        });

        return {
          success: true,
          message: 'Plantilla actualizada correctamente',
          document: {
            id: documentId,
            templateData: templateData
          }
        };

      } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Error actualizando plantilla:', error);
        throw error;
      } finally {
        client.release();
      }
    },

    /**
     * Rejects a document with a reason, halting the signing workflow
     *
     * BUSINESS RULE: Signer must be next in sequential order to reject (same as signing).
     * BUSINESS RULE: If not first signer, previous signer MUST have signed before rejection is allowed.
     * BUSINESS RULE: Document status changes to 'rejected' immediately on any rejection.
     * BUSINESS RULE: All pending signature_request notifications are deleted (workflow halted).
     * BUSINESS RULE: Document creator receives rejection notification and email.
     * BUSINESS RULE: Rejector does NOT receive notification (they initiated the action).
     *
     * Sequential validation:
     * - First signer (position 1) can reject immediately
     * - Subsequent signers can only reject after previous signer has signed
     * - This prevents out-of-order rejections that would violate workflow
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.documentId - ID of the document
     * @param {string} [args.reason] - Reason for rejection (optional)
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user (must be assigned signer)
     * @returns {Promise<boolean>} True if rejection succeeds
     * @throws {Error} When unauthorized, not in sequence, or not assigned to document
     */
    rejectDocument: async (_, { documentId, reason, realSignerName }, { user }) => {
      if (!user) throw new Error('No autenticado');
      const workflowUserIds = await getNegociacionesSharedUserIds(user, realSignerName);
      for (const workflowUserId of workflowUserIds) {
        await backfillSignatureDocumentSignerIds(query, documentId, workflowUserId);
      }
      const signatureJoinCondition = await getSignatureJoinCondition('s', 'ds');
      const csConstraint = await getCausacionSignerIdConstraint();

      // Helper para normalizar nombres (MISMA LÓGICA que generatePdfFromDocument)
      const normalizarNombre = (nombre) => {
        if (!nombre) return '';
        return nombre.trim().toUpperCase().replace(/\s+/g, ' ');
      };

      // Helper para verificar si dos nombres coinciden
      const nombresCoinciden = (nombre1, nombre2) => {
        const n1 = normalizarNombre(nombre1);
        const n2 = normalizarNombre(nombre2);

        if (n1 === n2) return true;

        const words1 = n1.split(' ').filter(w => w.length > 2);
        const words2 = n2.split(' ').filter(w => w.length > 2);

        let matchCount = 0;
        words1.forEach(w1 => {
          if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
            matchCount++;
          }
        });

        return matchCount >= 2;
      };

      const orderCheck = await query(
        `SELECT ds.id as document_signer_id, ds.order_position, ds.user_id, COALESCE(s.status, 'pending') as signature_status
        FROM document_signers ds
        LEFT JOIN signatures s ON ${signatureJoinCondition}
        WHERE ds.document_id = $1
          AND ds.user_id = ANY($2)
          AND ds.is_causacion_group = FALSE
        ORDER BY ds.order_position ASC`,
        [documentId, workflowUserIds]
      );
      const pendingDirectSignerRow = orderCheck.rows.find(row => !['signed', 'rejected'].includes(row.signature_status));

      // Check causacion group membership when not found as direct signer
      let causacionGroupSignerRow = null;
      if (orderCheck.rows.length === 0 || !pendingDirectSignerRow) {
        const docOwnerForReject = await query(
          `SELECT d.uploaded_by, u.name as owner_name, u.email as owner_email
           FROM documents d JOIN users u ON u.id = d.uploaded_by WHERE d.id = $1`,
          [documentId]
        );
        const isCausacionTestModeReject = isCausacionTestUser(user)
          && docOwnerForReject.rows[0]
          && isCausacionTestDocument(docOwnerForReject.rows[0]);

        const causacionGroupCheck = await query(
          `SELECT ds.id as document_signer_id, ds.order_position, ds.user_id, ds.grupo_codigo,
                  COALESCE(s.status, 'pending') as signature_status
           FROM document_signers ds
           LEFT JOIN signatures s ON ${signatureJoinCondition}
           WHERE ds.document_id = $1
             AND ds.is_causacion_group = TRUE
             AND COALESCE(s.status, 'pending') = 'pending'
             AND (
               EXISTS (
                 SELECT 1 FROM causacion_integrantes ci
                 JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                 WHERE cg.codigo = ds.grupo_codigo AND ci.user_id = $2 AND ci.activo = true
               )
               OR $3::boolean = true
             )
           ORDER BY ds.order_position ASC
           LIMIT 1`,
          [documentId, user.id, isCausacionTestModeReject]
        );

        if (causacionGroupCheck.rows.length > 0) {
          causacionGroupSignerRow = causacionGroupCheck.rows[0];
        } else {
          throw new Error('No estás asignado a este documento');
        }
      }

      const activeSignerRow = causacionGroupSignerRow
        || orderCheck.rows.find(row => !['signed', 'rejected'].includes(row.signature_status));
      if (!activeSignerRow) {
        throw new Error('Ya no tienes una firma pendiente para rechazar en este documento');
      }

      const currentOrder = activeSignerRow.order_position;

      // Causacion group members can reject at any point regardless of signing order
      if (currentOrder > 1 && !causacionGroupSignerRow) {
        const previousSignerCheck = await query(
          `SELECT s.status, u.name as signer_name
          FROM document_signers ds
          JOIN signatures s ON ${signatureJoinCondition}
          JOIN users u ON u.id = ds.user_id
          WHERE ds.document_id = $1 AND ds.order_position = $2`,
          [documentId, currentOrder - 1]
        );

        if (previousSignerCheck.rows.length === 0) {
          throw new Error('Error al verificar el orden de firma');
        }

        const previousSigner = previousSignerCheck.rows[0];

        if (previousSigner.status !== 'signed') {
          throw new Error(`Solo puedes rechazar cuando ${previousSigner.signer_name} haya firmado primero (Firmante #${currentOrder - 1})`);
        }
      }

      const now = new Date().toISOString();
      const hasDocumentSignerIdColumn = await checkSignaturesHasDocumentSignerIdColumn();
      const hasRealSignerNameColumn = await checkSignaturesHasRealSignerNameColumn();

      const effectiveSignerUserId = causacionGroupSignerRow ? user.id : (activeSignerRow.user_id || user.id);
      const targetDocumentSignerId = activeSignerRow.document_signer_id;
      const effectiveRealSignerName = causacionGroupSignerRow ? user.name : (realSignerName || null);

      // Causacion group slots have no pre-existing signature row — check and INSERT or UPDATE
      const existingRejectionSig = (hasDocumentSignerIdColumn && targetDocumentSignerId)
        ? await query(`SELECT id FROM signatures WHERE document_signer_id = $1`, [targetDocumentSignerId])
        : await query(`SELECT id FROM signatures WHERE document_id = $1 AND signer_id = $2`, [documentId, effectiveSignerUserId]);

      if (existingRejectionSig.rows.length > 0) {
        if (hasDocumentSignerIdColumn && hasRealSignerNameColumn) {
          await query(
            `UPDATE signatures
             SET status = $1, rejection_reason = $2, rejected_at = $3, signed_at = $3,
                 real_signer_name = COALESCE($4, real_signer_name), updated_at = CURRENT_TIMESTAMP
             WHERE document_signer_id = $5`,
            ['rejected', reason || '', now, effectiveRealSignerName, targetDocumentSignerId]
          );
        } else if (hasDocumentSignerIdColumn) {
          await query(
            `UPDATE signatures
             SET status = $1, rejection_reason = $2, rejected_at = $3, signed_at = $3, updated_at = CURRENT_TIMESTAMP
             WHERE document_signer_id = $4`,
            ['rejected', reason || '', now, targetDocumentSignerId]
          );
        } else {
          await query(
            `UPDATE signatures SET status = $1, rejection_reason = $2, rejected_at = $3, signed_at = $3
             WHERE document_id = $4 AND signer_id = $5`,
            ['rejected', reason || '', now, documentId, effectiveSignerUserId]
          );
        }
      } else {
        // No existing row (causacion group slot not yet touched) — INSERT
        if (hasDocumentSignerIdColumn && hasRealSignerNameColumn) {
          await query(
            `INSERT INTO signatures (document_id, signer_id, document_signer_id, status, rejection_reason, rejected_at, signed_at, real_signer_name)
             VALUES ($1, $2, $3, 'rejected', $4, $5, $5, $6)`,
            [documentId, effectiveSignerUserId, targetDocumentSignerId, reason || '', now, effectiveRealSignerName]
          );
        } else if (hasDocumentSignerIdColumn) {
          await query(
            `INSERT INTO signatures (document_id, signer_id, document_signer_id, status, rejection_reason, rejected_at, signed_at)
             VALUES ($1, $2, $3, 'rejected', $4, $5, $5)`,
            [documentId, effectiveSignerUserId, targetDocumentSignerId, reason || '', now]
          );
        } else {
          await query(
            `INSERT INTO signatures (document_id, signer_id, status, rejection_reason, rejected_at, signed_at)
             VALUES ($1, $2, 'rejected', $3, $4, $4)`,
            [documentId, effectiveSignerUserId, reason || '', now]
          );
        }
      }

      const statusResult = await query(
        `SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'signed' THEN 1 ELSE 0 END) as signed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
        FROM signatures
        WHERE document_id = $1`,
        [documentId]
      );

      const stats = statusResult.rows[0];
      const total = parseInt(stats.total);
      const signed = parseInt(stats.signed);
      const rejected = parseInt(stats.rejected);

      let newStatus = 'pending';

      if (rejected > 0) {
        // Si hay alguna firma rechazada, el documento está rechazado
        newStatus = 'rejected';
      } else if (total > 0 && signed === total) {
        // Si todas las firmas están completas, el documento está completado
        newStatus = 'completed';
      } else if (signed > 0 && signed < total) {
        // Si hay algunas firmas pero no todas, está en progreso
        newStatus = 'in_progress';
      }

      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        [newStatus, documentId]
      );

      // Variable para almacenar datos de firmantes (se usará después para FV)
      let signersDataForLater = null;

      // ========== GESTIONAR NOTIFICACIONES INTERNAS Y EMAILS ==========
      try {
        // 1. Eliminar TODAS las notificaciones de signature_request del documento
        // ya que el documento fue rechazado y nadie más necesita firmar
        await query(
          `DELETE FROM notifications
           WHERE document_id = $1
           AND type = 'signature_request'`,
          [documentId]
        );

        const docResult = await query(
          `SELECT d.title, d.uploaded_by, dt.code as document_type_code
           FROM documents d
           LEFT JOIN document_types dt ON d.document_type_id = dt.id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docResult.rows.length > 0) {
          const doc = docResult.rows[0];

          const rejectorResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
          const rejectorName = rejectorResult.rows.length > 0 ? rejectorResult.rows[0].name : 'Usuario';

          // Registrar rechazo en logs
          pdfLogger.logDocumentRejected(rejectorName, doc.title, reason || 'Sin razón especificada');

          // 2. Crear notificación interna para el creador (si no es quien rechazó)
          if (doc.uploaded_by !== user.id) {
            const insertResult = await query(
              `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id`,
              [doc.uploaded_by, 'document_rejected', documentId, user.id, doc.title]
            );

            // Emitir evento WebSocket con información completa del actor
            if (insertResult.rows.length > 0) {
              websocketService.emitNotificationCreated(doc.uploaded_by, {
                id: insertResult.rows[0].id,
                type: 'document_rejected',
                document_id: documentId,
                actor_id: user.id,
                document_title: doc.title,
                actor: {
                  id: user.id,
                  name: user.name,
                  email: user.email
                }
              });
            }
          }

          // 3. Enviar correo de rechazo SOLO al creador del documento (si no es quien rechazó)
          if (doc.uploaded_by !== user.id) {
            try {
              const creatorResult = await query('SELECT email, name, email_notifications FROM users WHERE id = $1', [doc.uploaded_by]);

              if (creatorResult.rows.length > 0) {
                const creator = creatorResult.rows[0];

                if (creator.email_notifications) {
                  console.log('📧 Documento rechazado, enviando correo al creador...');

                  await notificarDocumentoRechazado({
                    emails: [creator.email],
                    nombreDocumento: doc.title,
                    documentoId: documentId,
                    rechazadoPor: rejectorName,
                    motivoRechazo: reason || 'Sin motivo especificado',
                    tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                  });

                  console.log(`✅ Correo de rechazo enviado al creador: ${creator.email}`);
                } else {
                  // console.log(`⏭️ Notificaciones desactivadas para el creador: ${creator.email}`);
                }
              }
            } catch (emailError) {
              console.error('Error al enviar correo de rechazo:', emailError);
              // No lanzamos el error para que no falle el rechazo
            }
          }
        }
      } catch (notifError) {
        console.error('Error al crear notificaciones de rechazo:', notifError);
        // No lanzamos el error para que no falle el rechazo
      }

      // ========== ACTUALIZAR PÁGINA DE FIRMANTES ==========
      try {

        const docInfoResult = await query(
          `SELECT d.*, u.name as uploader_name, dt.name as document_type_name, dt.code as document_type_code
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length > 0) {
          const docInfo = docInfoResult.rows[0];

          const signersResult = await query(
            `SELECT
                ds.user_id,
                ds.order_position,
                ds.role_name,
                ds.role_names,
                ds.is_causacion_group,
                ds.grupo_codigo,
                u.name as user_name,
                cg.nombre as grupo_nombre,
                u.email,
                COALESCE(s.status, 'pending') as status,
                s.signed_at,
                s.rejected_at,
                s.rejection_reason,
                NULL as consecutivo,
                signer_user.name as real_signer_name,
                signer_user.email as signer_email,
                NULL as retention_percentage,
                NULL as retention_reason,
                NULL as retained_at
            FROM document_signers ds
            LEFT JOIN users u ON ds.user_id = u.id
            LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
              (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
              (ds.is_causacion_group = true AND s.signer_id IN (
                SELECT ci.user_id
                FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = ds.grupo_codigo
              )${csConstraint})
            )
            LEFT JOIN users signer_user ON s.signer_id = signer_user.id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows.map(row => {
            const name = row.is_causacion_group
              ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación')
              : (row.user_name || 'Sin nombre');

            return {
              name: name,
              email: row.signer_email || row.email,
              order_position: row.order_position,
              role_name: row.role_name,
              role_names: row.role_names,
              status: row.status,
              signed_at: row.signed_at,
              rejected_at: row.rejected_at,
              rejection_reason: row.rejection_reason,
              consecutivo: row.consecutivo,
              is_causacion_group: row.is_causacion_group,
              grupo_codigo: row.grupo_codigo,
              real_signer_name: row.real_signer_name,
              retention_percentage: row.retention_percentage,
              retention_reason: row.retention_reason,
              retained_at: row.retained_at
            };
          });
          const pdfPath = path.join(__dirname, '..', docInfo.file_path);

          const sentAtResult = await query(
            `SELECT COALESCE(
              (SELECT MAX(signed_at) FROM signatures WHERE document_id = $1 AND status = 'signed'),
              (SELECT MIN(created_at) FROM document_signers WHERE document_id = $1)
            ) as sent_at`,
            [documentId]
          );

          const documentInfo = {
            title: docInfo.title,
            fileName: docInfo.file_name,
            createdAt: docInfo.created_at,
            sentAt: sentAtResult.rows[0]?.sent_at || null,
            uploadedBy: docInfo.uploader_name || 'Sistema',
            documentTypeName: docInfo.document_type_name || null
          };

          // Verificar si es tipo FV con metadata (plantilla)
          const isFacturaVenta = docInfo.document_type_code === 'FV' && docInfo.metadata;

          if (isFacturaVenta) {
            // Guardar datos para actualizar DESPUÉS del merge de la plantilla
            signersDataForLater = { pdfPath, signers, documentInfo };
            console.log('⏭️ Documento tipo FV: Página de firmantes se actualizará después del merge');
          } else {
            // Para otros documentos, actualizar inmediatamente
            await updateSignersPage(pdfPath, signers, documentInfo);

            // Agregar sello "RECHAZADO" en esquina superior izquierda
            try {
              await addStampToPdf(pdfPath, 'RECHAZADO');
              console.log('✅ Sello RECHAZADO agregado al documento');
            } catch (stampError) {
              console.error('❌ Error al agregar sello RECHAZADO:', stampError);
              // No lanzamos el error para que no falle el rechazo
            }
          }
        }
      } catch (updateError) {
        console.error('❌ Error al actualizar página de firmantes:', updateError);
        // No lanzamos el error para que no falle el rechazo
      }

      // ========== DESMARCAR FACTURA SI ES TIPO FV ==========
      try {
        const docTypeResult = await query(
          `SELECT dt.code, d.consecutivo
           FROM documents d
           LEFT JOIN document_types dt ON d.document_type_id = dt.id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docTypeResult.rows.length > 0) {
          const docData = docTypeResult.rows[0];

          // Solo procesar si es un documento de tipo FV y tiene consecutivo
          if (docData.code === 'FV' && docData.consecutivo) {
            const axios = require('axios');
            const backendHost = serverConfig.backendUrl;

            try {
              await axios.post(
                `${backendHost}/api/facturas/marcar-rechazada/${docData.consecutivo}`,
                {},
                { headers: { 'Content-Type': 'application/json' } }
              );
              console.log(`✅ Factura ${docData.consecutivo} marcada como rechazada`);
            } catch (rechazarError) {
              console.error(`❌ Error al marcar factura rechazada:`, rechazarError.message);
            }
          }
        }
      } catch (facturaError) {
        console.error('❌ Error al actualizar estados de factura:', facturaError);
        // No lanzamos el error para que no falle el rechazo
      }

      // ========== REGENERAR PLANTILLA FV CON MARCA DE AGUA "RECHAZADO" ==========
      try {
        const docDataResult = await query(
          `SELECT d.*, dt.code
           FROM documents d
           LEFT JOIN document_types dt ON d.document_type_id = dt.id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docDataResult.rows.length > 0) {
          const doc = docDataResult.rows[0];

          // Solo regenerar si es tipo FV y tiene metadata (plantilla)
          if (doc.code === 'FV' && doc.metadata) {

            const parsedTemplateData = typeof doc.metadata === 'object' ? doc.metadata : JSON.parse(doc.metadata);

            // Obtener firmas actuales del documento
            const obtenerFirmasDocumento = async (documentId, templateData) => {
              const firmasMap = {};
              const { realSignerNameSelect } = await getSignatureColumnSelects();
              const signersResult = await query(
                `SELECT s.signer_id, s.status, ${realSignerNameSelect}, u.name
                 FROM signatures s
                 JOIN users u ON s.signer_id = u.id
                 WHERE s.document_id = $1 AND s.status = 'signed'`,
                [documentId]
              );

              signersResult.rows.forEach(signer => {
                const nombreFirmante = signer.real_signer_name || signer.name;
                if (templateData.filasControl && Array.isArray(templateData.filasControl)) {
                  templateData.filasControl.forEach(fila => {
                    if (fila.respCuentaContable && nombresCoinciden(signer.name, fila.respCuentaContable)) {
                      firmasMap[fila.respCuentaContable] = nombreFirmante;
                    }
                    if (fila.respCentroCostos && nombresCoinciden(signer.name, fila.respCentroCostos)) {
                      firmasMap[fila.respCentroCostos] = nombreFirmante;
                    }
                  });
                }
                if (templateData.nombreNegociador && nombresCoinciden(signer.name, templateData.nombreNegociador)) {
                  firmasMap[templateData.nombreNegociador] = nombreFirmante;
                }
              });

              return firmasMap;
            };

            const firmasActuales = await obtenerFirmasDocumento(documentId, parsedTemplateData);

            // Obtener retenciones activas del documento
            const retentionData = doc.retention_data
              ? (typeof doc.retention_data === 'string' ? JSON.parse(doc.retention_data) : doc.retention_data).filter(r => r.activa)
              : [];

            // Regenerar PDF con marca de agua RECHAZADO
            const pdfBuffer = await generateFacturaTemplatePDF(parsedTemplateData, firmasActuales, true, retentionData);

            // Guardar planilla en archivo temporal
            const fs = require('fs').promises;
            const path = require('path');
            const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
            await fs.mkdir(tempDir, { recursive: true });
            const tempPlanillaPath = path.join(tempDir, `planilla_rechazada_${documentId}_${Date.now()}.pdf`);
            await fs.writeFile(tempPlanillaPath, pdfBuffer);
            console.log('✅ Planilla PDF con marca RECHAZADO generada:', tempPlanillaPath);

            // Obtener ruta del PDF actual
            const relativePath = doc.file_path.replace(/^uploads\//, '');
            const currentPdfPath = path.join(__dirname, '..', 'uploads', relativePath);

            // Buscar backups del PDF original
            let backupFilePaths = [];
            if (doc.original_pdf_backup) {
              try {
                backupFilePaths = JSON.parse(doc.original_pdf_backup);
              } catch (e) {
                backupFilePaths = [doc.original_pdf_backup];
              }
            }

            console.log('📋 Backups encontrados:', backupFilePaths);
            console.log('📋 Campo original_pdf_backup:', doc.original_pdf_backup);

            const tempMergedPath = path.join(tempDir, `merged_rejected_${documentId}_${Date.now()}.pdf`);

            if (backupFilePaths.length === 0) {
              console.log('⚠️ No hay backups del PDF original — usando solo la planilla como base del PDF rechazado.');
              await fs.copyFile(tempPlanillaPath, tempMergedPath);
            } else {
              // Merge: planilla + backups (sin página de firmantes aún)
              // ORDEN CORRECTO: 1. Planilla con RECHAZADO, 2. PDFs originales
              const filesToMerge = [
                tempPlanillaPath,
                ...backupFilePaths.map(bp => path.join(__dirname, '..', 'uploads', bp.replace(/^uploads\//, '')))
              ];
              console.log('📋 Archivos a fusionar (orden: planilla + backups):', filesToMerge);
              await mergePDFs(filesToMerge, tempMergedPath);
              console.log('✅ PDF base fusionado (planilla + backups) en temporal');
            }

            // Limpiar planilla temporal
            await cleanupTempFiles([tempPlanillaPath]);

            // AHORA agregar informe de firmantes al PDF fusionado temporal
            if (signersDataForLater) {
              console.log('📋 Agregando informe de firmantes al PDF fusionado...');
              const { addCoverPageWithSigners } = require('../utils/pdfCoverPage');
              await addCoverPageWithSigners(
                tempMergedPath,
                signersDataForLater.signers,
                signersDataForLater.documentInfo
              );
              console.log('✅ Informe de firmantes agregado al PDF');
            }

            // Copiar el resultado temporal al archivo final
            await fs.copyFile(tempMergedPath, currentPdfPath);
            console.log('✅ Archivo del documento reemplazado correctamente');

            // Agregar sello "RECHAZADO" en esquina superior izquierda
            try {
              await addStampToPdf(currentPdfPath, 'RECHAZADO');
              console.log('✅ Sello RECHAZADO agregado al documento');
            } catch (stampError) {
              console.error('❌ Error al agregar sello RECHAZADO:', stampError);
              // No lanzamos el error para que no falle el rechazo
            }

            // Limpiar temporal fusionado
            await cleanupTempFiles([tempMergedPath]);
          }
        }
      } catch (regenerateError) {
        console.error('❌ Error al regenerar plantilla con marca RECHAZADO:', regenerateError);
        // No lanzamos el error para que no falle el rechazo
      }

      // Emitir evento WebSocket para notificar a todos los clientes
      websocketService.emitDocumentRejected(documentId, {
        rejectedBy: user.name,
        reason: reason || 'Sin razón',
        status: newStatus
      });

      return true;
    },

    /**
     * Signs a document with digital signature data and optional consecutive number
     *
     * BUSINESS RULE: Document OWNER can sign at ANY position, bypassing sequential order.
     * BUSINESS RULE: Non-owners MUST wait for previous signer to complete before signing.
     * BUSINESS RULE: When document is completed, creator receives notification and email.
     * BUSINESS RULE: If not completed, NEXT signer in sequence is automatically notified.
     * BUSINESS RULE: Current signer's signature_request notification is deleted after signing.
     * BUSINESS RULE: Document status becomes 'completed' when all signers have signed.
     *
     * Sequential validation (NON-OWNERS ONLY):
     * - First signer (position 1) can sign immediately
     * - Subsequent signers must wait for signer at (position - 1) to complete
     * - Owner exception: Owner can sign regardless of position to approve their own documents
     *
     * Status transitions:
     * - pending → in_progress (after first signature)
     * - in_progress → completed (after last signature)
     * - Any state → rejected (if rejection count > 0)
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.documentId - ID of the document
     * @param {string} args.signatureData - Base64 signature image data
     * @param {string} [args.consecutivo] - Optional consecutive/tracking number
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user (must be assigned signer)
     * @returns {Promise<Object>} Signature record
     * @throws {Error} When unauthorized, not in sequence (non-owner), or not assigned to document
     */
    signDocument: async (_, { documentId, signatureData, consecutivo, realSignerName, retentions, causacionData }, { user }) => {
      if (!user) throw new Error('No autenticado');
      const workflowUserIds = await getNegociacionesSharedUserIds(user, realSignerName);
      for (const workflowUserId of workflowUserIds) {
        await backfillSignatureDocumentSignerIds(query, documentId, workflowUserId);
      }
      const signatureJoinCondition = await getSignatureJoinCondition('s', 'ds');
      const csConstraint = await getCausacionSignerIdConstraint();

      // Helper para normalizar nombres (MISMA LÓGICA que generatePdfFromDocument)
      const normalizarNombre = (nombre) => {
        if (!nombre) return '';
        return nombre.trim().toUpperCase().replace(/\s+/g, ' ');
      };

      // Helper para verificar si dos nombres coinciden
      const nombresCoinciden = (nombre1, nombre2) => {
        const n1 = normalizarNombre(nombre1);
        const n2 = normalizarNombre(nombre2);

        if (n1 === n2) return true;

        const words1 = n1.split(' ').filter(w => w.length > 2);
        const words2 = n2.split(' ').filter(w => w.length > 2);

        let matchCount = 0;
        words1.forEach(w1 => {
          if (words2.some(w2 => w2.includes(w1) || w1.includes(w2))) {
            matchCount++;
          }
        });

        return matchCount >= 2;
      };

      const docOwnerCheck = await query(
        `SELECT d.uploaded_by, d.title, d.file_name, d.description, d.metadata, dt.code as document_type_code
         FROM documents d
         LEFT JOIN document_types dt ON d.document_type_id = dt.id
         WHERE d.id = $1`,
        [documentId]
      );

      if (docOwnerCheck.rows.length === 0) {
        throw new Error('Documento no encontrado');
      }

      const isOwner = docOwnerCheck.rows[0].uploaded_by === user.id;
      const isCausacionTestMode = isCausacionTestUser(user) && isCausacionTestDocument(docOwnerCheck.rows[0]);

      // Validar orden secuencial de firma - primero buscar asignación directa
      let orderCheck = await query(
        `SELECT ds.id as document_signer_id, ds.order_position, ds.user_id, ds.role_name, ds.role_names, ds.is_causacion_group, ds.grupo_codigo, COALESCE(s.status, 'pending') as signature_status
        FROM document_signers ds
        LEFT JOIN signatures s ON ${signatureJoinCondition}
        WHERE ds.document_id = $1
          AND ds.user_id = ANY($2)
          AND ds.is_causacion_group = FALSE
        ORDER BY ds.order_position ASC`,
        [documentId, workflowUserIds]
      );

      let isCausacionGroupMember = false;
      let isCausacionTestSignature = false;
      let grupoCodigo = null;
      let targetDocumentSignerId = null;
      const pendingDirectSignerRow = orderCheck.rows.find(row => !['signed', 'rejected'].includes(row.signature_status));

      // Si no está directamente asignado, verificar si pertenece a un grupo de causación
      if (orderCheck.rows.length === 0 || !pendingDirectSignerRow) {
        const groupCheck = await query(`
          SELECT ds.id as document_signer_id, ds.order_position, ds.grupo_codigo, cg.nombre as grupo_nombre
          FROM document_signers ds
          JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
          JOIN causacion_integrantes ci ON ci.grupo_id = cg.id
          WHERE ds.document_id = $1
            AND ds.is_causacion_group = true
            AND ci.user_id = $2
            AND ci.activo = true
        `, [documentId, user.id]);

        if (isCausacionTestMode) {
          const testSignerCheck = await query(`
            SELECT
              ds.id as document_signer_id,
              ds.order_position,
              ds.user_id,
              ds.role_name,
              ds.role_names,
              ds.is_causacion_group,
              ds.grupo_codigo,
              cg.nombre as grupo_nombre,
              COALESCE(s.status, 'pending') as signature_status
            FROM document_signers ds
            LEFT JOIN signatures s ON ${signatureJoinCondition}
            LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
            WHERE ds.document_id = $1
              AND COALESCE(s.status, 'pending') NOT IN ('signed', 'rejected')
            ORDER BY ds.order_position ASC
            LIMIT 1
          `, [documentId]);

          if (testSignerCheck.rows.length === 0) {
            throw new Error('No hay firmantes pendientes en esta factura de prueba');
          }

          const testSignerRow = testSignerCheck.rows[0];
          isCausacionTestSignature = true;
          isCausacionGroupMember = Boolean(testSignerRow.is_causacion_group);
          grupoCodigo = testSignerRow.grupo_codigo;
          targetDocumentSignerId = testSignerRow.document_signer_id;
          orderCheck = { rows: [testSignerRow] };
          console.log(`Usuario ${user.name} firmando en entorno de pruebas el turno ${testSignerRow.order_position}`);
        } else if (groupCheck.rows.length === 0) {
          throw new Error('No estás asignado para firmar este documento');
        }

        if (!isCausacionTestSignature || isCausacionGroupMember) {
        // Verificar que nadie del grupo haya firmado ya
        grupoCodigo = grupoCodigo || groupCheck.rows[0].grupo_codigo;
        const existingGroupSignature = await query(`
          SELECT s.id, u.name as signer_name
          FROM signatures s
          JOIN users u ON s.signer_id = u.id
          WHERE s.document_id = $1
            AND s.status = 'signed'
            AND s.signer_id IN (
              SELECT ci.user_id
              FROM causacion_integrantes ci
              JOIN causacion_grupos cg ON ci.grupo_id = cg.id
              WHERE cg.codigo = $2 AND ci.activo = true
            )
            ${csConstraint ? 'AND s.document_signer_id = $3' : ''}
        `, csConstraint
          ? [documentId, grupoCodigo, targetDocumentSignerId || groupCheck.rows[0].document_signer_id]
          : [documentId, grupoCodigo]);

        if (existingGroupSignature.rows.length > 0) {
          throw new Error(`El grupo ya fue firmado por ${existingGroupSignature.rows[0].signer_name}`);
        }

        isCausacionGroupMember = true;
        targetDocumentSignerId = targetDocumentSignerId || groupCheck.rows[0].document_signer_id;
        orderCheck = { rows: [{ document_signer_id: targetDocumentSignerId, order_position: orderCheck.rows[0].order_position, grupo_codigo: grupoCodigo }] };
        }
        console.log(`👥 Usuario ${user.name} firmando como miembro del grupo ${grupoCodigo}`);
      } else {
        targetDocumentSignerId = pendingDirectSignerRow.document_signer_id;
        orderCheck = { rows: [pendingDirectSignerRow] };
      }

      const currentSignerRow = orderCheck.rows[0];
      const currentOrder = orderCheck.rows[0].order_position;

      const docCausacionInfoResult = await query(
        `SELECT d.consecutivo, d.file_path, d.file_name,
                d.metadata->>'cia' as cia,
                d.metadata->>'numeroFactura' as numero_factura,
                dt.code as document_type_code
         FROM documents d
         LEFT JOIN document_types dt ON d.document_type_id = dt.id
         WHERE d.id = $1`,
        [documentId]
      );
      const docCausacionInfo = docCausacionInfoResult.rows[0] || {};
      const requiresCausacionData = docCausacionInfo.document_type_code === 'FV'
        && (isCausacionGroupMember || (isCausacionTestMode && hasRoleContaining(currentSignerRow, 'CAUSACION')));
      let parsedCausacionData = null;

      if (requiresCausacionData) {
        try {
          parsedCausacionData = typeof causacionData === 'string' && causacionData.trim()
            ? JSON.parse(causacionData)
            : null;
        } catch (error) {
          throw new Error('Los datos de causación no tienen un formato válido');
        }

        if (!parsedCausacionData?.numeroCausacion || !String(parsedCausacionData.numeroCausacion).trim()) {
          throw new Error('Debes ingresar el No. de Causación antes de firmar');
        }

        if (!parsedCausacionData?.observaciones || !String(parsedCausacionData.observaciones).trim()) {
          throw new Error('Debes ingresar las observaciones de causación antes de firmar');
        }
      }

      // EXCEPCIÓN: Si el usuario es el propietario del documento, puede firmar sin importar el orden
      if (currentOrder > 1 && !isOwner) {
        // Obtener firmantes anteriores reales. En FV puede haber saltos en order_position
        // cuando se compactan firmantes duplicados en una sola fila.
        const previousSignersInfo = await query(
          `SELECT ds.id, ds.user_id, ds.order_position, ds.is_causacion_group, ds.grupo_codigo, cg.nombre as grupo_nombre
           FROM document_signers ds
           LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
           WHERE ds.document_id = $1 AND ds.order_position < $2
           ORDER BY ds.order_position ASC`,
          [documentId, currentOrder]
        );

        for (const prevInfo of previousSignersInfo.rows) {
          let previousSigned = false;
          let previousName = '';

          if (prevInfo.is_causacion_group) {
            // Firmante anterior es un grupo - verificar si algún miembro firmó
            const groupSigCheck = await query(`
              SELECT s.status, u.name as signer_name
              FROM signatures s
              JOIN users u ON s.signer_id = u.id
              WHERE s.document_id = $1
                AND s.status = 'signed'
                AND s.signer_id IN (
                  SELECT ci.user_id
                  FROM causacion_integrantes ci
                  JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                  WHERE cg.codigo = $2 AND ci.activo = true
                )
                ${csConstraint ? 'AND s.document_signer_id = $3' : ''}
            `, csConstraint
              ? [documentId, prevInfo.grupo_codigo, prevInfo.id]
              : [documentId, prevInfo.grupo_codigo]);

            previousSigned = groupSigCheck.rows.length > 0;
            previousName = prevInfo.grupo_nombre || prevInfo.grupo_codigo;
          } else {
            // Firmante anterior es un usuario normal
            const userSigCheck = await query(
              `SELECT s.status, u.name as signer_name
               FROM signatures s
               JOIN users u ON s.signer_id = u.id
               WHERE s.document_id = $1
                 AND s.status = 'signed'
                 AND (
                   s.signer_id = $2
                   OR ($3::boolean = true AND s.document_signer_id = $4)
                 )`,
              [documentId, prevInfo.user_id, isCausacionTestMode, prevInfo.id]
            );

            previousSigned = userSigCheck.rows.length > 0;
            const userInfo = await query('SELECT name FROM users WHERE id = $1', [prevInfo.user_id]);
            previousName = userInfo.rows[0]?.name || 'Usuario anterior';
          }

          if (!previousSigned) {
            throw new Error(`Debes esperar a que ${previousName} firme el documento primero (Firmante #${prevInfo.order_position})`);
          }
        }
      }

      // Para grupos de causación, siempre guardar el nombre del firmante real
      const effectiveRealSignerName = (isCausacionGroupMember || isCausacionTestSignature) ? user.name : (realSignerName || null);

      const hasDocumentSignerIdColumn = await checkSignaturesHasDocumentSignerIdColumn();
      const effectiveSignerUserId = isCausacionGroupMember ? user.id : (orderCheck.rows[0]?.user_id || user.id);

      if (isCausacionGroupMember && hasDocumentSignerIdColumn && targetDocumentSignerId) {
        await query(
          `UPDATE signatures
           SET signer_id = $1
           WHERE document_signer_id = $2
             AND status NOT IN ('signed', 'rejected')`,
          [user.id, targetDocumentSignerId]
        );
      }

      const existingSignature = (hasDocumentSignerIdColumn && targetDocumentSignerId)
        ? await query(
          `SELECT * FROM signatures WHERE document_signer_id = $1`,
          [targetDocumentSignerId]
        )
        : await query(
          `SELECT * FROM signatures WHERE document_id = $1 AND signer_id = $2`,
          [documentId, effectiveSignerUserId]
        );
      const hasConsecutivoColumn = await checkSignaturesHasConsecutivoColumn();
      const hasRealSignerNameColumn = await checkSignaturesHasRealSignerNameColumn();
      let autoSignedNegociacionesUserId = null;

      let result;
      if (existingSignature.rows.length > 0) {
        if (hasConsecutivoColumn && hasRealSignerNameColumn) {
          result = await query(
            `UPDATE signatures
            SET status = 'signed',
                signature_data = $1,
                consecutivo = $2,
                real_signer_name = $3,
                updated_at = CURRENT_TIMESTAMP,
                signed_at = CURRENT_TIMESTAMP
            WHERE ${hasDocumentSignerIdColumn && targetDocumentSignerId ? 'document_signer_id = $4' : 'document_id = $4 AND signer_id = $5'}
            RETURNING *`,
            (hasDocumentSignerIdColumn && targetDocumentSignerId)
              ? [signatureData, consecutivo || null, effectiveRealSignerName, targetDocumentSignerId]
              : [signatureData, consecutivo || null, effectiveRealSignerName, documentId, effectiveSignerUserId]
          );
        } else if (hasConsecutivoColumn) {
          result = await query(
            `UPDATE signatures
            SET status = 'signed',
                signature_data = $1,
                consecutivo = $2,
                updated_at = CURRENT_TIMESTAMP,
                signed_at = CURRENT_TIMESTAMP
            WHERE ${hasDocumentSignerIdColumn && targetDocumentSignerId ? 'document_signer_id = $3' : 'document_id = $3 AND signer_id = $4'}
            RETURNING *`,
            (hasDocumentSignerIdColumn && targetDocumentSignerId)
              ? [signatureData, consecutivo || null, targetDocumentSignerId]
              : [signatureData, consecutivo || null, documentId, effectiveSignerUserId]
          );
        } else if (hasRealSignerNameColumn) {
          result = await query(
            `UPDATE signatures
            SET status = 'signed',
                signature_data = $1,
                real_signer_name = $2,
                updated_at = CURRENT_TIMESTAMP,
                signed_at = CURRENT_TIMESTAMP
            WHERE ${hasDocumentSignerIdColumn && targetDocumentSignerId ? 'document_signer_id = $3' : 'document_id = $3 AND signer_id = $4'}
            RETURNING *`,
            (hasDocumentSignerIdColumn && targetDocumentSignerId)
              ? [signatureData, effectiveRealSignerName, targetDocumentSignerId]
              : [signatureData, effectiveRealSignerName, documentId, effectiveSignerUserId]
          );
        } else {
          result = await query(
            `UPDATE signatures
            SET status = 'signed',
                signature_data = $1,
                updated_at = CURRENT_TIMESTAMP,
                signed_at = CURRENT_TIMESTAMP
            WHERE ${hasDocumentSignerIdColumn && targetDocumentSignerId ? 'document_signer_id = $2' : 'document_id = $2 AND signer_id = $3'}
            RETURNING *`,
            (hasDocumentSignerIdColumn && targetDocumentSignerId)
              ? [signatureData, targetDocumentSignerId]
              : [signatureData, documentId, effectiveSignerUserId]
          );
        }
      } else {
        if (hasConsecutivoColumn && hasRealSignerNameColumn) {
          result = await query(
            `INSERT INTO signatures (document_id, signer_id, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? 'document_signer_id, ' : ''}status, signature_data, signature_type, signed_at, consecutivo, real_signer_name)
            VALUES ($1, $2, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$3, ' : ''}'signed', ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$4' : '$3'}, 'digital', CURRENT_TIMESTAMP, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$5, $6' : '$4, $5'})
            RETURNING *`,
            (hasDocumentSignerIdColumn && targetDocumentSignerId)
              ? [documentId, effectiveSignerUserId, targetDocumentSignerId, signatureData, consecutivo || null, effectiveRealSignerName]
              : [documentId, effectiveSignerUserId, signatureData, consecutivo || null, effectiveRealSignerName]
          );
        } else if (hasConsecutivoColumn) {
          result = await query(
            `INSERT INTO signatures (document_id, signer_id, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? 'document_signer_id, ' : ''}status, signature_data, signature_type, signed_at, consecutivo)
            VALUES ($1, $2, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$3, ' : ''}'signed', ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$4' : '$3'}, 'digital', CURRENT_TIMESTAMP, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$5' : '$4'})
            RETURNING *`,
            (hasDocumentSignerIdColumn && targetDocumentSignerId)
              ? [documentId, effectiveSignerUserId, targetDocumentSignerId, signatureData, consecutivo || null]
              : [documentId, effectiveSignerUserId, signatureData, consecutivo || null]
          );
        } else if (hasRealSignerNameColumn) {
          result = await query(
            `INSERT INTO signatures (document_id, signer_id, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? 'document_signer_id, ' : ''}status, signature_data, signature_type, signed_at, real_signer_name)
            VALUES ($1, $2, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$3, ' : ''}'signed', ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$4' : '$3'}, 'digital', CURRENT_TIMESTAMP, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$5' : '$4'})
            RETURNING *`,
            (hasDocumentSignerIdColumn && targetDocumentSignerId)
              ? [documentId, effectiveSignerUserId, targetDocumentSignerId, signatureData, effectiveRealSignerName]
              : [documentId, effectiveSignerUserId, signatureData, effectiveRealSignerName]
          );
        } else {
          result = await query(
            `INSERT INTO signatures (document_id, signer_id, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? 'document_signer_id, ' : ''}status, signature_data, signature_type, signed_at)
            VALUES ($1, $2, ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$3, ' : ''}'signed', ${hasDocumentSignerIdColumn && targetDocumentSignerId ? '$4' : '$3'}, 'digital', CURRENT_TIMESTAMP)
            RETURNING *`,
            (hasDocumentSignerIdColumn && targetDocumentSignerId)
              ? [documentId, effectiveSignerUserId, targetDocumentSignerId, signatureData]
              : [documentId, effectiveSignerUserId, signatureData]
          );
        }
      }

      if (result.rows.length === 0) {
        throw new Error('Error al registrar la firma');
      }

      if (requiresCausacionData && docCausacionInfo.consecutivo) {
        const numeroCausacionValue = String(parsedCausacionData.numeroCausacion).trim();
        const observacionesCausacionValue = String(parsedCausacionData.observaciones).trim();
        const fechaCausacionValue = new Date().toISOString().slice(0, 10);

        const causadoPorValue = effectiveRealSignerName || user.name;
        const causacionUpdate = await queryFacturas(
          `UPDATE crud_facturas."T_Facturas"
           SET causado = TRUE,
               fecha_causacion = CURRENT_DATE,
               numero_causacion = $2,
               observaciones_causacion = $3,
               causado_por = $4
           WHERE numero_control = $1
          RETURNING numero_control, causado, fecha_causacion, numero_causacion, observaciones_causacion, causado_por`,
          [
            String(docCausacionInfo.consecutivo).trim(),
            numeroCausacionValue,
            observacionesCausacionValue,
            causadoPorValue
          ]
        );

        if (causacionUpdate.rows.length === 0) {
          throw new Error('No se encontro la factura para guardar la causacion');
        }

        await query(
          `UPDATE documents
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
           WHERE id = $1`,
          [
            documentId,
            JSON.stringify({
              numeroCausacion: numeroCausacionValue,
              observacionesCausacion: observacionesCausacionValue,
              descripcionCausacion: observacionesCausacionValue,
              fechaCausacion: fechaCausacionValue
            })
          ]
        );

        // Mover el PDF al Archivo Contable (local → sync a S: via script)
        const nitRow = await queryFacturas(
          `SELECT nit, fecha_factura FROM crud_facturas."T_Facturas" WHERE numero_control = $1`,
          [String(docCausacionInfo.consecutivo).trim()]
        );

        if (nitRow.rows[0]?.nit && docCausacionInfo.cia && docCausacionInfo.numero_factura && docCausacionInfo.file_path) {
          const fechaFactura = nitRow.rows[0].fecha_factura
            ? new Date(nitRow.rows[0].fecha_factura)
            : new Date();

          const moved = await moveToCausado(
            docCausacionInfo.file_path,
            docCausacionInfo.cia,
            nitRow.rows[0].nit,
            docCausacionInfo.numero_factura,
            numeroCausacionValue,
            fechaFactura
          ).catch(err => {
            console.error('⚠️ No se pudo mover archivo causado:', err.message);
            return null;
          });

          if (moved) {
            await query(
              `UPDATE documents SET file_path = $2, file_name = $3 WHERE id = $1`,
              [documentId, moved.newRelativePath, moved.newFileName]
            );
          }
        }
      }

      const shouldAutoSignNegociaciones = !isCausacionGroupMember
        && !isNegociacionesSharedUser(user)
        && hasRoleContaining(currentSignerRow, 'NEGOCIADOR')
        && !hasRoleContaining(currentSignerRow, 'NEGOCIACION')
        && await userBelongsToNegotiationSigners(user);

      if (shouldAutoSignNegociaciones) {
        const negociacionesUser = await getNegociacionesSharedUser();

        if (negociacionesUser?.id) {
          const negociacionesSignerRows = await query(
            `SELECT ds.id as document_signer_id, ds.order_position, ds.user_id, ds.role_name, ds.role_names, COALESCE(s.status, 'pending') as signature_status
             FROM document_signers ds
             LEFT JOIN signatures s ON ${signatureJoinCondition}
             WHERE ds.document_id = $1
               AND ds.user_id = $2
               AND ds.is_causacion_group = FALSE
             ORDER BY ds.order_position ASC`,
            [documentId, negociacionesUser.id]
          );

          const negociacionesPendingRow = negociacionesSignerRows.rows.find(row =>
            hasRoleContaining(row, 'NEGOCIACION') && !['signed', 'rejected'].includes(row.signature_status)
          );

          if (negociacionesPendingRow) {
            const autoTargetDocumentSignerId = negociacionesPendingRow.document_signer_id;
            const existingNegociacionesSignature = (hasDocumentSignerIdColumn && autoTargetDocumentSignerId)
              ? await query(
                `SELECT id
                 FROM signatures
                 WHERE document_signer_id = $1
                    OR (document_id = $2 AND signer_id = $3)
                 ORDER BY
                   CASE WHEN document_signer_id = $1 THEN 0 ELSE 1 END,
                   updated_at DESC NULLS LAST,
                   created_at DESC NULLS LAST
                 LIMIT 1`,
                [autoTargetDocumentSignerId, documentId, negociacionesUser.id]
              )
              : await query(
                `SELECT id FROM signatures WHERE document_id = $1 AND signer_id = $2`,
                [documentId, negociacionesUser.id]
              );

            if (existingNegociacionesSignature.rows.length > 0) {
              const updateValues = [signatureData];
              const updateSets = [
                'status = \'signed\'',
                'signature_data = $1',
                'signature_type = \'digital\'',
                'updated_at = CURRENT_TIMESTAMP',
                'signed_at = CURRENT_TIMESTAMP'
              ];

              if (hasConsecutivoColumn) {
                updateValues.push(consecutivo || null);
                updateSets.push(`consecutivo = $${updateValues.length}`);
              }

              if (hasRealSignerNameColumn) {
                updateValues.push(user.name);
                updateSets.push(`real_signer_name = $${updateValues.length}`);
              }

              if (hasDocumentSignerIdColumn && autoTargetDocumentSignerId) {
                updateValues.push(autoTargetDocumentSignerId);
                updateSets.push(`document_signer_id = $${updateValues.length}`);
              }

              updateValues.push(existingNegociacionesSignature.rows[0].id);
              await query(
                `UPDATE signatures
                 SET ${updateSets.join(', ')}
                 WHERE id = $${updateValues.length}`,
                updateValues
              );
            } else {
              const insertColumns = ['document_id', 'signer_id'];
              const insertValues = [documentId, negociacionesUser.id];

              if (hasDocumentSignerIdColumn && autoTargetDocumentSignerId) {
                insertColumns.push('document_signer_id');
                insertValues.push(autoTargetDocumentSignerId);
              }

              insertColumns.push('status', 'signature_data', 'signature_type');
              insertValues.push('signed', signatureData, 'digital');

              if (hasConsecutivoColumn) {
                insertColumns.push('consecutivo');
                insertValues.push(consecutivo || null);
              }

              if (hasRealSignerNameColumn) {
                insertColumns.push('real_signer_name');
                insertValues.push(user.name);
              }

              insertColumns.push('signed_at');
              const placeholders = insertValues.map((_, index) => `$${index + 1}`);

              await query(
                `INSERT INTO signatures (${insertColumns.join(', ')})
                 VALUES (${placeholders.join(', ')}, CURRENT_TIMESTAMP)`,
                insertValues
              );
            }

            autoSignedNegociacionesUserId = negociacionesUser.id;
            console.log(`Firma automatica de Negociaciones aplicada para ${user.name} en documento ${documentId}`);
          }
        }
      }

      // ========== LOS BACKUPS NUNCA SE ELIMINAN ==========
      // Los archivos originales deben mantenerse SIEMPRE
      // Solo se eliminan cuando se elimina el documento completo (en deleteDocument)

      // Contar estado basado en document_signers (incluye grupos de causación)
      const signersCountResult = await query(
        `SELECT COUNT(*) as total FROM document_signers WHERE document_id = $1`,
        [documentId]
      );
      const totalSigners = parseInt(signersCountResult.rows[0].total);
      const signatureJoinConditionForCounts = await getSignatureJoinCondition('s', 'ds');

      // Contar firmados: usuarios normales + grupos de causación con al menos un miembro que firmó
      const signedResult = await query(`
        SELECT COUNT(DISTINCT ds.id) as signed
        FROM document_signers ds
        LEFT JOIN signatures s ON (
          (ds.is_causacion_group = false AND (${signatureJoinConditionForCounts}) AND s.status = 'signed')
          OR
          (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.status = 'signed' AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
          )${csConstraint})
        )
        WHERE ds.document_id = $1 AND s.id IS NOT NULL
      `, [documentId]);
      const signed = parseInt(signedResult.rows[0].signed || 0);

      // Contar rechazados
      const rejectedResult = await query(`
        SELECT COUNT(DISTINCT ds.id) as rejected
        FROM document_signers ds
        LEFT JOIN signatures s ON (
          (ds.is_causacion_group = false AND (${signatureJoinConditionForCounts}) AND s.status = 'rejected')
          OR
          (ds.is_causacion_group = true AND s.document_id = ds.document_id AND s.status = 'rejected' AND s.signer_id IN (
            SELECT ci.user_id FROM causacion_integrantes ci
            JOIN causacion_grupos cg ON ci.grupo_id = cg.id
            WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
          )${csConstraint})
        )
        WHERE ds.document_id = $1 AND s.id IS NOT NULL
      `, [documentId]);
      const rejected = parseInt(rejectedResult.rows[0].rejected || 0);

      const pending = totalSigners - signed - rejected;
      const total = totalSigners;

      let newStatus = 'pending';
      let shouldSetCompletedAt = false;

      if (rejected > 0) {
        // Si hay alguna firma rechazada, el documento está rechazado
        newStatus = 'rejected';
      } else if (total > 0 && signed === total) {
        // Si todas las firmas están completas, el documento está completado
        newStatus = 'completed';
        shouldSetCompletedAt = true;
      } else if (signed > 0 && signed < total) {
        // Si hay algunas firmas pero no todas, está en progreso
        newStatus = 'in_progress';
      } else if (pending > 0 && signed === 0) {
        // Si hay firmas pendientes pero ninguna firmada, está pendiente
        newStatus = 'pending';
      }


      if (shouldSetCompletedAt) {
        await query(
          'UPDATE documents SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newStatus, documentId]
        );
      } else {
        await query(
          'UPDATE documents SET status = $1 WHERE id = $2',
          [newStatus, documentId]
        );
      }

      // ========== REGENERAR PLANTILLA FV CON FIRMAS ACTUALIZADAS ==========
      try {
        const docInfoResult = await query(
          `SELECT d.id, d.title, d.metadata, d.file_path, d.file_name, d.created_at, d.original_pdf_backup, d.retention_data, dt.code as document_type_code, dt.name as document_type_name, u.name as uploader_name
           FROM documents d
           LEFT JOIN document_types dt ON d.document_type_id = dt.id
           LEFT JOIN users u ON d.uploaded_by = u.id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length > 0) {
          const docInfo = docInfoResult.rows[0];
          const isFVDocument = docInfo.document_type_code === 'FV';
          const hasMetadata = !!(
            docInfo.metadata &&
            (
              (typeof docInfo.metadata === 'object' && Object.keys(docInfo.metadata).length > 0) ||
              (typeof docInfo.metadata === 'string' && docInfo.metadata.trim() !== '')
            )
          );

          if (isFVDocument && hasMetadata) {
            const { consecutivoSelect, signerNameSelect } = await getSignatureColumnSelects();
            const templateData = typeof docInfo.metadata === 'string'
              ? JSON.parse(docInfo.metadata)
              : docInfo.metadata;

            // Obtener firmas actuales
            const firmasActuales = await obtenerFirmasDocumento(documentId, templateData);

            // Obtener retenciones activas del documento
            const retentionData = docInfo.retention_data
              ? (typeof docInfo.retention_data === 'string' ? JSON.parse(docInfo.retention_data) : docInfo.retention_data).filter(r => r.activa)
              : [];

            // Regenerar plantilla con firmas
            const templatePdfBuffer = await generateFacturaTemplatePDF(templateData, firmasActuales, false, retentionData);

            // Guardar en archivo temporal
            const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
            await fs.mkdir(tempDir, { recursive: true });
            const tempPlanillaPath = path.join(tempDir, `planilla_${documentId}_${Date.now()}.pdf`);
            await fs.writeFile(tempPlanillaPath, templatePdfBuffer);

            // Obtener ruta del PDF actual
            const relativePath = docInfo.file_path.replace(/^uploads\//, '');
            const currentPdfPath = path.join(__dirname, '..', 'uploads', relativePath);

            // Verificar backups
            let backupFilePaths = [];
            if (docInfo.original_pdf_backup) {
              try {
                const backupPathsArray = JSON.parse(docInfo.original_pdf_backup);

                for (let i = 0; i < backupPathsArray.length; i++) {
                  const relPath = backupPathsArray[i];
                  const backupRelativePath = relPath.replace(/^uploads\//, '');
                  const backupFullPath = path.join(__dirname, '..', 'uploads', backupRelativePath);

                  try {
                    await fs.access(backupFullPath);
                    backupFilePaths.push(backupFullPath);
                  } catch (accessError) {
                    console.error(`   ❌ Backup ${i + 1}/${backupPathsArray.length} NO ENCONTRADO: ${backupFullPath}`);
                  }
                }

                if (backupFilePaths.length === 0) {
                  console.error('❌ CRÍTICO: No se encontró ningún backup de PDF original');
                }
              } catch (error) {
                console.error('❌ Error al cargar backups:', error.message);
                backupFilePaths = [];
              }
            } else {
              console.warn('⚠️ No hay backups registrados para este documento');
            }

            // Fusionar: plantilla + backups
            const tempMergedPath = path.join(tempDir, `merged_${documentId}_${Date.now()}.pdf`);
            const filesToMerge = [tempPlanillaPath, ...backupFilePaths];
            await mergePDFs(filesToMerge, tempMergedPath);

            // Agregar informe de firmantes
            const signersForCover = await query(
              `SELECT
                ds.user_id,
                ds.order_position,
                ds.role_name,
                ds.role_names,
                ds.is_causacion_group,
                ds.grupo_codigo,
                u.name as user_name,
                cg.nombre as grupo_nombre,
                u.email,
                COALESCE(s.status, 'pending') as status,
                s.signed_at,
                s.rejected_at,
                s.rejection_reason,
                ${consecutivoSelect},
                ${signerNameSelect},
                signer_user.email as signer_email
               FROM document_signers ds
               LEFT JOIN users u ON ds.user_id = u.id
               LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
               LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
                 (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
                 (ds.is_causacion_group = true AND s.signer_id IN (
                   SELECT ci.user_id
                   FROM causacion_integrantes ci
                   JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                   WHERE cg.codigo = ds.grupo_codigo
                 )${csConstraint})
               )
               LEFT JOIN users signer_user ON s.signer_id = signer_user.id
               WHERE ds.document_id = $1
               ORDER BY ds.order_position ASC`,
              [documentId]
            );

            const signers = signersForCover.rows.map(row => {
              // Para grupos de causación, siempre usar el nombre del grupo (o código como fallback)
              const name = row.is_causacion_group
                ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación')
                : (row.user_name || 'Sin nombre');

              return {
                name: name,
                email: row.signer_email || row.email,
                order_position: row.order_position,
                role_name: row.role_name,
                role_names: row.role_names,
                status: row.status,
                signed_at: row.signed_at,
                rejected_at: row.rejected_at,
                rejection_reason: row.rejection_reason,
                consecutivo: row.consecutivo,
                is_causacion_group: row.is_causacion_group,
                grupo_codigo: row.grupo_codigo,
                real_signer_name: row.real_signer_name
              };
            });

            const documentInfoForCover = {
              title: docInfo.title || 'Factura',
              fileName: docInfo.file_name || '',
              createdAt: docInfo.created_at,
              uploadedBy: docInfo.uploader_name || 'Sistema',
              documentTypeName: docInfo.document_type_name || 'Factura'
            };

            await addCoverPageWithSigners(tempMergedPath, signers, documentInfoForCover);

            // Reemplazar archivo original
            await fs.copyFile(tempMergedPath, currentPdfPath);

            // Verificar si tiene retenciones activas PRIMERO
            const hasActiveRetentions = retentionData && retentionData.length > 0;

            if (hasActiveRetentions) {
              // Si tiene retenciones activas, SIEMPRE agregar sello RETENIDO (porque se regeneró el PDF)
              try {
                await addStampToPdf(currentPdfPath, 'RETENIDO');
                console.log('⚠️ Sello RETENIDO re-agregado después de regenerar PDF (documento con retención activa)');
              } catch (stampError) {
                console.error('❌ Error al re-agregar sello RETENIDO:', stampError);
              }
            } else if (newStatus === 'completed') {
              // Si NO tiene retenciones y está completado, agregar sello APROBADO
              try {
                await addStampToPdf(currentPdfPath, 'APROBADO');
                console.log('✅ Sello APROBADO agregado al documento (completado sin retención)');
              } catch (stampError) {
                console.error('❌ Error al agregar sello APROBADO:', stampError);
              }
            }

            // Limpiar temporales
            await fs.unlink(tempPlanillaPath);
            await fs.unlink(tempMergedPath);

          }
        }
      } catch (regenerateError) {
        console.error('❌ Error al regenerar plantilla FV:', regenerateError);
        // No lanzamos error para no interrumpir el flujo de firma
      }

      if (newStatus === 'completed') {
        try {
          await assignCompletedInvoiceToPayables(documentId, user.id);
        } catch (payableError) {
          console.error('Error al enviar factura completada a Facturas por pagar:', payableError);
        }
      }

      // ========== GESTIONAR NOTIFICACIONES INTERNAS ==========
      try {
        const docResult = await query(
          `SELECT d.title, d.uploaded_by, d.file_path, dt.code as document_type_code
           FROM documents d
           LEFT JOIN document_types dt ON d.document_type_id = dt.id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docResult.rows.length > 0) {
          const doc = docResult.rows[0];

          // Obtener el nombre del usuario que firma
          const signerResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
          if (signerResult.rows.length > 0) {
            const signerName = signerResult.rows[0].name;
            // Registrar TODAS las firmas
            pdfLogger.logDocumentSigned(signerName, doc.title);
          }

          // 1. Eliminar la notificación de signature_request del usuario que acaba de firmar
          await query(
            `DELETE FROM notifications
             WHERE document_id = $1
             AND user_id = $2
             AND type = 'signature_request'`,
            [documentId, user.id]
          );

          // Emitir evento WebSocket para que la notificación desaparezca en tiempo real
          websocketService.emitNotificationDeleted(documentId, null, user.id, 'signature_request');

          if (autoSignedNegociacionesUserId) {
            await query(
              `DELETE FROM notifications
               WHERE document_id = $1
               AND user_id = $2
               AND type = 'signature_request'`,
              [documentId, autoSignedNegociacionesUserId]
            );

            websocketService.emitNotificationDeleted(documentId, null, autoSignedNegociacionesUserId, 'signature_request');
          }

          // 2. Notificar al creador del documento que alguien firmó (si no es quien firmó)
          if (doc.uploaded_by !== user.id) {
            const insertResult = await query(
              `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id`,
              [doc.uploaded_by, 'document_signed', documentId, user.id, doc.title]
            );

            // Emitir evento WebSocket con información completa del actor
            if (insertResult.rows.length > 0) {
              // Obtener información completa del actor desde la BD (no del JWT)
              const actorResult = await query('SELECT id, name, email FROM users WHERE id = $1', [user.id]);
              const actorFromDB = actorResult.rows[0];

              websocketService.emitNotificationCreated(doc.uploaded_by, {
                id: insertResult.rows[0].id,
                type: 'document_signed',
                document_id: documentId,
                actor_id: user.id,
                document_title: doc.title,
                actor: {
                  id: actorFromDB.id,
                  name: actorFromDB.name,
                  email: actorFromDB.email,
                  realSignerName: effectiveRealSignerName || actorFromDB.name
                }
              });
            }
          }

          // 3. Si el documento NO está completado, notificar al siguiente firmante en la fila
          if (newStatus !== 'completed') {
            // Verificar si el siguiente es usuario normal o grupo de causación
            const nextSignerInfo = await query(
              `SELECT ds.user_id, ds.is_causacion_group, ds.grupo_codigo
               FROM document_signers ds
               WHERE ds.document_id = $1
                 AND ds.order_position > $2
                 AND NOT EXISTS (
                   SELECT 1
                   FROM signatures s
                   WHERE s.document_id = ds.document_id
                     AND s.status = 'signed'
                     AND (
                       (ds.is_causacion_group = false AND (${signatureJoinConditionForCounts}))
                       OR
                       (ds.is_causacion_group = true AND s.signer_id IN (
                         SELECT ci.user_id
                         FROM causacion_integrantes ci
                         JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                         WHERE cg.codigo = ds.grupo_codigo AND ci.activo = true
                       )${csConstraint})
                     )
                 )
               ORDER BY ds.order_position ASC
               LIMIT 1`,
              [documentId, currentOrder]
            );

            if (nextSignerInfo.rows.length > 0) {
              const nextInfo = nextSignerInfo.rows[0];
              const creatorResult = await query('SELECT name FROM users WHERE id = $1', [doc.uploaded_by]);
              const creatorName = creatorResult.rows.length > 0 ? creatorResult.rows[0].name : 'Administrador';

              if (nextInfo.is_causacion_group && nextInfo.grupo_codigo) {
                // ========== SIGUIENTE ES GRUPO DE CAUSACIÓN: Notificar a TODOS ==========
                console.log(`📋 Siguiente firmante es grupo de causación: ${nextInfo.grupo_codigo}`);

                // Obtener información del creador del documento para incluir en eventos
                const creatorInfo = await query('SELECT id, name, email FROM users WHERE id = $1', [doc.uploaded_by]);
                const actorData = creatorInfo.rows.length > 0 ? {
                  id: creatorInfo.rows[0].id,
                  name: creatorInfo.rows[0].name,
                  email: creatorInfo.rows[0].email
                } : { id: doc.uploaded_by, name: null, email: null };

                const membersResult = await query(`
                  SELECT u.id, u.name, u.email, u.email_notifications
                  FROM causacion_integrantes ci
                  JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                  JOIN users u ON ci.user_id = u.id
                  WHERE cg.codigo = $1 AND ci.activo = true
                `, [nextInfo.grupo_codigo]);

                for (const member of membersResult.rows) {
                  const insertResult = await query(
                    `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                     SELECT $1::uuid, $2::varchar, $3::uuid, $4::uuid, $5::varchar
                     WHERE NOT EXISTS (
                       SELECT 1 FROM notifications
                       WHERE user_id = $1::uuid AND type = $2::varchar AND document_id = $3::uuid
                     )
                     RETURNING id`,
                    [member.id, 'signature_request', documentId, doc.uploaded_by, doc.title]
                  );

                  // Emitir evento WebSocket si se creó la notificación
                  if (insertResult.rows.length > 0) {
                    websocketService.emitNotificationCreated(member.id, {
                      id: insertResult.rows[0].id,
                      type: 'signature_request',
                      document_id: documentId,
                      actor_id: doc.uploaded_by,
                      document_title: doc.title,
                      actor: actorData
                    });
                  }

                  if (insertResult.rows.length > 0 && member.email_notifications) {
                    try {
                      await notificarAsignacionFirmante({
                        email: member.email,
                        nombreFirmante: member.name,
                        nombreDocumento: doc.title,
                        documentoId: documentId,
                        creadorDocumento: creatorName,
                        tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                      });
                      console.log(`📧 Correo enviado a miembro del grupo: ${member.email}`);
                    } catch (emailError) {
                      console.error(`Error al enviar correo a ${member.email}:`, emailError);
                    }
                  }
                }
              } else if (nextInfo.user_id) {
                // ========== SIGUIENTE ES USUARIO NORMAL ==========
                const nextSignerResult = await query(
                  `SELECT u.id, u.name, u.email, u.email_notifications
                   FROM users u WHERE u.id = $1`,
                  [nextInfo.user_id]
                );

                if (nextSignerResult.rows.length > 0) {
                  const nextSigner = nextSignerResult.rows[0];

                  const insertResult = await query(
                    `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
                     SELECT $1::uuid, $2::varchar, $3::uuid, $4::uuid, $5::varchar
                     WHERE NOT EXISTS (
                       SELECT 1 FROM notifications
                       WHERE user_id = $1::uuid AND type = $2::varchar AND document_id = $3::uuid
                     )
                     RETURNING id`,
                    [nextSigner.id, 'signature_request', documentId, doc.uploaded_by, doc.title]
                  );

                  if (insertResult.rows.length > 0) {

                    // Obtener información del creador del documento para el evento
                    const creatorInfo2 = await query('SELECT id, name, email FROM users WHERE id = $1', [doc.uploaded_by]);
                    const actorData2 = creatorInfo2.rows.length > 0 ? {
                      id: creatorInfo2.rows[0].id,
                      name: creatorInfo2.rows[0].name,
                      email: creatorInfo2.rows[0].email
                    } : { id: doc.uploaded_by, name: null, email: null };

                    // Emitir evento WebSocket
                    websocketService.emitNotificationCreated(nextSigner.id, {
                      id: insertResult.rows[0].id,
                      type: 'signature_request',
                      document_id: documentId,
                      actor_id: doc.uploaded_by,
                      document_title: doc.title,
                      actor: actorData2
                    });

                    if (nextSigner.email_notifications) {
                      try {
                        await notificarAsignacionFirmante({
                          email: nextSigner.email,
                          nombreFirmante: nextSigner.name,
                          nombreDocumento: doc.title,
                          documentoId: documentId,
                          creadorDocumento: creatorName,
                          tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                        });
                        console.log(`📧 Correo enviado al siguiente firmante: ${nextSigner.email}`);
                      } catch (emailError) {
                        console.error(`Error al enviar correo al siguiente firmante:`, emailError);
                      }
                    }
                  }
                }
              }
            }
          }

          // 4. Si el documento fue COMPLETADO, gestionar notificaciones especiales
          if (newStatus === 'completed') {
            await query(
              `DELETE FROM notifications
               WHERE document_id = $1
               AND user_id = $2
               AND type = 'document_signed'`,
              [documentId, doc.uploaded_by]
            );
            websocketService.emitNotificationDeleted(documentId, null, doc.uploaded_by, 'document_signed');

            const completedNotifResult = await query(
              `INSERT INTO notifications (user_id, type, document_id, actor_id, document_title)
               VALUES ($1, $2, $3, $4, $5)
               RETURNING id`,
              [doc.uploaded_by, 'document_completed', documentId, user.id, doc.title]
            );

            if (completedNotifResult.rows.length > 0) {
              websocketService.emitNotificationCreated(doc.uploaded_by, {
                id: completedNotifResult.rows[0].id,
                type: 'document_completed',
                document_id: documentId,
                actor_id: user.id,
                document_title: doc.title,
                actor: {
                  id: user.id,
                  name: user.name,
                  email: user.email
                }
              });
            }
          }

          // ========== ENVIAR CORREO AL CREADOR SI DOCUMENTO COMPLETADO ==========
          if (newStatus === 'completed') {
            try {
              const creatorResult = await query(
                `SELECT email, name, email_notifications FROM users WHERE id = $1`,
                [doc.uploaded_by]
              );

              if (creatorResult.rows.length > 0) {
                const creator = creatorResult.rows[0];

                if (creator.email_notifications) {
                  console.log('📧 Documento completamente firmado, enviando correo al creador...');

                  // Construir URL de descarga usando la ruta de la API
                  const urlDescarga = `${serverConfig.backendUrl}/api/download/${documentId}`;

                  await notificarDocumentoFirmadoCompleto({
                    emails: [creator.email],
                    nombreDocumento: doc.title,
                    documentoId: documentId,
                    urlDescarga,
                    tipoDocumento: doc.document_type_code === 'FV' ? 'factura' : doc.document_type_code === 'SA' ? 'anticipo' : 'documento'
                  });

                  console.log(`✅ Correo de documento completado enviado al creador: ${creator.email}`);
                } else {
                  // console.log(`⏭️ Notificaciones desactivadas para el creador: ${creator.email}`);
                }
              }
            } catch (emailError) {
              console.error('Error al enviar correo de documento completado:', emailError);
              // No lanzamos el error para que no falle la firma
            }
          }
        }
      } catch (notifError) {
        console.error('Error al crear notificaciones de firma:', notifError);
        // No lanzamos el error para que no falle la firma
      }

      // ========== ACTUALIZAR PÁGINA DE FIRMANTES ==========
      try {

        const docInfoResult = await query(
          `SELECT d.*, u.name as uploader_name, dt.name as document_type_name
          FROM documents d
          LEFT JOIN users u ON d.uploaded_by = u.id
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docInfoResult.rows.length > 0) {
          const docInfo = docInfoResult.rows[0];

          const signersResult = await query(
            `SELECT
                ds.user_id,
                ds.order_position,
                ds.role_name,
                ds.role_names,
                ds.is_causacion_group,
                ds.grupo_codigo,
                u.name as user_name,
                cg.nombre as grupo_nombre,
                u.email,
                COALESCE(s.status, 'pending') as status,
                s.signed_at,
                s.rejected_at,
                s.rejection_reason,
                NULL as consecutivo,
                signer_user.name as real_signer_name,
                signer_user.email as signer_email,
                NULL as retention_percentage,
                NULL as retention_reason,
                NULL as retained_at
            FROM document_signers ds
            LEFT JOIN users u ON ds.user_id = u.id
            LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
              (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
              (ds.is_causacion_group = true AND s.signer_id IN (
                SELECT ci.user_id
                FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = ds.grupo_codigo
              )${csConstraint})
            )
            LEFT JOIN users signer_user ON s.signer_id = signer_user.id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows.map(row => {
            const name = row.is_causacion_group
              ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación')
              : (row.user_name || 'Sin nombre');

            return {
              name: name,
              email: row.signer_email || row.email,
              order_position: row.order_position,
              role_name: row.role_name,
              role_names: row.role_names,
              status: row.status,
              signed_at: row.signed_at,
              rejected_at: row.rejected_at,
              rejection_reason: row.rejection_reason,
              consecutivo: row.consecutivo,
              is_causacion_group: row.is_causacion_group,
              grupo_codigo: row.grupo_codigo,
              real_signer_name: row.real_signer_name,
              retention_percentage: row.retention_percentage,
              retention_reason: row.retention_reason,
              retained_at: row.retained_at
            };
          });
          const pdfPath = path.join(__dirname, '..', docInfo.file_path);

          const sentAtResult2 = await query(
            `SELECT COALESCE(
              (SELECT MAX(signed_at) FROM signatures WHERE document_id = $1 AND status = 'signed'),
              (SELECT MIN(created_at) FROM document_signers WHERE document_id = $1)
            ) as sent_at`,
            [documentId]
          );

          const documentInfo = {
            title: docInfo.title,
            fileName: docInfo.file_name,
            createdAt: docInfo.created_at,
            sentAt: sentAtResult2.rows[0]?.sent_at || null,
            uploadedBy: docInfo.uploader_name || 'Sistema',
            documentTypeName: docInfo.document_type_name || null
          };

          await updateSignersPage(pdfPath, signers, documentInfo);


          // Verificar si tiene retenciones activas (puede haberse perdido el sello al actualizar páginas)
          const hasActiveRetentions = await checkIfDocumentHasActiveRetentions(documentId);

          if (hasActiveRetentions) {
            // Si tiene retenciones activas, SIEMPRE re-agregar sello RETENIDO después de updateSignersPage
            try {
              await addStampToPdf(pdfPath, 'RETENIDO');
              console.log('⚠️ Sello RETENIDO re-agregado después de updateSignersPage (documento con retención activa)');
            } catch (stampError) {
              console.error('❌ Error al re-agregar sello RETENIDO:', stampError);
            }
          } else if (newStatus === 'completed') {
            // Si NO tiene retenciones y está completado, agregar sello APROBADO
            try {
              await addStampToPdf(pdfPath, 'APROBADO');
              console.log('✅ Sello APROBADO agregado al documento (completado sin retención)');
            } catch (stampError) {
              console.error('❌ Error al agregar sello APROBADO:', stampError);
            }
          }
        }
      } catch (updateError) {
        console.error('❌ Error al actualizar página de firmantes:', updateError);
        // No lanzamos el error para que no falle la firma
      }

      // ========== ACTUALIZAR ESTADOS DE FACTURA (si aplica) ==========
      try {
        const docTypeResult = await query(
          `SELECT dt.code, d.consecutivo
           FROM documents d
           LEFT JOIN document_types dt ON d.document_type_id = dt.id
           WHERE d.id = $1`,
          [documentId]
        );

        if (docTypeResult.rows.length > 0) {
          const docData = docTypeResult.rows[0];

          // Solo procesar si es un documento de tipo FV y tiene consecutivo
          if (docData.code === 'FV' && docData.consecutivo) {
            const axios = require('axios');
            const backendHost = serverConfig.backendUrl;

            // 1. Verificar si el firmante actual pertenece al grupo de Causación
            const signerRoleResult = await query(
              `SELECT ds.role_name, ds.role_names
               FROM document_signers ds
               WHERE ds.document_id = $1 AND ds.user_id = $2`,
              [documentId, user.id]
            );

            if (signerRoleResult.rows.length > 0) {
              const signerData = signerRoleResult.rows[0];

              // Obtener todos los roles del firmante (manejo de múltiples roles para FV)
              let signerRoles = [];
              if (signerData.role_names) {
                try {
                  signerRoles = JSON.parse(signerData.role_names);
                } catch (e) {
                  signerRoles = [signerData.role_name];
                }
              } else if (signerData.role_name) {
                signerRoles = [signerData.role_name];
              }

              // Verificar si alguno de sus roles es de Causación
              const isCausacionRole = signerRoles.some(role =>
                role && (role.includes('CAUSACION') || role.includes('Causación'))
              );

              // Si es del grupo de causación, marcar la factura como causada
              if (isCausacionRole && docData.__legacyMarcarCausado) {
                try {
                  await axios.post(
                    `${backendHost}/api/facturas/marcar-causado/${docData.consecutivo}`,
                    {},
                    { headers: { 'Content-Type': 'application/json' } }
                  );
                  console.log(`✅ Factura ${docData.consecutivo} marcada como causada (firmó grupo de causación)`);
                } catch (causError) {
                  console.error(`❌ Error al marcar factura como causada:`, causError.message);
                }
              }
            }

            // 2. Si la factura fue corregida y el rechazante acaba de firmar, aprobar la corrección
            try {
              const correctedResult = await queryFacturas(
                `UPDATE crud_facturas."T_Facturas"
                 SET en_proceso = TRUE, rechazada = FALSE, corregida = FALSE
                 WHERE numero_control = $1 AND corregida = TRUE
                 RETURNING numero_control`,
                [docData.consecutivo]
              );
              if (correctedResult.rows.length > 0) {
                console.log(`✅ Corrección aprobada automáticamente para factura ${docData.consecutivo}`);
              }
            } catch (corrErr) {
              console.error(`❌ Error al aprobar corrección de factura:`, corrErr.message);
            }

            // 3. Si el documento está completado, marcar la factura como finalizada
            if (newStatus === 'completed') {
              try {
                await axios.post(
                  `${backendHost}/api/facturas/marcar-finalizado/${docData.consecutivo}`,
                  {},
                  { headers: { 'Content-Type': 'application/json' } }
                );
                console.log(`✅ Factura ${docData.consecutivo} marcada como finalizada (documento completado)`);
              } catch (finError) {
                console.error(`❌ Error al marcar factura como finalizada:`, finError.message);
              }
            }
          }
        }
      } catch (facturaError) {
        console.error('❌ Error al actualizar estados de factura:', facturaError);
        // No lanzamos el error para que no falle la firma
      }

      // ========== PROCESAR RETENCIONES MÚLTIPLES SI SE PROPORCIONARON ==========

      // Parsear retenciones desde JSON
      let parsedRetentions = null;
      if (retentions) {
        try {
          parsedRetentions = JSON.parse(retentions);
          console.log(`🔍 [DEBUG] Retenciones parseadas:`, parsedRetentions);
        } catch (parseError) {
          console.error('❌ Error al parsear retenciones:', parseError);
        }
      }

      if (parsedRetentions && Array.isArray(parsedRetentions) && parsedRetentions.length > 0) {
        try {
          console.log(`📋 ✅ INICIANDO Procesamiento de ${parsedRetentions.length} retenciones para documento ${documentId}...`);

          // Verificar que es documento FV
          const docTypeCheck = await query(
            `SELECT dt.code
             FROM documents d
             LEFT JOIN document_types dt ON d.document_type_id = dt.id
             WHERE d.id = $1`,
            [documentId]
          );

          if (docTypeCheck.rows.length > 0 && docTypeCheck.rows[0].code === 'FV') {
            // Verificar que el usuario tiene el rol RESPONSABLE_CENTRO_COSTOS
            const signerCheck = await query(
              `SELECT ds.assigned_role_ids, ds.role_names
               FROM document_signers ds
               WHERE ds.document_id = $1 AND ds.user_id = $2`,
              [documentId, user.id]
            );

            if (signerCheck.rows.length > 0) {
              const signer = signerCheck.rows[0];
              let hasRespCtroCost = false;

              console.log(`🔍 [RETENCIÓN] Verificando rol para usuario ${user.name}:`);
              console.log(`  - assigned_role_ids:`, signer.assigned_role_ids);
              console.log(`  - role_names:`, signer.role_names);

              // Buscar el código de rol en la base de datos
              if (signer.assigned_role_ids && signer.assigned_role_ids.length > 0) {
                const roleCodesResult = await query(
                  `SELECT role_code FROM document_type_roles WHERE id = ANY($1)`,
                  [signer.assigned_role_ids]
                );
                const roleCodes = roleCodesResult.rows.map(r => r.role_code);
                console.log(`  - role_codes encontrados:`, roleCodes);
                hasRespCtroCost = roleCodes.includes('RESPONSABLE_CENTRO_COSTOS');
              } else if (signer.role_names && signer.role_names.length > 0) {
                // Fallback: buscar por role_name
                const roleCodesResult = await query(
                  `SELECT role_code FROM document_type_roles WHERE role_name = ANY($1)`,
                  [signer.role_names]
                );
                const roleCodes = roleCodesResult.rows.map(r => r.role_code);
                console.log(`  - role_codes encontrados (fallback):`, roleCodes);
                hasRespCtroCost = roleCodes.includes('RESPONSABLE_CENTRO_COSTOS');
              }

              console.log(`  - hasRespCtroCost:`, hasRespCtroCost);
              console.log(`  - Número de retenciones a procesar:`, parsedRetentions.length);

              if (hasRespCtroCost) {
                // Obtener nombre del usuario desde la BD
                const userDataResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
                const userName = userDataResult.rows.length > 0 ? userDataResult.rows[0].name : 'Usuario desconocido';

                console.log(`🔄 [RETENCIÓN MÚLTIPLE] Iniciando proceso de ${parsedRetentions.length} retenciones para usuario ${userName} (ID: ${user.id})`);

                // Obtener metadata del documento para encontrar los centros de costo
                const metadataResult = await query(
                  'SELECT metadata, retention_data FROM documents WHERE id = $1',
                  [documentId]
                );

                if (metadataResult.rows.length > 0) {
                  const metadata = metadataResult.rows[0].metadata;
                  const currentRetentions = metadataResult.rows[0].retention_data || [];

                  console.log(`📋 metadata.causacionDetails:`, metadata?.causacionDetails);

                  // Procesar cada retención en el array
                  let successfulRetentions = 0;
                  for (const retention of parsedRetentions) {
                    const { centroCostoIndex, percentage, reason } = retention;

                    console.log(`\n🔍 Procesando retención ${successfulRetentions + 1}/${parsedRetentions.length}:`, {
                      centroCostoIndex,
                      percentage,
                      reason: reason ? reason.substring(0, 50) + '...' : 'Sin motivo'
                    });

                    // Validar porcentaje
                    if (percentage < 1 || percentage > 100) {
                      console.warn(`⚠️ Porcentaje inválido (${percentage}%), saltando esta retención`);
                      continue;
                    }

                    // Validar centro de costo y obtener porcentaje máximo
                    // Los centros de costos están en metadata.filasControl (NO en causacionDetails)
                    let maxPercentage = 100;
                    if (metadata && metadata.filasControl && metadata.filasControl[centroCostoIndex]) {
                      const fila = metadata.filasControl[centroCostoIndex];

                      // Validar que el usuario es responsable de este centro comparando nombres
                      if (!nombresCoinciden(userName, fila.respCentroCostos)) {
                        console.error(`❌ Usuario ${userName} NO es responsable del centro ${fila.centroCostos}, saltando`);
                        continue;
                      }

                      maxPercentage = parseFloat(fila.porcentaje || 100);
                      console.log(`✅ Centro validado: ${fila.centroCostos}, max: ${maxPercentage}%`);
                    } else {
                      console.warn(`⚠️ centroCostoIndex ${centroCostoIndex} no encontrado en metadata.filasControl, usando max 100%`);
                    }

                    // Validar que no exceda el porcentaje asignado
                    if (percentage > maxPercentage) {
                      console.warn(`⚠️ Porcentaje ${percentage}% excede el asignado (${maxPercentage}%), saltando`);
                      continue;
                    }

                    // Verificar si ya existe una retención activa para este centro
                    const existingIndex = currentRetentions.findIndex(
                      r => String(r.userId) === String(user.id) &&
                           r.centroCostoIndex === centroCostoIndex &&
                           r.activa
                    );

                    const retentionItem = {
                      userId: String(user.id),
                      userName: userName,
                      centroCostoIndex: centroCostoIndex,
                      motivo: reason,
                      porcentajeRetenido: percentage,
                      fechaRetencion: new Date().toISOString(),
                      activa: true
                    };

                    if (existingIndex >= 0) {
                      currentRetentions[existingIndex] = retentionItem;
                      console.log(`✅ Retención actualizada para centro ${centroCostoIndex}`);
                    } else {
                      currentRetentions.push(retentionItem);
                      console.log(`✅ Nueva retención creada para centro ${centroCostoIndex}`);
                    }

                    successfulRetentions++;
                  }

                  console.log(`\n📊 Retenciones procesadas: ${successfulRetentions}/${parsedRetentions.length}`);

                  // Guardar todas las retenciones en retention_data
                  if (successfulRetentions > 0) {
                    await query(
                      'UPDATE documents SET retention_data = $1 WHERE id = $2',
                      [JSON.stringify(currentRetentions), documentId]
                    );

                    console.log(`✅ ${successfulRetentions} retenciones guardadas en documento ${documentId}`);
                    console.log(`📊 retention_data actualizado:`, JSON.stringify(currentRetentions, null, 2));

                    // Emitir evento WebSocket de retención (notificar con el primer centro de costo)
                    if (parsedRetentions.length > 0) {
                      websocketService.emitDocumentRetained(documentId, {
                        retainedBy: userName,
                        userId: user.id,
                        percentage: parsedRetentions[0].percentage,
                        reason: parsedRetentions[0].reason,
                        centroCostoIndex: parsedRetentions[0].centroCostoIndex,
                        totalRetentions: successfulRetentions
                      });
                      console.log(`🔔 [WEBSOCKET] Emitido evento de retención múltiple para documento ${documentId}`);
                    }

                    // ========== REGENERAR PDF CON RETENCIONES ==========
                    console.log(`🔍 [DEBUG] Verificando metadata:`, { hasMetadata: !!metadata, keysLength: metadata ? Object.keys(metadata).length : 0 });
                    if (metadata && Object.keys(metadata).length > 0) {
                      console.log('📋 ✅✅✅ REGENERANDO PDF FV después de firmar con retenciones múltiples...');

                      try {
                          const fs = require('fs').promises;
                          const path = require('path');

                          const templateData = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
                          console.log(`🔍 [DEBUG] templateData parseado correctamente`);

                          // Obtener firmas actuales
                          const firmasActuales = await obtenerFirmasDocumento(documentId, templateData);
                          console.log(`🔍 [DEBUG] Firmas actuales obtenidas:`, firmasActuales ? Object.keys(firmasActuales) : []);

                          // Usar las retenciones que acabamos de guardar
                          const activeRetentions = currentRetentions.filter(r => r.activa);
                          console.log(`📦 ✅ Retenciones activas después de retener (${activeRetentions.length}):`, activeRetentions);

                          // Regenerar PDF con retenciones
                          const templatePdfBuffer = await generateFacturaTemplatePDF(templateData, firmasActuales, false, activeRetentions);

                          // Guardar PDF en archivo temporal
                          const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
                          await fs.mkdir(tempDir, { recursive: true });
                          const tempPlanillaPath = path.join(tempDir, `planilla_${documentId}_${Date.now()}.pdf`);
                          await fs.writeFile(tempPlanillaPath, templatePdfBuffer);
                          console.log(`✅ Planilla guardada en: ${tempPlanillaPath}`);

                          // Obtener info del documento para backups
                          const docBackupInfo = await query(
                            'SELECT file_path, original_pdf_backup FROM documents WHERE id = $1',
                            [documentId]
                          );

                          if (docBackupInfo.rows.length > 0) {
                            const relativePath = docBackupInfo.rows[0].file_path.replace(/^uploads\//, '');
                            const currentPdfPath = path.join(__dirname, '..', 'uploads', relativePath);
                            console.log(`📄 PDF actual: ${currentPdfPath}`);

                            // Cargar backups
                            let backupFilePaths = [];
                            if (docBackupInfo.rows[0].original_pdf_backup) {
                              const backupPathsArray = JSON.parse(docBackupInfo.rows[0].original_pdf_backup);
                              console.log(`📦 Backups registrados: ${backupPathsArray.length}`);
                              for (const relPath of backupPathsArray) {
                                const backupRelativePath = relPath.replace(/^uploads\//, '');
                                const backupFullPath = path.join(__dirname, '..', 'uploads', backupRelativePath);
                                try {
                                  await fs.access(backupFullPath);
                                  backupFilePaths.push(backupFullPath);
                                  // console.log(`   ✅ Backup encontrado: ${path.basename(backupFullPath)}`);
                                } catch (e) {
                                  console.warn(`   ⚠️ Backup no encontrado: ${backupFullPath}`);
                                }
                              }
                            }
                            console.log(`📦 Total backups cargados: ${backupFilePaths.length}`);

                            // Fusionar PDFs (plantilla + backups)
                            const tempMergedPath = path.join(tempDir, `merged_${documentId}_${Date.now()}.pdf`);
                            const filesToMerge = [tempPlanillaPath, ...backupFilePaths];
                            console.log(`🔗 Fusionando ${filesToMerge.length} PDFs...`);
                            await mergePDFs(filesToMerge, tempMergedPath);
                            console.log(`✅ PDFs fusionados en: ${tempMergedPath}`);

                            // Agregar informe de firmantes
                            console.log(`📄 Generando informe de firmantes...`);
                            const { consecutivoSelect, signerNameSelect } = await getSignatureColumnSelects();
                            const signersForCover = await query(
                              `SELECT
                                ds.user_id,
                                ds.order_position,
                                ds.role_name,
                                ds.role_names,
                                ds.is_causacion_group,
                                ds.grupo_codigo,
                                u.name as user_name,
                                cg.nombre as grupo_nombre,
                                u.email,
                                COALESCE(s.status, 'pending') as status,
                                s.signed_at,
                                s.rejected_at,
                                s.rejection_reason,
                                ${consecutivoSelect},
                                ${signerNameSelect},
                                signer_user.email as signer_email
                               FROM document_signers ds
                               LEFT JOIN users u ON ds.user_id = u.id
                               LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
                               LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
                                 (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
                                 (ds.is_causacion_group = true AND s.signer_id IN (
                                   SELECT ci.user_id
                                   FROM causacion_integrantes ci
                                   JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                                   WHERE cg.codigo = ds.grupo_codigo
                                 )${csConstraint})
                               )
                               LEFT JOIN users signer_user ON s.signer_id = signer_user.id
                               WHERE ds.document_id = $1
                               ORDER BY ds.order_position ASC`,
                              [documentId]
                            );

                            const signers = signersForCover.rows.map(row => {
                              const name = row.is_causacion_group
                                ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación')
                                : (row.user_name || 'Sin nombre');

                              return {
                                name: name,
                                email: row.signer_email || row.email,
                                order_position: row.order_position,
                                role_name: row.role_name,
                                role_names: row.role_names,
                                status: row.status,
                                signed_at: row.signed_at,
                                rejected_at: row.rejected_at,
                                rejection_reason: row.rejection_reason,
                                consecutivo: row.consecutivo,
                                is_causacion_group: row.is_causacion_group,
                                grupo_codigo: row.grupo_codigo,
                                real_signer_name: row.real_signer_name
                              };
                            });

                            // Obtener información del documento para la portada
                            const docInfoForCover = await query(
                              `SELECT d.title, d.file_name, d.created_at, u.name as uploader_name, dt.name as document_type_name
                              FROM documents d
                              LEFT JOIN users u ON d.uploaded_by = u.id
                              LEFT JOIN document_types dt ON d.document_type_id = dt.id
                              WHERE d.id = $1`,
                              [documentId]
                            );
                            const docData = docInfoForCover.rows[0];

                            const documentInfoForCover = {
                              title: docData.title || 'Factura',
                              fileName: docData.file_name || '',
                              createdAt: docData.created_at,
                              uploadedBy: docData.uploader_name || 'Sistema',
                              documentTypeName: docData.document_type_name || 'Factura'
                            };

                            await addCoverPageWithSigners(tempMergedPath, signers, documentInfoForCover);
                            console.log(`✅ Informe de firmantes agregado`);

                            // Copiar merged PDF sobre el PDF actual
                            console.log(`📋 Copiando PDF fusionado a: ${currentPdfPath}`);
                            await fs.copyFile(tempMergedPath, currentPdfPath);

                            // SIEMPRE agregar sello RETENIDO cuando se retiene (sin importar estado)
                            try {
                              await addStampToPdf(currentPdfPath, 'RETENIDO');
                              console.log('⚠️ Sello RETENIDO agregado al documento (factura retenida)');
                            } catch (stampError) {
                              console.error('❌ Error al agregar sello RETENIDO:', stampError);
                            }

                            // Limpiar archivos temporales
                            console.log(`🧹 Limpiando archivos temporales...`);
                            await cleanupTempFiles([tempPlanillaPath, tempMergedPath]);

                            console.log('✅✅✅ PDF regenerado exitosamente después de firmar con retención (plantilla + backups + informe)');
                          } else {
                            console.error('❌ No se encontró información del documento para regenerar PDF');
                          }
                        } catch (pdfError) {
                          console.error('❌ Error al regenerar PDF con retención:', pdfError);
                          // No lanzar error para no fallar la firma
                        }
                      } else {
                        console.warn('⚠️⚠️⚠️ Documento sin metadata (sin plantilla FV completa), PDF NO se regenerará con retenciones');
                        console.warn('ℹ️ Para ver columnas de retención, el documento debe tener plantilla de factura completa guardada');
                      }
                    }
                  }
                } else {
                  const userDataResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
                  const userName = userDataResult.rows.length > 0 ? userDataResult.rows[0].name : 'Usuario desconocido';
                  console.warn(`⚠️ Usuario ${userName} (ID: ${user.id}) no tiene rol RESP_CTRO_COST, no puede retener`);
                }
              }
            } else {
              console.warn(`⚠️ Documento ${documentId} no es tipo FV, no se puede retener`);
            }
        } catch (retentionError) {
          console.error('❌ Error al procesar retención:', retentionError);
          // No lanzamos el error para que no falle la firma
        }
      }

      // Emitir evento WebSocket para notificar a todos los clientes
      const wsData = {
        signedBy: user.name,
        realSignerName: effectiveRealSignerName || user.name,
        signerId: user.id,
        status: newStatus
      };
      websocketService.emitDocumentSigned(documentId, wsData);

      // Verificar si el documento está completamente firmado y sin retenciones
      // para eliminar backups (esto no debe bloquear la firma)
      checkAndCleanupBackupsIfComplete(documentId).catch(err => {
        console.error('⚠️ Error al verificar cleanup de backups:', err);
      });

      return result.rows[0];
    },

    /**
     * Retains a FV document after signing
     *
     * BUSINESS RULE: Only responsible for cost center (resp ctro cost) can retain
     * BUSINESS RULE: Can only be called on FV documents
     * BUSINESS RULE: User must have already signed the document
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.documentId - ID of the document
     * @param {number} args.retentionPercentage - Percentage to retain (1-100)
     * @param {string} args.retentionReason - Reason for retention
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<Object>} DocumentRetention record
     * @throws {Error} When unauthorized or invalid document type
     */
    retainDocument: async (_, { documentId, retentionPercentage, retentionReason }, { user }) => {
      if (!user) throw new Error('No autenticado');

      // Validar que el porcentaje esté en el rango correcto
      if (retentionPercentage < 1 || retentionPercentage > 100) {
        throw new Error('El porcentaje de retención debe estar entre 1 y 100');
      }

      // Verificar que es documento FV
      const docCheck = await query(
        `SELECT d.id, dt.code
         FROM documents d
         LEFT JOIN document_types dt ON d.document_type_id = dt.id
         WHERE d.id = $1`,
        [documentId]
      );

      if (docCheck.rows.length === 0) {
        throw new Error('Documento no encontrado');
      }

      if (docCheck.rows[0].code !== 'FV') {
        throw new Error('Solo se pueden retener documentos de tipo FV');
      }

      // Verificar que el usuario es firmante con rol resp ctro cost
      const signerCheck = await query(
        `SELECT ds.assigned_role_ids, ds.role_names
         FROM document_signers ds
         WHERE ds.document_id = $1 AND ds.user_id = $2`,
        [documentId, user.id]
      );

      if (signerCheck.rows.length === 0) {
        throw new Error('No estás asignado como firmante de este documento');
      }

      const signer = signerCheck.rows[0];
      let hasRespCtroCost = false;

      // Buscar el código de rol en la base de datos
      if (signer.assigned_role_ids && signer.assigned_role_ids.length > 0) {
        const roleCodesResult = await query(
          `SELECT role_code FROM document_type_roles WHERE id = ANY($1)`,
          [signer.assigned_role_ids]
        );
        const roleCodes = roleCodesResult.rows.map(r => r.role_code);
        hasRespCtroCost = roleCodes.includes('RESPONSABLE_CENTRO_COSTOS');
      } else if (signer.role_names && signer.role_names.length > 0) {
        // Fallback: buscar por role_name
        const roleCodesResult = await query(
          `SELECT role_code FROM document_type_roles WHERE role_name = ANY($1)`,
          [signer.role_names]
        );
        const roleCodes = roleCodesResult.rows.map(r => r.role_code);
        hasRespCtroCost = roleCodes.includes('RESPONSABLE_CENTRO_COSTOS');
      }

      if (!hasRespCtroCost) {
        throw new Error('Solo el responsable del centro de costos puede retener facturas');
      }

      // Verificar que el usuario ya firmó el documento
      const signatureCheck = await query(
        `SELECT id, status
         FROM signatures
         WHERE document_id = $1 AND signer_id = $2 AND status = 'signed'`,
        [documentId, user.id]
      );

      if (signatureCheck.rows.length === 0) {
        throw new Error('Debes firmar el documento antes de retenerlo');
      }

      // Verificar que no haya una retención activa
      const activeRetention = await query(
        `SELECT id
         FROM document_retentions
         WHERE document_id = $1 AND released_at IS NULL`,
        [documentId]
      );

      if (activeRetention.rows.length > 0) {
        throw new Error('Este documento ya tiene una retención activa');
      }

      // Crear la retención
      const result = await query(
        `INSERT INTO document_retentions (document_id, retained_by, retention_percentage, retention_reason)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [documentId, user.id, retentionPercentage, retentionReason]
      );

      console.log(`📋 Documento ${documentId} retenido por ${user.name} (${retentionPercentage}%)`);

      return result.rows[0];
    },

    /**
     * Marks a single notification as read
     *
     * BUSINESS RULE: Users can only mark their own notifications as read.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} args - Arguments object
     * @param {number} args.notificationId - ID of the notification
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<Object>} Updated notification object
     * @throws {Error} When notification not found or not owned by user
     */
    markNotificationAsRead: async (_, { notificationId }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const result = await query(
        'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
        [notificationId, user.id]
      );

      if (result.rows.length === 0) {
        throw new Error('Notificación no encontrada');
      }

      // Emitir evento WebSocket
      websocketService.emitNotificationRead(notificationId, user.id);

      return result.rows[0];
    },

    /**
     * Marks all unread notifications as read for the current user
     *
     * BUSINESS RULE: Only affects notifications owned by the authenticated user.
     * BUSINESS RULE: Only updates notifications where is_read = FALSE.
     *
     * @param {Object} _ - Parent (unused)
     * @param {Object} __ - Arguments (unused)
     * @param {Object} context - GraphQL context
     * @param {Object} context.user - Authenticated user
     * @returns {Promise<boolean>} True if update succeeds
     * @throws {Error} When not authenticated
     */
    markAllNotificationsAsRead: async (_, __, { user }) => {
      if (!user) throw new Error('No autenticado');

      await query(
        'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE',
        [user.id]
      );

      // Emitir evento WebSocket
      websocketService.emitAllNotificationsRead(user.id);

      return true;
    },

    /**
     * Retains a document cost center
     */
    retainDocument: async (_, { documentId, centroCostoIndex, retentionPercentage, retentionReason }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get document with metadata
        const docResult = await client.query(
          'SELECT metadata, retention_data FROM documents WHERE id = $1',
          [documentId]
        );

        if (docResult.rows.length === 0) {
          throw new Error('Documento no encontrado');
        }

        const metadata = docResult.rows[0].metadata;
        const currentRetentions = docResult.rows[0].retention_data || [];

        // Validate user is responsible for this cost center
        // Los centros de costos están en metadata.filasControl (NO en causacionDetails)
        if (!metadata || !metadata.filasControl || !metadata.filasControl[centroCostoIndex]) {
          throw new Error('Centro de costo no encontrado');
        }

        const fila = metadata.filasControl[centroCostoIndex];
        const responsableName = fila.respCentroCostos;

        // Obtener nombre del usuario
        const userDataResult = await query('SELECT name FROM users WHERE id = $1', [user.id]);
        const userName = userDataResult.rows.length > 0 ? userDataResult.rows[0].name : null;

        if (responsableName !== userName) {
          throw new Error('No eres responsable de este centro de costo');
        }

        // Validate retention percentage doesn't exceed assigned percentage
        const maxPercentage = parseFloat(fila.porcentaje || 0);
        if (retentionPercentage > maxPercentage) {
          throw new Error(`No puedes retener más del ${maxPercentage}% asignado`);
        }

        // Add or update retention
        const existingIndex = currentRetentions.findIndex(
          r => r.userId === user.id && r.centroCostoIndex === centroCostoIndex && r.activa
        );

        const retentionItem = {
          userId: user.id,
          userName: user.name,
          centroCostoIndex,
          motivo: retentionReason,
          porcentajeRetenido: retentionPercentage,
          fechaRetencion: new Date().toISOString(),
          activa: true
        };

        if (existingIndex >= 0) {
          currentRetentions[existingIndex] = retentionItem;
        } else {
          currentRetentions.push(retentionItem);
        }

        await client.query(
          'UPDATE documents SET retention_data = $1 WHERE id = $2',
          [JSON.stringify(currentRetentions), documentId]
        );

        await client.query('COMMIT');

        // ========== REGENERAR PDF FV SI ES NECESARIO ==========
        // OPTIMIZED: Consolidar queries y usar mergePDFs() optimizado
        const docInfoResult = await query(
          `SELECT
            d.file_path,
            d.original_pdf_backup,
            d.title,
            d.file_name,
            d.created_at,
            dt.code as document_type_code,
            dt.name as document_type_name,
            u.name as uploader_name
          FROM documents d
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          LEFT JOIN users u ON d.uploaded_by = u.id
          WHERE d.id = $1`,
          [documentId]
        );

        const isFVDocument = docInfoResult.rows.length > 0 && docInfoResult.rows[0].document_type_code === 'FV';
        const hasMetadata = metadata && typeof metadata === 'object' && Object.keys(metadata).length > 0;

        if (isFVDocument && hasMetadata) {
          console.log('📋 Regenerando PDF FV después de retener...');

          const docInfo = docInfoResult.rows[0];
          const templateData = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;

          // Obtener firmas y retenciones
          const firmasActuales = await obtenerFirmasDocumento(documentId, templateData);
          const activeRetentions = currentRetentions.filter(r => r.activa);

          // Regenerar plantilla
          const templatePdfBuffer = await generateFacturaTemplatePDF(templateData, firmasActuales, false, activeRetentions);

          const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
          await fs.mkdir(tempDir, { recursive: true });
          const tempPlanillaPath = path.join(tempDir, `planilla_${documentId}_${Date.now()}.pdf`);
          await fs.writeFile(tempPlanillaPath, templatePdfBuffer);

          const relativePath = docInfo.file_path.replace(/^uploads\//, '');
          const currentPdfPath = path.join(__dirname, '..', 'uploads', relativePath);

          // OPTIMIZED: Usar rutas de archivo directamente (no buffers)
          let backupFilePaths = [];
          if (docInfo.original_pdf_backup) {
            const backupPathsArray = JSON.parse(docInfo.original_pdf_backup);
            for (const relPath of backupPathsArray) {
              const backupRelativePath = relPath.replace(/^uploads\//, '');
              const fullBackupPath = path.join(__dirname, '..', 'uploads', backupRelativePath);
              try {
                await fs.access(fullBackupPath);
                backupFilePaths.push(fullBackupPath);
              } catch (err) {
                console.error(`⚠️ Backup no encontrado: ${fullBackupPath}`);
              }
            }
          }

          // OPTIMIZED: Usar mergePDFs() con lectura paralela
          const tempMergedPath = path.join(tempDir, `merged_${documentId}_${Date.now()}.pdf`);
          const filesToMerge = [tempPlanillaPath, ...backupFilePaths];
          await mergePDFs(filesToMerge, tempMergedPath);

          // Obtener firmantes
          const { consecutivoSelect, signerNameSelect } = await getSignatureColumnSelects();
          const csConstraint = await getCausacionSignerIdConstraint();
          const signersResult = await query(
            `SELECT
              ds.user_id, ds.order_position, ds.role_name, ds.role_names,
              ds.is_causacion_group, ds.grupo_codigo,
              u.name as user_name, cg.nombre as grupo_nombre, u.email,
              COALESCE(s.status, 'pending') as status,
              s.signed_at, s.rejected_at, s.rejection_reason, ${consecutivoSelect},
              ${signerNameSelect},
              signer_user.email as signer_email
            FROM document_signers ds
            LEFT JOIN users u ON ds.user_id = u.id
            LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
              (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
              (ds.is_causacion_group = true AND s.signer_id IN (
                SELECT ci.user_id FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = ds.grupo_codigo
              )${csConstraint})
            )
            LEFT JOIN users signer_user ON s.signer_id = signer_user.id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows.map(row => ({
            name: row.is_causacion_group ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación') : (row.user_name || 'Sin nombre'),
            email: row.signer_email || row.email,
            order_position: row.order_position,
            role_name: row.role_name,
            role_names: row.role_names,
            status: row.status,
            signed_at: row.signed_at,
            rejected_at: row.rejected_at,
            rejection_reason: row.rejection_reason,
            consecutivo: row.consecutivo,
            is_causacion_group: row.is_causacion_group,
            grupo_codigo: row.grupo_codigo,
            real_signer_name: row.real_signer_name
          }));

          const documentInfoForCover = {
            title: docInfo.title || 'Factura',
            fileName: docInfo.file_name || '',
            createdAt: docInfo.created_at,
            uploadedBy: docInfo.uploader_name || 'Sistema',
            documentTypeName: docInfo.document_type_name || 'Factura'
          };

          await addCoverPageWithSigners(tempMergedPath, signers, documentInfoForCover);
          await fs.copyFile(tempMergedPath, currentPdfPath);

          // Agregar sello RETENIDO
          try {
            await addStampToPdf(currentPdfPath, 'RETENIDO');
            console.log('⚠️ Sello RETENIDO agregado al documento (retención manual)');
          } catch (stampError) {
            console.error('❌ Error al agregar sello RETENIDO:', stampError);
          }

          // Cleanup
          await fs.unlink(tempPlanillaPath);
          await fs.unlink(tempMergedPath);

          console.log('✅ PDF regenerado exitosamente después de retener');
        }

        return {
          success: true,
          message: 'Documento retenido exitosamente',
          retentions: currentRetentions.filter(r => r.activa)
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    /**
     * Releases a retained document cost center
     */
    releaseDocument: async (_, { documentId, centroCostoIndex }, { user }) => {
      if (!user) throw new Error('No autenticado');

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const docResult = await client.query(
          `SELECT
            d.id,
            d.metadata,
            d.retention_data,
            d.file_path,
            d.original_pdf_backup,
            d.title,
            d.file_name,
            d.created_at,
            dt.code as document_type_code,
            dt.name as document_type_name,
            u.name as uploader_name
          FROM documents d
          LEFT JOIN document_types dt ON d.document_type_id = dt.id
          LEFT JOIN users u ON d.uploaded_by = u.id
          WHERE d.id = $1`,
          [documentId]
        );

        if (docResult.rows.length === 0) {
          throw new Error('Documento no encontrado');
        }

        const docInfo = docResult.rows[0];
        const currentRetentions = docInfo.retention_data || [];

        console.log('🔍 [RELEASE] Buscando retención para liberar...');
        console.log('🔍 [RELEASE] Usuario actual:', { id: user.id, name: user.name });
        console.log('🔍 [RELEASE] Centro de costo índice recibido:', centroCostoIndex, typeof centroCostoIndex);
        console.log('🔍 [RELEASE] Retenciones actuales:', JSON.stringify(currentRetentions, null, 2));

        // Find and deactivate retention - usando comparaciones robustas con conversión de tipos
        const retentionIndex = currentRetentions.findIndex(r => {
          const userIdMatch = String(r.userId) === String(user.id);
          const indexMatch = parseInt(r.centroCostoIndex) === parseInt(centroCostoIndex);
          const isActive = r.activa === true;

          console.log(`🔍 [RELEASE] Evaluando retención:`, {
            retention: r,
            userIdMatch,
            indexMatch,
            isActive,
            matches: userIdMatch && indexMatch && isActive
          });

          return userIdMatch && indexMatch && isActive;
        });

        if (retentionIndex < 0) {
          console.error('❌ [RELEASE] No se encontró retención activa');
          throw new Error('No tienes retención activa para este centro de costo');
        }

        console.log('✅ [RELEASE] Retención encontrada en índice:', retentionIndex);

        currentRetentions[retentionIndex].activa = false;

        await client.query(
          'UPDATE documents SET retention_data = $1 WHERE id = $2',
          [JSON.stringify(currentRetentions), documentId]
        );

        await client.query('COMMIT');

        // ========== REGENERAR PDF FV SI ES NECESARIO ==========
        const isFVDocument = docInfo.document_type_code === 'FV';
        const hasMetadata = docInfo.metadata && typeof docInfo.metadata === 'object' && Object.keys(docInfo.metadata).length > 0;

        if (isFVDocument && hasMetadata) {
          console.log('📋 Regenerando PDF FV después de liberar retención...');

          const templateData = typeof docInfo.metadata === 'string' ? JSON.parse(docInfo.metadata) : docInfo.metadata;

          // Obtener firmas y retenciones
          const firmasActuales = await obtenerFirmasDocumento(documentId, templateData);
          const activeRetentions = currentRetentions.filter(r => r.activa);

          // Regenerar plantilla
          const templatePdfBuffer = await generateFacturaTemplatePDF(templateData, firmasActuales, false, activeRetentions);

          const tempDir = path.join(__dirname, '..', 'uploads', 'temp');
          await fs.mkdir(tempDir, { recursive: true });
          const tempPlanillaPath = path.join(tempDir, `planilla_${documentId}_${Date.now()}.pdf`);
          await fs.writeFile(tempPlanillaPath, templatePdfBuffer);

          const relativePath = docInfo.file_path.replace(/^uploads\//, '');
          const currentPdfPath = path.join(__dirname, '..', 'uploads', relativePath);

          // OPTIMIZED: Usar rutas de archivo directamente (no buffers)
          let backupFilePaths = [];
          console.log('🔍 [RELEASE] Verificando backups:', docInfo.original_pdf_backup);
          if (docInfo.original_pdf_backup) {
            const backupPathsArray = JSON.parse(docInfo.original_pdf_backup);
            console.log('📋 [RELEASE] Backups encontrados en BD:', backupPathsArray);
            for (const relPath of backupPathsArray) {
              const backupRelativePath = relPath.replace(/^uploads\//, '');
              const fullBackupPath = path.join(__dirname, '..', 'uploads', backupRelativePath);
              try {
                await fs.access(fullBackupPath);
                backupFilePaths.push(fullBackupPath);
                console.log(`✅ [RELEASE] Backup verificado: ${fullBackupPath}`);
              } catch (err) {
                console.error(`⚠️ [RELEASE] Backup no encontrado: ${fullBackupPath}`);
              }
            }
          } else {
            console.warn('⚠️ [RELEASE] No hay backups en la BD para este documento');
          }
          console.log(`📄 [RELEASE] Total backups a mergear: ${backupFilePaths.length}`);

          // OPTIMIZED: Usar mergePDFs() con lectura paralela
          const tempMergedPath = path.join(tempDir, `merged_${documentId}_${Date.now()}.pdf`);
          const filesToMerge = [tempPlanillaPath, ...backupFilePaths];
          await mergePDFs(filesToMerge, tempMergedPath);

          // Obtener firmantes
          const { consecutivoSelect, signerNameSelect } = await getSignatureColumnSelects();
          const csConstraint = await getCausacionSignerIdConstraint();
          const signersResult = await query(
            `SELECT
              ds.user_id, ds.order_position, ds.role_name, ds.role_names,
              ds.is_causacion_group, ds.grupo_codigo,
              u.name as user_name, cg.nombre as grupo_nombre, u.email,
              COALESCE(s.status, 'pending') as status,
              s.signed_at, s.rejected_at, s.rejection_reason, ${consecutivoSelect},
              ${signerNameSelect},
              signer_user.email as signer_email
            FROM document_signers ds
            LEFT JOIN users u ON ds.user_id = u.id
            LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
            LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
              (ds.is_causacion_group = false AND s.signer_id = ds.user_id) OR
              (ds.is_causacion_group = true AND s.signer_id IN (
                SELECT ci.user_id FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = ds.grupo_codigo
              )${csConstraint})
            )
            LEFT JOIN users signer_user ON s.signer_id = signer_user.id
            WHERE ds.document_id = $1
            ORDER BY ds.order_position ASC`,
            [documentId]
          );

          const signers = signersResult.rows.map(row => ({
            name: row.is_causacion_group ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causación') : (row.user_name || 'Sin nombre'),
            email: row.signer_email || row.email,
            order_position: row.order_position,
            role_name: row.role_name,
            role_names: row.role_names,
            status: row.status,
            signed_at: row.signed_at,
            rejected_at: row.rejected_at,
            rejection_reason: row.rejection_reason,
            consecutivo: row.consecutivo,
            is_causacion_group: row.is_causacion_group,
            grupo_codigo: row.grupo_codigo,
            real_signer_name: row.real_signer_name
          }));

          const documentInfoForCover = {
            title: docInfo.title || 'Factura',
            fileName: docInfo.file_name || '',
            createdAt: docInfo.created_at,
            uploadedBy: docInfo.uploader_name || 'Sistema',
            documentTypeName: docInfo.document_type_name || 'Factura'
          };

          await addCoverPageWithSigners(tempMergedPath, signers, documentInfoForCover);
          await fs.copyFile(tempMergedPath, currentPdfPath);

          // Aplicar sello correcto según retenciones activas
          if (activeRetentions.length > 0) {
            // Aún quedan retenciones activas → Re-agregar sello RETENIDO
            try {
              await addStampToPdf(currentPdfPath, 'RETENIDO');
              console.log(`⚠️ Sello RETENIDO re-agregado (quedan ${activeRetentions.length} retención/es activa/s)`);
            } catch (stampError) {
              console.error('❌ Error al re-agregar sello RETENIDO:', stampError);
            }
          } else {
            // Ya no hay retenciones activas
            const statusResult = await query('SELECT status FROM documents WHERE id = $1', [documentId]);
            if (statusResult.rows.length > 0 && statusResult.rows[0].status === 'completed') {
              // Documento completado → Cambiar a sello APROBADO
              try {
                await addStampToPdf(currentPdfPath, 'APROBADO');
                console.log('✅ Sello cambiado de RETENIDO → APROBADO (documento liberado completamente)');
              } catch (stampError) {
                console.error('❌ Error al cambiar sello a APROBADO:', stampError);
              }
            } else {
              console.log('ℹ️ Documento liberado pero no completado - sin sello');
            }
          }

          // Cleanup
          await fs.unlink(tempPlanillaPath);
          await fs.unlink(tempMergedPath);

          console.log('✅ PDF regenerado exitosamente después de liberar retención');
        }

        // Verificar si ya no hay retenciones activas y el documento está firmado
        // para eliminar backups (esto no debe bloquear la liberación)
        checkAndCleanupBackupsIfComplete(documentId).catch(err => {
          console.error('⚠️ Error al verificar cleanup de backups:', err);
        });

        return true;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  },

  // Resolvers para campos anidados
  Document: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    fileName: (parent) => parent.file_name,
    filePath: (parent) => parent.file_path,
    fileSize: (parent) => parent.file_size,
    mimeType: (parent) => parent.mime_type,
    uploadedById: (parent) => parent.uploaded_by,
    documentTypeId: (parent) => parent.document_type_id,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
    completedAt: (parent) => parent.completed_at,
    payableStatus: async (parent) => {
      if (parent.payable_status) return parent.payable_status;

      const result = await query(
        'SELECT payment_status FROM payable_invoices WHERE document_id = $1 LIMIT 1',
        [parent.id]
      );

      return result.rows[0]?.payment_status || null;
    },
    paidAt: (parent) => parent.paid_at,
    paidBy: async (parent) => {
      if (!parent.paid_by) return null;

      if (parent.paid_by_name || parent.paid_by_email) {
        return {
          id: parent.paid_by,
          name: parent.paid_by_name,
          email: parent.paid_by_email
        };
      }

      const result = await query('SELECT * FROM users WHERE id = $1', [parent.paid_by]);
      return result.rows[0] || null;
    },
    advancePaymentStatus: async (parent) => {
      if (parent.advance_payment_status) return parent.advance_payment_status;

      const result = parent.advance_payment_user_id
        ? await query(
            'SELECT payment_status FROM treasury_advance_payments WHERE document_id = $1 AND user_id = $2 LIMIT 1',
            [parent.id, parent.advance_payment_user_id]
          )
        : await query(
            `SELECT payment_status
             FROM treasury_advance_payments
             WHERE document_id = $1
             ORDER BY updated_at DESC
             LIMIT 1`,
            [parent.id]
          );

      return result.rows[0]?.payment_status || null;
    },
    advancePaidAt: (parent) => parent.advance_paid_at,
    advancePaidBy: async (parent) => {
      if (!parent.advance_paid_by) return null;

      if (parent.advance_paid_by_name || parent.advance_paid_by_email) {
        return {
          id: parent.advance_paid_by,
          name: parent.advance_paid_by_name,
          email: parent.advance_paid_by_email
        };
      }

      const result = await query('SELECT * FROM users WHERE id = $1', [parent.advance_paid_by]);
      return result.rows[0] || null;
    },
    // Campos presentes solo en signedDocuments
    signedAt: (parent) => parent.signed_at,
    signatureType: (parent) => parent.signature_type,

    // Mapeo de metadata (BD) a templateData (GraphQL)
    // metadata es JSONB en PostgreSQL, el driver pg lo devuelve como objeto
    // El schema GraphQL espera String, así que stringify
    metadata: (parent) => {
      if (!parent.metadata) return null;

      // Si metadata ya es un objeto (JSONB), stringificarlo
      if (typeof parent.metadata === 'object') {
        return JSON.stringify(parent.metadata);
      }

      // Si por alguna razón es string, devolverlo tal cual
      return parent.metadata;
    },

    templateData: (parent) => {
      if (!parent.metadata) return null;

      // Si metadata ya es un objeto (JSONB), stringificarlo
      if (typeof parent.metadata === 'object') {
        return JSON.stringify(parent.metadata);
      }

      // Si por alguna razón es string, devolverlo tal cual
      return parent.metadata;
    },

    // Retenciones activas del documento
    retentionData: (parent) => {
      if (!parent.retention_data) return [];

      // Si es un objeto JSONB, devolverlo directamente
      if (typeof parent.retention_data === 'object') {
        return parent.retention_data.filter(r => r.activa);
      }

      // Si es string, parsearlo
      try {
        const data = JSON.parse(parent.retention_data);
        return data.filter(r => r.activa);
      } catch {
        return [];
      }
    },

    documentType: async (parent) => {
      if (!parent.document_type_id) return null;

      // Si ya tenemos los datos del tipo de documento en el parent (de un JOIN), usarlos directamente
      if (parent.document_type_code || parent.document_type_name) {
        return {
          id: parent.document_type_id,
          code: parent.document_type_code,
          name: parent.document_type_name
        };
      }

      // Si no, hacer la consulta
      const result = await query('SELECT * FROM document_types WHERE id = $1', [parent.document_type_id]);
      return result.rows[0] || null;
    },

    uploadedBy: async (parent) => {
      // Si ya tenemos los datos del usuario en el parent (de un JOIN), usarlos directamente
      if (parent.uploaded_by_name || parent.uploaded_by_email) {
        return {
          id: parent.uploaded_by,
          name: parent.uploaded_by_name,
          email: parent.uploaded_by_email
        };
      }
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.uploaded_by]);
      return result.rows[0];
    },
    signatures: async (parent) => {
      // Obtener TODOS los firmantes asignados (incluyendo grupos de causación)
      const signersResult = await query(`
        SELECT
          ds.id as ds_id,
          ds.user_id,
          ds.order_position,
          ds.role_name,
          ds.role_names,
          ds.assigned_role_ids,
          ds.is_causacion_group,
          ds.grupo_codigo,
          u.name as user_name,
          u.email as user_email,
          cg.nombre as grupo_nombre
        FROM document_signers ds
        LEFT JOIN users u ON ds.user_id = u.id
        LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
        WHERE ds.document_id = $1
        ORDER BY ds.order_position ASC
      `, [parent.id]);

      // OPTIMIZED: Obtener role_codes en batch para todos los signers (N+1 query elimination)
      // Recopilar todos los role_ids y role_names únicos
      const allRoleIds = [];
      const allRoleNames = [];

      for (const signer of signersResult.rows) {
        if (signer.assigned_role_ids && signer.assigned_role_ids.length > 0) {
          allRoleIds.push(...signer.assigned_role_ids);
        } else if (signer.role_names && signer.role_names.length > 0) {
          allRoleNames.push(...signer.role_names);
        }
      }

      // Obtener role_codes para todos los role_ids únicos (un solo query)
      let roleIdToCodeMap = {};
      if (allRoleIds.length > 0) {
        const uniqueRoleIds = [...new Set(allRoleIds)];
        const rolesResult = await query(`
          SELECT id, role_code FROM document_type_roles WHERE id = ANY($1)
        `, [uniqueRoleIds]);

        roleIdToCodeMap = rolesResult.rows.reduce((map, row) => {
          map[row.id] = row.role_code;
          return map;
        }, {});
      }

      // Obtener role_codes para todos los role_names únicos (un solo query - fallback)
      let roleNameToCodeMap = {};
      if (allRoleNames.length > 0) {
        const uniqueRoleNames = [...new Set(allRoleNames)];
        const rolesResult = await query(`
          SELECT role_name, role_code FROM document_type_roles WHERE role_name = ANY($1)
        `, [uniqueRoleNames]);

        roleNameToCodeMap = rolesResult.rows.reduce((map, row) => {
          map[row.role_name] = row.role_code;
          return map;
        }, {});
      }

      // Asignar role_codes a cada signer usando los mapas (sin queries adicionales)
      for (const signer of signersResult.rows) {
        if (signer.assigned_role_ids && signer.assigned_role_ids.length > 0) {
          // Usar assigned_role_ids si está disponible
          signer.role_codes = signer.assigned_role_ids.map(id => roleIdToCodeMap[id]).filter(code => code);
        } else if (signer.role_names && signer.role_names.length > 0) {
          // Fallback: buscar por role_name (compatibilidad con documentos antiguos)
          signer.role_codes = signer.role_names.map(name => roleNameToCodeMap[name]).filter(code => code);
        } else {
          signer.role_codes = [];
        }
      }

      const csConstraint = await getCausacionSignerIdConstraint();
      const results = [];

      for (const signer of signersResult.rows) {
        if (signer.is_causacion_group) {
          // Es un grupo de causación - buscar si algún miembro firmó
          const groupSignature = await query(`
            SELECT s.*, u.name as signer_name, u.email as signer_email
            FROM signatures s
            JOIN users u ON s.signer_id = u.id
            WHERE s.document_id = $1
              AND s.signer_id IN (
                SELECT ci.user_id
                FROM causacion_integrantes ci
                JOIN causacion_grupos cg ON ci.grupo_id = cg.id
                WHERE cg.codigo = $2 AND ci.activo = true
              )
              ${csConstraint ? 'AND s.document_signer_id = $3' : ''}
            LIMIT 1
          `, csConstraint
            ? [parent.id, signer.grupo_codigo, signer.ds_id]
            : [parent.id, signer.grupo_codigo]);

          if (groupSignature.rows.length > 0) {
            // Grupo ya firmó - usar datos de la firma
            const sig = groupSignature.rows[0];
            results.push({
              id: sig.id,
              document_id: sig.document_id,
              signer_id: sig.signer_id,
              status: sig.status,
              signature_data: sig.signature_data,
              signed_at: sig.signed_at,
              rejected_at: sig.rejected_at,
              rejection_reason: sig.rejection_reason,
              real_signer_name: sig.signer_name,
              order_position: signer.order_position,
              role_name: signer.role_name,
              role_names: signer.role_names,
              role_codes: signer.role_codes,
              is_causacion_group: true,
              grupo_codigo: signer.grupo_codigo,
              grupo_nombre: signer.grupo_nombre,
              // Para el resolver Signature.signer
              _signer_name: sig.signer_name,
              _signer_email: sig.signer_email
            });
          } else {
            // Grupo pendiente - crear entrada virtual
            // Obtener miembros activos del grupo
            const membersResult = await query(`
              SELECT ci.user_id, ci.activo, u.name as user_name
              FROM causacion_integrantes ci
              JOIN causacion_grupos cg ON ci.grupo_id = cg.id
              JOIN users u ON ci.user_id = u.id
              WHERE cg.codigo = $1
            `, [signer.grupo_codigo]);

            const virtualGroupSignature = {
              id: `group_${signer.ds_id}`,
              document_id: parent.id,
              signer_id: null,
              status: 'pending',
              signature_data: null,
              signed_at: null,
              rejected_at: null,
              rejection_reason: null,
              real_signer_name: null,
              order_position: signer.order_position,
              role_name: signer.role_name,
              role_names: signer.role_names,
              role_codes: signer.role_codes,
              is_causacion_group: true,
              isCausacionGroup: true, // camelCase para frontend
              grupo_codigo: signer.grupo_codigo,
              grupo_nombre: signer.grupo_nombre,
              members: membersResult.rows.map(m => ({
                userId: m.user_id,
                activo: m.activo,
                userName: m.user_name
              })),
              // Para el resolver Signature.signer - nombre del grupo
              _signer_name: signer.grupo_nombre,
              _signer_email: null,
              _is_group_pending: true
            };

            results.push(virtualGroupSignature);
          }
        } else {
          // Firmante normal - buscar su firma
          const userSignature = await query(`
            SELECT s.*
            FROM signatures s
            WHERE s.document_id = $1 AND s.signer_id = $2
          `, [parent.id, signer.user_id]);

          if (userSignature.rows.length > 0) {
            const sig = userSignature.rows[0];
            results.push({
              ...sig,
              order_position: signer.order_position,
              role_name: signer.role_name,
              role_names: signer.role_names,
              role_codes: signer.role_codes,
              is_causacion_group: false,
              _signer_name: signer.user_name,
              _signer_email: signer.user_email
            });
          } else {
            // Usuario pendiente - crear entrada virtual
            results.push({
              id: `pending_${signer.ds_id}`,
              document_id: parent.id,
              signer_id: signer.user_id,
              status: 'pending',
              signature_data: null,
              signed_at: null,
              rejected_at: null,
              rejection_reason: null,
              order_position: signer.order_position,
              role_name: signer.role_name,
              role_names: signer.role_names,
              role_codes: signer.role_codes,
              is_causacion_group: false,
              _signer_name: signer.user_name,
              _signer_email: signer.user_email
            });
          }
        }
      }

      return results;
    },
    totalSigners: (parent) => parent.total_signers || 0,
    signedCount: (parent) => parent.signed_count || 0,
    pendingCount: (parent) => parent.pending_count || 0,
  },

  Signature: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    documentId: (parent) => parent.document_id,
    signerId: (parent) => parent.signer_id,
    signatureData: (parent) => parent.signature_data,
    signatureType: (parent) => parent.signature_type,
    ipAddress: (parent) => parent.ip_address,
    userAgent: (parent) => parent.user_agent,
    rejectionReason: (parent) => parent.rejection_reason,
    rejectedAt: (parent) => parent.rejected_at,
    signedAt: (parent) => parent.signed_at,
    realSignerName: (parent) => parent.real_signer_name,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,

    // Campos de document_signers (traídos por JOIN)
    orderPosition: (parent) => parent.order_position,
    roleName: (parent) => {
      // Si hay role_names array, devolver el primero
      if (parent.role_names && parent.role_names.length > 0) {
        return parent.role_names[0];
      }
      // Fallback a role_name singular
      return parent.role_name || null;
    },
    roleNames: (parent) => {
      // Devolver array de roles (nombres legibles)
      if (parent.role_names && Array.isArray(parent.role_names) && parent.role_names.length > 0) {
        return parent.role_names;
      }
      // Fallback a role_name singular como array
      if (parent.role_name) {
        return [parent.role_name];
      }
      return [];
    },
    roleCode: (parent) => {
      // Devolver el primer código de rol
      if (parent.role_codes && parent.role_codes.length > 0) {
        return parent.role_codes[0];
      }
      return parent.role_code || null;
    },
    roleCodes: (parent) => {
      // Devolver array de códigos de roles
      if (parent.role_codes && Array.isArray(parent.role_codes) && parent.role_codes.length > 0) {
        return parent.role_codes;
      }
      // Fallback a role_code singular como array
      if (parent.role_code) {
        return [parent.role_code];
      }
      return [];
    },
    isCausacionGroup: (parent) => parent.is_causacion_group || false,
    grupoCodigo: (parent) => parent.grupo_codigo || null,
    grupoNombre: (parent) => parent.grupo_nombre || null,

    document: async (parent) => {
      const result = await query('SELECT * FROM documents WHERE id = $1', [parent.document_id]);
      return result.rows[0];
    },
    signer: async (parent) => {
      // Si tenemos datos precargados del resolver Document.signatures, usarlos
      if (parent._signer_name !== undefined) {
        // Para grupos pendientes sin signer_id, usar ID ficticio negativo
        let signerId = parent.signer_id;
        let signerEmail = parent._signer_email;
        if (!signerId && parent.grupo_codigo) {
          // IDs ficticios: financiera = -1, logistica = -2
          signerId = parent.grupo_codigo === 'financiera' ? -1 : -2;
          // Email placeholder para grupos (requerido por schema User.email: String!)
          signerEmail = `${parent.grupo_codigo}@grupo.causacion`;
        }
        return {
          id: signerId,
          name: parent._signer_name,
          email: signerEmail || 'sin-email@placeholder.local'
        };
      }
      // Fallback a query normal
      if (!parent.signer_id) return null;
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.signer_id]);
      return result.rows[0];
    },
    // Campo members para grupos de causación
    members: (parent) => {
      // Si es un grupo de causación pendiente, devolver los miembros
      if (parent.members && Array.isArray(parent.members)) {
        return parent.members;
      }
      return null;
    },
  },

  User: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    adUsername: (parent) => parent.ad_username || null,
    isActive: (parent) => parent.is_active !== undefined ? parent.is_active : true,
    emailNotifications: (parent) => parent.email_notifications !== undefined ? parent.email_notifications : true,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,
  },

  Notification: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    userId: (parent) => parent.user_id,
    documentId: (parent) => parent.document_id,
    actorId: (parent) => parent.actor_id,
    documentTitle: (parent) => parent.document_title,
    isRead: (parent) => parent.is_read,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,

    user: async (parent) => {
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.user_id]);
      return result.rows[0];
    },
    document: async (parent) => {
      const result = await query('SELECT * FROM documents WHERE id = $1', [parent.document_id]);
      return result.rows[0] || null;
    },
    actor: async (parent) => {
      if (!parent.actor_id) return null;
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.actor_id]);
      const actor = result.rows[0];
      if (!actor) return null;

      // Si la notificación es de tipo 'document_signed', obtener el realSignerName de la firma
      if (parent.type === 'document_signed' && parent.document_id) {
        const { realSignerNameSelect } = await getSignatureColumnSelects();
        const signatureResult = await query(
          `SELECT ${realSignerNameSelect} FROM signatures
           WHERE document_id = $1 AND signer_id = $2 AND status = 'signed'
           ORDER BY signed_at DESC LIMIT 1`,
          [parent.document_id, parent.actor_id]
        );

        if (signatureResult.rows.length > 0 && signatureResult.rows[0].real_signer_name) {
          actor.realSignerName = signatureResult.rows[0].real_signer_name;
        } else {
          actor.realSignerName = actor.name;
        }
      }

      return actor;
    },
  },

  DocumentType: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    isActive: (parent) => parent.is_active,
    createdAt: (parent) => parent.created_at,
    updatedAt: (parent) => parent.updated_at,

    roles: async (parent) => {
      const result = await query(`
        SELECT * FROM document_type_roles
        WHERE document_type_id = $1
        ORDER BY order_position ASC
      `, [parent.id]);
      return result.rows;
    },
  },

  DocumentTypeRole: {
    // Mapeo de snake_case (BD) a camelCase (GraphQL)
    documentTypeId: (parent) => parent.document_type_id,
    roleName: (parent) => parent.role_name,
    roleCode: (parent) => parent.role_code,
    orderPosition: (parent) => parent.order_position,
    isRequired: (parent) => parent.is_required,
    createdAt: (parent) => parent.created_at,
  },

  CausacionGrupo: {
    miembros: async (parent) => {
      const result = await query(`
        SELECT id, grupo_id, user_id, cargo, activo
        FROM causacion_integrantes
        WHERE grupo_id = $1 AND activo = true
        ORDER BY id ASC
      `, [parent.id]);
      return result.rows;
    },
  },

  CausacionIntegrante: {
    grupoId: (parent) => parent.grupo_id,
    userId: (parent) => parent.user_id,

    user: async (parent) => {
      const result = await query('SELECT * FROM users WHERE id = $1', [parent.user_id]);
      return result.rows[0];
    },
  },
};

module.exports = resolvers;
