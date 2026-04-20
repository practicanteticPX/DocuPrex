-- Permite repetir un usuario en varias etapas del mismo documento FV
-- Ejemplo: Negociador en la posición 1 y Responsable centro/cuenta en la posición 3

ALTER TABLE signatures
ADD COLUMN IF NOT EXISTS document_signer_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'signatures'
      AND constraint_name = 'signatures_document_signer_id_fkey'
  ) THEN
    ALTER TABLE signatures
    ADD CONSTRAINT signatures_document_signer_id_fkey
    FOREIGN KEY (document_signer_id) REFERENCES document_signers(id) ON DELETE CASCADE;
  END IF;
END $$;

UPDATE signatures s
SET document_signer_id = ds.id
FROM document_signers ds
WHERE s.document_signer_id IS NULL
  AND s.document_id = ds.document_id
  AND s.signer_id = ds.user_id;

ALTER TABLE document_signers
DROP CONSTRAINT IF EXISTS document_signers_document_id_user_id_key;

DROP INDEX IF EXISTS idx_document_signers_unique_user;

ALTER TABLE signatures
DROP CONSTRAINT IF EXISTS signatures_document_id_signer_id_key;

CREATE INDEX IF NOT EXISTS idx_signatures_document_signer_id
ON signatures(document_signer_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_signers_unique_position
ON document_signers(document_id, order_position);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signatures_unique_document_signer
ON signatures(document_signer_id)
WHERE document_signer_id IS NOT NULL;
