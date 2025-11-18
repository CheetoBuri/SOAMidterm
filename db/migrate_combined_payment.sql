-- Migration to support combined payments
-- Add transaction_group_id to link related transactions
ALTER TABLE transactions ADD COLUMN transaction_group_id INT NULL;
CREATE INDEX idx_transaction_group_id ON transactions(transaction_group_id);

