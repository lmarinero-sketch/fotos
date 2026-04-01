import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  'https://pxvhovctyewwppwkldaq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjcxNjc0NCwiZXhwIjoyMDgyMjkyNzQ0fQ.nQhpJ6t4KSn-uLlD1vTL_UzFVfgwal3yS4bN7WJpg3w'
)

// Create web_user_sessions table via SQL
const { data, error } = await sb.rpc('exec_sql', {
  query: `
    CREATE TABLE IF NOT EXISTS web_user_sessions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_email text UNIQUE NOT NULL,
      user_id uuid,
      bb_session_id text,
      last_active timestamptz DEFAULT now(),
      created_at timestamptz DEFAULT now()
    );
  `
})

if (error) {
  console.log('RPC not available, trying REST approach...')
  
  // Try inserting a test row - if table doesn't exist, we'll create via Management API
  const { error: testErr } = await sb.from('web_user_sessions').select('id').limit(1)
  
  if (testErr && testErr.message.includes('does not exist')) {
    console.log('Table does not exist. Creating via Management API...')
    
    const res = await fetch('https://api.supabase.com/v1/projects/pxvhovctyewwppwkldaq/database/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sbp_bae3077448cfa6313873c5fab0245c35fdf6f0e2'
      },
      body: JSON.stringify({
        query: `
          CREATE TABLE IF NOT EXISTS public.web_user_sessions (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            user_email text UNIQUE NOT NULL,
            user_id uuid,
            bb_session_id text,
            last_active timestamptz DEFAULT now(),
            created_at timestamptz DEFAULT now()
          );

          ALTER TABLE public.web_user_sessions ENABLE ROW LEVEL SECURITY;

          CREATE POLICY "web_sessions_all" ON public.web_user_sessions
            FOR ALL USING (true) WITH CHECK (true);
        `
      })
    })
    
    const result = await res.json()
    console.log('Status:', res.status)
    console.log('Result:', JSON.stringify(result).substring(0, 300))
  } else if (testErr) {
    console.log('Other error:', testErr.message)
  } else {
    console.log('Table already exists!')
  }
} else {
  console.log('Table created via RPC!')
}
