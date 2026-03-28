// Actualiza el secret BUILDERBOT_API_KEY en Supabase Edge Functions
const NEW_MGMT_TOKEN = 'sbp_f9d0cfe09cc1fc2fd9fdacfea8f6a987b6644977'
const PROJECT_REF = 'pxvhovctyewwppwkldaq'

async function main() {
  console.log('🔑 Actualizando BUILDERBOT_API_KEY en Supabase secrets...\n')

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NEW_MGMT_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      {
        name: 'BUILDERBOT_API_KEY',
        value: 'bb-dc557ad0-e46c-4804-b157-8bcbb89628d2'
      }
    ])
  })

  console.log(`Status: ${res.status} ${res.statusText}`)
  
  if (res.ok) {
    console.log('✅ Secret BUILDERBOT_API_KEY actualizado exitosamente')
  } else {
    const text = await res.text()
    console.log('❌ Error:', text)
  }

  // Verificar que quedó bien
  console.log('\n📋 Verificando secrets...')
  const verifyRes = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`, {
    headers: { 'Authorization': `Bearer ${NEW_MGMT_TOKEN}` }
  })
  if (verifyRes.ok) {
    const secrets = await verifyRes.json()
    const bbKey = secrets.find(s => s.name === 'BUILDERBOT_API_KEY')
    console.log(`   BUILDERBOT_API_KEY: ${bbKey ? '✅ Existe' : '❌ No encontrado'}`)
  }
}

main().catch(console.error)
