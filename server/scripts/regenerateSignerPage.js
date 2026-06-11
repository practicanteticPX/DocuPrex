const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const fs = require('fs').promises;
const { PDFDocument } = require('pdf-lib');
const { query } = require('../database/db');
const { addCoverPageWithSigners, updateSignersPage } = require('../utils/pdfCoverPage');

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--')
      ? argv[++i]
      : true;

    args[key] = value;
  }

  return args;
}

function parseDocumentMetadata(metadata) {
  if (!metadata) return null;
  if (typeof metadata === 'object') return metadata;

  try {
    return JSON.parse(metadata);
  } catch (error) {
    return null;
  }
}

function getFacturaReceivedAt(metadata) {
  const parsedMetadata = parseDocumentMetadata(metadata);
  return parsedMetadata?.fechaRecepcion
    || parsedMetadata?.fecha_entrega
    || parsedMetadata?.fechaEntrega
    || null;
}

async function getOptionalSignatureColumns() {
  const result = await query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'signatures'
      AND column_name IN ('consecutivo', 'real_signer_name', 'document_signer_id')
  `);

  return new Set(result.rows.map((row) => row.column_name));
}

async function findDocument(args) {
  const filters = [];
  const values = [];

  if (args['document-id']) {
    values.push(args['document-id']);
    filters.push(`d.id = $${values.length}`);
  }

  if (args.consecutivo) {
    values.push(args.consecutivo);
    filters.push(`d.consecutivo::text = $${values.length}`);
  }

  if (args['numero-factura']) {
    values.push(args['numero-factura']);
    filters.push(`d.metadata->>'numeroFactura' = $${values.length}`);
  }

  if (!filters.length) {
    throw new Error('Indica --document-id, --consecutivo o --numero-factura.');
  }

  const result = await query(`
    SELECT
      d.id,
      d.title,
      d.file_path,
      d.file_name,
      d.created_at,
      d.metadata,
      u.name as uploader_name,
      dt.name as document_type_name
    FROM documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    LEFT JOIN document_types dt ON d.document_type_id = dt.id
    WHERE ${filters.join(' OR ')}
    ORDER BY d.created_at DESC
    LIMIT 2
  `, values);

  if (result.rows.length === 0) {
    throw new Error('No se encontró ningún documento con ese criterio.');
  }

  if (result.rows.length > 1) {
    throw new Error('El criterio coincide con más de un documento. Usa --document-id para ser exacto.');
  }

  return result.rows[0];
}

async function getSigners(documentId) {
  const optionalColumns = await getOptionalSignatureColumns();
  const hasDocumentSignerId = optionalColumns.has('document_signer_id');
  const consecutivoSelect = optionalColumns.has('consecutivo') ? 's.consecutivo' : 'NULL as consecutivo';
  const realSignerNameSelect = optionalColumns.has('real_signer_name') ? 's.real_signer_name' : 'NULL as real_signer_name';
  const directSignerJoin = hasDocumentSignerId
    ? '(s.document_signer_id = ds.id OR (s.document_signer_id IS NULL AND s.signer_id = ds.user_id))'
    : 's.signer_id = ds.user_id';
  const groupSignerJoin = hasDocumentSignerId
    ? '(s.document_signer_id = ds.id OR s.signer_id IN (SELECT ci.user_id FROM causacion_integrantes ci JOIN causacion_grupos cg2 ON ci.grupo_id = cg2.id WHERE cg2.codigo = ds.grupo_codigo AND ci.activo = true))'
    : 's.signer_id IN (SELECT ci.user_id FROM causacion_integrantes ci JOIN causacion_grupos cg2 ON ci.grupo_id = cg2.id WHERE cg2.codigo = ds.grupo_codigo AND ci.activo = true)';

  const result = await query(`
    SELECT
      ds.user_id,
      ds.order_position,
      ds.role_name,
      ds.role_names,
      ds.is_causacion_group,
      ds.grupo_codigo,
      u.name as user_name,
      u.email,
      cg.nombre as grupo_nombre,
      COALESCE(s.status, 'pending') as status,
      s.signed_at,
      s.rejected_at,
      s.rejection_reason,
      ${consecutivoSelect},
      ${realSignerNameSelect},
      signer_user.email as signer_email
    FROM document_signers ds
    LEFT JOIN users u ON ds.user_id = u.id
    LEFT JOIN causacion_grupos cg ON ds.grupo_codigo = cg.codigo
    LEFT JOIN signatures s ON s.document_id = ds.document_id AND (
      (ds.is_causacion_group = false AND ${directSignerJoin}) OR
      (ds.is_causacion_group = true AND ${groupSignerJoin})
    )
    LEFT JOIN users signer_user ON s.signer_id = signer_user.id
    WHERE ds.document_id = $1
    ORDER BY ds.order_position ASC
  `, [documentId]);

  return result.rows.map((row) => ({
    name: row.is_causacion_group
      ? (row.grupo_nombre || row.grupo_codigo || 'Grupo de Causacion')
      : (row.user_name || 'Sin nombre'),
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
}

async function regenerateSignerPage() {
  const args = parseArgs(process.argv.slice(2));
  const document = await findDocument(args);
  const signers = await getSigners(document.id);

  if (signers.length === 0) {
    throw new Error('El documento no tiene firmantes asignados.');
  }

  const pdfPath = path.join(__dirname, '..', document.file_path);
  const sentAtResult = await query(
    'SELECT MIN(created_at) as sent_at FROM document_signers WHERE document_id = $1',
    [document.id]
  );
  const documentInfo = {
    documentId: document.id,
    title: document.title,
    fileName: document.file_name,
    createdAt: document.created_at,
    sentAt: sentAtResult.rows[0]?.sent_at || null,
    receivedAt: document.created_at,
    uploadedBy: document.uploader_name || 'Sistema',
    documentTypeName: document.document_type_name || null
  };

  const pdfBytes = await fs.readFile(pdfPath);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const metadata = `${pdfDoc.getSubject() || ''} ${pdfDoc.getTitle() || ''}`;
  const hasSignerPages = metadata.includes('SignerPages:');

  if (hasSignerPages) {
    await updateSignersPage(pdfPath, signers, documentInfo);
  } else {
    await addCoverPageWithSigners(pdfPath, signers, documentInfo);
  }

  console.log(`Hoja de firmantes ${hasSignerPages ? 'regenerada' : 'agregada'} correctamente.`);
  console.log(`Documento: ${document.title}`);
  console.log(`ID: ${document.id}`);
  console.log(`PDF: ${pdfPath}`);
}

regenerateSignerPage()
  .catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
