import fs from 'fs'

const MGMT_TOKEN = 'sbp_f9d0cfe09cc1fc2fd9fdacfea8f6a987b6644977'
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
  console.log('🔧 Running Database Migrations for Pricing...\n')
  
  await runSQL('Add price columns to events', `
    ALTER TABLE events 
    ADD COLUMN IF NOT EXISTS price_per_photo bigint DEFAULT 3000,
    ADD COLUMN IF NOT EXISTS price_pack bigint DEFAULT 15000;
  `)
  
  console.log('\n✅ Migration complete!')
}

main().catch(console.error)
