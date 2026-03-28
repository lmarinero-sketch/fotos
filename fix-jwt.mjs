// Desactivar JWT en TODAS las Edge Functions que necesitan ser llamadas externamente
const NEW_MGMT_TOKEN = 'sbp_f9d0cfe09cc1fc2fd9fdacfea8f6a987b6644977'
const PROJECT_REF = 'pxvhovctyewwppwkldaq'

const functionsToFix = ['process-order', 'approve-order', 'receive-payment', 'get-order']

async function main() {
  console.log('🔧 Desactivando JWT verification en todas las Edge Functions...\n')

  for (const fn of functionsToFix) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${fn}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${NEW_MGMT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ verify_jwt: false })
    })
    
    const status = res.ok ? '✅' : '❌'
    console.log(`${status} ${fn}: ${res.status} ${res.statusText}`)
  }

  // Verify all
  console.log('\n📋 Verificación:')
  const verifyRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/functions`, {
    headers: { 'Authorization': `Bearer ${NEW_MGMT_TOKEN}` }
  })
  const fns = await verifyRes.json()
  fns.forEach(f => {
    console.log(`   ${f.slug}: verify_jwt=${f.verify_jwt} | status=${f.status}`)
  })
}

main().catch(console.error)
