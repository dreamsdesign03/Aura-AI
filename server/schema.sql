-- =============================================================================
-- AURA AI PLATFORM - NEON POSTGRESQL DATABASE SCHEMA
-- =============================================================================

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  city TEXT,
  company_name TEXT,
  designation TEXT,
  team_size TEXT,
  onboarding_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure password_hash column exists (for backward compatibility)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE users ADD COLUMN password_hash TEXT;
  END IF;
END $$;

-- Ensure is_active column exists (auth flow: active=true → Dashboard, false → Register)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- 2. Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Leads Table
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  org_id INT,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  designation TEXT,
  website TEXT,
  industry TEXT,
  country TEXT DEFAULT 'United States',
  status TEXT DEFAULT 'New',
  pipeline_stage TEXT DEFAULT 'Lead In',
  bant_score INT DEFAULT 50,
  bantb_total INT DEFAULT 50,
  deal_value NUMERIC DEFAULT 0,
  belief_reason TEXT,
  brand_audit_report TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add user_id column to leads if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE leads ADD COLUMN user_id INT REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 4. Ideal Customer Profiles (ICPs) Table
CREATE TABLE IF NOT EXISTS icps (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  org_id INT,
  name TEXT,
  company_size TEXT,
  roles TEXT[],
  industries TEXT[],
  markets TEXT[],
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add user_id to icps if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'icps' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE icps ADD COLUMN user_id INT REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Campaigns Table
CREATE TABLE IF NOT EXISTS campaigns (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT,
  icp_name TEXT,
  status TEXT DEFAULT 'Active',
  contacted_count INT DEFAULT 0,
  response_rate TEXT DEFAULT '0%',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add user_id to campaigns if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN user_id INT REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 6. Meetings Table
CREATE TABLE IF NOT EXISTS meetings (
  id SERIAL PRIMARY KEY,
  lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  title TEXT,
  scheduled_at TIMESTAMPTZ,
  duration INT DEFAULT 30,
  status TEXT DEFAULT 'Scheduled',
  meeting_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Proposals Table
CREATE TABLE IF NOT EXISTS proposals (
  id SERIAL PRIMARY KEY,
  lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  title TEXT,
  investment INT DEFAULT 0,
  roi_estimate INT DEFAULT 0,
  services TEXT[],
  status TEXT DEFAULT 'Draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Outreach Emails Table
CREATE TABLE IF NOT EXISTS outreach_emails (
  id SERIAL PRIMARY KEY,
  lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'Draft',
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Touchpoints Table
CREATE TABLE IF NOT EXISTS touchpoints (
  id SERIAL PRIMARY KEY,
  lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  channel TEXT,
  subject TEXT,
  body TEXT,
  status TEXT DEFAULT 'Sent',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Agent Activity Logs Table
CREATE TABLE IF NOT EXISTS agent_activity_log (
  id SERIAL PRIMARY KEY,
  action TEXT,
  event TEXT,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Daily Reports Table
CREATE TABLE IF NOT EXISTS daily_reports (
  id SERIAL PRIMARY KEY,
  report_date TEXT,
  total_leads_processed INT DEFAULT 0,
  emails_sent INT DEFAULT 0,
  calls_booked INT DEFAULT 0,
  report_html TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. WhatsApp Conversations Table
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id SERIAL PRIMARY KEY,
  lead_id INT REFERENCES leads(id) ON DELETE CASCADE,
  phone TEXT,
  status TEXT DEFAULT 'Active',
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);
