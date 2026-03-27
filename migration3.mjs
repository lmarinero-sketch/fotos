import fs from 'fs'

const MGMT_TOKEN = 'sbp_652501246151de5fe3cb95fb04f7f3f7f2a4900a'
const PROJECT_REF = 'pxvhovctyewwppwkldaq'

async function runSQL(label, sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  console.log(`${res.ok ? '✅' : '❌'} ${label}`, text.substring(0, 150))
}

async function main() {
  console.log('🔧 Running Database Migration for Errors and Metrics...\n')
  
  await runSQL('Create system_errors table', `
    CREATE TABLE IF NOT EXISTS system_errors (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
      error_source text NOT NULL,
      error_message text NOT NULL,
      payload jsonb
    );
  `)
  
  await runSQL('Enable RLS on system_errors', 'ALTER TABLE system_errors ENABLE ROW LEVEL SECURITY;')
  
  await runSQL('System Errors SELECT', `
    DROP POLICY IF EXISTS errors_select ON system_errors;
    CREATE POLICY errors_select ON system_errors FOR SELECT USING (true);
  `)
  
  await runSQL('System Errors INSERT', `
    DROP POLICY IF EXISTS errors_insert ON system_errors;
    CREATE POLICY errors_insert ON system_errors FOR INSERT WITH CHECK (true);
  `)
  
  console.log('\n✅ Migration complete!')
}

main().catch(console.error)
