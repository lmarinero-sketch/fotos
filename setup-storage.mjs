// Setup script — run once to configure Supabase storage policies
// Usage: node setup-storage.mjs

const SUPABASE_URL = 'https://pxvhovctyewwppwkldaq.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjcxNjc0NCwiZXhwIjoyMDgyMjkyNzQ0fQ.nQhpJ6t4KSn-uLlD1vTL_UzFVfgwal3yS4bN7WJpg3w'
const MGMT_TOKEN = 'sbp_652501246151de5fe3cb95fb04f7f3f7f2a4900a'
const PROJECT_REF = 'pxvhovctyewwppwkldaq'

async function runSQL(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const data = await res.text()
  console.log(`SQL Result: ${res.status}`, data ? data.substring(0, 200) : '(empty)')
  return res.ok
}

async function main() {
  console.log('🔧 Setting up Supabase...\n')

  // 1. Enable RLS on storage.objects (usually already enabled)
  console.log('1. Storage policies...')
  
  // Drop existing policies first (ignore errors)
  await runSQL(`DROP POLICY IF EXISTS storage_photos_public_read ON storage.objects;`)
  await runSQL(`DROP POLICY IF EXISTS storage_photos_insert ON storage.objects;`)
  
  // Create public read policy
  await runSQL(`CREATE POLICY storage_photos_public_read ON storage.objects FOR SELECT USING (bucket_id = 'photos');`)
  
  // Create insert policy (allow anyone to upload — we control via app logic)
  await runSQL(`CREATE POLICY storage_photos_insert ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'photos');`)

  console.log('\n2. Verify tables...')
  const tablesResult = await runSQL(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`)
  
  console.log('\n3. Verify storage buckets...')
  const bucketsRes = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  })
  const buckets = await bucketsRes.json()
  console.log('Buckets:', buckets.map(b => `${b.name} (public: ${b.public})`).join(', '))

  console.log('\n✅ Setup complete!')
}

main().catch(console.error)
