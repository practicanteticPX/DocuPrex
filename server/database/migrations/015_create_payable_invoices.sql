-- Migration: Create payable invoices inbox
-- Purpose: Route fully signed FV invoices to Monica Bustamante's "Facturas por pagar" inbox
-- Date: 2026-04-30

CREATE TABLE IF NOT EXISTS payable_invoices (
  id SERIAL PRIMARY KEY,
  document_id UUID NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP,
  paid_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE payable_invoices
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE payable_invoices
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

ALTER TABLE payable_invoices
ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payable_invoices_user_id
ON payable_invoices(user_id);

CREATE INDEX IF NOT EXISTS idx_payable_invoices_created_at
ON payable_invoices(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payable_invoices_payment_status
ON payable_invoices(payment_status);
