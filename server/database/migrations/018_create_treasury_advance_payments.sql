-- Migration: Create treasury advance payment status
-- Purpose: Track Pendiente/Pagado for signed SA documents assigned to Treasury without changing document status
-- Date: 2026-05-11

CREATE TABLE IF NOT EXISTS treasury_advance_payments (
  id SERIAL PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  paid_at TIMESTAMP,
  paid_by UUID REFERENCES users(id) ON DELETE SET NULL,
  creator_notified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE treasury_advance_payments
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'pending';

ALTER TABLE treasury_advance_payments
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

ALTER TABLE treasury_advance_payments
ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE treasury_advance_payments
ADD COLUMN IF NOT EXISTS creator_notified_at TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS idx_treasury_advance_payments_document_user
ON treasury_advance_payments(document_id, user_id);

CREATE INDEX IF NOT EXISTS idx_treasury_advance_payments_user_id
ON treasury_advance_payments(user_id);

CREATE INDEX IF NOT EXISTS idx_treasury_advance_payments_status
ON treasury_advance_payments(payment_status);
