import { createClient } from '@supabase/supabase-js'

const s = createClient(
  'https://pxvhovctyewwppwkldaq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4dmhvdmN0eWV3d3Bwd2tsZGFxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NjcxNjc0NCwiZXhwIjoyMDgyMjkyNzQ0fQ.nQhpJ6t4KSn-uLlD1vTL_UzFVfgwal3yS4bN7WJpg3w'
)

// 1. Check "unknown" phone outgoing messages
console.log('=== MENSAJES SALIENTES "unknown" (last 20) ===\n')
const { data: unknowns } = await s.from('chat_messages')
  .select('*')
  .eq('phone', 'unknown')
  .eq('direction', 'outgoing')
  .order('created_at', { ascending: false })
  .limit(20)

for (const m of unknowns || []) {
  const time = new Date(m.created_at).toLocaleString('es-AR')
  console.log(time + ' | body: ' + (m.body || '(null)').substring(0, 80))
  if (m.media_url) console.log('  media: ' + m.media_url.substring(0, 80))
}

// 2. Check for the photographer phone flooding
console.log('\n=== MENSAJES AL FOTÓGRAFO +5492643229503 (last 20) ===\n')
const { data: photogMsgs } = await s.from('chat_messages')
  .select('*')
  .eq('phone', '+5492643229503')
  .order('created_at', { ascending: false })
  .limit(20)

for (const m of photogMsgs || []) {
  const time = new Date(m.created_at).toLocaleString('es-AR')
  const dir = m.direction === 'incoming' ? 'IN ' : 'OUT'
  console.log(time + ' | ' + dir + ' | ' + (m.body || '(null)').substring(0, 120))
}

// 3. Check the client 5492645438114 who has 6 duplicate orders
console.log('\n=== FLOODING PARA 5492645438114 (30 msgs) ===\n')
const { data: clientMsgs } = await s.from('chat_messages')
  .select('*')
  .eq('phone', '5492645438114')
  .order('created_at', { ascending: false })
  .limit(30)

for (const m of clientMsgs || []) {
  const time = new Date(m.created_at).toLocaleString('es-AR')
  const dir = m.direction === 'incoming' ? '📥 IN ' : '📤 OUT'
  console.log(time + ' | ' + dir + ' | ' + (m.body || '(null)').substring(0, 120))
}

// 4. Check orders with status 'sending' - these are stuck
console.log('\n=== ÓRDENES CON STATUS "sending" (stuck) ===\n')
const { data: stuckOrders } = await s.from('orders')
  .select('ticket_code, status, client_phone, event_name, created_at')
  .eq('status', 'sending')
  .order('created_at', { ascending: false })

for (const o of stuckOrders || []) {
  console.log(o.ticket_code + ' | ' + o.client_phone + ' | ' + o.event_name + ' | ' + new Date(o.created_at).toLocaleString('es-AR'))
}

// 5. Check the 5493512017556 flooding
console.log('\n=== FLOODING PARA 5493512017556 (20 msgs) ===\n')
const { data: clientMsgs2 } = await s.from('chat_messages')
  .select('*')
  .eq('phone', '5493512017556')
  .order('created_at', { ascending: false })
  .limit(20)

for (const m of clientMsgs2 || []) {
  const time = new Date(m.created_at).toLocaleString('es-AR')
  const dir = m.direction === 'incoming' ? '📥 IN ' : '📤 OUT'
  console.log(time + ' | ' + dir + ' | ' + (m.body || '(null)').substring(0, 120))
}

// 6. Count how many "Todo ok" messages came in for the same ticket
console.log('\n=== MENSAJES "Todo ok" RECIBIDOS ===\n')
const { data: todoOkMsgs } = await s.from('chat_messages')
  .select('*')
  .eq('direction', 'incoming')
  .ilike('body', '%todo ok%')
  .order('created_at', { ascending: false })
  .limit(20)

for (const m of todoOkMsgs || []) {
  const time = new Date(m.created_at).toLocaleString('es-AR')
  console.log(time + ' | ' + m.phone + ' | ' + (m.body || '').substring(0, 100))
}

process.exit(0)
