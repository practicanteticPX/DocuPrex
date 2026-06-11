-- Migration: Registros de activos declarados por Control Administrativo en FV

CREATE TABLE IF NOT EXISTS invoice_asset_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  document_signer_id UUID REFERENCES document_signers(id) ON DELETE SET NULL,
  signature_id UUID REFERENCES signatures(id) ON DELETE SET NULL,
  asset_type VARCHAR(20) NOT NULL CHECK (asset_type IN ('administrativo', 'contable')),
  codigo VARCHAR(120) NOT NULL,
  nombre_activo VARCHAR(500) NOT NULL,
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_invoice_asset_records_document_id
  ON invoice_asset_records(document_id);

CREATE INDEX IF NOT EXISTS idx_invoice_asset_records_created_by
  ON invoice_asset_records(created_by);

CREATE INDEX IF NOT EXISTS idx_invoice_asset_records_asset_type
  ON invoice_asset_records(asset_type);
