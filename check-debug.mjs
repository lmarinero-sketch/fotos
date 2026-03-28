import fs from 'fs'

const SUPABASE_URL = 'https://pxvhovctyewwppwkldaq.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjcxNjc0NCwiZXhwIjoyMDgyMjkyNzQ0fQ.nQhpJ6t4KSn-uLlD1vTL_UzFVfgwal3yS4bN7WJpg3w'
const headers = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }

async function main() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/system_errors?error_source=eq.webhook-debug&select=error_message,payload,created_at&order=created_at.desc&limit=15`, { headers })
  const logs = await res.json()
  
  let output = `WEBHOOK DEBUG LOGS - ${logs.length} entries\n${'='.repeat(60)}\n\n`
  
  for (let i = 0; i < logs.length; i++) {
    const e = logs[i]
    const time = new Date(e.created_at).toLocaleTimeString('es-AR')
    const p = e.payload || {}
    output += `--- #${i+1} [${time}] ---\n`
    output += `  error_message: ${e.error_message}\n`
    output += `  eventName: ${p.eventName}\n`
    output += `  event: ${p.event}\n`
    output += `  keys: ${JSON.stringify(p.keys)}\n`
    output += `  data_keys: ${JSON.stringify(p.data_keys)}\n`
    output += `  raw_body_snippet:\n    ${p.raw_body_snippet || 'N/A'}\n\n`
  }
  
  fs.writeFileSync('debug-logs.txt', output)
  console.log('Written to debug-logs.txt')
}

main().catch(console.error)
