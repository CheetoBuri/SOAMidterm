-- Migration: convert otps.code -> otps.code_hash and add attempts column
-- Run this against the existing MySQL database if it was already created by the older init.sql

-- Add attempts column if not exists
ALTER TABLE otps ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;

-- If `code` column exists, rename it to code_hash. If your MySQL version doesn't support IF NOT EXISTS for CHANGE, run the appropriate commands.
-- The following will fail if `code` doesn't exist; edit as needed.
ALTER TABLE otps CHANGE COLUMN code code_hash VARCHAR(255) NOT NULL;

-- If you prefer to preserve existing plaintext codes as hashes, you would need to update code_hash with a hash of existing code values.
-- Example (dangerous if you don't want to expose plaintext):
-- UPDATE otps SET code_hash = SHA2(code, 256);

-- Mark any existing plaintext OTPS as used to force re-issuance (optional):
-- UPDATE otps SET used = 1;
