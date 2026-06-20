-- =====================================================================
-- Passcodes Table for Company-Specific Dashboard Access
-- =====================================================================
-- This table stores passcodes that allow:
-- 1. Admin access (role='admin') - not currently used, admin uses env var
-- 2. Company-specific access (role='company') - scoped to a single company dashboard

CREATE TABLE IF NOT EXISTS passcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'company' CHECK (role IN ('admin', 'company')),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_passcodes_code ON passcodes(code);
CREATE INDEX IF NOT EXISTS idx_passcodes_company_id ON passcodes(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_passcodes_role_status ON passcodes(role, status);

-- Constraint: company passcodes must have a company_id
ALTER TABLE passcodes
  DROP CONSTRAINT IF EXISTS passcodes_company_role_requires_company_id;

ALTER TABLE passcodes
  ADD CONSTRAINT passcodes_company_role_requires_company_id
  CHECK (
    (role = 'company' AND company_id IS NOT NULL) OR
    (role = 'admin' AND company_id IS NULL)
  );

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_passcodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_passcodes_updated_at ON passcodes;
CREATE TRIGGER trigger_update_passcodes_updated_at
  BEFORE UPDATE ON passcodes
  FOR EACH ROW
  EXECUTE FUNCTION update_passcodes_updated_at();

-- Comment
COMMENT ON TABLE passcodes IS 'Company-specific and admin passcodes for dashboard authentication';
COMMENT ON COLUMN passcodes.role IS 'Authentication level: admin (full access) or company (scoped to company_id)';
COMMENT ON COLUMN passcodes.status IS 'active or inactive - inactive passcodes cannot be used for login';
