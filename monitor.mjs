// Monitor en tiempo real — chequea órdenes y errores nuevos cada 3 segundos
const SUPABASE_URL = 'https://pxvhovctyewwppwkldaq.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjcxNjc0NCwiZXhwIjoyMDgyMjkyNzQ0fQ.nQhpJ6t4KSn-uLlD1vTL_UzFVfgwal3yS4bN7WJpg3w'

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
}

let lastOrderId = null
let lastErrorId = null
let tick = 0

async function check() {
  tick++
  
  // Check latest order
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders?select=id,ticket_code,event_name,client_phone,status,created_at&order=created_at.desc&limit=1`, { headers })
    if (res.ok) {
      const [order] = await res.json()
      if (order && order.id !== lastOrderId) {
        if (lastOrderId !== null) {
          console.log(`\n🆕 ¡NUEVA ORDEN DETECTADA!`)
          console.log(`   Ticket: ${order.ticket_code}`)
          console.log(`   Evento: ${order.event_name}`)
          console.log(`   Teléfono: ${order.client_phone}`)
          console.log(`   Status: ${order.status}`)
          console.log(`   Creada: ${order.created_at}`)
        }
        lastOrderId = order.id
      }
    }
  } catch {}

  // Check latest error
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/system_errors?select=id,error_source,error_message,created_at,payload&order=created_at.desc&limit=1`, { headers })
    if (res.ok) {
      const [err] = await res.json()
      if (err && err.id !== lastErrorId) {
        if (lastErrorId !== null) {
          console.log(`\n⚠️  ¡NUEVO ERROR DETECTADO!`)
          console.log(`   Source: ${err.error_source}`)
          console.log(`   Message: ${err.error_message}`)
          console.log(`   Payload: ${JSON.stringify(err.payload).substring(0, 200)}`)
          console.log(`   Fecha: ${err.created_at}`)
        }
        lastErrorId = err.id
      }
    }
  } catch {}

  if (tick % 10 === 0) {
    process.stdout.write(`⏳ Monitoreando... (${tick * 3}s)\r`)
  }
}

console.log('👁️  MONITOR ACTIVO — Esperando mensajes de WhatsApp...')
console.log('   Enviá un mensaje al bot y vamos a ver si llega.')
console.log('   Ctrl+C para salir.\n')

// Initial check (set baseline)
await check()
console.log(`   Última orden: ${lastOrderId ? '✅' : 'ninguna'}`)
console.log(`   Últimos errores: ${lastErrorId ? '✅' : 'ninguno'}\n`)

// Poll every 3s
setInterval(check, 3000)
