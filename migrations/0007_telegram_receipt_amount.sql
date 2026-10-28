-- Store the exact requested transfer amount separately from the catalog price.
-- Existing orders default to their original base amount.
ALTER TABLE bot_orders ADD COLUMN expected_amount_toman INTEGER NOT NULL DEFAULT 0;
