CREATE INDEX IF NOT EXISTS idx_invoice_asset_records_codigo_normalized
  ON invoice_asset_records (UPPER(TRIM(codigo)));
