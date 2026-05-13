-- Migration: Allow Monica Bustamante and Jesus Bustamante to share payable invoices
-- Purpose: Replicate Monica's payable invoice inbox access for Jesus without removing Monica
-- Date: 2026-05-11

ALTER TABLE payable_invoices
DROP CONSTRAINT IF EXISTS payable_invoices_document_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payable_invoices_document_user
ON payable_invoices(document_id, user_id);

WITH monica AS (
  SELECT id
  FROM users
  WHERE LOWER(TRIM(email)) = 'm.bustamante@prexxa.com.co'
     OR LOWER(TRIM(name)) = 'monica bustamante'
  ORDER BY CASE WHEN LOWER(TRIM(email)) = 'm.bustamante@prexxa.com.co' THEN 0 ELSE 1 END
  LIMIT 1
),
jesus AS (
  SELECT id
  FROM users
  WHERE LOWER(TRIM(email)) IN ('practicantetic@prexxa.com.co', 'j.bustamante@prexxa.com.co')
     OR LOWER(TRIM(name)) IN ('jesus bustamante', 'jesús bustamante')
  ORDER BY CASE WHEN LOWER(TRIM(email)) IN ('practicantetic@prexxa.com.co', 'j.bustamante@prexxa.com.co') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO payable_invoices (
  document_id,
  user_id,
  payment_status,
  paid_at,
  paid_by,
  created_at,
  updated_at
)
SELECT
  pi.document_id,
  jesus.id,
  pi.payment_status,
  pi.paid_at,
  pi.paid_by,
  pi.created_at,
  CURRENT_TIMESTAMP
FROM payable_invoices pi
CROSS JOIN monica
CROSS JOIN jesus
WHERE pi.user_id = monica.id
ON CONFLICT (document_id, user_id) DO UPDATE SET
  payment_status = EXCLUDED.payment_status,
  paid_at = EXCLUDED.paid_at,
  paid_by = EXCLUDED.paid_by,
  updated_at = CURRENT_TIMESTAMP;
