// Chequear errores recientes y el estado del ticket PD-5525
const SUPABASE_URL = 'https://pxvhovctyewwppwkldaq.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjcxNjc0NCwiZXhwIjoyMDgyMjkyNzQ0fQ.nQhpJ6t4KSn-uLlD1vTL_UzFVfgwal3yS4bN7WJpg3w'
const headers = { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` }

async function main() {
  // 1. Check latest system errors
  console.log('📋 Últimos errores del sistema:\n')
  const errRes = await fetch(`${SUPABASE_URL}/rest/v1/system_errors?select=*&order=created_at.desc&limit=5`, { headers })
  const errors = await errRes.json()
  errors.forEach(e => {
    console.log(`⚠️  [${e.created_at}]`)
    console.log(`   Source: ${e.error_source}`)
    console.log(`   Message: ${e.error_message}`)
    console.log(`   Payload: ${JSON.stringify(e.payload)}`)
    console.log()
  })

  // 2. Check order PD-5525
  console.log('\n📋 Estado del ticket PD-5525:\n')
  const orderRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=*,order_photos(*)&ticket_code=eq.PD-5525`, { headers })
  const orders = await orderRes.json()
  if (orders.length > 0) {
    const o = orders[0]
    console.log(`   Ticket: ${o.ticket_code}`)
    console.log(`   Evento: ${o.event_name}`)
    console.log(`   Status: ${o.status}`)
    console.log(`   Cliente: ${o.client_phone}`)
    console.log(`   Total: $${o.total_price}`)
    console.log(`   Fotos: ${o.order_photos?.length || 0}`)
    o.order_photos?.forEach(p => {
      console.log(`     - ${p.photo_name} | storage_url: ${p.storage_url || 'NULL'}`)
    })
  } else {
    console.log('   ❌ Ticket no encontrado')
  }

  // 3. Check all recent orders
  console.log('\n📋 Últimas órdenes:\n')
  const allRes = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,ticket_code,event_name,status,client_phone,created_at&order=created_at.desc&limit=5`, { headers })
  const all = await allRes.json()
  all.forEach(o => {
    console.log(`   ${o.ticket_code} | ${o.event_name} | ${o.status} | ${o.client_phone} | ${o.created_at}`)
  })
}

main().catch(console.error)
